// commandes.js — les commandes : à expédier d'abord, avec les dédicaces et l'adresse.
//
// Seule une commande « payée » est à préparer : le paiement est confirmé par Stripe
// (webhook), jamais par le navigateur du client. Les remboursements se font dans
// le tableau de bord Stripe, à la main.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { euros, echapper, dateHeure, toast, erreurLisible, confirmer } from './outils.js';

const STATUTS = { nouvelle: 'Nouvelle', en_preparation: 'En préparation', expediee: 'Expédiée', livree: 'Livrée', annulee: 'Annulée' };
const PAIEMENTS = { en_attente: 'Paiement en attente', paye: 'Payée', expire: 'Paiement non abouti', echoue: 'Paiement refusé', annule_client: 'Abandonnée par le client' };

export async function vueCommandes(ctx, filtre = 'a-expedier') {
  const { sb, vue } = ctx;
  let requete = sb.from('commandes')
    .select('id, numero, created_at, paye_le, client_nom, client_email, client_telephone, adresse_ligne1, adresse_ligne2, code_postal, ville, sous_total_cents, livraison_cents, total_cents, statut, paiement_statut, confirmation_envoyee_at, notes, lignes_commande(titre_livre, prix_unitaire_cents, quantite, dedicace, livre_id)')
    .order('created_at', { ascending: false }).limit(200);
  if (filtre === 'a-expedier') requete = requete.eq('paiement_statut', 'paye').in('statut', ['nouvelle', 'en_preparation']);
  if (filtre === 'payees') requete = requete.eq('paiement_statut', 'paye');
  const { data: commandes, error } = await requete;
  if (error) throw error;

  vue.innerHTML = `
    <h1>Commandes</h1>
    <nav class="filtres" aria-label="Filtrer">
      <a href="#commandes/a-expedier"${filtre === 'a-expedier' ? ' aria-current="page"' : ''}>À expédier</a>
      <a href="#commandes/payees"${filtre === 'payees' ? ' aria-current="page"' : ''}>Toutes les payées</a>
      <a href="#commandes/toutes"${filtre === 'toutes' ? ' aria-current="page"' : ''}>Tout, même non payées</a>
    </nav>
    <ul class="cartes" id="liste-commandes"></ul>`;
  const ul = vue.querySelector('#liste-commandes');
  if (!commandes.length) ul.innerHTML = `<li class="vide">${filtre === 'a-expedier' ? 'Rien à expédier pour le moment.' : 'Aucune commande.'}</li>`;

  for (const c of commandes) {
    const li = document.createElement('li');
    li.className = `commande commande--${c.paiement_statut}`;
    const lignes = c.lignes_commande || [];
    li.innerHTML = `
      <div class="commande__tete">
        <div><b>${echapper(c.numero)}</b> · ${dateHeure(c.created_at)}<br><span class="petit">${echapper(c.client_nom)} · ${euros(c.total_cents)}</span></div>
        <span class="badge ${c.paiement_statut === 'paye' ? 'badge--ok' : 'badge--alerte'}">${PAIEMENTS[c.paiement_statut] || c.paiement_statut}</span>
      </div>
      <ul class="commande__livres">
        ${lignes.map((l) => `<li>${echapper(l.titre_livre)}${l.quantite > 1 ? ` × ${l.quantite}` : ''} · ${euros(l.prix_unitaire_cents * l.quantite)}
          ${l.dedicace ? `<br><span class="dedicace">Dédicace : « ${echapper(l.dedicace)} »</span>` : ''}</li>`).join('')}
        <li class="petit">Livraison ${euros(c.livraison_cents)}</li>
      </ul>
      <div class="commande__adresse">
        <p class="petit">Envoyer à</p>
        <p>${[c.client_nom, c.adresse_ligne1, c.adresse_ligne2, `${c.code_postal} ${c.ville}`].filter(Boolean).map(echapper).join('<br>')}</p>
        <p class="petit"><a href="mailto:${echapper(c.client_email)}">${echapper(c.client_email)}</a>${c.client_telephone ? ` · ${echapper(c.client_telephone)}` : ''}</p>
        ${c.notes ? `<p class="message message--erreur">${echapper(c.notes)}</p>` : ''}
      </div>
      <div class="commande__actions">
        <label>Suivi
          <select ${c.paiement_statut !== 'paye' ? 'disabled' : ''}>${Object.entries(STATUTS).map(([v, t]) => `<option value="${v}"${v === c.statut ? ' selected' : ''}>${t}</option>`).join('')}</select>
        </label>
        ${c.paiement_statut === 'paye' ? `<button class="lien" data-a="confirmation">${c.confirmation_envoyee_at ? 'Renvoyer le récapitulatif au client' : '⚠ Récapitulatif non envoyé : l’envoyer'}</button>` : ''}
      </div>`;

    const choix = li.querySelector('select');
    choix?.addEventListener('change', async () => {
      const ancien = c.statut;
      if (choix.value === 'annulee') {
        const ok = await confirmer('Annuler cette commande ? Pensez à rembourser le client dans Stripe. Les livres seront remis en stock.', { oui: 'Annuler la commande', danger: true });
        if (!ok) { choix.value = ancien; return; }
        for (const l of lignes.filter((x) => x.livre_id)) {
          const { data: livre } = await sb.from('livres').select('stock').eq('id', l.livre_id).maybeSingle();
          if (livre) await sb.from('livres').update({ stock: livre.stock + l.quantite }).eq('id', l.livre_id);
        }
      }
      const { error: e1 } = await sb.from('commandes').update({ statut: choix.value }).eq('id', c.id);
      if (e1) { toast(erreurLisible(e1), 'erreur'); choix.value = ancien; return; }
      c.statut = choix.value;
      toast(`Commande ${c.numero} : ${STATUTS[c.statut].toLowerCase()}.`);
      ctx.rafraichirPastilles();
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
        b.textContent = 'Renvoyer le récapitulatif au client';
      } catch (err) {
        toast(erreurLisible(err), 'erreur');
      } finally {
        b.disabled = false;
      }
    });
    ul.append(li);
  }
}
