# Laurent Blondeau, écrivain : le bureau

Site vitrine des livres de Laurent Blondeau : thrillers, polars, fiction historique, poésies et développement personnel.

En ligne (préproduction, non indexée) : [laurent-blondeau-bureau.netlify.app](https://laurent-blondeau-bureau.netlify.app)

## Le principe

Un bureau de manoir la nuit. Sur le cuir : une lanterne, le portrait de l'auteur dans un cadre ovale, une plaque de bureau « Contact », un tableau de liège pour les salons, une pile de journaux pour la presse, un parchemin, un encrier, une plume, une clé, et la pile de ses livres. Au clic sur un livre de la pile, le regard balaie la pièce vers la gauche (panoramique avec flou de bougé, un rideau passe au premier plan) et s'arrête sur une bibliothèque où les livres sont rangés par catégorie. Au clic sur un livre de l'étagère, il vient au centre et s'ouvre sur son résumé et son prix.

Les deux décors sont des images générées avec Canva ; tout ce qui bouge ou se clique est posé par-dessus en HTML et CSS. Le cadre doré (`img/cadre-dore.png`) et le rideau de velours de la transition (`img/rideau.jpg`) sont aussi des images Canva : le cadre a été détouré sur fond vert, la photo de Laurent passe derrière son ouverture. Le cadre d’origine du décor a été effacé de `img/decor-bureau.jpg`.

## Fichiers

| Fichier | Contenu |
| ------- | ------- |
| `site/index.html` | Les deux vues, la pile et le texte de chaque livre |
| `site/a-propos.html` | L'auteur, ses éditeurs, les contacts |
| `site/css/style.css` | Toute la mise en forme : décor, pile en 3D, étagères, rotation |
| `site/js/scene.js` | La rotation entre les vues, la pile, la poussière ; la brume de la page À propos |
| `site/js/lecteur.js` | Le livre qui vient au centre et s'ouvre |
| `site/js/panneaux.js` | Le tableau des salons qui vient en grand, le journal qui se déplie (#evenements, #presse) ; range seul les dates passées |
| `site/presse/` | Les articles de presse en PDF, repris de l'ancien site |
| `site/img/`, `site/polices/` | Décors, couvertures, portrait ; polices hébergées avec le site (licence OFL) |

Tout ce qui est posé sur les décors est placé en pixels de l'image (1680 × 944) multipliés par `--k`. Si un décor change, il faut reprendre ces coordonnées : portrait, plaque, parchemin, pile, lueurs des bougies, étagères (`--x`, `--y`, `--w`, `--h` de chaque `.rayon`).

HTML, CSS et JavaScript simples, sans framework ni étape de construction. Lancer en local : double-cliquer sur `site/index.html`.

## Déploiement

Netlify publie le dossier `site/` à chaque push sur `main` (voir `netlify.toml`). Avant l'ouverture au public : retirer la balise `robots` des deux pages et l'en-tête `X-Robots-Tag` de `netlify.toml`.

© Laurent Blondeau pour les textes, les couvertures et le portrait.

## Mettre à jour les salons et la presse

- **Un salon** : ajouter une ligne `<li data-date="AAAA-MM-JJ">` dans la liste `.liege__notes` de `site/index.html`. Les dates passées passent seules dans « Déjà venu à », et les deux prochaines s'affichent sur le petit tableau du bureau.
- **Un article** : déposer le PDF dans `site/presse/` et ajouter une ligne dans `.gazette__articles`.
