import { format, parse, isAfter, isBefore, addMonths, endOfMonth, startOfMonth, isWithinInterval, subMonths } from 'date-fns';
import db, { initDB } from './db';
import { TransactionType } from './types';
import { objectStoreExists } from './dbUtils';

// Fonction pour calculer le solde à une date donnée pour un compte ou tous les comptes
export async function getBalanceAtDate(accountId: number | "all", date: Date): Promise<number> {
  try {
    // S'assurer que la base de données est initialisée
    await initDB();

    // Récupérer tous les comptes et toutes les transactions
    const accounts = await db.accounts.getAll();
    const transactions = await db.transactions.getAll();

    // Si pas de comptes, retourner 0
    if (accounts.length === 0) {
      return 0;
    }

    // Filtrer les comptes si nécessaire
    const targetAccounts = accountId === "all" 
      ? accounts 
      : accounts.filter(a => a.id === accountId);

    // Si le compte spécifié n'existe pas, retourner 0
    if (targetAccounts.length === 0) {
      return 0;
    }

    // Calculer le solde initial
    let balance = targetAccounts.reduce((sum, account) => sum + account.initialBalance, 0);

    // Filtrer les transactions jusqu'à la date spécifiée
    const relevantTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.date);
      return isBefore(txDate, date) || txDate.getTime() === date.getTime();
    });

    // Calculer l'impact des transactions sur le solde
    for (const transaction of relevantTransactions) {
      const isRelevantAccount = accountId === "all" || transaction.accountId === accountId;
      const isTargetOfTransfer = accountId === "all" || transaction.toAccountId === accountId;

      if (isRelevantAccount) {
        if (transaction.type === TransactionType.INCOME) {
          balance += transaction.amount;
        } else if (transaction.type === TransactionType.EXPENSE) {
          balance -= transaction.amount;
        } else if (transaction.type === TransactionType.TRANSFER) {
          // Pour les transferts, on déduit du compte source
          balance -= transaction.amount;
        }
      }

      // Pour les transferts, ajouter au compte de destination
      if (transaction.type === TransactionType.TRANSFER && isTargetOfTransfer && transaction.toAccountId) {
        balance += transaction.amount;
      }
    }

    return balance;
  } catch (error) {
    console.error('Erreur lors du calcul du solde:', error);
    return 0;
  }
}

// Fonction pour calculer l'évolution du solde sur une période
export async function getBalanceEvolution(
  accountId: number | "all", 
  startDate: Date, 
  endDate: Date
): Promise<{ date: Date; balance: number }[]> {
  try {
    // S'assurer que la base de données est initialisée
    await initDB();

    // Préparer le tableau de résultats
    const result: { date: Date; balance: number }[] = [];

    // Calculer le solde au début de la période
    let currentDate = startOfMonth(startDate);
    let currentBalance = await getBalanceAtDate(accountId, currentDate);

    // Ajouter le solde initial
    result.push({ date: currentDate, balance: currentBalance });

    // Avancer mois par mois jusqu'à la fin de la période
    while (isBefore(currentDate, endDate)) {
      currentDate = endOfMonth(addMonths(currentDate, 1));
      
      // S'assurer de ne pas dépasser la date de fin
      if (isAfter(currentDate, endDate)) {
        currentDate = endDate;
      }
      
      currentBalance = await getBalanceAtDate(accountId, currentDate);
      result.push({ date: currentDate, balance: currentBalance });
    }

    return result;
  } catch (error) {
    console.error('Erreur lors du calcul de l\'évolution du solde:', error);
    return [];
  }
}

// Interface pour le résultat du solde prévisionnel
interface ForecastResult {
  balance: number;
  income: number;
  expense: number;
  isAdjusted?: boolean;
}

// Fonction pour calculer le solde prévisionnel pour un mois en tenant compte des ajustements précédents
export async function getForecastBalance(
  accountId: number | "all", 
  yearMonth: string // Format "YYYY-MM"
): Promise<ForecastResult> {
  try {
    // S'assurer que la base de données est initialisée
    await initDB();

    // Analyser le mois au format YYYY-MM
    const firstDayOfMonth = parse(yearMonth + "-01", "yyyy-MM-dd", new Date());
    const lastDayOfMonth = endOfMonth(firstDayOfMonth);
    
    // IMPORTANT: Calculer correctement tous les mois précédents pour tenir compte des ajustements
    // Remonter 12 mois en arrière pour capturer tous les ajustements possibles
    const allMonths = await calculateMonthlyBalances({
      accountId,
      startDate: subMonths(firstDayOfMonth, 12),
      endDate: lastDayOfMonth,
      includeAdjustments: true
    });
    
    // Trouver le mois demandé dans les résultats
    const currentMonthIndex = allMonths.findIndex(m => m.yearMonth === yearMonth);
    
    // Si le mois demandé n'est pas trouvé (ce qui ne devrait pas arriver), utiliser le calcul standard
    if (currentMonthIndex === -1) {
      console.warn(`Mois ${yearMonth} non trouvé dans les résultats de calculateMonthlyBalances, utilisation du calcul standard`);
      
      // Continuer avec le calcul standard
      const previousMonths = await calculateMonthlyBalances({
        accountId,
        startDate: subMonths(firstDayOfMonth, 6),
        endDate: subMonths(firstDayOfMonth, 1),
        includeAdjustments: true
      });
      
      let startBalance = 0;
      
      if (previousMonths.length > 0) {
        startBalance = previousMonths[previousMonths.length - 1].finalBalance;
      } else {
        const accounts = await db.accounts.getAll();
        const targetAccounts = accountId === "all" 
          ? accounts 
          : accounts.filter(a => a.id === accountId);
        
        startBalance = targetAccounts.reduce((sum, account) => sum + account.initialBalance, 0);
      }
      
      // Récupérer les données du mois en cours
      const monthData = await calculateMonthForForecast(accountId, firstDayOfMonth, lastDayOfMonth);
      
      // Calculer le solde prévisionnel
      const forecastBalance = startBalance + monthData.income - monthData.expense;
      
      // Vérifier s'il y a un ajustement manuel pour ce mois
      if (accountId !== "all") {
        try {
          const storeExists = await objectStoreExists('balanceAdjustments');
          if (storeExists) {
            const adjustment = await db.balanceAdjustments.getByAccountAndMonth(
              accountId as number, 
              yearMonth
            );
            
            if (adjustment) {
              return {
                balance: adjustment.adjustedBalance,
                income: monthData.income,
                expense: monthData.expense,
                isAdjusted: true
              };
            }
          }
        } catch (error) {
          console.error('Erreur lors de la récupération de l\'ajustement de solde:', error);
        }
      }
      
      return {
        balance: forecastBalance,
        income: monthData.income,
        expense: monthData.expense,
        isAdjusted: false
      };
    }
    
    // Trouver les données du mois courant
    const currentMonth = allMonths[currentMonthIndex];
    
    // Si le mois a un ajustement, retourner directement la valeur ajustée
    if (currentMonth.isAdjusted) {
      return {
        balance: currentMonth.finalBalance,
        income: currentMonth.incomes,
        expense: currentMonth.expenses,
        isAdjusted: true
      };
    }
    
    // Sinon, retourner le solde calculé
    return {
      balance: currentMonth.finalBalance,
      income: currentMonth.incomes,
      expense: currentMonth.expenses,
      isAdjusted: false
    };
  } catch (error) {
    console.error('Erreur lors du calcul du solde prévisionnel:', error);
    return { balance: 0, income: 0, expense: 0, isAdjusted: false };
  }
}

// Interface pour les données mensuelles simplifiées
interface MonthData {
  income: number;
  expense: number;
}

// Fonction utilitaire pour calculer les revenus et dépenses d'un mois donné
async function calculateMonthForForecast(
  accountId: number | "all",
  firstDayOfMonth: Date,
  lastDayOfMonth: Date
): Promise<MonthData> {
  // Récupérer toutes les transactions du mois
  const allTransactions = await db.transactions.getAll();
  const monthTransactions = allTransactions.filter(tx => {
    const txDate = new Date(tx.date);
    return isWithinInterval(txDate, {
      start: firstDayOfMonth,
      end: lastDayOfMonth
    });
  });
  
  // Récupérer les transactions récurrentes applicables à ce mois
  const recurringTransactions = await db.recurringTransactions.getAll();
  const applicableRecurringTransactions = recurringTransactions.filter(rtx => {
    const startDate = new Date(rtx.startDate);
    const endDate = rtx.endDate ? new Date(rtx.endDate) : undefined;
    
    return isAfter(lastDayOfMonth, startDate) && 
           (!endDate || isBefore(firstDayOfMonth, endDate));
  });
  
  // Calculer les revenus et dépenses pour le mois
  let monthlyIncome = 0;
  let monthlyExpense = 0;
  
  // Traiter les transactions existantes
  for (const tx of monthTransactions) {
    const isRelevantAccount = accountId === "all" || tx.accountId === accountId;
    const isTargetOfTransfer = accountId === "all" || tx.toAccountId === accountId;
    
    if (isRelevantAccount) {
      if (tx.type === TransactionType.INCOME) {
        monthlyIncome += tx.amount;
      } else if (tx.type === TransactionType.EXPENSE) {
        monthlyExpense += tx.amount;
      } else if (tx.type === TransactionType.TRANSFER) {
        monthlyExpense += tx.amount;
      }
    }
    
    // Pour les transferts, ajouter au compte de destination
    if (tx.type === TransactionType.TRANSFER && isTargetOfTransfer && tx.toAccountId) {
      monthlyIncome += tx.amount;
    }
  }
  
  // Traiter les transactions récurrentes applicables
  for (const rtx of applicableRecurringTransactions) {
    const isRelevantAccount = accountId === "all" || rtx.accountId === accountId;
    const isTargetOfTransfer = accountId === "all" || rtx.toAccountId === accountId;
    
    if (isRelevantAccount) {
      if (rtx.type === TransactionType.INCOME) {
        monthlyIncome += rtx.amount;
      } else if (rtx.type === TransactionType.EXPENSE) {
        monthlyExpense += rtx.amount;
      } else if (rtx.type === TransactionType.TRANSFER) {
        monthlyExpense += rtx.amount;
      }
    }
    
    // Pour les transferts, ajouter au compte de destination
    if (rtx.type === TransactionType.TRANSFER && isTargetOfTransfer && rtx.toAccountId) {
      monthlyIncome += rtx.amount;
    }
  }
  
  return { income: monthlyIncome, expense: monthlyExpense };
}

// Fonction pour calculer le solde actuel
export async function getCurrentBalance(accountId: number | "all"): Promise<number> {
  return getBalanceAtDate(accountId, new Date());
}
export async function getMonthlyBalances(
  startYearMonth: string, // Format YYYY-MM
  months: number, 
  accountId: number | "all"
): Promise<{ month: string; balance: number }[]> {
  const result: { month: string; balance: number }[] = [];
  
  // Date de départ
  let currentDate = parse(startYearMonth + "-01", "yyyy-MM-dd", new Date());
  
  // Pour chaque mois, calculer le solde en fin de mois
  for (let i = 0; i < months; i++) {
    const yearMonth = format(currentDate, "yyyy-MM");
    const endOfMonthDate = endOfMonth(currentDate);
    
    // Calculer le solde pour ce mois
    const balance = await getBalanceAtDate(accountId, endOfMonthDate);
    
    result.push({
      month: yearMonth,
      balance
    });
    
    // Passer au mois suivant
    currentDate = addMonths(currentDate, 1);
  }
  
  return result;
}

// Interface pour les paramètres de calculateMonthlyBalances
interface CalculateMonthlyBalancesParams {
  accountId: number | "all";
  startDate: Date;
  endDate: Date;
  includeAdjustments?: boolean;
}

// Interface pour le résultat mensuel avec soldes détaillés
interface MonthlyBalanceDetail {
  yearMonth: string;
  month: Date;
  initialBalance: number;
  incomes: number;
  expenses: number;
  finalBalance: number;
  isAdjusted: boolean;
}

// Fonction pour calculer les soldes mensuels détaillés
export async function calculateMonthlyBalances({
  accountId,
  startDate,
  endDate,
  includeAdjustments = true
}: CalculateMonthlyBalancesParams): Promise<MonthlyBalanceDetail[]> {
  const result: MonthlyBalanceDetail[] = [];
  
  // Initialiser la date courante au début du mois de la date de début
  let currentDate = startOfMonth(startDate);
  let previousMonthBalance = await getBalanceAtDate(accountId, new Date(currentDate.getTime() - 1)); // Solde du jour précédent
  
  // Boucle sur chaque mois jusqu'à la date de fin
  while (currentDate <= endDate) {
    const yearMonth = format(currentDate, "yyyy-MM");
    const monthEnd = endOfMonth(currentDate);
    
    // Récupérer toutes les transactions du mois
    const allTransactions = await db.transactions.getAll();
    const monthTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return isWithinInterval(txDate, {
        start: currentDate,
        end: monthEnd
      });
    });
    
    // Calculer les revenus et dépenses pour le mois courant
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    
    // Filtrer les transactions par compte si nécessaire
    const relevantTransactions = monthTransactions.filter(tx => {
      return accountId === "all" || 
             tx.accountId === accountId || 
             (tx.type === TransactionType.TRANSFER && tx.toAccountId === accountId);
    });
    
    // Calculer les totaux
    for (const tx of relevantTransactions) {
      if (tx.type === TransactionType.INCOME || 
          (tx.type === TransactionType.TRANSFER && tx.toAccountId === accountId)) {
        monthlyIncome += tx.amount;
      } else if (tx.type === TransactionType.EXPENSE || 
                (tx.type === TransactionType.TRANSFER && tx.accountId === accountId)) {
        monthlyExpense += tx.amount;
      }
    }
    
    // Calculer le solde final du mois
    let finalBalance = previousMonthBalance + monthlyIncome - monthlyExpense;
    let isAdjusted = false;
    
    // Vérifier s'il y a un ajustement manuel pour ce mois
    if (includeAdjustments && accountId !== "all") {
      try {
        // Vérifier d'abord si l'object store existe
        const storeExists = await objectStoreExists('balanceAdjustments');
        
        if (storeExists) {
          const adjustment = await db.balanceAdjustments.getByAccountAndMonth(
            accountId as number, 
            yearMonth
          );
          
          if (adjustment) {
            finalBalance = adjustment.adjustedBalance;
            isAdjusted = true;
          }
        } else {
          console.warn(`L'object store balanceAdjustments n'existe pas dans calculateMonthlyBalances`);
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération de l'ajustement pour ${yearMonth}:`, error);
      }
    }
    
    // Ajouter les données du mois au résultat
    result.push({
      yearMonth,
      month: new Date(currentDate),
      initialBalance: previousMonthBalance,
      incomes: monthlyIncome,
      expenses: monthlyExpense,
      finalBalance,
      isAdjusted
    });
    
    // Mettre à jour pour le mois suivant
    previousMonthBalance = finalBalance;
    currentDate = addMonths(currentDate, 1);
  }
  
  return result;
}
