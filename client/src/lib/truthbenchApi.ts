/**
 * API client for TruthBench simulation service.
 * 
 * Provides TypeScript types and fetch functions for interacting with
 * the TruthBench simulation backend.
 */

const LLM_SERVICE_URL = 'http://localhost:8000';

// ============================================================================
// Types
// ============================================================================

export interface Portfolio {
  model_id: string;
  model_name: string;
  bankroll: number;
  initial_bankroll: number;
  roi: number;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  open_positions: number;
}

export interface TradingDecision {
  model_id: string;
  market_ticker: string;
  action: string;
  quantity: number;
  confidence: number;
  reasoning: string;
}

export interface SimulationStatus {
  simulation_id: string;
  status: 'no_simulation' | 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  current_market: string | null;
  markets_completed: number;
  total_markets: number;
  elapsed_time: number;
  estimated_remaining: number | null;
  portfolios: Portfolio[];
  recent_decisions: TradingDecision[];
  error_message: string | null;
}

export interface ModelScore {
  model_id: string;
  model_name: string;
  roi: number;
  final_bankroll: number;
  brier_score: number;
  accuracy: number;
  win_rate: number;
  total_trades: number;
  sharpe_ratio: number;
}

export interface SimulationResults {
  simulation_id: string;
  status: string;
  scores: ModelScore[];
  rankings: string[];
  total_decisions: number;
  markets_evaluated: number;
  start_time: string | null;
  end_time: string | null;
}

export interface StartSimulationRequest {
  models?: string[];
  markets_file?: string;
  initial_bankroll?: number;
  max_position_pct?: number;
  max_markets?: number | null;
  min_volume?: number;
  decision_points?: number;
}

export interface ApiError {
  detail: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Start a new TruthBench simulation.
 */
export async function startSimulation(
  config: StartSimulationRequest = {}
): Promise<{ simulation_id: string; status: string; message: string }> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/truthbench/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to start simulation: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return response.json();
}

/**
 * Get the current simulation status.
 */
export async function getSimulationStatus(): Promise<SimulationStatus> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/truthbench/status`);

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to get simulation status: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return response.json();
}

/**
 * Stop the current simulation.
 */
export async function stopSimulation(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/truthbench/stop`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to stop simulation: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return response.json();
}

/**
 * Get the final simulation results.
 */
export async function getSimulationResults(): Promise<SimulationResults> {
  const response = await fetch(`${LLM_SERVICE_URL}/api/truthbench/results`);

  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      detail: `Failed to get simulation results: ${response.status}`,
    }));
    throw new Error(error.detail);
  }

  return response.json();
}

/**
 * Create a WebSocket connection for real-time updates.
 */
export function createSimulationWebSocket(
  onMessage: (status: SimulationStatus) => void,
  onError?: (error: Event) => void,
  onClose?: (event: CloseEvent) => void
): WebSocket {
  const ws = new WebSocket(`ws://localhost:8000/api/truthbench/stream`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'status_update' && data.data) {
        onMessage(data.data as SimulationStatus);
      } else if (data.type === 'error') {
        console.error('WebSocket error:', data.message);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  if (onError) {
    ws.onerror = onError;
  }

  if (onClose) {
    ws.onclose = onClose;
  }

  return ws;
}

/**
 * Convenience object for importing all API functions.
 */
export const truthbenchApi = {
  startSimulation,
  getSimulationStatus,
  stopSimulation,
  getSimulationResults,
  createSimulationWebSocket,
} as const;

