/* Le livre ouvert : il quitte sa place, vient au centre, grandit, puis sa couverture s'ouvre.
   Le contenu est lu dans les fiches du catalogue : une seule source de texte, dans la page HTML. */
(function () {
  var lecteur = document.getElementById('lecteur');
  if (!lecteur || typeof lecteur.showModal !== 'function') return; // navigateur trop ancien : les liens mènent à la fiche

  var moinsDeMouvement = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ob = lecteur.querySelector('.ob');
  var decale = lecteur.querySelector('.ob-decale');
  var couv = lecteur.querySelector('.ob-couv');
  var face = lecteur.querySelector('.ob-face');
  var voile = lecteur.querySelector('.lecteur__voile');
  var fermer = lecteur.querySelector('.lecteur__fermer');
  var pageDroite = lecteur.querySelector('.ob-page--droite');
  var tetes = lecteur.querySelectorAll('.ob-tete');
  var corps = lecteur.querySelector('.ob-corps');
  var prix = lecteur.querySelector('.ob-prix');

  var ouvert = null; // { id, source, ratio, simple, largeur }
  var occupe = false;

  var courbe = 'cubic-bezier(.22,.9,.24,1)';
  var courbePage = 'cubic-bezier(.45,.05,.2,1)';
  function animer(el, images, duree, easing) {
    return el.animate(images, {
      duration: moinsDeMouvement ? 0 : duree,
      easing: easing || courbe,
      fill: 'both'
    }).finished;
  }
  function toutArreter() {
    [ob, decale, couv, voile, fermer].forEach(function (el) {
      el.getAnimations().forEach(function (a) { a.cancel(); });
    });
  }

  function remplir(fiche) {
    tetes.forEach(function (tete) {
      tete.textContent = '';
      ['.etiquette', 'h3', '.accroche', '.meta'].forEach(function (sel) {
        var modele = fiche.querySelector(sel);
        if (!modele) return; // tous les livres n'ont pas d'ISBN renseigné
        var el =document.createElement(sel === 'h3' ? 'h2' : 'p');
        if (sel !== 'h3') el.className = sel.slice(1);
        el.textContent = modele.textContent;
        tete.appendChild(el);
      });
    });
    corps.textContent = '';
    corps.appendChild(fiche.querySelector('.resume').cloneNode(true));
    prix.textContent = fiche.querySelector('.prix').textContent;
    face.src = fiche.querySelector('img').currentSrc || fiche.querySelector('img').src;
    face.alt = 'Couverture de ' + fiche.querySelector('h3').textContent;
    lecteur.setAttribute('aria-label', fiche.querySelector('h3').textContent);
    lecteur.style.setProperty('--light', getComputedStyle(fiche).getPropertyValue('--light'));
  }

  /* Taille du livre ouvert : deux pages si l'écran le permet, une seule sinon. */
  function mesurer(ratio) {
    var lv = window.innerWidth, hv = window.innerHeight;
    var ph = Math.min(hv - 126, 780); // 63 px en haut et en bas : le bouton Refermer reste dégagé
    var pw = ph * ratio;
    var simple = false;
    if (pw * 2 + 55 > lv) {
      pw = (lv - 55) / 2;
      ph = pw / ratio;
      if (pw < 280) { // trop étroit pour deux pages lisibles
        simple = true;
        pw = Math.min(lv - 26, (hv - 89) * ratio, 520);
        ph = pw / ratio;
        if (ph < hv - 144) { ph = Math.min(hv - 89, pw * 1.7); } // on garde de la place pour le texte
      }
    }
    lecteur.classList.toggle('lecteur--simple', simple);
    lecteur.style.setProperty('--pw', pw + 'px');
    lecteur.style.setProperty('--ph', ph + 'px');
    return { pw: pw, ph: ph, simple: simple };
  }

  /* D'où part le livre : sa position réelle à l'écran, ou le centre s'il n'est pas visible. */
  function depart(source, pw, ph) {
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var image = source && source.querySelector('img');
    var r = image ? image.getBoundingClientRect() : null;
    var visible = r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    if (!visible) return 'translate(0px, 34px) scale(.86)';
    var angle = '0deg', incline = '0deg';
    // Un livre posé à plat sur le bureau part couché ; s'il est déjà redressé par le survol, il part droit.
    if (source.classList.contains('book') && !source.matches(':hover')) {
      var style = getComputedStyle(source);
      angle = style.getPropertyValue('--rr').trim() || '0deg';
      incline = style.getPropertyValue('--rx').trim() || '0deg';
    }
    var w = image.offsetWidth || r.width, h = image.offsetHeight || r.height;
    var k = incline === '0deg' ? 1 : r.width / w; // la perspective du bureau rapetisse les livres du fond
    var dx = r.left + r.width / 2 - cx;
    var dy = r.top + r.height / 2 - cy;
    return 'translate(' + dx + 'px, ' + dy + 'px) rotateX(' + incline + ') rotate(' + angle + ') scale(' + (w * k) / pw + ', ' + (h * k) / ph + ')';
  }

  function ouvrir(id, source, sansHistorique) {
    var fiche = document.getElementById(id);
    if (occupe || ouvert || !fiche) return;
    occupe = true;
    remplir(fiche);
    if (window.lumiere) window.lumiere(fiche.dataset.rgb);

    var img = fiche.querySelector('img');
    var ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : Number(img.getAttribute('width')) / Number(img.getAttribute('height'));
    var m = mesurer(ratio);
    var de = depart(source, m.pw, m.ph);
    toutArreter();
    lecteur.showModal();
    pageDroite.scrollTop = 0;
    fermer.focus({ preventScroll: true });
    if (source) source.style.visibility = 'hidden';

    ouvert = { id: id, source: source, ratio: ratio, simple: m.simple, depuisHistorique: !!sansHistorique };
    if (!sansHistorique) history.pushState({ livre: id }, '', '#' + id);

    animer(voile, [{ opacity: 0 }, { opacity: 1 }], 550, 'ease');
    animer(fermer, [{ opacity: 0 }, { opacity: 1 }], 400, 'ease');
    var vol = animer(ob, [{ transform: de }, { transform: 'none' }], 750);
    vol.then(function () {
      var fin = [
        animer(couv, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-180deg)' }], 1100, courbePage)
      ];
      if (m.simple) {
        fin.push(animer(couv, [{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], 1100, 'linear'));
      } else {
        fin.push(animer(decale, [{ transform: 'translateX(0)' }, { transform: 'translateX(' + m.pw / 2 + 'px)' }], 1100, courbePage));
      }
      return Promise.all(fin);
    }).then(function () {
      if (m.simple) couv.style.visibility = 'hidden';
      occupe = false;
    });
  }

  function refermer(depuisHistorique) {
    if (occupe || !ouvert) return;
    occupe = true;
    var etat = ouvert;
    var m = mesurer(etat.ratio);
    couv.style.visibility = '';
    pageDroite.scrollTop = 0;

    var fin = [
      animer(couv, [{ transform: 'rotateY(-180deg)', opacity: etat.simple ? 0 : 1 }, { transform: 'rotateY(0deg)', opacity: 1 }], 800, courbePage)
    ];
    if (!etat.simple) {
      fin.push(animer(decale, [{ transform: 'translateX(' + m.pw / 2 + 'px)' }, { transform: 'translateX(0)' }], 800, courbePage));
    }
    Promise.all(fin).then(function () {
      if (etat.source) etat.source.style.visibility = '';
      var vers = depart(etat.source, m.pw, m.ph);
      if (etat.source) etat.source.style.visibility = 'hidden';
      animer(voile, [{ opacity: 1 }, { opacity: 0 }], 550, 'ease');
      animer(fermer, [{ opacity: 1 }, { opacity: 0 }], 200, 'ease');
      return animer(ob, [{ transform: 'none' }, { transform: vers }], 600);
    }).then(function () {
      if (etat.source) etat.source.style.visibility = '';
      lecteur.close();
      toutArreter();
      couv.style.visibility = '';
      if (window.lumiere) window.lumiere(null);
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
    var lien = e.target.closest('a[data-livre]');
    if (!lien || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    ouvrir(lien.dataset.livre, lien);
  });

  fermer.addEventListener('click', function () { refermer(false); });
  lecteur.addEventListener('cancel', function (e) { e.preventDefault(); refermer(false); });
  lecteur.addEventListener('click', function (e) {
    if (!e.target.closest('.ob, .lecteur__fermer')) refermer(false);
  });

  window.addEventListener('popstate', function () {
    var id = location.hash.slice(1);
    if (ouvert && ouvert.id !== id) refermer(true);
    else if (!ouvert && id && document.getElementById(id) && document.getElementById(id).classList.contains('fiche')) {
      ouvrir(id, document.querySelector('.book[data-livre="' + id + '"]'), true);
    }
  });

  window.addEventListener('resize', function () {
    if (!ouvert || occupe) return;
    var m = mesurer(ouvert.ratio);
    ouvert.simple = m.simple;
    decale.getAnimations().forEach(function (a) { a.cancel(); });
    decale.style.transform = '';
    couv.style.visibility = m.simple ? 'hidden' : '';
    if (!m.simple) animer(decale, [{ transform: 'translateX(' + m.pw / 2 + 'px)' }, { transform: 'translateX(' + m.pw / 2 + 'px)' }], 1);
  });

  /* Adresse directe vers un livre (#l-autre) : il s'ouvre à l'arrivée, sans sauter dans la page. */
  var demande = location.hash.slice(1);
  var ficheDemandee = demande && document.getElementById(demande);
  if (ficheDemandee && ficheDemandee.classList.contains('fiche')) {
    window.scrollTo(0, 0);
    window.addEventListener('load', function () {
      window.scrollTo(0, 0);
      ouvrir(demande, document.querySelector('.book[data-livre="' + demande + '"]'), true);
    });
  }
})();
