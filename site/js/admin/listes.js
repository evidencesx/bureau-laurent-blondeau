// listes.js — trois rubriques simples : les styles (étagères), les salons, la presse.

import { echapper, dateFr, toast, erreurLisible, confirmer } from './outils.js';

const PAR_BIBLIOTHEQUE = 4;

/* ---------- Styles : une étagère chacun, 4 par bibliothèque ---------- */
export async function vueStyles(ctx) {
  const { sb, vue } = ctx;
  const [{ data: styles, error }, { data: livres }] = await Promise.all([
    sb.from('styles').select('id, nom, ordre').order('ordre').order('nom'),
    sb.from('livres').select('style_id'),
  ]);
  if (error) throw error;
  const compte = (id) => (livres || []).filter((l) => l.style_id === id).length;

  vue.innerHTML = `
    <h1>Styles</h1>
    <p class="aide">Chaque style a son étagère dans la bibliothèque, dans cet ordre. Quatre étagères par meuble : au-delà, le site ajoute une bibliothèque à gauche, avec un panneau « Autres rayons » pour y aller.</p>
    <ol class="lignes" id="liste-styles"></ol>
    <form class="ajout" id="form-style">
      <label>Nouveau style<input name="nom" required maxlength="60" placeholder="Ex. : Jeunesse"></label>
      <button class="btn">Ajouter</button>
    </form>`;
  const ol = vue.querySelector('#liste-styles');
  styles.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'ligne';
    const meuble = Math.floor(i / PAR_BIBLIOTHEQUE) + 1;
    li.innerHTML = `
      <span class="ligne__num">${i % PAR_BIBLIOTHEQUE === 0 ? `<small>Bibliothèque ${meuble}</small>` : ''}</span>
      <input class="ligne__nom" value="${echapper(s.nom)}" aria-label="Nom du style" maxlength="60">
      <span class="petit">${compte(s.id)} livre${compte(s.id) > 1 ? 's' : ''}</span>
      <span class="ligne__actions">
        <button class="btn-rond" data-a="haut" aria-label="Monter"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="btn-rond" data-a="bas" aria-label="Descendre"${i === styles.length - 1 ? ' disabled' : ''}>↓</button>
        <button class="lien lien--danger" data-a="suppr">Supprimer</button>
      </span>`;
    const champ = li.querySelector('.ligne__nom');
    champ.addEventListener('change', async () => {
      const nom = champ.value.trim();
      if (!nom) { champ.value = s.nom; return; }
      const { error: e } = await sb.from('styles').update({ nom }).eq('id', s.id);
      if (e) { toast(erreurLisible(e), 'erreur'); champ.value = s.nom; return; }
      s.nom = nom; toast('Style renommé.');
    });
    li.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'suppr') {
        const n = compte(s.id);
        const ok = await confirmer(n ? `Supprimer « ${s.nom} » ? Ses ${n} livre(s) n’auront plus de style : rangez-les dans un autre style.` : `Supprimer le style « ${s.nom} » ?`, { oui: 'Supprimer', danger: true });
        if (!ok) return;
        const { error: e2 } = await sb.from('styles').delete().eq('id', s.id);
        if (e2) { toast(erreurLisible(e2), 'erreur'); return; }
        toast('Style supprimé.'); return vueStyles(ctx);
      }
      // Échange de place avec le voisin : on renumérote toute la liste pour garder un ordre propre.
      const j = a === 'haut' ? i - 1 : i + 1;
      const ordre = [...styles];
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
      for (const [k, st] of ordre.entries()) {
        const { error: e3 } = await sb.from('styles').update({ ordre: k + 1 }).eq('id', st.id);
        if (e3) { toast(erreurLisible(e3), 'erreur'); break; }
      }
      vueStyles(ctx);
    });
    ol.append(li);
  });
  vue.querySelector('#form-style').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nom = e.target.nom.value.trim();
    if (!nom) return;
    const { error: e4 } = await sb.from('styles').insert({ nom, ordre: styles.length + 1 });
    if (e4) { toast(erreurLisible(e4), 'erreur'); return; }
    toast(`Style « ${nom} » ajouté.`);
    vueStyles(ctx);
  });
}

/* ---------- Salons et évènements ---------- */
export async function vueEvenements(ctx) {
  const { sb, vue } = ctx;
  const { data: evts, error } = await sb.from('evenements').select('id, date_evenement, lieu, adresse').order('date_evenement');
  if (error) throw error;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const avenir = evts.filter((e) => e.date_evenement >= aujourdhui);
  const passes = evts.filter((e) => e.date_evenement < aujourdhui).reverse();

  vue.innerHTML = `
    <h1>Évènements</h1>
    <p class="aide">Les salons apparaissent sur le tableau de liège du bureau. Une date passée se range toute seule dans « Déjà venu à ».</p>
    <form class="ajout ajout--large" id="form-evt">
      <label>Date<input name="date_evenement" type="date" required></label>
      <label>Lieu <small>ville et département</small><input name="lieu" required maxlength="120" placeholder="Janville-en-Beauce (28)"></label>
      <label>Adresse <small>facultatif</small><input name="adresse" maxlength="200" placeholder="Salle des fêtes, place de la Mairie"></label>
      <button class="btn">Ajouter</button>
    </form>
    <h2>À venir</h2><ul class="lignes" id="avenir"></ul>
    <h2>Passés</h2><ul class="lignes lignes--passees" id="passes"></ul>`;

  const ligne = (e) => {
    const li = document.createElement('li');
    li.className = 'ligne ligne--evt';
    li.innerHTML = `
      <input type="date" value="${e.date_evenement}" aria-label="Date">
      <input value="${echapper(e.lieu)}" aria-label="Lieu" maxlength="120">
      <input value="${echapper(e.adresse || '')}" aria-label="Adresse" placeholder="Adresse (facultatif)" maxlength="200">
      <button class="lien lien--danger">Supprimer</button>`;
    const [date, lieu, adresse] = li.querySelectorAll('input');
    const enregistrer = async () => {
      if (!date.value || !lieu.value.trim()) return;
      const { error: e1 } = await sb.from('evenements').update({ date_evenement: date.value, lieu: lieu.value.trim(), adresse: adresse.value.trim() || null }).eq('id', e.id);
      toast(e1 ? erreurLisible(e1) : 'Enregistré.', e1 ? 'erreur' : 'ok');
    };
    [date, lieu, adresse].forEach((c) => c.addEventListener('change', enregistrer));
    li.querySelector('button').addEventListener('click', async () => {
      if (!(await confirmer(`Supprimer le salon du ${dateFr(e.date_evenement)} à ${e.lieu} ?`, { oui: 'Supprimer', danger: true }))) return;
      const { error: e2 } = await sb.from('evenements').delete().eq('id', e.id);
      if (e2) { toast(erreurLisible(e2), 'erreur'); return; }
      li.remove(); toast('Salon supprimé.');
    });
    return li;
  };
  const remplir = (id, liste, vide) => {
    const ul = vue.querySelector(id);
    if (!liste.length) ul.innerHTML = `<li class="vide">${vide}</li>`;
    else ul.append(...liste.map(ligne));
  };
  remplir('#avenir', avenir, 'Aucun salon à venir.');
  remplir('#passes', passes, 'Aucun salon passé.');

  vue.querySelector('#form-evt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const { error: e3 } = await sb.from('evenements').insert({ date_evenement: f.date_evenement.value, lieu: f.lieu.value.trim(), adresse: f.adresse.value.trim() || null });
    if (e3) { toast(erreurLisible(e3), 'erreur'); return; }
    toast('Salon ajouté.');
    vueEvenements(ctx);
  });
}

/* ---------- Presse ---------- */
export async function vuePresse(ctx) {
  const { sb, vue } = ctx;
  const { data: articles, error } = await sb.from('presse').select('id, media, titre, extrait, annee, date_article, url, a_la_une');
  if (error) throw error;
  articles.sort((a, b) => (b.date_article || `${b.annee}-01-01`).localeCompare(a.date_article || `${a.annee}-01-01`));

  vue.innerHTML = `
    <h1>Presse</h1>
    <p class="aide">Les articles apparaissent dans le journal du bureau. Celui « à la une » ouvre le journal avec son titre et son extrait.</p>
    <form class="ajout ajout--colonne" id="form-article">
      <div class="deux">
        <label>Journal ou média<input name="media" required maxlength="120" placeholder="L’Écho Républicain"></label>
        <label>Lien vers l’article<input name="url" type="url" required placeholder="https://…"></label>
      </div>
      <label>Titre de l’article <small>facultatif</small><input name="titre" maxlength="250"></label>
      <label>Extrait <small>facultatif, une ou deux phrases</small><textarea name="extrait" rows="2" maxlength="500"></textarea></label>
      <div class="deux">
        <label>Année<input name="annee" type="number" min="1990" max="2100" required value="${new Date().getFullYear()}"></label>
        <label>Date précise <small>facultatif</small><input name="date_article" type="date"></label>
      </div>
      <label class="interrupteur"><input type="checkbox" name="a_la_une"> <span>À la une du journal</span></label>
      <button class="btn">Ajouter l’article</button>
    </form>
    <ul class="lignes" id="articles"></ul>`;

  const ul = vue.querySelector('#articles');
  if (!articles.length) ul.innerHTML = '<li class="vide">Aucun article pour l’instant.</li>';
  for (const a of articles) {
    const li = document.createElement('li');
    li.className = 'ligne ligne--article';
    li.innerHTML = `
      <div>
        <p><b>${echapper(a.media)}</b> · ${a.date_article ? dateFr(a.date_article) : a.annee} ${a.a_la_une ? '<span class="badge badge--ok">À la une</span>' : ''}</p>
        ${a.titre ? `<p>${echapper(a.titre)}</p>` : ''}
        <p class="petit"><a href="${echapper(/^https?:/.test(a.url) ? a.url : '../' + a.url)}" target="_blank" rel="noopener">${echapper(a.url)}</a></p>
      </div>
      <span class="ligne__actions">
        <button class="lien" data-a="modifier">Modifier</button>
        ${a.a_la_une ? '' : '<button class="lien" data-a="une">Mettre à la une</button>'}
        <button class="lien lien--danger" data-a="suppr">Supprimer</button>
      </span>`;
    li.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-a]')?.dataset.a;
      if (action === 'modifier') { modifierArticle(ctx, li, a); return; }
      if (action === 'une') {
        const r1 = await sb.from('presse').update({ a_la_une: false }).eq('a_la_une', true);
        const r2 = await sb.from('presse').update({ a_la_une: true }).eq('id', a.id);
        const err = r1.error || r2.error;
        toast(err ? erreurLisible(err) : 'Article mis à la une.', err ? 'erreur' : 'ok');
        vuePresse(ctx);
      }
      if (action === 'suppr') {
        if (!(await confirmer(`Supprimer l’article de ${a.media} ?`, { oui: 'Supprimer', danger: true }))) return;
        const { error: e2 } = await sb.from('presse').delete().eq('id', a.id);
        if (e2) { toast(erreurLisible(e2), 'erreur'); return; }
        toast('Article supprimé.'); vuePresse(ctx);
      }
    });
    ul.append(li);
  }

  vue.querySelector('#form-article').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.reportValidity()) return;
    const d = Object.fromEntries(new FormData(f));
    if (f.a_la_une.checked) await sb.from('presse').update({ a_la_une: false }).eq('a_la_une', true);
    const { error: e3 } = await sb.from('presse').insert({
      media: d.media.trim(), url: d.url.trim(), titre: d.titre.trim() || null, extrait: d.extrait.trim() || null,
      annee: parseInt(d.annee, 10), date_article: d.date_article || null, a_la_une: f.a_la_une.checked,
    });
    if (e3) { toast(erreurLisible(e3), 'erreur'); return; }
    toast('Article ajouté.');
    vuePresse(ctx);
  });
}

// Modifier un article déjà publié : la ligne devient un formulaire, sur place.
function modifierArticle(ctx, li, a) {
  const { sb } = ctx;
  li.className = 'ligne ligne--edition';
  li.innerHTML = `
    <form class="ajout ajout--colonne">
      <div class="deux">
        <label>Journal ou média<input name="media" required maxlength="120" value="${echapper(a.media)}"></label>
        <label>Lien vers l’article<input name="url" required value="${echapper(a.url)}"></label>
      </div>
      <label>Titre de l’article <small>facultatif</small><input name="titre" maxlength="250" value="${echapper(a.titre || '')}"></label>
      <label>Extrait <small>facultatif, une ou deux phrases</small><textarea name="extrait" rows="2" maxlength="500">${echapper(a.extrait || '')}</textarea></label>
      <div class="deux">
        <label>Année<input name="annee" type="number" min="1990" max="2100" required value="${a.annee}"></label>
        <label>Date précise <small>facultatif</small><input name="date_article" type="date" value="${a.date_article || ''}"></label>
      </div>
      <div class="actions">
        <button class="btn">Enregistrer</button>
        <button class="btn btn--clair" type="button" data-annuler>Annuler</button>
      </div>
    </form>`;
  const f = li.querySelector('form');
  f.media.focus();
  li.querySelector('[data-annuler]').addEventListener('click', () => vuePresse(ctx));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const d = Object.fromEntries(new FormData(f));
    const { error } = await sb.from('presse').update({
      media: d.media.trim(), url: d.url.trim(), titre: d.titre.trim() || null, extrait: d.extrait.trim() || null,
      annee: parseInt(d.annee, 10), date_article: d.date_article || null,
    }).eq('id', a.id);
    if (error) { toast(erreurLisible(error), 'erreur'); return; }
    toast('Article modifié.');
    vuePresse(ctx);
  });
}
