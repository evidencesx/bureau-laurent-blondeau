// demarrage.js — construit la page d'accueil à partir de la base, puis lance la scène.
//
// Ce que Laurent saisit dans l'administration arrive ici : les livres (pile du
// bureau et bibliothèques), les salons (tableau de liège) et la presse (journal).
// Ensuite seulement, on charge les scripts de la scène, qui lisent la page telle
// qu'elle est construite.
//
// Si la base ne répond pas (non configurée, en pause, réseau coupé), on garde le
// contenu écrit dans index.html : le site ne s'affiche jamais vide.

import { baseConfiguree, base } from './client.js';

const ATTENTE_MAX = 4000; // au-delà, on part avec le contenu de la page
const PAR_BIBLIOTHEQUE = 4; // une étagère par style, quatre étagères par meuble
const PILE_MAX = 7;

// Les quatre étagères de la photo de la bibliothèque (pixels de l'image 1680 × 944).
const ETAGERES = [
  { x: 668, y: 44, w: 344, h: 178 },
  { x: 668, y: 248, w: 347, h: 178 },
  { x: 668, y: 448, w: 344, h: 178 },
  { x: 668, y: 648, w: 347, h: 192 },
];
// Les places de la pile, du bas vers le haut : longueur, épaisseur, décalage, rotation.
const PLACES = [
  { l: 277, e: 14, dx: 4, dy: -6, r: 3 },
  { l: 211, e: 24, dx: -10, dy: 4, r: -5 },
  { l: 210, e: 22, dx: 8, dy: -2, r: 4 },
  { l: 210, e: 24, dx: -4, dy: 6, r: -2 },
  { l: 210, e: 20, dx: 6, dy: -4, r: 6 },
  { l: 202, e: 9, dx: -6, dy: 2, r: -7 },
  { l: 200, e: 10, dx: 2, dy: 0, r: 3 },
];

function el(nom, attributs = {}, ...enfants) {
  const n = document.createElement(nom);
  for (const [k, v] of Object.entries(attributs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'texte') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) n.style.setProperty(p, val);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) if (e) n.append(e);
  return n;
}

const prixTexte = (c) => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';

// Une couleur d'accent lisible tirée du dos du livre (pour la lumière du livre ouvert).
function accent(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return { css: '#D9A441', rgb: '217,164,65' };
  const n = parseInt(m[1], 16);
  const v = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * 0.55));
  return { css: `rgb(${v.join(',')})`, rgb: v.join(',') };
}

async function charger() {
  if (window.__DONNEES_TEST__) return window.__DONNEES_TEST__;
  if (!baseConfiguree) return null;
  const sb = await base();
  const [styles, livres, evenements, presse] = await Promise.all([
    sb.from('styles').select('id, nom, ordre').order('ordre').order('nom'),
    sb.from('livres').select('id, slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url, couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie_le')
      .eq('publie', true).order('publie_le', { ascending: false }),
    sb.from('evenements').select('date_evenement, lieu, adresse').order('date_evenement'),
    sb.from('presse').select('media, titre, extrait, annee, date_article, url, a_la_une'),
  ]);
  for (const r of [styles, livres, evenements, presse]) if (r.error) throw r.error;
  return { styles: styles.data, livres: livres.data, evenements: evenements.data, presse: presse.data };
}

// --- Fiche d'un livre (lue par le livre qui s'ouvre) --------------------------
function fiche(l, i) {
  const lumiere = accent(l.couleur_dos);
  const resume = el('div', { class: 'resume' }, (l.resume || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => el('p', { texte: p })));
  return el('article', {
    class: 'fiche', id: l.slug, 'data-id': l.id, 'data-stock': l.stock, 'data-prix-cents': l.prix_cents,
    'data-rgb': lumiere.rgb, style: { '--light': lumiere.css, '--rr': `${[-2, 1, -1, 2][i % 4]}deg`, '--i': i },
  },
  el('a', { class: 'book', href: `#${l.slug}`, 'data-livre': l.slug },
    el('img', { src: l.couverture_url || 'img/couverture-absente.svg', width: l.couverture_largeur || 700, height: l.couverture_hauteur || 1050, alt: l.titre, loading: 'lazy' })),
  el('div', { class: 'fiche__texte' },
    l.etiquette && el('p', { class: 'etiquette', texte: l.etiquette }),
    el('h3', { texte: l.titre }),
    l.sous_titre && el('p', { class: 'accroche', texte: l.sous_titre }),
    resume,
    l.isbn && el('p', { class: 'meta', texte: `ISBN ${l.isbn}` }),
    el('p', { class: 'prix', texte: prixTexte(l.prix_cents) })));
}

// --- Les bibliothèques : 4 styles par meuble ---------------------------------
function bibliotheques(d) {
  const modele = document.querySelector('.vue--biblio');
  const piece = document.querySelector('.piece');
  const groupes = [];
  for (let i = 0; i < Math.max(1, d.styles.length); i += PAR_BIBLIOTHEQUE) groupes.push(d.styles.slice(i, i + PAR_BIBLIOTHEQUE));
  const n = groupes.length;

  groupes.forEach((styles, g) => {
    const rang = g + 1;
    const vue = rang === 1 ? modele : modele.cloneNode(true);
    vue.dataset.rang = rang;
    vue.style.setProperty('--rang', rang);
    vue.classList.toggle('vue--miroir', rang % 2 === 0);
    vue.setAttribute('aria-label', n > 1 ? `La bibliothèque, meuble ${rang} sur ${n}` : 'La bibliothèque');
    const anciens = vue.querySelector('.rayons');
    const rayons = el(rang === 1 ? 'main' : 'div', { class: 'rayons', id: rang === 1 ? 'livres' : null });
    let compteur = 0;
    styles.forEach((s, e) => {
      const livres = d.livres.filter((l) => l.style_id === s.id);
      const pos = ETAGERES[e];
      const idPlaque = `rayon-${rang}-${e}`;
      rayons.append(el('section', {
        class: `rayon${livres.length > 5 ? ' rayon--tres-serre' : livres.length > 3 ? ' rayon--serre' : ''}`,
        style: { '--x': pos.x, '--y': pos.y, '--w': pos.w, '--h': pos.h }, 'aria-labelledby': idPlaque,
      },
      el('div', { class: 'rayon__livres' }, livres.map((l) => fiche(l, compteur++))),
      el('h2', { class: 'rayon__plaque', id: idPlaque, texte: s.nom })));
    });
    anciens.replaceWith(rayons);

    // Passer d'un meuble à l'autre : un panneau bien visible sur le bord.
    vue.querySelectorAll('.rayons-suite, .rayons-precedents').forEach((b) => b.remove());
    const decor = vue.querySelector('.decor');
    if (rang < n) decor.after(el('button', { class: 'rayons-suite', type: 'button', 'data-aller': rang + 1 },
      el('span', { class: 'rayons-suite__fleche', 'aria-hidden': 'true', texte: '←' }),
      el('span', { texte: 'Autres rayons' }),
      el('small', { texte: groupes[rang].map((s) => s.nom).join(' · ') })));
    if (rang > 1) decor.after(el('button', { class: 'rayons-precedents', type: 'button', 'data-aller': rang - 1 },
      el('span', { texte: 'Rayons précédents' }),
      el('span', { class: 'rayons-suite__fleche', 'aria-hidden': 'true', texte: '→' })));
    const aide = vue.querySelector('.aide--biblio');
    if (aide) aide.textContent = rang < n ? 'Choisissez un livre, ou d’autres rayons à gauche' : 'Choisissez un livre pour l’ouvrir';

    if (rang > 1) piece.insertBefore(vue, piece.querySelector('.rideau'));
  });
}

// --- La pile du bureau : les 7 derniers parus, le plus récent en haut ---------
function pile(d) {
  const plan = document.querySelector('.pile__plan');
  if (!plan) return;
  const derniers = d.livres.slice(0, PILE_MAX).reverse(); // du bas vers le haut
  const places = PLACES.slice(0, derniers.length);
  let z = 0;
  const tomes = derniers.map((l, i) => {
    const p = places[i];
    const ratio = l.couverture_largeur && l.couverture_hauteur ? l.couverture_largeur / l.couverture_hauteur : 0.68;
    const largeur = Math.round(Math.min(Math.max(p.l * ratio, 120), 210));
    const dessus = i === derniers.length - 1;
    const tome = el('button', {
      class: `tome${dessus ? ' tome--dessus' : ''}`, type: 'button', 'data-livre': l.slug,
      style: { '--l': p.l, '--p': largeur, '--e': p.e, '--z': z, '--dx': p.dx, '--dy': p.dy, '--r': `${p.r}deg`, '--c': l.couleur_dos || '#1E2230', '--t': l.couleur_texte || '#E9D9BB' },
    },
    el('span', { class: 'tome__dessus' }, l.couverture_url && el('img', { src: l.couverture_url, alt: '' })),
    el('span', { class: 'tome__dos' }, el('span', { texte: l.titre }), p.e >= 14 && el('small', { texte: 'L. Blondeau' })),
    el('span', { class: 'tome__tranche' }),
    el('span', { class: 'visuellement-cache', texte: l.titre }));
    z += p.e;
    return tome;
  });
  plan.querySelectorAll('.tome').forEach((t) => t.remove());
  plan.append(...tomes);
}

// --- Le tableau des salons -----------------------------------------------------
function salons(d) {
  const liste = document.querySelector('.liege__notes');
  if (!liste) return;
  const date = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  liste.replaceChildren(...d.evenements.map((e) => el('li', { 'data-date': e.date_evenement },
    el('time', { datetime: e.date_evenement, texte: date(e.date_evenement) }),
    el('span', { class: 'lieu', texte: e.lieu }),
    e.adresse && el('small', { class: 'adresse', texte: e.adresse }))));
}

// --- Le journal de la presse -----------------------------------------------------
function presse(d) {
  const une = document.querySelector('.gazette__une');
  const liste = document.querySelector('.gazette__articles');
  if (!une || !liste) return;
  const quand = (a) => a.date_article ? new Date(a.date_article + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : String(a.annee);
  const tri = [...d.presse].sort((a, b) => (b.date_article || `${b.annee}-01-01`).localeCompare(a.date_article || `${a.annee}-01-01`));
  const enUne = tri.find((a) => a.a_la_une) || tri.find((a) => a.titre) || tri[0];
  const lien = (a) => el('a', { class: 'gazette__lien', href: a.url, target: '_blank', rel: 'noopener' }, 'Lire l’article');
  if (enUne) {
    // filter(Boolean) : sans extrait, rien ne s'affiche (replaceChildren écrirait « null » en toutes lettres).
    une.replaceChildren(...[
      el('p', { class: 'gazette__rubrique', texte: `${enUne.media} · ${quand(enUne)}` }),
      el('h3', { texte: enUne.titre || enUne.media }),
      enUne.extrait && el('p', { class: 'gazette__chapo', texte: `« ${enUne.extrait} »` }),
      lien(enUne),
    ].filter(Boolean));
  }
  une.hidden = !enUne;
  liste.replaceChildren(...tri.filter((a) => a !== enUne).map((a) => el('li', {},
    el('span', { class: 'gazette__journal', texte: a.titre ? `${a.media} : ${a.titre}` : a.media }),
    el('span', { class: 'gazette__annee', texte: a.date_article ? quand(a) : String(a.annee) }),
    el('a', { href: a.url, target: '_blank', rel: 'noopener', texte: 'Lire l’article' }))));
}

function construire(d) {
  // Les livres dont le style a disparu vont sur la dernière étagère existante plutôt que de disparaître.
  const ids = new Set(d.styles.map((s) => s.id));
  if (d.styles.length) d.livres.forEach((l) => { if (!ids.has(l.style_id)) l.style_id = d.styles[d.styles.length - 1].id; });
  if (d.livres.length) { bibliotheques(d); pile(d); }
  salons(d);
  presse(d);
  document.documentElement.classList.add('depuis-la-base');
}

function chargerScript(src) {
  return new Promise((ok) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = ok;
    document.body.append(s);
  });
}

(async () => {
  try {
    const d = await Promise.race([charger(), new Promise((_, non) => setTimeout(() => non(new Error('délai dépassé')), ATTENTE_MAX))]);
    if (d) construire(d);
  } catch (err) {
    console.warn('Contenu de la base indisponible, on garde celui de la page :', err.message);
  }
  for (const src of ['js/scene.js', 'js/lecteur.js', 'js/panneaux.js', 'js/achat.js']) await chargerScript(src);
})();
