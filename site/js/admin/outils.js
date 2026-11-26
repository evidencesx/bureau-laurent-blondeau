// outils.js — petits outils partagés par les écrans de l'administration.

export const euros = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// « 19,90 » ou « 19.90 € » → 1990. Renvoie null si la saisie n'est pas un prix.
export function centimes(texte) {
  const n = parseFloat(String(texte ?? '').replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
export const prixSaisi = (c) => (c / 100).toFixed(2).replace('.', ',');

export const dateFr = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) =>
  iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('fr-FR', opts) : '';
export const dateHeure = (iso) => iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export function echapper(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// « L'héritage empoisonné » → « l-heritage-empoisonne » : l'adresse du livre sur le site.
export function slugifier(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’']/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'livre';
}

let minuteurToast = 0;
export function toast(texte, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = texte;
  t.className = `toast toast--${type}`;
  t.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { t.hidden = true; }, type === 'erreur' ? 7000 : 3500);
}

export function erreurLisible(err) {
  const m = String(err?.message || err || '');
  if (/duplicate key|unique/i.test(m)) return 'Ce nom existe déjà.';
  if (/row-level security|permission|JWT/i.test(m)) return 'Accès refusé : reconnectez-vous.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible. Vérifiez internet et réessayez.';
  return m || 'Une erreur est survenue.';
}

/* ---------- Couverture : allégée dans le navigateur, couleurs du dos calculées ----------
   Une photo de 5 Mo devient un JPEG d'environ 150 Ko, assez net pour le livre ouvert.
   La couleur moyenne de la couverture, assombrie, devient la couleur du dos dans la pile. */
export async function preparerCouverture(fichier) {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, non) => { const i = new Image(); i.onload = () => ok(i); i.onerror = non; i.src = url; });
    const HAUTEUR_MAX = 1100;
    const k = Math.min(1, HAUTEUR_MAX / img.naturalHeight);
    const l = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const toile = document.createElement('canvas');
    toile.width = l; toile.height = h;
    const ctx = toile.getContext('2d');
    ctx.drawImage(img, 0, 0, l, h);

    const petit = document.createElement('canvas');
    petit.width = 24; petit.height = 36;
    const pc = petit.getContext('2d');
    pc.drawImage(img, 0, 0, 24, 36);
    const px = pc.getImageData(0, 0, 24, 36).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    [r, g, b] = [r / n, g / n, b / n];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const sombre = Math.min(1, 0.42 / Math.max(lum, 0.05)); // un dos de livre reste plutôt sombre
    const hex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    const dos = `#${hex(r * sombre)}${hex(g * sombre)}${hex(b * sombre)}`.toUpperCase();
    const texte = `#${hex(r + (255 - r) * 0.75)}${hex(g + (255 - g) * 0.75)}${hex(b + (255 - b) * 0.75)}`.toUpperCase();

    const blob = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.86));
    return { blob, largeur: l, hauteur: h, couleurDos: dos, couleurTexte: texte };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Ouvre une petite fenêtre de confirmation (plus lisible que confirm() sur téléphone).
export function confirmer(question, { oui = 'Confirmer', non = 'Annuler', danger = false } = {}) {
  return new Promise((ok) => {
    const d = document.createElement('dialog');
    d.className = 'dialogue';
    d.innerHTML = `<p></p><div class="dialogue__actions"><button class="btn btn--clair" value="non"></button><button class="btn${danger ? ' btn--danger' : ''}" value="oui"></button></div>`;
    d.querySelector('p').textContent = question;
    d.querySelector('[value="non"]').textContent = non;
    d.querySelector('[value="oui"]').textContent = oui;
    d.addEventListener('click', (e) => { const v = e.target.closest('button')?.value; if (v) { d.close(); ok(v === 'oui'); } });
    d.addEventListener('cancel', () => ok(false));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  });
}
