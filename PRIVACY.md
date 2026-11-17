# Politique de confidentialité — Pokémon Cardmarket

**Mise à jour : 18 novembre 2026**

Pokémon Cardmarket est une extension indépendante qui ajoute des outils de recherche et de comparaison de prix aux pages du JCC Pokémon sur Cardmarket. Elle n’est affiliée ni à Cardmarket ni à The Pokémon Company.

L’éditeur responsable est celui indiqué sous « Offert par » sur la fiche de l’extension dans le Chrome Web Store. Pour le contacter au sujet de cette notice ou de vos données, utilisez le lien **Assistance** de cette fiche.

## Informations traitées

Sur les pages Pokémon prises en charge, l’extension lit le contenu nécessaire à ses fonctions : chemin de la page, nom et identifiant de la carte, URL de son image, offres visibles, prix, langue et état. Dans une liste Wants, elle lit aussi les cartes choisies et leurs critères de langue et d’état. Cela relève du contenu de site Web, de l’activité de navigation et, pour la liste Wants, du contenu de la liste fourni par l’utilisateur.

Ces informations sont traitées dans le navigateur pour afficher les miniatures, les prix minimums, les filtres et l’historique demandé. Le développeur ne reçoit pas le contenu des pages, des offres ou des listes Wants. Pour calculer les prix mini et obtenir les miniatures d’une Wants, l’extension demande les fiches produit correspondantes et, si nécessaire, les paramètres de la Want à Cardmarket. Ces requêtes restent sur Cardmarket et utilisent la session normale du navigateur; les images sont chargées depuis l’hôte d’images de Cardmarket `product-images.s3.cardmarket.com`. L’extension ne lit pas les valeurs des cookies et ne les envoie pas au service d’historique ou à un autre domaine.

La préférence de langue et les options d’affichage sont enregistrées dans le stockage local de Chrome (`chrome.storage.local`) jusqu’à leur effacement ou à la désinstallation de l’extension. Lors d’une migration depuis une ancienne version, l’extension lit ce stockage pour restaurer les préférences compatibles et supprimer les réglages obsolètes; elle ne transmet pas ces données. Une clé de session dans l’onglet conserve temporairement le filtre Cardmarket remplacé et sa valeur précédente, afin de pouvoir le restaurer; elle est supprimée avec la session de l’onglet.

## Service d’historique facultatif

Le réglage d’affichage de l’historique est activé dans les préférences initiales, mais aucune requête à ce service n’est envoyée sans l’autorisation facultative `https://charts.matrastcg.de/*`, que l’utilisateur doit accorder dans Réglages et peut retirer à tout moment. Pour afficher l’historique d’une fiche Pokémon Singles, l’extension envoie à `charts.matrastcg.de` le numéro public du produit, le jeu Pokémon et le chemin public de la fiche. La requête utilise `credentials: omit` : elle n’inclut pas de cookie Cardmarket, de nom de compte, de liste Wants, d’offre ou d’information de commande. Comme toute requête Internet, elle révèle au service les métadonnées réseau habituelles, notamment l’adresse IP. Le traitement et la conservation éventuelle par ce service relèvent de ses propres pratiques.

## Partage et utilisation limitée

L’extension respecte la politique des données utilisateur du Chrome Web Store, y compris ses exigences « Limited Use » (« utilisation limitée »). Les données de pages et de listes ne sont utilisées que pour fournir les fonctions visibles décrites dans cette notice. Les seules requêtes réseau produites par l’extension concernent Cardmarket (fiches, paramètres Wants et images nécessaires aux prix et aperçus) et, après autorisation facultative, la demande d’historique décrite ci-dessus. Aucun autre transfert n’est effectué. Les données ne sont ni vendues, ni utilisées pour la publicité personnalisée, le ciblage ou le profilage. Le développeur ne reçoit ni ne consulte le contenu des pages, des offres ou des listes, et aucun accès humain à ces contenus n’est prévu. L’extension ne contient pas d’outil d’analyse ou de suivi et n’effectue aucun achat ni ajout au panier.

## Contrôle et conservation

L’utilisateur peut désactiver l’extension depuis son menu, retirer l’accès facultatif au service d’historique dans Réglages ou dans la page des extensions Chrome, et supprimer ses préférences en effaçant les données de l’extension ou en la désinstallant. Les informations lues sur Cardmarket ne sont conservées que dans la page ouverte et ne font pas l’objet d’un historique créé par l’extension.

Pour toute question de confidentialité, utilisez le lien **Assistance** de la fiche de cette extension dans le Chrome Web Store. En France, une réclamation peut également être adressée à la [CNIL](https://www.cnil.fr/); les utilisateurs d’autres pays peuvent contacter leur autorité de protection des données.

L’extension ne demande pas l’âge des utilisateurs et ne cherche pas à recueillir les données personnelles d’enfants.

*Cette notice décrit le fonctionnement de l’extension à la date indiquée. Elle constitue une information générale, pas un avis juridique adapté à une situation particulière; consultez un avocat ou un professionnel qualifié pour un tel avis.*
