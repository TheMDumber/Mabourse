# TODO - Analyse et optimisation de MaBoursev1.5

## Architecture générale

**MaBoursev1.5** est une application de gestion financière personnelle avec architecture client-serveur:

- **Frontend**: Application React/TypeScript avec Vite, utilisant TailwindCSS et Radix UI
- **Backend**: Serveur Express.js simple pour l'authentification et le stockage des données
- **Stockage**: Dual avec IndexedDB (local) et fichiers JSON (serveur)

L'application utilise une approche moderne avec:
- React Router pour la navigation
- React Query pour la gestion des données et mise en cache
- Contextes React pour la gestion d'état global
- Local-first avec synchronisation bidirectionnelle
- Logique de transactions récurrentes
- React Hook Form avec validation Zod pour les formulaires

### Structure des données

La base de données locale (IndexedDB) comprend plusieurs stores:
- accounts: Gestion des comptes bancaires
- transactions: Transactions financières
- recurringTransactions: Transactions récurrentes/automatiques
- userPreferences: Préférences utilisateur
- balanceAdjustments: Ajustements manuels de solde

### Système d'authentification et synchronisation

L'application utilise:
- Authentification par nom d'utilisateur/mot de passe
- Stockage local des sessions
- Synchronisation bidirectionnelle avec résolution de conflits
- Logique de récupération automatique en cas de perte de données
- Mécanismes de sécurité basiques (hashage des mots de passe)

### Interface utilisateur

L'application est composée de plusieurs pages principales:
- **Index**: Page d'accueil avec introduction
- **Accounts**: Gestion des comptes bancaires
- **Transactions**: Gestion des revenus, dépenses et transferts
- **Statistics**: Visualisation des données financières
- **Settings**: Paramètres utilisateur et préférences

Les composants UI utilisent:
- Une bibliothèque de composants basée sur Radix UI
- TailwindCSS pour le styling
- Des formulaires validés avec React Hook Form et Zod
- Des composants de date utilisant date-fns
- Des graphiques avec Recharts

## État d'avancement des tâches

### Phase 1: Cartographie structurelle
- [x] Explorer l'arborescence complète de l'application
- [x] Identifier la structure des dossiers et fichiers
- [x] Identifier les patterns architecturaux (React avec contextes et hooks)

### Phase 2: Vérification des tâches existantes
- [x] Rechercher tout fichier TODO.md ou similaire (trouvé et analysé)
- [x] Analyser les tâches non terminées listées dans le fichier TODO.md existant

### Phase 3: Analyse fonctionnelle
- [x] Examiner les modules principaux et leurs dépendances
- [x] Examiner les algorithmes critiques et leur complexité
- [x] Identifier les potentielles failles de sécurité
- [x] Détecter les antipatterns et pratiques non optimales
- [x] Vérifier la couverture de tests (absente)
- [x] Analyser les axes d'amélioration spécifiques (CSS, JavaScript, structure du projet)

### Phase 4: Documentation structurée
- [x] Créer ce fichier TODO.md à la racine du projet
- [x] Compléter la documentation de l'architecture générale
- [x] Documenter les problèmes identifiés
- [x] Établir une liste des optimisations recommandées
- [x] Mettre en place un suivi de l'état d'avancement des modifications

## Problèmes identifiés

### Nouvelles observations basées sur les axes d'amélioration
- [x] Design responsive incomplet - absence de media queries pour l'adaptation aux différents appareils
- [ ] Structure de code JavaScript avec variables et fonctions globales potentiellement problématiques
- [x] Utilisation de valeurs en pixels pour les styles CSS plutôt que des unités relatives (rem/em)
- [x] Absence de variables CSS pour les couleurs et autres valeurs réutilisables
- [ ] Sélection multiple des mêmes éléments DOM dans le code JavaScript
- [ ] Manipulation potentiellement non sécurisée du DOM (innerHTML vs textContent)
- [ ] Utilisation de var au lieu de let/const

### Gestion des erreurs
- [ ] Manque de gestion d'erreurs cohérente à travers l'application
- [ ] Plusieurs cas d'erreurs silencieuses qui peuvent causer des problèmes difficiles à diagnostiquer
- [ ] Multiples marqueurs temporaires dans localStorage qui peuvent causer des incohérences

### Performances
- [ ] Synchronisation trop fréquente avec trop de données
- [ ] Manque d'optimisation dans les requêtes à la base de données
- [ ] Absence de stratégie de pagination efficace pour les grands ensembles de données
- [ ] Absence de memoïsation pour les calculs coûteux

### Sécurité
- [ ] Stockage sensible des identifiants de session dans localStorage
- [ ] Protection insuffisante contre les attaques CSRF
- [ ] Absence de système de tokens d'authentification à expiration
- [ ] Génération de hachage de mot de passe côté client à faible itération

### Stabilité
- [ ] Multiples cas de boucles potentielles dans la logique d'authentification et de synchronisation
- [ ] Gestion complexe et fragile des marqueurs de synchronisation
- [ ] Manque de mécanismes de vérification d'intégrité des données
- [ ] Absence totale de tests automatisés

### Technique
- [ ] Organisation inconsistante des composants
- [ ] Props drilling excessif dans certains composants
- [ ] Logique complexe de synchronisation difficile à maintenir
- [ ] Absence de commentaires explicatifs dans les parties complexes du code

## Optimisations recommandées

### Nouvelles optimisations suggérées
- [x] Améliorer la responsivité en ajoutant des media queries et en utilisant Flexbox/Grid
- [x] Remplacer les unités px par des unités relatives (rem/em) pour l'accessibilité
- [x] Définir des variables CSS pour les couleurs et autres propriétés réutilisables
- [ ] Optimiser les sélections DOM en stockant les références dans des variables
- [ ] Sécuriser les manipulations du DOM en utilisant textContent ou createElement
- [ ] Utiliser 'use strict' dans les fichiers JavaScript
- [ ] Remplacer var par let/const selon les besoins

### À court terme
- [ ] Améliorer la gestion des erreurs par un système centralisé de log et notification
- [ ] Optimiser la logique de synchronisation pour réduire le volume de données
- [ ] Nettoyer et consolider les marqueurs de synchronisation dans localStorage
- [ ] Ajouter des commentaires explicatifs dans les sections complexes du code
- [ ] Mettre en place un système de logging structuré pour faciliter le débogage
- [x] Implémenter un système de suivi des dates de création et connexion utilisateur

### À moyen terme
- [ ] Implémenter une pagination efficace pour les transactions
- [ ] Refactoriser le contexte d'authentification pour simplifier la logique
- [ ] Ajouter des tests unitaires pour les fonctions critiques
- [ ] Optimiser les performances des requêtes IndexedDB fréquentes
- [ ] Mettre en place une structure de dossiers plus cohérente
- [ ] Introduire des composants memoïsés pour les listes et calculs fréquents

### À long terme
- [ ] Migrer vers un système d'authentification basé sur JWT avec refresh tokens
- [ ] Mettre en place une synchronisation différentielle (uniquement les changements)
- [ ] Améliorer la structure de la base de données pour optimiser les requêtes fréquentes
- [ ] Mettre en place une couverture de tests exhaustive
- [ ] Implémenter un système de versioning des données pour une meilleure synchronisation
- [ ] Concevoir une architecture plus modulaire pour faciliter l'extension de l'application

## Tâches prioritaires

### Tâches existantes

12. [x] Améliorer les formulaires d'authentification
    - [x] Ajouter une icône œil pour afficher/masquer le mot de passe dans le formulaire de connexion
    - [x] Ajouter une icône œil pour afficher/masquer le mot de passe dans le formulaire d'inscription
    - [x] Corriger les attributs `id` et `for` pour l'accessibilité et l'auto-remplissage des formulaires

13. [x] Correction de bugs
    - [x] Corriger l'erreur d'exportation des données: "TypeError: db.balanceAdjustments?.getAll is not a function"
    - [x] Corriger l'erreur d'importation des données: "TypeError: db.balanceAdjustments.create is not a function"
    - [x] Corriger l'erreur de contrainte d'unicité lors de l'importation des ajustements de solde
    - [x] Améliorer la mise à jour automatique de l'interface après importation pour éviter le F5

=======
1. [x] Corriger l'erreur de connexion à l'API (port 5173 vs 3001)
2. [x] Améliorer la gestion des erreurs de connexion au serveur
3. [x] Implémentation de vérifications proactives de disponibilité du serveur
4. [x] Finaliser le panel d'administration (admin-users.html)
   - [x] Implémenter l'authentification administrateur
   - [x] Terminer la fonctionnalité de modification de mot de passe utilisateur
   - [x] Terminer la fonctionnalité de suppression d'utilisateur
   - [x] Ajouter l'affichage des détails utilisateur (date de création, dernière connexion)
   - [x] Ajouter la gestion des administrateurs
5. [ ] Optimiser la logique de synchronisation
6. [ ] Mettre en place des tests unitaires pour les fonctions critiques
7. [ ] Restructurer l'organisation des composants
8. [ ] Améliorer les performances des requêtes à la base de données

### Nouvelles tâches basées sur les axes d'amélioration

9. [x] CSS et Responsivité
   - [x] Ajouter des media queries pour l'adaptation aux différents appareils
   - [x] Remplacer les unités px par rem/em pour une meilleure accessibilité
   - [x] Créer des variables CSS pour les couleurs et valeurs répétées
   - [x] Utiliser Flexbox et Grid pour une mise en page plus robuste

10. [ ] Optimisations JavaScript
    - [ ] Encapsuler le code JavaScript dans des IIFE ou modules ES6
    - [ ] Ajouter 'use strict' au début des fichiers
    - [ ] Remplacer var par let/const
    - [ ] Optimiser les sélections DOM avec des références stockées
    - [ ] Sécuriser les manipulations DOM (textContent vs innerHTML)

11. [ ] Documentation et organisation
    - [ ] Vérifier et mettre à jour le README.md si nécessaire
    - [ ] Mettre à jour le .gitignore avec des motifs additionnels
    - [ ] Ajouter des commentaires explicatifs dans les parties complexes du code
