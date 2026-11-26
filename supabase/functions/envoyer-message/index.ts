// envoyer-message — le formulaire de contact du site.
//
// Le message est enregistré (il apparaît dans Administration > Messages) puis
// envoyé par e-mail à Laurent, avec l'adresse du lecteur en « répondre à » :
// Laurent répond depuis sa boîte habituelle, comme à n'importe quel e-mail.
//
// Pourquoi une fonction serveur plutôt qu'une écriture directe depuis la page :
// la clé Brevo ne doit jamais se trouver dans le site, et le contrôle anti-robots
// (champ piège, longueurs, cadence) se fait ici, où le visiteur ne peut pas le
// contourner.
//
// Déploiement : Supabase > Edge Functions > Deploy a new function > Via Editor,
// nommer la fonction « envoyer-message », DÉSACTIVER « Verify JWT » : le visiteur
// n'est pas connecté. La page appelle quand même avec la clé publique.
//
// Secrets : BREVO_API_KEY, EXPEDITEUR_EMAIL, AUTEUR_EMAIL, SITE_URL (mêmes que
// envoyer-confirmation), EXPEDITEUR_NOM facultatif.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const EXPEDITEUR_EMAIL = Deno.env.get('EXPEDITEUR_EMAIL') ?? '';
const EXPEDITEUR_NOM = Deno.env.get('EXPEDITEUR_NOM') ?? 'Laurent Blondeau';
const AUTEUR_EMAIL = Deno.env.get('AUTEUR_EMAIL') ?? '';
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const SUJETS = ['Commande', 'Dédicace', 'Salon ou rencontre', 'Presse', 'Autre'];
const echapper = (t: string) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function cors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': SITE || '*',
    'Access-Control-Allow-Headers': req.headers.get('access-control-request-headers') ?? 'authorization, content-type, apikey',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}
const reponse = (req: Request, corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors(req), 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reponse(req, { erreur: 'Méthode non autorisée' }, 405);

  try {
    const d = await req.json().catch(() => ({})) as Record<string, string>;
    // Champ piège, invisible pour un humain : un robot qui remplit tout se trahit.
    // On répond « envoyé » pour ne pas lui apprendre à contourner.
    if (d.site_web) return reponse(req, { envoye: true });

    const nom = String(d.nom ?? '').trim().slice(0, 120);
    const email = String(d.email ?? '').trim().toLowerCase().slice(0, 200);
    const sujet = SUJETS.includes(d.sujet) ? d.sujet : 'Autre';
    const message = String(d.message ?? '').trim().slice(0, 5000);
    if (!nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 5) {
      return reponse(req, { erreur: 'Merci de renseigner votre nom, une adresse e-mail valide et votre message.' }, 400);
    }

    // Cadence : trois messages par heure et par adresse suffisent largement à un lecteur.
    const { count } = await admin.from('messages_contact').select('id', { count: 'exact', head: true })
      .eq('email', email).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 3) return reponse(req, { erreur: 'Vous avez déjà écrit plusieurs fois cette heure-ci. Merci de patienter un peu.' }, 429);

    const { error } = await admin.from('messages_contact').insert({ nom, email, sujet, message });
    if (error) throw error;

    // L'e-mail est un plus : le message est déjà enregistré dans l'administration.
    if (BREVO_API_KEY && EXPEDITEUR_EMAIL && AUTEUR_EMAIL) {
      const html = `<div style="font-family:Georgia,serif;color:#22252B;max-width:560px">
        <p style="color:#5A5C60;margin:0 0 4px">Message reçu depuis le site · ${echapper(sujet)}</p>
        <p style="margin:0 0 16px"><b>${echapper(nom)}</b> &lt;${echapper(email)}&gt;</p>
        <div style="white-space:pre-wrap;line-height:1.5">${echapper(message)}</div>
        <p style="color:#5A5C60;font-size:13px;margin-top:24px">Répondez directement à cet e-mail pour lui écrire.</p></div>`;
      const appel = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          sender: { name: EXPEDITEUR_NOM, email: EXPEDITEUR_EMAIL },
          to: [{ email: AUTEUR_EMAIL }],
          replyTo: { email, name: nom },
          subject: `[Site] ${sujet} · ${nom}`,
          htmlContent: html,
          textContent: `${nom} <${email}>\nSujet : ${sujet}\n\n${message}`,
          tags: ['contact'],
        }),
      });
      if (!appel.ok) console.error('envoyer-message : Brevo', appel.status, (await appel.text()).slice(0, 300));
    }
    return reponse(req, { envoye: true });
  } catch (err) {
    console.error('envoyer-message', err);
    return reponse(req, { erreur: "Le message n'a pas pu être envoyé. Réessayez dans un instant." }, 500);
  }
});
