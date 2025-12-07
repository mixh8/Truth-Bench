import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type ModelId = 'grok_heavy_x' | 'grok_heavy' | 'gemini_pro' | 'claude_opus' | 'gpt_5' | 'deepseek_v3';

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
  const queryClient = useQueryClient();
  const [localModels, setLocalModels] = useState<Model[]>([]);
  const [localEvents, setLocalEvents] = useState<MarketEvent[]>([]);
  const [localTotalVolume, setLocalTotalVolume] = useState(1200000);
  const [isPlaying, setIsPlaying] = useState(true);
  const timeRef = useRef(Date.now());
  const initializeModelsOnce = useRef(false);

  // Mutations - must be created unconditionally at hook level
  const updateModelMutation = useMutation({
    mutationFn: (payload: { id: string; currentValue: number; history: { time: number; value: number }[] }) =>
      fetch(`/api/models/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue: payload.currentValue, history: payload.history })
      }).then(r => r.json()),
  });

  const createEventMutation = useMutation({
    mutationFn: (event: Omit<MarketEvent, 'id' | 'timestamp'> & { timestamp?: number }) =>
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }).then(r => r.json()),
    onSuccess: (newEvent) => {
      setLocalEvents(prev => [newEvent, ...prev].slice(0, 5));
      queryClient.setQueryData(['events'], (old: MarketEvent[]) => [newEvent, ...old].slice(0, 5));
    }
  });

  const updateStateMutation = useMutation({
    mutationFn: (state: { totalVolume?: number; isPlaying?: number }) =>
      fetch('/api/market-state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      }).then(r => r.json()),
  });

  // Fetch initial data
  const { data: apiModels } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json() as Promise<Model[]>;
    },
    staleTime: 5000,
  });

  const { data: apiEvents } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await fetch('/api/events?limit=20');
      if (!res.ok) throw new Error('Failed to fetch events');
      return res.json() as Promise<MarketEvent[]>;
    },
    staleTime: 5000,
  });

  const { data: marketState } = useQuery({
    queryKey: ['marketState'],
    queryFn: async () => {
      const res = await fetch('/api/market-state');
      if (!res.ok) throw new Error('Failed to fetch market state');
      return res.json();
    },
    staleTime: 5000,
  });

  // Initialize models in database if needed
  useEffect(() => {
    if (!initializeModelsOnce.current && !apiModels) {
      initializeModelsOnce.current = true;
      const startTime = Date.now() - 1000 * 60 * 60 * 24;
      Object.entries(MODELS_CONFIG).forEach(([modelId, config]) => {
        const history = Array.from({ length: 24 }, (_, i) => ({
          time: startTime + i * 1000 * 60 * 60,
          value: INITIAL_CAPITAL
        }));
        const { id, ...configWithoutId } = config;
        fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: modelId,
            ...configWithoutId,
            currentValue: INITIAL_CAPITAL,
            history,
          })
        }).catch(() => {});
      });
    }
  }, [apiModels]);

  // Set local state when API data loads
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

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const now = Date.now();
      timeRef.current = now;

      setLocalModels(prevModels => {
        const updated = prevModels.map(model => {
          let trend = 0;
          let volatility = model.riskFactor * 50;
          
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
          const newModel = {
            ...model,
            currentValue: newValue,
            history: newHistory
          };

          updateModelMutation.mutate({
            id: model.id,
            currentValue: newValue,
            history: newHistory
          });
          return newModel;
        });
        return updated;
      });

      if (Math.random() > 0.6) {
        const randomModel = Object.values(MODELS_CONFIG)[Math.floor(Math.random() * 6)];
        const market = MARKETS[Math.floor(Math.random() * MARKETS.length)];
        const isBullish = Math.random() > 0.5;
        const type = isBullish ? 'bullish' : 'bearish';
        const action = isBullish ? 'Buy' : 'Sell';
        const comment = COMMENTS[type][Math.floor(Math.random() * COMMENTS[type].length)];
        const tradeAmount = Math.floor(Math.random() * 45000) + 5000;

        setLocalTotalVolume(prev => {
          const newVolume = prev + tradeAmount;
          updateStateMutation.mutate({ totalVolume: newVolume });
          return newVolume;
        });

        createEventMutation.mutate({
          modelId: randomModel.id as ModelId,
          market,
          action,
          comment,
          timestamp: now
        });
      }

    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, updateModelMutation, createEventMutation, updateStateMutation]);

  return { models: localModels, events: localEvents, totalVolume: localTotalVolume, isPlaying, setIsPlaying };
}
