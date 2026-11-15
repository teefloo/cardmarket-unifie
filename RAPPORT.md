# Rapport de validation — version partageable

**État : DONE_WITH_CONCERNS.** L’extension se charge localement comme extension Chrome Manifest V3. La parité fonctionnelle complète avec les trois sources n’est pas revendiquée.

Ce rapport volontairement agrégé ne publie aucun nom de vendeur, identifiant de rangée/offre, identifiant de compte, total de session, prix saisi ou chemin de produit consulté. Les observations ci-dessous décrivent uniquement le résultat des contrôles et leur portée.

## Vérifications locales

- `node --test --test-reporter=tap tests/*.test.js` : **232 tests réussis**, aucun échec.
- `node --check` sur les scripts JavaScript et les tests : aucune erreur de syntaxe.
- `manifest.json` valide et déclare Manifest V3. Le stockage est requis; les hôtes non essentiels restent optionnels.
- Tests de réseau simulés : aucune requête de test vers Matras, Mave, les boutiques, les listes ou les formulaires Cardmarket n’a été envoyée. Les actions d’écriture restent explicitement déclenchées et testées avec des transports simulés.
- Le workflow `.github/workflows/tests.yml` lance la suite Node 22 sur chaque push et pull request.

## Observations navigateur agrégées

Le 15 novembre 2026, une fiche produit Cardmarket scellé a montré le panneau flottant et le filtre de langue. Le changement de choix de langue a masqué puis réaffiché les offres; le mode de prix a pu être changé puis restauré. Aucun achat, changement d’offre, ajout de panier ou autre transaction n’a été effectué. Le graphique historique n’était pas présent sur cette famille de produit.

Sur des fiches produit accessibles lors d’essais précédents, le graphique Matras a tracé les séries prix et disponibilité, changé de période, affiché une valeur au survol et laissé le graphique Cardmarket natif être restauré. Le calculateur vendeur a rempli un champ de prix après clic, sans soumettre le formulaire. Le filtre texte/langue/état, les badges de gradation, les liens par état et les liens de recherche d’ordres ont aussi été observés. Les destinations de recherche d’ordres n’ont pas été ouvertes.

Ces observations viennent de plusieurs essais et états de test; elles ne constituent pas une validation exhaustive de chaque route ni de chaque réglage. Les parcours authentifiés ne sont pas couverts; aucun détail de préférence ou de session n’est publié ici.

## Limites restant à vérifier

- Plusieurs fonctions sont seulement vérifiées par tests Node/DOM simulés; celles qui nécessitent un compte, une page de commande ou des permissions optionnelles ne sont pas validées en direct.
- L’aperçu positif d’une image de carte après le correctif, l’estimation réelle des frais, les actions Wants authentifiées, le suivi, le filtre pays et les partenaires après correctif restent à tester sur les pages concernées.
- Le catalogue de promos n’est qu’un échantillon. Le total temporel agrégé du panier, Apply/Undo multi-offres de Companion et le compteur privé de soutiens restent absents. L’aide acheteur/vendeur demeure partielle.
- Certains essais Cardmarket n’étaient pas accessibles depuis le navigateur de test. Aucun contrôle d’accès ni challenge n’a été contourné.

Voir [INVENTAIRE.md](INVENTAIRE.md) pour la correspondance fonctionnelle détaillée et les statuts des tests locaux/live.
