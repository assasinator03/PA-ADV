# Police-Academy-ADV (Full)

Prototype web app "Police-Academy-ADV" (Express + EJS + SQLite)

## Fonctionnalités principales
- Authentification par matricule + mot de passe.
- Rôles: `admin`, `PA`, `agent` (PA peut modifier/supprimer fiches).
- Fiches agents (nom, prénom, matricule, téléphone, grade, brigades (multi), formations (multi)).
- Historique des modifications (qui, quand, quoi).
- Admin panel pour créer et supprimer comptes et changer les rôles.
- Première connexion: `must_change_pw = 1` oblige à changer le mot de passe.

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

## Remarques
- Remplace `public/logo.png` par ton logo (le placeholder est inclus).
- Change `SESSION_SECRET` dans `index.js` avant mise en production.
- SQLite est pratique pour démarrer — migrer vers Postgres en production.