import { storage } from "./storage";
import type { Model } from "@shared/schema";

export type ModelId = 'grok_heavy_x' | 'grok_heavy' | 'gemini_pro' | 'claude_opus' | 'gpt_5';

export const INITIAL_CAPITAL = 10000;

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

const parseHistory = (history: any): { time: number; value: number }[] => {
  if (typeof history === 'string') {
    try {
      return JSON.parse(history);
    } catch {
      return [];
    }
  }
  return Array.isArray(history) ? history : [];
};

let simulationInterval: NodeJS.Timeout | null = null;
let tradeInterval: NodeJS.Timeout | null = null;
let allSeededEvents: any[] = [];
let tradeIndex = 0;

/**
 * Initialize models in the database with starting values
 */
export async function initializeModels() {
  const existingModels = await storage.getAllModels();
  
  if (existingModels.length > 0) {
    console.log(`[Simulation] Models already initialized (${existingModels.length} found)`);
    return;
  }

  console.log('[Simulation] Initializing models...');
  const startTime = Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago
  
  for (const [modelId, config] of Object.entries(MODELS_CONFIG)) {
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
  }
  
  console.log('[Simulation] Models initialized successfully');
}

/**
 * Update model values based on their risk factors and trends
 */
async function updateModelValues() {
  try {
    const models = await storage.getAllModels();
    const now = Date.now();

    for (const model of models) {
      let trend = 0;
      let volatility = model.riskFactor * 50;
      
      // Model-specific trends (Grok models outperform)
      if (model.id === 'grok_heavy_x') {
        trend = 4 + Math.random() * 4;
        volatility *= 1.1; 
      } else if (model.id === 'grok_heavy') {
        trend = 2 + Math.random() * 3;
      } else {
        trend = (Math.random() - 0.48) * 8;
      }

      const change = trend + (Math.random() - 0.5) * volatility * 3;
      const newValue = model.currentValue + change;
      const history = parseHistory(model.history);

      const newHistory = [...history, { time: now, value: newValue }].slice(-50);

      await storage.updateModel(model.id, {
        currentValue: newValue,
        history: JSON.stringify(newHistory),
      });
    }
  } catch (error) {
    console.error('[Simulation] Error updating model values:', error);
  }
}

/**
 * Advance to the next trade event
 */
async function advanceTrade() {
  try {
    if (!allSeededEvents.length) {
      // Load events if not already loaded
      allSeededEvents = await storage.getAllEventsOrdered();
      if (!allSeededEvents.length) {
        console.warn('[Simulation] No seeded events found for trade cycling');
        return;
      }
    }

    tradeIndex = (tradeIndex + 1) % allSeededEvents.length;
    
    // Update total volume
    const tradeAmount = Math.floor(Math.random() * 45000) + 5000;
    const state = await storage.getMarketState();
    const currentVolume = state?.totalVolume || 1200000;
    
    await storage.updateMarketState({
      totalVolume: currentVolume + tradeAmount,
    });
  } catch (error) {
    console.error('[Simulation] Error advancing trade:', error);
  }
}

/**
 * Schedule the next trade with random interval
 */
function scheduleNextTrade() {
  const nextInterval = 2000 + Math.random() * 8000; // 2-10 seconds
  
  if (tradeInterval) {
    clearTimeout(tradeInterval);
  }
  
  tradeInterval = setTimeout(async () => {
    await advanceTrade();
    scheduleNextTrade(); // Schedule next one
  }, nextInterval);
}

/**
 * Start the simulation loop
 */
export async function startSimulation() {
  if (simulationInterval) {
    console.log('[Simulation] Simulation already running');
    return;
  }

  console.log('[Simulation] Starting simulation loop...');

  // Initialize models if needed
  await initializeModels();

  // Update model values every 1 second
  simulationInterval = setInterval(updateModelValues, 1000);

  // Start trade cycling
  scheduleNextTrade();

  console.log('[Simulation] Simulation started successfully');
}

/**
 * Stop the simulation loop
 */
export function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  
  if (tradeInterval) {
    clearTimeout(tradeInterval);
    tradeInterval = null;
  }
  
  console.log('[Simulation] Simulation stopped');
}

/**
 * Check if simulation is running
 */
export function isSimulationRunning(): boolean {
  return simulationInterval !== null;
}
