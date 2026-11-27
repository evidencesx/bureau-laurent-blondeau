-- =============================================================================
-- droits.sql — les droits d'accès aux tables (à lancer après installation.sql)
-- =============================================================================
-- Les projets Supabase récents ne donnent plus automatiquement aux rôles du site
-- (anon : le visiteur, authenticated : Laurent connecté, service_role : les
-- fonctions serveur) le droit de toucher aux tables créées par script.
-- Ce script accorde ces droits. Il n'ouvre rien de plus que prévu : les règles
-- d'accès (Row Level Security) d'installation.sql filtrent toujours chaque ligne
-- (livres publiés seulement pour le visiteur, tout le reste réservé à est_admin()).
-- On peut le relancer sans risque.
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

-- Vérification : chaque colonne doit afficher « true ».
select
  has_table_privilege('anon', 'public.livres', 'select')                    as visiteur_lit_livres,
  not has_table_privilege('anon', 'public.commandes', 'select')             as visiteur_sans_commandes,
  has_table_privilege('authenticated', 'public.livres', 'update')           as admin_modifie_livres,
  has_table_privilege('service_role', 'public.messages_contact', 'insert')  as serveur_ecrit_messages,
  has_function_privilege('service_role', 'marquer_commande_payee(text, uuid)', 'execute') as serveur_valide_paiement;
