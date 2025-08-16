# Police-Academy-ADV

Prototype web app "Police-Academy-ADV" (Express + EJS + SQLite)

## Fonctionnalités principales
- Authentification par matricule + mot de passe.
- Rôles: `admin`, `PA`, `agent` (PA peut modifier/supprimer fiches).
- Fiches agents (nom, prénom, matricule, téléphone, grade, brigade, formations).
- Historique des modifications (qui, quand, quoi).
- Admin panel pour créer et supprimer comptes.
- Première connexion: les utilisateurs avec `must_change_pw = 1` doivent changer leur mot de passe.

## Technologie
- Backend: Node.js + Express + EJS
- DB: SQLite (fichier `data/database.sqlite`)
- Styling: Tailwind via CDN (inclus in views)
- Session store: connect-sqlite3

## Installation locale
1. Cloner / extraire le projet.
2. Installer les dépendances:
```bash
npm install
```
3. Initialiser la base de données:
```bash
npm run init-db
```
4. Démarrer:
```bash
npm start
```
5. Ouvrir `http://localhost:3000`

## Comptes de test (après `npm run init-db`)
- Admin: matricule `ADMIN` mot de passe `Admin123!`
- PA: matricule `PA001` mot de passe `PA123456!` (doit changer le mot de passe à la première connexion)

## Déploiement
- **Render**: créer un service web Node.js, brancher le repo GitHub, configurer `npm start`.
- **GitHub**: héberger le code sur GitHub (Repository), puis déployer sur Render.

## Remarques / À compléter
- Remplacer `public/logo.png` par ton logo (le fichier que tu m'as envoyé).
- Change `session secret` dans `index.js` (utiliser une valeur forte en production).
- Pour une montée en charge, utiliser une base plus robuste (Postgres) et HTTPS.