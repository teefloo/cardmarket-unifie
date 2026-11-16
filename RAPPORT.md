# Rapport de préparation

## Périmètre actif

Le manifeste ne charge que les modules ciblés sur les fiches Pokémon de Cardmarket, dont `pokemon-offers.js` pour les tags d’offres scellées/gradées. Les minima suivent le thème du site; le graphique historique suit aussi ses couleurs et reste limité aux fiches Singles avec autorisation réseau facultative. Les modules historiques hors de ce périmètre ne figurent pas dans le paquet Store créé par le script de préparation.

## Confidentialité et réseau

Les préférences et l’analyse des offres restent locales. La page `privacy.html` détaille l’unique requête externe facultative, envoyée sans cookies et limitée aux historiques de fiches Singles Pokémon. Les logos de gradation sont locaux; les fonctions de suivi de prix externes, les boutiques partenaires et les outils sur les commandes ne sont plus chargés dans le paquet.

## État des validations

Validations exécutées sur le candidat courant :

- `node --test --test-reporter=spec tests/pokemon-offers.test.js tests/pokemon-display.test.js tests/content-integrations.test.js tests/runtime-guard.test.js tests/offer-language.test.js tests/settings.test.js tests/page-tools.test.js` : 67 réussis, 0 échec.
- `node --test --test-reporter=tap tests/*.test.js` : 208 réussis, 0 échec.
- `for file in *.js tests/*.test.js scripts/*.mjs; do node --check "$file" || exit 1; done` : syntaxe JavaScript vérifiée.
- Les manifests source et empaqueté se parsèrent et sont identiques (`cmp -s manifest.json dist/chrome-web-store/manifest.json`). Le script de préparation vérifie aussi la présence des fichiers référencés par le manifeste.
- `node scripts/package-webstore.mjs` : dossier de staging et archive ZIP créés; 36 fichiers copiés.
- `unzip -l dist/pokemon-cardmarket.zip` : contenu de l’archive inspecté, icônes incluses.
- `git diff --check` : aucune erreur d’espacement.

Le test navigateur réel n’a pas été effectué. Il reste à installer le candidat dans Chrome et vérifier sur Cardmarket les fiches Singles et scellées, les tags de gradation/scellé, les thèmes clair/sombre ainsi que la reprise après défi Cloudflare. Aucun défi Cloudflare ne doit être contourné.

## Conditions restantes pour une publication

- Confirmer le droit d’interroger et d’afficher les données du fournisseur du graphique.
- Héberger `privacy.html` sur une URL publique et la déclarer dans le tableau de bord du Chrome Web Store.
- Ajouter un moyen de contact public, les visuels du Store, les déclarations et justifications demandées par le tableau de bord.
- Effectuer une vérification manuelle sur Cardmarket pour les Singles, produits scellés, filtres natifs, pages Cloudflare et navigation; produire ensuite une capture de fiche réelle pour le Store.
- Examiner l’archive empaquetée finale avant envoi. Ce rapport ne déclare pas l’extension conforme ou publiée.
