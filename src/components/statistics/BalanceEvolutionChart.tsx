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
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { PeriodOption } from './PeriodSelector';
import { ChartType } from './ChartTypeSelector';
import db from '@/lib/db';
import { calculateMonthlyBalances } from '@/lib/calculateBalance';

interface BalanceEvolutionChartProps {
  period: PeriodOption;
  chartType: ChartType;
  accountFilter: number | "all";
}

export function BalanceEvolutionChart({ period, chartType, accountFilter }: BalanceEvolutionChartProps) {
  // Convertir la période en nombre de mois
  const monthsToDisplay = period === "1month" ? 1 : parseInt(period.replace('months', ''));
  
  // Calculer les dates de début et de fin
  const endDate = endOfMonth(new Date());
  const startDate = startOfMonth(subMonths(endDate, monthsToDisplay - 1));
  
  // Récupérer les comptes pour les noms et affichage
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      return db.accounts.getAll();
    },
  });
  
  // Récupérer les soldes mensuels calculés avec les ajustements
  const { data: monthlyBalances = [] } = useQuery({
    queryKey: ['historicalBalances', accountFilter, monthsToDisplay, startDate.toISOString()],
    queryFn: async () => {
      return calculateMonthlyBalances({
        accountId: accountFilter,
        startDate,
        endDate,
        includeAdjustments: true
      });
    },
  });
  
  // Générer les données pour le graphique
  const chartData = useMemo(() => {
    return monthlyBalances.map(balance => {
      // Assurer des valeurs positives pour les revenus et dépenses pour éviter les erreurs SVG
      return {
        month: balance.yearMonth,
        name: format(balance.month, 'MMM yyyy', { locale: fr }),
        revenus: Math.max(0, Number(balance.incomes.toFixed(2))),
        depenses: Math.max(0, Number(balance.expenses.toFixed(2))),
        solde: Number(balance.finalBalance.toFixed(2)),
        isAdjusted: balance.isAdjusted
      };
    });
  }, [monthlyBalances]);
  
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
      const dataPoint = chartData.find(d => d.name === label);
      const isAdjusted = dataPoint?.isAdjusted;
      
      return (
        <div className="bg-background border border-border p-3 rounded shadow-md">
          <p className="font-bold text-lg mb-2">{label}</p>
          {payload.map((entry, index) => {
            const isSolde = entry.name === "Solde";
            return (
              <p 
                key={`item-${index}`} 
                style={{ color: entry.color }}
                className={`${isSolde ? 'text-base font-semibold my-1' : 'text-sm'}`}
              >
                {entry.name}: {formatNumber(entry.value as number)}
                {isSolde && isAdjusted && (
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
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="solde" 
              name="Solde" 
              stroke="#8884d8" 
              activeDot={{ r: 8 }}
              dot={(props) => {
                // Ajouter un marqueur différent pour les soldes ajustés
                const isAdjusted = chartData[props.index]?.isAdjusted;
                if (isAdjusted) {
                  return (
                    <svg 
                      x={props.cx - 6} 
                      y={props.cy - 6} 
                      width={12} 
                      height={12} 
                      fill="#8884d8"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" stroke="#8884d8" strokeWidth="2" fill="white" />
                      <path d="M8 12l3 3 5-7" stroke="#8884d8" strokeWidth="2" fill="none" />
                    </svg>
                  );
                }
                return <circle cx={props.cx} cy={props.cy} r={4} fill="#8884d8" />;
              }}
            />
            <Line type="monotone" dataKey="revenus" name="Revenus" stroke="#82ca9d" />
            <Line type="monotone" dataKey="depenses" name="Dépenses" stroke="#ff7300" />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="revenus" name="Revenus" fill="#82ca9d" />
            <Bar dataKey="depenses" name="Dépenses" fill="#ff7300" />
            <Bar 
              dataKey="solde" 
              name="Solde" 
              fill="#8884d8"
              shape={(props) => {
                // Solution pour les hauteurs négatives
                const isAdjusted = chartData[props.index]?.isAdjusted;

                // Pour éviter l'erreur de hauteur négative
                let height = Math.abs(props.height || 0);
                let y = props.y;

                // Si la valeur est trop petite, utiliser une hauteur minimum
                if (height < 0.1) height = 0.1;

                // Ajuster la position Y selon que la valeur est positive ou négative
                if (props.height < 0) {
                  y = props.y - height;
                }
                
                return (
                  <rect
                    {...props}
                    y={y}
                    height={height}
                    stroke={isAdjusted ? "#fff" : "none"}
                    strokeWidth={isAdjusted ? 2 : 0}
                    strokeDasharray={isAdjusted ? "5,2" : "0"}
                    fill={props.fill}
                  />
                );
              }}
            />
          </BarChart>
        );
      case 'bar3d':
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="revenus" name="Revenus" fill="#82ca9d" stackId="a" />
            <Bar dataKey="depenses" name="Dépenses" fill="#ff7300" stackId="a" />
            <Bar 
              dataKey="solde" 
              name="Solde" 
              fill="#8884d8"
              shape={(props) => {
                // Solution pour les hauteurs négatives
                const isAdjusted = chartData[props.index]?.isAdjusted;
                
                // Pour éviter l'erreur de hauteur négative
                let height = Math.abs(props.height || 0);
                let y = props.y;

                // Si la valeur est trop petite, utiliser une hauteur minimum
                if (height < 0.1) height = 0.1;

                // Ajuster la position Y selon que la valeur est positive ou négative
                if (props.height < 0) {
                  y = props.y - height;
                }
                
                return (
                  <rect
                    {...props}
                    y={y}
                    height={height}
                    stroke={isAdjusted ? "#fff" : "none"}
                    strokeWidth={isAdjusted ? 2 : 0}
                    strokeDasharray={isAdjusted ? "5,2" : "0"}
                    fill={props.fill}
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
  const adjustedMonthsCount = chartData.filter(d => d.isAdjusted).length;
  
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
          Historique de l'évolution de votre solde sur {monthsToDisplay} mois.
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
