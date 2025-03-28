import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeviceContext } from "@/contexts/DeviceContext";
import { useAccountFilter } from "@/contexts/AccountFilterContext";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Filter, SortDesc, SortAsc, Plus, Pencil, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import db from "@/lib/db";
import { Transaction, TransactionType, ExpenseCategory } from "@/lib/types";
import { TransactionForm } from "./TransactionForm";
import { TransactionEditForm } from "./TransactionEditForm";
import { cn } from "@/lib/utils";

type SortField = "date" | "amount" | "description";
type SortDirection = "asc" | "desc";

// Configuration de la pagination
interface PaginationConfig {
  pageSize: number; 
  currentPage: number;
  totalItems: number;
  totalPages: number;
}

interface TransactionsListProps {
  onAddTransaction?: () => void;
  onAddIncome?: () => void;
  onAddExpense?: () => void;
  onAddTransfer?: () => void;
  onAccountFilterChange?: (value: number | "all") => void;
  onEditTransaction?: (transaction: Transaction) => void;
  onTransactionUpdated?: () => void;
  onMonthChange?: ((month: string) => void) | null;
}

export function TransactionsList({
  onAddTransaction,
  onAddIncome,
  onAddExpense,
  onAddTransfer,
  onAccountFilterChange,
  onEditTransaction,
  onTransactionUpdated,
  onMonthChange
}: TransactionsListProps) {
  const [filter, setFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [accountFilter, setAccountFilter] = useState<number | "all">("all");
  const { selectedAccount, setSelectedAccount } = useAccountFilter();
  
  // État pour la pagination
  const [pagination, setPagination] = useState<PaginationConfig>({
    pageSize: 10, // Nombre d'éléments par page
    currentPage: 1, // Page actuelle
    totalItems: 0, // Nombre total d'éléments
    totalPages: 1 // Nombre total de pages
  });
  
  // Synchroniser l'état local avec le contexte global
  useEffect(() => {
    setAccountFilter(selectedAccount);
  }, [selectedAccount]);
  
  // Synchroniser le contexte global avec l'état local quand l'utilisateur change le filtre
  const handleAccountFilterChange = (value: number | "all") => {
    setAccountFilter(value);
    if (onAccountFilterChange) {
      onAccountFilterChange(value);
    }
  };
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "all">("all");
  const currentDate = new Date();
  const defaultMonth = format(currentDate, "yyyy-MM");
  console.log('Date actuelle:', currentDate, 'Mois par défaut:', defaultMonth);
  
  const [currentMonth, setCurrentMonth] = useState<string>(defaultMonth);
  
  // Force re-render when filters change
  const [renderKey, setRenderKey] = useState(0);
  const { isMobile } = useDeviceContext();
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  
  // Accès au queryClient pour les invalidations manuelles
  const queryClient = useQueryClient();
  
  // Effect to force re-render when filters change
  useEffect(() => {
    setRenderKey(prev => prev + 1);
    console.log('Filters changed, forcing re-render');
  }, [selectedAccount, typeFilter, categoryFilter, currentMonth]);
  
  // Fonction pour gérer la modification d'une transaction
  const handleEditTransaction = (transaction: Transaction) => {
    console.log('Édition de la transaction:', transaction);
    setEditingTransaction({...transaction}); // Créer une copie pour éviter des problèmes de référence
    setIsEditFormOpen(true);
    if (onEditTransaction) {
      onEditTransaction(transaction);
    }
  };
  
  // Fonction pour fermer le formulaire d'édition
  const handleCloseEditForm = () => {
    setIsEditFormOpen(false);
    setEditingTransaction(null);
  };
  
  // Fonction appelée après la mise à jour d'une transaction
  const handleTransactionUpdated = () => {
    handleCloseEditForm();
    if (onTransactionUpdated) {
      onTransactionUpdated();
    }
  };

  const { data: transactionsData = { transactions: [], total: 0 }, isLoading } = useQuery({
    queryKey: ["transactions", pagination.currentPage, pagination.pageSize, currentMonth],
    queryFn: async () => {
      console.log(`Chargement de la page ${pagination.currentPage} avec ${pagination.pageSize} éléments par page`);
      const [year, month] = currentMonth.split("-").map(Number);
      const firstDayOfMonth = new Date(year, month - 1, 1);
      const lastDayOfMonth = new Date(year, month, 0);
      
      return db.transactions.getByDateRangePaginated(firstDayOfMonth, lastDayOfMonth, pagination.currentPage, pagination.pageSize);
    },
    onSuccess: (data) => {
      setPagination(prev => ({
        ...prev,
        totalItems: data.total,
        totalPages: Math.ceil(data.total / pagination.pageSize)
      }));
    }
  });
  
  // Extraire les transactions de la réponse paginée
  const transactions = transactionsData.transactions;

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      return db.accounts.getAll();
    },
  });

  // Obtenir les mois uniques à partir des transactions
  // Remarque: Utilise toutes les transactions pour obtenir les mois disponibles
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["allTransactions"],
    queryFn: async () => {
      return db.transactions.getAll();
    },
  });
  
  const months = useMemo(() => {
    const uniqueMonths = new Set<string>();
    
    allTransactions.forEach((tx) => {
      const month = format(new Date(tx.date), "yyyy-MM");
      uniqueMonths.add(month);
    });
    
    const sortedMonths = Array.from(uniqueMonths).sort().reverse();
    console.log('Mois disponibles:', sortedMonths);
    
    // Si aucun mois n'est trouvé dans les transactions, retourner au moins le mois actuel
    if (sortedMonths.length === 0) {
      sortedMonths.push(defaultMonth);
    }
    
    // Si le mois actuel n'est pas dans la liste, sélectionner automatiquement le dernier mois avec des transactions
    if (sortedMonths.length > 0 && currentMonth !== sortedMonths[0] && !sortedMonths.includes(currentMonth)) {
      setTimeout(() => setCurrentMonth(sortedMonths[0]), 0);
    }
    
    return sortedMonths;
  }, [transactions, currentMonth, defaultMonth]);

  // Filtrer les transactions par mois, type, compte et recherche
  console.log('Transactions paginées:', transactions);
  console.log('Filtre actif - Compte:', selectedAccount, 'Type:', typeFilter, 'Catégorie:', categoryFilter);
  console.log('Pagination:', pagination);
  
  const filteredTransactions = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    
    return transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      const isInSelectedMonth = 
        txDate.getFullYear() === year && 
        txDate.getMonth() === month - 1;
      
      const matchesTypeFilter = 
        typeFilter === "all" || 
        tx.type === typeFilter ||
        // Considérer les transferts entrants comme des revenus
        (typeFilter === TransactionType.INCOME && 
         tx.type === TransactionType.TRANSFER && 
         tx.toAccountId === selectedAccount) ||
        // Considérer les transferts sortants comme des dépenses
        (typeFilter === TransactionType.EXPENSE && 
         tx.type === TransactionType.TRANSFER && 
         tx.accountId === selectedAccount);
      
      const matchesCategoryFilter = 
        categoryFilter === "all" || 
        (tx.category === categoryFilter);
      
      const matchesAccountFilter = 
        selectedAccount === "all" || 
        tx.accountId === selectedAccount || 
        (tx.type === TransactionType.TRANSFER && tx.toAccountId === selectedAccount);
      
      const matchesSearchFilter = 
        !filter || 
        tx.description.toLowerCase().includes(filter.toLowerCase());
      
      return isInSelectedMonth && matchesTypeFilter && 
             (typeFilter !== TransactionType.EXPENSE || matchesCategoryFilter) &&
             matchesSearchFilter && matchesAccountFilter;
    });
  }, [transactions, currentMonth, typeFilter, filter, categoryFilter, accountFilter]);
  
  // Log du résultat final du filtrage
  console.log('Transactions filtrées:', filteredTransactions);

  // Calculer les totaux par catégorie pour le mois sélectionné
  // Note: Pour les totaux, nous utilisons toutes les transactions du mois, pas seulement celles paginées
  const { data: monthlyTransactions = [] } = useQuery({
    queryKey: ["monthlyTransactions", currentMonth],
    queryFn: async () => {
      const [year, month] = currentMonth.split("-").map(Number);
      const firstDayOfMonth = new Date(year, month - 1, 1);
      const lastDayOfMonth = new Date(year, month, 0);
      return db.transactions.getByDateRange(firstDayOfMonth, lastDayOfMonth);
    },
  });
  
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {
      [ExpenseCategory.FIXED]: 0,
      [ExpenseCategory.RECURRING]: 0,
      [ExpenseCategory.EXCEPTIONAL]: 0,
      incomes: 0,
      expenses: 0,
      balance: 0,
    };
    
    const [year, month] = currentMonth.split("-").map(Number);
    
    monthlyTransactions.forEach((tx) => {
      const txDate = new Date(tx.date);
      const isInSelectedMonth = txDate.getFullYear() === year && txDate.getMonth() === month - 1;
      const matchesAccountFilter = 
        selectedAccount === "all" || 
        tx.accountId === selectedAccount || 
        (tx.type === TransactionType.TRANSFER && tx.toAccountId === selectedAccount);
      
      if (isInSelectedMonth && matchesAccountFilter) {
        if (tx.type === TransactionType.INCOME || 
            (tx.type === TransactionType.TRANSFER && tx.toAccountId === selectedAccount)) {
          totals.incomes += tx.amount;
          totals.balance += tx.amount;
        } else if (tx.type === TransactionType.EXPENSE || 
                   (tx.type === TransactionType.TRANSFER && tx.accountId === selectedAccount)) {
          totals.expenses += tx.amount;
          totals.balance -= tx.amount;
          
          if (tx.category) {
            totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
          }
        }
      }
    });
    
    return totals;
  }, [transactions, currentMonth, selectedAccount]);

  // Trier les transactions
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let compareResult = 0;
      
      if (sortField === "date") {
        compareResult = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === "amount") {
        compareResult = a.amount - b.amount;
      } else if (sortField === "description") {
        compareResult = a.description.localeCompare(b.description);
      }
      
      return sortDirection === "asc" ? compareResult : -compareResult;
    });
  }, [filteredTransactions, sortField, sortDirection, selectedAccount, typeFilter, categoryFilter]);

  // Compte le nombre de revenus et dépenses (calculés à partir des transactions mensuelles complètes)
  const transactionCounts = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    
    // Utiliser les transactions mensuelles complètes
    const monthFilteredTransactions = monthlyTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      const isInSelectedMonth = txDate.getFullYear() === year && txDate.getMonth() === month - 1;
      
      const matchesAccountFilter = 
        selectedAccount === "all" || 
        tx.accountId === selectedAccount || 
        (tx.type === TransactionType.TRANSFER && tx.toAccountId === selectedAccount);
        
      return isInSelectedMonth && matchesAccountFilter;
    });
    
    // Puis compter par type (en tenant compte du compte filtré pour les transferts)
    const incomeCount = monthFilteredTransactions.filter(tx => 
      tx.type === TransactionType.INCOME || 
      (tx.type === TransactionType.TRANSFER && selectedAccount !== "all" && tx.toAccountId === selectedAccount)
    ).length;
    
    const expenseCount = monthFilteredTransactions.filter(tx => 
      tx.type === TransactionType.EXPENSE || 
      (tx.type === TransactionType.TRANSFER && selectedAccount !== "all" && tx.accountId === selectedAccount)
    ).length;
    
    // Pour "all", on ne compte les transferts qu'une seule fois
    const transferCount = selectedAccount === "all" ? 
      monthFilteredTransactions.filter(tx => tx.type === TransactionType.TRANSFER).length : 0;
    
    return {
      all: monthFilteredTransactions.length,
      income: incomeCount,
      expense: expenseCount,
      transfer: transferCount
    };
  }, [transactions, currentMonth, accountFilter]);

  // Obtenir le nom du compte
  const getAccountName = (accountId: number) => {
    const account = accounts.find((acc) => acc.id === accountId);
    return account ? account.name : "Compte inconnu";
  };

  // Obtenir l'icône par type de transaction
  const getTransactionIcon = (type: TransactionType, transaction?: Transaction) => {
    switch (type) {
      case TransactionType.INCOME:
        return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
      case TransactionType.EXPENSE:
        return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
      case TransactionType.TRANSFER:
        // Si c'est un transfert et qu'on filtre par un compte spécifique
        if (transaction && selectedAccount !== "all") {
          // Si on regarde le compte source (débité)
          if (transaction.accountId === selectedAccount) {
            return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
          }
          // Si on regarde le compte destination (crédité)
          else if (transaction.toAccountId === selectedAccount) {
            return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
          }
        }
        // Cas par défaut pour les transferts
        return <ArrowLeftRight className="w-4 h-4 text-blue-500" />;
    }
  };

  // Obtenir le badge de catégorie
  const getCategoryBadge = (category?: string) => {
    if (!category) return null;
    
    const colors: Record<string, string> = {
      [ExpenseCategory.FIXED]: "bg-indigo-500 hover:bg-indigo-600",
      [ExpenseCategory.RECURRING]: "bg-amber-500 hover:bg-amber-600",
      [ExpenseCategory.EXCEPTIONAL]: "bg-purple-500 hover:bg-purple-600",
    };
    
    const labels: Record<string, string> = {
      [ExpenseCategory.FIXED]: "Fixe",
      [ExpenseCategory.RECURRING]: "Courante",
      [ExpenseCategory.EXCEPTIONAL]: "Exceptionnelle",
    };
    
    return (
      <Badge className={colors[category] || "bg-gray-500"}>
        {labels[category] || category}
      </Badge>
    );
  };

  // Formatter un montant
  const formatAmount = (amount: number, type: TransactionType, transaction?: Transaction) => {
    // Pour les transferts avec filtre de compte spécifique
    if (type === TransactionType.TRANSFER && transaction && selectedAccount !== "all") {
      // Si on regarde le compte source (débité)
      if (transaction.accountId === selectedAccount) {
        return `- ${new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: "EUR",
        }).format(amount)}`;
      }
      // Si on regarde le compte destination (crédité)
      else if (transaction.toAccountId === selectedAccount) {
        return new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: "EUR",
        }).format(amount);
      }
    }
    
    // Cas standard
    const formatted = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
    
    return type === TransactionType.EXPENSE ? 
      `- ${formatted}` : formatted;
  };

  // Obtenir la couleur du texte selon le type
  const getAmountColor = (type: TransactionType, transaction?: Transaction) => {
    // Pour les transferts avec filtre de compte spécifique
    if (type === TransactionType.TRANSFER && transaction && selectedAccount !== "all") {
      // Si on regarde le compte source (débité)
      if (transaction.accountId === selectedAccount) {
        return "text-red-600 dark:text-red-400";
      }
      // Si on regarde le compte destination (crédité)
      else if (transaction.toAccountId === selectedAccount) {
        return "text-green-600 dark:text-green-400";
      }
    }
    
    // Cas standard
    switch (type) {
      case TransactionType.INCOME:
        return "text-green-600 dark:text-green-400";
      case TransactionType.EXPENSE:
        return "text-red-600 dark:text-red-400";
      case TransactionType.TRANSFER:
        return "text-blue-600 dark:text-blue-400";
    }
  };

  // Suppression du retour de chargement ici car nous l'affichons maintenant dans le composant

  return (
    <>
      <div className="space-y-6">
        {/* En-tête et filtres */}
        {isLoading && (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg">Chargement des transactions...</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div>
              <h2 className="text-2xl font-bold">Transactions</h2>
              <p className="text-muted-foreground">
                Gérez vos revenus et dépenses
              </p>
            </div>
            
            {/* Filtre par compte déplacé ici */}
            <div className="flex items-center">
              <span className="mr-2 font-semibold text-primary">Compte :</span>
              <Select 
                key={`account-select-header-${renderKey}`} 
                value={accountFilter === "all" ? "all" : accountFilter.toString()} 
                onValueChange={(value) => {
                  console.log('Valeur sélectionnée:', value);
                  const newFilter = value === "all" ? "all" : parseInt(value);
                  handleAccountFilterChange(newFilter);
                  console.log('accountFilter après changement:', newFilter);
                }}
              >
                <SelectTrigger className="w-[230px] border-2 border-primary font-medium">
                  <SelectValue placeholder="Tous les comptes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center justify-between w-full">
                      <span>Tous les comptes</span>
                      {accountFilter === "all" && (
                        <Badge variant="outline" className="ml-2 bg-primary text-primary-foreground">actif</Badge>
                      )}
                    </div>
                  </SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id!.toString()}>
                      <div className="flex items-center justify-between w-full">
                        <span>{account.name}</span>
                        {accountFilter === account.id && (
                          <Badge variant="outline" className="ml-2 bg-primary text-primary-foreground">actif</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {/* Boutons d'ajout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="sm:w-[140px]" disabled={!accounts || accounts.length === 0}>
                  <Plus className="mr-2 h-4 w-4" /> Ajouter
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onAddIncome}>
                  <ArrowUpCircle className="w-4 h-4 text-green-500 mr-2" />
                  Revenu
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddExpense}>
                  <ArrowDownCircle className="w-4 h-4 text-red-500 mr-2" />
                  Dépense
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onAddTransfer} disabled={!accounts || accounts.length < 2}>
                  <ArrowLeftRight className="w-4 h-4 text-blue-500 mr-2" />
                  Transfert
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Select 
              value={currentMonth} 
              onValueChange={(value) => {
                console.log('Nouveau mois sélectionné:', value);
                // Mettre à jour le mois local
                setCurrentMonth(value);
                
                // Invalider explicitement la requête de solde prévisionnel
                queryClient.invalidateQueries({ queryKey: ['forecastBalance'] });
                
                // Notifier le composant parent du changement de mois
                if (onMonthChange) {
                  onMonthChange(value);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sélectionner un mois" />
              </SelectTrigger>
              <SelectContent>
                {months.length > 0 ? (
                  months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {format(new Date(`${month}-01`), "MMMM yyyy", { locale: fr })}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={defaultMonth}>
                    {format(new Date(`${defaultMonth}-01`), "MMMM yyyy", { locale: fr })}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            
            <Input
              placeholder="Rechercher..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full sm:w-[240px]"
            />
          </div>
        </div>
        
        {/* Résumé du mois */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" key={`summary-${renderKey}`}>
          <Card key={`revenue-${renderKey}-${selectedAccount}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Revenus</CardTitle>
              <CardDescription>Total des revenus {selectedAccount === "all" ? "du mois" : "du compte"}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                }).format(categoryTotals.incomes)}
              </p>
            </CardContent>
          </Card>
          
          <Card key={`expenses-${renderKey}-${selectedAccount}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Dépenses</CardTitle>
              <CardDescription>Total des dépenses {selectedAccount === "all" ? "du mois" : "du compte"}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                }).format(categoryTotals.expenses)}
              </p>
            </CardContent>
          </Card>
          
          <Card key={`balance-${renderKey}-${selectedAccount}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Balance</CardTitle>
              <CardDescription>Différence revenus - dépenses {selectedAccount !== "all" && "du compte"}</CardDescription>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  "text-2xl font-bold",
                  categoryTotals.balance >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                )}
              >
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                }).format(categoryTotals.balance)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Détail des dépenses par catégorie */}
        <Card className="bg-muted/40" key={`category-expenses-${renderKey}`}>
          <CardHeader>
            <CardTitle>Dépenses par catégorie</CardTitle>
            <CardDescription>
              Répartition de vos dépenses {selectedAccount !== "all" ? "pour ce compte" : ""} pour {format(new Date(`${currentMonth}-01`), "MMMM yyyy", { locale: fr })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between bg-background p-3 rounded-lg" key={`fixed-${renderKey}-${selectedAccount}`}>
                <div className="flex items-center gap-2">
                  <Badge className="bg-indigo-500">Fixe</Badge>
                  <span>Dépenses fixes</span>
                </div>
                <span className="font-semibold">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  }).format(categoryTotals[ExpenseCategory.FIXED])}
                </span>
              </div>
              
              <div className="flex items-center justify-between bg-background p-3 rounded-lg" key={`recurring-${renderKey}-${selectedAccount}`}>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-500">Courante</Badge>
                  <span>Dépenses courantes</span>
                </div>
                <span className="font-semibold">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  }).format(categoryTotals[ExpenseCategory.RECURRING])}
                </span>
              </div>
              
              <div className="flex items-center justify-between bg-background p-3 rounded-lg" key={`exceptional-${renderKey}-${selectedAccount}`}>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-500">Exceptionnelle</Badge>
                  <span>Dépenses exceptionnelles</span>
                </div>
                <span className="font-semibold">
                  {new Intl.NumberFormat("fr-FR", {
                    style: "currency",
                    currency: "EUR",
                  }).format(categoryTotals[ExpenseCategory.EXCEPTIONAL])}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liste des transactions avec filtres et tri */}
        <Tabs defaultValue="all" className="w-full" onValueChange={(value) => setTypeFilter(value as TransactionType | "all")}>
          <div className="flex justify-between items-center mb-4">
            <TabsList className="w-full md:w-auto">
              <TabsTrigger value="all" className="relative">
                Tout
                <Badge variant="outline" className="ml-2">
                  {transactionCounts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value={TransactionType.INCOME} className="relative">
                Revenus
                <Badge variant="outline" className="ml-2">
                  {transactionCounts.income}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value={TransactionType.EXPENSE} className="relative">
                Dépenses
                <Badge variant="outline" className="ml-2">
                  {transactionCounts.expense}
                </Badge>
              </TabsTrigger>
            </TabsList>
            
            <div className="flex gap-2">
              
              {/* Filtre par catégorie (uniquement pour les dépenses) */}
              {typeFilter === TransactionType.EXPENSE && (
                <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as ExpenseCategory | "all")}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value={ExpenseCategory.FIXED}>Fixes</SelectItem>
                    <SelectItem value={ExpenseCategory.RECURRING}>Courantes</SelectItem>
                    <SelectItem value={ExpenseCategory.EXCEPTIONAL}>Exceptionnelles</SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              {/* Menu de tri */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Trier
                    {sortDirection === "asc" ? (
                      <SortAsc className="h-4 w-4 ml-2" />
                    ) : (
                      <SortDesc className="h-4 w-4 ml-2" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortField("date")}>
                    Date {sortField === "date" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortField("amount")}>
                    Montant {sortField === "amount" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortField("description")}>
                    Description {sortField === "description" && "✓"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setSortDirection(
                        sortDirection === "asc" ? "desc" : "asc"
                      )
                    }
                  >
                    {sortDirection === "asc" ? "Descendant" : "Ascendant"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isMobile ? (
                // Version mobile: liste de cartes au lieu d'un tableau
                <div className="space-y-3 p-3">
                  {transactions.length === 0 ? (
                    <div className="text-center py-4 text-sm">
                      Aucune transaction n'a été enregistrée. Créez votre première transaction en cliquant sur "Ajouter".
                    </div>
                  ) : sortedTransactions.length === 0 ? (
                    <div className="text-center py-4 text-sm">
                    {pagination.totalItems > 0 ? 
                        "Aucune transaction ne correspond aux filtres sélectionnés." : 
                    "Aucune transaction pour ce mois avec les filtres sélectionnés."}
                </div>
                  ) : (
                    sortedTransactions.map((transaction) => (
                      <div 
                        key={transaction.id} 
                        className="bg-card border border-border rounded-lg p-3 shadow-sm"
                        onClick={() => handleEditTransaction(transaction)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(transaction.type, transaction)}
                            <span className="font-medium">
                              {format(new Date(transaction.date), "dd MMM", { locale: fr, })}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "font-medium text-right",
                              getAmountColor(transaction.type, transaction)
                            )}
                          >
                            {formatAmount(transaction.amount, transaction.type, transaction)}
                          </div>
                        </div>
                        
                        <div className="text-sm mb-1 font-medium">{transaction.description}</div>
                        
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <div>
                            {transaction.type === TransactionType.TRANSFER ? (
                              <div>
                                <span>De: {getAccountName(transaction.accountId)}</span>
                                <br />
                                <span>Vers: {transaction.toAccountId && getAccountName(transaction.toAccountId)}</span>
                              </div>
                            ) : (
                              <span>{getAccountName(transaction.accountId)}</span>
                            )}
                          </div>
                          <div>
                            {transaction.type === TransactionType.EXPENSE && getCategoryBadge(transaction.category)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                // Version bureau: tableau standard
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Compte</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">
                        Aucune transaction n'a été enregistrée. Créez votre première transaction en cliquant sur "Ajouter".
                      </TableCell>
                    </TableRow>
                  ) : sortedTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-4">
                        Aucune transaction pour ce mois avec les filtres sélectionnés.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(transaction.type, transaction)}
                            <span>
                              {format(new Date(transaction.date), "dd MMM yyyy", {
                                locale: fr,
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {transaction.description}
                        </TableCell>
                        <TableCell>
                          {transaction.type === TransactionType.TRANSFER ? (
                            <div className="flex flex-col text-xs">
                              <span>De: {getAccountName(transaction.accountId)}</span>
                              <span>
                                Vers: {transaction.toAccountId && getAccountName(transaction.toAccountId)}
                              </span>
                            </div>
                          ) : (
                            getAccountName(transaction.accountId)
                          )}
                        </TableCell>
                        <TableCell>
                          {transaction.type === TransactionType.EXPENSE && getCategoryBadge(transaction.category)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-medium",
                            getAmountColor(transaction.type, transaction)
                          )}
                        >
                          <div className="flex items-center justify-end gap-2">
                            {formatAmount(transaction.amount, transaction.type, transaction)}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 ml-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditTransaction(transaction);
                              }}
                              title="Modifier la transaction"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              )}
            </CardContent>
            
            {/* Contrôles de pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex justify-between items-center p-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Affichage de {((pagination.currentPage - 1) * pagination.pageSize) + 1}-
                  {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} sur {pagination.totalItems} transactions
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPagination(prev => ({ ...prev, currentPage: Math.max(1, prev.currentPage - 1) }))}
                    disabled={pagination.currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Précédent
                  </Button>
                  
                  <div className="flex items-center">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      // Afficher 5 pages maximum centrées sur la page courante
                      let pageNum = pagination.currentPage;
                      
                      if (pagination.totalPages <= 5) {
                        // Si 5 pages ou moins, afficher toutes les pages
                        pageNum = i + 1;
                      } else if (pagination.currentPage <= 3) {
                        // Si on est près du début, afficher les 5 premières pages
                        pageNum = i + 1;
                      } else if (pagination.currentPage >= pagination.totalPages - 2) {
                        // Si on est près de la fin, afficher les 5 dernières pages
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        // Sinon, centrer sur la page courante
                        pageNum = pagination.currentPage - 2 + i;
                      }
                      
                      return (
                        <Button 
                          key={`page-${pageNum}`}
                          variant={pagination.currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          className="w-9 h-9"
                          onClick={() => setPagination(prev => ({ ...prev, currentPage: pageNum }))}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPagination(prev => ({ ...prev, currentPage: Math.min(prev.totalPages, prev.currentPage + 1) }))}
                    disabled={pagination.currentPage === pagination.totalPages}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                
                <Select
                  value={pagination.pageSize.toString()}
                  onValueChange={(value) => {
                    const newPageSize = Number(value);
                    setPagination(prev => ({
                      ...prev,
                      pageSize: newPageSize,
                      currentPage: 1, // Revenir à la première page quand on change la taille
                      totalPages: Math.ceil(prev.totalItems / newPageSize)
                    }));
                  }}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Par page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 par page</SelectItem>
                    <SelectItem value="10">10 par page</SelectItem>
                    <SelectItem value="20">20 par page</SelectItem>
                    <SelectItem value="50">50 par page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>
        </Tabs>
      </div>
      
      {/* Formulaire d'édition de transaction */}
      {editingTransaction && isEditFormOpen && (
        <TransactionEditForm
          open={isEditFormOpen}
          transaction={editingTransaction}
          onClose={handleCloseEditForm}
          onSuccess={handleTransactionUpdated}
          onDelete={handleTransactionUpdated}
        />
      )}
    </>
  );
}
