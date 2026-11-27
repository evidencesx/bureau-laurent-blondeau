-- =============================================================================
-- migration-2026-11-27-commandes-archivees.sql
-- =============================================================================
-- Ajoute le statut « archivée » aux commandes. Une commande archivée est
-- supprimée automatiquement 3 mois après son archivage (avec ses lignes).
-- À lancer une fois dans Supabase : SQL Editor, coller, Run. Relançable sans risque.
-- =============================================================================

-- 1. La date d'archivage.
alter table commandes add column if not exists archivee_le timestamptz;

-- 2. Le nouveau statut possible.
alter table commandes drop constraint if exists commandes_statut_check;
alter table commandes add constraint commandes_statut_check
  check (statut in ('nouvelle', 'en_preparation', 'expediee', 'livree', 'archivee', 'annulee'));

-- 3. La date se remplit toute seule : posée à l'archivage, effacée si la
--    commande sort des archives (le compte à rebours repart de zéro).
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

-- 4. La suppression, 3 mois après l'archivage.
create or replace function supprimer_commandes_archivees()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v_total integer;
begin
  delete from commandes
   where statut = 'archivee'
     and archivee_le < now() - interval '3 months';
  get diagnostics v_total = row_count;
  return v_total;
end;
$fn$;
revoke execute on function supprimer_commandes_archivees() from public, anon, authenticated;
grant execute on function supprimer_commandes_archivees() to service_role;

-- 5. Tous les jours à 3 h 23.
do $$
begin
  perform cron.schedule('supprimer-commandes-archivees', '23 3 * * *', 'select supprimer_commandes_archivees();');
exception when others then
  raise notice 'pg_cron indisponible : les commandes archivées ne seront pas supprimées automatiquement. (%)', sqlerrm;
end $$;

-- Vérification : doit afficher « true » trois fois.
select
  exists (select 1 from information_schema.columns where table_name = 'commandes' and column_name = 'archivee_le') as colonne_ok,
  exists (select 1 from pg_trigger where tgname = 'trg_dater_archivage') as declencheur_ok,
  exists (select 1 from cron.job where jobname = 'supprimer-commandes-archivees') as tache_ok;
