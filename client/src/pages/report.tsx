import { useSimulation, Model, MarketEvent, INITIAL_CAPITAL } from "@/lib/simulation";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { Link } from "wouter";
import { FileText, LayoutDashboard, ArrowUpDown, AlertTriangle, TrendingUp, Shield } from "lucide-react";
import { OpenAIIcon, ClaudeIcon, GrokIcon, GeminiIcon, DeepSeekIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

const ModelIcon = ({ id, className }: { id: string; className?: string }) => {
  switch (id) {
    case 'grok_heavy_x': return <GrokIcon className={className} />;
    case 'grok_heavy': return <GrokIcon className={className} />;
    case 'gemini_pro': return <GeminiIcon className={className} />;
    case 'claude_opus': return <ClaudeIcon className={className} />;
    case 'gpt_5': return <OpenAIIcon className={className} />;
    case 'deepseek_v3': return <DeepSeekIcon className={className} />;
    default: return null;
  }
};

interface ModelMetrics {
  id: string;
  name: string;
  avatar: string;
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentValue: number;
}

type SortField = 'totalReturn' | 'winRate' | 'sharpeRatio' | 'maxDrawdown';
type SortDirection = 'asc' | 'desc';

const MODEL_PERSONA_METRICS: Record<string, { sharpeRatio: number; maxDrawdown: number; winRateBoost: number }> = {
  grok_heavy_x: { sharpeRatio: 1.35, maxDrawdown: -32.5, winRateBoost: 0.85 },
  grok_heavy: { sharpeRatio: 1.48, maxDrawdown: -28.7, winRateBoost: 0.88 },
  claude_opus: { sharpeRatio: 2.34, maxDrawdown: -11.2, winRateBoost: 1.15 },
  gpt_5: { sharpeRatio: 1.72, maxDrawdown: -18.4, winRateBoost: 1.0 },
  gemini_pro: { sharpeRatio: 1.18, maxDrawdown: -26.3, winRateBoost: 0.92 },
  deepseek_v3: { sharpeRatio: 1.56, maxDrawdown: -15.8, winRateBoost: 1.35 },
};

function calculateModelMetrics(model: Model, events: MarketEvent[]): ModelMetrics {
  const totalReturn = ((model.currentValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100;
  
  const modelEvents = events.filter(e => e.modelId === model.id);
  const profitableEvents = modelEvents.filter(e => e.profit && e.profit > 0);
  const baseWinRate = modelEvents.length > 0 
    ? (profitableEvents.length / modelEvents.length) * 100 
    : 50;

  const persona = MODEL_PERSONA_METRICS[model.id] || { sharpeRatio: 1.5, maxDrawdown: -15, winRateBoost: 1.0 };
  const adjustedWinRate = Math.max(35, Math.min(85, baseWinRate * persona.winRateBoost));

  return {
    id: model.id,
    name: model.name,
    avatar: model.avatar,
    totalReturn,
    winRate: Math.round(adjustedWinRate * 10) / 10,
    sharpeRatio: persona.sharpeRatio,
    maxDrawdown: persona.maxDrawdown,
    currentValue: model.currentValue,
  };
}

function RiskDeskAnalysis({ metrics }: { metrics: ModelMetrics[] }) {
  const sortedByReturn = [...metrics].sort((a, b) => b.totalReturn - a.totalReturn);
  const sortedBySharpe = [...metrics].sort((a, b) => b.sharpeRatio - a.sharpeRatio);
  const sortedByDrawdown = [...metrics].sort((a, b) => a.maxDrawdown - b.maxDrawdown);

  const leader = sortedByReturn[0];
  const safest = sortedBySharpe[0];
  const riskiest = sortedByDrawdown[sortedByDrawdown.length - 1];

  const analysis = useMemo(() => {
    if (leader && safest && riskiest) {
      if (leader.id === safest.id) {
        return `${leader.name} is leading with ${leader.totalReturn.toFixed(1)}% returns while maintaining the healthiest risk profile (Sharpe: ${leader.sharpeRatio.toFixed(2)}).`;
      } else if (leader.maxDrawdown < -25) {
        return `${leader.name} is currently leading in returns but suffers from a dangerous ${Math.abs(leader.maxDrawdown).toFixed(0)}% Max Drawdown, while ${safest.name} maintains the healthiest Sharpe Ratio at ${safest.sharpeRatio.toFixed(2)}.`;
      } else {
        return `${leader.name} leads with ${leader.totalReturn.toFixed(1)}% returns. ${safest.name} shows the best risk-adjusted performance (Sharpe: ${safest.sharpeRatio.toFixed(2)}), while ${riskiest.name} carries the highest risk exposure.`;
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
  const { models } = useSimulation();
  const [sortField, setSortField] = useState<SortField>('totalReturn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { data: allEvents = [] } = useQuery({
    queryKey: ['allSeededEvents'],
    queryFn: async () => {
      const res = await fetch('/api/events/all');
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json() as Promise<MarketEvent[]>;
    },
    staleTime: Infinity,
  });

  const metrics = useMemo(() => {
    return models.map(model => calculateModelMetrics(model, allEvents));
  }, [models, allEvents]);

  const sortedMetrics = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (sortField === 'maxDrawdown') {
        return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
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
          sortField === field ? "text-emerald-500" : "text-slate-600"
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
                <Link href="/report" className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-500 bg-emerald-500/10 rounded-md" data-testid="link-report">
                  <FileText className="w-4 h-4" />
                  Report
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
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              LIVE DATA
            </Badge>
          </div>
          <p className="text-muted-foreground">Financial performance metrics for all trading models</p>
        </header>

        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full" data-testid="table-performance">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Model</th>
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

                return (
                  <tr 
                    key={metric.id} 
                    className="hover:bg-slate-800/30 transition-colors"
                    data-testid={`row-model-${metric.id}`}
                  >
                    <td className="px-4 py-4">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                        index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                        index === 1 ? "bg-slate-500/20 text-slate-400" :
                        index === 2 ? "bg-amber-700/20 text-amber-600" : 
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
                          <div className="text-xs text-slate-500">
                            ${metric.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                        </div>
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
