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
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getKalshiFeed, analyzeMarket, type TwitterMetrics, type ModelPrediction } from "@/lib/llmApi";

interface MarketOutcome {
  label: string;
  ticker: string;
  price: number;
}

interface Market {
  id: string;
  tag: string;
  ticker: string;
  title: string;
  yesLabel: string;
  yesPrice: number;
  noPrice: number;
  volume: string;
  url?: string;
  eventTicker?: string;
  allOutcomes?: MarketOutcome[];  // All possible outcomes for multivariate markets
}

interface ModelVote {
  id: string;
  name: string;
  vote: 'YES' | 'NO';
  confidence: number;
  reasoning: string;
}

interface XTweet {
  id: string;
  author: string;
  handle: string;
  avatar: string;
  content: string;
  timestamp: string;
  likes: string;
  retweets: string;
  sentiment: 'bullish' | 'bearish';
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
    { id: 'grok_heavy', name: 'Grok 4.1 Fast (Reasoning)', vote: 'YES', confidence: 78, reasoning: 'Historical pattern matching favors incumbent party fatigue' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 71, reasoning: 'Economic indicators suggest favorable conditions for challenger' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 68, reasoning: 'Sentiment analysis shows growing support trajectory' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 65, reasoning: 'Advises caution due to high uncertainty this far out' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 74, reasoning: 'Identifies arbitrage opportunity in undervalued YES contracts' },
  ],
  'fed-nominee': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 88, reasoning: 'X posts strongly indicate Hassett as frontrunner' },
    { id: 'grok_heavy', name: 'Grok 4.1 Fast (Reasoning)', vote: 'YES', confidence: 85, reasoning: 'Political alignment analysis supports this pick' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 79, reasoning: 'Historical nomination patterns match this profile' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 76, reasoning: 'Media coverage analysis suggests strong candidacy' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'YES', confidence: 72, reasoning: 'Policy alignment with administration priorities is high' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 81, reasoning: 'Market pricing reflects high probability correctly' },
  ],
  'dem-nom-28': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 65, reasoning: 'Social media momentum building for Newsom' },
    { id: 'grok_heavy', name: 'Grok 4.1 Fast (Reasoning)', vote: 'NO', confidence: 58, reasoning: 'Field is too crowded for certainty' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 62, reasoning: 'Fundraising capacity gives significant advantage' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'NO', confidence: 55, reasoning: 'Primary dynamics historically unpredictable' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 60, reasoning: 'Too early to determine with high confidence' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 59, reasoning: 'Current odds undervalue established candidates' },
  ],
  'cabinet-exit': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 72, reasoning: 'Media scrutiny patterns suggest vulnerability' },
    { id: 'grok_heavy', name: 'Grok 4.1 Fast (Reasoning)', vote: 'YES', confidence: 68, reasoning: 'Historical cabinet turnover analysis supports this' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'NO', confidence: 55, reasoning: 'Multiple candidates have similar risk profiles' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 64, reasoning: 'Controversy timeline suggests early departure' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'NO', confidence: 58, reasoning: 'Insufficient data for confident prediction' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 66, reasoning: 'Betting market inefficiency detected' },
  ],
  'house-2026': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'YES', confidence: 81, reasoning: 'Midterm historical patterns favor opposition party' },
    { id: 'grok_heavy', name: 'Grok 4.1 Fast (Reasoning)', vote: 'YES', confidence: 78, reasoning: 'Redistricting analysis favors Democrats' },
    { id: 'gpt_5', name: 'GPT-5.1', vote: 'YES', confidence: 75, reasoning: 'Economic cycle positioning supports flip' },
    { id: 'gemini_pro', name: 'Gemini 3 Pro', vote: 'YES', confidence: 72, reasoning: 'Polling trajectory analysis is favorable' },
    { id: 'claude_opus', name: 'Claude Opus 4.5', vote: 'YES', confidence: 69, reasoning: 'Structural advantages in key districts' },
    { id: 'deepseek_v3', name: 'DeepSeek-V3.2', vote: 'YES', confidence: 77, reasoning: 'Market is correctly pricing high probability' },
  ],
  'world-leader-exit': [
    { id: 'grok_heavy_x', name: 'Grok w/ X', vote: 'NO', confidence: 75, reasoning: 'Authoritarian regimes show remarkable stability' },
    { id: 'grok_heavy', name: 'Grok 4.1 Fast (Reasoning)', vote: 'NO', confidence: 72, reasoning: 'Opposition lacks coordination for ouster' },
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

const X_TWEETS: Record<string, XTweet[]> = {
  'pres-winner-28': [
    { id: '1', author: 'Nate Silver', handle: '@NateSilver538', avatar: '📊', content: 'Early polling shows Vance with surprising crossover appeal among independents. The "new generation" messaging is testing well in focus groups.', timestamp: '2h', likes: '4.2K', retweets: '892', sentiment: 'bullish' },
    { id: '2', author: 'Political Insider', handle: '@PoliInsider', avatar: '🏛️', content: 'BREAKING: Major GOP donors signaling strong support for Vance 2028. Campaign infrastructure already being built in key swing states.', timestamp: '5h', likes: '2.8K', retweets: '645', sentiment: 'bullish' },
    { id: '3', author: 'Election Watch', handle: '@ElectionWatch24', avatar: '🗳️', content: 'Unpopular take: 2028 is wide open. Vance has baggage that hasnt been tested in a general. Too early to call this.', timestamp: '8h', likes: '1.1K', retweets: '234', sentiment: 'bearish' },
  ],
  'fed-nominee': [
    { id: '1', author: 'WSJ Markets', handle: '@WSJMarkets', avatar: '📈', content: 'Sources close to the transition team confirm Kevin Hassett remains the frontrunner for Fed Chair nomination. Announcement expected within weeks.', timestamp: '1h', likes: '5.6K', retweets: '1.2K', sentiment: 'bullish' },
    { id: '2', author: 'Fed Watcher', handle: '@FedWatcher', avatar: '🏦', content: 'Hassett aligns perfectly with the administration economic agenda. His past experience at CEA makes him a natural fit.', timestamp: '3h', likes: '2.1K', retweets: '456', sentiment: 'bullish' },
    { id: '3', author: 'Econ Analyst', handle: '@EconAnalyst', avatar: '💹', content: 'Market pricing Hassett at 75% seems right. Senate confirmation should be straightforward given current composition.', timestamp: '6h', likes: '1.8K', retweets: '312', sentiment: 'bullish' },
  ],
  'dem-nom-28': [
    { id: '1', author: 'CA Politics', handle: '@CAPolitics', avatar: '🌴', content: 'Newsoms national favorability rising. Recent tour of swing states generating significant media coverage and donor interest.', timestamp: '2h', likes: '3.4K', retweets: '678', sentiment: 'bullish' },
    { id: '2', author: 'Dem Strategist', handle: '@DemStrategy', avatar: '🔵', content: 'The 2028 primary field is CROWDED. At least 8 serious candidates expected. Newsom has advantages but no lock.', timestamp: '4h', likes: '2.2K', retweets: '445', sentiment: 'bearish' },
    { id: '3', author: 'Primary Watch', handle: '@PrimaryWatch28', avatar: '📋', content: 'Early state organizing: Newsom already has staff in IA, NH, SC. Running circles around potential competitors.', timestamp: '7h', likes: '1.5K', retweets: '289', sentiment: 'bullish' },
  ],
  'cabinet-exit': [
    { id: '1', author: 'DC Insider', handle: '@DCInsider', avatar: '🏛️', content: 'Hegseth facing intensifying scrutiny. Multiple sources say internal tensions are growing. Watch this space.', timestamp: '1h', likes: '4.8K', retweets: '1.1K', sentiment: 'bullish' },
    { id: '2', author: 'Cabinet Watch', handle: '@CabinetWatch', avatar: '👔', content: 'Historical data: first cabinet departures typically happen in months 8-14. Were entering that window now.', timestamp: '3h', likes: '1.9K', retweets: '367', sentiment: 'bullish' },
    { id: '3', author: 'WH Correspondent', handle: '@WHCorrespondent', avatar: '📰', content: 'Despite media speculation, Hegseth has strong support from key allies. Premature to count him out.', timestamp: '5h', likes: '2.3K', retweets: '445', sentiment: 'bearish' },
  ],
  'house-2026': [
    { id: '1', author: 'Cook Political', handle: '@CookPolitical', avatar: '🗳️', content: 'Midterm fundamentals heavily favor Democrats. Historical patterns suggest 25-35 seat swing is baseline expectation.', timestamp: '2h', likes: '6.2K', retweets: '1.4K', sentiment: 'bullish' },
    { id: '2', author: 'Redistrict Watch', handle: '@RedistrictWatch', avatar: '🗺️', content: 'New maps favor Dems in MI, PA, NC. Net pickup of 8-12 seats from redistricting alone before we even look at swing seats.', timestamp: '4h', likes: '3.1K', retweets: '678', sentiment: 'bullish' },
    { id: '3', author: 'House Forecast', handle: '@HouseForecast26', avatar: '📊', content: 'Current model: Dems 72% to win House. Economic conditions and presidential approval will be key drivers.', timestamp: '6h', likes: '2.8K', retweets: '534', sentiment: 'bullish' },
  ],
  'world-leader-exit': [
    { id: '1', author: 'LatAm Analyst', handle: '@LatAmAnalyst', avatar: '🌎', content: 'Maduro has survived everything thrown at him. Opposition fragmented, military loyal, oil revenue stabilizing. Not going anywhere.', timestamp: '2h', likes: '3.2K', retweets: '567', sentiment: 'bearish' },
    { id: '2', author: 'Venezuela Watch', handle: '@VenezuelaWatch', avatar: '🇻🇪', content: 'Despite international pressure, regime remains stable. No credible internal threat to Maduros position visible.', timestamp: '4h', likes: '2.4K', retweets: '412', sentiment: 'bearish' },
    { id: '3', author: 'Geopolitics Now', handle: '@GeopoliticsNow', avatar: '🌐', content: 'Wild card: new US sanctions could destabilize. But even then, regime change timeline would extend well beyond year end.', timestamp: '7h', likes: '1.8K', retweets: '298', sentiment: 'bearish' },
  ],
};

const ModelIcon = ({ id, className }: { id: string; className?: string }) => {
  // Handle both backend and frontend model IDs
  switch (id) {
    // Backend IDs (used in analyze page)
    case 'grok-beta': return <GrokIcon className={className} />;
    case 'grok-beta-x': return <GrokIcon className={className} />;
    case 'gpt-5.1': return <OpenAIIcon className={className} />;
    case 'anthropic/claude-opus-4-5-20251101': return <ClaudeIcon className={className} />;
    case 'gemini/gemini-3-pro': return <GeminiIcon className={className} />;
    // Frontend IDs (used in dashboard)
    case 'grok_heavy_x': return <GrokIcon className={className} />;
    case 'grok_heavy': return <GrokIcon className={className} />;
    case 'gemini_pro': return <GeminiIcon className={className} />;
    case 'claude_opus': return <ClaudeIcon className={className} />;
    case 'gpt_5': return <OpenAIIcon className={className} />;
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

function ConsensusPanel({ market, votes, tweets, twitterMetrics, isAnalyzing }: { market: Market; votes: ModelVote[]; tweets: XTweet[]; twitterMetrics?: TwitterMetrics | null; isAnalyzing?: boolean }) {
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
            {market.url && (
              <a 
                href={market.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="View on Kalshi"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">{market.title}</h2>
          <p className="text-sm text-slate-400">{MARKET_DEFINITIONS[market.id]}</p>
        </div>

        <div className={cn(
          "rounded-xl p-6 border-2 relative",
          analysis.recommendation === 'YES' 
            ? "bg-gradient-to-br from-emerald-950/50 to-slate-900 border-emerald-500/40" 
            : "bg-gradient-to-br from-rose-950/50 to-slate-900 border-rose-500/40"
        )}>
          {isAnalyzing && (
            <div className="absolute inset-0 bg-slate-900/80 rounded-xl flex items-center justify-center z-10">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto mb-2"></div>
                <div className="text-sm text-slate-400">Analyzing with LLMs...</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <Activity className={cn(
              "w-5 h-5",
              analysis.recommendation === 'YES' ? "text-emerald-400" : "text-rose-400"
            )} />
            <span className="text-sm font-semibold text-slate-300">TruthBench Consensus</span>
            {!isAnalyzing && votes.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 ml-auto">
                LIVE AI ANALYSIS
              </Badge>
            )}
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
                <span className="text-xs text-slate-300 flex-1 truncate">{vote.id === 'grok_heavy_x' ? 'Grok w/ X' : vote.name.split(' ')[0]}</span>
                {vote.vote === 'YES' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">X Feed</span>
            <Badge variant="outline" className="text-[10px] bg-slate-800 border-slate-700 text-slate-500">
              @X
            </Badge>
            {twitterMetrics && (
              <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                {twitterMetrics.total_tweets || 0} tweets • {twitterMetrics.tweets_last_24h || 0} last 24h
              </Badge>
            )}
          </div>
          
          {/* Twitter Metrics Dashboard */}
          {twitterMetrics && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              {/* Volume Metrics */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Tweet Volume</div>
                <div className="text-lg font-bold text-slate-200">{(twitterMetrics.total_tweets || 0).toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {twitterMetrics.tweets_last_hour || 0} in last hour
                </div>
              </div>
              
              {/* Velocity */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Velocity (24h)</div>
                <div className="text-lg font-bold text-slate-200">{(twitterMetrics.tweet_velocity_24h || 0).toFixed(1)}/hr</div>
                <div className={cn(
                  "text-xs mt-1 flex items-center gap-1",
                  (twitterMetrics.velocity_change || 0) > 0 ? "text-emerald-400" : "text-rose-400"
                )}>
                  {(twitterMetrics.velocity_change || 0) > 0 ? "↗" : "↘"} {Math.abs(twitterMetrics.velocity_change || 0).toFixed(1)}x vs 7d avg
                </div>
              </div>
              
              {/* Engagement */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Engagement Rate</div>
                <div className="text-lg font-bold text-slate-200">{((twitterMetrics.avg_engagement_rate || 0) * 100).toFixed(2)}%</div>
                <div className="text-xs text-slate-400 mt-1">
                  {(twitterMetrics.total_likes || 0).toLocaleString()} likes • {(twitterMetrics.total_retweets || 0).toLocaleString()} RTs
                </div>
              </div>
              
              {/* Audience Quality */}
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="text-xs text-slate-500 mb-1">Audience Quality</div>
                <div className="text-lg font-bold text-slate-200">{twitterMetrics.verified_user_tweets || 0}</div>
                <div className="text-xs text-slate-400 mt-1">
                  verified • {(twitterMetrics.unique_authors || 0).toLocaleString()} unique authors
                </div>
              </div>
              
              {/* Top Hashtags */}
              {twitterMetrics.top_hashtags && twitterMetrics.top_hashtags.length > 0 && (
                <div className="col-span-2 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                  <div className="text-xs text-slate-500 mb-2">Trending Hashtags</div>
                  <div className="flex flex-wrap gap-1">
                    {twitterMetrics.top_hashtags.slice(0, 5).map((tag) => (
                      <Badge key={tag.tag} variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                        #{tag.tag} ({tag.count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {/* News Mentions */}
              {twitterMetrics.news_domain_mentions && Object.keys(twitterMetrics.news_domain_mentions).length > 0 && (
                <div className="col-span-2 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                  <div className="text-xs text-slate-500 mb-2">News Sources Mentioned</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(twitterMetrics.news_domain_mentions).slice(0, 5).map(([domain, count]) => (
                      <Badge key={domain} variant="outline" className="text-[10px] bg-slate-700 text-slate-300 border-slate-600">
                        {domain} ({count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Top Tweets */}
          {twitterMetrics && twitterMetrics.top_tweets && twitterMetrics.top_tweets.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Top Tweets</div>
            </div>
          )}
          
          <div className="space-y-3">
            {twitterMetrics && twitterMetrics.top_tweets && twitterMetrics.top_tweets.length > 0 ? (
              // Use real Twitter data
              twitterMetrics.top_tweets.slice(0, 3).map(tweet => (
                <div 
                  key={tweet.id}
                  className={cn(
                    "p-4 rounded-lg bg-slate-900/80 border border-blue-500/30"
                  )}
                  data-testid={`tweet-card-${tweet.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{tweet.author_verified ? '✓' : '👤'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-slate-200">@{tweet.author_username}</span>
                        {tweet.author_verified && (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                            Verified
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">{tweet.author_followers.toLocaleString()} followers</span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed mb-2">{tweet.text}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>❤️ {tweet.engagement.likes.toLocaleString()}</span>
                        <span>🔁 {tweet.engagement.retweets.toLocaleString()}</span>
                        <span>💬 {tweet.engagement.replies.toLocaleString()}</span>
                        <a 
                          href={tweet.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="ml-auto text-blue-400 hover:text-blue-300"
                        >
                          View →
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : tweets && tweets.length > 0 ? (
              // Fallback to hardcoded tweets if no Twitter data
              tweets.map(tweet => (
              <div 
                key={tweet.id}
                className={cn(
                  "p-4 rounded-lg bg-slate-900/80 border",
                  tweet.sentiment === 'bullish' 
                    ? "border-emerald-500/30" 
                    : "border-rose-500/30"
                )}
                data-testid={`tweet-card-${tweet.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{tweet.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-slate-200">{tweet.author}</span>
                      <span className="text-xs text-slate-500">{tweet.handle}</span>
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-xs text-slate-500">{tweet.timestamp}</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed mb-2">{tweet.content}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>❤️ {tweet.likes}</span>
                      <span>🔁 {tweet.retweets}</span>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] ml-auto",
                          tweet.sentiment === 'bullish' 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        )}
                      >
                        {tweet.sentiment.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))
            ) : (
              <div className="text-center text-slate-400 py-8">
                No tweets available
              </div>
            )}
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
  const [markets, setMarkets] = useState<Market[]>(MARKETS);
  const [loading, setLoading] = useState(true);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('pres-winner-28');
  const [twitterData, setTwitterData] = useState<Record<string, TwitterMetrics>>({});
  const [seriesTickerMap, setSeriesTickerMap] = useState<Record<string, string>>({});

  // Fetch Kalshi feed data on component mount
  useEffect(() => {
    async function fetchKalshiData() {
      try {
        setLoading(true);
        const feedData = await getKalshiFeed(10);
        
        // Extract events from the response
        const events = feedData.kalshi_feed?.feed || feedData.feed || [];
        const twitterAug = feedData.twitter_augmentation || {};
        
        // Build Twitter data map by series_ticker
        const twitterMap: Record<string, TwitterMetrics> = {};
        const tickerMap: Record<string, string> = {};
        
        Object.entries(twitterAug).forEach(([seriesTicker, data]: [string, any]) => {
          twitterMap[seriesTicker] = data.twitter_metrics;
        });
        
        if (Array.isArray(events)) {
          const transformedMarkets: Market[] = events
            .filter(event => event.markets && event.markets.length > 0)
            .map((event, index) => {
              const market = event.markets![0]; // Use first market for display
              const ticker = market.ticker || event.event_ticker || `MARKET-${index}`;
              const seriesTicker = event.series_ticker || event.event_ticker || '';
              
              // Map market ID to series ticker for Twitter data lookup
              tickerMap[ticker.toLowerCase()] = seriesTicker;
              
              const eventTicker = event.event_ticker || event.series_ticker || '';
              
              // Extract ALL outcomes for multivariate markets
              const allOutcomes: MarketOutcome[] = event.markets!.map((m: any) => ({
                label: m.yes_subtitle || 'Unknown',
                ticker: m.ticker || '',
                price: m.last_price || 50,
              }));
              
              return {
                id: ticker.toLowerCase(),
                tag: event.category || 'General',
                ticker: ticker,
                title: event.event_title || 'Untitled Market',
                yesLabel: market.yes_subtitle || 'YES',
                yesPrice: market.last_price || 50,
                noPrice: 100 - (market.last_price || 50),
                volume: event.total_volume 
                  ? `$${(event.total_volume / 1000000).toFixed(1)}M` 
                  : '$0M',
                url: eventTicker ? `https://kalshi.com/events/${eventTicker}` : undefined,
                eventTicker: eventTicker,
                allOutcomes: allOutcomes,  // Store all outcomes
              };
            });
          
          if (transformedMarkets.length > 0) {
            setMarkets(transformedMarkets);
            setTwitterData(twitterMap);
            setSeriesTickerMap(tickerMap);
            setSelectedMarketId(transformedMarkets[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch Kalshi data:', error);
        // Keep using hardcoded MARKETS as fallback
      } finally {
        setLoading(false);
      }
    }

    fetchKalshiData();
  }, []);
  
  const selectedMarket = markets.find(m => m.id === selectedMarketId)!;
  
  // Get Twitter data for selected market
  const seriesTicker = seriesTickerMap[selectedMarketId];
  const selectedTwitter = seriesTicker ? twitterData[seriesTicker] : null;
  
  // Fetch LLM predictions for selected market
  const { data: analysisData, isLoading: isAnalyzing } = useQuery({
    queryKey: ['marketAnalysis', selectedMarketId, selectedMarket?.title],
    queryFn: async () => {
      if (!selectedMarket) return null;
      
      // Use all outcomes if available (multivariate market), otherwise create single outcome
      const outcomes = selectedMarket.allOutcomes && selectedMarket.allOutcomes.length > 0
        ? selectedMarket.allOutcomes.map(o => ({
            label: o.label,
            current_price: o.price,
            ticker: o.ticker,
          }))
        : [{
            label: selectedMarket.yesLabel,
            current_price: selectedMarket.yesPrice,
            ticker: selectedMarket.ticker,
          }];
      
      return analyzeMarket({
        market_title: selectedMarket.title,
        outcomes: outcomes,
        twitter_metrics: selectedTwitter,
      });
    },
    enabled: !!selectedMarket,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });
  
  // Convert predictions to ModelVote format
  const selectedVotes: ModelVote[] = analysisData?.predictions.map((pred: ModelPrediction) => ({
    id: pred.model_id,
    name: pred.name,
    vote: pred.vote,
    confidence: pred.confidence,
    reasoning: pred.reasoning,
  })) || MODEL_VOTES[selectedMarketId] || [];

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
            {loading ? (
              <div className="text-center text-slate-400 py-8">
                Loading markets...
              </div>
            ) : (
              markets.map(market => (
                <MarketCard 
                  key={market.id}
                  market={market}
                  isSelected={market.id === selectedMarketId}
                  onClick={() => setSelectedMarketId(market.id)}
                />
              ))
            )}
          </div>
        </aside>

        <main className="flex-1 p-6 flex flex-col min-h-0">
          <ConsensusPanel 
            market={selectedMarket} 
            votes={selectedVotes} 
            tweets={X_TWEETS[selectedMarketId] || []}
            twitterMetrics={selectedTwitter}
            isAnalyzing={isAnalyzing}
          />
        </main>
      </div>
    </div>
  );
}
