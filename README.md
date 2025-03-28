# MaBourse v1.5

Une application de gestion financière personnelle avec fonctionnalités de suivi des dépenses, revenus et statistiques.

## Fonctionnalités

- **Gestion des comptes**: Création et gestion de différents comptes financiers
- **Transactions**: Suivi des revenus, dépenses et transferts entre comptes
- **Transactions récurrentes**: Configuration de transactions automatiques récurrentes
- **Statistiques**: Visualisation de l'évolution financière via graphiques
- **Synchronisation**: Stockage local avec synchronisation sur serveur
- **Interface intuitive**: Design moderne avec thème personnalisable
- **Multi-utilisateurs**: Support de plusieurs utilisateurs avec système d'authentification
- **Administration**: Panneau d'administration pour gérer les utilisateurs

## Technologies utilisées

- **Frontend**: React, TypeScript, TailwindCSS, Radix UI
- **Backend**: Node.js avec Express
- **Stockage local**: IndexedDB
- **Stockage serveur**: JSON files
- **Formulaires**: React Hook Form avec validation Zod
- **Graphiques**: Recharts
- **Gestion d'état**: Contextes React et React Query
- **Routage**: React Router

## Installation

1. Cloner ce dépôt:
   ```bash
   git clone https://github.com/votre-username/MaBourse.git
   cd MaBourse
   ```

2. Installer les dépendances:
   ```bash
   npm install
   ```

3. Lancer le serveur de développement:
   ```bash
   npm run dev
   ```

4. Ou construire puis démarrer l'application en production:
   ```bash
   npm run build
   npm run server
   ```

## Démarrage rapide

Une fois l'application démarrée, elle sera accessible à l'adresse suivante:
- Développement: `http://localhost:5173`
- Production: `http://localhost:3001`

### Premier lancement

Lors du premier lancement, un compte administrateur par défaut est créé avec les identifiants:
- **Nom d'utilisateur**: `admin`
- **Mot de passe**: `admin123`

**Important**: Pour des raisons de sécurité, veuillez changer ce mot de passe immédiatement après la première connexion!

## Accès au panneau d'administration

Le panneau d'administration est accessible à l'adresse:
- En développement: `http://localhost:5173/admin-users.html`
- En production: `http://localhost:3001/admin-users.html`

## Scripts disponibles

- `npm run dev` - Lance le serveur de développement Vite
- `npm run build` - Construit l'application pour la production
- `npm run server` - Démarre le serveur Express
- `npm run start` - Construit puis lance l'application (production)
- `npm run test` - Exécute les tests unitaires

## Structure du projet

- `/src` - Code source React/TypeScript
- `/public` - Fichiers statiques et pages HTML additionnelles
- `/data` - Dossier de stockage des données (créé automatiquement)
- `server.js` - Serveur Express pour l'API et le stockage
- `fileStorage.js` - Gestion du stockage de fichiers
- `adminAuth.js` - Gestion de l'authentification des administrateurs

## Licence

MIT
