# Vérification — Hofmann Trace 1.7.1

Livraison du 17 septembre 2026, à partir de l’archive fournie et du projet `bug01`. Les sept améliorations proposées après la correction 1.2 sont intégrées.

## Correction 1.7.1 : jauge de metaball continue

L'ancien calcul multipliait le rayon d'un cercle de raccord par la jauge. Sous le rayon nécessaire pour joindre les supports, le raccord était remplacé par une droite ; au franchissement de ce seuil, un creux profond apparaissait immédiatement. La disponibilité des tangentes dépendait aussi de ce seuil.

Le nouveau calcul fixe une profondeur sous la tangente commune, puis résout analytiquement le rayon et le centre du cercle tangent aux deux supports. La profondeur varie linéairement avec la position de la jauge. Ses limites préservent un passage entre les deux côtés du metaball et tiennent compte des supports qui se chevauchent. La compatibilité d'une tangente ne dépend plus de la position de la jauge. Pour les carrés arrondis, les coins se faisant face sont utilisés lorsque plusieurs coins partagent une même tangente droite.

La position zéro conserve un metaball serré ; la position maximale donne un raccord doux encore courbe. Le clic Straighten retire explicitement l'effet. Le format de projet reste identique, et les necks enregistrés sont conservés lors des changements de jauge, de l'annulation et des recalculs. Les raccords de pincement entre rotations opposées gardent leur calcul existant.

Les **132 contrôles** comprennent les 123 précédents et 9 scénarios supplémentaires : progression aux 61 positions, absence de croisement, continuité tangentielle, tailles inégales, diagonales, parcours inversé, carrés arrondis, supports tangents ou superposés, trous, exports SVG et SVG merged, EPS fini, annulation, rechargement, interaction tactile à zéro et recalcul avec ou sans Worker. La mention discrète et le texte Instagram hors du lien sont vérifiés. Rapports : **verification-v7.1/**. Les captures de la progression et d'À propos mobile ont été inspectées ; les gestes mobiles sont testés en émulation Chrome.

## Complément 1.7 : calcul ciblé, aperçu, pipette et fusion immédiate

Le calcul ciblé utilise les anciennes et nouvelles positions et tailles des supports modifiés, leurs références dans les contours et des rectangles englobants conservateurs incluant les arcs. Il inclut les voisines pouvant interagir, garde tous les supports de la grille comme obstacles, puis vérifie à nouveau l'emprise du résultat. Si celle-ci touche une forme exclue, le calcul recommence depuis le projet initial avec cette forme ajoutée. Les configurations entièrement connectées, les limites invalides et les expansions répétées utilisent le calcul complet. Les modifications globales restent intégrales. Le même fonctionnement est utilisé dans le Worker et dans le moteur de repli.

Les formes exclues gardent leurs données. Les tests comparent les pixels produits par le calcul ciblé et le calcul complet pour les déplacements, suppressions, fusions de formes voisines, ajouts et trous. Le scénario à 12 formes indépendantes en recalcule une et en conserve onze, sans différence de pixels ; les durées mesurées sont consignées dans `verification-v7/targeted-performance.json`. Ce relevé est indicatif, pas une garantie de performance sur téléphone.

L'aperçu repose sur la visibilité des éléments, sans changement de dimensions du canevas ni modification du projet. Il masque également la référence et bloque les éditions pendant le maintien. Relâchement hors du bouton, annulation tactile, Échap, perte de focus et changement de visibilité rétablissent l'édition. Le bouton fonctionne aussi au clavier, avec H ou Espace/Entrée quand il a le focus.

La pipette prélève la taille réelle sans modifier le projet. Chaque application attend le relâchement d'un clic et s'annule en une étape, miroir compris. Un glissement ou pincement ne copie rien. Le calcul de limite vérifie simultanément les copies du miroir, les arrondis et les voisins. La taille zéro, les éléments ajoutés et les tailles fractionnaires restent utilisables. Les données de pipette ne sont pas enregistrées dans le projet.

Merge applique immédiatement le calcul de centre et de taille existant. Le panneau de prévisualisation, sa jauge et ses boutons Apply/Cancel ont été retirés ; la jauge individuelle reste accessible après fusion. Les anciens tests ont été adaptés à cette interaction et continuent de couvrir les collisions, le miroir, les trous, les carrés et l'historique.

Les **123 contrôles** comprennent les 107 précédents et 16 nouveaux scénarios. Rapports actuels : **verification-v7/**. Les captures de bureau et mobiles ont été inspectées. Les gestes tactiles sont testés avec Chrome en émulation, sans nouvel essai sur un téléphone Android physique.

## Complément 1.6.1 : sélection des formes et metaball avec la flèche

La flèche reconnaît les formes et leurs tangentes, en conservant la priorité des cercles pour leur déplacement. Un geste commencé sur une forme reste un clic potentiel jusqu'au relâchement ; s'il se déplace, il devient un rectangle de sélection. Échap, un pincement, un changement d'outil ou une perte de focus ne déclenchent pas le metaball. Le seuil est exprimé en pixels d'écran et reste stable avec le zoom.

La sélection des formes partage son comportement avec le lasso. Le changement vers la flèche conserve la sélection ; les barres d'actions ne se superposent pas. Suppr choisit la forme ou les cercles selon la sélection. Les zones des tangentes restent limitées au remplissage visible, y compris pour les trous. Elles sont retirées pendant l'édition des cercles, puis reconstruites après le geste pour conserver l'aperçu rapide et éviter des cibles aux anciennes positions.

Les 93 contrôles précédents et 14 nouveaux scénarios passent, soit **107 contrôles**. La nouvelle suite couvre les clics, les rectangles, les déplacements, les annulations, les raccourcis, les trous, le miroir, les barres d'actions, le metaball réversible, le changement d'outil, le pincement et le double-tap tactile sans clavier. Les captures de bureau et d'émulation mobile ont été inspectées. Rapports : **verification-v6.1/**. Aucun nouvel essai sur un téléphone Android physique n'a été effectué pendant cette livraison.

## Complément 1.6 : ajout de supports et gestes de sélection

Le bouton Add remplace Size ; Maj + clic et l'appui long tactile remplacent Multiple. Le double-clic ou double-tap ouvre la jauge. L'appui long est abandonné dès que le doigt commence un déplacement ; le pincement annule l'ajout avant sa validation au relâchement.

Les nouveaux supports disposent d'identifiants indépendants de la grille. Toutes les énumérations de supports pour l'affichage, le lasso, les masques, les trous, le contraste et les collisions les incluent. La rotation transforme leur position réelle tout en conservant leur identifiant. Le format de projet 3 exige une position valide pour chaque nouveau support et rejette les références non définies.

Le placement calcule la taille disponible en tenant compte des arrondis, du canevas, des voisins et des autres copies du miroir. Il n'ajoute aucune forme pleine par défaut. Le calcul des tracés reste dans le Worker ; l'aperçu seul est calculé pendant le déplacement du pointeur.

Quinze scénarios d'ajout complètent les contrôles précédents : aperçu, ajout à une grille complète, annulation, collisions, miroir, carrés, remplissage, déplacement, taille, lasso positif et négatif, trous, fusion avec la grille, réutilisation d'identifiants supprimés, rotation, validation et sauvegarde. Les essais tactiles vérifient aussi le pincement pendant Add et le double-tap sans ouverture du clavier. Rapports actuels : **verification-v6/**. Les gestes mobiles sont vérifiés en émulation Chrome ; un essai sur le téléphone réel reste utile.

## Correction 1.5.1 : arrondi des éléments fusionnés

La géométrie imposait un disque aux éléments portant le marqueur de fusion, indépendamment du réglage global. Ce traitement particulier a été retiré. Le calcul des collisions et les aperçus de fusion utilisent aussi la forme réelle, y compris pour les copies du miroir.

Le test qui imposait une fusion ronde en mode carré vérifie désormais le carré et son aperçu. Trois scénarios supplémentaires couvrent les transitions cercle / carré arrondi / carré dans les guides et les exports, l'annulation et la réouverture, les supports de trous négatifs, le déplacement et les limites des fusions en miroir. Rapports actuels : **verification-v5.1/**.

## Complément 1.5 : sélection, fusion et déplacement

Rapports actuels : **verification-v5/**. La suite ajoute 24 scénarios aux 51 contrôles précédents : sélection souris et tactile, fusion prévisualisée, grands diamètres, collision à vitesse élevée, glissement, suppression des supports et des trous, tracés existants dont bug01, miroirs, rotation, historique, annulation pendant un calcul, sauvegarde et rechargement, validation des projets, moteur de repli et grille 30 × 30.

Les identifiants des cercles restent stables. Le représentant d'une fusion porte une position réelle, une taille et un indicateur de cercle ; les autres emplacements sont retirés. Les énumérations de guides, de remplissage, de sélection et de collision excluent les emplacements retirés. Un index spatial sert à retrouver les obstacles déplacés ou agrandis, y compris lorsque leur ancienne case est éloignée du tracé.

Le module **layout.js** répare les chaînes de supports avant de retendre les contours. Les trous, les soustractions et les jonctions sont inclus. Le module **node-editor.js** gère la sélection, la zone de déplacement, la prévisualisation et les transactions. Le déplacement procède par petits pas et vérifie aussi les contreparties du miroir. Les formes suivent les positions réelles pendant le geste ; l'ajustement final tourne dans le Worker. Les changements de fusion et de suppression sont appliqués ensemble à la fin du calcul.

Les éléments de guide fixes ne sont pas recréés pendant le déplacement. Seuls les éléments déplacés et les tracés qui en dépendent sont mis à jour. Lors d'une mesure locale intermédiaire sur 900 cercles, l'intervalle au 95e percentile entre images est passé d'environ 60 à 29 ms, et les tâches de plus de 50 ms ont disparu. Ce résultat décrit ce scénario sur cet ordinateur, pas une garantie de fréquence sur Android. La mesure de l'exécution finale est conservée dans **verification-v5/node-performance.json**.

Les commandes tactiles ont été vérifiées dans Chrome en émulation mobile. Le nouvel outil reste à essayer sur le téléphone réel de l'utilisateur. La sauvegarde des éditions de grille utilise le format de projet 2 ; le lecteur accepte aussi le format 1.

## Complément 1.4 : pixel art, fichiers et image de référence

**51 scénarios réussis** : les 37 contrôles précédents et 14 contrôles consacrés à cette livraison. Rapports dans `verification-v4/`.

Le remplissage mémorisait une taille absolue même quand l’utilisateur n’avait pas personnalisé la case. Les cases peintes héritent désormais de la taille globale ; les anciennes tailles absolues et les tailles personnalisées sont mises à l’échelle. Un rapport individuel conservé dans le projet permet de retrouver les proportions après zéro. Chaque aperçu repart de l’état initial du geste pour éviter l’accumulation d’arrondis.

Le crayon interpole le déplacement entre événements du pointeur et applique la même opération à toutes les cases visitées. Repasser sur une case ne l’inverse pas. Les versions souris et tactile, les miroirs, l’effacement, l’annulation unique et le passage à deux doigts sont vérifiés.

Save project demande un nom puis utilise [showSaveFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker) pendant l’activation utilisateur. La disponibilité de cette API dépend du navigateur. Le repli fournit un téléchargement nommé ; l’application ne peut pas imposer son dossier. Les tests simulent le choix système et vérifient l’écriture d’un vrai Blob JSON, la fermeture de l’écriture, l’annulation sans téléchargement et le nom du téléchargement de repli.

Les images importées sont décodées localement et normalisées en WebP, avec un côté maximal de 1 400 pixels. Le projet contient l’image ; l’historique et le Worker n’en dupliquent pas les données à chaque geste. L’import, les transformations, l’annulation, la sauvegarde automatique et la restauration sont testés. Les références distantes arbitraires dans un JSON sont rejetées.

La proposition automatique échantillonne la luminosité de l’image sur la grille. Elle construit des composantes connexes puis des contours modifiables, ou des cases remplies. Elle reste en aperçu jusqu’à Add to drawing. Les pixels transparents ne sont pas sélectionnés. Un trou clair dans une forme sombre reste vide. Les petites composantes utilisent chacune un masque recadré pour éviter de recalculer une grande image entière pour chaque morceau.

Un test sur 30 × 30 cases construit 100 formes séparées en arrière-plan ; l’interface continue de traiter les événements pendant le calcul. Le temps exact de cette exécution est dans `verification-v4/trace-performance.json`. Les essais mobiles sont des simulations tactiles ; cette version reste à essayer sur le téléphone réel. Le choix de dossier du système d’exploitation n’est pas piloté physiquement par les tests.

Les contrôles antérieurs ci-dessous décrivent les fonctions conservées.

## Modifications

| Sujet | Résultat |
| --- | --- |
| Sauvegarde | IndexedDB après modification terminée, récupération proposée au lancement, secours local lors du masquage/fermeture de page, indication des refus de stockage. |
| Navigation | Pincement, déplacement à deux doigts, molette, espace + glisser, remise à zéro. Les clics et la fenêtre de taille suivent la vue. |
| Tangentes | Repères tactiles conservés et commande contextuelle Smooth / Straighten. |
| Historique | Jauges, couleurs et symétrie annulables. Un geste ou une création en miroir correspond à une entrée. Annuler pendant un calcul attend sa fin pour conserver le rétablissement. |
| Organisation | Sources séparées dans `src/`, assemblage reproductible vers un HTML autonome et un site installable. Moteur partagé entre Worker et solution de repli. |
| Fluidité | Relaxation, masques et export fusionné dans un Worker. Miroir appliqué en une fois. Aperçus des jauges regroupés ; résultats obsolètes ignorés. Cache de la scène SVG, mise à jour séparée du trait de dessin. |
| Export fusionné | Intersections entre segments et arcs, distinction des régions pleines/vides par enroulement en double précision, réunion en chemin composé fermé. Aucun tracé raster. |
| Installation | Manifeste, icônes, cache hors ligne et commande d’installation. Mise à jour proposée sans rechargement pendant une modification. Polices locales du système. |
| Demandes personnelles | Jauge default size avec pourcentage, suppression de l’animation successive du miroir, mention Claude et ChatGPT / Codex dans Info, ancre Instagram réduite à @eulst. |

## Corrections précédentes conservées

Les régions négatives sont soustraites successivement : le chevauchement de deux trous reste vide. Lorsqu’un trou traverse le bord extérieur, la bordure est reconstruite et retendue autour des cercles, afin de supprimer les angles saillants observés dans `bug01`. Cette réparation s’applique aussi à l’import des anciens projets.

Toucher un cercle donne le focus à sa jauge ; le clavier reste réservé au champ numérique. Settings possède une action indépendante. Les exports fonctionnent sans `window.claude`. Le partage prépare un JPEG et respecte l’activation utilisateur ; un refus propose le téléchargement, tandis qu’une annulation ne le déclenche pas. Les imports sont validés avant de modifier le projet.

## Vérification

**37 scénarios automatisés réussis : 23 régressions et 14 scénarios supplémentaires, sans erreur JavaScript observée.** Un scénario compare aussi 30 combinaisons déterministes de cercles superposés, bords coïncidents, tailles variables et coins arrondis.

Exécution avec Google Chrome installé et Playwright, affichage de bureau et émulation tactile de 393 × 851 pixels. Les contrôles couvrent :

- Continuité des tangentes de `bug01`, trous superposés, ouverture traversante et conservation des îlots.
- Interactions mobiles, Settings, focus, annulation et rétablissement.
- Téléchargements SVG, EPS, PNG, JPEG, projet et SVG fusionné.
- Partage natif simulé : réussite, indisponibilité, refus et annulation.
- Miroir dans un Worker, sans copies intermédiaires visibles, annulation unique et rétablissement après annulation pendant le calcul.
- Retour d’une jauge à sa valeur initiale, historique des couleurs et des réglages.
- Pincement par événements tactiles, absence de dessin parasite, sauvegarde/rechargement/récupération.
- Comparaisons des régions remplies avant/après fusion et absence de masques dans le SVG final. Pour les bords coïncidents, la comparaison vectorielle ignore une bande de 0,02 unité autour des frontières, où les arrondis et l’anticrénelage diffèrent.
- Stockage refusé, absence de Worker, grille de 900 cercles, manifeste et icônes, rechargement et dessin avec réseau coupé.

Rapports : `verification-v3/results.json` et `verification-v3/improvements.json`.

## Fluidité mesurée

Mesure comparative sur cet ordinateur, même navigateur et même lasso créant quatre formes en miroir :

| Version / grille | Temps jusqu’au résultat complet | États visibles |
| --- | ---: | --- |
| 1.2 / 7 × 7 | 1 517 ms | 0 → 1 → 2 → 3 → 4 formes |
| 1.3 / 7 × 7 | 212 ms | 0 → 4 formes |
| 1.3 / 30 × 30 | 245 ms | 0 → 4 formes |

Environ sept fois plus rapide sur ce scénario. Aucune tâche de plus de 50 ms détectée sur le fil de l’interface pendant ces mesures. Il s’agit d’une mesure locale ponctuelle, pas d’une garantie de temps sur Android ou sur tout dessin. Détails : `verification-v3/benchmark.json`.

## Limites pratiques

La version 1.2 a été validée sur un véritable téléphone par l’utilisateur. Les nouvelles fonctions de 1.3 ont été vérifiées en émulation tactile ; elles restent à essayer sur ce téléphone. La feuille de partage système et l’installation complète par le menu Android ne sont pas pilotées par ces tests.

La relaxation reste une méthode numérique ; des combinaisons géométriques inhabituelles peuvent nécessiter un nouveau cas de reproduction. L’export fusionné utilise une tolérance de raccordement de 0,00001 unité et six décimales. S’il ne parvient pas à fermer un contour, il explique l’échec et laisse disponible l’export SVG habituel. Le rendu dans Illustrator et l’interprétation PostScript de l’EPS n’ont pas été vérifiés dans ces applications.

La sauvegarde couvre la dernière modification achevée sur ce navigateur, pas un calcul interrompu par fermeture forcée. Elle ne synchronise pas les appareils. Le mode installable est fourni prêt à héberger ; sa publication HTTPS reste une étape distincte.
