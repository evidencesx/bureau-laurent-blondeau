// client.js — l'accès à la base Supabase, sans étape de construction.
// La bibliothèque est chargée depuis un CDN en module ES (esm.sh), comme pour
// le site de L'Atelier du Bout d'à Haut.
//
// La session de l'administrateur (lien magique) est gardée par la bibliothèque :
// une fois Laurent connecté, chaque requête porte son jeton, et les règles de la
// base le reconnaissent par son adresse e-mail.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// window.__SB_FAUX__ : une fausse base, utilisée seulement par les tests automatiques.
export const baseConfiguree = Boolean(window.__SB_FAUX__ || (SUPABASE_URL && SUPABASE_ANON_KEY));

let client = null;
export async function base() {
  if (window.__SB_FAUX__) return window.__SB_FAUX__;
  if (!baseConfiguree) throw new Error('Base non configurée (js/config.js)');
  if (!client) {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

// Appelle une fonction serveur (Edge Function) avec la clé publique.
export async function fonction(nom, corps, jeton) {
  if (window.__SB_FAUX__) return window.__SB_FAUX__.fonction(nom, corps);
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${nom}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton || SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(corps ?? {}),
  });
  const donnees = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(donnees.erreur || `Erreur ${r.status}`), { statut: r.status, donnees });
  return donnees;
}

export const euros = (cents) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
