/**
 * API client for the LLM service.
 *
 * Provides TypeScript types and fetch functions for interacting with
 * the Python llm-service backend.
 */

// Allow overriding the backend during dev (defaults to local Python service)
const LLM_SERVICE_URL =
  import.meta.env.VITE_LLM_SERVICE_URL ?? 'http://localhost:8000';

// ============================================================================
// Types matching Python schemas (llm_service/llm/schemas.py)
// ============================================================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunction;
}

export interface WebSearchOptions {
  search_context_size: 'low' | 'medium' | 'high';
}

export interface XSearchOptions {
  /** List of X handles to restrict search to (without @ prefix) */
  allowed_x_handles?: string[];
  /** Enable image understanding in X posts (default: true) */
  enable_image_understanding?: boolean;
  /** Enable video understanding in X posts (default: true) */
  enable_video_understanding?: boolean;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | string;
  web_search?: boolean;
  web_search_options?: WebSearchOptions;
  /** Enable X (Twitter) search (xAI models only) */
  x_search?: boolean;
  /** X search configuration options */
  x_search_options?: XSearchOptions;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ResponseMessage {
  role: 'assistant';
  content: string | null;
  tool_calls: ToolCall[] | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatResponse {
  id: string;
  model: string;
  message: ResponseMessage;
  usage: Usage | null;
  finish_reason: string | null;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  supports_tools: boolean;
  supports_web_search: boolean;
  /** Whether model supports X search (xAI models only) */
  supports_x_search: boolean;
  supports_vision: boolean;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  version: string;
}

export interface ApiError {
  detail: string;
}

export interface TwitterMetrics {
  total_tweets: number;
  tweets_last_24h: number;
  tweets_last_hour: number;
  total_likes: number;
  total_retweets: number;
  total_replies: number;
  verified_user_tweets: number;
  unique_authors: number;
  top_posts: Array<{
    id: string;
    text: string;
    author_username: string;
    author_verified: boolean;
    author_followers: number;
    engagement: {
      likes: number;
      retweets: number;
      replies: number;
      total: number;
    };
    url: string;
  }>;
  // Back-compat for older responses
  top_tweets?: TwitterMetrics["top_posts"];
  top_hashtags: Array<{
    tag: string;
    count: number;
  }>;
  [key: string]: any;
}

export interface KalshiFeedResponse {
  kalshi_feed?: {
    feed?: Array<{
      event_ticker?: string;
      event_title?: string;
      series_ticker?: string;
      category?: string;
      total_volume?: number;
      markets?: Array<{
        ticker?: string;
        yes_subtitle?: string;
        no_subtitle?: string;
        last_price?: number;
        yes_bid?: number;
        yes_ask?: number;
        result?: string;
      }>;
    }>;
  };
  twitter_augmentation?: Record<string, {
    event_title: string;
    category: string;
    twitter_metrics: TwitterMetrics;
    markets: Record<string, any>;
  }>;
  metadata?: {
    augmented_at: string;
    markets_augmented: number;
    api_calls_used: number;
    error?: string;
  };
  // Fallback for non-augmented response
  feed?: Array<any>;
  [key: string]: unknown;
}

// ============================================================================
// API Client Functions
// ============================================================================

/**
 * Check if the LLM service is healthy.
 */
export async function healthCheck(): Promise<HealthResponse> {
  const response = await fetch(`${LLM_SERVICE_URL}/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch the list of available models from the LLM service.
 */
export async function getModels(): Promise<ModelInfo[]> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/models`);

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to fetch models: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  // Backend returns { models: [...] }, unwrap it
  const data: { models: ModelInfo[] } = await response.json();
  return data.models;
}

/**
 * Send a chat completion request to the LLM service.
 */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Chat request failed: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return response.json();
}

/**
 * Fetch the Kalshi feed data.
 */
export async function getKalshiFeed(limit: number = 10): Promise<KalshiFeedResponse> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/kalshi/feed?limit=${limit}&use_cache=true`);

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to fetch Kalshi feed: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return response.json();
}

/**
 * Market analysis types and functions
 */
export interface ModelPrediction {
  model_id: string;
  name: string;
  vote: "YES" | "NO";
  predicted_outcome?: string;
  confidence: number;
  reasoning: string;
  timestamp: string;
}

export interface MarketOutcome {
  label: string;
  current_price: number;
  ticker: string;
}

export interface MarketAnalysisRequest {
  market_title: string;
  outcomes: MarketOutcome[];
  twitter_metrics?: TwitterMetrics | null;
}

export interface MarketAnalysisResponse {
  market_title: string;
  predictions: ModelPrediction[];
  consensus: {
    recommendation: "YES" | "NO";
    yes_count: number;
    no_count: number;
    avg_confidence: number;
    is_strong: boolean;
    predicted_outcome?: string;
    predicted_outcome_ticker?: string;
    votes_for_outcome?: number;
  };
  metadata: {
    analyzed_at: string;
    models_queried: number;
    successful_predictions: number;
  };
}

/**
 * Analyze a market using multiple LLMs to generate predictions.
 */
export async function analyzeMarket(request: MarketAnalysisRequest): Promise<MarketAnalysisResponse> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/kalshi/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to analyze market: ${response.status}`,
    }));
    throw new Error(error.detail);
  }
  
  return response.json();
}

/**
 * Convenience object for importing all API functions.
 */
export const llmApi = {
  healthCheck,
  getModels,
  chat,
  getKalshiFeed,
  analyzeMarket,
} as const;

