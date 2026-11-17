# Pokémon Cardmarket

Extension Chrome Manifest V3 pour le JCC Pokémon sur Cardmarket. Elle applique une préférence de langue avec le filtre natif du site, affiche des minima visibles par état et ajoute des tags locaux pour les offres explicitement scellées ou gradées. Le graphique d’historique reste disponible pour les fiches Singles.

## Fonctionnement

- Les scripts sont chargés sur les fiches produit Pokémon et les pages Pokémon Wants de Cardmarket, avec ou sans préfixe de langue.
- Les fonctionnalités des fiches s’exécutent uniquement sur un produit Pokémon reconnu. Les pages d’une liste Wants affichent une vignette compacte et un prix minimum calculé avant l’ouverture du Shopping Wizard.
- Une langue choisie dans Réglages devient le filtre natif `language` de Cardmarket. « Toutes les langues » laisse le filtre du site agir normalement. Le choix natif manuel est conservé pour la fiche en cours.
- Le bloc de prix calcule le prix minimum par état parmi les offres visibles. Il affiche `—` lorsqu’aucune offre visible ne correspond à l’état.
- Sur une page Wants, le prix minimum respecte la condition et la langue de chaque carte. La langue préférée des Réglages sert de filtre de repli si la Want ne fixe pas de langue. Les fiches produit et paramètres Wants nécessaires sont lus sur Cardmarket, à mesure que les lignes approchent de l’écran; aucune donnée n’est envoyée à un service externe.
- Les tags « scellé » et société/note de gradation apparaissent près de l’état seulement quand une mention explicite est trouvée dans les informations de l’offre ou son commentaire. Les sociétés de gradation sont affichées en texte avec leur note; aucun logo de société n’est intégré.
- Les couleurs du graphique, des minima et des tags suivent le thème clair ou sombre de Cardmarket.
- Les pages de vérification Cloudflare ne sont ni manipulées ni contournées. L’extension attend passivement que les marqueurs du défi disparaissent; une navigation/recharge normale relance aussi l’initialisation.

## Données et autorisations

Le réglage de langue et les options d’affichage sont enregistrés dans `chrome.storage.local`. La page de confidentialité locale décrit les données lues et le seul service externe facultatif. L’extension ne charge pas de bibliothèque distante et n’envoie aucune offre à un service de suivi.

Le seul accès réseau facultatif externe est `charts.matrastcg.de`, utilisé sans cookies pour obtenir l’historique d’une fiche Pokémon Singles après autorisation dans Réglages. Les lectures des fiches produit et des paramètres Wants restent sur Cardmarket et utilisent la session normale du navigateur. Les autres pages et domaines ne reçoivent pas de script de contenu.

## Installation de développement

1. Ouvre `chrome://extensions` et active le mode développeur.
2. Lance `node scripts/package-webstore.mjs`, puis choisis **Charger l’extension non empaquetée** et sélectionne `dist/chrome-web-store`.
3. Recharge le paquet après une modification, puis vérifie une fiche Singles et une fiche Pokémon scellée.

La suite de tests locale s’exécute avec `node --test --test-reporter=tap tests/*.test.js`.

## Préparation à la distribution

Le script crée un dossier de staging autonome de 20 fichiers dans `dist/chrome-web-store` et l’archive d’envoi `dist/pokemon-cardmarket.zip`. Il comprend le helper Pokémon ciblé et les icônes Chrome originales de `assets/store/`. Les captures et visuels promotionnels pour le tableau de bord restent dans `assets/store/` et ne sont pas ajoutés au ZIP de l’extension. Le dossier source contient encore des modules et tests historiques non chargés par le manifeste; ne distribue pas le dossier source complet.

`PRIVACY.md` décrit les données lues, leur traitement local et la requête facultative d’historique. Une copie publique de la notice est liée dans `STORE_LISTING.md`. Les captures utilisent des noms et prix fictifs, sans donnée de liste personnelle. La page Wants a été contrôlée dans Chrome; le tableau de bord doit encore être rempli avec les déclarations de confidentialité et de distribution avant soumission. Les droits d’utilisation du service d’historique facultatif restent à confirmer. Aucune publication sur le Chrome Web Store n’a été effectuée.

Les mentions des sociétés de gradation sont de simples libellés textuels qui identifient les offres; aucun logo ni affiliation n’est revendiqué. Les fichiers de logos dont la licence n’était pas confirmée ont été retirés et sont recensés dans `assets/grading/PROVENANCE.md`.
