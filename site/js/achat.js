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
    ajouter: function (livre, nombre) {
      var n = Math.max(1, nombre || 1);
      var max = Math.min(livre.stock || 20, 20);
      var p = lire();
      var ligne = p.filter(function (l) { return l.id === livre.id; })[0];
      if (ligne) { ligne.quantite = Math.min(ligne.quantite + n, max); ligne.stock = livre.stock; }
      else p.push({ id: livre.id, slug: livre.slug, titre: livre.titre, prix_cents: livre.prix_cents, couverture: livre.couverture, stock: livre.stock, quantite: Math.min(n, max), dedicace: '' });
      ecrire(p);
    },
    vider: function () { ecrire([]); },
  };
  compter();
  window.addEventListener('storage', function (e) { if (e.key === CLE) compter(); }); // panier modifié dans un autre onglet

  /* ---------- Le livre ouvert : nombre d’exemplaires, puis « Ajouter au panier » ---------- */
  var bouton = document.querySelector('.ob-ajouter');
  if (!bouton) return;
  var selecteur = document.querySelector('.ob-quantite');
  var affichage = selecteur && selecteur.querySelector('span');
  var voir = document.querySelector('.ob-voir');
  var courant = null;
  var nombre = 1;
  var minuterie = null;

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
  function dejaDans(l) {
    var ligne = lire().filter(function (x) { return x.id === l.id; })[0];
    return ligne ? ligne.quantite : 0;
  }
  function regler() {
    clearTimeout(minuterie);
    var l = courant && livreDe(courant);
    bouton.dataset.etat = '';
    if (!l || l.stock <= 0) {
      bouton.disabled = true;
      bouton.textContent = 'Bientôt disponible';
      if (selecteur) selecteur.hidden = true;
      if (voir) voir.hidden = true;
      return;
    }
    var dans = dejaDans(l);
    var reste = Math.min(l.stock, 20) - dans; // on ne propose jamais plus que le stock
    if (voir) {
      voir.hidden = dans === 0;
      voir.textContent = 'Dans votre panier : ' + dans + ' exemplaire' + (dans > 1 ? 's' : '') + ' · Voir le panier';
    }
    bouton.disabled = false;
    if (reste <= 0) {
      if (selecteur) selecteur.hidden = true;
      if (voir) voir.hidden = true;
      bouton.textContent = 'Tout le stock est dans le panier · Voir le panier';
      bouton.dataset.etat = 'dans';
      return;
    }
    nombre = Math.min(Math.max(nombre, 1), reste);
    if (selecteur) {
      selecteur.hidden = false;
      affichage.textContent = nombre;
      selecteur.querySelector('[data-q="moins"]').disabled = nombre <= 1;
      selecteur.querySelector('[data-q="plus"]').disabled = nombre >= reste;
    }
    bouton.textContent = nombre > 1 ? 'Ajouter ' + nombre + ' exemplaires' : 'Ajouter au panier';
  }
  document.addEventListener('livre:ouvert', function (e) { courant = e.detail.id; nombre = 1; regler(); });
  document.addEventListener('panier:change', regler);
  if (selecteur) selecteur.addEventListener('click', function (e) {
    var b = e.target.closest('[data-q]');
    if (!b || b.disabled) return;
    nombre += b.dataset.q === 'plus' ? 1 : -1;
    regler();
  });
  bouton.addEventListener('click', function () {
    if (bouton.dataset.etat === 'dans') { location.href = 'panier.html'; return; }
    var l = courant && livreDe(courant);
    if (!l) return;
    var n = nombre;
    nombre = 1;
    window.Panier.ajouter(l, n); // déclenche panier:change, donc regler()
    bouton.textContent = n > 1 ? n + ' exemplaires ajoutés' : 'Ajouté au panier';
    minuterie = setTimeout(regler, 1600);
  });
  // Si le livre était déjà ouvert avant le chargement de ce script (adresse directe).
  var lecteur = document.getElementById('lecteur');
  if (lecteur && lecteur.open && lecteur.dataset.livre) { courant = lecteur.dataset.livre; regler(); }
})();
