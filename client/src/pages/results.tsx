/**
 * TruthBench Results Dashboard
 *
 * Beautiful visualization of benchmark results showing which LLMs
 * perform best at prediction market forecasting.
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  BarChart3,
  Download,
  ArrowRight,
  Sparkles,
  Activity,
  RefreshCw,
  Clock,
  Percent,
  DollarSign,
  LayoutDashboard,
  Search,
  Play,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ModeToggle } from '@/components/mode-toggle';
import type { SimulationResults, ModelScore } from '@/lib/truthbenchApi';
import { getSimulationResults, getSimulationStatus } from '@/lib/truthbenchApi';

// Model colors for consistent visualization
const MODEL_COLORS: Record<string, { gradient: string; bg: string; border: string }> = {
  'grok-4-1-fast-reasoning': {
    gradient: 'from-sky-400 to-blue-600',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  'gpt-5.1': {
    gradient: 'from-emerald-400 to-green-600',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  'anthropic/claude-opus-4-5-20251101': {
    gradient: 'from-amber-400 to-orange-600',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  'gemini/gemini-3-pro-preview': {
    gradient: 'from-violet-400 to-purple-600',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
  },
};

function getModelColors(modelId: string) {
  return (
    MODEL_COLORS[modelId] || {
      gradient: 'from-slate-400 to-slate-600',
      bg: 'bg-slate-500/10',
      border: 'border-slate-500/30',
    }
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(value: number, showSign = true): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: showSign ? 'exceptZero' : 'auto',
  }).format(value);
}

function getShortName(modelId: string): string {
  // Extract a readable short name from model ID
  if (modelId.includes('grok')) return 'Grok';
  if (modelId.includes('gpt')) return 'GPT';
  if (modelId.includes('claude')) return 'Claude';
  if (modelId.includes('gemini')) return 'Gemini';
  return modelId.split('/').pop()?.split('-')[0] || modelId;
}

function generateInsights(scores: ModelScore[]): string[] {
  if (!scores || scores.length === 0) return [];

  const insights: string[] = [];
  const sorted = [...scores].sort((a, b) => b.roi - a.roi);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];

  // Winner insight
  if (winner.roi > 0) {
    insights.push(
      `${getShortName(winner.model_id)} achieved ${formatPercent(winner.roi)} ROI, ` +
        `turning $1,000 into ${formatCurrency(winner.final_bankroll)}`
    );
  } else {
    insights.push(
      `${getShortName(winner.model_id)} led the benchmark with ${formatPercent(winner.roi)} ROI`
    );
  }

  // Best calibration (lowest Brier score)
  const bestBrier = [...scores].sort((a, b) => a.brier_score - b.brier_score)[0];
  if (bestBrier.brier_score < 0.25) {
    insights.push(
      `${getShortName(bestBrier.model_id)} showed best probability calibration ` +
        `with Brier score of ${bestBrier.brier_score.toFixed(4)}`
    );
  }

  // Accuracy comparison
  const bestAccuracy = [...scores].sort((a, b) => b.accuracy - a.accuracy)[0];
  insights.push(
    `${getShortName(bestAccuracy.model_id)} predicted outcomes correctly ` +
      `${formatPercent(bestAccuracy.accuracy, false)} of the time`
  );

  // Risk-adjusted returns
  const bestSharpe = [...scores].sort((a, b) => b.sharpe_ratio - a.sharpe_ratio)[0];
  if (bestSharpe.sharpe_ratio > 0) {
    insights.push(
      `${getShortName(bestSharpe.model_id)} had best risk-adjusted returns ` +
        `(Sharpe ratio: ${bestSharpe.sharpe_ratio.toFixed(2)})`
    );
  }

  // Spread comparison
  if (winner.roi > 0 && loser.roi < 0) {
    const spread = winner.roi - loser.roi;
    insights.push(
      `Performance spread of ${formatPercent(spread)} between best and worst models`
    );
  }

  return insights;
}

function LeaderboardCard({
  score,
  rank,
  totalScores,
}: {
  score: ModelScore;
  rank: number;
  totalScores: number;
}) {
  const colors = getModelColors(score.model_id);
  const isWinner = rank === 1;
  const isPositive = score.roi >= 0;

  // Calculate relative performance bar
  const maxROI = Math.max(Math.abs(score.roi), 0.5);
  const barWidth = Math.min(100, (Math.abs(score.roi) / maxROI) * 100);

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 hover:scale-[1.02] ${
        isWinner ? 'ring-2 ring-yellow-500/50 shadow-lg shadow-yellow-500/10' : ''
      } ${colors.border}`}
    >
      {/* Gradient accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.gradient}`} />

      {/* Winner badge */}
      {isWinner && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs font-medium">
            <Trophy className="w-3 h-3" />
            WINNER
          </div>
        </div>
      )}

      <CardContent className="pt-6 pb-4 px-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl bg-gradient-to-br ${colors.gradient} text-white shadow-lg`}
          >
            #{rank}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold tracking-tight">{score.model_name}</h3>
            <p className="text-sm text-muted-foreground truncate">{score.model_id}</p>
          </div>
        </div>

        {/* Main ROI Display */}
        <div className="mb-6">
          <div className="flex items-end gap-3 mb-2">
            <span
              className={`text-4xl font-mono font-black tracking-tight ${
                isPositive ? 'text-emerald-500' : 'text-red-500'
              }`}
            >
              {formatPercent(score.roi)}
            </span>
            <span className="text-lg text-muted-foreground mb-1">ROI</span>
            {isPositive ? (
              <TrendingUp className="w-6 h-6 text-emerald-500 mb-1" />
            ) : (
              <TrendingDown className="w-6 h-6 text-red-500 mb-1" />
            )}
          </div>

          {/* ROI Bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isPositive ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-3 rounded-xl ${colors.bg}`}>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Final</span>
            </div>
            <p className="text-lg font-mono font-semibold">{formatCurrency(score.final_bankroll)}</p>
          </div>

          <div className={`p-3 rounded-xl ${colors.bg}`}>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Accuracy</span>
            </div>
            <p className="text-lg font-mono font-semibold">{formatPercent(score.accuracy, false)}</p>
          </div>

          <div className={`p-3 rounded-xl ${colors.bg}`}>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Brier</span>
            </div>
            <p className="text-lg font-mono font-semibold">{score.brier_score.toFixed(4)}</p>
          </div>

          <div className={`p-3 rounded-xl ${colors.bg}`}>
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-medium uppercase">Sharpe</span>
            </div>
            <p className="text-lg font-mono font-semibold">{score.sharpe_ratio.toFixed(2)}</p>
          </div>
        </div>

        {/* Trade stats */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Win Rate</span>
            <span className="font-mono">{formatPercent(score.win_rate, false)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Total Trades</span>
            <span className="font-mono">{score.total_trades}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightCard({ insight, index }: { insight: string; index: number }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20">
      <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-amber-500" />
      </div>
      <p className="text-sm leading-relaxed">{insight}</p>
    </div>
  );
}

export default function Results() {
  const [results, setResults] = useState<SimulationResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        setLoading(true);
        const data = await getSimulationResults();
        setResults(data);
        setError(null);
      } catch (e) {
        console.error('Failed to fetch results:', e);
        setError(e instanceof Error ? e.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, []);

  const insights = results?.scores ? generateInsights(results.scores) : [];
  const sortedScores = results?.scores ? [...results.scores].sort((a, b) => b.roi - a.roi) : [];

  const handleDownload = () => {
    if (!results) return;

    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `truthbench-results-${results.simulation_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="text-lg font-bold text-foreground flex items-center gap-2">
                <Brain className="w-5 h-5 text-emerald-500" />
                TruthBench
              </span>
              <div className="flex items-center gap-1">
                <Link
                  href="/"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <Link
                  href="/truthbench"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Simulation
                </Link>
                <Link
                  href="/results"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-500 bg-emerald-500/10 rounded-md"
                >
                  <Trophy className="w-4 h-4" />
                  Results
                </Link>
                <Link
                  href="/analyze"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Analyze
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ModeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="w-12 h-12 text-muted-foreground animate-spin mb-4" />
            <p className="text-muted-foreground">Loading benchmark results...</p>
          </div>
        ) : error ? (
          <Card className="max-w-md mx-auto mt-20">
            <CardContent className="pt-6 text-center">
              <Brain className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Results Available</h2>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Link href="/truthbench">
                <Button className="gap-2">
                  <Play className="w-4 h-4" />
                  Run Benchmark
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : results ? (
          <>
            {/* Header */}
            <header className="mb-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold tracking-tight">Benchmark Results</h1>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    >
                      {results.status}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">
                    Simulation <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{results.simulation_id}</code>
                    {' • '}{results.markets_evaluated} markets evaluated
                    {' • '}{results.total_decisions} total decisions
                  </p>
                </div>

                <Button onClick={handleDownload} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Download Report
                </Button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      <span className="text-xs font-medium uppercase">Winner</span>
                    </div>
                    <p className="text-xl font-bold truncate">
                      {sortedScores[0] ? getShortName(sortedScores[0].model_id) : '—'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-medium uppercase">Best ROI</span>
                    </div>
                    <p className="text-xl font-mono font-bold text-emerald-500">
                      {sortedScores[0] ? formatPercent(sortedScores[0].roi) : '—'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Target className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase">Markets</span>
                    </div>
                    <p className="text-xl font-mono font-bold">{results.markets_evaluated}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Brain className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase">Models</span>
                    </div>
                    <p className="text-xl font-mono font-bold">{sortedScores.length}</p>
                  </CardContent>
                </Card>
              </div>
            </header>

            {/* Key Insights */}
            {insights.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  Key Insights
                </h2>
                <div className="grid gap-3">
                  {insights.map((insight, idx) => (
                    <InsightCard key={idx} insight={insight} index={idx} />
                  ))}
                </div>
              </section>
            )}

            {/* Leaderboard */}
            <section>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Final Leaderboard
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sortedScores.map((score, idx) => (
                  <LeaderboardCard
                    key={score.model_id}
                    score={score}
                    rank={idx + 1}
                    totalScores={sortedScores.length}
                  />
                ))}
              </div>
            </section>

            {/* Footer link to trace */}
            <div className="mt-8 p-4 rounded-xl bg-muted/50 border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium mb-1">Full Trace Available</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete logs of every LLM call, decision, and market settlement
                  </p>
                </div>
                <Link href="/truthbench">
                  <Button variant="ghost" className="gap-2">
                    View Simulation
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

