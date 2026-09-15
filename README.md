# QHSEFlow V6 — Prototype

Version orientée productivité et workflow QHSE.

## Nouveautés
- Inspection → action corrective en un clic
- Photos/preuves sur les fiches
- Boutons Ajouter / Modifier / Supprimer
- Recherche instantanée
- Clôture des actions
- Rapport individuel imprimable / PDF
- Export CSV compatible Excel
- Matrice P×G automatique
- Notifications et dashboard
- Journal des opérations

## Lancer
1. Node.js 20+ recommandé.
2. Dans ce dossier : `npm install`
3. Puis : `npm start`
4. Ouvrir `http://localhost:3000`

Compte démo : `admin@qhse.local` / `admin123`

Les données sont dans `data/qhse.json`; les photos dans `uploads/`.


Correctif V5.2 : le bouton « Ajouter » utilise maintenant une fonction dédiée `showForm()` avec contrôle de la section active, suppression d'un ancien éditeur et défilement automatique. Cela évite le problème d'ajout qui pouvait rester sans effet dans certains navigateurs.
