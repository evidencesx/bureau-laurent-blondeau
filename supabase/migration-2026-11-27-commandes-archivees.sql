-- =============================================================================
-- migration-2026-11-27-commandes-archivees.sql
-- =============================================================================
-- Ajoute le statut « archivée » aux commandes, et l'effacement automatique des
-- données personnelles :
--   * 3 mois après l'archivage d'une commande ;
--   * 3 mois après un panier jamais payé.
-- Sont effacés : nom, e-mail, téléphone, adresse et dédicaces.
-- Sont gardés pour la comptabilité : numéro, dates, livres, quantités, montants.
-- Au bout de 10 ans (durée de conservation des pièces comptables), la commande
-- est supprimée.
--
-- À lancer une fois dans Supabase : SQL Editor, coller, Run. Relançable sans risque.
-- =============================================================================

-- 1. Les dates d'archivage et d'effacement.
alter table commandes add column if not exists archivee_le timestamptz;
alter table commandes add column if not exists anonymisee_le timestamptz;

-- 2. Le nouveau statut possible.
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in ('nouvelle', 'en_preparation', 'expediee', 'livree', 'archivee', 'annulee'));

-- 3. La date d'archivage se remplit toute seule : posée à l'archivage, effacée
--    si la commande sort des archives (le compte à rebours repart de zéro).
create or replace function dater_archivage()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.statut = 'archivee' then
    if tg_op = 'INSERT' or old.statut is distinct from 'archivee' or new.archivee_le is null then
      new.archivee_le := now();
    end if;
  else
    new.archivee_le := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_dater_archivage on commandes;
create trigger trg_dater_archivage
  before insert or update of statut on commandes
  for each row execute function dater_archivage();

-- 4. L'effacement des données personnelles, puis la suppression après 10 ans.
--    (Remplace une première version qui supprimait la commande entière.)
do $$ begin perform cron.unschedule('supprimer-commandes-archivees'); exception when others then null; end $$;
drop function if exists supprimer_commandes_archivees();

create or replace function anonymiser_commandes()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from commandes
   where anonymisee_le is null
     and (
       (statut = 'archivee' and archivee_le < now() - interval '3 months')
       or (paiement_statut <> 'paye' and created_at < now() - interval '3 months')
     );

  if v_ids is not null then
    update lignes_commande set dedicace = null where commande_id = any(v_ids);
    update commandes
       set client_nom = 'Données effacées', client_email = '', client_telephone = null,
           adresse_ligne1 = '', adresse_ligne2 = null, code_postal = '', ville = '',
           anonymisee_le = now()
     where id = any(v_ids);
  end if;

  delete from commandes where created_at < now() - interval '10 years';
  return coalesce(array_length(v_ids, 1), 0);
end;
$fn$;
revoke execute on function anonymiser_commandes() from public, anon, authenticated;
grant execute on function anonymiser_commandes() to service_role;

-- 5. Tous les jours à 3 h 23.
do $$
begin
  perform cron.schedule('anonymiser-commandes', '23 3 * * *', 'select anonymiser_commandes();');
exception when others then
  raise notice 'pg_cron indisponible : les données ne seront pas effacées automatiquement. (%)', sqlerrm;
end $$;

-- Vérification : doit afficher « true » trois fois.
select
  exists (select 1 from information_schema.columns where table_name = 'commandes' and column_name = 'anonymisee_le') as colonnes_ok,
  exists (select 1 from pg_trigger where tgname = 'trg_dater_archivage') as declencheur_ok,
  exists (select 1 from cron.job where jobname = 'anonymiser-commandes') as tache_ok;
