import { storage } from "./storage";
import type { Model } from "@shared/schema";
import { RiskEngine, RISK_PARAMS, type Position, type ModelPortfolio } from "./riskEngine";

export type ModelId = 'grok_heavy_x' | 'grok_heavy' | 'gemini_pro' | 'claude_opus' | 'gpt_5';

export const INITIAL_CAPITAL = 10000;
const LLM_SERVICE_URL = 'http://localhost:8000';

// Environment variable to toggle between real and simulated trading
const USE_SIMULATED_TRADING = process.env.USE_SIMULATED_TRADING === 'true';

// Global portfolio state
const modelPortfolios: Map<ModelId, ModelPortfolio> = new Map();

// Market data cache
let cachedMarkets: any[] = [];
let lastMarketFetch = 0;
const MARKET_FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const MODELS_CONFIG: Record<ModelId, { 
  id: ModelId;
  name: string;
  color: string;
  avatar: string;
  riskFactor: number;
  description: string;
}> = {
  grok_heavy_x: {
    id: 'grok_heavy_x',
    name: 'Grok w/ X',
    color: 'hsl(var(--color-model-grok-x))',
    avatar: '🌌',
    riskFactor: 0.9,
    description: 'X-integrated super-intelligence with real-time data access.'
  },
  grok_heavy: {
    id: 'grok_heavy',
    name: 'Grok 4.1 Fast (Reasoning)',
    color: 'hsl(var(--color-model-grok))',
    avatar: '🌑',
    riskFactor: 0.85,
    description: 'Fast reasoning model with advanced inference capabilities.'
  },
  gemini_pro: {
    id: 'gemini_pro',
    name: 'Gemini 3 Pro',
    color: 'hsl(var(--color-model-gemini))',
    avatar: '✨',
    riskFactor: 0.6,
    description: 'Multimodal expert with Google Search grounding.'
  },
  claude_opus: {
    id: 'claude_opus',
    name: 'Claude Opus 4.5',
    color: 'hsl(var(--color-model-claude))',
    avatar: '🧠',
    riskFactor: 0.4,
    description: 'High-safety, constitutional AI with long context.'
  },
  gpt_5: {
    id: 'gpt_5',
    name: 'GPT-5.1',
    color: 'hsl(var(--color-model-gpt))',
    avatar: '🤖',
    riskFactor: 0.5,
    description: 'General purpose reasoning engine.'
  }
};

/**
 * Initialize portfolios for all models
 */
export async function initializePortfolios() {
  const modelIds: ModelId[] = ['grok_heavy_x', 'grok_heavy', 'gemini_pro', 'claude_opus', 'gpt_5'];
  
  // Ensure models exist in database
  for (const modelId of modelIds) {
    const existing = await storage.getModel(modelId);
    if (!existing) {
      const config = MODELS_CONFIG[modelId];
      const startTime = Date.now() - 1000 * 60 * 60 * 24;
      const history = Array.from({ length: 24 }, (_, i) => ({
        time: startTime + i * 1000 * 60 * 60,
        value: INITIAL_CAPITAL
      }));
      
      await storage.createOrUpdateModel({
        id: modelId,
        name: config.name,
        color: config.color,
        avatar: config.avatar,
        currentValue: INITIAL_CAPITAL,
        riskFactor: config.riskFactor,
        description: config.description,
        history: JSON.stringify(history),
      });
      
      console.log(`[Trading] Created model ${modelId} in database`);
    }
  }
  
  // Initialize in-memory portfolios
  for (const modelId of modelIds) {
    if (!modelPortfolios.has(modelId)) {
      const startTime = Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago
      modelPortfolios.set(modelId, {
        modelId,
        cash: INITIAL_CAPITAL,
        positions: new Map(),
        totalValue: INITIAL_CAPITAL,
        peakValue: INITIAL_CAPITAL,
        tradesThisSession: 0,
        history: Array.from({ length: 24 }, (_, i) => ({
          time: startTime + i * 1000 * 60 * 60,
          value: INITIAL_CAPITAL
        }))
      });
    }
  }
  
  console.log('[Trading] Portfolios initialized for all models');
  
  // Create initial status event for the feed
  try {
    await storage.createEvent({
      modelId: 'grok_heavy_x',
      market: 'Live Trading System',
      action: 'Hold',
      comment: '🚀 Truth Bench trading simulation started. Models will analyze live Kalshi markets and execute trades based on LLM predictions. First trading cycle in 10 seconds...',
      profit: 0,
    });
  } catch (error) {
    console.log('[Trading] Could not create startup event (database may not be ready yet)');
  }
}

/**
 * Fetch live markets from Kalshi via our Python backend
 */
async function fetchLiveMarkets(): Promise<any[]> {
  try {
    const now = Date.now();
    
    // Use cache if recent
    if (cachedMarkets.length > 0 && (now - lastMarketFetch) < MARKET_FETCH_INTERVAL) {
      return cachedMarkets;
    }
    
    console.log('[Trading] Fetching live markets from Kalshi...');
    const response = await fetch(`${LLM_SERVICE_URL}/api/kalshi/feed?limit=10&use_cache=true`);
    
    if (!response.ok) {
      console.error('[Trading] Failed to fetch markets:', response.status);
      return cachedMarkets; // Return cached data
    }
    
    const data = await response.json();
    const events = data.kalshi_feed?.feed || data.feed || [];
    
    // Transform to market format
    const markets = events
      .filter((event: any) => event.markets && event.markets.length > 0)
      .slice(0, 5)  // Limit to 5 most liquid markets
      .map((event: any) => {
        const market = event.markets[0]; // Use first market
        
        // Parse close time
        let closeTime: Date | undefined;
        if (market.close_time || event.close_time) {
          closeTime = new Date(market.close_time || event.close_time);
        }
        
        return {
          ticker: market.ticker || event.event_ticker || '',
          title: event.event_title || 'Unknown Market',
          category: event.category || 'General',
          yesPrice: market.last_price || 50,
          noPrice: 100 - (market.last_price || 50),
          volume: event.total_volume || 0,
          seriesTicker: event.series_ticker || event.event_ticker,
          twitterMetrics: data.twitter_augmentation?.[event.series_ticker]?.twitter_metrics,
          closeTime
        };
      });
    
    if (markets.length > 0) {
      cachedMarkets = markets;
      lastMarketFetch = now;
      console.log(`[Trading] Fetched ${markets.length} markets`);
    }
    
    return markets;
  } catch (error) {
    console.error('[Trading] Error fetching markets:', error);
    return cachedMarkets;
  }
}

/**
 * Get LLM prediction for a specific market
 */
async function getLLMPrediction(market: any, modelId: ModelId): Promise<{ vote: 'YES' | 'NO', confidence: number, reasoning: string } | null> {
  try {
    const response = await fetch(`${LLM_SERVICE_URL}/api/kalshi/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market_title: market.title,
        outcomes: [{
          label: 'YES',
          current_price: market.yesPrice,
          ticker: market.ticker
        }],
        twitter_metrics: market.twitterMetrics || null
      })
    });
    
    if (!response.ok) {
      console.error(`[Trading] LLM analysis failed for ${modelId}:`, response.status);
      return null;
    }
    
    const analysis = await response.json();
    
    // Map our model IDs to the ones used in the analysis
    const modelIdMap: Record<ModelId, string> = {
      'grok_heavy_x': 'grok-beta-x',
      'grok_heavy': 'grok-beta',
      'gemini_pro': 'gemini/gemini-3-pro',
      'claude_opus': 'anthropic/claude-opus-4-5-20251101',
      'gpt_5': 'gpt-5.1'
    };
    
    const prediction = analysis.predictions?.find((p: any) => p.model_id === modelIdMap[modelId]);
    
    if (!prediction) {
      console.error(`[Trading] No prediction found for model ${modelId}`);
      return null;
    }
    
    return {
      vote: prediction.vote,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning
    };
  } catch (error) {
    console.error(`[Trading] Error getting LLM prediction for ${modelId}:`, error);
    return null;
  }
}

/**
 * Fetch current prices for specific market tickers (for positions we hold)
 */
async function fetchMarketsByTickers(tickers: string[]): Promise<any[]> {
  if (tickers.length === 0) return [];
  
  try {
    const response = await fetch(`${LLM_SERVICE_URL}/api/kalshi/markets/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers })
    });
    
    if (!response.ok) {
      console.error('[Trading] Failed to fetch markets by tickers:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.markets || [];
  } catch (error) {
    console.error('[Trading] Error fetching markets by tickers:', error);
    return [];
  }
}

/**
 * Calculate portfolio value including open positions
 */
async function calculatePortfolioValue(
  portfolio: ModelPortfolio, 
  feedMarkets: any[]
): Promise<number> {
  let value = portfolio.cash;
  
  // Get list of tickers we need to price
  const positionTickers = Array.from(portfolio.positions.keys());
  
  if (positionTickers.length === 0) {
    return value; // No positions, just cash
  }
  
  // First try to find prices in the feed markets (fast, from cache)
  const feedTickerSet = new Set(feedMarkets.map(m => m.ticker));
  const tickersNotInFeed = positionTickers.filter(t => !feedTickerSet.has(t));
  
  // Fetch specific markets for positions not in feed
  let specificMarkets: any[] = [];
  if (tickersNotInFeed.length > 0) {
    console.log(`[Portfolio] Fetching ${tickersNotInFeed.length} specific markets for positions...`);
    specificMarkets = await fetchMarketsByTickers(tickersNotInFeed);
  }
  
  // Combine feed markets and specific markets
  const allMarkets = [...feedMarkets, ...specificMarkets];
  
  // Add value of open positions based on current market prices
  for (const [ticker, position] of Array.from(portfolio.positions.entries())) {
    const market = allMarkets.find(m => m.ticker === ticker);
    if (market) {
      const currentPrice = (position.side === 'YES' ? market.last_price : (100 - market.last_price)) / 100;
      value += position.contracts * currentPrice;
    } else {
      // Market not found (maybe settled/closed), use entry price as fallback
      console.warn(`[Portfolio] Market ${ticker} not found, using entry price`);
      value += position.contracts * position.entryPrice;
    }
  }
  
  return value;
}

/**
 * Execute a trade for a model using risk engine
 */
async function executeTrade(
  modelId: ModelId,
  market: any,
  action: 'BUY' | 'SELL' | 'HOLD',
  side: 'YES' | 'NO',
  confidence: number,
  reasoning: string
): Promise<void> {
  const portfolio = modelPortfolios.get(modelId);
  if (!portfolio) return;
  
  const ticker = market.ticker;
  const existingPosition = portfolio.positions.get(ticker);
  
  // BUY logic with risk checks
  if (action === 'BUY' && !existingPosition) {
    // Check confidence threshold
    if (!RiskEngine.isConfidenceSufficient(confidence, 'BUY')) {
      console.log(`[Trading] ${modelId} skipping ${ticker} - low confidence (${confidence}% < ${RISK_PARAMS.MIN_CONFIDENCE_TO_BUY}%)`);
      return;
    }
    
    const price = (side === 'YES' ? market.yesPrice : market.noPrice) / 100;
    const contracts = RISK_PARAMS.POSITION_SIZE_CONTRACTS;
    const cost = RiskEngine.calculatePositionCost(price, contracts);
    
    // Run risk checks
    const riskCheck = RiskEngine.canOpenPosition(portfolio, ticker, cost);
    if (!riskCheck.allowed) {
      console.log(`[Trading] ${modelId} BLOCKED from buying ${ticker}: ${riskCheck.reason}`);
      return;
    }
    
    // Execute buy
    portfolio.cash -= cost;
    portfolio.positions.set(ticker, {
      marketTicker: ticker,
      marketTitle: market.title,
      side,
      contracts,
      entryPrice: price,
      cost,
      timestamp: new Date(),
      closeTime: market.closeTime
    });
    
    portfolio.tradesThisSession++;
    
    console.log(`\n💵 [TRADE EXECUTED] ${modelId} BOUGHT ${contracts} ${side} contracts`);
    console.log(`   Market: ${market.title}`);
    console.log(`   Entry Price: ${(price * 100).toFixed(1)}¢ ($${price.toFixed(3)}/contract)`);
    console.log(`   Total Cost: $${cost.toFixed(2)}`);
    console.log(`   Confidence: ${confidence}%`);
    console.log(`   Reasoning: ${reasoning.slice(0, 100)}...`);
    console.log(`   Cash Remaining: $${portfolio.cash.toFixed(2)}\n`);
    
    // Create market event with real LLM reasoning
    await storage.createEvent({
      modelId,
      market: market.title,
      action: 'Buy',
      comment: `Buying ${side} @ ${(price * 100).toFixed(1)}¢ | ${reasoning.slice(0, 120)}... [${confidence}% conf]`,
      profit: 0,
    });
  }
  
  // SELL logic with risk checks
  else if (action === 'SELL' && existingPosition) {
    const currentPrice = (existingPosition.side === 'YES' ? market.yesPrice : market.noPrice) / 100;
    const proceeds = RiskEngine.calculatePositionProceeds(currentPrice, existingPosition.contracts);
    const profit = proceeds - existingPosition.cost;
    
    // Execute sell
    portfolio.cash += proceeds;
    portfolio.positions.delete(ticker);
    portfolio.tradesThisSession++;
    const profitPct = (profit / existingPosition.cost) * 100;
    
    console.log(`\n💰 [TRADE EXECUTED] ${modelId} SOLD ${existingPosition.contracts} ${existingPosition.side} contracts`);
    console.log(`   Market: ${market.title}`);
    console.log(`   Exit Price: ${(currentPrice * 100).toFixed(1)}¢ ($${currentPrice.toFixed(3)}/contract)`);
    console.log(`   Proceeds: $${proceeds.toFixed(2)}`);
    console.log(`   Profit/Loss: $${profit.toFixed(2)} (${profitPct > 0 ? '+' : ''}${profitPct.toFixed(1)}%)`);
    console.log(`   Confidence: ${confidence}%`);
    console.log(`   Reasoning: ${reasoning.slice(0, 100)}...`);
    console.log(`   Cash Now: $${portfolio.cash.toFixed(2)}\n`);
    
    // Create market event with real LLM reasoning
    await storage.createEvent({
      modelId,
      market: market.title,
      action: 'Sell',
      comment: `Selling ${existingPosition.side} @ ${(currentPrice * 100).toFixed(1)}¢ | ${reasoning.slice(0, 100)}... [${profitPct > 0 ? '+' : ''}${profitPct.toFixed(1)}% P&L]`,
      profit,
    });
  }
  
  // HOLD logic - create event for transparency
  else if (action === 'HOLD' && existingPosition) {
    console.log(`[Trading] ${modelId} HOLD on ${ticker} (${confidence}% confidence)`);
    
    // Log hold decision to feed
    await storage.createEvent({
      modelId,
      market: market.title,
      action: 'Hold',
      comment: `Holding ${existingPosition.side} position. ${reasoning.slice(0, 130)}... [${confidence}% conf]`,
      profit: 0,
    });
  }
}

/**
 * Process one model's trading logic
 */
async function processModelTrading(modelId: ModelId, portfolio: ModelPortfolio, markets: any[]): Promise<void> {
      // Step 1: Auto-close expired markets
      const expiredPositions = RiskEngine.getExpiredPositions(portfolio);
      for (const position of expiredPositions) {
        const market = markets.find(m => m.ticker === position.marketTicker);
        if (market) {
          console.log(`[Trading] ${modelId} auto-closing expired position in ${position.marketTicker}`);
          await executeTrade(
            modelId,
            market,
            'SELL',
            position.side,
            0,  // Forced close, confidence irrelevant
            'Market expired - auto-closed'
          );
        }
      }
      
      // Step 2: Check existing positions for exit signals
      for (const [ticker, position] of Array.from(portfolio.positions.entries())) {
        const market = markets.find(m => m.ticker === ticker);
        if (market) {
          const currentPrice = (position.side === 'YES' ? market.yesPrice : market.noPrice) / 100;
          const prediction = await getLLMPrediction(market, modelId);
          
          if (prediction) {
            // Check if we should close using risk engine
            const { shouldClose, reason } = RiskEngine.shouldClosePosition(
              position,
              currentPrice,
              prediction.confidence,
              market.closeTime
            );
            
            if (shouldClose) {
              console.log(`[Trading] ${modelId} closing ${ticker}: ${reason}`);
              await executeTrade(modelId, market, 'SELL', position.side, prediction.confidence, reason);
            }
          }
        }
      }
      
      // Step 3: Find best market to trade (can have unlimited positions, just max 1 per market)
      // Only analyze top 2 markets to reduce LLM calls
      let bestMarket = null;
      let bestPrediction = null;
      let bestConfidence = 0;
      
      const marketsToAnalyze = markets.filter(m => !portfolio.positions.has(m.ticker)).slice(0, 2);
      
      for (const market of marketsToAnalyze) {
        const prediction = await getLLMPrediction(market, modelId);
        if (prediction && prediction.confidence > bestConfidence) {
          bestConfidence = prediction.confidence;
          bestMarket = market;
          bestPrediction = prediction;
        }
      }
      
      // Execute trade if found good opportunity
      if (bestMarket && bestPrediction && bestConfidence >= 60) {
        await executeTrade(
          modelId,
          bestMarket,
          'BUY',
          bestPrediction.vote,
          bestPrediction.confidence,
          bestPrediction.reasoning
        );
      } else {
        console.log(`[Trading] ${modelId} no good opportunities (best confidence: ${bestConfidence}%)`);
      }
}

/**
 * Simulated trading cycle - random walk for testing UI updates
 */
async function runSimulatedTradingCycle(): Promise<void> {
  try {
    console.log('[Simulated Trading] Running simulated cycle...');
    const now = Date.now();
    
    for (const [modelId, portfolio] of Array.from(modelPortfolios.entries())) {
      // Random walk: -2% to +2% change
      const changePercent = (Math.random() * 4 - 2) / 100;
      const newValue = portfolio.totalValue * (1 + changePercent);
      
      portfolio.totalValue = newValue;
      portfolio.history.push({ time: now, value: newValue });
      portfolio.history = portfolio.history.slice(-50);
      
      await storage.updateModel(modelId, {
        currentValue: newValue,
        history: JSON.stringify(portfolio.history),
      });
      
      console.log(`[Simulated] ${modelId}: $${newValue.toFixed(2)} (${changePercent > 0 ? '+' : ''}${(changePercent * 100).toFixed(2)}%)`);
    }
    
    console.log('[Simulated Trading] ✅ Cycle complete\n');
  } catch (error) {
    console.error('[Simulated Trading] Error:', error);
  }
}

/**
 * Run trading cycle for all models (IN PARALLEL!)
 */
export async function runTradingCycle(): Promise<void> {
  // Use simulated mode if flag is set
  if (USE_SIMULATED_TRADING) {
    return runSimulatedTradingCycle();
  }
  
  try {
    console.log('[Trading] Starting trading cycle...');
    
    // Fetch current markets
    const markets = await fetchLiveMarkets();
    
    if (markets.length === 0) {
      console.log('[Trading] No markets available, skipping cycle');
      return;
    }
    
    // Process all models IN PARALLEL for 5x speedup!
    console.log('[Trading] Processing all 5 models in parallel...');
    const modelPromises = Array.from(modelPortfolios.entries()).map(([modelId, portfolio]) =>
      processModelTrading(modelId, portfolio, markets)
    );
    
    await Promise.all(modelPromises);
    console.log('[Trading] All models processed!');
    
    // Update portfolio values in database
    const now = Date.now();
    console.log('\n📊 PORTFOLIO SUMMARY:');
    console.log('─'.repeat(80));
    
    for (const [modelId, portfolio] of Array.from(modelPortfolios.entries())) {
      portfolio.totalValue = await calculatePortfolioValue(portfolio, markets);
      RiskEngine.updatePeakValue(portfolio);  // Track peak for drawdown
      portfolio.history.push({ time: now, value: portfolio.totalValue });
      portfolio.history = portfolio.history.slice(-50); // Keep last 50 datapoints
      
      await storage.updateModel(modelId, {
        currentValue: portfolio.totalValue,
        history: JSON.stringify(portfolio.history),
      });
      
      // Log risk metrics
      const metrics = RiskEngine.getRiskMetrics(portfolio);
      const returnPct = ((portfolio.totalValue - 10000) / 10000) * 100;
      console.log(`${modelId.padEnd(15)} | $${portfolio.totalValue.toFixed(2).padStart(10)} | P&L: ${returnPct > 0 ? '+' : ''}${returnPct.toFixed(2)}% | Pos: ${metrics.numPositions} | Cash: ${metrics.cashReservePct.toFixed(0)}% | ${metrics.isHealthy ? '✅' : '⚠️'}`);
    }
    
    console.log('─'.repeat(80));
    console.log('✅ Trading cycle complete\n');
  } catch (error) {
    console.error('[Trading] Error in trading cycle:', error);
  }
}

/**
 * Update portfolio values based on current market prices (runs more frequently)
 */
export async function updatePortfolioValues(): Promise<void> {
  try {
    // In simulated mode, skip market fetch (no positions to price)
    if (USE_SIMULATED_TRADING) {
      return; // Simulated mode updates happen in runSimulatedTradingCycle
    }
    
    // Always fetch fresh market data for accurate mark-to-market
    const markets = await fetchLiveMarkets();
    const now = Date.now();
    
    for (const [modelId, portfolio] of Array.from(modelPortfolios.entries())) {
      const newValue = await calculatePortfolioValue(portfolio, markets);
      
      // Only update if value changed significantly (>0.1%) to reduce DB writes
      if (Math.abs(newValue - portfolio.totalValue) / portfolio.totalValue > 0.001) {
        portfolio.totalValue = newValue;
        RiskEngine.updatePeakValue(portfolio);  // Track peak for drawdown
        portfolio.history.push({ time: now, value: newValue });
        portfolio.history = portfolio.history.slice(-50);
        
        await storage.updateModel(modelId, {
          currentValue: newValue,
          history: JSON.stringify(portfolio.history),
        });
        
        console.log(`[Portfolio] ${modelId}: $${newValue.toFixed(2)} (${portfolio.positions.size} positions)`);
      }
    }
  } catch (error) {
    console.error('[Trading] Error updating portfolio values:', error);
  }
}

