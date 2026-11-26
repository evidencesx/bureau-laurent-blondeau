// app.js — l'administration : vérifie la connexion, puis affiche la rubrique demandée (#livres, #styles…).
// Toutes les écritures passent par la base avec le jeton de Laurent ; ce sont les règles de la base
// (est_admin) qui autorisent, pas cette page.

import { baseConfiguree, base } from '../client.js';
import { toast, erreurLisible, dateFr, euros, echapper } from './outils.js';
import { listeLivres, ficheLivre } from './livres.js';
import { vueStyles, vueEvenements, vuePresse } from './listes.js';
import { vueCommandes } from './commandes.js';
import { vueMessages } from './messages.js';

const vue = document.getElementById('vue');

async function session(sb) {
  const { data: { session: s } } = await sb.auth.getSession();
  if (s || !location.hash.includes('access_token')) return s;
  // Retour du lien magique : la session arrive un instant après le chargement.
  return new Promise((ok) => {
    const minuteur = setTimeout(() => ok(null), 6000);
    sb.auth.onAuthStateChange((_e, s2) => { if (s2) { clearTimeout(minuteur); ok(s2); } });
  });
}

async function pastilles(ctx) {
  const { sb } = ctx;
  const [c, m] = await Promise.all([
    sb.from('commandes').select('id', { count: 'exact', head: true }).eq('paiement_statut', 'paye').in('statut', ['nouvelle', 'en_preparation']),
    sb.from('messages_contact').select('id', { count: 'exact', head: true }).eq('statut', 'nouveau'),
  ]);
  for (const [id, r] of [['pastille-commandes', c], ['pastille-messages', m]]) {
    const el = document.getElementById(id);
    el.textContent = r.count || '';
    el.hidden = !r.count;
  }
  return { aExpedier: c.count || 0, nouveauxMessages: m.count || 0 };
}

async function accueil(ctx) {
  const { sb } = ctx;
  const [comptes, livres, prochain] = await Promise.all([
    pastilles(ctx),
    sb.from('livres').select('id, publie, stock'),
    sb.from('evenements').select('date_evenement, lieu').gte('date_evenement', new Date().toISOString().slice(0, 10)).order('date_evenement').limit(1),
  ]);
  const enLigne = (livres.data || []).filter((l) => l.publie);
  const epuises = enLigne.filter((l) => l.stock <= 0).length;
  const p = prochain.data?.[0];
  vue.innerHTML = `
    <h1>Bonjour Laurent</h1>
    <div class="tuiles">
      <a class="tuile${comptes.aExpedier ? ' tuile--alerte' : ''}" href="#commandes"><b>${comptes.aExpedier}</b><span>commande${comptes.aExpedier > 1 ? 's' : ''} à expédier</span></a>
      <a class="tuile${comptes.nouveauxMessages ? ' tuile--alerte' : ''}" href="#messages"><b>${comptes.nouveauxMessages}</b><span>nouveau${comptes.nouveauxMessages > 1 ? 'x' : ''} message${comptes.nouveauxMessages > 1 ? 's' : ''}</span></a>
      <a class="tuile" href="#livres"><b>${enLigne.length}</b><span>livre${enLigne.length > 1 ? 's' : ''} en ligne${epuises ? `, dont ${epuises} sans stock` : ''}</span></a>
      <a class="tuile" href="#evenements"><b>${p ? dateFr(p.date_evenement, { day: 'numeric', month: 'short' }) : '·'}</b><span>${p ? `prochain salon : ${echapper(p.lieu)}` : 'aucun salon à venir'}</span></a>
    </div>
    <div class="raccourcis">
      <a class="btn" href="#livre/nouveau">Ajouter un livre</a>
      <a class="btn btn--clair" href="#evenements">Ajouter un salon</a>
      <a class="btn btn--clair" href="#presse">Ajouter un article</a>
    </div>`;
}

const ROUTES = {
  accueil, livres: listeLivres, livre: ficheLivre, styles: vueStyles,
  evenements: vueEvenements, presse: vuePresse, commandes: vueCommandes, messages: vueMessages,
};

async function afficher(ctx) {
  const [nom, param] = (location.hash.slice(1) || 'accueil').split('/');
  const route = ROUTES[nom] ? nom : 'accueil';
  document.querySelectorAll('.onglets a').forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${route}` || (route === 'livre' && a.getAttribute('href') === '#livres')));
  vue.innerHTML = '<p class="chargement">Chargement…</p>';
  try {
    await ROUTES[route](ctx, param);
  } catch (err) {
    console.error(err);
    vue.innerHTML = `<p class="message message--erreur">${echapper(erreurLisible(err))}</p>`;
  }
  window.scrollTo(0, 0);
}

(async () => {
  if (!baseConfiguree) { vue.innerHTML = '<p class="message message--erreur">La base n’est pas encore configurée (js/config.js).</p>'; return; }
  const sb = await base();
  const s = await session(sb);
  if (!s) { location.replace('connexion.html'); return; }
  history.replaceState(null, '', location.pathname + (location.hash.includes('access_token') ? '' : location.hash));
  document.getElementById('compte').textContent = s.user.email;
  document.getElementById('deconnexion').addEventListener('click', async () => { await sb.auth.signOut(); location.replace('connexion.html'); });

  const { data: estAdmin } = await sb.rpc('est_admin');
  if (!estAdmin) {
    vue.innerHTML = `<p class="message message--erreur">L’adresse ${echapper(s.user.email)} n’a pas accès à l’administration.</p>`;
    return;
  }
  const ctx = { sb, vue, session: s, toast, euros, rafraichirPastilles: () => pastilles(ctx).catch(() => {}) };
  window.addEventListener('hashchange', () => afficher(ctx));
  afficher(ctx);
  ctx.rafraichirPastilles();
})().catch((err) => {
  console.error(err);
  vue.innerHTML = `<p class="message message--erreur">${echapper(erreurLisible(err))}</p>`;
});
