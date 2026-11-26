# Laurent Blondeau, écrivain : le bureau

Site vitrine et boutique des livres de Laurent Blondeau : thrillers, polars, fiction historique, poésies et développement personnel.

En ligne (préproduction, non indexée) : [laurent-blondeau-bureau.netlify.app](https://laurent-blondeau-bureau.netlify.app)

## Le principe

Un bureau de manoir la nuit. Sur le cuir : une lanterne, le portrait de l'auteur dans un cadre ovale, une plaque de bureau « Contact », un tableau de liège pour les salons, une pile de journaux pour la presse, un parchemin, un encrier, une plume, une clé, et la pile de ses livres. Au clic sur un livre de la pile, le regard balaie la pièce vers la gauche (panoramique avec flou de bougé, un rideau passe au premier plan) et s'arrête sur la bibliothèque où le livre est rangé. Au clic sur un livre de l'étagère, il vient au centre et s'ouvre sur son résumé, son prix et le bouton du panier.

Les décors sont des images générées avec Canva ; tout ce qui bouge ou se clique est posé par-dessus en HTML et CSS. Sur téléphone, chaque décor glisse au doigt de gauche à droite.

## Le contenu vient de la base

Laurent gère tout depuis l'administration (`/admin/`) : livres (titre, sous-titre, style, prix, résumé, couverture, stock), styles, salons, presse, commandes et messages. Le site se construit à partir de la base Supabase :

- **La pile du bureau** : les 7 derniers livres mis en ligne, le plus récent en haut.
- **Les bibliothèques** : une étagère par style, 4 étagères par meuble. À partir du 5e style, une deuxième bibliothèque apparaît à gauche, avec un panneau « Autres rayons » pour y aller.
- **Le tableau des salons** et **le journal de la presse**.

Si la base ne répond pas (pas encore configurée, en pause), le site garde le contenu écrit dans `index.html`.

## Fichiers

| Fichier | Contenu |
| ------- | ------- |
| `site/index.html` | Le bureau, la bibliothèque, le tableau, le journal ; contenu de secours si la base ne répond pas |
| `site/js/demarrage.js` | Lit la base, construit la pile, les bibliothèques, le tableau et le journal, puis lance la scène |
| `site/js/scene.js` | Le panoramique entre les murs, la pile, le glissement au doigt, la poussière ; la brume des autres pages |
| `site/js/lecteur.js` | Le livre qui vient au centre et s'ouvre |
| `site/js/panneaux.js` | Le tableau des salons qui vient en grand, le journal qui se déplie (#evenements, #presse) |
| `site/js/achat.js` | Le panier (dans le navigateur) et le bouton du livre ouvert |
| `site/panier.html`, `site/confirmation.html` | Le panier, la commande, le retour du paiement |
| `site/contact.html`, `site/a-propos.html` | Le formulaire de contact, l'auteur, son e-mail et ses réseaux |
| `site/cgv.html`, `site/mentions-legales.html` | Brouillons : les passages « À compléter » doivent être renseignés avant d'encaisser |
| `site/admin/`, `site/js/admin/` | L'administration (connexion par lien magique) |
| `site/js/config.js` | Adresse et clé publique de la base |
| `supabase/installation.sql`, `supabase/amorcage.sql` | La base, puis le contenu de départ |
| `supabase/functions/` | Les fonctions serveur : paiement Stripe, webhook, e-mails de commande, formulaire de contact |

Tout ce qui est posé sur les décors est placé en pixels de l'image (1680 × 944) multipliés par `--k`. Si un décor change, il faut reprendre ces coordonnées (portrait, plaques, tableau, journaux, pile, lueurs, étagères dans `demarrage.js`).

HTML, CSS et JavaScript simples, sans framework ni étape de construction. Pour tester en local, servir le dossier `site/` (par exemple `npx serve site`) : les modules ne se chargent pas en ouvrant le fichier directement.

## Mise en place de la base (une fois)

Architecture reprise du site de L'Atelier du Bout d'à Haut.

1. **Supabase** : créer un projet (région Paris), puis dans SQL Editor exécuter `supabase/installation.sql` puis `supabase/amorcage.sql`.
2. Copier l'adresse du projet et la clé « publishable » dans `site/js/config.js`. Ne jamais y mettre la clé secrète.
3. **Authentication > Users** : créer les utilisateurs listés dans `est_admin()` (Add user, Auto Confirm). **Sign In / Providers > Email** : désactiver « Allow new users to sign up ». **URL Configuration** : adresse du site en Site URL et dans Redirect URLs.
4. **Edge Functions** : déployer les quatre fonctions de `supabase/functions/` (Deploy a new function > Via Editor). Désactiver « Verify JWT » pour `stripe-webhook` et `envoyer-message`.
5. **Secrets** (Edge Functions > Secrets) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `BREVO_API_KEY`, `EXPEDITEUR_EMAIL` (adresse validée dans Brevo), `AUTEUR_EMAIL` (boîte de Laurent).
6. **Stripe** : webhook vers `https://<projet>.supabase.co/functions/v1/stripe-webhook`, évènements `checkout.session.completed` et `checkout.session.expired`. Commencer en mode test.

La livraison est un forfait de 5 € par commande, France métropolitaine : `frais_livraison_cents()` dans la base (le chiffre de `config.js` ne sert qu'à l'affichage).

## Déploiement

Netlify publie le dossier `site/` à chaque push sur `main` (voir `netlify.toml`). Avant l'ouverture au public : compléter les pages légales, retirer les balises `robots` des pages et l'en-tête `X-Robots-Tag` général de `netlify.toml` (celui de `/admin/` reste).

© Laurent Blondeau pour les textes, les couvertures et le portrait.
