/**
 * TruthBench Trace Explorer
 *
 * Full observability into simulation traces - see every LLM call,
 * trade execution, and market settlement with complete details.
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
    Eye,
    MessageSquare,
    TrendingUp,
    TrendingDown,
    CheckCircle,
    XCircle,
    Clock,
    Brain,
    DollarSign,
    ChevronDown,
    ChevronRight,
    Filter,
    LayoutDashboard,
    Trophy,
    Search,
    Activity,
    FileJson,
    ArrowLeft,
    Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Nav } from '@/components/nav';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';

// Use environment variable or default to Render deployment in production
const API_BASE = (
  import.meta.env.VITE_LLM_SERVICE_URL ??
  (import.meta.env.MODE === 'production' 
    ? 'https://truth-bench-python.onrender.com' 
    : 'http://localhost:8000')
).replace(/\/+$/, '');

// Types
interface TraceListItem {
    trace_id: string;
    simulation_id: string;
    filename: string;
    start_time: string | null;
    end_time: string | null;
    status: string;
    models: string[];
    llm_calls_count: number;
    trades_count: number;
    settlements_count: number;
}

interface LLMCall {
    trace_id: string;
    timestamp: string;
    model_id: string;
    market_ticker: string;
    system_prompt: string;
    user_prompt: string;
    raw_response: string;
    parsed_successfully: boolean;
    action: string;
    quantity: number;
    confidence: number;
    probability_yes: number;
    reasoning: string;
    latency_ms: number;
}

interface Trade {
    trace_id: string;
    timestamp: string;
    model_id: string;
    market_ticker: string;
    action: string;
    requested_quantity: number;
    executed: boolean;
    executed_quantity: number;
    execution_price: number;
    total_cost: number;
    error: string | null;
    bankroll_before: number;
    bankroll_after: number;
}

interface Settlement {
    trace_id: string;
    timestamp: string;
    market_ticker: string;
    result: string;
    settlements: Record<string, number>;
}

// Model colors for visual distinction
const MODEL_COLORS: Record<string, string> = {
    'grok-4-1-fast-reasoning': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'gpt-5.1': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'anthropic/claude-opus-4-5-20251101': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'gemini/gemini-3-pro-preview': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const MODEL_NAMES: Record<string, string> = {
    'grok-4-1-fast-reasoning': 'Grok 4.1',
    'gpt-5.1': 'GPT-5.1',
    'anthropic/claude-opus-4-5-20251101': 'Claude Opus',
    'gemini/gemini-3-pro-preview': 'Gemini 3',
};

function getModelColor(modelId: string): string {
    return MODEL_COLORS[modelId] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
}

function getModelName(modelId: string): string {
    return MODEL_NAMES[modelId] || modelId;
}

function formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

// LLM Call Card Component
function LLMCallCard({ call, expanded, onToggle }: { call: LLMCall; expanded: boolean; onToggle: () => void }) {
    const action = call.action || 'hold';
    const actionColor = action.includes('buy_yes')
        ? 'text-emerald-400'
        : action.includes('buy_no')
            ? 'text-red-400'
            : action === 'hold'
                ? 'text-slate-400'
                : 'text-yellow-400';

    return (
        <Collapsible open={expanded} onOpenChange={onToggle}>
            <Card className="border-slate-700 bg-slate-900/50">
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-slate-800/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                <Badge className={getModelColor(call.model_id)}>
                                    {getModelName(call.model_id)}
                                </Badge>
                                <span className="text-sm text-slate-400">{call.market_ticker}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`font-mono font-bold ${actionColor}`}>
                                    {action.toUpperCase()}
                                </span>
                                {call.quantity > 0 && (
                                    <Badge variant="outline" className="border-slate-600">
                                        {call.quantity} contracts
                                    </Badge>
                                )}
                                <span className="text-xs text-slate-500">
                                    {formatDuration(call.latency_ms)}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {formatTime(call.timestamp)}
                                </span>
                            </div>
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                        {/* Reasoning */}
                        <div className="bg-slate-800/50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Brain className="w-4 h-4 text-purple-400" />
                                <span className="text-sm font-medium text-purple-400">Reasoning</span>
                            </div>
                            <p className="text-sm text-slate-300">{call.reasoning}</p>
                        </div>

                        {/* Metrics Row */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-slate-800/30 rounded p-2">
                                <p className="text-xs text-slate-500">Confidence</p>
                                <p className="font-mono text-lg">{call.confidence}%</p>
                            </div>
                            <div className="bg-slate-800/30 rounded p-2">
                                <p className="text-xs text-slate-500">P(YES)</p>
                                <p className="font-mono text-lg">{(call.probability_yes * 100).toFixed(0)}%</p>
                            </div>
                            <div className="bg-slate-800/30 rounded p-2">
                                <p className="text-xs text-slate-500">Parse Status</p>
                                <p className="flex items-center gap-1">
                                    {call.parsed_successfully ? (
                                        <><CheckCircle className="w-4 h-4 text-emerald-400" /> Success</>
                                    ) : (
                                        <><XCircle className="w-4 h-4 text-red-400" /> Failed</>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Prompts */}
                        <details className="group">
                            <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                View Full Prompts
                            </summary>
                            <div className="mt-2 space-y-2">
                                <div className="bg-slate-950 rounded p-3 max-h-48 overflow-auto">
                                    <p className="text-xs text-slate-500 mb-1">System Prompt</p>
                                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                                        {call.system_prompt}
                                    </pre>
                                </div>
                                <div className="bg-slate-950 rounded p-3 max-h-48 overflow-auto">
                                    <p className="text-xs text-slate-500 mb-1">User Prompt</p>
                                    <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                                        {call.user_prompt}
                                    </pre>
                                </div>
                                <div className="bg-slate-950 rounded p-3 max-h-48 overflow-auto">
                                    <p className="text-xs text-slate-500 mb-1">Raw Response</p>
                                    <pre className="text-xs text-emerald-300 whitespace-pre-wrap font-mono">
                                        {call.raw_response}
                                    </pre>
                                </div>
                            </div>
                        </details>
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

// Trade Card Component
function TradeCard({ trade }: { trade: Trade }) {
    const isProfit = trade.bankroll_after > trade.bankroll_before;
    const pnl = trade.bankroll_after - trade.bankroll_before;

    return (
        <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Badge className={getModelColor(trade.model_id)}>
                            {getModelName(trade.model_id)}
                        </Badge>
                        <span className="text-sm text-slate-400">{trade.market_ticker}</span>
                        <Badge
                            variant="outline"
                            className={trade.action.includes('buy') ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}
                        >
                            {trade.action.toUpperCase()}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="font-mono text-sm">
                            {trade.executed_quantity} @ {trade.execution_price}¢
                        </span>
                        {trade.executed && (
                            <span className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isProfit ? '+' : ''}{formatCents(pnl)}
                            </span>
                        )}
                        {!trade.executed && (
                            <Badge variant="destructive">Failed</Badge>
                        )}
                        <span className="text-xs text-slate-500">
                            {formatTime(trade.timestamp)}
                        </span>
                    </div>
                </div>
                {trade.error && (
                    <p className="text-xs text-red-400 mt-2">{trade.error}</p>
                )}
            </CardContent>
        </Card>
    );
}

// Settlement Card Component
function SettlementCard({ settlement }: { settlement: Settlement }) {
    return (
        <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="py-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <span className="font-medium">{settlement.market_ticker}</span>
                        <Badge
                            variant="outline"
                            className={settlement.result === 'yes' ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}
                        >
                            Resolved: {settlement.result.toUpperCase()}
                        </Badge>
                    </div>
                    <span className="text-xs text-slate-500">
                        {formatTime(settlement.timestamp)}
                    </span>
                </div>
                <div className="flex gap-4 mt-2">
                    {Object.entries(settlement.settlements).map(([model, pnl]) => (
                        <div key={model} className="flex items-center gap-2">
                            <Badge className={getModelColor(model)} variant="outline">
                                {getModelName(model)}
                            </Badge>
                            <span className={`font-mono text-sm ${pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                                {pnl > 0 ? '+' : ''}{formatCents(pnl)}
                            </span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export default function Traces() {
    const [traces, setTraces] = useState<TraceListItem[]>([]);
    const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
    const [llmCalls, setLlmCalls] = useState<LLMCall[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCall, setExpandedCall] = useState<string | null>(null);

    // Filters
    const [modelFilter, setModelFilter] = useState<string>('all');
    const [marketFilter, setMarketFilter] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'llm' | 'trades' | 'settlements'>('llm');

    // Fetch available traces
    useEffect(() => {
        async function fetchTraces() {
            try {
                const res = await fetch(`${API_BASE}/api/truthbench/traces`);
                const data = await res.json();
                setTraces(data);
                if (data.length > 0) {
                    setSelectedTrace(data[0].trace_id);
                }
            } catch (error) {
                console.error('Failed to fetch traces:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchTraces();
    }, []);

    // Fetch trace details when selected trace changes
    useEffect(() => {
        if (!selectedTrace) return;

        async function fetchTraceData() {
            setLoading(true);
            try {
                const [llmRes, tradesRes, settlementsRes] = await Promise.all([
                    fetch(`${API_BASE}/api/truthbench/traces/${selectedTrace}/llm-calls?limit=200`),
                    fetch(`${API_BASE}/api/truthbench/traces/${selectedTrace}/trades`),
                    fetch(`${API_BASE}/api/truthbench/traces/${selectedTrace}/settlements`),
                ]);

                const llmData = await llmRes.json();
                const tradesData = await tradesRes.json();
                const settlementsData = await settlementsRes.json();

                setLlmCalls(llmData.llm_calls || []);
                setTrades(tradesData.trades || []);
                setSettlements(settlementsData.settlements || []);
            } catch (error) {
                console.error('Failed to fetch trace data:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchTraceData();
    }, [selectedTrace]);

    // Filter data
    const filteredLLMCalls = llmCalls.filter(call => {
        if (modelFilter !== 'all' && call.model_id !== modelFilter) return false;
        if (marketFilter && !call.market_ticker.toLowerCase().includes(marketFilter.toLowerCase())) return false;
        return true;
    });

    const filteredTrades = trades.filter(trade => {
        if (modelFilter !== 'all' && trade.model_id !== modelFilter) return false;
        if (marketFilter && !trade.market_ticker.toLowerCase().includes(marketFilter.toLowerCase())) return false;
        return true;
    });

    const filteredSettlements = settlements.filter(settlement => {
        if (marketFilter && !settlement.market_ticker.toLowerCase().includes(marketFilter.toLowerCase())) return false;
        return true;
    });

    // Get unique models from current trace
    const models = Array.from(new Set(llmCalls.map(c => c.model_id)));

    const selectedTraceInfo = traces.find(t => t.trace_id === selectedTrace);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            <Nav />

            <main className="max-w-7xl mx-auto px-4 py-6">
                {/* Header */}
                <header className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold flex items-center gap-3">
                                <Eye className="w-8 h-8 text-emerald-400" />
                                Trace Explorer
                            </h1>
                            <p className="text-slate-400 mt-1">
                                Full observability into every LLM decision, trade, and settlement
                            </p>
                        </div>

                        {/* Trace Selector */}
                        <Select value={selectedTrace || ''} onValueChange={setSelectedTrace}>
                            <SelectTrigger className="w-64 bg-slate-800 border-slate-700">
                                <SelectValue placeholder="Select a trace" />
                            </SelectTrigger>
                            <SelectContent>
                                {traces.map(trace => (
                                    <SelectItem key={trace.trace_id} value={trace.trace_id}>
                                        <div className="flex items-center gap-2">
                                            <FileJson className="w-4 h-4" />
                                            {trace.simulation_id}
                                            <Badge variant="outline" className="ml-2">
                                                {trace.llm_calls_count} calls
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </header>

                {/* Trace Stats */}
                {selectedTraceInfo && (
                    <div className="grid grid-cols-4 gap-4 mb-6">
                        <Card className="border-slate-700 bg-slate-900/50">
                            <CardContent className="py-4">
                                <div className="flex items-center gap-3">
                                    <MessageSquare className="w-5 h-5 text-purple-400" />
                                    <div>
                                        <p className="text-2xl font-bold font-mono">{selectedTraceInfo.llm_calls_count}</p>
                                        <p className="text-xs text-slate-400">LLM Calls</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-slate-700 bg-slate-900/50">
                            <CardContent className="py-4">
                                <div className="flex items-center gap-3">
                                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                                    <div>
                                        <p className="text-2xl font-bold font-mono">{selectedTraceInfo.trades_count}</p>
                                        <p className="text-xs text-slate-400">Trades Executed</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-slate-700 bg-slate-900/50">
                            <CardContent className="py-4">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-amber-400" />
                                    <div>
                                        <p className="text-2xl font-bold font-mono">{selectedTraceInfo.settlements_count}</p>
                                        <p className="text-xs text-slate-400">Markets Settled</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-slate-700 bg-slate-900/50">
                            <CardContent className="py-4">
                                <div className="flex items-center gap-3">
                                    <Brain className="w-5 h-5 text-blue-400" />
                                    <div>
                                        <p className="text-2xl font-bold font-mono">{selectedTraceInfo.models.length}</p>
                                        <p className="text-xs text-slate-400">Models Tested</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Filters */}
                <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-400">Filter:</span>
                    </div>
                    <Select value={modelFilter} onValueChange={setModelFilter}>
                        <SelectTrigger className="w-48 bg-slate-800 border-slate-700">
                            <SelectValue placeholder="All Models" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Models</SelectItem>
                            {models.map(model => (
                                <SelectItem key={model} value={model}>
                                    {getModelName(model)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder="Search market ticker..."
                        value={marketFilter}
                        onChange={e => setMarketFilter(e.target.value)}
                        className="w-48 bg-slate-800 border-slate-700"
                    />
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6">
                    <Button
                        variant={activeTab === 'llm' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('llm')}
                        className={activeTab === 'llm' ? 'bg-purple-600' : ''}
                    >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        LLM Calls ({filteredLLMCalls.length})
                    </Button>
                    <Button
                        variant={activeTab === 'trades' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('trades')}
                        className={activeTab === 'trades' ? 'bg-emerald-600' : ''}
                    >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Trades ({filteredTrades.length})
                    </Button>
                    <Button
                        variant={activeTab === 'settlements' ? 'default' : 'outline'}
                        onClick={() => setActiveTab('settlements')}
                        className={activeTab === 'settlements' ? 'bg-amber-600' : ''}
                    >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Settlements ({filteredSettlements.length})
                    </Button>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
                    </div>
                ) : (
                    <ScrollArea className="h-[calc(100vh-400px)]">
                        <div className="space-y-3">
                            {activeTab === 'llm' && filteredLLMCalls.map(call => (
                                <LLMCallCard
                                    key={call.trace_id}
                                    call={call}
                                    expanded={expandedCall === call.trace_id}
                                    onToggle={() => setExpandedCall(expandedCall === call.trace_id ? null : call.trace_id)}
                                />
                            ))}
                            {activeTab === 'trades' && filteredTrades.map(trade => (
                                <TradeCard key={trade.trace_id} trade={trade} />
                            ))}
                            {activeTab === 'settlements' && filteredSettlements.map(settlement => (
                                <SettlementCard key={settlement.trace_id} settlement={settlement} />
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </main>
        </div>
    );
}

