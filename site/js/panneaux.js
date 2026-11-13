/* Le tableau des salons et le journal de la presse.
   Au clic sur l'objet du bureau (ou sur le menu), il quitte sa place et vient vers nous en grand ;
   le journal, lui, arrive plié puis se déplie. Adresses directes : #evenements et #presse. */
(function () {
  var moinsDeMouvement = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var courbe = 'cubic-bezier(.22,.9,.24,1)';

  /* ---------- Les dates du tableau : à venir d'abord, les passées rangées à part ---------- */
  var liste = document.querySelector('.liege__notes');
  if (liste) {
    var aujourdhui = new Date();
    var jour = aujourdhui.getFullYear() + '-' + String(aujourdhui.getMonth() + 1).padStart(2, '0') + '-' + String(aujourdhui.getDate()).padStart(2, '0');
    var dates = Array.prototype.slice.call(liste.children).sort(function (a, b) { return a.dataset.date < b.dataset.date ? -1 : 1; });
    var passees = document.querySelector('.liege__passes');
    var avenir = [];
    dates.forEach(function (li) {
      if (li.dataset.date < jour) {
        passees.querySelector('ol').appendChild(li);
        passees.hidden = false;
      } else {
        liste.appendChild(li);
        avenir.push(li);
      }
    });
    if (!avenir.length) {
      var vide = document.createElement('li');
      vide.className = 'liege__vide';
      vide.textContent = 'Les prochaines dates seront bientôt affichées.';
      liste.appendChild(vide);
    }
    // Sur le bureau, le petit tableau montre les deux prochaines dates.
    var mini = document.querySelector('.tableau__notes');
    if (mini) avenir.slice(0, 2).forEach(function (li) {
      var fiche = document.createElement('span');
      fiche.className = 'tableau__fiche';
      var quand = document.createElement('b');
      var mois = { janvier: 'janv.', février: 'févr.', juillet: 'juil.', septembre: 'sept.', octobre: 'oct.', novembre: 'nov.', décembre: 'déc.' };
      quand.textContent = li.querySelector('time').textContent.replace(/ \d{4}$/, '').replace(/[a-zéû]+$/, function (m) { return mois[m] || m; });
      fiche.appendChild(quand);
      fiche.appendChild(document.createTextNode(li.lastChild.textContent.trim().replace(/ \(\d+\)$/, '')));
      mini.appendChild(fiche);
    });
  }

  var panneaux = {};
  document.querySelectorAll('dialog.panneau').forEach(function (d) { panneaux[d.id] = d; });
  if (!Object.keys(panneaux).length || typeof HTMLDialogElement !== 'function') return; // sans <dialog> : les liens restent de simples ancres

  var ouvert = null; // { id, dialog, source, depuisHistorique }
  var occupe = false;

  function animer(el, images, duree, easing) {
    return el.animate(images, { duration: moinsDeMouvement ? 0 : duree, easing: easing || courbe, fill: 'both' }).finished;
  }
  function toutArreter(d) {
    d.querySelectorAll('*').forEach(function (el) { el.getAnimations().forEach(function (a) { a.cancel(); }); });
  }

  /* L'objet du bureau d'où part le panneau, s'il est visible à l'écran. */
  function sourceDe(id) {
    var el = document.querySelector('.vue--bureau [data-panneau="' + id + '"]:not(.plaque)');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var visible = r.width > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
    var camera = document.querySelector('.camera');
    if (camera && camera.classList.contains('vue-biblio')) visible = false;
    return visible ? el : null;
  }

  /* Transformation qui pose l'objet en grand exactement sur l'objet du bureau. */
  function depart(objet, source, cible) {
    var o = (cible || objet).getBoundingClientRect();
    if (!source) return 'translate(0px, 40px) scale(.85)';
    var r = source.getBoundingClientRect();
    var ox = o.left + o.width / 2, oy = o.top + o.height / 2;
    var dx = r.left + r.width / 2 - ox, dy = r.top + r.height / 2 - oy;
    return 'translate(' + dx + 'px, ' + dy + 'px) scale(' + r.width / o.width + ', ' + r.height / o.height + ')';
  }

  function ouvrir(id, sansHistorique) {
    var d = panneaux[id];
    if (!d || occupe || ouvert) return;
    occupe = true;
    var source = sourceDe(id);
    var objet = d.querySelector('.panneau__objet');
    var voile = d.querySelector('.panneau__voile');
    var fermer = d.querySelector('.panneau__fermer');
    var bas = d.querySelector('.gazette__bas');
    toutArreter(d);
    d.showModal();
    fermer.focus({ preventScroll: true });
    ouvert = { id: id, dialog: d, source: source, depuisHistorique: !!sansHistorique };
    if (!sansHistorique) history.pushState({ panneau: id }, '', '#' + id);

    animer(voile, [{ opacity: 0 }, { opacity: 1 }], 550, 'ease');
    animer(fermer, [{ opacity: 0 }, { opacity: 1 }], 400, 'ease');

    var vol;
    if (bas) {
      // Le journal voyage plié : seule la moitié haute vole depuis la pile, puis le bas se déplie.
      animer(bas, [{ transform: 'rotateX(-180deg)' }, { transform: 'rotateX(-180deg)' }], 1);
      var haut = d.querySelector('.gazette__haut');
      var de = depart(objet, source, haut);
      if (source) source.classList.add('journaux--pris');
      vol = animer(objet, [{ transform: de + ' rotate(-6deg)' }, { transform: 'none' }], 800).then(function () {
        return animer(bas, [{ transform: 'rotateX(-180deg)' }, { transform: 'rotateX(0deg)' }], 1000, 'cubic-bezier(.45,.05,.2,1)');
      });
    } else {
      if (source) source.style.visibility = 'hidden';
      vol = animer(objet, [{ transform: depart(objet, source) }, { transform: 'none' }], 900);
    }
    vol.then(function () { occupe = false; });
  }

  function refermer(depuisHistorique) {
    if (occupe || !ouvert) return;
    occupe = true;
    var etat = ouvert, d = etat.dialog;
    var objet = d.querySelector('.panneau__objet');
    var voile = d.querySelector('.panneau__voile');
    var fermer = d.querySelector('.panneau__fermer');
    var bas = d.querySelector('.gazette__bas');
    var pliage = bas ? animer(bas, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-180deg)' }], 750, 'cubic-bezier(.45,.05,.2,1)') : Promise.resolve();
    pliage.then(function () {
      var vers;
      if (etat.source) etat.source.style.visibility = '';
      vers = depart(objet, sourceDe(etat.id) ? etat.source : null, bas ? d.querySelector('.gazette__haut') : null);
      if (etat.source && !bas) etat.source.style.visibility = 'hidden';
      animer(voile, [{ opacity: 1 }, { opacity: 0 }], 550, 'ease');
      animer(fermer, [{ opacity: 1 }, { opacity: 0 }], 200, 'ease');
      return animer(objet, [{ transform: 'none' }, { transform: vers + (bas ? ' rotate(-6deg)' : '') }], 650);
    }).then(function () {
      if (etat.source) { etat.source.style.visibility = ''; etat.source.classList.remove('journaux--pris'); }
      d.close();
      toutArreter(d);
      ouvert = null;
      occupe = false;
      if (!depuisHistorique) {
        if (etat.depuisHistorique) history.replaceState(null, '', location.pathname + location.search);
        else history.back();
      }
    });
  }

  /* ---------- Déclencheurs ---------- */
  document.addEventListener('click', function (e) {
    var lien = e.target.closest('[data-panneau]');
    if (!lien || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    ouvrir(lien.dataset.panneau);
  });
  Object.keys(panneaux).forEach(function (id) {
    var d = panneaux[id];
    d.querySelector('.panneau__fermer').addEventListener('click', function () { refermer(false); });
    d.addEventListener('cancel', function (e) { e.preventDefault(); refermer(false); });
    d.addEventListener('click', function (e) { if (!e.target.closest('.panneau__objet, .panneau__fermer')) refermer(false); });
  });
  window.addEventListener('popstate', function () {
    var id = location.hash.slice(1);
    if (ouvert && ouvert.id !== id) refermer(true);
    else if (!ouvert && panneaux[id]) ouvrir(id, true);
  });

  /* Adresse directe (#evenements, #presse) : le panneau s'ouvre à l'arrivée. */
  var demande = location.hash.slice(1);
  if (panneaux[demande]) {
    window.scrollTo(0, 0);
    window.addEventListener('load', function () { window.scrollTo(0, 0); ouvrir(demande, true); });
  }
})();
