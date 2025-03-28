import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fileStorage } from '@/lib/fileStorageAdapter';
import db from '@/lib/db';
import { UserData } from '@/lib/fileStorage';
import { isMoreRecent, getMostRecent } from '@/lib/calculateTimestamp';
import { getCurrentSyncState, saveSyncState, getDeviceId, generateSyncId, forceFullSync, needsFullSync, needsServerSync, resetServerSync } from '@/lib/syncUtils';
import { syncBalanceAdjustments, invalidateAllQueries } from '@/lib/syncHelpers';
import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Créer une instance de QueryClient pour les invalidations manuelles
const queryClient = new QueryClient();

// Définir l'interface du contexte d'authentification
interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  isInitialSync: boolean;
  syncProgress: number;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  syncData: (forceServerData?: boolean) => Promise<boolean>;
  lastSyncTime: Date | null;
}

// Créer le contexte avec des valeurs par défaut
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  username: null,
  isLoading: true,
  isSyncing: false,
  isInitialSync: false,
  syncProgress: 0,
  login: async () => false,
  logout: () => {},
  syncData: async () => false,
  lastSyncTime: null
});

// Hook pour utiliser le contexte d'authentification
export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

// Fournisseur du contexte d'authentification
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isInitialSync, setIsInitialSync] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Vérifier l'état d'authentification au chargement
  useEffect(() => {
    // Nettoyer les éventuels marqueurs de synchronisation restants
    localStorage.removeItem('isSyncing');
    localStorage.removeItem('syncEventTriggered');
    localStorage.removeItem('layoutRefreshing');
    localStorage.removeItem('statsRefreshing');
    localStorage.removeItem('isInitialSync');
    // Résoudre le problème de boucle infinie en nettoyant aussi ces marqueurs
    localStorage.removeItem('isRedirecting');
    localStorage.removeItem('isCheckingRedirect');
    
    // Vérifier si une synchronisation forcée a été interrompue
    const forcedSkip = localStorage.getItem('forceSkipSync');
    if (forcedSkip === 'true') {
      setIsInitialSync(false);
      setIsSyncing(false);
      setSyncProgress(0);
      localStorage.removeItem('forceSkipSync');
    }
    
    const checkAuth = async () => {
      try {
        const loggedIn = fileStorage.isLoggedIn();
        
        if (loggedIn) {
          const currentUsername = fileStorage.getCurrentUsername();
          setIsAuthenticated(true);
          setUsername(currentUsername);
          
          // Détecter si nous sommes en mode réseau distant
          const isRemoteNetwork = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
          console.log('Mode réseau distant:', isRemoteNetwork);
          
          // Vérifier si une récupération complète est nécessaire après réparation de la base
          const needsFullRecovery = localStorage.getItem('needsFullRecovery') === 'true';
          
          try {
            // Vérifier si la base de données locale est vide ou a été réinitialisée
            let accounts = [];
            try {
              // L'initialisation de la base peut échouer après un effacement du cache navigateur
              await db.init();
              accounts = await db.accounts.getAll();
            } catch (dbError) {
              console.error('Erreur lors de la récupération des comptes:', dbError);
              // Une erreur ici indique probablement une structure de base de données corrompue
              // ou un cache effacé
              localStorage.setItem('needsFullRecovery', 'true');
              
              // Déconnecter l'utilisateur en cas d'erreur grave pour éviter les boucles
              if (isRemoteNetwork && !window.preventAutoRedirect) {
                console.log('Erreur grave en mode réseau, déconnexion forcée pour éviter les boucles');
                localStorage.removeItem('userSession');
                setIsAuthenticated(false);
                setUsername(null);
                setIsLoading(false);
                return;
              }
              
              window.location.reload();
              return;
            }
            
            if (accounts.length === 0 || needsFullRecovery) {
              console.log('Base de données locale vide ou réinitialisée. Tentative de récupération des données depuis le serveur...');
              
              // Nettoyer le flag de récupération si nécessaire
              if (needsFullRecovery) {
                localStorage.removeItem('needsFullRecovery');
              }
              
              // Afficher une notification de récupération en cours
              toast("Récupération des données", {
                description: "Restauration des données depuis le serveur suite au nettoyage du navigateur..."
              });
              
              // Force une synchronisation complète pour récupérer les données du serveur
              setIsSyncing(true);
              setIsInitialSync(true);
              setSyncProgress(10);
              try {
                // Utiliser un délai plus important en mode réseau pour laisser le temps à l'API de répondre
                const syncDelay = isRemoteNetwork ? 1000 : 0;
                
                await new Promise(resolve => setTimeout(resolve, syncDelay));
                const success = await syncData(true);
                setIsSyncing(false);
                setIsInitialSync(false);
                setSyncProgress(0);
                
                if (success) {
                  toast("Récupération terminée", {
                    description: "Vos données ont été restaurées avec succès!"
                  });
                  
                  // Vérifier le résultat de la synchronisation
                  const recoveredAccounts = await db.accounts.getAll();
                  if (recoveredAccounts.length === 0 && isRemoteNetwork) {
                    // Si toujours pas de comptes en mode réseau, déconnecter pour éviter les boucles
                    console.log('Aucun compte récupéré après synchronisation, déconnexion forcée');
                    localStorage.removeItem('userSession');
                    setIsAuthenticated(false);
                    setUsername(null);
                    setIsLoading(false);
                    toast("Erreur de récupération", {
                      description: "Impossible de récupérer vos données depuis le serveur. Veuillez vous reconnecter."
                    });
                    return;
                  }
                  
                  // Ne pas forcer le rechargement après récupération réussie
                  // Laisser l'utilisateur continuer normalement
                } else {
                  toast("Erreur de récupération", {
                    description: "Impossible de récupérer vos données depuis le serveur. Veuillez vous reconnecter."
                  });
                  
                  // En mode réseau, déconnecter pour éviter les boucles
                  if (isRemoteNetwork && !window.preventAutoRedirect) {
                  console.log('Erreur de récupération en mode réseau, déconnexion forcée');
                  localStorage.removeItem('userSession');
                  setIsAuthenticated(false);
                  setUsername(null);
                  setIsLoading(false);
                  return;
                  }
                }
              } catch (error) {
                console.error('Erreur lors de la synchronisation:', error);
                setIsSyncing(false);
                setIsInitialSync(false);
                setSyncProgress(0);
                
                // En mode réseau, déconnecter pour éviter les boucles
                if (isRemoteNetwork && !window.preventAutoRedirect) {
                  console.log('Exception lors de la récupération en mode réseau, déconnexion forcée');
                  localStorage.removeItem('userSession');
                  setIsAuthenticated(false);
                  setUsername(null);
                  setIsLoading(false);
                  toast("Erreur système", {
                    description: "Impossible de récupérer vos données suite à une erreur. Veuillez vous reconnecter."
                  });
                  return;
                }
              }
            } else {
              // Synchronisation normale si la base n'est pas vide
              setIsSyncing(true);
              setIsInitialSync(true);
              setSyncProgress(10);
              await syncData();
              setIsSyncing(false);
              setIsInitialSync(false);
              setSyncProgress(0);
            }
          } catch (error) {
            console.error('Erreur lors de la vérification de la base de données:', error);
            setIsSyncing(false);
            setIsInitialSync(false);
            setSyncProgress(0);
            
            // En mode réseau, déconnecter pour éviter les boucles
            if (isRemoteNetwork && !window.preventAutoRedirect) {
              console.log('Exception globale en mode réseau, déconnexion forcée');
              localStorage.removeItem('userSession');
              setIsAuthenticated(false);
              setUsername(null);
              setIsLoading(false);
              return;
            }
          }
        }
        
        setIsLoading(false);
      } catch (e) {
        console.error('Erreur globale dans checkAuth:', e);
        setIsLoading(false);
        
        // Détecter si nous sommes en mode réseau distant
        const isRemoteNetwork = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        if (isRemoteNetwork) {
          // Déconnexion forcée en cas d'erreur en mode réseau
          localStorage.removeItem('userSession');
          setIsAuthenticated(false);
          setUsername(null);
        }
      }
    };
    
    checkAuth();
  }, []);

  // Fonction de connexion
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      console.log('Tentative de connexion pour:', username);
      
      // Détecter si nous sommes en mode réseau distant
      const isRemoteNetwork = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      console.log('Mode réseau distant:', isRemoteNetwork);
      
      // Nettoyer tous les marqueurs qui pourraient causer des problèmes
      localStorage.removeItem('isRedirecting');
      localStorage.removeItem('isCheckingRedirect');
      localStorage.removeItem('redirectAttemptCount');
      localStorage.removeItem('lastRedirectTime');
      localStorage.removeItem('lastAuthCheck');
      localStorage.removeItem('isSyncing');
      localStorage.removeItem('syncEventTriggered');
      localStorage.removeItem('isInitialSync');
      localStorage.removeItem('layoutRefreshing');
      localStorage.removeItem('statsRefreshing');
      
      const success = await fileStorage.login(username, password);
      console.log('Résultat de la connexion (AuthContext):', success);
      
      if (success) {
        console.log('Connexion réussie, mise à jour du contexte d\'authentification');
        // Mettre à jour l'état d'authentification immédiatement
        setIsAuthenticated(true);
        setUsername(username);
        console.log('isAuthenticated mis à jour:', true);
        
        // Vérifier si une synchronisation complète est nécessaire
        if (needsFullSync()) {
          console.log('Première connexion sur cet appareil, synchronisation complète requise');
          forceFullSync();
        }
        
        // Utiliser un délai plus long en mode réseau
        const syncDelay = isRemoteNetwork ? 500 : 100;
        
        // Synchroniser les données en arrière-plan
        setTimeout(() => {
          setIsSyncing(true);
          setIsInitialSync(true);
          setSyncProgress(10);
          syncData().then(() => {
            console.log('Synchronisation des données terminée après connexion');
            setIsSyncing(false);
            setIsInitialSync(false);
            setSyncProgress(0);
            
            // Marquer la dernière synchronisation
            localStorage.setItem('lastSyncTime', Date.now().toString());
          });
        }, syncDelay);
      }
      
      return success;
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      return false;
    }
  };

  // Fonction de déconnexion
  const logout = () => {
    // Synchroniser les données avant déconnexion
    setIsSyncing(true);
    syncData().then(() => {
      fileStorage.logout();
      setIsAuthenticated(false);
      setUsername(null);
      setLastSyncTime(null);
      setIsSyncing(false);
    });
  };

  // Fonction de synchronisation des données
  const syncData = async (forceServerData: boolean = false): Promise<boolean> => {
    // Mettre à jour l'état de la synchronisation
    setIsSyncing(true);
    setSyncProgress(10);
    
    if (!isAuthenticated && !fileStorage.isLoggedIn()) {
      setIsSyncing(false);
      setIsInitialSync(false);
      setSyncProgress(0);
      return false;
    }
    
    // Si forceServerData est vrai ou si la synchronisation serveur vers locale est demandée
    // on va prioritairement récupérer les données du serveur
    // et les utiliser pour remplacer les données locales (utile après nettoyage du navigateur)
    const serverSyncRequested = needsServerSync();
    if (forceServerData || serverSyncRequested) {
      if (serverSyncRequested) {
        console.log('Mode de synchronisation forcée serveur vers locale: récupération des données du serveur...');
        // Réinitialiser le flag pour ne pas le refaire à chaque fois
        resetServerSync();
      } else {
        console.log('Mode de synchronisation forcée: récupération des données depuis le serveur...');
      }
    }
    
    // Obtenir l'état de synchronisation actuel et l'ID de l'appareil
    const currentSyncState = getCurrentSyncState();
    const deviceId = getDeviceId();
    console.log(`Synchronisation depuis l'appareil: ${deviceId}`);
    
    // Vérifier si nous sommes en mode de synchronisation forcée (priorité données locales)
    const isForceLocalDataSync = currentSyncState?.forceLocalData === true;
    if (isForceLocalDataSync) {
      console.log('Mode de synchronisation forcée activé: les données locales vont être envoyées au serveur');
    }
    
    try {
      // Obtenir les données locales actuelles 
      setSyncProgress(20);
      const localAccounts = await db.accounts.getAll();
      setSyncProgress(30);
      const localTransactions = await db.transactions.getAll();
      setSyncProgress(40);
      const localRecurringTransactions = await db.recurringTransactions.getAll();
      setSyncProgress(50);
      const localPreferences = await db.preferences.get();
      
      // Vérifier si l'utilisateur a des identifiants cohérents sur tous ses appareils
      const currentUsername = fileStorage.getCurrentUsername();
      localStorage.setItem('lastActiveUser', currentUsername || 'unknown');

      // Si le mode "forceLocalData" est activé, on ne récupère pas les données du serveur
      // et on envoie directement les données locales
      if (isForceLocalDataSync) {
        console.log('Envoi des données locales au serveur (mode forcé)...');
        
        // Générer un nouvel ID de synchronisation 
        const syncId = generateSyncId();
        console.log(`Création d'un nouvel ID de synchronisation: ${syncId}`);
        
        const localData: UserData = {
          accounts: localAccounts,
          transactions: localTransactions,
          recurringTransactions: localRecurringTransactions,
          preferences: localPreferences,
          lastSyncTime: new Date(),
          syncId: syncId,
          deviceId: deviceId
        };
        
        await fileStorage.saveUserData(localData);
        
        // Sauvegarder l'état de synchronisation mais désactiver le mode forcé pour les prochaines syncs
        saveSyncState({
          syncId: syncId,
          lastSyncTime: new Date(),
          deviceId: deviceId,
          forceLocalData: false // Désactiver le mode forcé après utilisation
        });
        
        setLastSyncTime(new Date());
        return true;
      }

      // Dans les autres cas, récupérer d'abord les données du serveur
      setSyncProgress(60);
      const serverData = await fileStorage.loadUserData();
      
      // Si force server data et qu'on a des données de serveur, synchroniser les ajustements
      if (forceServerData && serverData && serverData.balanceAdjustments) {
        await syncBalanceAdjustments(serverData);
      }
      
      // Si aucune donnée sur le serveur, envoyer simplement les données locales au serveur
      // Sauf si on est en mode forceServerData, auquel cas on abandonne
      if (!serverData || !serverData.accounts || serverData.accounts.length === 0) {
        if (forceServerData) {
          console.log('Aucune donnée trouvée sur le serveur, mais mode forcé activé. Abandon de la synchronisation.');
          setIsSyncing(false);
          setIsInitialSync(false);
          setSyncProgress(0);
          return false;
        }
        
        console.log('Aucune donnée trouvée sur le serveur, envoi des données locales...');
        
        // Générer un nouvel ID de synchronisation pour le premier envoi
        const syncId = generateSyncId();
        console.log(`Création d'un nouvel ID de synchronisation: ${syncId}`);
        
        const localData: UserData = {
          accounts: localAccounts,
          transactions: localTransactions,
          recurringTransactions: localRecurringTransactions,
          preferences: localPreferences,
          lastSyncTime: new Date(),
          syncId: syncId, // Ajouter l'ID de synchronisation aux données
          deviceId: deviceId // Identifier l'appareil source
        };
        
        await fileStorage.saveUserData(localData);
        
        // Sauvegarder l'état de synchronisation localement
        saveSyncState({
          syncId: syncId,
          lastSyncTime: new Date(),
          deviceId: deviceId
        });
        
        setLastSyncTime(new Date());
        return true;
      }
      
      console.log('Données trouvées sur le serveur, fusion intelligente...');
      
      // Carte de correspondance pour les anciens et nouveaux IDs de compte
      const accountIdMap = new Map<number, number>();
      
      // 2. Traiter les comptes : fusionner en gardant les plus récents
      setSyncProgress(70);
      if (serverData.accounts && serverData.accounts.length > 0) {
        // Récupérer également les ajustements de solde
        if (serverData.balanceAdjustments && forceServerData) {
          console.log('Synchronisation des ajustements de solde...');
          for (const adjustment of serverData.balanceAdjustments) {
            // Recréer l'ajustement localement
            await db.balanceAdjustments.setAdjustment({
              accountId: adjustment.accountId,
              yearMonth: adjustment.yearMonth,
              adjustedBalance: adjustment.adjustedBalance,
              note: adjustment.note || '',
            });
            console.log(`Ajustement de solde importé pour ${adjustment.yearMonth}, compte ${adjustment.accountId}`);
          }
        }
        for (const serverAccount of serverData.accounts) {
          // Vérifier si le compte existe déjà en se basant sur le nom
          const existingAccount = localAccounts.find(a => a.name === serverAccount.name);
          
          if (existingAccount) {
            // Si le compte existe, mémoriser la correspondance d'IDs
            if (serverAccount.id && existingAccount.id) {
              accountIdMap.set(serverAccount.id, existingAccount.id);
            }
            
            // Comparer les dates de mise à jour pour savoir quelle version garder
            if (serverAccount && existingAccount && isMoreRecent(serverAccount, existingAccount)) {
              // Le compte du serveur est plus récent, mettre à jour le compte local
              await db.accounts.update(existingAccount.id!, {
                ...serverAccount,
                id: existingAccount.id // Conserver l'ID local
              });
              console.log(`Compte mis à jour (serveur plus récent): ${serverAccount.name}`);
            } else {
              console.log(`Compte conservé (local plus récent): ${existingAccount.name}`);
            }
          } else {
            // Compte inexistant localement, l'ajouter
            const { id, ...accountData } = serverAccount;
            const newId = await db.accounts.create({
              ...accountData,
              createdAt: new Date(accountData.createdAt),
              updatedAt: new Date(accountData.updatedAt)
            });
            
            // Mémoriser la correspondance d'IDs
            if (id) {
              accountIdMap.set(id, newId);
            }
            console.log(`Nouveau compte ajouté: ${serverAccount.name}`);
          }
        }
        
        // Vérifier s'il y a des comptes locaux qui n'existent pas sur le serveur
        for (const localAccount of localAccounts) {
          const serverAccount = serverData.accounts.find(a => a.name === localAccount.name);
          if (!serverAccount) {
            console.log(`Compte local conservé (inexistant sur le serveur): ${localAccount.name}`);
          }
        }
      }
      
      // 3. Traiter les transactions: garder toutes les transactions et supprimer les doublons
      // en privilégiant les versions les plus récentes
      setSyncProgress(80);
      if (serverData.transactions && serverData.transactions.length > 0) {
        // Créer un index des transactions locales par combinaison de propriétés clés
        const localTransactionsMap = new Map();
        
        localTransactions.forEach(transaction => {
          // Créer une clé unique basée sur les propriétés de la transaction
          const transactionKey = `${transaction.accountId}_${transaction.amount}_${transaction.description}_${new Date(transaction.date).toISOString().split('T')[0]}`;
          localTransactionsMap.set(transactionKey, transaction);
        });
        
        // Traiter les transactions du serveur
        for (const serverTransaction of serverData.transactions) {
          // Remapper les IDs des comptes
          const mappedAccountId = serverTransaction.accountId ? 
            (accountIdMap.get(serverTransaction.accountId) || serverTransaction.accountId) : 
            serverTransaction.accountId;
            
          const mappedToAccountId = serverTransaction.toAccountId ? 
            (accountIdMap.get(serverTransaction.toAccountId) || serverTransaction.toAccountId) : 
            serverTransaction.toAccountId;
          
          // Créer la même clé unique pour rechercher les doublons
          const transactionKey = `${mappedAccountId}_${serverTransaction.amount}_${serverTransaction.description}_${new Date(serverTransaction.date).toISOString().split('T')[0]}`;
          
          const existingTransaction = localTransactionsMap.get(transactionKey);
          
          if (existingTransaction) {
            // Une transaction similaire existe déjà, garder la plus récente
            if (serverTransaction && existingTransaction && isMoreRecent(serverTransaction, existingTransaction)) {
              // La transaction du serveur est plus récente
              await db.transactions.update(existingTransaction.id!, {
                ...serverTransaction,
                id: existingTransaction.id,
                accountId: mappedAccountId,
                toAccountId: mappedToAccountId,
                date: new Date(serverTransaction.date)
              });
              console.log(`Transaction mise à jour (serveur plus récente): ${serverTransaction.description}`);
            } else {
              console.log(`Transaction conservée (locale plus récente): ${existingTransaction.description}`);
            }
          } else {
            // Nouvelle transaction, l'ajouter
            const { id, ...transactionData } = serverTransaction;
            await db.transactions.create({
              ...transactionData,
              accountId: mappedAccountId,
              toAccountId: mappedToAccountId,
              date: new Date(transactionData.date),
              createdAt: new Date(transactionData.createdAt),
              updatedAt: new Date(transactionData.updatedAt)
            });
            console.log(`Nouvelle transaction ajoutée: ${serverTransaction.description}`);
          }
        }
      }
      
      // 4. Traiter les transactions récurrentes de la même manière
      setSyncProgress(90);
      if (serverData.recurringTransactions && serverData.recurringTransactions.length > 0) {
        // Créer un index des transactions récurrentes locales
        const localRecurringMap = new Map();
        
        localRecurringTransactions.forEach(transaction => {
          // Créer une clé unique
          const transactionKey = `${transaction.accountId}_${transaction.amount}_${transaction.description}_${transaction.frequency}`;
          localRecurringMap.set(transactionKey, transaction);
        });
        
        // Traiter les transactions récurrentes du serveur
        for (const serverTransaction of serverData.recurringTransactions) {
          // Remapper les IDs des comptes
          const mappedAccountId = serverTransaction.accountId ? 
            (accountIdMap.get(serverTransaction.accountId) || serverTransaction.accountId) : 
            serverTransaction.accountId;
            
          const mappedToAccountId = serverTransaction.toAccountId ? 
            (accountIdMap.get(serverTransaction.toAccountId) || serverTransaction.toAccountId) : 
            serverTransaction.toAccountId;
          
          // Créer la même clé unique
          const transactionKey = `${mappedAccountId}_${serverTransaction.amount}_${serverTransaction.description}_${serverTransaction.frequency}`;
          
          const existingTransaction = localRecurringMap.get(transactionKey);
          
          if (existingTransaction) {
            // Une transaction récurrente similaire existe déjà
            if (serverTransaction && existingTransaction && isMoreRecent(serverTransaction, existingTransaction)) {
              // La transaction du serveur est plus récente
              await db.recurringTransactions.update(existingTransaction.id!, {
                ...serverTransaction,
                id: existingTransaction.id,
                accountId: mappedAccountId,
                toAccountId: mappedToAccountId,
                startDate: new Date(serverTransaction.startDate),
                endDate: serverTransaction.endDate ? new Date(serverTransaction.endDate) : undefined,
                nextExecution: new Date(serverTransaction.nextExecution),
                lastExecuted: serverTransaction.lastExecuted ? new Date(serverTransaction.lastExecuted) : undefined
              });
              console.log(`Transaction récurrente mise à jour (serveur plus récente): ${serverTransaction.description}`);
            } else {
              console.log(`Transaction récurrente conservée (locale plus récente): ${existingTransaction.description}`);
            }
          } else {
            // Nouvelle transaction récurrente
            const { id, ...transactionData } = serverTransaction;
            await db.recurringTransactions.create({
              ...transactionData,
              accountId: mappedAccountId,
              toAccountId: mappedToAccountId,
              startDate: new Date(transactionData.startDate),
              endDate: transactionData.endDate ? new Date(transactionData.endDate) : undefined,
              nextExecution: new Date(transactionData.nextExecution),
              lastExecuted: transactionData.lastExecuted ? new Date(transactionData.lastExecuted) : undefined,
              createdAt: new Date(transactionData.createdAt),
              updatedAt: new Date(transactionData.updatedAt)
            });
            console.log(`Nouvelle transaction récurrente ajoutée: ${serverTransaction.description}`);
          }
        }
      }
      
      // 5. Fusionner les préférences utilisateur
      if (serverData.preferences) {
        const localPrefs = await db.preferences.get();
        
        if (serverData.preferences && localPrefs && isMoreRecent(serverData.preferences, localPrefs)) {
          // Les préférences du serveur sont plus récentes
          await db.preferences.update(localPrefs.id!, serverData.preferences);
          console.log('Préférences mises à jour depuis le serveur');
        } else {
          console.log('Préférences locales conservées (plus récentes)');
        }
      }
      
      // Mettre à jour le temps de synchronisation
      // Obtenir le syncId des données du serveur ou générer un nouveau si nécessaire
      const syncId = serverData.syncId || generateSyncId();
      const syncTime = new Date();
      setLastSyncTime(syncTime);
      
      // Maintenant, obtenir les données locales mises à jour pour les envoyer au serveur
      // Récupérer les données mises à jour
      const updatedAccounts = await db.accounts.getAll();
      const updatedTransactions = await db.transactions.getAll();
      const updatedRecurringTransactions = await db.recurringTransactions.getAll();
      const updatedPreferences = await db.preferences.get();
      
      const localData: UserData = {
        accounts: updatedAccounts,
        transactions: updatedTransactions,
        recurringTransactions: updatedRecurringTransactions,
        preferences: updatedPreferences,
        lastSyncTime: syncTime,
        syncId: syncId, // Assurer que l'ID de synchronisation est conservé
        deviceId: deviceId // Inclure l'ID de l'appareil
      };
      
      // Sauvegarder l'état de synchronisation localement
      saveSyncState({
        syncId: syncId,
        lastSyncTime: syncTime,
        deviceId: deviceId
      });
      
      // Envoyer les données locales au serveur
      await fileStorage.saveUserData(localData);
      
      console.log('Synchronisation terminée avec succès');
      
      // Force l'invalidation des requêtes React Query pour recalculer les statistiques
      setSyncProgress(95);
      const queryClient = new QueryClient();
      invalidateAllQueries(queryClient, forceServerData);
      
      // Déclencher un événement de synchronisation pour informer les autres composants
      // Mais seulement si nous ne sommes pas déjà dans une boucle de synchronisation
      if (!localStorage.getItem('isSyncing')) {
        // Marquer que nous sommes en train de synchroniser pour éviter les boucles
        localStorage.setItem('isSyncing', 'true');
        localStorage.setItem('lastSyncTime', Date.now().toString());
        
        // Supprimer le marqueur après un délai
        setTimeout(() => {
          localStorage.removeItem('isSyncing');
        }, 2000);
        
        // On déclenche un événement storage pour forcer la mise à jour des autres onglets ouverts
        try {
          const evt = new StorageEvent('storage', {
            key: 'lastSyncTime',
            newValue: Date.now().toString(),
            oldValue: null,
            storageArea: localStorage
          });
          window.dispatchEvent(evt);
        } catch (e) {
          console.log('Impossible de déclencher l\'event storage');
        }
      }
      
      setSyncProgress(100);
      
      return true;
    } catch (error) {
      console.error('Erreur lors de la synchronisation des données:', error);
      setIsSyncing(false);
      setIsInitialSync(false);
      setSyncProgress(0);
      return false;
    }
  };

  // Valeur du contexte
  const contextValue: AuthContextType = {
    isAuthenticated,
    username,
    isLoading,
    isSyncing,
    isInitialSync,
    syncProgress,
    login,
    logout,
    syncData,
    lastSyncTime
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
