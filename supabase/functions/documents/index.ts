// documents — fabrique les factures et les avoirs en PDF, et les range dans le coffre.
//
// Appelée :
//   * par envoyer-confirmation, avec la clé de service, au paiement confirmé :
//     { type: 'facture', commande_id, avec_pdf: true } → la facture est émise
//     (numéro attribué par la base, une seule fois) et son PDF est renvoyé en
//     base64 pour être joint au récapitulatif ;
//   * par l'administration, avec le jeton de Laurent ou de Tom :
//     { type: 'facture', facture_id } ou { type: 'avoir', avoir_id } → le PDF est
//     fabriqué s'il n'existe pas encore, et son chemin dans le coffre est renvoyé.
//
// Un PDF n'est fabriqué qu'une fois, puis relu : un document comptable émis ne
// change plus. Le coffre (« documents ») est privé : l'administration lit les
// PDF par des liens temporaires.
//
// Déploiement : Supabase > Edge Functions > Deploy a new function > Via Editor,
// nommer la fonction « documents », laisser « Verify JWT » activé.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const URL_SUPABASE = Deno.env.get('SUPABASE_URL') ?? '';
const CLE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
const COFFRE = 'documents';

// Le vendeur, tel qu'il doit figurer sur chaque facture.
const VENDEUR = {
  nom: 'Laurent Blondeau',
  lignes: [
    'ABC Adom Pro, SARL au capital de 5 000 €',
    '109 rue du Général de Gaulle, Passage Fleuri',
    '78120 Rambouillet',
    'SIRET 794 436 964 00025 · RCS Versailles 794 436 964',
    'TVA intracommunautaire FR49794436964',
    'contact@laurentblondeau.fr · laurentblondeau.fr',
  ],
  pied: 'Laurent Blondeau est le nom commercial de la société ABC Adom Pro.',
};

// ---------------------------------------------------------------------------
// Mise en page (aucun accès réseau ici : testable à part)
// ---------------------------------------------------------------------------

type Ligne = { designation: string; quantite: number; pu_ttc_cents: number };
export type Document = {
  sorte: 'facture' | 'avoir';
  numero: string;
  date: string;                 // ISO
  commande_numero: string;
  client: { nom?: string; email?: string; adresse_ligne1?: string; adresse_ligne2?: string | null; code_postal?: string; ville?: string };
  lignes: Ligne[];
  livraison_cents: number;
  taux_tva: number;
  total_ttc_cents: number;
  tva_cents: number;
  total_ht_cents: number;
  paye_le?: string | null;
  motif?: string | null;
  facture_numero?: string;      // avoir : la facture qu'il corrige
  facture_date?: string;
};

// Les polices standard du PDF ne connaissent que l'alphabet latin courant
// (WinAnsi). Tout autre caractère (lettre d'une autre langue, émoji) est ramené
// à sa forme sans accent, ou remplacé, pour que la fabrication n'échoue jamais.
const WINANSI_EN_PLUS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const LETTRES: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i', 'Ħ': 'H', 'ħ': 'h' };
export function propre(texte: unknown): string {
  return Array.from(String(texte ?? '').replace(/[  ]/g, ' ')).map((c) => {
    const code = c.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EN_PLUS.includes(c)) return c;
    if (LETTRES[c]) return LETTRES[c];
    if (c === '\n' || c === '\t') return ' ';
    const simple = c.normalize('NFD').replace(/\p{M}/gu, '');
    if (/^[\x20-\x7e]$/.test(simple)) return simple;
    return /[\p{L}\p{N}]/u.test(c) ? '?' : ''; // une lettre inconnue se signale, un émoji disparaît
  }).join('');
}

const euros = (c: number) => {
  const signe = c < 0 ? '-' : '';
  const [e, d] = (Math.abs(c) / 100).toFixed(2).split('.');
  return `${signe}${e.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${d} €`;
};
const dateLongue = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

// Le hors-taxe de chaque ligne, arrondi au centime, puis ajusté pour que la
// somme des lignes tombe juste sur le total hors taxe du document.
function lignesHT(doc: Document) {
  const toutes = [...doc.lignes.map((l) => ({ ...l })), ...(doc.livraison_cents > 0
    ? [{ designation: 'Livraison en France métropolitaine', quantite: 1, pu_ttc_cents: doc.livraison_cents }] : [])];
  const div = 1 + doc.taux_tva / 100;
  const calc = toutes.map((l) => ({ ...l, ht: Math.round((l.pu_ttc_cents * l.quantite) / div), pu_ht: Math.round(l.pu_ttc_cents / div) }));
  const ecart = doc.total_ht_cents - calc.reduce((s, l) => s + l.ht, 0);
  if (ecart && calc.length) calc.reduce((a, b) => (b.ht > a.ht ? b : a)).ht += ecart;
  return calc;
}

export async function rendre(doc: Document): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.sorte === 'facture' ? 'Facture' : 'Avoir'} ${doc.numero}`);
  pdf.setAuthor(VENDEUR.nom);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const titre = await pdf.embedFont(StandardFonts.TimesRoman);
  const encre = rgb(0.13, 0.145, 0.17);
  const doux = rgb(0.35, 0.36, 0.38);
  const filet = rgb(0.8, 0.78, 0.72);
  const M = 50, L = 595.28 - 2 * M;

  const ecrire = (t: string, x: number, y: number, o: { taille?: number; police?: any; couleur?: any; droite?: boolean } = {}) => {
    const taille = o.taille ?? 10, police = o.police ?? normal, texte = propre(t);
    const xx = o.droite ? x - police.widthOfTextAtSize(texte, taille) : x;
    page.drawText(texte, { x: xx, y, size: taille, font: police, color: o.couleur ?? encre });
  };
  const couper = (t: string, largeur: number, taille: number, police = normal) => {
    const mots = propre(t).split(' '), lignes: string[] = [];
    let cour = '';
    for (const m of mots) {
      const essai = cour ? `${cour} ${m}` : m;
      if (police.widthOfTextAtSize(essai, taille) > largeur && cour) { lignes.push(cour); cour = m; } else cour = essai;
    }
    if (cour) lignes.push(cour);
    return lignes;
  };
  const trait = (y: number, epaisseur = 0.6) => page.drawLine({ start: { x: M, y }, end: { x: M + L, y }, thickness: epaisseur, color: filet });

  // En-tête : le vendeur à gauche, le document à droite.
  let y = 790;
  ecrire(VENDEUR.nom, M, y, { taille: 22, police: titre });
  y -= 18;
  for (const l of VENDEUR.lignes) { ecrire(l, M, y, { taille: 8.5, couleur: doux }); y -= 11.5; }

  const estFacture = doc.sorte === 'facture';
  ecrire(estFacture ? 'FACTURE' : 'AVOIR', M + L, 790, { taille: 20, police: gras, droite: true });
  ecrire(`N° ${doc.numero}`, M + L, 770, { taille: 11, police: gras, droite: true });
  ecrire(`Date : ${dateLongue(doc.date)}`, M + L, 755, { taille: 9.5, droite: true });
  ecrire(`Commande : ${doc.commande_numero}`, M + L, 742, { taille: 9.5, droite: true });
  if (!estFacture && doc.facture_numero) {
    ecrire(`Sur la facture ${doc.facture_numero}`, M + L, 729, { taille: 9.5, droite: true });
    if (doc.facture_date) ecrire(`du ${dateLongue(doc.facture_date)}`, M + L, 717, { taille: 9.5, droite: true });
  }

  // Le client.
  y = Math.min(y, 705) - 14;
  ecrire(estFacture ? 'Facturé à' : 'Client', M, y, { taille: 8.5, couleur: doux });
  y -= 14;
  const c = doc.client ?? {};
  for (const l of [c.nom, c.adresse_ligne1, c.adresse_ligne2, [c.code_postal, c.ville].filter(Boolean).join(' '), c.email].filter(Boolean) as string[]) {
    ecrire(l, M, y, { taille: 10.5 }); y -= 13.5;
  }
  if (!estFacture && doc.motif) {
    y -= 6;
    for (const l of couper(`Motif : ${doc.motif}`, L, 10)) { ecrire(l, M, y, { taille: 10 }); y -= 13; }
  }

  // Le tableau.
  y -= 18;
  const col = { qte: M + 300, puht: M + 365, tva: M + 420, total: M + L };
  const entete = (yy: number) => {
    ecrire('Désignation', M, yy, { taille: 8.5, police: gras, couleur: doux });
    ecrire('Qté', col.qte, yy, { taille: 8.5, police: gras, couleur: doux, droite: true });
    ecrire('PU HT', col.puht, yy, { taille: 8.5, police: gras, couleur: doux, droite: true });
    ecrire('TVA', col.tva, yy, { taille: 8.5, police: gras, couleur: doux, droite: true });
    ecrire('Total HT', col.total, yy, { taille: 8.5, police: gras, couleur: doux, droite: true });
    trait(yy - 6, 0.8);
  };
  entete(y);
  y -= 22;
  const taux = `${String(doc.taux_tva).replace('.', ',')} %`;
  for (const l of lignesHT(doc)) {
    const morceaux = couper(l.designation, 235, 10);
    ecrire(morceaux[0] ?? '', M, y);
    ecrire(String(l.quantite), col.qte, y, { droite: true });
    ecrire(euros(l.pu_ht), col.puht, y, { droite: true });
    ecrire(taux, col.tva, y, { droite: true });
    ecrire(euros(l.ht), col.total, y, { droite: true });
    for (const suite of morceaux.slice(1)) { y -= 12.5; ecrire(suite, M, y); }
    y -= 8; trait(y); y -= 14;
  }

  // Les totaux.
  y -= 6;
  const total = (libelle: string, montant: string, fort = false) => {
    ecrire(libelle, col.tva, y, { taille: fort ? 11 : 10, police: fort ? gras : normal, droite: true });
    ecrire(montant, col.total, y, { taille: fort ? 11 : 10, police: fort ? gras : normal, droite: true });
    y -= fort ? 18 : 15;
  };
  total('Total HT', euros(doc.total_ht_cents));
  total(`TVA ${taux}`, euros(doc.tva_cents));
  total(estFacture ? 'Total TTC' : 'Montant de l’avoir TTC', euros(doc.total_ttc_cents), true);

  // Le règlement.
  y -= 14;
  const reglement = estFacture
    ? `Facture acquittée : réglée en ligne${doc.paye_le ? ` le ${dateLongue(doc.paye_le)}` : ''}.`
    : 'Ce montant est remboursé sur le moyen de paiement utilisé lors de la commande.';
  for (const l of couper(reglement, L, 9.5)) { ecrire(l, M, y, { taille: 9.5 }); y -= 12.5; }

  // Pied de page.
  trait(70);
  ecrire(VENDEUR.pied, M, 56, { taille: 8, couleur: doux });
  ecrire(`${VENDEUR.lignes[0]}, ${VENDEUR.lignes[1]}, ${VENDEUR.lignes[2]}`, M, 45, { taille: 8, couleur: doux });
  ecrire(VENDEUR.lignes[3] + ' · ' + VENDEUR.lignes[4], M, 34, { taille: 8, couleur: doux });

  return await pdf.save();
}

// ---------------------------------------------------------------------------
// Le service
// ---------------------------------------------------------------------------

const admin = createClient(URL_SUPABASE, CLE_SERVICE);

async function autoriser(req: Request): Promise<'serveur' | 'administration' | null> {
  const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jeton) return null;
  if (CLE_SERVICE && jeton === CLE_SERVICE) return 'serveur';
  const client = createClient(URL_SUPABASE, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
  const { data, error } = await client.rpc('est_admin');
  if (error) { console.error('documents : est_admin', error); return null; }
  return data === true ? 'administration' : null;
}

function enBase64(octets: Uint8Array): string {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

// Relit le PDF s'il existe, sinon le fabrique et le range.
async function pdfDe(sorte: 'facture' | 'avoir', id: string, cheminConnu: string | null, fabriquer: () => Promise<Uint8Array>, numero: string) {
  const chemin = cheminConnu ?? `${sorte === 'facture' ? 'factures' : 'avoirs'}/${numero}.pdf`;
  if (cheminConnu) {
    const { data, error } = await admin.storage.from(COFFRE).download(cheminConnu);
    if (!error && data) return { chemin, octets: new Uint8Array(await data.arrayBuffer()) };
    console.error('documents : PDF introuvable, on le refait', cheminConnu, error);
  }
  const octets = await fabriquer();
  const { error: e1 } = await admin.storage.from(COFFRE).upload(chemin, octets, { contentType: 'application/pdf', upsert: false });
  if (e1 && !/exist/i.test(e1.message ?? '')) throw e1;
  const { error: e2 } = await admin.rpc('ranger_pdf', { p_type: sorte, p_id: id, p_chemin: chemin });
  if (e2) throw e2;
  return { chemin, octets };
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

async function servir(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return reponse(req, { erreur: 'Méthode non autorisée' }, 405);
  const appelant = await autoriser(req);
  if (!appelant) return reponse(req, { erreur: 'Non autorisé' }, 401);

  try {
    const corps = await req.json().catch(() => ({})) as { type?: string; commande_id?: string; facture_id?: string; avoir_id?: string; avec_pdf?: boolean };

    if (corps.type === 'facture') {
      let facture: any;
      if (corps.commande_id) {
        // Émet la facture si besoin (numéro attribué une seule fois par la base).
        const { data, error } = await admin.rpc('emettre_facture', { p_commande_id: corps.commande_id });
        if (error) return reponse(req, { erreur: error.message }, 409);
        facture = data;
      } else {
        const { data, error } = await admin.from('factures').select('*').eq('id', corps.facture_id ?? '').maybeSingle();
        if (error) throw error;
        facture = data;
      }
      if (!facture) return reponse(req, { erreur: 'Facture introuvable' }, 404);
      const doc: Document = {
        sorte: 'facture', numero: facture.numero, date: facture.emise_le, commande_numero: facture.commande_numero,
        client: facture.client, lignes: facture.lignes, livraison_cents: facture.livraison_cents,
        taux_tva: Number(facture.taux_tva), total_ttc_cents: facture.total_ttc_cents, tva_cents: facture.tva_cents,
        total_ht_cents: facture.total_ht_cents, paye_le: facture.paye_le,
      };
      const { chemin, octets } = await pdfDe('facture', facture.id, facture.pdf_chemin, () => rendre(doc), facture.numero);
      return reponse(req, { numero: facture.numero, id: facture.id, chemin, ...(corps.avec_pdf ? { pdf_base64: enBase64(octets) } : {}) });
    }

    if (corps.type === 'avoir') {
      const { data: avoir, error } = await admin.from('avoirs').select('*, factures(*)').eq('id', corps.avoir_id ?? '').maybeSingle();
      if (error) throw error;
      if (!avoir) return reponse(req, { erreur: 'Avoir introuvable' }, 404);
      const f = avoir.factures;
      const doc: Document = {
        sorte: 'avoir', numero: avoir.numero, date: avoir.emis_le, commande_numero: f.commande_numero,
        client: f.client, lignes: avoir.lignes, livraison_cents: avoir.livraison_cents,
        taux_tva: Number(avoir.taux_tva), total_ttc_cents: avoir.total_ttc_cents, tva_cents: avoir.tva_cents,
        total_ht_cents: avoir.total_ht_cents, motif: avoir.motif, facture_numero: f.numero, facture_date: f.emise_le,
      };
      const { chemin, octets } = await pdfDe('avoir', avoir.id, avoir.pdf_chemin, () => rendre(doc), avoir.numero);
      return reponse(req, { numero: avoir.numero, id: avoir.id, chemin, ...(corps.avec_pdf ? { pdf_base64: enBase64(octets) } : {}) });
    }

    return reponse(req, { erreur: 'Type de document inconnu' }, 400);
  } catch (err) {
    console.error('documents', err);
    return reponse(req, { erreur: 'Le document n’a pas pu être fabriqué' }, 500);
  }
}

// DOCUMENTS_TEST=1 : n'ouvre pas le service (essai de la mise en page en local).
if (Deno.env.get('DOCUMENTS_TEST') !== '1') Deno.serve(servir);
