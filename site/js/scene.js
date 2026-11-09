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

  /* ---------- La caméra : deux murs côte à côte, on tourne la tête de l'un à l'autre ----------
     Le mouvement lui-même est en CSS (.vue-biblio, .tourne) ; ici on ne fait que poser les classes. */
  var vueBureau = camera.querySelector('.vue--bureau');
  var vueBiblio = camera.querySelector('.vue--biblio');
  var vueActive = 'bureau';
  var minuteur = 0;

  function aller(vue, livre, instantane) {
    if (vue === vueActive) return;
    vueActive = vue;
    vueBureau.inert = vue !== 'bureau';
    vueBiblio.inert = vue !== 'biblio';
    clearTimeout(minuteur);
    var arrivee = function () {
      camera.classList.remove('tourne');
      if (vue === 'biblio') {
        var cible = livre && vueBiblio.querySelector('.book[data-livre="' + livre + '"]');
        if (cible) {
          cible.focus({ preventScroll: true });
          cible.classList.remove('appel'); void cible.offsetWidth; cible.classList.add('appel');
        } else {
          vueBiblio.querySelector('.retour').focus({ preventScroll: true });
        }
      } else {
        var tome = livre && vueBureau.querySelector('.tome[data-livre="' + livre + '"]');
        (tome || vueBureau.querySelector('.tome')).focus({ preventScroll: true });
      }
    };
    if (instantane || moinsDeMouvement) {
      camera.classList.add('sans-transition');
      camera.classList.toggle('vue-biblio', vue === 'biblio');
      void camera.offsetWidth;
      camera.classList.remove('sans-transition');
      arrivee();
      return;
    }
    camera.classList.remove('tourne');
    void camera.offsetWidth; // relance l'animation du regard même si on fait demi-tour en route
    camera.classList.add('tourne');
    camera.classList.toggle('vue-biblio', vue === 'biblio');
    minuteur = setTimeout(arrivee, parseFloat(getComputedStyle(camera).getPropertyValue('--duree')) * 1000 + 50);
  }
  window.allerVers = aller;

  /* La pile : au survol, le livre sort un peu et son titre s'affiche ; au clic, on tourne vers la bibliothèque. */
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
  camera.querySelector('.retour').addEventListener('click', function () { aller('bureau'); });
  document.addEventListener('keydown', function (e) {
    var lecteur = document.getElementById('lecteur');
    if (e.key === 'Escape' && vueActive === 'biblio' && !(lecteur && lecteur.open)) aller('bureau');
  });

  /* Adresse directe vers un livre (#l-autre) : on arrive déjà devant la bibliothèque. */
  var demande = location.hash.slice(1);
  var fiche = demande && document.getElementById(demande);
  if (fiche && fiche.classList.contains('fiche')) aller('biblio', null, true);

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
    var decor = (vueActive === 'bureau' ? vueBureau : vueBiblio).querySelector('.decor').getBoundingClientRect();
    var cr = camera.getBoundingClientRect();
    var k = decor.width / 1680;
    var sources = SOURCES[vueActive].map(function (s) { return [decor.left - cr.left + s[0] * k, decor.top - cr.top + s[1] * k, s[2]]; });
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
