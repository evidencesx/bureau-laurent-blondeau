-- =============================================================================
-- installation.sql — Laurent Blondeau, écrivain : la base du site
-- =============================================================================
-- À exécuter UNE fois, en entier, dans Supabase > SQL Editor, sur un projet
-- neuf. Il crée les tables, les règles d'accès, les fonctions de commande,
-- l'espace de stockage des couvertures, puis amorce le contenu actuel du site
-- (fichier amorcage.sql, à lancer juste après).
--
-- Montants en centimes (integer) : pas d'arrondi flottant sur les prix.
-- Repris de L'Atelier du Bout d'à Haut, simplifié : un seul mode de livraison
-- (5 € par commande, France métropolitaine), pas de retrait, pas de facturation.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- Les styles (thrillers, poésies…) : une plaque par style dans la bibliothèque.
-- Quatre étagères par meuble : au-delà, le site ajoute une bibliothèque.
create table styles (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

create table livres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                    -- adresse du livre (#urbex-codex)
  titre text not null,
  sous_titre text,                              -- phrase sous le titre
  etiquette text,                               -- petite mention au-dessus : « Thriller, 2022 »
  style_id uuid references styles(id) on delete set null,
  prix_cents integer not null check (prix_cents >= 0),
  resume text not null default '',              -- paragraphes séparés par une ligne vide
  isbn text,
  couverture_url text,
  couverture_largeur integer,                   -- proportions de la couverture, pour la pile
  couverture_hauteur integer,
  couleur_dos text,                             -- couleur du dos dans la pile (#RRGGBB)
  couleur_texte text,                           -- couleur du titre sur ce dos
  stock integer not null default 0 check (stock >= 0),
  publie boolean not null default false,
  publie_le timestamptz,                        -- le plus récent est en haut de la pile
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evenements (
  id uuid primary key default gen_random_uuid(),
  date_evenement date not null,
  lieu text not null,                           -- « Janville-en-Beauce (28) »
  adresse text,                                 -- facultatif : « Salle des fêtes, 2 rue… »
  created_at timestamptz not null default now()
);

create table presse (
  id uuid primary key default gen_random_uuid(),
  media text not null,                          -- « Actu Chartres »
  titre text,                                   -- titre de l'article, facultatif
  extrait text,                                 -- chapeau, facultatif
  annee integer not null,
  date_article date,                            -- facultatif : date précise
  url text not null,                            -- lien vers l'article ou son PDF
  a_la_une boolean not null default false,      -- en une du journal
  created_at timestamptz not null default now()
);

create sequence commandes_numero_seq;

create table commandes (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  client_nom text not null,
  client_email text not null,
  client_telephone text,
  adresse_ligne1 text not null,
  adresse_ligne2 text,
  code_postal text not null,
  ville text not null,
  sous_total_cents integer not null,
  livraison_cents integer not null,
  total_cents integer not null,
  statut text not null default 'nouvelle'
    check (statut in ('nouvelle', 'en_preparation', 'expediee', 'livree', 'archivee', 'annulee')),
  paiement_statut text not null default 'en_attente'
    check (paiement_statut in ('en_attente', 'paye', 'expire', 'echoue', 'annule_client')),
  stripe_session_id text,
  paye_le timestamptz,
  jeton_client text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  confirmation_envoyee_at timestamptz,
  archivee_le timestamptz,                 -- supprimée 3 mois après (supprimer_commandes_archivees)
  notes text,
  created_at timestamptz not null default now()
);
create index idx_commandes_session on commandes (stripe_session_id);

create table lignes_commande (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes(id) on delete cascade,
  livre_id uuid references livres(id) on delete set null,
  titre_livre text not null,                    -- copie figée au moment de la commande
  prix_unitaire_cents integer not null,
  quantite integer not null check (quantite > 0),
  dedicace text                                 -- « Pour Marie, avec… », facultatif
);

create table messages_contact (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text not null,
  sujet text,
  message text not null,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'traite', 'archive')),
  created_at timestamptz not null default now()
);

-- =============================================================================
-- 2. QUI ADMINISTRE
-- =============================================================================
-- Seul endroit où se trouvent les adresses autorisées. Chacune doit aussi
-- exister dans Authentication > Users (les inscriptions publiques sont fermées).
create or replace function est_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = any (array[
    'evidencesx@gmail.com',   -- Laurent, propriétaire du site
    'tomblndeau@gmail.com'    -- Tom, le prestataire
  ]);
$$;

-- =============================================================================
-- 3. RÈGLES D'ACCÈS (Row Level Security)
-- =============================================================================
alter table styles enable row level security;
create policy "lecture_publique_styles" on styles for select using (true);
create policy "admin_styles" on styles for all using (est_admin()) with check (est_admin());

alter table livres enable row level security;
create policy "lecture_publique_livres" on livres for select using (publie = true);
create policy "admin_livres" on livres for all using (est_admin()) with check (est_admin());

alter table evenements enable row level security;
create policy "lecture_publique_evenements" on evenements for select using (true);
create policy "admin_evenements" on evenements for all using (est_admin()) with check (est_admin());

alter table presse enable row level security;
create policy "lecture_publique_presse" on presse for select using (true);
create policy "admin_presse" on presse for all using (est_admin()) with check (est_admin());

-- Commandes : aucune écriture publique directe. Le seul chemin est
-- creer_commande(), qui relit les vrais prix en base.
alter table commandes enable row level security;
alter table lignes_commande enable row level security;
create policy "admin_commandes" on commandes for all using (est_admin()) with check (est_admin());
create policy "admin_lignes_commande" on lignes_commande for all using (est_admin()) with check (est_admin());

-- Messages : écrits par la fonction envoyer-message (clé de service), lus par l'admin.
alter table messages_contact enable row level security;
create policy "admin_messages" on messages_contact for all using (est_admin()) with check (est_admin());

-- =============================================================================
-- 4. COMMANDES ET PAIEMENT
-- =============================================================================

-- Livraison : forfait unique, France métropolitaine (Corse comprise).
create or replace function frais_livraison_cents()
returns integer language sql immutable as $$ select 500 $$;

-- Enregistre la commande, relit les prix et retire le stock tout de suite, pour
-- que deux lecteurs n'achètent pas le dernier exemplaire en même temps.
create or replace function creer_commande(
  p_client jsonb,  -- {nom, email, telephone, adresse_ligne1, adresse_ligne2, code_postal, ville}
  p_lignes jsonb   -- [{livre_id, quantite, dedicace}] — jamais de prix venant du navigateur
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ligne jsonb;
  v_livre livres%rowtype;
  v_quantite integer;
  v_sous_total integer := 0;
  v_livraison integer := frais_livraison_cents();
  v_total integer;
  v_numero text;
  v_commande_id uuid;
  v_cp text := trim(coalesce(p_client->>'code_postal', ''));
  v_a_inserer jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p_client->>'nom'), '') = '' or coalesce(trim(p_client->>'email'), '') = ''
     or coalesce(trim(p_client->>'adresse_ligne1'), '') = '' or coalesce(trim(p_client->>'ville'), '') = '' then
    raise exception 'Coordonnées incomplètes';
  end if;
  -- Le mot « métropolitaine » est reconnu par la page de commande, qui l'explique au client.
  if v_cp !~ '^[0-9]{5}$' or left(v_cp, 2) in ('97', '98') then
    raise exception 'Livraison en France métropolitaine uniquement (code postal %)', v_cp;
  end if;
  if jsonb_array_length(coalesce(p_lignes, '[]'::jsonb)) = 0 then
    raise exception 'Le panier est vide';
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_quantite := (v_ligne->>'quantite')::integer;
    if v_quantite is null or v_quantite <= 0 or v_quantite > 20 then
      raise exception 'Quantité invalide';
    end if;
    select * into v_livre from livres
      where id = (v_ligne->>'livre_id')::uuid and publie = true
      for update;
    if not found then
      raise exception 'Livre introuvable ou plus en vente';
    end if;
    -- Stock insuffisant : on refuse toute la commande, le panier reste intact.
    if v_livre.stock < v_quantite then
      raise exception 'Stock insuffisant pour %', v_livre.titre;
    end if;
    update livres set stock = stock - v_quantite, updated_at = now() where id = v_livre.id;
    v_sous_total := v_sous_total + v_livre.prix_cents * v_quantite;
    v_a_inserer := v_a_inserer || jsonb_build_object(
      'livre_id', v_livre.id, 'titre', v_livre.titre, 'prix', v_livre.prix_cents,
      'quantite', v_quantite, 'dedicace', nullif(left(trim(coalesce(v_ligne->>'dedicace', '')), 300), '')
    );
  end loop;

  v_total := v_sous_total + v_livraison;
  v_numero := 'LB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('commandes_numero_seq')::text, 4, '0');

  insert into commandes (numero, client_nom, client_email, client_telephone, adresse_ligne1, adresse_ligne2,
                         code_postal, ville, sous_total_cents, livraison_cents, total_cents)
  values (v_numero, trim(p_client->>'nom'), lower(trim(p_client->>'email')), nullif(trim(coalesce(p_client->>'telephone', '')), ''),
          trim(p_client->>'adresse_ligne1'), nullif(trim(coalesce(p_client->>'adresse_ligne2', '')), ''),
          v_cp, trim(p_client->>'ville'), v_sous_total, v_livraison, v_total)
  returning id into v_commande_id;

  insert into lignes_commande (commande_id, livre_id, titre_livre, prix_unitaire_cents, quantite, dedicace)
  select v_commande_id, (l->>'livre_id')::uuid, l->>'titre', (l->>'prix')::integer, (l->>'quantite')::integer, l->>'dedicace'
  from jsonb_array_elements(v_a_inserer) as l;

  return jsonb_build_object('numero', v_numero, 'total_cents', v_total);
end;
$fn$;
grant execute on function creer_commande(jsonb, jsonb) to anon, authenticated;

-- Remet le stock en vente quand le paiement n'aboutit pas. Idempotente : Stripe
-- peut prévenir deux fois, le client peut aussi annuler juste avant l'expiration.
create or replace function liberer_commande(p_commande_id uuid, p_raison text default 'expire')
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare v_statut text;
begin
  select paiement_statut into v_statut from commandes where id = p_commande_id for update;
  if not found or v_statut <> 'en_attente' then return false; end if;
  update livres l set stock = l.stock + lc.quantite, updated_at = now()
    from lignes_commande lc where lc.commande_id = p_commande_id and lc.livre_id = l.id;
  update commandes set statut = 'annulee', paiement_statut = p_raison where id = p_commande_id;
  return true;
end;
$fn$;

-- Appelée par le webhook Stripe, seul juge du paiement.
create or replace function marquer_commande_payee(p_session_id text, p_commande_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid; v_statut text;
begin
  select id, paiement_statut into v_id, v_statut from commandes where stripe_session_id = p_session_id for update;
  if not found and p_commande_id is not null then
    select id, paiement_statut into v_id, v_statut from commandes where id = p_commande_id for update;
    if found then update commandes set stripe_session_id = p_session_id where id = v_id; end if;
  end if;
  if v_id is null then return false; end if;
  if v_statut = 'paye' then return true; end if;
  -- Payé après libération du stock (client revenu d'un autre onglet) : on garde
  -- le paiement et on prévient Laurent de vérifier qu'il a encore le livre.
  if v_statut <> 'en_attente' then
    update commandes set notes = coalesce(notes || E'\n', '')
      || 'À VÉRIFIER : paiement reçu après remise en vente du stock (' || v_statut || ').',
      statut = 'nouvelle' where id = v_id;
  end if;
  update commandes set paiement_statut = 'paye', paye_le = now() where id = v_id;
  return true;
end;
$fn$;

revoke execute on function liberer_commande(uuid, text) from public, anon, authenticated;
revoke execute on function marquer_commande_payee(text, uuid) from public, anon, authenticated;

-- Le visiteur n'est pas connecté : il prouve son achat avec le jeton de la commande.
create or replace function statut_commande(p_numero text, p_jeton text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object('numero', numero, 'total_cents', total_cents, 'paiement_statut', paiement_statut)
  from commandes where numero = p_numero and jeton_client = p_jeton;
$$;

create or replace function annuler_paiement_client(p_numero text, p_jeton text)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid;
begin
  select id into v_id from commandes
    where numero = p_numero and jeton_client = p_jeton and paiement_statut = 'en_attente';
  if not found then return false; end if;
  return liberer_commande(v_id, 'annule_client');
end;
$fn$;
grant execute on function statut_commande(text, text) to anon, authenticated;
grant execute on function annuler_paiement_client(text, text) to anon, authenticated;

-- Filet de sécurité si le webhook Stripe est en panne : toutes les heures, les
-- commandes non payées depuis 2 heures rendent leur stock.
create or replace function purger_commandes_abandonnees()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id uuid; v_total integer := 0;
begin
  for v_id in select id from commandes where paiement_statut = 'en_attente' and created_at < now() - interval '2 hours' loop
    if liberer_commande(v_id, 'expire') then v_total := v_total + 1; end if;
  end loop;
  return v_total;
end;
$fn$;
revoke execute on function purger_commandes_abandonnees() from public, anon;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-commandes-abandonnees', '17 * * * *', 'select purger_commandes_abandonnees();');
exception when others then
  raise notice 'pg_cron indisponible : seul Stripe libérera le stock. (%)', sqlerrm;
end $$;

-- Commandes archivées : supprimées 3 mois après leur archivage.
-- La date se remplit toute seule : posée à l'archivage, effacée si la
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

-- La suppression, 3 mois après l'archivage.
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

-- Tous les jours à 3 h 23.
do $$
begin
  perform cron.schedule('supprimer-commandes-archivees', '23 3 * * *', 'select supprimer_commandes_archivees();');
exception when others then
  raise notice 'pg_cron indisponible : les commandes archivées ne seront pas supprimées automatiquement. (%)', sqlerrm;
end $$;

-- =============================================================================
-- 5. STOCKAGE DES COUVERTURES
-- =============================================================================
insert into storage.buckets (id, name, public) values ('couvertures', 'couvertures', true)
on conflict (id) do nothing;
create policy "lecture_publique_couvertures" on storage.objects for select using (bucket_id = 'couvertures');
create policy "admin_ajout_couvertures" on storage.objects for insert with check (bucket_id = 'couvertures' and est_admin());
create policy "admin_modif_couvertures" on storage.objects for update using (bucket_id = 'couvertures' and est_admin());
create policy "admin_suppr_couvertures" on storage.objects for delete using (bucket_id = 'couvertures' and est_admin());

-- =============================================================================
-- 6. DROITS DES RÔLES (les projets Supabase récents ne les donnent plus d'office ;
--    les règles d'accès ci-dessus filtrent toujours chaque ligne)
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

-- Le visiteur lit le catalogue, les salons et la presse.
grant select on styles, livres, evenements, presse to anon, authenticated;

-- Laurent connecté gère tout (les règles vérifient qu'il est bien administrateur).
grant insert, update, delete on styles, livres, evenements, presse to authenticated;
grant select, insert, update, delete on commandes, lignes_commande, messages_contact to authenticated;

-- Les fonctions serveur (paiement, webhook, e-mails, contact) travaillent avec la clé de service.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Les fonctions de la base.
grant execute on function est_admin() to anon, authenticated, service_role;
grant execute on function creer_commande(jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function statut_commande(text, text) to anon, authenticated, service_role;
grant execute on function annuler_paiement_client(text, text) to anon, authenticated, service_role;
grant execute on function liberer_commande(uuid, text) to service_role;
grant execute on function marquer_commande_payee(text, uuid) to service_role;
grant execute on function purger_commandes_abandonnees() to service_role;

-- =============================================================================
-- Vérification : chaque ligne doit afficher « true ».
-- =============================================================================
select
  (select count(*) = 7 from information_schema.tables where table_schema = 'public'
     and table_name in ('styles', 'livres', 'evenements', 'presse', 'commandes', 'lignes_commande', 'messages_contact')) as tables_ok,
  (select count(*) = 6 from pg_proc where proname in ('creer_commande', 'liberer_commande', 'marquer_commande_payee',
     'statut_commande', 'annuler_paiement_client', 'purger_commandes_abandonnees')) as fonctions_ok,
  exists (select 1 from storage.buckets where id = 'couvertures') as stockage_ok;
