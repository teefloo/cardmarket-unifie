# Inventaire du paquet Pokémon

| Élément | Usage dans la version préparée |
| --- | --- |
| `manifest.json` | Restreint l’injection aux routes Cardmarket Pokémon et aux ressources nécessaires. |
| `runtime-guard.js` | Reconnaît les marqueurs Cloudflare et attend passivement leur disparition. |
| `settings.js` / `options.*` | Stocke une langue préférée unique et les deux options d’affichage. |
| `content.js` / `pokemon.css` | Applique le filtre natif, calcule les minima visibles par état et affiche le graphique disponible sur Singles. |
| `background.js` | Valide et relaie uniquement la requête d’historique Pokémon, sans cookies. |
| `privacy.html` | Décrit le stockage local et le service d’historique facultatif. |

Le script de préparation copie uniquement ces éléments et leurs dépendances UI. Les anciens modules et leurs tests restent dans le dépôt de développement, mais ne sont pas chargés ni copiés dans le paquet Store. Les 17 logos locaux de grading utilisés par les badges sont inclus dans le paquet; leurs sources et limites de droits sont documentées dans `assets/grading/PROVENANCE.md`.
