import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/mode-toggle";
import { Link } from "wouter";
import { 
  FileText, 
  LayoutDashboard, 
  Search, 
  TrendingUp, 
  ExternalLink, 
  Activity, 
  ArrowRight,
  CheckCircle,
  XCircle
} from "lucide-react";
import { OpenAIIcon, ClaudeIcon, GrokIcon, GeminiIcon, DeepSeekIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

interface Market {
  id: string;
  tag: string;
  ticker: string;
  title: string;
  yesLabel: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
}

interface ModelVote {
  id: string;
  name: string;
  vote: 'YES' | 'NO';
  confidence: number;
  reasoning: string;
}

const MARKETS: Market[] = [
  {
    id: 'pres-winner-28',
    tag: 'Politics / 2028',
    ticker: 'PRES-WINNER-28',
    title: 'Next US Presidential Election Winner?',
    yesLabel: 'J.D. Vance',
    yesPrice: 30,
    noPrice: 70,
    volume: '$4.8M',
  },
  {
    id: 'fed-nominee',
    tag: 'Politics / Fed',
    ticker: 'FED-NOMINEE',
    title: 'Who will Trump nominate as Fed Chair?',
    yesLabel: 'Kevin Hassett',
    yesPrice: 75,
    noPrice: 25,
    volume: '$6.8M',
  },
  {
    id: 'dem-nom-28',
    tag: 'Politics / Dems',
    ticker: 'DEM-NOM-28',
    title: 'Democratic Presidential Nominee 2028?',
    yesLabel: 'Gavin Newsom',
    yesPrice: 37,
    noPrice: 63,
    volume: '$30.5M',
  },
  {
    id: 'cabinet-exit',
    tag: 'Politics / Cabinet',
    ticker: 'CABINET-EXIT',
    title: 'First to leave Trump Cabinet?',
    yesLabel: 'Pete Hegseth',
    yesPrice: 31,
    noPrice: 69,
    volume: '$3.0M',
  },
  {
    id: 'house-2026',
    tag: 'Congress',
    ticker: 'HOUSE-2026',
    title: 'Which party will win the U.S. House?',
    yesLabel: 'Democrats',
    yesPrice: 75,
    noPrice: 25,
    volume: '$2.1M',
  },
  {
    id: 'world-leader-exit',
    tag: 'Geopolitics',
    ticker: 'WORLD-LEADER-EXIT',
    title: 'World leaders out this year?',
    yesLabel: 'Nicolas Maduro',
    yesPrice: 12,
    noPrice: 88,
    volume: '$1.8M',
  },
];

const MODEL_VOTES: Record<string, ModelVote[]> = {
  'pres-winner-28': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 82, reasoning: 'Strong early momentum and party consolidation signals' },
    { id: 'grok_heavy', name: 'Grok 4 Heavy', vote: 'YES', confidence: 78, reasoning: 'Historical pattern matching favors incumbent party fatigue' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 71, reasoning: 'Economic indicators suggest favorable conditions for challenger' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 68, reasoning: 'Sentiment analysis shows growing support trajectory' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 65, reasoning: 'Advises caution due to high uncertainty this far out' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 74, reasoning: 'Identifies arbitrage opportunity in undervalued YES contracts' },
  ],
  'fed-nominee': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 88, reasoning: 'X posts strongly indicate Hassett as frontrunner' },
    { id: 'grok_heavy', name: 'Grok 4 Heavy', vote: 'YES', confidence: 85, reasoning: 'Political alignment analysis supports this pick' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 79, reasoning: 'Historical nomination patterns match this profile' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 76, reasoning: 'Media coverage analysis suggests strong candidacy' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'YES', confidence: 72, reasoning: 'Policy alignment with administration priorities is high' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 81, reasoning: 'Market pricing reflects high probability correctly' },
  ],
  'dem-nom-28': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 65, reasoning: 'Social media momentum building for Newsom' },
    { id: 'grok_heavy', name: 'Grok 4 Heavy', vote: 'NO', confidence: 58, reasoning: 'Field is too crowded for certainty' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 62, reasoning: 'Fundraising capacity gives significant advantage' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'NO', confidence: 55, reasoning: 'Primary dynamics historically unpredictable' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 60, reasoning: 'Too early to determine with high confidence' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 59, reasoning: 'Current odds undervalue established candidates' },
  ],
  'cabinet-exit': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 72, reasoning: 'Media scrutiny patterns suggest vulnerability' },
    { id: 'grok_heavy', name: 'Grok 4 Heavy', vote: 'YES', confidence: 68, reasoning: 'Historical cabinet turnover analysis supports this' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'NO', confidence: 55, reasoning: 'Multiple candidates have similar risk profiles' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 64, reasoning: 'Controversy timeline suggests early departure' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 58, reasoning: 'Insufficient data for confident prediction' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 66, reasoning: 'Betting market inefficiency detected' },
  ],
  'house-2026': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 81, reasoning: 'Midterm historical patterns favor opposition party' },
    { id: 'grok_heavy', name: 'Grok 4 Heavy', vote: 'YES', confidence: 78, reasoning: 'Redistricting analysis favors Democrats' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 75, reasoning: 'Economic cycle positioning supports flip' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 72, reasoning: 'Polling trajectory analysis is favorable' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'YES', confidence: 69, reasoning: 'Structural advantages in key districts' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 77, reasoning: 'Market is correctly pricing high probability' },
  ],
  'world-leader-exit': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'NO', confidence: 75, reasoning: 'Authoritarian regimes show remarkable stability' },
    { id: 'grok_heavy', name: 'Grok 4 Heavy', vote: 'NO', confidence: 72, reasoning: 'Opposition lacks coordination for ouster' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'NO', confidence: 68, reasoning: 'Historical analysis of similar regimes' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 45, reasoning: 'Some external pressure indicators rising' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 70, reasoning: 'Structural factors support continuation' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'NO', confidence: 65, reasoning: 'Current pricing is approximately correct' },
  ],
};

const MARKET_DEFINITIONS: Record<string, string> = {
  'pres-winner-28': 'This contract resolves to YES if J.D. Vance wins the 2028 U.S. Presidential Election.',
  'fed-nominee': 'This contract resolves to YES if Kevin Hassett is nominated as the next Federal Reserve Chair.',
  'dem-nom-28': 'This contract resolves to YES if Gavin Newsom becomes the 2028 Democratic Presidential Nominee.',
  'cabinet-exit': 'This contract resolves to YES if Pete Hegseth is the first member to leave the Trump Cabinet.',
  'house-2026': 'This contract resolves to YES if Democrats win control of the U.S. House in 2026.',
  'world-leader-exit': 'This contract resolves to YES if Nicolas Maduro leaves power before year end.',
};

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

function MarketCard({ market, isSelected, onClick }: { market: Market; isSelected: boolean; onClick: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-4 rounded-lg cursor-pointer transition-all border",
        isSelected 
          ? "bg-slate-800/80 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]" 
          : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50"
      )}
      data-testid={`market-card-${market.id}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-[10px] bg-slate-800 border-slate-700 text-slate-400">
          {market.tag}
        </Badge>
        {isSelected && (
          <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 border-0">
            ACTIVE
          </Badge>
        )}
      </div>
      
      <div className="font-mono text-xs text-slate-500 mb-1">{market.ticker}</div>
      <div className="font-medium text-sm text-slate-200 mb-3 leading-tight">{market.title}</div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">{market.yesLabel}</div>
            <div className="font-mono text-lg font-bold text-emerald-400">{market.yesPrice}¢</div>
          </div>
          <div className="text-slate-600">|</div>
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">NO</div>
            <div className="font-mono text-lg font-bold text-rose-400">{market.noPrice}¢</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Volume</div>
          <div className="font-mono text-sm text-slate-300">{market.volume}</div>
        </div>
      </div>
    </div>
  );
}

function ConsensusPanel({ market, votes }: { market: Market; votes: ModelVote[] }) {
  const [contracts, setContracts] = useState(10);
  
  const analysis = useMemo(() => {
    const yesVotes = votes.filter(v => v.vote === 'YES');
    const noVotes = votes.filter(v => v.vote === 'NO');
    const avgConfidence = votes.reduce((acc, v) => acc + v.confidence, 0) / votes.length;
    const recommendation = yesVotes.length > noVotes.length ? 'YES' : 'NO';
    
    return {
      recommendation,
      yesCount: yesVotes.length,
      noCount: noVotes.length,
      avgConfidence: Math.round(avgConfidence),
      isStrong: Math.abs(yesVotes.length - noVotes.length) >= 3,
    };
  }, [votes]);

  const generateConsensusText = () => {
    const bullish = analysis.recommendation === 'YES';
    const yesModels = votes.filter(v => v.vote === 'YES').map(v => v.name.split(' ')[0]);
    const noModels = votes.filter(v => v.vote === 'NO').map(v => v.name.split(' ')[0]);
    
    if (bullish) {
      return `The consensus is bullish. **${yesModels.slice(0, 2).join('** and **')}** highlight strong momentum indicators${noModels.length > 0 ? `, while **${noModels[0]}** advises caution due to macro headwinds` : ''}. With ${analysis.yesCount} out of 6 models voting YES, the aggregate signal suggests an undervaluation of the 'YES' contract at current pricing.`;
    } else {
      return `The consensus is bearish. **${noModels.slice(0, 2).join('** and **')}** identify significant risk factors${yesModels.length > 0 ? `, though **${yesModels[0]}** sees potential upside` : ''}. With ${analysis.noCount} out of 6 models voting NO, the aggregate signal suggests the 'NO' position offers better risk-adjusted returns.`;
    }
  };

  const keyFactors = useMemo(() => {
    const factors = votes
      .filter(v => v.vote === analysis.recommendation)
      .slice(0, 3)
      .map(v => v.reasoning);
    return factors;
  }, [votes, analysis.recommendation]);

  const contractPrice = analysis.recommendation === 'YES' ? market.yesPrice : market.noPrice;
  const estCost = (contracts * contractPrice / 100).toFixed(2);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-xs bg-slate-800 border-slate-700 text-slate-400">
              {market.tag}
            </Badge>
            <a href="#" className="text-slate-500 hover:text-slate-300">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">{market.title}</h2>
          <p className="text-sm text-slate-400">{MARKET_DEFINITIONS[market.id]}</p>
        </div>

        <div className={cn(
          "rounded-xl p-6 border-2",
          analysis.recommendation === 'YES' 
            ? "bg-gradient-to-br from-emerald-950/50 to-slate-900 border-emerald-500/40" 
            : "bg-gradient-to-br from-rose-950/50 to-slate-900 border-rose-500/40"
        )}>
          <div className="flex items-center gap-2 mb-1">
            <Activity className={cn(
              "w-5 h-5",
              analysis.recommendation === 'YES' ? "text-emerald-400" : "text-rose-400"
            )} />
            <span className="text-sm font-semibold text-slate-300">AlphaBench Consensus</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className={cn(
                "text-3xl font-bold",
                analysis.recommendation === 'YES' ? "text-emerald-400" : "text-rose-400"
              )}>
                BUY {analysis.recommendation}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {analysis.yesCount} YES / {analysis.noCount} NO votes
              </div>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-4xl font-mono font-bold",
                analysis.avgConfidence >= 70 ? "text-emerald-400" : 
                analysis.avgConfidence >= 50 ? "text-amber-400" : "text-slate-400"
              )}>
                {analysis.avgConfidence}%
              </div>
              <div className="text-xs text-slate-500">Confidence</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-5 bg-slate-900/80 border border-indigo-500/30">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-slate-300">Consensus Reasoning</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed mb-4" 
             dangerouslySetInnerHTML={{ __html: generateConsensusText().replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>') }} 
          />
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Key Factors</div>
            {keyFactors.map((factor, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="text-indigo-400 mt-0.5">•</span>
                {factor}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Model Vote Breakdown</div>
          <div className="grid grid-cols-3 gap-2">
            {votes.map(vote => (
              <div 
                key={vote.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border",
                  vote.vote === 'YES' 
                    ? "bg-emerald-950/30 border-emerald-500/30" 
                    : "bg-rose-950/30 border-rose-500/30"
                )}
                data-testid={`vote-badge-${vote.id}`}
              >
                <ModelIcon id={vote.id} className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-300 flex-1 truncate">{vote.name.split(' ')[0]}</span>
                {vote.vote === 'YES' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4 mt-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Contracts</label>
            <Input 
              type="number" 
              value={contracts}
              onChange={(e) => setContracts(parseInt(e.target.value) || 0)}
              className="bg-slate-800 border-slate-700 font-mono"
              data-testid="input-contracts"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500 mb-1 block">Est. Cost</label>
            <div className="h-10 flex items-center px-3 bg-slate-800 border border-slate-700 rounded-md font-mono text-emerald-400">
              ${estCost}
            </div>
          </div>
        </div>
        <Button 
          className={cn(
            "w-full h-12 font-semibold text-base gap-2",
            analysis.recommendation === 'YES'
              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : "bg-rose-600 hover:bg-rose-500 text-white"
          )}
          data-testid="button-execute"
        >
          Execute BUY {analysis.recommendation}
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

export default function Analyze() {
  const [selectedMarketId, setSelectedMarketId] = useState<string>('pres-winner-28');
  
  const selectedMarket = MARKETS.find(m => m.id === selectedMarketId)!;
  const selectedVotes = MODEL_VOTES[selectedMarketId] || [];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
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
                <Link href="/report" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors" data-testid="link-report">
                  <FileText className="w-4 h-4" />
                  Report
                </Link>
                <Link href="/analyze" className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-500 bg-cyan-500/10 rounded-md" data-testid="link-analyze">
                  <Search className="w-4 h-4" />
                  Analyze
                </Link>
              </div>
            </div>
            <ModeToggle />
          </div>
        </div>
      </nav>

      <div className="flex-1 flex max-w-[1600px] mx-auto w-full">
        <aside className="w-[30%] border-r border-slate-800 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Live Markets</h3>
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse">
              LIVE
            </Badge>
          </div>
          <div className="space-y-3">
            {MARKETS.map(market => (
              <MarketCard 
                key={market.id}
                market={market}
                isSelected={market.id === selectedMarketId}
                onClick={() => setSelectedMarketId(market.id)}
              />
            ))}
          </div>
        </aside>

        <main className="flex-1 p-6 flex flex-col min-h-0">
          <ConsensusPanel market={selectedMarket} votes={selectedVotes} />
        </main>
      </div>
    </div>
  );
}
