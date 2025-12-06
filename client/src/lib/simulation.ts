import { useState, useEffect, useRef } from 'react';

export type ModelId = 'grok' | 'claude' | 'chatgpt' | 'deepseek' | 'gemini';

export interface Model {
  id: ModelId;
  name: string;
  color: string;
  avatar: string; // Emoji for now
  currentValue: number;
  history: { time: number; value: number }[];
  riskFactor: number; // 0-1, higher is more volatile
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
  grok: {
    id: 'grok',
    name: 'Grok',
    color: 'var(--color-model-grok)',
    avatar: '🌌',
    riskFactor: 0.8, // High risk, high reward
    description: 'Aggressive, trend-following, high volatility.'
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    color: 'var(--color-model-claude)',
    avatar: '🧠',
    riskFactor: 0.3, // Conservative
    description: 'Cautious, fundamental analysis, steady growth.'
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    color: 'var(--color-model-chatgpt)',
    avatar: '🤖',
    riskFactor: 0.5, // Balanced
    description: 'Balanced portfolio, momentum based.'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    color: 'var(--color-model-deepseek)',
    avatar: '🐳',
    riskFactor: 0.7, // Quantitative
    description: 'Quant-heavy, arbitrage seeker.'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    color: 'var(--color-model-gemini)',
    avatar: '✨',
    riskFactor: 0.6, // Multimodal
    description: 'Macro-focused, sentiment analysis.'
  }
};

const MARKETS = [
  "NVDA Breakout",
  "Fed Rate Decision",
  "Bitcoin > 100k",
  "SpaceX IPO",
  "AI Regulation Bill",
  "TSLA Earnings",
  "GPT-5 Release",
  "Quantum Supremacy",
  "Fusion Energy Breakthrough",
  "Mars Landing"
];

const COMMENTS = {
  bullish: [
    "Bullish signals detected. Going long. 🚀",
    "Market sentiment is undervalued. Buying the dip.",
    "Alpha detected in this sector. Allocating capital.",
    "Momentum is building. Increasing exposure.",
    "Calculated risk: High. Potential reward: Massive."
  ],
  bearish: [
    "Overbought territory. Reducing exposure.",
    "Macro indicators look weak. Hedging now.",
    "Volatility spike expected. Taking profits.",
    "Correction imminent. Shorting this position.",
    "Risk management protocol activated. Selling."
  ],
  neutral: [
    "Holding current position. Waiting for confirmation.",
    "Market is sideways. observing order flow.",
    "Rebalancing portfolio weights.",
    "Analyzing new data points...",
    "No clear signal. Staying cash heavy."
  ]
};

export function useSimulation() {
  const [models, setModels] = useState<Model[]>(() => {
    // Initialize models with starting history
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
          // Simulate price movement based on risk factor
          const volatility = model.riskFactor * 100; // Dollar amount swing
          const trend = (Math.random() - 0.48) * volatility; // Slightly positive bias
          const change = trend + (Math.random() - 0.5) * volatility * 2;
          const newValue = model.currentValue + change;

          return {
            ...model,
            currentValue: newValue,
            history: [...model.history, { time: now, value: newValue }].slice(-100) // Keep last 100 points
          };
        });
      });

      // Randomly generate an event/comment
      if (Math.random() > 0.7) {
        const randomModel = Object.values(MODELS_CONFIG)[Math.floor(Math.random() * 5)];
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

        setEvents(prev => [newEvent, ...prev].slice(0, 50));
      }

    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [isPlaying]);

  return { models, events, isPlaying, setIsPlaying };
}
