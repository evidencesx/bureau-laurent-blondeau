# Laurent Blondeau, écrivain : le bureau

Site vitrine des livres de Laurent Blondeau : thrillers, polars, fiction historique, poésies et développement personnel.

En ligne (préproduction, non indexée) : [laurent-blondeau-bureau.netlify.app](https://laurent-blondeau-bureau.netlify.app)

## Le principe

Un bureau de manoir la nuit. Sur le cuir : une lanterne, le portrait de l'auteur dans un cadre ovale, un encrier, une plume, une clé, un parchemin qui mène au contact, et la pile de ses livres. Au clic sur un livre de la pile, la vue tourne vers la gauche, vers une bibliothèque où les livres sont rangés par catégorie. Au clic sur un livre de l'étagère, il vient au centre et s'ouvre sur son résumé et son prix.

Les deux décors sont des images générées avec Canva ; tout ce qui bouge ou se clique est posé par-dessus en HTML et CSS.

## Fichiers

| Fichier | Contenu |
| ------- | ------- |
| `site/index.html` | Les deux vues, la pile et le texte de chaque livre |
| `site/a-propos.html` | L'auteur, ses éditeurs, les contacts |
| `site/css/style.css` | Toute la mise en forme : décor, pile en 3D, étagères, rotation |
| `site/js/scene.js` | La rotation entre les vues, la pile, la poussière ; la brume de la page À propos |
| `site/js/lecteur.js` | Le livre qui vient au centre et s'ouvre |
| `site/img/`, `site/polices/` | Décors, couvertures, portrait ; polices hébergées avec le site (licence OFL) |

Tout ce qui est posé sur les décors est placé en pixels de l'image (1680 × 944) multipliés par `--k`. Si un décor change, il faut reprendre ces coordonnées : portrait, parchemin, pile, lueurs des bougies, étagères (`--x`, `--y`, `--w`, `--h` de chaque `.rayon`).

HTML, CSS et JavaScript simples, sans framework ni étape de construction. Lancer en local : double-cliquer sur `site/index.html`.

## Déploiement

Netlify publie le dossier `site/` à chaque push sur `main` (voir `netlify.toml`). Avant l'ouverture au public : retirer la balise `robots` des deux pages et l'en-tête `X-Robots-Tag` de `netlify.toml`.

© Laurent Blondeau pour les textes, les couvertures et le portrait.
