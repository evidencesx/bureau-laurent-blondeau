// commandes.js — les commandes, rangées en dossiers par étape, avec des filtres.
//
// Deux états cohabitent sur une commande et ne doivent pas être confondus :
//
//   paiement_statut  l'argent est-il arrivé ? Décidé par Stripe (webhook), jamais
//                    à la main. Une commande existe dès la saisie des coordonnées,
//                    donc avant d'être réglée.
//   statut           où en est l'envoi ? Décidé par Laurent, ici.
//
// Les dossiers d'étape ne montrent que des commandes réglées : c'est le vrai
// travail. Les paniers jamais payés ont leur propre dossier, pour ne pas noyer
// le reste. 3 mois après l’archivage (ou après un panier jamais payé), la base
// efface les données personnelles (anonymiser_commandes, tous les jours) et garde
// numéro, date, livres et montants pour la comptabilité. Les remboursements se font
// dans le tableau de bord Stripe, à la main.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { euros, echapper, dateHeure, dateFr, toast, erreurLisible, confirmer } from './outils.js';

const STATUTS = {
  nouvelle: 'Nouvelle',
  en_preparation: 'À expédier',
  expediee: 'Expédiée',
  livree: 'Livrée',
  archivee: 'Archivée',
  annulee: 'Annulée',
};
// L'étape suivante proposée en un clic, dans l'ordre normal d'une commande.
const SUITE = { nouvelle: 'en_preparation', en_preparation: 'expediee', expediee: 'livree', livree: 'archivee' };
const PAIEMENTS = { en_attente: 'Paiement en cours', paye: 'Payée', expire: 'Jamais payée', echoue: 'Paiement refusé', annule_client: 'Abandonnée par le client' };

const DOSSIERS = [
  ['nouvelle', 'Nouvelles'],
  ['en_preparation', 'À expédier'],
  ['expediee', 'Expédiées'],
  ['livree', 'Livrées'],
  ['archivee', 'Archivées'],
  ['annulee', 'Annulées'],
  ['non-payees', 'Non payées'],
  ['toutes', 'Toutes'],
];
const DOSSIERS_VALIDES = DOSSIERS.map(([d]) => d);

// Les filtres survivent au changement d'écran (on revient sur les commandes avec les mêmes réglages).
const filtres = { du: '', au: '', livre: '', paiement: '', texte: '' };

const MOIS_AVANT_EFFACEMENT = 3;
const estPayee = (c) => c.paiement_statut === 'paye';
const dossierDe = (c) => (estPayee(c) || c.statut === 'archivee' ? c.statut : 'non-payees');
const jourLocal = (iso) => new Date(iso).toLocaleDateString('sv-SE'); // AAAA-MM-JJ, comme les champs date
function dateEffacement(c) {
  const d = new Date(c.archivee_le || Date.now());
  d.setMonth(d.getMonth() + MOIS_AVANT_EFFACEMENT);
  return dateFr(d.toISOString());
}

function correspondAuxFiltres(c) {
  const jour = jourLocal(c.created_at);
  if (filtres.du && jour < filtres.du) return false;
  if (filtres.au && jour > filtres.au) return false;
  if (filtres.paiement === 'payees' && !estPayee(c)) return false;
  if (filtres.paiement === 'non-payees' && estPayee(c)) return false;
  if (filtres.livre && !(c.lignes_commande || []).some((l) => l.titre_livre === filtres.livre)) return false;
  if (filtres.texte) {
    const t = filtres.texte.toLowerCase();
    const champs = [c.numero, c.client_nom, c.client_email, c.ville, c.code_postal];
    if (!champs.some((x) => String(x || '').toLowerCase().includes(t))) return false;
  }
  return true;
}

export async function vueCommandes(ctx, param) {
  const { sb, vue } = ctx;
  const { data, error } = await sb.from('commandes')
    .select('id, numero, created_at, paye_le, archivee_le, anonymisee_le, client_nom, client_email, client_telephone, adresse_ligne1, adresse_ligne2, code_postal, ville, sous_total_cents, livraison_cents, total_cents, statut, paiement_statut, confirmation_envoyee_at, notes, lignes_commande(titre_livre, prix_unitaire_cents, quantite, dedicace, livre_id)')
    .order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  const commandes = data;

  // Ancien lien du tableau de bord (#commandes/a-expedier) : les nouvelles d'abord.
  let dossier = DOSSIERS_VALIDES.includes(param) ? param : 'nouvelle';
  const titres = [...new Set(commandes.flatMap((c) => (c.lignes_commande || []).map((l) => l.titre_livre)))].sort((a, b) => a.localeCompare(b, 'fr'));
  if (filtres.livre && !titres.includes(filtres.livre)) filtres.livre = '';

  vue.innerHTML = `
    <h1>Commandes</h1>
    <form class="filtres-generaux" id="filtres" autocomplete="off">
      <label>Du<input type="date" name="du" value="${filtres.du}"></label>
      <label>Au<input type="date" name="au" value="${filtres.au}"></label>
      <label>Livre<select name="livre"><option value="">Tous les livres</option>${titres.map((t) => `<option${t === filtres.livre ? ' selected' : ''}>${echapper(t)}</option>`).join('')}</select></label>
      <label>Paiement<select name="paiement">
        <option value="">Tous</option>
        <option value="payees"${filtres.paiement === 'payees' ? ' selected' : ''}>Payées</option>
        <option value="non-payees"${filtres.paiement === 'non-payees' ? ' selected' : ''}>Non payées</option>
      </select></label>
      <label class="filtres-generaux__texte">Recherche<input type="search" name="texte" placeholder="Nom, e-mail, n° de commande, ville" value="${echapper(filtres.texte)}"></label>
      <button type="reset" class="lien">Effacer les filtres</button>
    </form>
    <nav class="filtres" aria-label="Étape" id="dossiers">
      ${DOSSIERS.map(([d, t]) => `<button type="button" data-dossier="${d}">${t} <span class="compteur" data-compteur="${d}">0</span></button>`).join('')}
    </nav>
    <p class="petit" id="bilan"></p>
    <ul class="cartes" id="liste-commandes"></ul>`;

  const form = vue.querySelector('#filtres');
  const ul = vue.querySelector('#liste-commandes');
  const bilan = vue.querySelector('#bilan');

  function rendre() {
    const filtrees = commandes.filter(correspondAuxFiltres);
    const comptes = { toutes: filtrees.length };
    for (const c of filtrees) comptes[dossierDe(c)] = (comptes[dossierDe(c)] ?? 0) + 1;
    vue.querySelectorAll('[data-compteur]').forEach((el) => { el.textContent = comptes[el.dataset.compteur] ?? 0; });
    vue.querySelectorAll('[data-dossier]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.dossier === dossier));

    const visibles = dossier === 'toutes' ? filtrees : filtrees.filter((c) => dossierDe(c) === dossier);
    const encaisse = visibles.filter(estPayee).reduce((s, c) => s + c.total_cents, 0);
    bilan.textContent = visibles.length
      ? `${visibles.length} commande${visibles.length > 1 ? 's' : ''}${encaisse ? ` · ${euros(encaisse)} encaissés` : ''}`
      : '';
    if (dossier === 'archivee' && visibles.length) bilan.textContent += ` · ${MOIS_AVANT_EFFACEMENT} mois après l’archivage, nom, adresse, e-mail et dédicaces sont effacés ; numéro, date, livres et montants restent pour la comptabilité`;

    ul.replaceChildren(...visibles.map((c) => carte(c)));
    if (!visibles.length) {
      const filtre = Object.values(filtres).some(Boolean);
      ul.innerHTML = `<li class="vide">${filtre ? 'Aucune commande ne correspond à ces filtres dans ce dossier.' : 'Aucune commande dans ce dossier.'}</li>`;
    }
  }

  async function changerStatut(c, nouveau) {
    const ancien = c.statut;
    if (nouveau === ancien) return true;
    if (nouveau === 'annulee') {
      const ok = await confirmer('Annuler cette commande ? Pensez à rembourser le client dans Stripe. Les livres seront remis en stock.', { oui: 'Annuler la commande', danger: true });
      if (!ok) return false;
    }
    if (nouveau === 'archivee') {
      const ok = await confirmer(`Archiver la commande ${c.numero} ? Dans ${MOIS_AVANT_EFFACEMENT} mois, le nom, l’adresse, l’e-mail et les dédicaces seront effacés (le numéro, la date, les livres et les montants restent pour la comptabilité). D’ici là, vous pouvez la sortir des archives en changeant son statut.`, { oui: 'Archiver' });
      if (!ok) return false;
    }
    if (ancien === 'annulee') {
      const ok = await confirmer('Cette commande avait été annulée et ses livres remis en stock. Le stock ne sera pas retiré à nouveau : corrigez-le dans la fiche du livre si besoin.', { oui: 'Changer le statut' });
      if (!ok) return false;
    }
    if (nouveau === 'annulee') {
      for (const l of (c.lignes_commande || []).filter((x) => x.livre_id)) {
        const { data: livre } = await sb.from('livres').select('stock').eq('id', l.livre_id).maybeSingle();
        if (livre) await sb.from('livres').update({ stock: livre.stock + l.quantite }).eq('id', l.livre_id);
      }
    }
    const { data: maj, error: e1 } = await sb.from('commandes').update({ statut: nouveau }).eq('id', c.id).select('statut, archivee_le, anonymisee_le').single();
    if (e1) { toast(erreurLisible(e1), 'erreur'); return false; }
    Object.assign(c, maj);
    toast(`Commande ${c.numero} : ${STATUTS[c.statut].toLowerCase()}.`);
    ctx.rafraichirPastilles();
    rendre();
    return true;
  }

  function carte(c) {
    const li = document.createElement('li');
    li.className = `commande commande--${c.paiement_statut}`;
    const lignes = c.lignes_commande || [];
    const payee = estPayee(c);
    const effacee = Boolean(c.anonymisee_le);
    const suite = payee ? SUITE[c.statut] : null;
    li.innerHTML = `
      <div class="commande__tete">
        <div><b>${echapper(c.numero)}</b> · ${dateHeure(c.created_at)}<br><span class="petit">${effacee ? 'Client effacé' : echapper(c.client_nom)} · ${euros(c.total_cents)}</span></div>
        <div class="commande__badges">
          ${payee ? `<span class="badge badge--etape" data-statut="${c.statut}">${STATUTS[c.statut] || c.statut}</span>` : ''}
          <span class="badge ${payee ? 'badge--ok' : 'badge--alerte'}">${PAIEMENTS[c.paiement_statut] || c.paiement_statut}</span>
        </div>
      </div>
      <ul class="commande__livres">
        ${lignes.map((l) => `<li>${echapper(l.titre_livre)}${l.quantite > 1 ? ` × ${l.quantite}` : ''} · ${euros(l.prix_unitaire_cents * l.quantite)}
          ${l.dedicace ? `<br><span class="dedicace">Dédicace : « ${echapper(l.dedicace)} »</span>` : ''}</li>`).join('')}
        <li class="petit">Livraison ${euros(c.livraison_cents)}</li>
      </ul>
      ${effacee ? '' : `<div class="commande__adresse">
        <p class="petit">Envoyer à</p>
        <p>${[c.client_nom, c.adresse_ligne1, c.adresse_ligne2, `${c.code_postal} ${c.ville}`].filter(Boolean).map(echapper).join('<br>')}</p>
        <p class="petit"><a href="mailto:${echapper(c.client_email)}">${echapper(c.client_email)}</a>${c.client_telephone ? ` · ${echapper(c.client_telephone)}` : ''}</p>
        ${c.notes ? `<p class="message message--erreur">${echapper(c.notes)}</p>` : ''}
      </div>`}
      ${c.anonymisee_le ? `<p class="petit commande__plein">Données personnelles effacées le ${dateFr(c.anonymisee_le)}</p>`
        : c.statut === 'archivee' ? `<p class="petit commande__plein">Archivée le ${dateFr(c.archivee_le || new Date().toISOString())} · données personnelles effacées le ${dateEffacement(c)}</p>` : ''}
      <div class="commande__actions">
        ${payee ? `<label>Statut
          <select>${Object.entries(STATUTS).map(([v, t]) => `<option value="${v}"${v === c.statut ? ' selected' : ''}>${t}</option>`).join('')}</select>
        </label>` : '<p class="petit">Pas de suivi tant que le paiement n’est pas arrivé.</p>'}
        ${suite ? `<button class="btn" data-a="suite">Passer à « ${STATUTS[suite]} »</button>` : ''}
        ${payee && !effacee ? `<button class="lien" data-a="confirmation">${c.confirmation_envoyee_at ? 'Renvoyer le récapitulatif au client' : '⚠ Récapitulatif non envoyé : l’envoyer'}</button>` : ''}
      </div>`;

    const choix = li.querySelector('select');
    choix?.addEventListener('change', async () => {
      const ok = await changerStatut(c, choix.value);
      if (!ok) choix.value = c.statut;
    });
    li.querySelector('[data-a="suite"]')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      changerStatut(c, suite).finally(() => { b.disabled = false; });
    });

    li.querySelector('[data-a="confirmation"]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        // Appel avec le jeton de l'administrateur : la fonction vérifie qu'il est bien admin.
        const r = await fetch(`${SUPABASE_URL}/functions/v1/envoyer-confirmation`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${ctx.session.access_token}` },
          body: JSON.stringify({ commande_id: c.id, forcer: true }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erreur || `Erreur ${r.status}`);
        toast('Récapitulatif envoyé au client.');
        c.confirmation_envoyee_at = new Date().toISOString();
        b.textContent = 'Renvoyer le récapitulatif au client';
      } catch (err) {
        toast(erreurLisible(err), 'erreur');
      } finally {
        b.disabled = false;
      }
    });
    return li;
  }

  vue.querySelector('#dossiers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dossier]');
    if (!b) return;
    dossier = b.dataset.dossier;
    history.replaceState(null, '', `#commandes/${dossier}`);
    rendre();
  });
  form.addEventListener('input', () => {
    const f = new FormData(form);
    for (const k of Object.keys(filtres)) filtres[k] = String(f.get(k) || '').trim();
    rendre();
  });
  form.addEventListener('reset', () => {
    for (const k of Object.keys(filtres)) filtres[k] = '';
    setTimeout(rendre); // après la remise à zéro des champs par le navigateur
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  rendre();
}
