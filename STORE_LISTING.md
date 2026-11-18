# Fiche Chrome Web Store — Pokémon Cardmarket

## Texte de la fiche

**Nom**

Pokémon Cardmarket

**Résumé**

Miniatures et prix mini sur les listes Wants, prix par état et filtre de langue pour les cartes Pokémon sur Cardmarket.

**Description**

Extension indépendante pour repérer des cartes et comparer les offres du JCC Pokémon sur Cardmarket.

Dans vos listes Wants, les cartes s’affichent en petit aperçu, avec leur nom dans une colonne dédiée et un prix mini calculé selon la condition et la langue choisies. Vous pouvez voir ces repères avant d’ouvrir le Shopping Wizard.

Sur les fiches produit Pokémon, l’extension affiche le prix minimum des offres visibles par état et applique votre langue préférée au filtre natif du site. Elle signale aussi les mentions explicites de cartes scellées ou gradées. Un graphique d’historique est disponible en option sur les fiches Singles.

Les listes, critères et offres sont traités dans votre navigateur. Les réglages restent dans le stockage local de Chrome. Pour calculer les prix mini et afficher les aperçus, l’extension consulte les fiches produit et, si nécessaire, les paramètres Wants sur Cardmarket avec la session normale du navigateur; les images proviennent de l’hôte d’images Cardmarket. Le réglage d’affichage de l’historique est actif initialement, mais aucune requête à `charts.matrastcg.de` n’est envoyée sans l’autorisation facultative accordée par l’utilisateur dans Réglages. Après autorisation, cette requête contient le numéro public du produit, le jeu Pokémon et le chemin public de sa fiche, sans cookie Cardmarket ni donnée de compte.

L’extension n’achète rien, n’ajoute aucun article au panier et ne modifie pas les offres. Elle n’est affiliée ni à Cardmarket ni à The Pokémon Company.

## Valeurs à renseigner dans le tableau de bord

- Langue de la fiche : français
- Catégorie : Shopping
- Icône : `assets/store/chrome-icon-128.png`
- Capture d’écran principale : `assets/store/wantlist-screenshot-1280x800.png` — capture réelle de la liste Wants Cardmarket, recadrée pour montrer le tableau sans le nom ni le solde du compte.
- Petite image promotionnelle (440 × 280) : `assets/store/cws-promo-440x280.png` — visuel promotionnel, pas une capture de l’interface; il utilise de vraies images produit Cardmarket et aucun prix inventé.
- Image promotionnelle panoramique (1400 × 560) : `assets/store/cws-marquee-1400x560.png` — visuel promotionnel, pas une capture de l’interface; il utilise de vraies images produit Cardmarket et aucun prix inventé.
- Politique de confidentialité : <https://gist.github.com/teefloo/1a335b487e7038b581022c5423018d78>
- Page d’assistance : laisser vide et utiliser le Centre d’assistance intégré au Chrome Web Store
- Distribution : tous les pays/régions, extension gratuite, contenu mature désactivé

## Déclaration des pratiques de confidentialité

Déclarer les catégories traitées même si les données des pages et listes restent dans le navigateur :

- **Contenu de site Web** : noms et identifiants de produits, URL d’image, offres visibles, prix, langue et état; critères de liste Wants affichés sur Cardmarket.
- **Activité de navigation** : chemin de la fiche Pokémon Cardmarket ouverte, nécessaire pour reconnaître la page et, si l’accès facultatif est autorisé, demander l’historique du produit.
- **Contenu généré par l’utilisateur** : cartes et critères de langue/condition enregistrés dans une liste Wants, traités localement pour calculer le prix mini. Ils ne sont pas envoyés au service d’historique.

Destinataires et traitement à déclarer :

- **Stockage local Chrome** : langue et réglages d’affichage; une migration peut lire les préférences de versions antérieures et supprimer les réglages devenus obsolètes. Les données de page et de liste ne sont pas persistées par l’extension.
- **Cardmarket et son hôte d’images `product-images.s3.cardmarket.com`** : requêtes nécessaires pour lire les fiches produit, paramètres Wants et miniatures, avec la session normale du navigateur.
- **`charts.matrastcg.de`** : uniquement après autorisation facultative, reçoit le numéro public du produit, le jeu Pokémon et le chemin public de la fiche pour retourner le graphique. Le service reçoit aussi les métadonnées réseau usuelles, dont l’adresse IP. La requête utilise `credentials: omit`.
- **Éditeur** : ne reçoit ni ne consulte le contenu des pages, offres ou listes. Aucun service d’analyse, de publicité ou de suivi n’est intégré.

### Déclaration Limited Use

Faire figurer cette déclaration affirmative sur la notice de confidentialité publique liée dans le tableau de bord, et conserver une déclaration cohérente dans la notice locale :

> Nous confirmons que l’utilisation des données par cette extension respecte la politique des données utilisateur du Chrome Web Store, y compris ses exigences « Limited Use » (« utilisation limitée »). Les données ne sont utilisées que pour fournir les fonctions décrites, ne sont pas vendues ou utilisées pour la publicité personnalisée, et ne sont transférées qu’à Cardmarket pour les requêtes nécessaires ou à `charts.matrastcg.de` pour l’historique après autorisation. Le développeur ne reçoit ni ne consulte le contenu des pages, offres ou listes; aucun accès humain à ces contenus n’est prévu.

Vérifier avant soumission que les catégories et destinataires du tableau de bord correspondent à ces déclarations. La politique publique hébergée doit être mise à jour avec le contenu final de `PRIVACY.md`; ce dépôt ne met pas à jour la copie publique.

## Autorisations

- `storage` : enregistrer localement la langue et les options d’affichage.
- Accès aux pages Pokémon Cardmarket : lire les offres et critères nécessaires aux aperçus et minima affichés.
- Accès facultatif à `charts.matrastcg.de` : charger l’historique seulement après activation et autorisation par l’utilisateur.
