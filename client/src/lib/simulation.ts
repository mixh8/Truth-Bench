import { useState, useEffect, useRef } from 'react';

export type ModelId = 'grok_heavy_x' | 'grok_heavy' | 'gemini_pro' | 'claude_opus' | 'gpt_5' | 'deepseek_v3';

export interface Model {
  id: ModelId;
  name: string;
  color: string;
  avatar: string;
  currentValue: number;
  history: { time: number; value: number }[];
  riskFactor: number;
  description: string;
}

export interface MarketEvent {
  id: string;
  modelId: ModelId;
  market: string;
  action: 'Buy' | 'Sell' | 'Hold';
  comment: string;
  timestamp: number;
  profit?: number;
}

export const INITIAL_CAPITAL = 10000;

export const MODELS_CONFIG: Record<ModelId, Omit<Model, 'currentValue' | 'history'>> = {
  grok_heavy_x: {
    id: 'grok_heavy_x',
    name: 'Grok 4 Heavy w/ X',
    color: 'hsl(var(--color-model-grok-x))',
    avatar: '🌌',
    riskFactor: 0.9,
    description: 'X-integrated super-intelligence with real-time data access.'
  },
  grok_heavy: {
    id: 'grok_heavy',
    name: 'Grok 4 Heavy',
    color: 'hsl(var(--color-model-grok))',
    avatar: '🌑',
    riskFactor: 0.85,
    description: 'Heavyweight reasoning model.'
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
  },
  deepseek_v3: {
    id: 'deepseek_v3',
    name: 'DeepSeek-V3.2',
    color: 'hsl(var(--color-model-deepseek))',
    avatar: '🐳',
    riskFactor: 0.7,
    description: 'Open weights champion, high efficiency.'
  }
};

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
  "Global Compute Cap"
];

const COMMENTS = {
  bullish: [
    "Alpha detected. Allocating aggressively. 🚀",
    "Pattern recognition: Bull flag confirmed.",
    "Sentiment analysis on X indicates breakout.",
    "Compute scaling laws predict upward trend.",
    "Liquidity injection imminent. Buying."
  ],
  bearish: [
    "Macro headwinds detected. Reducing exposure.",
    "Overvaluation metrics flashing red.",
    "Regulatory risk increasing. Selling.",
    "Sentiment turning negative. Hedging.",
    "Profit taking initiated."
  ],
  neutral: [
    "Accumulating data points...",
    "Market noise high. Holding steady.",
    "Rebalancing portfolio weights.",
    "Awaiting confirmation signal.",
    "Analyzing cross-market correlations."
  ]
};

export function useSimulation() {
  const [models, setModels] = useState<Model[]>(() => {
    const startTime = Date.now() - 1000 * 60 * 60 * 24; // Start 24 hours ago
    return Object.values(MODELS_CONFIG).map(config => ({
      ...config,
      currentValue: INITIAL_CAPITAL,
      history: Array.from({ length: 24 }, (_, i) => ({
        time: startTime + i * 1000 * 60 * 60,
        value: INITIAL_CAPITAL
      }))
    }));
  });

  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const timeRef = useRef(Date.now());

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const now = Date.now();
      timeRef.current = now;

      setModels(prevModels => {
        return prevModels.map(model => {
          let trend = 0;
          let volatility = model.riskFactor * 50;
          
          // Bias logic: 
          // Grok 4 Heavy with X: Win by 2-7%
          // Grok 4 Heavy: 2nd place
          
          if (model.id === 'grok_heavy_x') {
             trend = 4 + Math.random() * 4; // Controlled upward drift
             volatility *= 1.1; 
          } else if (model.id === 'grok_heavy') {
             trend = 2 + Math.random() * 3; // Slightly less drift
          } else {
             trend = (Math.random() - 0.48) * 8; // Flat/Slightly positive for others
          }

          const change = trend + (Math.random() - 0.5) * volatility * 3;
          const newValue = model.currentValue + change;

          return {
            ...model,
            currentValue: newValue,
            history: [...model.history, { time: now, value: newValue }].slice(-100)
          };
        });
      });

      if (Math.random() > 0.6) {
        const randomModel = Object.values(MODELS_CONFIG)[Math.floor(Math.random() * 6)];
        const market = MARKETS[Math.floor(Math.random() * MARKETS.length)];
        const isBullish = Math.random() > 0.5;
        const type = isBullish ? 'bullish' : 'bearish';
        const action = isBullish ? 'Buy' : 'Sell';
        const comment = COMMENTS[type][Math.floor(Math.random() * COMMENTS[type].length)];

        const newEvent: MarketEvent = {
          id: Math.random().toString(36).substr(2, 9),
          modelId: randomModel.id as ModelId,
          market,
          action,
          comment,
          timestamp: now
        };

        setEvents(prev => [newEvent, ...prev].slice(0, 20));
      }

    }, 1000); // Faster updates: 1 second

    return () => clearInterval(interval);
  }, [isPlaying]);

  return { models, events, isPlaying, setIsPlaying };
}
