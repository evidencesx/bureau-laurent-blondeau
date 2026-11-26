// config.js — réglages publics du site.
//
// La clé « publishable » (anciennement « anon ») n'est PAS un secret : elle est
// faite pour être visible dans le navigateur. La sécurité vient des règles
// d'accès de la base (supabase/installation.sql) : avec cette clé, on lit les
// livres publiés, les salons et la presse, rien d'autre.
//
// Ne JAMAIS mettre ici la clé secrète (« service_role » / « Secret key »).
//
// Tant que ces deux valeurs sont vides, le site affiche le contenu écrit dans
// index.html, sans base de données.

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Espace de stockage des couvertures (voir installation.sql).
export const BUCKET_COUVERTURES = 'couvertures';

// Livraison : forfait unique par commande, France métropolitaine.
// Le vrai montant est fixé dans la base (frais_livraison_cents) : celui-ci ne sert qu'à l'affichage.
export const LIVRAISON_CENTS = 500;
