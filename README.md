<p align="center">
  <img src="assets/cardmarket-unifie.svg" width="360" alt="Cardmarket Unifié — identité visuelle originale">
</p>

# Cardmarket Unifié

[![Tests](https://github.com/teefloo/cardmarket-unifie/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/teefloo/cardmarket-unifie/actions/workflows/tests.yml)

**Extension Chrome Manifest V3** pour Cardmarket et les jeux de cartes à collectionner (TCG). Elle réunit des outils de prix, de filtres, de suivi de listes et de graphiques historiques dans une interface unique.

> **English summary:** Cardmarket Unifié is an independent Chrome MV3 extension for Cardmarket, with price tools, multi-language filters, read-only Matras charts and collection/order helpers.

## Fonctions principales

- **Prix de vente :** Première offre, Moyenne, tendances 1/7/30 jours, professionnel, From et Min; ajustement, plancher, raccourcis et aperçu de lot.
- **Offres et recherche :** filtre instantané texte/langue/état, choix multiple des langues natives, pays vendeur, prix par état et avertissements de doublons.
- **Graphiques :** historique Matras en lecture seule, périodes et séries sélectionnables; le graphique Cardmarket natif reste accessible.
- **Listes et commandes :** recherche locale dans les listes Wants après lecture à la demande, préparation avec confirmation, checklist et aides de recherche d’ordres.
- **Autres outils :** aperçu de liens dans les messages au clic, copie de lignes/coordonnées, badges d’attributs de cartes et liens de boutiques partenaires facultatifs.

Les réglages regroupent les outils par usage. Chaque fonction peut être activée séparément; le popup fournit l’interrupteur général et le total de session.

## Installation dans Chrome

1. Télécharge ou clone ce dossier sur ton ordinateur.
2. Ouvre `chrome://extensions` et active le **mode développeur**.
3. Choisis **Charger l’extension non empaquetée** puis sélectionne `cardmarket-unifie/`.
4. Ouvre le popup pour accéder aux Réglages. Les permissions pour Matras, l’estimation d’envoi, Mave et les boutiques ne sont demandées que si tu actives ces services.

Les réglages des anciennes extensions ne sont pas importés automatiquement. Les projets sources ne sont pas inclus dans ce dossier.

## Permissions et données

L’extension requiert le stockage local et l’accès aux pages Cardmarket. Les accès optionnels sont séparés : Matras (lecture de l’historique), help.cardmarket.com (devis d’envoi), Mave (signalement facultatif de prix publics) et trois boutiques partenaires. Les permissions peuvent être retirées depuis Réglages.

Matras est utilisé en lecture seule; aucun relevé n’y est envoyé. Les recherches Wants et d’ordres lisent les pages uniquement après une action explicite. Les changements d’alerte, ajouts Wants et suivis demandent un clic de confirmation. Le calculateur remplit le prix seulement au clic et ne sauvegarde pas l’offre.

## Validation et limites

Les tests automatisés sont lancés localement avec :

```sh
node --test --test-reporter=tap tests/*.test.js
```

Dernier résultat documenté : **232 tests réussis**. Le workflow GitHub Actions exécute la même suite sur Node 22 à chaque push et pull request. Les tests de réseau utilisent des réponses simulées; ils ne prouvent pas le comportement de chaque page Cardmarket réelle. Un contrôle navigateur le 15 novembre 2026 a confirmé l’injection du panneau et le fonctionnement du filtre de langue sur une fiche produit scellé; aucun achat ni changement d’offre n’a été effectué. Les résultats agrégés et limites sont dans [RAPPORT.md](RAPPORT.md) et [INVENTAIRE.md](INVENTAIRE.md).

La parité complète avec les trois extensions d’origine n’est pas revendiquée. Le catalogue promo n’est qu’un échantillon de trois correspondances; l’historique temporel agrégé du panier, l’outil Companion historique Apply/Undo et le compteur privé de soutiens sont absents. L’aide acheteur/vendeur reste partielle. Les comportements authentifiés et plusieurs pages de commandes restent à valider en direct.

## Réutilisation et provenance

Ce dépôt n’a pas de fichier `LICENSE` et n’accorde actuellement aucune licence de réutilisation. Le code, le logo et les wordmarks présents ici ont été réimplémentés séparément; aucun code ou visuel des trois extensions sources n’est inclus. Certaines fonctionnalités ont été étudiées à partir de bundles locaux dont les conditions de réutilisation ne sont pas établies. Ne présume pas que leurs licences couvrent ce dépôt. La provenance des wordmarks est indiquée dans [`assets/grading/PROVENANCE.md`](assets/grading/PROVENANCE.md).

## Sujets GitHub proposés

`chrome-extension` · `cardmarket` · `tcg` · `pokemon` · `magic-the-gathering` · `yu-gi-oh` · `price-tracker`
