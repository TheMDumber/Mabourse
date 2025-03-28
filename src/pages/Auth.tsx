import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoginForm } from '@/components/auth/LoginForm';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { fileStorage } from '@/lib/fileStorageAdapter';
import { detectAuthInconsistencies } from '@/lib/authDebug';
import { AuthFixDialog } from '@/components/auth/AuthFixDialog';
import { toast } from 'sonner';

enum AuthMode {
  LOGIN,
  REGISTER
}

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>(AuthMode.LOGIN);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authFixDialogOpen, setAuthFixDialogOpen] = useState(false);
  const [authIssuesDetected, setAuthIssuesDetected] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Vérifier si l'utilisateur est déjà connecté - une seule fois au chargement
  useEffect(() => {
    // Bloquer toute redirection automatique vers logout.html
    if (sessionStorage.getItem('preventLogoutRedirect') !== 'true') {
      sessionStorage.setItem('preventLogoutRedirect', 'true');
      
      try {
        // Test des environnements qui ne permettent pas d'écraser les méthodes window.location
        // comme Brave ou certaines configurations de Firefox
        const testObj = {};
        Object.defineProperty(testObj, 'assign', {
          value: () => {},
          writable: false,
          configurable: false
        });
        
        // Si on arrive ici, c'est que la modification d'une propriété read-only n'a pas levé d'erreur
        // Donc on peut modifier window.location.assign et window.location.replace
        const originalAssign = window.location.assign;
        const originalReplace = window.location.replace;
        
        // Utiliser Object.defineProperty pour remplacer de façon sûre
        Object.defineProperty(window.location, 'assign', {
          value: function(url: string | URL) {
            if (url && url.toString().includes('logout.html')) {
              console.log('Blocage de redirection vers logout.html');
              return undefined as any;
            }
            return originalAssign.apply(window.location, [url]);
          },
          writable: true,
          configurable: true
        });
        
        Object.defineProperty(window.location, 'replace', {
          value: function(url: string | URL) {
            if (url && url.toString().includes('logout.html')) {
              console.log('Blocage de redirection de remplacement vers logout.html');
              return undefined as any;
            }
            return originalReplace.apply(window.location, [url]);
          },
          writable: true,
          configurable: true
        });
      } catch (error) {
        // Si une erreur se produit, c'est que la modification de window.location n'est pas autorisée
        // (cas de Brave ou certaines configurations de Firefox)
        console.log('Navigation sécurisée détectée, utilisation du mode alternatif');
        sessionStorage.setItem('secureNavigationMode', 'true');
      }
    }
    
    // Nettoyer tout marqueur potentiellement restant d'une session précédente
    // Cela aide à éviter les boucles de redirection, particulièrement en environnement réseau
    localStorage.removeItem('isCheckingRedirect');
    localStorage.removeItem('isRedirecting');
    localStorage.removeItem('redirectAttemptCount');
    localStorage.removeItem('lastRedirectTime');
    localStorage.removeItem('rebootCount');
    localStorage.removeItem('lastRebootTime');
    
    // Détecter si nous sommes en mode réseau distant
    const isRemoteNetwork = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    console.log('Mode réseau distant:', isRemoteNetwork);
    
    // Vérifier s'il y a des problèmes dans l'état d'authentification
    const authIssues = detectAuthInconsistencies();
    if (authIssues.length > 0) {
      console.warn('Problèmes d\'authentification détectés:', authIssues);
      setAuthIssuesDetected(true);
    }
    
    // Vérifier silencieusement l'authentification
    const isUserLoggedIn = fileStorage.isLoggedIn();
    
    // Obtenir l'URL de redirection si présente
    const from = location.state?.from?.pathname || '/';
    
    if (isUserLoggedIn) {
      console.log('Utilisateur déjà connecté, redirection vers:', from);
      
      // Utiliser un délai plus long en mode réseau pour éviter les problèmes
      const redirectDelay = isRemoteNetwork ? 500 : 200;
      
      // Marquer que nous sommes en train de rediriger pour éviter les boucles
      localStorage.setItem('isRedirecting', 'true');
      
      setTimeout(() => {
        navigate(from, { replace: true });
        // Enlever le marqueur après la redirection
        setTimeout(() => {
          localStorage.removeItem('isRedirecting');
        }, 1000);
      }, redirectDelay);
    } else {
      console.log('Utilisateur non connecté');
    }
    
    setCheckingAuth(false);
    
    // Afficher l'invitation à réparer s'il y a des problèmes détectés
    if (authIssuesDetected) {
      toast.warning(
        "Problème d'authentification détecté", 
        {
          description: "Cliquez pour réparer votre session",
          action: {
            label: "Réparer",
            onClick: () => setAuthFixDialogOpen(true)
          },
          duration: 10000
        }
      );
    }
    
    // Mettre à jour le titre de la page
    document.title = 'Authentification | Ma Bourse 💰';
    
    // Nettoyage au démontage
    return () => {
      // S'assurer que tous les marqueurs sont nettoyés lors du démontage du composant
      localStorage.removeItem('isCheckingRedirect');
      localStorage.removeItem('isRedirecting');
      localStorage.removeItem('redirectAttemptCount');
      localStorage.removeItem('lastRedirectTime');
      // En mode réseau, supprimer le marqueur lastAuthCheck pour permettre une nouvelle vérification après navigation
      const isRemoteNetwork = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isRemoteNetwork) {
        localStorage.removeItem('lastAuthCheck');
      }
    };
  }, []);

  // Fonction appelée après une connexion ou inscription réussie
  const handleAuthSuccess = () => {
    console.log('Authentification réussie, redirection vers la page d\'accueil');
    
    // Détecter si nous sommes en mode réseau distant
    const isRemoteNetwork = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    console.log('Mode réseau distant:', isRemoteNetwork);
    
    // Supprimer le marqueur lastAuthCheck pour permettre une nouvelle vérification après connexion
    localStorage.removeItem('lastAuthCheck');
    
    // Nettoyer tous les marqueurs qui pourraient causer des problèmes
    localStorage.removeItem('isRedirecting');
    localStorage.removeItem('isCheckingRedirect');
    localStorage.removeItem('redirectAttemptCount');
    localStorage.removeItem('lastRedirectTime');
    localStorage.removeItem('isSyncing');
    localStorage.removeItem('syncEventTriggered');
    
    // Vérifier une dernière fois avant de rediriger
    if (!fileStorage.isLoggedIn()) {
      console.error('Erreur: Authentication signalée comme réussie mais isLoggedIn() retourne false');
      toast.error(
        "Problème lors de la connexion", 
        {
          description: "Un problème est survenu, veuillez réessayer",
          duration: 5000
        }
      );
      return;
    }
    
    // Effectuer la redirection avec un délai court pour donner le temps au système de traiter
    const from = location.state?.from?.pathname || '/';
    console.log('Redirection vers:', from);
    
    // Utiliser un délai plus long en mode réseau
    const redirectDelay = isRemoteNetwork ? 1000 : 300;
    
    // Marquer que nous sommes en train de rediriger pour éviter les boucles
    localStorage.setItem('isRedirecting', 'true');
    
    // Utiliser setTimeout pour éviter les problèmes de navigation trop rapide
    setTimeout(() => {
      // Forcer la redirection avec remplacement pour éviter les problèmes de retour
      navigate(from, { replace: true });
      console.log('Navigation exécutée');
      
      // Enlever le marqueur après la redirection
      setTimeout(() => {
        localStorage.removeItem('isRedirecting');
      }, 1000);
    }, redirectDelay);
  };

  // Changer entre les modes connexion et inscription
  const toggleMode = () => {
    setMode(mode === AuthMode.LOGIN ? AuthMode.REGISTER : AuthMode.LOGIN);
  };

  // Afficher un indicateur de chargement pendant la vérification
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p>Vérification de l'authentification...</p>
          <AuthFixDialog
        open={authFixDialogOpen}
        onOpenChange={setAuthFixDialogOpen}
        onSuccess={handleAuthSuccess}
      />
    </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold">Ma Bourse 💰</h1>
          <p className="text-muted-foreground mt-2">Gérez vos finances en toute simplicité</p>
        </div>

        {mode === AuthMode.LOGIN ? (
          <LoginForm 
            onSuccess={handleAuthSuccess} 
            onRegisterClick={toggleMode}
          />
        ) : (
          <RegisterForm 
            onSuccess={handleAuthSuccess} 
            onLoginClick={toggleMode}
          />
        )}
      </div>
    </div>
  );
};

export default Auth;
