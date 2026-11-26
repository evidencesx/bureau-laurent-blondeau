// panier.js — le panier et la commande.
// 1. On relit en base le prix et le stock de chaque livre (le panier du navigateur peut être ancien).
// 2. À la validation : creer_commande() enregistre la commande avec les vrais prix et réserve le stock,
//    puis la fonction serveur creer-paiement ouvre la page de paiement Stripe.
// 3. Au retour d'un paiement abandonné (?paiement=annule), on libère tout de suite le stock réservé.

import { baseConfiguree, base, fonction, euros } from '../client.js';
import { LIVRAISON_CENTS } from '../config.js';

const $ = (id) => document.getElementById(id);
const Panier = window.Panier;
const params = new URLSearchParams(location.search);

function dire(texte, type = 'ok') {
  const s = $('statut-panier');
  s.textContent = texte;
  s.className = `formulaire__statut formulaire__statut--${type}`;
  s.hidden = false;
  s.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function afficher() {
  const lignes = Panier.lire();
  $('panier-vide').hidden = lignes.length > 0;
  $('panier-plein').hidden = lignes.length === 0;
  const ul = $('lignes');
  ul.replaceChildren(...lignes.map((l, i) => {
    const li = document.createElement('li');
    li.className = 'panier__ligne';
    li.innerHTML = `
      <img class="panier__couv" alt="" loading="lazy">
      <div class="panier__infos">
        <p class="panier__titre"></p>
        <p class="panier__prix"></p>
        <div class="panier__quantite" role="group" aria-label="Quantité">
          <button type="button" data-action="moins" aria-label="Un de moins">−</button>
          <span aria-live="polite"></span>
          <button type="button" data-action="plus" aria-label="Un de plus">+</button>
          <button type="button" class="panier__retirer" data-action="retirer">Retirer</button>
        </div>
        <label class="panier__dedicace">Dédicace <small>facultatif : à qui, et un mot si vous le souhaitez</small>
          <textarea rows="2" maxlength="300" placeholder="Pour Marie, avec toute mon amitié…"></textarea></label>
      </div>`;
    li.querySelector('img').src = l.couverture || 'img/couverture-absente.svg';
    li.querySelector('.panier__titre').textContent = l.titre;
    li.querySelector('.panier__prix').textContent = euros(l.prix_cents) + (l.quantite > 1 ? ` × ${l.quantite} = ${euros(l.prix_cents * l.quantite)}` : '');
    li.querySelector('.panier__quantite span').textContent = l.quantite;
    li.querySelector('[data-action="plus"]').disabled = l.quantite >= Math.min(l.stock || 1, 20);
    const ded = li.querySelector('textarea');
    ded.value = l.dedicace || '';
    ded.addEventListener('change', () => { const p = Panier.lire(); if (p[i]) { p[i].dedicace = ded.value; Panier.ecrire(p); } });
    li.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      const p = Panier.lire();
      if (action === 'plus') p[i].quantite = Math.min(p[i].quantite + 1, p[i].stock || 1, 20);
      if (action === 'moins') p[i].quantite -= 1;
      if (action === 'retirer' || p[i].quantite <= 0) p.splice(i, 1);
      Panier.ecrire(p);
      afficher();
    });
    return li;
  }));
  const sousTotal = lignes.reduce((s, l) => s + l.prix_cents * l.quantite, 0);
  $('sous-total').textContent = euros(sousTotal);
  $('livraison').textContent = euros(LIVRAISON_CENTS);
  $('total').textContent = euros(sousTotal + LIVRAISON_CENTS);
  $('bouton-payer').textContent = `Payer ${euros(sousTotal + LIVRAISON_CENTS)}`;
}

// Les prix et stocks réels : un livre retiré de la vente ou épuisé quitte le panier, avec un mot.
async function actualiser() {
  const lignes = Panier.lire();
  if (!lignes.length || !baseConfiguree) return;
  try {
    const sb = await base();
    const { data, error } = await sb.from('livres').select('id, titre, prix_cents, stock').in('id', lignes.map((l) => l.id));
    if (error) throw error;
    const retires = [];
    const p = lignes.filter((l) => {
      const v = data.find((d) => d.id === l.id);
      if (!v || v.stock <= 0) { retires.push(l.titre); return false; }
      Object.assign(l, { titre: v.titre, prix_cents: v.prix_cents, stock: v.stock, quantite: Math.min(l.quantite, v.stock) });
      return true;
    });
    Panier.ecrire(p);
    if (retires.length) dire(`Plus disponible pour le moment, retiré du panier : ${retires.join(', ')}.`, 'erreur');
  } catch (err) {
    console.warn('panier : actualisation impossible', err);
  }
  afficher();
}

// Retour d'un paiement abandonné : le stock réservé est rendu tout de suite.
async function retourAnnule() {
  if (params.get('paiement') !== 'annule' || !baseConfiguree) return;
  try {
    const sb = await base();
    await sb.rpc('annuler_paiement_client', { p_numero: params.get('commande'), p_jeton: params.get('jeton') });
  } catch (err) { console.warn('panier : annulation', err); }
  history.replaceState(null, '', 'panier.html');
  dire('Paiement annulé. Votre panier est intact, vous pouvez réessayer quand vous voulez.');
}

$('form-commande').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  if (!form.reportValidity()) return;
  if (!baseConfiguree) { dire('La boutique n’est pas encore ouverte.', 'erreur'); return; }
  const bouton = $('bouton-payer');
  const texte = bouton.textContent;
  bouton.disabled = true;
  bouton.textContent = 'Préparation du paiement…';
  const d = Object.fromEntries(new FormData(form));
  try {
    const sb = await base();
    const { data: commande, error } = await sb.rpc('creer_commande', {
      p_client: { nom: d.nom, email: d.email, telephone: d.telephone, adresse_ligne1: d.adresse_ligne1, adresse_ligne2: d.adresse_ligne2, code_postal: d.code_postal, ville: d.ville },
      p_lignes: Panier.lire().map((l) => ({ livre_id: l.id, quantite: l.quantite, dedicace: l.dedicace || '' })),
    });
    if (error) throw error;
    const { url } = await fonction('creer-paiement', { numero: commande.numero, email: d.email });
    location.href = url;
  } catch (err) {
    const m = String(err.message || '');
    dire(m.includes('métropolitaine') ? 'Désolé, la livraison se fait en France métropolitaine uniquement : vérifiez le code postal.'
      : m.includes('Stock insuffisant') ? `${m.replace('Stock insuffisant pour', 'Il ne reste plus assez d’exemplaires de')}. Ajustez la quantité.`
        : 'La commande n’a pas pu être préparée. Réessayez dans un instant, ou écrivez à l’auteur.', 'erreur');
    bouton.disabled = false;
    bouton.textContent = texte;
    if (m.includes('Stock')) actualiser();
  }
});

document.addEventListener('panier:change', () => { /* le compteur du menu suit, l'affichage est géré ici */ });
afficher();
retourAnnule();
actualiser();
