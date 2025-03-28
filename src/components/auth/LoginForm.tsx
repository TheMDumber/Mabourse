import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fileStorage } from '@/lib/fileStorageAdapter';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { ServerStatusAlert } from '@/components/ui/server-status-alert';
import { checkServerAvailable } from '@/lib/serverCheck';

// Définir le schéma de validation
const formSchema = z.object({
  username: z.string().min(3, {
    message: "Le nom d'utilisateur doit contenir au moins 3 caractères"
  }),
  password: z.string().min(6, {
    message: "Le mot de passe doit contenir au moins 6 caractères"
  })
});

interface LoginFormProps {
  onSuccess: () => void;
  onRegisterClick: () => void;
}

export function LoginForm({ onSuccess, onRegisterClick }: LoginFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);
  const { login } = useAuth();

  // Vérifier la disponibilité du serveur au chargement
  useEffect(() => {
    const checkServer = async () => {
      const available = await checkServerAvailable();
      setServerAvailable(available);
    };
    
    checkServer();
  }, []);

  const handleServerRetry = () => {
    setError(null);
  };

  // Initialiser le formulaire
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: ""
    }
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setError(null);
    setIsLoading(true);

    try {
      // Vérifier d'abord que le serveur est disponible
      const isServerAvailable = await checkServerAvailable();
      setServerAvailable(isServerAvailable);
      
      if (!isServerAvailable) {
        setError("Impossible de se connecter au serveur. Vérifiez que le serveur est démarré et accessible.");
        setIsLoading(false);
        return;
      }

      // Nettoyer tous les marqueurs de synchronisation avant de tenter la connexion
      localStorage.removeItem('isRedirecting');
      localStorage.removeItem('isCheckingRedirect');
      localStorage.removeItem('isSyncing');
      localStorage.removeItem('syncEventTriggered');
      localStorage.removeItem('layoutRefreshing');
      localStorage.removeItem('statsRefreshing');
      localStorage.removeItem('forceSkipSync');
      localStorage.removeItem('redirectAttemptCount');
      localStorage.removeItem('lastRedirectTime');
      
      // Utiliser la fonction login du contexte d'authentification
      console.log('Tentative de connexion pour', values.username);
      const success = await login(values.username, values.password);
      console.log('Résultat de la connexion via contexte:', success);
      
      if (success) {
        console.log('Connexion réussie, appel de onSuccess()');
        
        // Un court délai pour s'assurer que le contexte est bien mis à jour
        setTimeout(() => {
          // Redirection directe vers la page d'accueil
          onSuccess();
        }, 200);
      } else {
        setError("Nom d'utilisateur ou mot de passe incorrect");
      }
    } catch (error) {
      console.error('Erreur lors de la connexion:', error);
      setError("Une erreur est survenue lors de la connexion");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Connectez-vous pour accéder à votre espace personnel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {/* Alerte de statut du serveur s'il y a eu une erreur ou si le serveur est indisponible */}
            {(error?.includes('serveur') || serverAvailable === false) && (
              <div className="mb-4">
                <ServerStatusAlert onRetry={handleServerRetry} />
              </div>
            )}
            
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom d'utilisateur</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" autoComplete="current-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button type="submit" className="w-full" disabled={isLoading || serverAvailable === false}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connexion en cours...
                </>
              ) : 'Se connecter'}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col">
        <div className="mt-2 text-center text-sm">
          Pas encore de compte ?{' '}
          <Button variant="link" className="p-0" onClick={onRegisterClick}>
            Créer un compte
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
