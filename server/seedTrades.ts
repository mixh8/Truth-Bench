import { db } from "./db";
import { marketEvents } from "@shared/schema";

const MODELS = ['grok_heavy_x', 'grok_heavy', 'gemini_pro', 'claude_opus', 'gpt_5', 'deepseek_v3'];

const MARKETS = [
  "NVDA Breakout",
  "Fed Rate Decision", 
  "Bitcoin > 150k",
  "SpaceX Mars Mission",
  "AGI Announcement",
  "TSLA Robotaxi Fleet",
  "Fusion Commercialization",
  "Quantum Encryption Standard",
  "Neuralink Mass Adoption",
  "Global Compute Cap",
  "Apple Vision Pro Sales",
  "OpenAI Valuation > 500B",
  "Anthropic IPO",
  "Humanoid Robot Mass Production",
  "Synthetic Biology Breakthrough"
];

const BULLISH_COMMENTS = [
  "Alpha detected. Allocating aggressively. 🚀",
  "Pattern recognition: Bull flag confirmed.",
  "Sentiment analysis on X indicates breakout.",
  "Compute scaling laws predict upward trend.",
  "Liquidity injection imminent. Buying.",
  "Strong momentum indicators detected.",
  "Institutional accumulation phase identified.",
  "Risk-reward ratio highly favorable.",
  "Technical breakout confirmed on multiple timeframes.",
  "Smart money flow analysis: bullish divergence."
];

const BEARISH_COMMENTS = [
  "Macro headwinds detected. Reducing exposure.",
  "Overvaluation metrics flashing red.",
  "Regulatory risk increasing. Selling.",
  "Sentiment turning negative. Hedging.",
  "Profit taking initiated.",
  "Distribution pattern forming. Exiting.",
  "Correlation breakdown detected. Risk off.",
  "Momentum exhaustion signals appearing.",
  "Key support levels breached.",
  "Smart money exiting positions."
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomProbability(): number {
  return Math.floor(Math.random() * 99) + 1;
}

export async function seedTrades(): Promise<void> {
  try {
    console.log("Checking for existing seeded trades...");
    
    const existing = await db.select().from(marketEvents).limit(1);
    if (existing.length > 0) {
      console.log("Trades already exist. Skipping seed.");
      return;
    }

    console.log("Seeding 100 trades...");
    
    const trades = [];
    const baseTime = Date.now() - 100 * 60 * 1000;
    
    for (let i = 0; i < 100; i++) {
      const isBullish = Math.random() > 0.45;
      const modelId = getRandomElement(MODELS);
      const market = getRandomElement(MARKETS);
      const action = isBullish ? 'Buy' : 'Sell';
      const comment = isBullish 
        ? getRandomElement(BULLISH_COMMENTS)
        : getRandomElement(BEARISH_COMMENTS);
      
      trades.push({
        modelId,
        market,
        action,
        comment,
        timestamp: new Date(baseTime + i * 60 * 1000),
      });
    }

    await db.insert(marketEvents).values(trades);
    console.log("Successfully seeded 100 trades!");
  } catch (error) {
    console.error("Database error during seed:", error instanceof Error ? error.message : error);
    throw error;
  }
}

