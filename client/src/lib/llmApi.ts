/**
 * API client for the LLM service.
 *
 * Provides TypeScript types and fetch functions for interacting with
 * the Python llm-service backend.
 */

const LLM_SERVICE_URL = 'http://localhost:8000';

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

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | string;
  web_search?: boolean;
  web_search_options?: WebSearchOptions;
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
 * Convenience object for importing all API functions.
 */
export const llmApi = {
  healthCheck,
  getModels,
  chat,
} as const;

