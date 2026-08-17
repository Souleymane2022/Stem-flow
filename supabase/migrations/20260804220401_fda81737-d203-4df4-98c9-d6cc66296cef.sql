REVOKE EXECUTE ON FUNCTION public.sync_like_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_comment_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_room_member_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.add_xp(INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.add_xp(INTEGER) TO authenticated;

INSERT INTO public.contents (content_type, title, description, video_url, video_id, category, difficulty, tags, xp_reward, author_name) VALUES
('video','Les trous noirs expliqués simplement','Plongée dans les objets les plus extrêmes de l''univers.','https://www.youtube.com/watch?v=TdnER8AeIdw','TdnER8AeIdw','Science','intermediaire','{astrophysique,univers}',10,'STEMFLOW'),
('video','La matière noire : l''énigme du cosmos','85% de la matière de l''univers reste invisible. Pourquoi ?','https://www.youtube.com/watch?v=H5Mpw4oSojw','H5Mpw4oSojw','Science','avance','{cosmologie}',10,'STEMFLOW'),
('video','Comprendre l''IA en 20 minutes','Des réseaux de neurones aux grands modèles de langage.','https://www.youtube.com/watch?v=bof3sJ9P5Ss','bof3sJ9P5Ss','Technologie','debutant','{ia,machine-learning}',10,'STEMFLOW'),
('video','Chaque IA expliquée en 19 minutes','Panorama complet des familles d''intelligences artificielles.','https://www.youtube.com/watch?v=yQLmgw3rClM','yQLmgw3rClM','Technologie','intermediaire','{ia}',10,'STEMFLOW'),
('video','Comment fonctionne le moteur d''une voiture ?','Le fonctionnement du moteur thermique, pas à pas.','https://www.youtube.com/watch?v=5ziTd4Mv0cM','5ziTd4Mv0cM','Ingénierie','debutant','{mecanique,moteur}',10,'STEMFLOW'),
('video','Le moteur à réaction décrypté','Comment un avion pousse-t-il des tonnes d''acier dans le ciel ?','https://www.youtube.com/watch?v=6gT8NnjJV2c','6gT8NnjJV2c','Ingénierie','intermediaire','{aeronautique}',10,'STEMFLOW'),
('video','Le plus grand de tous les nombres','Voyage vertigineux dans l''infini mathématique.','https://www.youtube.com/watch?v=e6uLDvUUs8A','e6uLDvUUs8A','Mathématiques','intermediaire','{infini,logique}',10,'STEMFLOW'),
('video','Aux origines du nombre d''or','La proportion la plus célèbre des mathématiques.','https://www.youtube.com/watch?v=VgNUGxBDxUA','VgNUGxBDxUA','Mathématiques','debutant','{geometrie}',10,'STEMFLOW');

INSERT INTO public.contents (content_type, title, description, text_content, category, difficulty, xp_reward, author_name) VALUES
('text_post','La photosynthèse, moteur du vivant','Comment les plantes transforment la lumière en énergie.','Chaque seconde, les feuilles des plantes réalisent une prouesse chimique que nos meilleurs laboratoires peinent à imiter : convertir la lumière du Soleil en énergie chimique.

Dans les chloroplastes, la chlorophylle capte les photons. Cette énergie sert à casser des molécules d''eau, libérant de l''oxygène — celui que nous respirons. Le carbone du CO2 atmosphérique est ensuite assemblé en sucres via le cycle de Calvin.

Bilan : 6 CO2 + 6 H2O + lumière → C6H12O6 + 6 O2.

En Afrique, comprendre ce mécanisme est stratégique : il conditionne le rendement agricole, la sélection de variétés résistantes à la sécheresse et les projets de reforestation du Sahel.','Science','debutant',10,'STEMFLOW'),
('text_post','Pourquoi apprendre à coder change tout','Le code est la langue universelle de l''innovation.','Apprendre à programmer, ce n''est pas mémoriser une syntaxe. C''est apprendre à découper un problème complexe en étapes simples, testables et reproductibles.

Trois raisons de commencer aujourd''hui :

1. Effet de levier : un programme écrit une fois travaille pour des milliers de personnes.
2. Employabilité : le continent africain compte plus d''un million de développeurs, et la demande dépasse largement l''offre.
3. Autonomie : la capacité à construire vos propres outils plutôt que d''attendre qu''on les construise pour vous.

Commencez par Python ou JavaScript, construisez un projet réel dès la première semaine, et publiez-le. Un projet terminé vaut mille tutoriels commencés.','Technologie','debutant',10,'STEMFLOW'),
('text_post','Le béton : le matériau qui a bâti nos villes','Ingénierie des matériaux et défis climatiques.','Le béton est le deuxième matériau le plus consommé au monde après l''eau. Sa recette est ancienne : ciment, granulats, sable et eau. Sa force vient de l''hydratation du ciment, qui crée un réseau cristallin emprisonnant les granulats.

Mais produire une tonne de ciment libère environ 0,6 tonne de CO2. L''ingénierie moderne cherche des alternatives : ciments géopolymères, ajout de cendres volantes, bétons à base de latérite locale.

Pour les ingénieurs africains, l''enjeu est double : construire vite pour des villes qui doublent de population, et construire propre avec des ressources locales.','Ingénierie','intermediaire',10,'STEMFLOW');

WITH q AS (
  INSERT INTO public.contents (content_type, title, description, category, difficulty, xp_reward, author_name)
  VALUES ('quiz','Quiz : les bases du système solaire','Testez vos connaissances sur nos voisines planétaires.','Science','debutant',20,'STEMFLOW')
  RETURNING id
)
INSERT INTO public.quiz_questions (content_id, question, options, correct_option_index, explanation, sort_order)
SELECT q.id, v.question, v.options, v.idx, v.expl, v.ord FROM q, (VALUES
  ('Quelle est la planète la plus proche du Soleil ?', ARRAY['Vénus','Mercure','Mars','Terre'], 1, 'Mercure orbite à environ 58 millions de km du Soleil.', 0),
  ('Combien de planètes compte le système solaire ?', ARRAY['7','8','9','10'], 1, 'Depuis 2006, Pluton est classée planète naine : il reste 8 planètes.', 1),
  ('Quelle planète est appelée la planète rouge ?', ARRAY['Jupiter','Vénus','Mars','Saturne'], 2, 'Sa couleur vient de l''oxyde de fer présent dans son sol.', 2),
  ('Quel est le plus grand satellite naturel de la Terre ?', ARRAY['Titan','Europe','Phobos','La Lune'], 3, 'La Terre n''a qu''un seul satellite naturel : la Lune.', 3)
) AS v(question, options, idx, expl, ord);

WITH q AS (
  INSERT INTO public.contents (content_type, title, description, category, difficulty, xp_reward, author_name)
  VALUES ('quiz','Quiz : logique et algorithmes','4 questions pour affûter votre pensée informatique.','Technologie','intermediaire',20,'STEMFLOW')
  RETURNING id
)
INSERT INTO public.quiz_questions (content_id, question, options, correct_option_index, explanation, sort_order)
SELECT q.id, v.question, v.options, v.idx, v.expl, v.ord FROM q, (VALUES
  ('Que signifie l''acronyme "IA" ?', ARRAY['Interface Automatisée','Intelligence Artificielle','Informatique Appliquée','Index Algorithmique'], 1, 'IA = Intelligence Artificielle.', 0),
  ('Combien de bits contient un octet ?', ARRAY['4','8','16','32'], 1, 'Un octet (byte) vaut exactement 8 bits.', 1),
  ('Quelle structure suit le principe "dernier entré, premier sorti" ?', ARRAY['File (queue)','Pile (stack)','Arbre','Graphe'], 1, 'La pile est LIFO : Last In, First Out.', 2),
  ('En binaire, que vaut le nombre 5 ?', ARRAY['100','101','110','111'], 1, '5 = 4 + 1 = 101 en base 2.', 3)
) AS v(question, options, idx, expl, ord);