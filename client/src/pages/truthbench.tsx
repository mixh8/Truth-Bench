/**
 * TruthBench - LLM Prediction Market Benchmark Dashboard
 *
 * Real-time visualization of LLM performance on prediction markets.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import {
  Play,
  Square,
  LayoutDashboard,
  FileText,
  Search,
  Trophy,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Target,
  Zap,
  Brain,
  MessageSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Nav } from '@/components/nav';
import { useTruthbench, useSortedPortfolios } from '@/hooks/useTruthbench';
import type { Portfolio, TradingDecision, ModelScore } from '@/lib/truthbenchApi';

// Model colors for consistent visualization
const MODEL_COLORS: Record<string, string> = {
  'grok-4-1-fast-reasoning': 'from-blue-500 to-blue-600',
  'gpt-5.1': 'from-emerald-500 to-emerald-600',
  'anthropic/claude-opus-4-5-20251101': 'from-orange-500 to-orange-600',
  'gemini/gemini-3-pro-preview': 'from-purple-500 to-purple-600',
};

const MODEL_BG_COLORS: Record<string, string> = {
  'grok-4-1-fast-reasoning': 'bg-blue-500/10 border-blue-500/20 text-blue-500',
  'gpt-5.1': 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
  'anthropic/claude-opus-4-5-20251101': 'bg-orange-500/10 border-orange-500/20 text-orange-500',
  'gemini/gemini-3-pro-preview': 'bg-purple-500/10 border-purple-500/20 text-purple-500',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(value: number, showSign = true): string {
  // Handle NaN, undefined, or null
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: showSign ? 'exceptZero' : 'auto',
  }).format(value);
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function PortfolioCard({ portfolio, rank }: { portfolio: Portfolio; rank: number }) {
  const bgColor = MODEL_BG_COLORS[portfolio.model_id] || 'bg-slate-500/10 border-slate-500/20 text-slate-400';
  const isPositive = portfolio.roi >= 0;

  return (
    <Card className={`relative overflow-hidden border ${rank === 1 ? 'ring-2 ring-yellow-500/50' : ''}`}>
      {rank === 1 && (
        <div className="absolute top-2 right-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
        </div>
      )}
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${bgColor}`}>
            #{rank}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">{portfolio.model_name}</h3>
            <p className="text-xs text-muted-foreground truncate">{portfolio.model_id}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">ROI</p>
            <p className={`text-lg font-mono font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {formatPercent(portfolio.roi)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Bankroll</p>
            <p className="text-lg font-mono font-bold">{formatCurrency(portfolio.bankroll)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
            <p className="text-sm font-mono">{formatPercent(portfolio.win_rate, false)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Trades</p>
            <p className="text-sm font-mono">
              {portfolio.winning_trades}/{portfolio.total_trades}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionCard({ decision }: { decision: TradingDecision }) {
  const isYes = decision.action.includes('yes');
  const bgColor = MODEL_BG_COLORS[decision.model_id] || 'bg-slate-500/10';

  return (
    <div className="p-3 rounded-lg bg-card border border-border">
      <div className="flex items-start gap-2 mb-2">
        <Badge variant="outline" className={bgColor}>
          {decision.model_id.split('/').pop()?.split('-')[0] || 'LLM'}
        </Badge>
        <Badge variant={isYes ? 'default' : 'secondary'} className={isYes ? 'bg-emerald-500' : 'bg-red-500'}>
          {decision.action.replace('_', ' ').toUpperCase()}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {decision.quantity} @ {decision.confidence}% conf
        </span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{decision.reasoning}</p>
      <p className="text-xs text-muted-foreground/60 mt-1 font-mono">{decision.market_ticker}</p>
    </div>
  );
}

function ResultsLeaderboard({ scores }: { scores: ModelScore[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Final Rankings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {scores.map((score, idx) => {
            const bgColor = MODEL_BG_COLORS[score.model_id] || 'bg-slate-500/10';
            return (
              <div
                key={score.model_id}
                className={`p-4 rounded-lg border ${idx === 0 ? 'ring-2 ring-yellow-500/50 bg-yellow-500/5' : ''}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${bgColor}`}>
                    #{idx + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold">{score.model_name}</h3>
                    <p className="text-xs text-muted-foreground">{score.model_id}</p>
                  </div>
                  {idx === 0 && <Trophy className="w-6 h-6 text-yellow-500 ml-auto" />}
                </div>

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">ROI</p>
                    <p className={`font-mono font-bold ${score.roi >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatPercent(score.roi)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Brier Score</p>
                    <p className="font-mono">{score.brier_score.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Accuracy</p>
                    <p className="font-mono">{formatPercent(score.accuracy)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sharpe</p>
                    <p className="font-mono">{score.sharpe_ratio.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TruthBench() {
  const {
    status,
    isStatusLoading,
    results,
    startSimulation,
    isStarting,
    stopSimulation,
    isStopping,
    isConnected,
  } = useTruthbench();

  const [maxMarkets, setMaxMarkets] = useState(20);

  const sortedPortfolios = useSortedPortfolios(status?.portfolios);
  const isRunning = status?.status === 'running';
  const isCompleted = status?.status === 'completed' || status?.status === 'paused';
  const hasNoSimulation = status?.status === 'no_simulation';

  const progress =
    status?.total_markets && status.total_markets > 0
      ? (status.markets_completed / status.total_markets) * 100
      : 0;

  const handleStart = () => {
    startSimulation({
      max_markets: maxMarkets,
      decision_points: 3,
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Nav />

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1800px] mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">LLM Benchmark</h1>
              {isRunning && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-pulse">
                  RUNNING
                </Badge>
              )}
              {isCompleted && (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                  COMPLETED
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Evaluating LLM forecasting ability on historical Kalshi prediction markets
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasNoSimulation && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Markets:</label>
                <input
                  type="number"
                  value={maxMarkets}
                  onChange={(e) => setMaxMarkets(parseInt(e.target.value) || 20)}
                  className="w-20 px-2 py-1 rounded border border-border bg-background text-sm"
                  min={1}
                  max={1000}
                />
              </div>
            )}

            {hasNoSimulation || isCompleted ? (
              <Button onClick={handleStart} disabled={isStarting} className="gap-2">
                <Play className="w-4 h-4" />
                {isStarting ? 'Starting...' : 'Start Simulation'}
              </Button>
            ) : (
              <Button onClick={() => stopSimulation()} disabled={isStopping} variant="destructive" className="gap-2">
                <Square className="w-4 h-4" />
                {isStopping ? 'Stopping...' : 'Stop'}
              </Button>
            )}
          </div>
        </header>

        {/* Progress Bar (when running) */}
        {isRunning && status && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span className="font-medium">
                    Processing: {status.current_market || 'Initializing...'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatTime(status.elapsed_time)}
                  </span>
                  {status.estimated_remaining && (
                    <span>~{formatTime(status.estimated_remaining)} remaining</span>
                  )}
                </div>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {status.markets_completed} / {status.total_markets} markets evaluated
              </p>
            </CardContent>
          </Card>
        )}

        {/* Content Grid */}
        {isCompleted && results?.scores ? (
          // Results View
          <ResultsLeaderboard scores={results.scores} />
        ) : (
          // Live View
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Portfolio Cards */}
            <div className="lg:col-span-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Portfolio Performance
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedPortfolios.map((portfolio, idx) => (
                  <PortfolioCard key={portfolio.model_id} portfolio={portfolio} rank={idx + 1} />
                ))}
              </div>

              {sortedPortfolios.length === 0 && (
                <Card className="p-8 text-center">
                  <Brain className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-semibold mb-2">No Simulation Running</h3>
                  <p className="text-muted-foreground mb-4">
                    Start a simulation to see LLMs compete on prediction markets
                  </p>
                </Card>
              )}
            </div>

            {/* Right: Decision Feed */}
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Recent Decisions
              </h2>
              <Card className="h-[500px]">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-3">
                    {status?.recent_decisions && status.recent_decisions.length > 0 ? (
                      status.recent_decisions.map((decision, idx) => (
                        <DecisionCard key={idx} decision={decision} />
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p>Waiting for decisions...</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </div>
          </div>
        )}

        {/* Stats Summary */}
        {(isRunning || isCompleted) && status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Markets</span>
                </div>
                <p className="text-2xl font-mono font-bold">
                  {status.markets_completed}/{status.total_markets}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Activity className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Decisions</span>
                </div>
                <p className="text-2xl font-mono font-bold">
                  {status.recent_decisions?.length || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Elapsed</span>
                </div>
                <p className="text-2xl font-mono font-bold">{formatTime(status.elapsed_time)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Brain className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">Models</span>
                </div>
                <p className="text-2xl font-mono font-bold">{status.portfolios?.length || 0}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

