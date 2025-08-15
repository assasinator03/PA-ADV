# Police-Academy-ADV
Intranet prêt à l'emploi pour la gestion des effectifs, grades, formations et historique.
Technos : Node.js (Express) + SQLite + EJS + Sessions.

## Démarrage rapide
1) Installer Node.js (v18+ recommandé).
2) Dans un terminal :
```
cd Police-Academy-ADV
npm install
npm start
```
3) Ouvrir http://localhost:3000

### Comptes par défaut
- **admin / admin123** — rôle ADMIN — devra changer son mot de passe à la première connexion.

### Rôles
- **ADMIN** : gestion des comptes (créer, supprimer, attribuer rôle). Accès total.
- **PA** : peut créer/éditer les fiches agents et enregistre l'historique.
- **AGENT** : lecture seule (peut chercher par matricule et consulter les fiches & l’historique).

### Données
- La base SQLite est créée automatiquement au premier lancement (`police-academy.sqlite`).
- Formations : 10-20, ISTC, procédure, first-Lincoln, Déminage.
- Grades : rookie, officier-I, officier-II, officier-III.
- Brigades : Mary, ASD, BIJ, DOA, Crime, HP, Medic, PA.

### Personnalisation
- Logo : `public/images/logo.png`.
- Styles : `public/css/styles.css` (fond bleu, mise en page moderne).
