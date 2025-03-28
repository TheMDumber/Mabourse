import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  TooltipProps,
} from 'recharts';
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { PeriodOption } from './PeriodSelector';
import { ChartType } from './ChartTypeSelector';
import db from '@/lib/db';
import { TransactionType, RecurringTransaction } from '@/lib/types';

interface MaBourseForecastChartProps {
  period: PeriodOption;
  chartType: ChartType;
  accountFilter: number | "all";
}

export function MaBourseForecastChart({ period, chartType, accountFilter }: MaBourseForecastChartProps) {
  // Convertir la période en nombre de mois
  const monthsToDisplay = period === "1month" ? 1 : parseInt(period.replace('months', ''));
  
  // Calculer les dates de début et de fin pour les prévisions
  const startDate = startOfMonth(new Date());
  const endDate = endOfMonth(addMonths(startDate, monthsToDisplay - 1));
  
  // Récupérer les comptes pour avoir les soldes initiaux
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      return db.accounts.getAll();
    },
  });
  
  // Récupérer les transactions récurrentes
  const { data: recurringTransactions = [] } = useQuery({
    queryKey: ['recurringTransactions'],
    queryFn: async () => {
      return db.recurringTransactions.getAll();
    },
  });
  
  // Récupérer les transactions existantes pour la période future (déjà planifiées)
  const { data: futureTransactions = [] } = useQuery({
    queryKey: ['futureTransactions', startDate, endDate],
    queryFn: async () => {
      return db.transactions.getByDateRange(startDate, endDate);
    },
  });
  
  // Récupérer les ajustements de solde pour indiquer quels mois ont été ajustés
  const { data: accountAdjustments = [] } = useQuery({
    queryKey: ['allAccountsAdjustments'],
    queryFn: async () => {
      if (accountFilter !== "all") return [];
      // Récupérer les ajustements pour tous les comptes
      const allAdjustments = [];
      for (const account of accounts) {
        if (account.id) {
          const adjustments = await db.balanceAdjustments.getAllByAccount(account.id);
          allAdjustments.push(...adjustments);
        }
      }
      return allAdjustments;
    },
    enabled: accountFilter === "all" && accounts.length > 0,
  });
  
  // Récupérer les ajustements de solde pour le compte sélectionné
  const { data: balanceAdjustments = [] } = useQuery({
    queryKey: ['balanceAdjustments', accountFilter],
    queryFn: async () => {
      if (accountFilter === "all") return [];
      return db.balanceAdjustments.getAllByAccount(accountFilter as number);
    },
    enabled: accountFilter !== "all",
  });
  
  // Générer les données prévisionnelles pour le graphique
  const forecastData = useMemo(() => {
    // Si un filtre de compte est actif, prendre uniquement le solde initial de ce compte
    // Sinon, prendre le solde initial de tous les comptes
    const initialBalance = accountFilter === "all" 
      ? accounts.reduce((sum, account) => sum + account.initialBalance, 0)
      : (accounts.find(acc => acc.id === accountFilter)?.initialBalance || 0);
    
    // Générer les dates des mois à prévoir
    const months = Array.from({ length: monthsToDisplay }, (_, i) => {
      const date = addMonths(startDate, i);
      return {
        month: format(date, 'yyyy-MM'),
        monthName: format(date, 'MMM yyyy', { locale: fr }),
        startOfMonth: startOfMonth(date),
        endOfMonth: endOfMonth(date),
      };
    });
    
    // Filtrer les transactions récurrentes par compte si nécessaire
    const filteredRecurringTransactions = accountFilter === "all" 
      ? recurringTransactions 
      : recurringTransactions.filter(rt => 
          rt.accountId === accountFilter || 
          (rt.type === TransactionType.TRANSFER && rt.toAccountId === accountFilter)
        );
    
    // Mapper les transactions récurrentes aux mois futurs
    const futureRecurringTransactions = months.flatMap(({ month, startOfMonth, endOfMonth }) => {
      return filteredRecurringTransactions.flatMap((rt: RecurringTransaction) => {
        // Vérifier si la transaction récurrente est active pendant cette période
        if (rt.endDate && new Date(rt.endDate) < startOfMonth) {
          return []; // Transaction récurrente terminée avant ce mois
        }
        
        if (new Date(rt.startDate) > endOfMonth) {
          return []; // Transaction récurrente commence après ce mois
        }
        
        // Créer une transaction prévisionnelle basée sur la récurrence
        return [{
          id: `forecast-${rt.id}-${month}`,
          accountId: rt.accountId,
          toAccountId: rt.toAccountId,
          amount: rt.amount,
          type: rt.type,
          category: rt.category,
          description: rt.description,
          date: new Date(startOfMonth.getTime() + Math.random() * (endOfMonth.getTime() - startOfMonth.getTime())),
          isRecurring: true,
          recurringId: rt.id,
        }];
      });
    });
    
    // Combiner les transactions futures existantes avec les prévisionnelles
    const allFutureTransactions = [...futureTransactions, ...futureRecurringTransactions];
    
    // Calculer les prévisions mois par mois
    let cumulativeBalance = initialBalance;
    
    return months.map(({ month, monthName, startOfMonth, endOfMonth }) => {
      // Filtrer les transactions du mois
      let monthTransactions = allFutureTransactions.filter(
        (t) => new Date(t.date) >= startOfMonth && new Date(t.date) <= endOfMonth
      );
      
      // Filtrer par compte si nécessaire
      if (accountFilter !== "all") {
        monthTransactions = monthTransactions.filter(t => 
          t.accountId === accountFilter || 
          (t.type === TransactionType.TRANSFER && t.toAccountId === accountFilter)
        );
      }
      
      // Calculer les revenus, dépenses et transferts du mois
      const incomes = monthTransactions
        .filter((t) => t.type === TransactionType.INCOME || 
                   (t.type === TransactionType.TRANSFER && t.toAccountId === accountFilter))
        .reduce((sum, t) => sum + t.amount, 0);
      
      const expenses = monthTransactions
        .filter((t) => t.type === TransactionType.EXPENSE || 
                   (t.type === TransactionType.TRANSFER && t.accountId === accountFilter))
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Calculer la différence directement
      const difference = incomes - expenses;
      
      // Mettre à jour le solde initial et final
      const initialMonthBalance = cumulativeBalance;
      
      // Vérifier s'il y a un ajustement pour ce mois
      const adjustment = balanceAdjustments.find(adj => adj.yearMonth === month);
      let finalBalance = initialMonthBalance + difference;
      let isAdjusted = !!adjustment;
      
      if (isAdjusted && accountFilter !== "all") {
        // Un seul compte avec ajustement
        finalBalance = adjustment.adjustedBalance;
      } else if (accountFilter === "all") {
        // Vérifier si des comptes individuels ont des ajustements pour ce mois
        const monthAdjustments = accountAdjustments.filter(adj => adj.yearMonth === month);
        isAdjusted = monthAdjustments.length > 0;
        
        if (isAdjusted) {
          // Réinitialiser le solde final
          finalBalance = 0;
          
          // Pour chaque compte, ajouter son solde final (ajusté ou calculé)
          for (const account of accounts) {
            if (!account.id) continue;
            
            // Trouver l'ajustement pour ce compte, s'il existe
            const accAdjustment = monthAdjustments.find(adj => adj.accountId === account.id);
            
            if (accAdjustment) {
              // Utiliser directement le solde ajusté
              finalBalance += accAdjustment.adjustedBalance;
            } else {
              // Calculer le solde prévisionnel pour ce compte
              // Trouver les transactions pour ce compte et ce mois
              const accountTransactions = allFutureTransactions.filter(
                t => (new Date(t.date) >= startOfMonth && new Date(t.date) <= endOfMonth) && 
                    (t.accountId === account.id || 
                    (t.type === TransactionType.TRANSFER && t.toAccountId === account.id))
              );
              
              // Calculer revenus et dépenses pour ce compte
              const accIncomes = accountTransactions
                .filter((t) => t.type === TransactionType.INCOME || 
                           (t.type === TransactionType.TRANSFER && t.toAccountId === account.id))
                .reduce((sum, t) => sum + t.amount, 0);
              
              const accExpenses = accountTransactions
                .filter((t) => t.type === TransactionType.EXPENSE || 
                           (t.type === TransactionType.TRANSFER && t.accountId === account.id))
                .reduce((sum, t) => sum + t.amount, 0);
              
              // Calculer le solde final pour ce compte
              const accBalance = account.initialBalance + accIncomes - accExpenses;
              finalBalance += accBalance;
            }
          }
        }
      }
      
      // Mettre à jour le solde cumulatif pour le mois suivant
      cumulativeBalance = finalBalance;
      
      // Arrondir tous les montants à 2 chiffres après la virgule
      return {
        month,
        name: monthName,
        soldeInitial: Number(initialMonthBalance.toFixed(2)),
        revenus: Number(incomes.toFixed(2)),
        depenses: Number(expenses.toFixed(2)),
        difference: Number(difference.toFixed(2)),
        soldeFinal: Number(finalBalance.toFixed(2)),
        isAdjusted
      };
    });
  }, [accounts, recurringTransactions, futureTransactions, monthsToDisplay, startDate, accountFilter, balanceAdjustments, accountAdjustments]);
  
  // Formateur de nombres pour l'infobulle
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };
  
  // Personnalisation de l'infobulle
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (active && payload && payload.length) {
      // Vérifier si ce mois a un solde ajusté manuellement
      const dataPoint = forecastData.find(d => d.name === label);
      const isAdjusted = dataPoint?.isAdjusted;
      
      return (
        <div className="bg-background border border-border p-3 rounded shadow-md">
          <p className="font-bold text-lg mb-2">{label}</p>
          {payload.map((entry, index) => {
            const isBalanceField = entry.name === "Solde Initial" || entry.name === "Solde Final";
            return (
              <p 
                key={`item-${index}`} 
                style={{ color: entry.color }}
                className={`${isBalanceField ? 'text-base font-semibold my-1' : 'text-sm'}`}
              >
                {entry.name}: {formatNumber(entry.value as number)}
                {isBalanceField && entry.name === "Solde Final" && isAdjusted && (
                  <span className="ml-2 text-xs bg-primary/10 text-primary px-1 py-0.5 rounded">
                    ajusté
                  </span>
                )}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };
  
  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="soldeInitial" name="Solde Initial" stroke="#8884d8" />
            <Line type="monotone" dataKey="revenus" name="Revenus" stroke="#82ca9d" />
            <Line type="monotone" dataKey="depenses" name="Dépenses" stroke="#ff7300" />
            <Line type="monotone" dataKey="difference" name="Différence" stroke="#ff00ff" />
            <Line 
              type="monotone" 
              dataKey="soldeFinal" 
              name="Solde Final" 
              stroke="#0088fe" 
              activeDot={{ r: 8 }}
              dot={(props) => {
                // Ajouter un marqueur différent pour les soldes ajustés
                const isAdjusted = forecastData[props.index]?.isAdjusted;
                if (isAdjusted) {
                  return (
                    <svg 
                      x={props.cx - 6} 
                      y={props.cy - 6} 
                      width={12} 
                      height={12} 
                      fill="#0088fe"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" stroke="#0088fe" strokeWidth="2" fill="white" />
                      <path d="M8 12l3 3 5-7" stroke="#0088fe" strokeWidth="2" fill="none" />
                    </svg>
                  );
                }
                return <circle cx={props.cx} cy={props.cy} r={4} fill="#0088fe" />;
              }}
            />
          </LineChart>
        );
      case 'bar':
      case 'bar3d':
        return (
          <BarChart data={forecastData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="soldeInitial" name="Solde Initial" fill="#8884d8" />
            <Bar dataKey="revenus" name="Revenus" fill="#82ca9d" />
            <Bar dataKey="depenses" name="Dépenses" fill="#ff7300" />
            <Bar dataKey="difference" name="Différence" fill="#ff00ff" />
            <Bar 
              dataKey="soldeFinal" 
              name="Solde Final" 
              fill="#0088fe"
              // Bars avec un pattern ou bordure différente pour les ajustements
              shape={(props) => {
                const { tooltipPayload, tooltipPosition, dataKey, isAdjusted: propIsAdjusted, soldeInitial, soldeFinal, ...rectProps } = props as any;
                const isAdjusted = forecastData[props.index]?.isAdjusted;
                
                // Pour éviter l'erreur de hauteur négative
                let height = Math.abs(rectProps.height || 0);
                let y = rectProps.y;
                
                // Si la valeur est trop petite, utiliser une hauteur minimum
                if (height < 0.1) height = 0.1;
                
                // Ajuster la position Y selon que la valeur est positive ou négative
                if (rectProps.height < 0) {
                  y = rectProps.y - height;
                }
                
                return (
                  <rect
                    {...rectProps}
                    y={y}
                    height={height}
                    stroke={isAdjusted ? "#fff" : "none"}
                    strokeWidth={isAdjusted ? 2 : 0}
                    strokeDasharray={isAdjusted ? "5,2" : "0"}
                    fill={rectProps.fill}
                  />
                );
              }}
            />
          </BarChart>
        );
      default:
        return null;
    }
  };
  
  // Compter le nombre de mois avec des ajustements
  const adjustedMonthsCount = forecastData.filter(d => d.isAdjusted).length;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <CardTitle>Évolution du solde</CardTitle>
          {accountFilter !== "all" && accounts.length > 0 && (
            <Badge variant="outline" className="ml-2 bg-primary/10 text-primary">
              {accounts.find(a => a.id === accountFilter)?.name || "Compte sélectionné"}
            </Badge>
          )}
          {adjustedMonthsCount > 0 && (
            <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 flex items-center">
              <Info className="h-3 w-3 mr-1" />
              {adjustedMonthsCount} {adjustedMonthsCount > 1 ? 'mois ajustés' : 'mois ajusté'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">
          Visualisez l'évolution de votre solde sur {monthsToDisplay} mois, en tenant compte de vos revenus, dépenses et transferts.
          {adjustedMonthsCount > 0 && (
            <span className="block mt-1 text-sm">
              Les soldes ajustés manuellement sont marqués différemment sur le graphique.
            </span>
          )}
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
