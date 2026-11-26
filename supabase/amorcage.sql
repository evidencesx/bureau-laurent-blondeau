-- =============================================================================
-- amorcage.sql — le contenu actuel du site, à lancer une fois après installation.sql
-- =============================================================================
-- Généré à partir de la page d'accueil (livres, salons, presse). Le stock est à 0 :
-- Laurent indique dans l'admin combien d'exemplaires il a de chaque livre.
-- =============================================================================

insert into styles (nom, ordre) values
  ('Thrillers et polars', 1),
  ('Fiction historique', 2),
  ('Poésies', 3),
  ('Développement personnel', 4);

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('urbex-codex', 'Urbex Codex', 'Pourra-t-elle affronter ces découvertes et découvrir ce qui se cache derrière ce chemin douloureux ?', 'Thriller, 2022',
  (select id from styles where nom = 'Thrillers et polars'), 1900,
  'Élise, jeune professionnelle dans une médiathèque, équilibre sa vie entre sa thèse, son boulot et ses découvertes nocturnes. Elle se trouve entraînée dans une suite de meurtres à énigmes qui va lui faire explorer ses peurs tout au long de l’aventure.

Une série de meurtres, dont elle va découvrir les traces et les corps lors de ses explorations, va la mettre au centre d’une énigme à étapes qu’elle devra déchiffrer et suivre pour en découvrir l’issue. Comme dans un puzzle, elle avance dans des suppositions guidées par des parties d’indices et des textes allégoriques laissés par le criminel.',
  '978-2-38441-090-3', 'img/urbex-codex.jpg', 711, 1100, '#1D1B19', '#C9C2B4',
  0, true, '2026-11-03T12:00:00.000Z');

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('l-autre', 'L’Autre', 'Comment va-t-il interpréter ces crimes et aller au bout des confrontations les plus dérangeantes ?', 'Thriller psychologique, 2024',
  (select id from styles where nom = 'Thrillers et polars'), 2100,
  'Marc, patrouilleur sur l’autoroute A40 dont la vie a été perturbée par des accidents familiaux, va être malgré lui mêlé à une série de meurtres particulièrement horribles. Il doit également faire face au tragique destin de sa sœur déséquilibrée et renfermée sur elle-même.

L’action principale se déroule autour de Bourg-en-Bresse et sur l’A40, alternant scènes de ville et de montagne. Un bon mix entre intrigue policière et questionnement personnel. Une « autre » manière pour l’écriture de polars.',
  '9791042506032', 'img/l-autre.jpg', 691, 1100, '#0C0F11', '#7FB8A0',
  0, true, '2026-11-04T12:00:00.000Z');

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('l-heritage-empoisonne', 'L’héritage empoisonné', 'À Thornfield Grange, la vérité a plusieurs visages, et le coupable désigné n’est peut-être pas le bon.', 'Roman policier à suspense, 2026',
  (select id from styles where nom = 'Thrillers et polars'), 1690,
  'Devon, automne 1924. Au manoir de Thornfield Grange, battu par la pluie et les embruns, Lady Harriet Ashmore s’apprête à modifier son testament. Autour d’elle, une famille trop polie, trop silencieuse : un fils désabusé, une belle-fille au regard fuyant, une nièce trop attentive, un vieil ami au sourire calculé.

Quand la secrétaire juridique et clerc de notaire Cecily Vane franchit le seuil de la demeure, elle croit n’avoir à régler que des affaires courantes. Elle se trompe.

Entre secrets d’héritage, poison dissimulé et sourires d’apparat, Cecily devra apprendre à distinguer l’essentiel du mensonge. Un roman policier à suspense dans la grande tradition anglaise, où chaque silence devient une accusation.',
  '9791044328656', 'img/l-heritage-empoisonne.jpg', 781, 1100, '#141110', '#C9A764',
  0, true, '2026-11-02T12:00:00.000Z');

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('le-mal-est-certain', 'Le mal est certain', 'Êtes-vous prêt à percer le secret de l’humanité ?', 'Fiction historique et dystopie, 2025',
  (select id from styles where nom = 'Fiction historique'), 2100,
  'Un roman de type fiction historique et dystopie mettant en scène divers tableaux historiques à travers les siècles. Nous suivons le voyage d’une mystérieuse capsule qui transporte le secret de l’humanité.

De l’Atlantide à la planète Mars, les histoires s’enchaînent et l’histoire est revisitée pour traduire le fil conducteur du roman : le Mal voyage et se reproduit au cours des époques. Mythes et énigmes permettent de dessiner notre futur, jusqu’à notre époque et bien au-delà.',
  '9791042519568', 'img/le-mal-est-certain.jpg', 577, 917, '#22332F', '#DCE6E0',
  0, true, '2026-11-05T12:00:00.000Z');

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('mots-sur-maux', 'Mots sur maux', 'De courtes aventures textuelles où la pensée circule, les idées viennent et l’émotion surgit.', 'Poésies contemporaines, 2026',
  (select id from styles where nom = 'Poésies'), 1200,
  'Laurent Blondeau vous propose de courts poèmes contemporains sur des sujets de société. Tantôt drôles, caustiques, dramatiques, mais ne laissant pas indifférent.

Des rimes enchantées qui vous entraîneront, vous feront réfléchir, textes illustrés de gravures contextuelles. Une suite logique du premier recueil, étoffée de nouveaux sujets d’actualité.',
  null, 'img/mots-sur-maux.jpg', 650, 879, '#1E2C4F', '#FFFFFF',
  0, true, '2026-11-07T12:00:00.000Z');

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('des-mots-sur-les-maux', 'Des mots sur les maux', 'Des rimes enchantées qui vous feront réfléchir, rêver et challengeront vos émotions.', 'Poésies, 2025',
  (select id from styles where nom = 'Poésies'), 1055,
  'Un recueil de récits qui vous emmène dans la danse des mots, sublimes éléments chantants et racontant des histoires et des scénettes mignonnes et truculentes de notre époque.

Des histoires de femmes, de guerre, d’animaux, de conflits, de nature, d’écologie, d’amitié, de perdition, de moments perdus et retrouvés. Chacun trouvera la sienne et saura résonner au rythme des vers proposés.',
  '9798275320107', 'img/des-mots-sur-les-maux.jpg', 686, 1024, '#B0433A', '#FFFFFF',
  0, true, '2026-11-06T12:00:00.000Z');

insert into livres (slug, titre, sous_titre, etiquette, style_id, prix_cents, resume, isbn, couverture_url,
  couverture_largeur, couverture_hauteur, couleur_dos, couleur_texte, stock, publie, publie_le)
values ('le-phare-interieur', 'Le phare intérieur', 'Un programme de 21 jours. 12 minutes par jour. Aucun matériel.', 'Développement personnel, 2026',
  (select id from styles where nom = 'Développement personnel'), 1900,
  'Un livre de développement personnel, qui relie 4 thématiques importantes de nos vies. Pas de religion, pas de magie, juste du bon sens et comment les intégrer, sans changer de vie, dans nos habitudes quotidiennes.

Les quatre accords toltèques, le kriya yoga, l’instant présent et l’accueil de la mort comme un passage : quatre sagesses qui disent la même chose, trouver notre phare intérieur. Un livre, un programme en 21 jours, des exercices et des feuilles de notation pour marquer votre progression.',
  '9798190477887', 'img/le-phare-interieur.jpg', 778, 1100, '#16203A', '#D9A441',
  0, true, '2026-11-01T12:00:00.000Z');

insert into evenements (date_evenement, lieu) values
  ('2026-05-30', 'Romilly-sur-Andelle (27)'),
  ('2026-06-14', 'Luc-sur-Mer (14)'),
  ('2026-07-12', 'Épieds (27)'),
  ('2026-07-14', 'Thiron-Gardais (28)'),
  ('2026-09-20', 'La Ferté-Vidame (28)'),
  ('2026-09-26', 'Le Mans (72)'),
  ('2026-10-04', 'Andé (27)'),
  ('2026-10-25', 'Saumur (49)'),
  ('2026-11-15', 'Saint-Arnoult-en-Yvelines (78)'),
  ('2026-11-28', 'Janville-en-Beauce (28)'),
  ('2027-02-07', 'Pierres (28)'),
  ('2027-02-27', 'Évry (91)');

insert into presse (media, titre, extrait, annee, date_article, url, a_la_une) values
  ('Actu Chartres', 'À l’écrit, peut-être bientôt à l’écran : le livre « Urbex Codex » se dévoile en Eure-et-Loir', 'À Gallardon (Eure-et-Loir), un livre vient de voir le jour : le tout premier de Laurent Blondeau, le thriller "Urbex Codex", aux éditions Maïa.', 2022, '2022-08-24', 'presse/actu28-2022.pdf', true),
  ('HEC Stories', null, null, 2023, null, 'presse/hec-stories-2023.pdf', false),
  ('HEC Yearbook', null, null, 2024, null, 'presse/hec-yearbook-2024.pdf', false),
  ('HEC Stories', null, null, 2024, null, 'presse/hec-stories-2024.pdf', false),
  ('L’Écho Républicain', null, null, 2024, null, 'presse/echo-republicain.pdf', false),
  ('Toutes les nouvelles 78', null, null, 2024, null, 'presse/toutes-les-nouvelles-2024.pdf', false),
  ('Toutes les nouvelles 78', null, null, 2025, null, 'presse/toutes-les-nouvelles-2025.pdf', false);

-- Vérification : 4 styles, 7 livres, 12 salons, 7 articles.
select (select count(*) from styles) as styles, (select count(*) from livres) as livres,
       (select count(*) from evenements) as salons, (select count(*) from presse) as articles;
