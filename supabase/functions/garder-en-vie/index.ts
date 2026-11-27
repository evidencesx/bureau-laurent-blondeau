// garder-en-vie — appelée tous les deux jours par le robot GitHub (.github/workflows/garder-en-vie.yml).
//
// Deux comptes gratuits s'endorment s'ils ne servent pas :
//   * Supabase met en pause un projet sans activité pendant 7 jours ;
//   * Brevo désactive une clé API inutilisée pendant 90 jours (les e-mails de
//     commande et du formulaire de contact ne partiraient plus).
// Cette fonction fait une petite lecture dans la base et une petite lecture chez
// Brevo (statistiques du jour, aucun e-mail envoyé). Elle ne renvoie que des
// codes d'état, aucune donnée.
//
// Déploiement : Supabase > Edge Functions > Deploy a new function > Via Editor,
// nommer la fonction « garder-en-vie » AVANT de coller le code (le nom fixe
// l'adresse), puis DÉSACTIVER « Verify JWT » : le robot GitHub n'a pas de clé.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';

Deno.serve(async () => {
  const { error } = await admin.from('livres').select('id').limit(1);
  if (error) console.error('garder-en-vie : base', error);

  let brevo = 0;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=1', {
      headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' },
    });
    brevo = r.status;
    if (!r.ok) console.error('garder-en-vie : Brevo', r.status, (await r.text()).slice(0, 200));
  } catch (err) {
    console.error('garder-en-vie : Brevo injoignable', err);
  }

  const ok = !error && brevo === 200;
  return new Response(JSON.stringify({ base: error ? 'erreur' : 'ok', brevo }), {
    status: ok ? 200 : 502,
    headers: { 'content-type': 'application/json' },
  });
});
