// envoyer-confirmation — récapitulatif de commande au lecteur, avis de commande à Laurent.
//
// Appelée par stripe-webhook quand un paiement est confirmé (avec la clé de
// service), ou par l'administration pour un renvoi (avec le jeton de Laurent ou
// de Tom). Personne d'autre : la clé publique du site, que tout visiteur
// télécharge, ne suffit pas.
//
// Reprise simplifiée de la fonction du site de L'Atelier du Bout d'à Haut :
// pas de numéro de facture ni de mentions de TVA ici (à ajouter si Laurent
// a besoin de factures numérotées).
//
// Déploiement : Supabase > Edge Functions > Deploy a new function > Via Editor,
// nommer la fonction « envoyer-confirmation », laisser « Verify JWT » activé.
//
// Secrets (Edge Functions > Secrets) :
//   BREVO_API_KEY      clé API Brevo
//   EXPEDITEUR_EMAIL   adresse d'envoi, validée dans Brevo (Senders)
//   AUTEUR_EMAIL       adresse de Laurent : reçoit l'avis, et les réponses des lecteurs
//   SITE_URL           adresse du site, sans barre oblique finale
//   EXPEDITEUR_NOM     facultatif, « Laurent Blondeau » par défaut

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const EXPEDITEUR_EMAIL = Deno.env.get('EXPEDITEUR_EMAIL') ?? '';
const EXPEDITEUR_NOM = Deno.env.get('EXPEDITEUR_NOM') ?? 'Laurent Blondeau';
const AUTEUR_EMAIL = Deno.env.get('AUTEUR_EMAIL') ?? '';
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(URL_SUPABASE, CLE_SERVICE);

const C = { fond: '#EDE6D4', texte: '#22252B', attenue: '#5A5C60', bord: '#CFC6B6', accent: '#8A3A10' };

function echapper(t: string): string {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',') + ' €';
const prenom = (nom: string) => String(nom ?? '').trim().split(/\s+/)[0] || '';

// --- Autorisation : la clé de service (webhook) ou un administrateur ---------
async function autoriser(req: Request): Promise<string | null> {
  const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jeton) return null;
  if (CLE_SERVICE && jeton === CLE_SERVICE) return 'webhook';
  const client = createClient(URL_SUPABASE, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
  const { data, error } = await client.rpc('est_admin');
  if (error) { console.error('envoyer-confirmation : est_admin', error); return null; }
  return data === true ? 'administration' : null;
}

async function chargerCommande(commandeId: string | null, numero: string | null) {
  const colonnes = 'id, numero, created_at, client_nom, client_email, client_telephone, adresse_ligne1, adresse_ligne2, '
    + 'code_postal, ville, sous_total_cents, livraison_cents, total_cents, paiement_statut, confirmation_envoyee_at';
  const requete = admin.from('commandes').select(colonnes);
  const { data: commande, error } = commandeId
    ? await requete.eq('id', commandeId).maybeSingle()
    : await requete.eq('numero', numero ?? '').maybeSingle();
  if (error) throw error;
  if (!commande) return null;
  const { data: lignes, error: e2 } = await admin.from('lignes_commande')
    .select('titre_livre, prix_unitaire_cents, quantite, dedicace').eq('commande_id', commande.id);
  if (e2) throw e2;
  return { commande, lignes: lignes ?? [] };
}

function adresse(c: any): string[] {
  return [c.client_nom, c.adresse_ligne1, c.adresse_ligne2, `${c.code_postal} ${c.ville}`].filter(Boolean);
}

function tableauLignes(lignes: any[]): string {
  return lignes.map((l) => `
    <tr><td style="padding:8px 0;border-bottom:1px solid ${C.bord}">
      ${echapper(l.titre_livre)}${l.quantite > 1 ? ` × ${l.quantite}` : ''}
      ${l.dedicace ? `<br><span style="color:${C.attenue};font-style:italic">Dédicace : ${echapper(l.dedicace)}</span>` : ''}
    </td><td style="padding:8px 0;border-bottom:1px solid ${C.bord};text-align:right;white-space:nowrap">${euros(l.prix_unitaire_cents * l.quantite)}</td></tr>`).join('');
}

function gabarit(titre: string, corps: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:${C.fond};font-family:Georgia,serif;color:${C.texte}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${C.attenue};margin:0 0 6px">Laurent Blondeau, écrivain</p>
    <h1 style="font-weight:normal;font-size:26px;margin:0 0 24px">${titre}</h1>
    ${corps}
  </div></body></html>`;
}

function emailLecteur(c: any, lignes: any[]) {
  const corps = `
    <p>Bonjour ${echapper(prenom(c.client_nom))},</p>
    <p>Merci pour votre commande, bien reçue et réglée. Je prépare votre colis et vous l'envoie très vite.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">${tableauLignes(lignes)}
      <tr><td style="padding:8px 0;color:${C.attenue}">Livraison</td><td style="padding:8px 0;text-align:right">${euros(c.livraison_cents)}</td></tr>
      <tr><td style="padding:8px 0"><b>Total réglé</b></td><td style="padding:8px 0;text-align:right"><b>${euros(c.total_cents)}</b></td></tr>
    </table>
    <p style="color:${C.attenue};margin:0">Livraison à :</p>
    <p style="margin:4px 0 20px">${adresse(c).map(echapper).join('<br>')}</p>
    <p>Commande n° <b>${echapper(c.numero)}</b>. Une question ? Répondez simplement à cet e-mail.</p>
    <p>À bientôt,<br>Laurent Blondeau</p>
    ${SITE ? `<p style="font-size:13px;color:${C.attenue}"><a href="${SITE}" style="color:${C.accent}">${SITE.replace(/^https?:\/\//, '')}</a></p>` : ''}`;
  const texte = [`Bonjour ${prenom(c.client_nom)},`, '', 'Merci pour votre commande, bien reçue et réglée.', '',
    ...lignes.map((l) => `- ${l.titre_livre}${l.quantite > 1 ? ` x ${l.quantite}` : ''} : ${euros(l.prix_unitaire_cents * l.quantite)}${l.dedicace ? ` (dédicace : ${l.dedicace})` : ''}`),
    `Livraison : ${euros(c.livraison_cents)}`, `Total réglé : ${euros(c.total_cents)}`, '',
    'Livraison à :', ...adresse(c), '', `Commande n° ${c.numero}`, '', 'Laurent Blondeau'].join('\n');
  return { sujet: `Votre commande ${c.numero}`, html: gabarit('Merci pour votre commande', corps), texte };
}

function emailAuteur(c: any, lignes: any[]) {
  const corps = `
    <p>Nouvelle commande réglée : <b>${echapper(c.numero)}</b>, ${euros(c.total_cents)}.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">${tableauLignes(lignes)}</table>
    <p style="color:${C.attenue};margin:0">À expédier à :</p>
    <p style="margin:4px 0 16px">${adresse(c).map(echapper).join('<br>')}</p>
    <p>${echapper(c.client_email)}${c.client_telephone ? ' · ' + echapper(c.client_telephone) : ''}</p>
    ${SITE ? `<p><a href="${SITE}/admin/commandes.html" style="color:${C.accent}">Ouvrir les commandes</a></p>` : ''}`;
  const texte = [`Nouvelle commande ${c.numero} : ${euros(c.total_cents)}`, '',
    ...lignes.map((l) => `- ${l.titre_livre} x ${l.quantite}${l.dedicace ? ` (dédicace : ${l.dedicace})` : ''}`), '',
    'À expédier à :', ...adresse(c), c.client_email].join('\n');
  return { sujet: `Nouvelle commande ${c.numero}`, html: gabarit('Nouvelle commande', corps), texte };
}

async function envoyer(a: { email: string; nom?: string }, m: { sujet: string; html: string; texte: string }, repondreA?: string) {
  const appel = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: EXPEDITEUR_NOM, email: EXPEDITEUR_EMAIL },
      to: [{ email: a.email, name: a.nom }],
      ...(repondreA ? { replyTo: { email: repondreA } } : {}),
      subject: m.sujet, htmlContent: m.html, textContent: m.texte, tags: ['commande'],
    }),
  });
  if (!appel.ok) throw new Error(`Brevo ${appel.status} : ${(await appel.text()).slice(0, 300)}`);
}

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
  if (!BREVO_API_KEY || !EXPEDITEUR_EMAIL) return reponse(req, { erreur: "Service d'envoi non configuré" }, 500);

  const appelant = await autoriser(req);
  if (!appelant) return reponse(req, { erreur: 'Non autorisé' }, 401);

  try {
    const corps = await req.json().catch(() => ({})) as { commande_id?: string; numero?: string; forcer?: boolean };
    const trouve = await chargerCommande(corps.commande_id ?? null, corps.numero ?? null);
    if (!trouve) return reponse(req, { erreur: 'Commande introuvable' }, 404);
    const { commande, lignes } = trouve;
    // On ne confirme que ce qui est réellement payé.
    if (commande.paiement_statut !== 'paye') return reponse(req, { erreur: 'Commande non réglée' }, 409);
    // Stripe peut relancer le webhook : une seule confirmation, sauf renvoi voulu depuis l'admin.
    if (commande.confirmation_envoyee_at && corps.forcer !== true) return reponse(req, { deja_envoyee: true });

    await envoyer({ email: commande.client_email, nom: commande.client_nom }, emailLecteur(commande, lignes), AUTEUR_EMAIL || undefined);
    await admin.from('commandes').update({ confirmation_envoyee_at: new Date().toISOString() }).eq('id', commande.id);

    // L'avis à Laurent passe après : son échec ne doit pas faire croire au lecteur que rien n'est parti.
    if (AUTEUR_EMAIL) {
      try { await envoyer({ email: AUTEUR_EMAIL }, emailAuteur(commande, lignes), commande.client_email); }
      catch (err) { console.error("envoyer-confirmation : avis à l'auteur", err); }
    }
    console.log('Confirmation envoyée', commande.numero, 'par', appelant);
    return reponse(req, { envoyee: true, numero: commande.numero });
  } catch (err) {
    console.error('envoyer-confirmation', err);
    return reponse(req, { erreur: "L'envoi a échoué" }, 500);
  }
});
