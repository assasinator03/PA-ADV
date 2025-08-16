
# Police-Academy-ADV — Render (SQLite)

## Déploiement
1. Pousse ce dossier sur **GitHub** (fichiers à la racine).
2. Sur **Render** : New → **Blueprint** → connecte ton repo. `render.yaml` sera détecté.
3. Déploie (plan Free ok).

## Connexion
- **admin / admin123** (forcé à changer le mot de passe au premier login).
- Rôles : `ADMIN`, `PA`, `AGENT`.

## Fonctionnalités
- Login + session, changement de mot de passe à la première connexion
- Gestion du **personnel** (matricule, nom, prénom, téléphone, **grades** étendus, brigades, **formations**)
- Recherche par **matricule**
- Rôles & permissions : seuls **PA** et **ADMIN** peuvent **créer/éditer/supprimer** une fiche
- **Historique** des actions (création, mise à jour, suppression) avec auteur et matricule cible
- **Administration** : créer/supprimer des comptes et définir les rôles
- Thème bleu + logo inclus

## Développement local
```
npm install
npm start
# http://localhost:3000
```
