-- =============================================================================
-- migration-2026-11-28-factures-avoirs.sql
-- =============================================================================
-- Factures et avoirs numérotés, en PDF.
--
-- * Une facture est émise au paiement confirmé (fonction « documents », appelée
--   par envoyer-confirmation), jointe au récapitulatif envoyé au client.
-- * Un avoir annule tout ou partie d'une facture (retour, remboursement). Il peut
--   y en avoir plusieurs sur une même facture, jamais plus que ce qui a été vendu.
-- * Numérotation continue, sans trou : F-2026-0001, F-2026-0002… et A-2026-0001…
--   Le compteur ne repart pas à 1 chaque année (l'année n'est qu'un repère), et
--   il est tenu dans une table verrouillée, pas dans une séquence : une séquence
--   garde le numéro consommé même si l'émission échoue, ce qui laisserait un trou.
-- * Les documents recopient le client, les livres et les prix : une facture ne
--   change pas si la commande est ensuite effacée (données personnelles effacées
--   3 mois après l'archivage) ou si un livre est renommé. Elle est gardée 10 ans,
--   durée légale des pièces comptables, puis supprimée.
-- * TVA : 5,5 % (livres ; la livraison suit le taux des livres). Les prix
--   affichés sur le site sont TTC.
--
-- À lancer une fois dans Supabase : SQL Editor, coller, Run. Relançable sans risque.
-- =============================================================================

-- 1. Les compteurs --------------------------------------------------------------
create table if not exists compteurs_documents (
  nom text primary key check (nom in ('facture', 'avoir')),
  dernier integer not null default 0
);
insert into compteurs_documents (nom) values ('facture'), ('avoir') on conflict do nothing;
alter table compteurs_documents enable row level security; -- personne n'y touche directement

-- 2. Les tables -----------------------------------------------------------------
create table if not exists factures (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  commande_id uuid unique references commandes(id) on delete set null,
  commande_numero text not null,
  emise_le timestamptz not null default now(),
  paye_le timestamptz,
  client jsonb not null,            -- nom, adresse, e-mail au jour de la vente
  lignes jsonb not null,            -- [{designation, quantite, pu_ttc_cents}]
  livraison_cents integer not null default 0,
  taux_tva numeric(4,2) not null default 5.5,
  total_ttc_cents integer not null,
  tva_cents integer not null,
  total_ht_cents integer not null,
  pdf_chemin text
);

create table if not exists avoirs (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  facture_id uuid not null references factures(id) on delete cascade,
  emis_le timestamptz not null default now(),
  motif text,
  lignes jsonb not null,            -- [{index, designation, quantite, pu_ttc_cents}]
  inclut_livraison boolean not null default false,
  livraison_cents integer not null default 0,
  taux_tva numeric(4,2) not null default 5.5,
  total_ttc_cents integer not null check (total_ttc_cents > 0),
  tva_cents integer not null,
  total_ht_cents integer not null,
  pdf_chemin text
);
create index if not exists avoirs_facture_idx on avoirs (facture_id);

alter table factures enable row level security;
alter table avoirs enable row level security;
drop policy if exists "admin_lit_factures" on factures;
create policy "admin_lit_factures" on factures for select using (est_admin());
drop policy if exists "admin_lit_avoirs" on avoirs;
create policy "admin_lit_avoirs" on avoirs for select using (est_admin());
-- Aucune écriture directe : tout passe par les fonctions ci-dessous. Un document
-- comptable émis ne se modifie pas et ne se supprime pas.

grant select on factures, avoirs to authenticated;
grant all on factures, avoirs, compteurs_documents to service_role;

-- 3. Outils ---------------------------------------------------------------------
-- Prochain numéro, dans la même transaction que l'émission (verrou sur la ligne).
create or replace function prochain_numero(p_nom text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare v integer;
begin
  update compteurs_documents set dernier = dernier + 1 where nom = p_nom returning dernier into v;
  if v is null then raise exception 'Compteur inconnu : %', p_nom; end if;
  return (case p_nom when 'facture' then 'F-' else 'A-' end) || to_char(now(), 'YYYY') || '-' || lpad(v::text, 4, '0');
end;
$fn$;
revoke execute on function prochain_numero(text) from public, anon, authenticated;

-- TVA contenue dans un prix TTC, au taux donné, arrondie au centime.
create or replace function tva_incluse(p_ttc integer, p_taux numeric)
returns integer
language sql
immutable
as $fn$ select round(p_ttc - p_ttc / (1 + p_taux / 100.0))::integer $fn$;

-- Qui peut émettre : l'administration, ou les fonctions serveur (clé de service).
create or replace function appel_autorise()
returns boolean
language sql
stable
set search_path = public
as $fn$ select est_admin() or coalesce(auth.jwt() ->> 'role', '') = 'service_role' $fn$;

-- 4. Émettre la facture d'une commande payée (idempotent) ------------------------
create or replace function emettre_facture(p_commande_id uuid)
returns factures
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_facture factures;
  c commandes;
  v_lignes jsonb;
begin
  if not appel_autorise() then raise exception 'Réservé à l''administration'; end if;

  select * into v_facture from factures where commande_id = p_commande_id;
  if found then return v_facture; end if;

  select * into c from commandes where id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if c.paiement_statut <> 'paye' then raise exception 'Pas de facture pour une commande non payée'; end if;
  if c.anonymisee_le is not null then raise exception 'Données client effacées : facture impossible'; end if;

  -- Rejoué en même temps (webhook doublé) : le verrou ci-dessus a fait attendre, on relit.
  select * into v_facture from factures where commande_id = p_commande_id;
  if found then return v_facture; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'designation', titre_livre, 'quantite', quantite, 'pu_ttc_cents', prix_unitaire_cents
         ) order by titre_livre), '[]'::jsonb)
    into v_lignes
    from lignes_commande where commande_id = c.id;

  insert into factures (numero, commande_id, commande_numero, paye_le, client, lignes,
                        livraison_cents, total_ttc_cents, tva_cents, total_ht_cents)
  values (
    prochain_numero('facture'), c.id, c.numero, c.paye_le,
    jsonb_build_object('nom', c.client_nom, 'email', c.client_email,
                       'adresse_ligne1', c.adresse_ligne1, 'adresse_ligne2', c.adresse_ligne2,
                       'code_postal', c.code_postal, 'ville', c.ville),
    v_lignes, c.livraison_cents, c.total_cents,
    tva_incluse(c.total_cents, 5.5), c.total_cents - tva_incluse(c.total_cents, 5.5)
  )
  returning * into v_facture;
  return v_facture;
end;
$fn$;
revoke execute on function emettre_facture(uuid) from public, anon;
grant execute on function emettre_facture(uuid) to authenticated, service_role;

-- 5. Ce qui reste à reprendre sur une facture ------------------------------------
create or replace function reste_avoirable(p_facture_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  f factures;
  v_lignes jsonb := '[]'::jsonb;
  v_ligne jsonb;
  v_index integer := 0;
  v_repris integer;
  v_livraison_reprise boolean;
begin
  if not appel_autorise() then raise exception 'Réservé à l''administration'; end if;
  select * into f from factures where id = p_facture_id;
  if not found then raise exception 'Facture introuvable'; end if;

  for v_ligne in select * from jsonb_array_elements(f.lignes) loop
    select coalesce(sum((l->>'quantite')::integer), 0) into v_repris
      from avoirs a, jsonb_array_elements(a.lignes) l
     where a.facture_id = f.id and (l->>'index')::integer = v_index;
    v_lignes := v_lignes || jsonb_build_object(
      'index', v_index, 'designation', v_ligne->>'designation',
      'pu_ttc_cents', (v_ligne->>'pu_ttc_cents')::integer,
      'quantite', (v_ligne->>'quantite')::integer,
      'reprenable', (v_ligne->>'quantite')::integer - v_repris);
    v_index := v_index + 1;
  end loop;

  select exists (select 1 from avoirs where facture_id = f.id and inclut_livraison) into v_livraison_reprise;
  return jsonb_build_object('lignes', v_lignes,
                            'livraison_cents', f.livraison_cents,
                            'livraison_reprenable', f.livraison_cents > 0 and not v_livraison_reprise);
end;
$fn$;
revoke execute on function reste_avoirable(uuid) from public, anon;
grant execute on function reste_avoirable(uuid) to authenticated, service_role;

-- 6. Émettre un avoir ------------------------------------------------------------
-- p_lignes : [{index, quantite}], sans aucun montant : les prix sont relus sur la facture.
create or replace function emettre_avoir(p_facture_id uuid, p_motif text, p_lignes jsonb, p_inclut_livraison boolean default false)
returns avoirs
language plpgsql
security definer
set search_path = public
as $fn$
declare
  f factures;
  v_reste jsonb;
  v_entree jsonb;
  v_ligne jsonb;
  v_quantite integer;
  v_total integer := 0;
  v_a_inserer jsonb := '[]'::jsonb;
  v_avoir avoirs;
begin
  if not appel_autorise() then raise exception 'Réservé à l''administration'; end if;
  select * into f from factures where id = p_facture_id for update; -- un avoir à la fois par facture
  if not found then raise exception 'Facture introuvable'; end if;
  v_reste := reste_avoirable(p_facture_id);

  for v_entree in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    v_quantite := coalesce((v_entree->>'quantite')::integer, 0);
    continue when v_quantite = 0;
    if v_quantite < 0 then raise exception 'Quantité invalide'; end if;
    v_ligne := null;
    select l into v_ligne from jsonb_array_elements(v_reste->'lignes') l
     where (l->>'index')::integer = (v_entree->>'index')::integer;
    if v_ligne is null then raise exception 'Livre absent de cette facture'; end if;
    if v_quantite > (v_ligne->>'reprenable')::integer then
      raise exception '« % » : % exemplaire(s) au plus peuvent encore être repris',
        v_ligne->>'designation', v_ligne->>'reprenable';
    end if;
    v_total := v_total + (v_ligne->>'pu_ttc_cents')::integer * v_quantite;
    v_a_inserer := v_a_inserer || jsonb_build_object('index', (v_ligne->>'index')::integer,
      'designation', v_ligne->>'designation', 'quantite', v_quantite,
      'pu_ttc_cents', (v_ligne->>'pu_ttc_cents')::integer);
  end loop;

  if p_inclut_livraison then
    if not (v_reste->>'livraison_reprenable')::boolean then raise exception 'La livraison a déjà été reprise'; end if;
    v_total := v_total + f.livraison_cents;
  end if;
  if v_total <= 0 then raise exception 'Choisissez au moins un livre ou la livraison'; end if;

  insert into avoirs (numero, facture_id, motif, lignes, inclut_livraison, livraison_cents,
                      total_ttc_cents, tva_cents, total_ht_cents)
  values (prochain_numero('avoir'), f.id, nullif(trim(coalesce(p_motif, '')), ''), v_a_inserer,
          p_inclut_livraison, case when p_inclut_livraison then f.livraison_cents else 0 end,
          v_total, tva_incluse(v_total, f.taux_tva), v_total - tva_incluse(v_total, f.taux_tva))
  returning * into v_avoir;
  return v_avoir;
end;
$fn$;
revoke execute on function emettre_avoir(uuid, text, jsonb, boolean) from public, anon;
grant execute on function emettre_avoir(uuid, text, jsonb, boolean) to authenticated, service_role;

-- 7. Le chemin du PDF, rangé par la fonction « documents » -----------------------
create or replace function ranger_pdf(p_type text, p_id uuid, p_chemin text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Réservé au serveur'; end if;
  if p_type = 'facture' then update factures set pdf_chemin = p_chemin where id = p_id and pdf_chemin is null;
  else update avoirs set pdf_chemin = p_chemin where id = p_id and pdf_chemin is null; end if;
end;
$fn$;
revoke execute on function ranger_pdf(text, uuid, text) from public, anon, authenticated;
grant execute on function ranger_pdf(text, uuid, text) to service_role;

-- 8. Le coffre des PDF : privé, lisible par l'administration seulement -----------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do update set public = false;
drop policy if exists "admin_lit_documents" on storage.objects;
create policy "admin_lit_documents" on storage.objects for select
  using (bucket_id = 'documents' and est_admin());

-- 9. Conservation : 10 ans pour les factures et avoirs ----------------------------
--    (complète anonymiser_commandes, lancée tous les jours à 3 h 23)
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

  -- Les PDF dans le coffre restent ; ils sont retirés à la main si besoin.
  delete from factures where emise_le < now() - interval '10 years'; -- emporte ses avoirs
  delete from commandes where created_at < now() - interval '10 years';
  return coalesce(array_length(v_ids, 1), 0);
end;
$fn$;

-- 10. Rattrapage : une facture pour les commandes déjà payées, dans l'ordre -------
do $$
declare v_id uuid;
begin
  for v_id in
    select c.id from commandes c
     where c.paiement_statut = 'paye' and c.anonymisee_le is null
       and not exists (select 1 from factures f where f.commande_id = c.id)
     order by coalesce(c.paye_le, c.created_at)
  loop
    -- appel_autorise() est faux dans l'éditeur SQL : on insère comme le ferait la fonction.
    insert into factures (numero, commande_id, commande_numero, paye_le, client, lignes,
                          livraison_cents, total_ttc_cents, tva_cents, total_ht_cents)
    select prochain_numero('facture'), c.id, c.numero, c.paye_le,
           jsonb_build_object('nom', c.client_nom, 'email', c.client_email,
                              'adresse_ligne1', c.adresse_ligne1, 'adresse_ligne2', c.adresse_ligne2,
                              'code_postal', c.code_postal, 'ville', c.ville),
           (select coalesce(jsonb_agg(jsonb_build_object('designation', titre_livre, 'quantite', quantite,
                    'pu_ttc_cents', prix_unitaire_cents) order by titre_livre), '[]'::jsonb)
              from lignes_commande where commande_id = c.id),
           c.livraison_cents, c.total_cents, tva_incluse(c.total_cents, 5.5),
           c.total_cents - tva_incluse(c.total_cents, 5.5)
      from commandes c where c.id = v_id;
  end loop;
end $$;

-- Vérification : trois « true », puis les factures émises.
select
  exists (select 1 from information_schema.tables where table_name = 'factures') as tables_ok,
  exists (select 1 from pg_proc where proname = 'emettre_avoir') as fonctions_ok,
  exists (select 1 from storage.buckets where id = 'documents' and not public) as coffre_ok,
  (select string_agg(numero || ' (' || commande_numero || ')', ', ' order by numero) from factures) as factures;
