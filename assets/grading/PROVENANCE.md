# Provenance des logos de gradation

L’extension utilise les fichiers placés dans `assets/grading/logos/`. Quinze fichiers proviennent des copies candidates fournies localement dans `/private/tmp/cardgrading-logos/`; elles ne contenaient ni URL de téléchargement ni métadonnées de licence. Les sources distinctes de PCA et SGC sont documentées dans leurs lignes ci-dessous. Les références de sites officiels identifient les sociétés mais ne signifient pas qu’une licence d’usage a été accordée.

| Marque détectée | Fichier inclus | Source du fichier et référence |
| --- | --- | --- |
| PSA | `logos/psa.jpg` | `psa.jpg` — [psacard.com](https://www.psacard.com/), [guide de marque PSA](https://resources.psacard.com/PSA-Style-Guide.pdf) |
| BGS | `logos/bgs.jpg` | `bgs.jpg` — [Beckett Grading](https://www.beckett.com/grading) |
| CGC | `logos/cgc.png` | `cgc.png` — [CGC Cards](https://www.cgccards.com/) |
| Collect Aura | `logos/collect-aura.png` | `collect-aura.png` — [Collect Aura](https://www.collectaura.com/en) |
| Pure Grading | `logos/pure-grading.svg` | `pure-grading.svg` — [Pure Grading](https://www.puregrading.com/) |
| CCC | `logos/ccc.svg` | `ccc.svg` — [CCC Grading](https://cccgrading.com/en/faq) |
| AGS | `logos/ags.svg` | `ags.svg` — [AGS Card](https://agscard.com/) |
| ACE | `logos/ace.svg` | `ace.svg` — [ACE Grading](https://framer.acegrading.com/) |
| TAG | `logos/tag.png` | `tag.png` — [TAG Grading](https://taggrading.com/) |
| GRAAD | `logos/graad.png` | `graad.png` — [GRAAD](https://www.graad.eu/) |
| MNT | `logos/mnt.png` | `mnt.png` — [MNT Grading](https://mntgrading.com/) |
| ARS | `logos/ars.png` | `ars.png` — [ARS Grading](https://www.ars-grading.com/) |
| KSA | `logos/ksa.jpg` | `ksa.jpg` — [KSA Certification](https://www.ksagrading.com/) |
| GMA | `logos/gma.png` | recadrage réel de `gma-left.png`, zone du logo supérieur gauche (156 × 72 px) — [GMA Grading](https://gmagrading.com/) |
| HGA | `logos/hga.svg` | `hga.svg` — [HGA / Hybrid Grading Approach](https://hybridgrading.com/) |
| PCA | `logos/pca.png` | Fichier complet 440 × 143 px depuis le CDN tiers [`primary.jwwb.nl`](https://primary.jwwb.nl/public/r/b/j/temp-profycumnjgwqpqpzroz/pca_logo-high.png), trouvé via la page [PokePiece sur les cartes PCA](https://www.pokepiece.fr/cartes-gradees-pca). Il ne provient pas du site officiel PCA; l’ancienne URL d’affichage PokePiece avec paramètre `crop` tronquait l’étoile et n’est pas utilisée. |
| SGC | `logos/sgc.png` | Logo officiel 556 × 385 px, directement depuis [`gosgc.com/assets/img/pick-up.png`](https://www.gosgc.com/assets/img/pick-up.png). |

Les droits d’usage de ces visuels ne sont pas établis par leur présence sur un site officiel ou CDN. La [politique officielle de marque PSA](https://app.collectors.com/trademarkpolicy) encadre explicitement l’usage de ses logos et exige une licence écrite; les [conditions CGC](https://www.cgccards.com/legal/terms-of-use/) protègent explicitement leurs marques et logos, et les [conditions TAG](https://taggrading.com/pages/terms) réservent les droits sur leurs logos et contenus. Aucune licence d’utilisation n’est confirmée pour les logos inclus. Leur présence ne signifie ni affiliation, ni partenariat, ni approbation par les sociétés de gradation. Avant une publication publique, vérifier les droits applicables ou remplacer les logos par des visuels dûment licenciés.

Les anciens SVG dessinés localement dans le dossier parent sont conservés pour le module historique `page-tools.js`; ils ne sont plus déclarés dans le manifeste ni copiés dans le paquet de l’extension Pokémon.
