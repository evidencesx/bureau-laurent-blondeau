/* achat.js — le panier, gardé dans le navigateur (localStorage) jusqu'au paiement.
   - le bouton « Ajouter au panier » du livre ouvert ;
   - le compteur à côté de « Panier » dans le menu, sur toutes les pages.
   Les prix gardés ici ne servent qu'à l'affichage : la base relit les vrais prix
   à la commande (creer_commande), un prix modifié dans le navigateur ne passe pas. */
(function () {
  var CLE = 'lb-panier';

  function lire() {
    try { var p = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(p) ? p : []; }
    catch (e) { return []; }
  }
  function ecrire(p) {
    try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) { /* navigation privée stricte : panier non gardé */ }
    compter();
    document.dispatchEvent(new CustomEvent('panier:change'));
  }
  function compter() {
    var n = lire().reduce(function (s, l) { return s + l.quantite; }, 0);
    document.querySelectorAll('.menu__compte').forEach(function (c) {
      c.textContent = n;
      c.hidden = n === 0;
    });
  }

  window.Panier = {
    lire: lire,
    ecrire: ecrire,
    ajouter: function (livre) {
      var p = lire();
      var ligne = p.filter(function (l) { return l.id === livre.id; })[0];
      if (ligne) ligne.quantite = Math.min(ligne.quantite + 1, livre.stock || 20, 20);
      else p.push({ id: livre.id, slug: livre.slug, titre: livre.titre, prix_cents: livre.prix_cents, couverture: livre.couverture, stock: livre.stock, quantite: 1, dedicace: '' });
      ecrire(p);
    },
    vider: function () { ecrire([]); },
  };
  compter();
  window.addEventListener('storage', function (e) { if (e.key === CLE) compter(); }); // panier modifié dans un autre onglet

  /* ---------- Le bouton du livre ouvert ---------- */
  var bouton = document.querySelector('.ob-ajouter');
  if (!bouton) return;
  var courant = null;

  function livreDe(id) {
    var f = document.getElementById(id);
    if (!f || !f.dataset.id) return null; // contenu écrit dans la page, pas encore relié à la boutique
    var img = f.querySelector('img');
    return {
      id: f.dataset.id, slug: id, titre: f.querySelector('h3').textContent,
      prix_cents: +f.dataset.prixCents, stock: +f.dataset.stock || 0,
      couverture: img ? img.getAttribute('src') : null,
    };
  }
  function regler() {
    var l = courant && livreDe(courant);
    bouton.dataset.etat = '';
    if (!l || l.stock <= 0) {
      bouton.disabled = true;
      bouton.textContent = 'Bientôt disponible';
      return;
    }
    var dans = lire().filter(function (x) { return x.id === l.id; })[0];
    bouton.disabled = false;
    if (dans) { bouton.textContent = 'Dans le panier · Voir le panier'; bouton.dataset.etat = 'dans'; }
    else bouton.textContent = 'Ajouter au panier';
  }
  document.addEventListener('livre:ouvert', function (e) { courant = e.detail.id; regler(); });
  document.addEventListener('panier:change', regler);
  bouton.addEventListener('click', function () {
    if (bouton.dataset.etat === 'dans') { location.href = 'panier.html'; return; }
    var l = courant && livreDe(courant);
    if (!l) return;
    window.Panier.ajouter(l);
    bouton.textContent = 'Ajouté · Voir le panier';
    bouton.dataset.etat = 'dans';
  });
  // Si le livre était déjà ouvert avant le chargement de ce script (adresse directe).
  var lecteur = document.getElementById('lecteur');
  if (lecteur && lecteur.open && lecteur.dataset.livre) { courant = lecteur.dataset.livre; regler(); }
})();
