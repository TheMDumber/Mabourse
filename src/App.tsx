import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createOptimizedQueryClient } from "./lib/queryConfig";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";

import { AuthProvider } from "./contexts/AuthContext";
import { DeviceProvider } from "./contexts/DeviceContext";
import { AccountFilterProvider } from "./contexts/AccountFilterContext";
import { AuthGuard } from "./components/auth/AuthGuard";
import { useAuth } from "./contexts/AuthContext";
import { DataRecoveryAlert } from "./components/ui/data-recovery-alert";
import { SyncLoadingModal } from "./components/ui/sync-loading-modal";
import { useDataRecovery } from "./hooks/useDataRecovery";
import { repairDatabase } from "./lib/repairDB";
import { checkAndFixBalanceAdjustments } from "./lib/balanceAdjustmentFix";
import AuthStabilityPatch from "./lib/patches/AuthStabilityPatch";
import DBVersionPatch from "./lib/patches/DBVersionPatch";

import Index from "./pages/Index";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Statistics from "./pages/Statistics";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import AuthPatch from "./lib/patches/AuthPatch";

import db from "./lib/db";
import { executeRecurringTransactions } from "./lib/recurringTransactionManager";

// Créer un client React Query avec une configuration optimisée
const queryClient = createOptimizedQueryClient();

const AppContent = () => {
  const { syncData, isAuthenticated, isInitialSync, isSyncing, syncProgress } = useAuth();
  const { needsRecovery, resetRecoveryState } = useDataRecovery();
  const [recurringTransactionsChecked, setRecurringTransactionsChecked] = useState(false);
  
  useEffect(() => {
    // Réinitialiser toutes les variables de détection de boucles
    localStorage.removeItem('rebootCount');
    localStorage.removeItem('lastRebootTime');

    // Nettoyer les données orphelines au démarrage de l'application
    const cleanData = async () => {
      try {
        // Vérifier si une récupération complète est nécessaire (après réinitialisation de la base)
        const needsFullRecovery = localStorage.getItem('needsFullRecovery') === 'true';
        
        if (needsFullRecovery) {
          console.log('Récupération complète nécessaire après réinitialisation de la base de données');
          localStorage.removeItem('needsFullRecovery'); // Réinitialiser l'indicateur
        }
        
        // Tenter d'abord une réparation ciblée du store balanceAdjustments
        const balanceAdjustmentsFixed = await checkAndFixBalanceAdjustments();
        console.log('Résultat de la réparation ciblée du store balanceAdjustments:', balanceAdjustmentsFixed);
        
        // Si la réparation ciblée a échoué, effectuer une réparation complète
        if (!balanceAdjustmentsFixed) {
          console.warn('La réparation ciblée a échoué, tentative de réparation complète...');
          await repairDatabase();
        }
        
        // Nécessaire de réinitialiser IndexedDB en cas d'erreur lors de l'initialisation
        try {
          await db.init();
          await db.cleanOrphanedData();
          await db.capitalizeExistingAccountNames(); // Capitaliser les noms de comptes existants
          
          // Invalider toutes les requêtes après le nettoyage
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['recurringTransactions'] });
          queryClient.invalidateQueries({ queryKey: ['statistics'] });
        } catch (initError) {
          console.error('Erreur lors de l\'initialisation de la base de données:', initError);
          
          // Force une réinitialisation complète des marqueurs pour éviter les boucles
          localStorage.removeItem('isRedirecting');
          localStorage.removeItem('isCheckingRedirect');
          localStorage.removeItem('isSyncing');
          localStorage.removeItem('syncEventTriggered');
          localStorage.removeItem('layoutRefreshing');
          localStorage.removeItem('statsRefreshing');
          
          // Si l'erreur persiste, forcer une réinitialisation complète
          if (!needsFullRecovery) {
            console.warn('Tentative de récupération automatique suite à une erreur d\'initialisation');
            localStorage.setItem('needsFullRecovery', 'true');
            window.location.reload();
            return;
          }
        }
      } catch (error) {
        console.error('Erreur lors du nettoyage des données:', error);
      }
    };
    
    cleanData();
    
    // Exécuter les transactions récurrentes
    if (!recurringTransactionsChecked) {
      const checkRecurringTransactions = async () => {
        try {
          console.log("Vérification des transactions récurrentes...");
          const executedCount = await executeRecurringTransactions();
          if (executedCount > 0) {
            console.log(`${executedCount} transactions récurrentes exécutées`);
            // Invalider les requêtes pour que les nouveaux soldes soient recalculés
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['forecastBalance'] });
            queryClient.invalidateQueries({ queryKey: ['historicalBalances'] });
          } else {
            console.log("Aucune transaction récurrente à exécuter aujourd'hui");
          }
          setRecurringTransactionsChecked(true);
        } catch (error) {
          console.error("Erreur lors de l'exécution des transactions récurrentes:", error);
          setRecurringTransactionsChecked(true);
        }
      };
      
      // Délai pour s'assurer que la base de données est bien initialisée
      setTimeout(checkRecurringTransactions, 2000);
    }
    
    // Vérifier s'il y a eu une synchronisation récente (moins de 5 minutes)
    const lastSyncTime = localStorage.getItem('lastSyncTime');
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const shouldSync = !lastSyncTime || (now - parseInt(lastSyncTime)) > FIVE_MINUTES;
    
    // Forcer une synchronisation des données au démarrage si l'utilisateur est connecté et qu'aucune sync récente n'a eu lieu
    if (isAuthenticated && shouldSync) {
      console.log("Synchronisation forcée au démarrage de l'application");
      
      // Délai suffisant pour que l'application soit bien initialisée
      setTimeout(() => {
        syncData().then(() => {
          // Stocker le timestamp de la dernière synchronisation
          localStorage.setItem('lastSyncTime', Date.now().toString());
          
          // Invalider les requêtes uniquement si on n'est pas déjà en train de synchroniser
          if (!localStorage.getItem('isSyncing')) {
            // Marquer que nous sommes en train de synchroniser
            localStorage.setItem('isSyncing', 'true');
            
            // Utiliser resetQueries qui est plus puissant que invalidateQueries
            queryClient.resetQueries({ queryKey: ['accounts'] });
            queryClient.resetQueries({ queryKey: ['transactions'] });
            queryClient.resetQueries({ queryKey: ['forecastBalance'] });
            queryClient.resetQueries({ queryKey: ['historicalBalances'] });
            queryClient.resetQueries({ queryKey: ['statisticsData'] });
            
            // Rétablir après un délai
            setTimeout(() => {
              localStorage.removeItem('isSyncing');
              
              // Déclencher l'événement une seule fois
              if (!localStorage.getItem('syncEventTriggered')) {
                localStorage.setItem('syncEventTriggered', 'true');
                
                try {
                  window.dispatchEvent(new StorageEvent('storage', {
                    key: 'lastSyncTime',
                    newValue: Date.now().toString(),
                    storageArea: localStorage
                  }));
                  
                  // Nettoyer le marqueur après 2 secondes
                  setTimeout(() => {
                    localStorage.removeItem('syncEventTriggered');
                  }, 2000);
                  
                } catch (e) {
                  console.error('Erreur lors du déclenchement de l\'event storage');
                }
              }
            }, 1000);
          }
          
          console.log('Synchronisation au démarrage terminée');
        });
      }, 1000);
    } else if (isAuthenticated) {
      console.log('Synchronisation ignorée - dernière sync trop récente');
    }
  }, [isAuthenticated, syncData, queryClient]);

  return (
    <>
      <AuthPatch />
      <AuthStabilityPatch />
      <DBVersionPatch />
      <Toaster />
      <Sonner />
      
      {/* Alerte de récupération des données */}
      <DataRecoveryAlert 
        open={needsRecovery} 
        onOpenChange={resetRecoveryState} 
      />
      
      {/* Fenêtre modale de synchronisation */}
        <SyncLoadingModal 
        open={isInitialSync && isSyncing} 
        syncProgress={syncProgress} 
      />
      <BrowserRouter>
        <Routes>
          {/* Route publique pour l'authentification */}
          <Route path="/auth" element={<Auth />} />
          
          {/* Routes protégées */}
          <Route 
            path="/" 
            element={
              <AuthGuard>
                <Index />
              </AuthGuard>
            } 
          />
          <Route 
            path="/accounts" 
            element={
              <AuthGuard>
                <Accounts />
              </AuthGuard>
            } 
          />
          <Route 
            path="/transactions" 
            element={
              <AuthGuard>
                <Transactions />
              </AuthGuard>
            } 
          />
          <Route 
            path="/statistics" 
            element={
              <AuthGuard>
                <Statistics />
              </AuthGuard>
            } 
          />
          <Route 
            path="/settings" 
            element={
              <AuthGuard>
                <Settings />
              </AuthGuard>
            } 
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <DeviceProvider>
        <AuthProvider>
          <AccountFilterProvider>
            <AppContent />
          </AccountFilterProvider>
        </AuthProvider>
      </DeviceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
