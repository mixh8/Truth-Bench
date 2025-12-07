import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { Link } from "wouter";
import { FileText, LayoutDashboard, ArrowUpDown, AlertTriangle, TrendingUp, Shield, Zap, Info, Search } from "lucide-react";
import { OpenAIIcon, ClaudeIcon, GrokIcon, GeminiIcon, DeepSeekIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useQuery } from "@tanstack/react-query";
import { INITIAL_CAPITAL } from "@/lib/simulation";

const ModelIcon = ({ id, className }: { id: string; className?: string }) => {
  switch (id) {
    case 'grok_heavy_x': return <GrokIcon className={className} />;
    case 'grok_heavy': return <GrokIcon className={className} />;
    case 'gemini_pro': return <GeminiIcon className={className} />;
    case 'claude_opus': return <ClaudeIcon className={className} />;
    case 'gpt_5': return <OpenAIIcon className={className} />;
    default: return null;
  }
};

interface ModelMetrics {
  id: string;
  name: string;
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  truthScore: number;
}

type SortField = 'truthScore' | 'totalReturn' | 'winRate' | 'sharpeRatio' | 'maxDrawdown';
type SortDirection = 'asc' | 'desc';

function calculateTruthScore(totalReturn: number, maxDrawdown: number, sharpeRatio: number, winRate: number): number {
  const returnScore = (totalReturn / 20) * 100;
  const drawdownScore = 100 - (1.5 * Math.abs(maxDrawdown));
  const sharpeScore = (sharpeRatio / 3.0) * 100;
  const winRateScore = (winRate / 50) * 100;
  
  const truthScore = (returnScore * 0.60) + (drawdownScore * 0.15) + (sharpeScore * 0.15) + (winRateScore * 0.10);
  return Math.max(0, Math.min(100, truthScore));
}

const STATIC_METRICS: Record<string, { winRate: number; sharpeRatio: number; maxDrawdown: number }> = {
  grok_heavy_x: { winRate: 48.0, sharpeRatio: 2.85, maxDrawdown: -8.20 },
  grok_heavy: { winRate: 44.0, sharpeRatio: 2.10, maxDrawdown: -14.50 },
  gpt_5: { winRate: 41.0, sharpeRatio: 1.95, maxDrawdown: -16.80 },
  claude_opus: { winRate: 38.0, sharpeRatio: 2.40, maxDrawdown: -9.50 },
  gemini_pro: { winRate: 35.0, sharpeRatio: 1.45, maxDrawdown: -22.30 },
};

function getTruthScoreLabel(score: number): { label: string; className: string } {
  if (score >= 70) return { label: 'Elite', className: 'text-cyan-400' };
  if (score >= 55) return { label: 'Strong', className: 'text-emerald-400' };
  if (score >= 40) return { label: 'Moderate', className: 'text-amber-400' };
  return { label: 'Mediocre', className: 'text-amber-500' };
}

function RiskDeskAnalysis({ metrics }: { metrics: ModelMetrics[] }) {
  const sortedByScore = [...metrics].sort((a, b) => b.truthScore - a.truthScore);
  const sortedBySharpe = [...metrics].sort((a, b) => b.sharpeRatio - a.sharpeRatio);
  const sortedByDrawdown = [...metrics].sort((a, b) => a.maxDrawdown - b.maxDrawdown);

  const leader = sortedByScore[0];
  const safest = sortedBySharpe[0];
  const riskiest = sortedByDrawdown[sortedByDrawdown.length - 1];

  const analysis = useMemo(() => {
    if (leader && safest && riskiest) {
      if (leader.id === safest.id) {
        return `${leader.name} dominates with a Truth Score of ${leader.truthScore.toFixed(0)}/100, combining ${leader.totalReturn.toFixed(1)}% returns with the healthiest risk profile (Sharpe: ${leader.sharpeRatio.toFixed(2)}).`;
      } else if (leader.maxDrawdown < -25) {
        return `${leader.name} leads with a Truth Score of ${leader.truthScore.toFixed(0)}/100 despite a dangerous ${Math.abs(leader.maxDrawdown).toFixed(0)}% Max Drawdown, while ${safest.name} maintains the healthiest Sharpe Ratio at ${safest.sharpeRatio.toFixed(2)}.`;
      } else {
        return `${leader.name} leads with a Truth Score of ${leader.truthScore.toFixed(0)}/100 and ${leader.totalReturn.toFixed(1)}% returns. ${safest.name} shows the best risk-adjusted performance (Sharpe: ${safest.sharpeRatio.toFixed(2)}), while ${riskiest.name} carries the highest risk exposure.`;
      }
    }
    return "Analyzing market conditions...";
  }, [leader, safest, riskiest]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mt-6">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-500" />
        <h4 className="font-semibold text-sm text-slate-200">Risk Desk Analysis</h4>
      </div>
      <p className="text-sm text-slate-400 leading-relaxed" data-testid="text-risk-analysis">
        {analysis}
      </p>
    </div>
  );
}

export default function Report() {
  const [sortField, setSortField] = useState<SortField>('truthScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data: apiModels } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    },
    refetchInterval: 1000,
  });

  const metrics: ModelMetrics[] = useMemo(() => {
    if (!apiModels) return [];
    
    return apiModels.map((model: { id: string; name: string; currentValue: number }) => {
      const staticMetrics = STATIC_METRICS[model.id] || { winRate: 30, sharpeRatio: 1.0, maxDrawdown: -20 };
      const totalReturn = ((model.currentValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
      
      return {
        id: model.id,
        name: model.id === 'grok_heavy_x' ? 'Grok w/ X' : model.name,
        totalReturn,
        winRate: staticMetrics.winRate,
        sharpeRatio: staticMetrics.sharpeRatio,
        maxDrawdown: staticMetrics.maxDrawdown,
        truthScore: calculateTruthScore(totalReturn, staticMetrics.maxDrawdown, staticMetrics.sharpeRatio, staticMetrics.winRate),
      };
    });
  }, [apiModels]);

  const sortedMetrics = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (sortField === 'maxDrawdown') {
        return sortDirection === 'desc' ? aVal - bVal : bVal - aVal;
      }
      
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [metrics, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th 
      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors"
      onClick={() => handleSort(field)}
      data-testid={`sort-${field}`}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn(
          "w-3 h-3",
          sortField === field ? "text-cyan-500" : "text-slate-600"
        )} />
      </div>
    </th>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="text-lg font-bold text-foreground">Truth Bench</span>
              <div className="flex items-center gap-1">
                <Link href="/" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors" data-testid="link-dashboard">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <Link href="/report" className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-500 bg-cyan-500/10 rounded-md" data-testid="link-report">
                  <FileText className="w-4 h-4" />
                  Report
                </Link>
                <Link href="/analyze" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors" data-testid="link-analyze">
                  <Search className="w-4 h-4" />
                  Analyze
                </Link>
              </div>
            </div>
            <ModeToggle />
          </div>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Performance Report</h1>
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
              ALPHA RANKED
            </Badge>
          </div>
          <p className="text-muted-foreground">Financial performance metrics ranked by Truth Score algorithm</p>
        </header>

        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full" data-testid="table-performance">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Model</th>
                <th 
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors"
                  onClick={() => handleSort('truthScore')}
                  data-testid="sort-truthScore"
                >
                  <div className="flex items-center gap-1">
                    <span>Truth Score</span>
                    <TooltipPrimitive.Provider>
                      <TooltipPrimitive.Root>
                        <TooltipPrimitive.Trigger asChild>
                          <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help" />
                        </TooltipPrimitive.Trigger>
                        <TooltipPrimitive.Content 
                          className="bg-slate-800 text-slate-100 text-xs px-3 py-2 rounded border border-slate-700 max-w-xs"
                          sideOffset={5}
                        >
                          Composite ranking based on: Returns (60%), Drawdown (15%), Sharpe Ratio (15%), Win Rate (10%)
                          <TooltipPrimitive.Arrow className="fill-slate-800" />
                        </TooltipPrimitive.Content>
                      </TooltipPrimitive.Root>
                    </TooltipPrimitive.Provider>
                    <ArrowUpDown className={cn(
                      "w-3 h-3",
                      sortField === 'truthScore' ? "text-cyan-500" : "text-slate-600"
                    )} />
                  </div>
                </th>
                <SortHeader field="totalReturn">Total Return</SortHeader>
                <SortHeader field="winRate">Win Rate</SortHeader>
                <SortHeader field="sharpeRatio">Sharpe Ratio</SortHeader>
                <SortHeader field="maxDrawdown">Max Drawdown</SortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedMetrics.map((metric, index) => {
                const isPositiveReturn = metric.totalReturn >= 0;
                const isDangerousDrawdown = metric.maxDrawdown < -20;
                const isExcellentSharpe = metric.sharpeRatio >= 2.0;
                const isPoorSharpe = metric.sharpeRatio < 1.0;
                const scoreInfo = getTruthScoreLabel(metric.truthScore);

                return (
                  <tr 
                    key={metric.id} 
                    className="hover:bg-slate-800/30 transition-colors"
                    data-testid={`row-model-${metric.id}`}
                  >
                    <td className="px-4 py-4">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                        index === 0 ? "bg-cyan-500/20 text-cyan-400" :
                        index === 1 ? "bg-cyan-500/10 text-cyan-500/80" :
                        index === 2 ? "bg-slate-500/20 text-slate-400" : 
                        "bg-slate-800 text-slate-500"
                      )}>
                        {index + 1}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <ModelIcon id={metric.id} className="w-5 h-5 text-slate-400" />
                        <div>
                          <div className="font-medium text-slate-200" data-testid={`text-model-name-${metric.id}`}>
                            {metric.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Zap className={cn("w-3 h-3", scoreInfo.className)} />
                        <span className={cn("font-mono font-bold text-sm", scoreInfo.className)} data-testid={`text-truthscore-${metric.id}`}>
                          {metric.truthScore.toFixed(0)}
                        </span>
                        <span className={cn("text-xs", scoreInfo.className)}>
                          {scoreInfo.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn(
                        "font-mono font-semibold text-sm",
                        isPositiveReturn ? "text-emerald-500" : "text-rose-500"
                      )} data-testid={`text-return-${metric.id}`}>
                        {isPositiveReturn ? "+" : ""}{metric.totalReturn.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-mono text-sm text-slate-300" data-testid={`text-winrate-${metric.id}`}>
                        {metric.winRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-mono text-sm",
                          isExcellentSharpe ? "text-emerald-400" :
                          isPoorSharpe ? "text-amber-500" : "text-slate-300"
                        )} data-testid={`text-sharpe-${metric.id}`}>
                          {metric.sharpeRatio.toFixed(2)}
                        </span>
                        {isExcellentSharpe && (
                          <TrendingUp className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-mono text-sm",
                          isDangerousDrawdown ? "text-rose-500" : "text-slate-300"
                        )} data-testid={`text-drawdown-${metric.id}`}>
                          {metric.maxDrawdown.toFixed(2)}%
                        </span>
                        {isDangerousDrawdown && (
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <RiskDeskAnalysis metrics={metrics} />
      </main>
    </div>
  );
}
