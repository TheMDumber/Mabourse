import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';

type AccountFilterContextType = {
  selectedAccount: number | "all";
  setSelectedAccount: (accountId: number | "all") => void;
};

const AccountFilterContext = createContext<AccountFilterContextType | undefined>(undefined);

export function AccountFilterProvider({ children }: { children: ReactNode }) {
  const [selectedAccount, setSelectedAccount] = useState<number | "all">("all");

  const handleSetSelectedAccount = useCallback((accountId: number | "all") => {
    setSelectedAccount(accountId);
  }, []);

  return (
    <AccountFilterContext.Provider
      value={{
        selectedAccount,
        setSelectedAccount: handleSetSelectedAccount,
      }}
    >
      {children}
    </AccountFilterContext.Provider>
  );
}

export function useAccountFilter() {
  const context = useContext(AccountFilterContext);
  if (context === undefined) {
    throw new Error('useAccountFilter must be used within an AccountFilterProvider');
  }
  return context;
}
