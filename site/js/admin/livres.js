// livres.js — la liste des livres et la fiche d'un livre (ajout, modification, couverture).
//
// Un livre « en ligne » apparaît dans sa bibliothèque et peut s'acheter s'il a du stock.
// Les 7 livres mis en ligne le plus récemment forment la pile du bureau, le dernier en haut :
// la date de première mise en ligne (publie_le) est posée à ce moment-là.

import { BUCKET_COUVERTURES } from '../config.js';
import { euros, centimes, prixSaisi, echapper, slugifier, toast, erreurLisible, preparerCouverture, confirmer } from './outils.js';

const SELECT = 'id, slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url, couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le, created_at';

// Les couvertures d'origine sont dans le site (img/…) ; les nouvelles, dans Supabase.
const urlImage = (u) => !u ? '../img/couverture-absente.svg' : /^https?:/.test(u) ? u : `../${u}`;

export async function listeLivres({ sb, vue }) {
  const [{ data: livres, error }, { data: styles }] = await Promise.all([
    sb.from('livres').select(SELECT).order('publie_le', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
    sb.from('styles').select('id, nom'),
  ]);
  if (error) throw error;
  const nomStyle = (id) => styles?.find((s) => s.id === id)?.nom || '·';
  const enLigne = livres.filter((l) => l.publie);
  const dansPile = new Set(enLigne.slice(0, 7).map((l) => l.id));

  vue.innerHTML = `
    <div class="entete-vue">
      <h1>Livres</h1>
      <a class="btn" href="#livre/nouveau">Ajouter un livre</a>
    </div>
    <p class="aide">Les 7 derniers livres mis en ligne forment la pile du bureau, le plus récent en haut. Le stock baisse tout seul à chaque commande payée.</p>
    <ul class="cartes" id="liste-livres"></ul>`;
  const ul = vue.querySelector('#liste-livres');
  if (!livres.length) ul.innerHTML = '<li class="vide">Aucun livre pour l’instant.</li>';
  for (const l of livres) {
    const li = document.createElement('li');
    li.className = 'carte-livre';
    li.innerHTML = `
      <img src="${echapper(urlImage(l.couverture_url))}" alt="" loading="lazy">
      <div class="carte-livre__infos">
        <a class="carte-livre__titre" href="#livre/${l.id}">${echapper(l.titre)}</a>
        <p class="petit">${echapper(nomStyle(l.style_id))} · ${euros(l.prix_cents)}</p>
        <p class="etiquettes">
          <span class="badge ${l.publie ? 'badge--ok' : ''}">${l.publie ? 'En ligne' : 'Brouillon'}</span>
          ${dansPile.has(l.id) ? '<span class="badge">Sur la pile</span>' : ''}
          ${l.publie && l.stock <= 0 ? '<span class="badge badge--alerte">Sans stock</span>' : ''}
        </p>
      </div>
      <div class="stock" role="group" aria-label="Stock de ${echapper(l.titre)}">
        <span class="petit">Stock</span>
        <button class="btn-rond" data-d="-1" aria-label="Un exemplaire de moins">−</button>
        <b>${l.stock}</b>
        <button class="btn-rond" data-d="1" aria-label="Un exemplaire de plus">+</button>
      </div>`;
    li.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', async () => {
      const nouveau = Math.max(0, l.stock + Number(b.dataset.d));
      const { error: e } = await sb.from('livres').update({ stock: nouveau, updated_at: new Date().toISOString() }).eq('id', l.id);
      if (e) { toast(erreurLisible(e), 'erreur'); return; }
      l.stock = nouveau;
      li.querySelector('.stock b').textContent = nouveau;
    }));
    ul.append(li);
  }
}

export async function ficheLivre({ sb, vue }, id) {
  const nouveau = !id || id === 'nouveau';
  const [{ data: styles }, res] = await Promise.all([
    sb.from('styles').select('id, nom, ordre').order('ordre').order('nom'),
    nouveau ? Promise.resolve({ data: null }) : sb.from('livres').select(SELECT).eq('id', id).maybeSingle(),
  ]);
  if (!nouveau && !res.data) { vue.innerHTML = '<p class="message message--erreur">Ce livre est introuvable.</p>'; return; }
  const l = res.data || { titre: '', sous_titre: '', etiquette: '', style_id: styles?.[0]?.id || null, prix_cents: 0, resume: '', isbn: '', stock: 0, publie: false };
  let couverture = null; // nouvelle couverture préparée, pas encore envoyée

  vue.innerHTML = `
    <p><a href="#livres">← Tous les livres</a></p>
    <h1>${nouveau ? 'Ajouter un livre' : echapper(l.titre)}</h1>
    <form class="fiche" id="form-livre" novalidate>
      <div class="fiche__couverture">
        <img id="apercu-couv" src="${echapper(urlImage(l.couverture_url))}" alt="Couverture">
        <label class="btn btn--clair">Choisir la couverture<input type="file" id="fichier-couv" accept="image/jpeg,image/png,image/webp" hidden></label>
        <p class="aide">Photo ou fichier de la couverture, de face. Elle est allégée automatiquement.</p>
      </div>
      <div class="fiche__champs">
        <label>Titre<input name="titre" required maxlength="160" value="${echapper(l.titre)}"></label>
        <label>Sous-titre <small>la phrase sous le titre, facultatif</small><input name="sous_titre" maxlength="300" value="${echapper(l.sous_titre || '')}"></label>
        <div class="deux">
          <label>Style
            <select name="style_id" id="choix-style">
              ${(styles || []).map((s) => `<option value="${s.id}"${s.id === l.style_id ? ' selected' : ''}>${echapper(s.nom)}</option>`).join('')}
              <option value="__nouveau">+ Ajouter un style…</option>
            </select>
          </label>
          <label>Prix (€)<input name="prix" inputmode="decimal" required value="${prixSaisi(l.prix_cents)}"></label>
        </div>
        <label>Résumé <small>laissez une ligne vide entre deux paragraphes</small><textarea name="resume" rows="9">${echapper(l.resume || '')}</textarea></label>
        <div class="deux">
          <label>Mention au-dessus du titre <small>facultatif, ex. « Thriller, 2022 »</small><input name="etiquette" maxlength="80" value="${echapper(l.etiquette || '')}"></label>
          <label>ISBN <small>facultatif</small><input name="isbn" maxlength="30" value="${echapper(l.isbn || '')}"></label>
        </div>
        <div class="deux">
          <label>Exemplaires en stock<input name="stock" type="number" min="0" step="1" value="${l.stock}"></label>
          <label class="interrupteur"><input type="checkbox" name="publie"${l.publie ? ' checked' : ''}> <span>En ligne sur le site</span></label>
        </div>
        <p class="message" id="message-livre" hidden></p>
        <div class="actions">
          <button class="btn" type="submit">${nouveau ? 'Ajouter le livre' : 'Enregistrer'}</button>
          ${nouveau ? '' : '<button class="btn btn--danger btn--clair" type="button" id="supprimer">Supprimer</button>'}
        </div>
      </div>
    </form>`;

  const form = vue.querySelector('#form-livre');
  const msg = vue.querySelector('#message-livre');
  const dire = (t, type) => { msg.textContent = t; msg.className = `message message--${type}`; msg.hidden = false; };

  // « + Ajouter un style… » : création immédiate, puis sélection.
  const choix = vue.querySelector('#choix-style');
  let dernierChoix = choix.value;
  choix.addEventListener('change', async () => {
    if (choix.value !== '__nouveau') { dernierChoix = choix.value; return; }
    const nom = (prompt('Nom du nouveau style (il aura sa propre étagère) :') || '').trim();
    if (!nom) { choix.value = dernierChoix; return; }
    const ordre = (styles?.length || 0) + 1;
    const { data, error } = await sb.from('styles').insert({ nom, ordre }).select('id, nom').single();
    if (error) { toast(erreurLisible(error), 'erreur'); choix.value = dernierChoix; return; }
    const opt = new Option(data.nom, data.id, true, true);
    choix.insertBefore(opt, choix.lastElementChild);
    dernierChoix = data.id;
    toast(`Style « ${data.nom} » ajouté.`);
  });

  vue.querySelector('#fichier-couv').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      couverture = await preparerCouverture(f);
      vue.querySelector('#apercu-couv').src = URL.createObjectURL(couverture.blob);
    } catch (err) {
      toast('Cette image n’a pas pu être lue. Essayez un fichier JPEG ou PNG.', 'erreur');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = Object.fromEntries(new FormData(form));
    const prix = centimes(d.prix);
    if (prix === null) { dire('Le prix doit être un nombre, par exemple 19,90.', 'erreur'); return; }
    const publie = form.publie.checked;
    if (publie && !couverture && !l.couverture_url) { dire('Ajoutez une couverture avant de mettre le livre en ligne.', 'erreur'); return; }
    const bouton = form.querySelector('[type="submit"]');
    bouton.disabled = true;
    try {
      const champs = {
        titre: d.titre.trim(), sous_titre: d.sous_titre.trim() || null, etiquette: d.etiquette.trim() || null,
        style_id: d.style_id && d.style_id !== '__nouveau' ? d.style_id : null, prix_cents: prix, resume: d.resume.trim(),
        isbn: d.isbn.trim() || null, stock: Math.max(0, parseInt(d.stock, 10) || 0), publie,
        updated_at: new Date().toISOString(),
      };
      // Première mise en ligne : le livre passe en haut de la pile.
      if (publie && !l.publie_le) champs.publie_le = new Date().toISOString();
      if (nouveau) {
        let slug = slugifier(champs.titre);
        const { data: pris } = await sb.from('livres').select('slug').like('slug', `${slug}%`);
        if (pris?.some((p) => p.slug === slug)) slug = `${slug}-${(pris.length + 1)}`;
        champs.slug = slug;
      }
      if (couverture) {
        const chemin = `${nouveau ? champs.slug : l.slug}-${Date.now()}.jpg`;
        const { error: eu } = await sb.storage.from(BUCKET_COUVERTURES).upload(chemin, couverture.blob, { contentType: 'image/jpeg', upsert: false });
        if (eu) throw eu;
        champs.couverture_url = sb.storage.from(BUCKET_COUVERTURES).getPublicUrl(chemin).data.publicUrl;
        Object.assign(champs, { couverture_largeur: couverture.largeur, couverture_hauteur: couverture.hauteur, couleur_dos: couverture.couleurDos, couleur_texte: couverture.couleurTexte });
      }
      const requete = nouveau ? sb.from('livres').insert(champs) : sb.from('livres').update(champs).eq('id', l.id);
      const { data, error } = await requete.select('id').single();
      if (error) throw error;
      toast(nouveau ? 'Livre ajouté.' : 'Livre enregistré.');
      if (nouveau) {
        location.hash = `#livre/${data.id}`;
      } else {
        Object.assign(l, champs);
        couverture = null;
        dire(publie ? 'Enregistré. Le livre est en ligne.' : 'Enregistré. Le livre est en brouillon, invisible sur le site.', 'ok');
      }
    } catch (err) {
      console.error(err);
      dire(erreurLisible(err), 'erreur');
    } finally {
      bouton.disabled = false;
    }
  });

  vue.querySelector('#supprimer')?.addEventListener('click', async () => {
    const ok = await confirmer(`Supprimer définitivement « ${l.titre} » ? Pour le retirer du site sans le perdre, décochez plutôt « En ligne ».`, { oui: 'Supprimer', danger: true });
    if (!ok) return;
    const { error } = await sb.from('livres').delete().eq('id', l.id);
    if (error) { toast(erreurLisible(error), 'erreur'); return; }
    toast('Livre supprimé.');
    location.hash = '#livres';
  });
}
