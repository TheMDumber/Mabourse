import { useState, useEffect } from 'react';
import { useAccountFilter } from '@/contexts/AccountFilterContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { TransactionsList } from '@/components/transactions/TransactionsList';
import { RecurringTransactionsList } from '@/components/transactions/RecurringTransactionsList';
import { CategoryStats } from '@/components/transactions/CategoryStats';
import { TransactionType } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import db from '@/lib/db';

const Transactions = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>(TransactionType.EXPENSE);
  const { selectedAccount, setSelectedAccount } = useAccountFilter();
  const [currentMonth, setCurrentMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [onMonthChangeCallback, setOnMonthChangeCallback] = useState<((month: string) => void) | null>(null);
  const queryClient = useQueryClient();
  
  // Fonction pour rafraîchir les données après une modification
  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['recurringTransactions'] });
    // Rafraîchir également le solde prévisionnel
    queryClient.invalidateQueries({ queryKey: ['forecastBalance'] });
  };

  // Initialiser la fonction de changement de mois
  useEffect(() => {
    const handleMonthChange = (month: string) => {
      console.log('Mois changé:', month);
      setCurrentMonth(month);
      
      // Rafraîchir le solde prévisionnel lorsque le mois change
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['forecastBalance'] });
      }, 100);
    };
    
    setOnMonthChangeCallback(() => handleMonthChange);
  }, [queryClient]);
  
  // Effect pour mettre à jour le titre de la page avec le compte sélectionné
  useEffect(() => {
    const updatePageTitle = async () => {
      if (selectedAccount !== "all") {
        try {
          const account = await db.accounts.getById(selectedAccount as number);
          if (account) {
            document.title = `Transactions - ${account.name} | Budget App`;
          }
        } catch (error) {
          console.error("Erreur lors de la récupération du compte:", error);
        }
      } else {
        document.title = "Transactions | Budget App";
      }
    };
    
    updatePageTitle();
  }, [selectedAccount]);

  const handleAddTransaction = () => {
    setTransactionType(TransactionType.EXPENSE);
    setIsFormOpen(true);
  };

  const handleAddIncome = () => {
    setTransactionType(TransactionType.INCOME);
    setIsFormOpen(true);
  };

  const handleAddExpense = () => {
    setTransactionType(TransactionType.EXPENSE);
    setIsFormOpen(true);
  };

  const handleAddTransfer = () => {
    setTransactionType(TransactionType.TRANSFER);
    setIsFormOpen(true);
  };

  return (
    <MainLayout accountFilter={selectedAccount} selectedMonth={currentMonth}>
      <div className="space-y-6">
        <TransactionsList 
          onAddTransaction={handleAddTransaction}
          onAddIncome={handleAddIncome}
          onAddExpense={handleAddExpense}
          onAddTransfer={handleAddTransfer}
          onAccountFilterChange={setSelectedAccount}
          onTransactionUpdated={refreshData}
          onMonthChange={onMonthChangeCallback}
        />
        
        <RecurringTransactionsList accountId={selectedAccount !== "all" ? selectedAccount as number : undefined} />
        
        <CategoryStats accountFilter={selectedAccount} />
      </div>

      <TransactionForm
        open={isFormOpen}
        defaultType={transactionType}
        onClose={() => setIsFormOpen(false)}
        onSuccess={refreshData}
      />
    </MainLayout>
  );
};

export default Transactions;
