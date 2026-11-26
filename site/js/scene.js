/* Le manoir : la caméra qui tourne du bureau vers la bibliothèque, la pile de livres,
   la poussière dans la lumière des bougies. Sur la page À propos : seulement la brume. */
(function () {
  var moinsDeMouvement = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Page À propos : brume sombre et chaude ---------- */
  var toile = document.getElementById('brume');
  if (toile) {
    var ctx = toile.getContext('2d'), L = 120, H = 68;
    toile.width = L; toile.height = H;
    var image = ctx.createImageData(L, H), N = 64, alea = new Float32Array(N * N), graine = 7;
    for (var i = 0; i < alea.length; i++) { graine = (graine * 16807) % 2147483647; alea[i] = (graine - 1) / 2147483646; }
    var lisse = function (t) { return t * t * (3 - 2 * t); };
    var bruit = function (x, y) {
      var x0 = Math.floor(x), y0 = Math.floor(y), fx = lisse(x - x0), fy = lisse(y - y0);
      var a = ((x0 % N) + N) % N, b = ((y0 % N) + N) % N, a1 = (a + 1) % N, b1 = (b + 1) % N;
      var h = alea[b * N + a], d = alea[b * N + a1], j = alea[b1 * N + a], k = alea[b1 * N + a1];
      return (h + (d - h) * fx) * (1 - fy) + (j + (k - j) * fx) * fy;
    };
    var SOMBRE = [12, 9, 8], CLAIR = [52, 40, 32];
    var peindre = function (t) {
      var p = 0;
      for (var y = 0; y < H; y++) for (var x = 0; x < L; x++) {
        var n = bruit(x * 0.03 + t * 0.012, y * 0.05 - t * 0.02) * 0.6 + bruit(x * 0.07 + 9, y * 0.1 + 4) * 0.4;
        n = Math.min(1, Math.max(0, (n - 0.3) / 0.42));
        for (var c = 0; c < 3; c++) image.data[p++] = SOMBRE[c] + (CLAIR[c] - SOMBRE[c]) * n;
        image.data[p++] = 255;
      }
      ctx.putImageData(image, 0, 0);
    };
    peindre(0);
    if (!moinsDeMouvement) {
      var avant = 0;
      (function boucle(ms) { requestAnimationFrame(boucle); if (document.hidden || ms - avant < 50) return; avant = ms; peindre(ms / 1000); })(0);
    }
  }

  var camera = document.querySelector('.camera');
  if (!camera) return;

  /* ---------- La caméra : les murs côte à côte, on tourne la tête de l'un à l'autre ----------
     Mur 0 : le bureau. Murs 1, 2… : les bibliothèques, de plus en plus à gauche (4 styles chacune).
     Tourner, c'est décaler la pièce de n écrans vers la droite ; un rideau par jointure passe au
     premier plan. Le flou et le mouvement de tête sont en CSS (.tourne). */
  var vueBureau = camera.querySelector('.vue--bureau');
  var biblios = Array.prototype.slice.call(camera.querySelectorAll('.vue--biblio'))
    .sort(function (a, b) { return (+a.dataset.rang || 1) - (+b.dataset.rang || 1); });
  var vues = [vueBureau].concat(biblios);
  var piece = camera.querySelector('.piece');
  var actif = 0;
  var minuteur = 0;
  var DUREE = parseFloat(getComputedStyle(camera).getPropertyValue('--duree')) || 2.3;

  // Un rideau par jointure : entre le bureau et la 1re bibliothèque, entre la 1re et la 2e…
  var rideaux = Array.prototype.slice.call(piece.querySelectorAll('.rideau'));
  while (rideaux.length < biblios.length) {
    var r = document.createElement('span');
    r.className = 'rideau'; r.setAttribute('aria-hidden', 'true');
    piece.appendChild(r); rideaux.push(r);
  }
  rideaux.forEach(function (r, i) { r.style.setProperty('--jointure', i); });
  // Course d'un rideau : décalage 0,35 × (position de la pièce − passage de sa jointure au centre).
  function courseRideau(i, position) { return 'translateX(' + (35 * (position - i - 0.5)).toFixed(2) + 'cqw)'; }

  function poser(n) {
    vues.forEach(function (v, i) { v.inert = i !== n; v.classList.toggle('vue--active', i === n); });
    camera.classList.toggle('vue-biblio', n > 0); // repère pour les autres scripts
    camera.dataset.vue = n;
  }
  function decaler(n) { piece.style.transform = n ? 'translateX(' + (n * 100) + '%)' : ''; }

  function rangDuLivre(livre) {
    var b = livre && camera.querySelector('.vue--biblio .book[data-livre="' + livre + '"]');
    var v = b && b.closest('.vue--biblio');
    return v ? (+v.dataset.rang || 1) : 1;
  }

  // vue : 'bureau', 'biblio' (la bibliothèque du livre demandé, ou la 1re) ou un numéro de mur.
  function aller(vue, livre, instantane) {
    var n = vue === 'bureau' ? 0 : vue === 'biblio' ? rangDuLivre(livre) : +vue;
    if (!(n >= 0 && n < vues.length) || n === actif) return;
    var depuis = actif;
    actif = n;
    clearTimeout(minuteur);
    var cible = vues[n];
    var arrivee = function () {
      camera.classList.remove('tourne');
      poser(n);
      if (n > 0) {
        var b = livre && cible.querySelector('.book[data-livre="' + livre + '"]');
        if (b) {
          b.focus({ preventScroll: true });
          b.classList.remove('appel'); void b.offsetWidth; b.classList.add('appel');
        } else {
          (cible.querySelector('.rayons-suite') || cible.querySelector('.retour')).focus({ preventScroll: true });
        }
      } else {
        var tome = livre && vueBureau.querySelector('.tome[data-livre="' + livre + '"]');
        (tome || vueBureau.querySelector('.tome')).focus({ preventScroll: true });
      }
    };
    if (instantane || moinsDeMouvement) {
      camera.classList.add('sans-transition');
      decaler(n);
      void camera.offsetWidth;
      camera.classList.remove('sans-transition');
      arrivee();
      return;
    }
    // Plus le regard va loin, plus il prend son temps (sans traîner : +50 % par mur supplémentaire).
    var duree = DUREE * (1 + 0.5 * (Math.abs(n - depuis) - 1));
    camera.style.setProperty('--duree', duree + 's');
    rideaux.forEach(function (r, i) {
      r.style.transition = 'none';
      r.style.transform = courseRideau(i, depuis);
      void r.offsetWidth;
      r.style.transition = '';
      r.style.transform = courseRideau(i, n);
    });
    camera.classList.remove('tourne');
    void camera.offsetWidth; // relance l'animation du regard même si on fait demi-tour en route
    camera.classList.add('tourne');
    vues.forEach(function (v) { v.inert = true; });
    decaler(n);
    minuteur = setTimeout(arrivee, duree * 1000 + 50);
  }
  window.allerVers = aller;
  poser(0);

  /* La pile : au survol, le livre sort un peu et son titre s'affiche ; au clic, on tourne vers sa bibliothèque. */
  var etiquette = camera.querySelector('.pile__etiquette');
  camera.querySelectorAll('.tome').forEach(function (tome) {
    var titre = tome.querySelector('.visuellement-cache').textContent;
    var montrer = function () { etiquette.textContent = titre; etiquette.classList.add('visible'); };
    var cacher = function () { etiquette.classList.remove('visible'); };
    tome.addEventListener('pointerenter', montrer);
    tome.addEventListener('focus', montrer);
    tome.addEventListener('pointerleave', cacher);
    tome.addEventListener('blur', cacher);
    tome.addEventListener('click', function () { cacher(); aller('biblio', tome.dataset.livre); });
  });
  camera.querySelectorAll('.retour').forEach(function (b) { b.addEventListener('click', function () { aller('bureau'); }); });
  camera.querySelectorAll('[data-aller]').forEach(function (b) { b.addEventListener('click', function () { aller(b.dataset.aller); }); });
  document.addEventListener('keydown', function (e) {
    var lecteur = document.getElementById('lecteur');
    if (e.key === 'Escape' && actif > 0 && !(lecteur && lecteur.open)) aller('bureau');
  });

  /* ---------- Téléphone : le décor glisse au doigt ----------
     Chaque mur est une zone qui défile à l'horizontale ; au départ, on la centre sur --mfx
     (la pile sur le bureau, les étagères dans la bibliothèque). */
  var etroit = window.matchMedia('(max-width: 760px)');
  function centrerMobile() {
    if (!etroit.matches) return;
    vues.forEach(function (vue) {
      var decor = vue.querySelector('.decor');
      var fx = parseFloat(decor.style.getPropertyValue('--mfx')) || 0.5;
      vue.scrollLeft = decor.offsetWidth * fx - vue.clientWidth / 2;
    });
  }
  centrerMobile();
  window.addEventListener('load', centrerMobile);
  etroit.addEventListener('change', centrerMobile);
  window.addEventListener('orientationchange', function () { setTimeout(centrerMobile, 300); });

  /* Adresse directe vers un livre (#l-autre) : on arrive déjà devant sa bibliothèque. */
  var demande = location.hash.slice(1);
  var fiche = demande && document.getElementById(demande);
  if (fiche && fiche.classList.contains('fiche')) aller('biblio', demande, true);

  /* ---------- Léger relief au mouvement de la souris ---------- */
  if (!moinsDeMouvement) {
    var attente = false, px = 0, py = 0;
    camera.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
      if (attente) return;
      attente = true;
      requestAnimationFrame(function () {
        attente = false;
        camera.style.setProperty('--px', px.toFixed(3));
        camera.style.setProperty('--py', py.toFixed(3));
      });
    });
  }

  /* ---------- Poussière qui flotte dans la lumière des bougies ---------- */
  var parts = camera.querySelector('.particules');
  var pc = parts.getContext('2d');
  var W = 0, Hc = 0;
  var SOURCES = { bureau: [[122, 452, 1], [667, 132, 0.5]], biblio: [[298, 172, 0.8], [1378, 162, 0.8], [298, 545, 0.8], [1380, 540, 0.8]] };
  function taille() { W = parts.width = camera.clientWidth; Hc = parts.height = camera.clientHeight; }
  taille();
  window.addEventListener('resize', taille);
  var grains = [], g = 3;
  function hasard() { g = (g * 16807) % 2147483647; return (g - 1) / 2147483646; }
  for (var n = 0; n < 70; n++) grains.push({ x: hasard(), y: hasard(), v: 0.1 + hasard() * 0.3, p: hasard() * 6.28, r: 0.5 + hasard() * 1.2 });
  function dessiner(ms) {
    pc.clearRect(0, 0, W, Hc);
    if (camera.classList.contains('tourne')) return;
    var decor = vues[actif].querySelector('.decor').getBoundingClientRect();
    var cr = camera.getBoundingClientRect();
    var k = decor.width / 1680;
    var sources = SOURCES[actif ? 'biblio' : 'bureau'].map(function (s) { return [decor.left - cr.left + s[0] * k, decor.top - cr.top + s[1] * k, s[2]]; });
    var t = ms / 1000, portee = 300 * k;
    grains.forEach(function (q) {
      var x = ((q.x * W + Math.sin(t * q.v + q.p) * 25) % W + W) % W;
      var y = (((q.y - t * q.v * 0.01) % 1) + 1) % 1 * Hc;
      var a = 0;
      sources.forEach(function (s) { var d = Math.hypot(x - s[0], y - s[1]) / portee; a = Math.max(a, (1 - d) * s[2]); });
      a *= 0.55 + 0.45 * Math.sin(t * 1.7 + q.p);
      if (a <= 0.02) return;
      pc.fillStyle = 'rgba(255, 214, 160,' + a.toFixed(3) + ')';
      pc.beginPath(); pc.arc(x, y, q.r, 0, 6.283); pc.fill();
    });
  }
  if (!moinsDeMouvement) {
    var derniere = 0;
    (function boucle(ms) { requestAnimationFrame(boucle); if (document.hidden || ms - derniere < 33) return; derniere = ms; dessiner(ms); })(0);
  }
})();
