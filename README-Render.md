# Déploiement sur Render — Police-Academy-ADV

Ce dépôt est prêt pour un déploiement **en 1 clic** sur Render (plan Free possible).

## 1) Mettre sur GitHub
- Crée un nouveau repo GitHub (public ou privé).
- Envoie tout le contenu de ce dossier dans ton repo.

## 2) Déployer sur Render
- Connecte-toi sur https://render.com
- "New +" → **Blueprint** (YAML) → Connecter ton repo GitHub
- Render détectera `render.yaml`. Confirme le service.
- Laisse le **plan Free** au début. (Région: Frankfurt dans ce fichier)
- Lancement automatique : **OK**

Le service démarrera avec :
- `buildCommand`: `npm install`
- `startCommand`: `node app.js`
- Variable `SESSION_SECRET` générée automatiquement

## 3) Accès & premiers pas
- Une URL sera créée, ex. `https://police-academy-adv.onrender.com`
- Identifiants par défaut : **admin / admin123** (tu seras invité à changer le mot de passe)
- Rôles :
  - **ADMIN** : gérer les comptes et rôles
  - **PA** : modifier les fiches agents
  - **AGENT** : lecture seule

## 4) Données & sauvegarde (SQLite)
- La base SQLite (`police-academy.sqlite`) est stockée sur le disque de l’instance Render.
- Sur un plan Free, l’instance peut redémarrer et **réinitialiser** l’espace disque. Pour conserver durablement les données, passe à un plan avec **disque persistant** ou migre vers une DB managée (PostgreSQL/MySQL).

## 5) Variables d’environnement (optionnel)
- `PORT` : géré par Render automatiquement.
- `SESSION_SECRET` : déjà généré dans `render.yaml`.
- Tu peux en ajouter depuis l’onglet **Environment** du service.

## 6) Commandes utiles en local
```bash
npm install
npm start
# puis http://localhost:3000
```

Bon déploiement ! 🚓
