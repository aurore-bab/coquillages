| Fichier | Rôle |
| :--- | :--- |
| `index.html`, `roches.html`, `coquillages.html`, `fossiles.html`, `carte-monde.html` | Pages : structure seulement, aucune donnée. |
| `element.html`, `lieu.html` | Modèles de fiches, remplis dynamiquement d’après l’URL. |
| `css/style.css` | Palette, menu, accueil, listes, messages. |
| `css/carte-fiches.css` | Cartes, boutons, fiches, carrousel. |
| `data/collections.json` | Toutes les données. |
| `js/utils.js` | Normalisation des noms, lecture de l’URL, création sûre d’éléments HTML. |
| `js/icones.js` | Icônes SVG. |
| `js/models.js` | Classes Specimen, Coquillage, Fossile, Roche, Lieu. |
| `js/data.js` | Chargement du JSON, recherche, création en mémoire. |
| `js/relations.js` | Liens spécimens ↔ lieux, déclarés dans un sens ou dans l’autre. |
| `js/navigation.js` | Menu commun. |
| `js/composants.js` | Liste et vignettes réutilisables. |
| `js/collection.js` | Pages de collection et carte du monde. |
| `js/carte.js` | Cartes Leaflet. |
| `js/carrousel.js` | Carrousel d’images. |
| `js/fiche-commun.js` | Bouton retour et blocs communs aux fiches. |
| `js/fiche-element.js`, `js/fiche-lieu.js` | Fiches. |
| `js/verification.js` | Contrôle de cohérence du JSON (console). |
| `images/…` | les photos, un sous-dossier par catégorie. |