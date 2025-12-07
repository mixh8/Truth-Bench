import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

export type ModelId = 'grok_heavy_x' | 'grok_heavy' | 'gemini_pro' | 'claude_opus' | 'gpt_5';

export interface Model {
  id: ModelId;
  name: string;
  color: string;
  avatar: string;
  currentValue: number;
  history: { time: number; value: number }[] | string;
  riskFactor: number;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MarketEvent {
  id: string;
  modelId: ModelId;
  market: string;
  action: 'Buy' | 'Sell' | 'Hold';
  comment: string;
  timestamp: number | Date;
  profit?: number;
  probability?: number;
}

export const INITIAL_CAPITAL = 10000;

export const MODELS_CONFIG: Record<ModelId, Omit<Model, 'currentValue' | 'history'>> = {
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

export function useSimulation() {
  const [localModels, setLocalModels] = useState<Model[]>([]);
  const [localEvents, setLocalEvents] = useState<MarketEvent[]>([]);
  const [localTotalVolume, setLocalTotalVolume] = useState(1200000);
  const [isPlaying, setIsPlaying] = useState(true);

  // Fetch data from backend (read-only, backend handles updates)
  const { data: apiModels } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json() as Promise<Model[]>;
    },
    staleTime: 500,
    refetchInterval: 1000, // Poll every 1 second to get backend updates
  });

  const { data: apiEvents } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await fetch('/api/events?limit=20');
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json() as Promise<MarketEvent[]>;
    },
    staleTime: 500,
    refetchInterval: 1000, // Poll every 1 second to get backend updates
  });

  const { data: marketState } = useQuery({
    queryKey: ['marketState'],
    queryFn: async () => {
      const res = await fetch('/api/market-state');
      if (!res.ok) throw new Error('Failed to fetch market state');
      return res.json();
    },
    staleTime: 500,
    refetchInterval: 1000, // Poll every 1 second to get backend updates
  });

  // Set local state when API data loads (backend is the source of truth)
  useEffect(() => {
    if (apiModels?.length) {
      const models = apiModels.map(m => ({
        ...m,
        history: parseHistory(m.history)
      }));
      setLocalModels(models);
    } else {
      const startTime = Date.now() - 1000 * 60 * 60 * 24;
      setLocalModels(Object.values(MODELS_CONFIG).map(config => ({
        ...config,
        currentValue: INITIAL_CAPITAL,
        history: Array.from({ length: 24 }, (_, i) => ({
          time: startTime + i * 1000 * 60 * 60,
          value: INITIAL_CAPITAL
        }))
      })));
    }
  }, [apiModels]);

  useEffect(() => {
    if (apiEvents?.length) {
      setLocalEvents(apiEvents);
    }
  }, [apiEvents]);

  useEffect(() => {
    if (marketState?.totalVolume) {
      setLocalTotalVolume(marketState.totalVolume);
    }
  }, [marketState]);

  return { models: localModels, events: localEvents, totalVolume: localTotalVolume, isPlaying, setIsPlaying };
}
