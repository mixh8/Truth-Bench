/**
 * React hooks for TruthBench simulation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  startSimulation,
  getSimulationStatus,
  stopSimulation,
  getSimulationResults,
  createSimulationWebSocket,
  type SimulationStatus,
  type SimulationResults,
  type StartSimulationRequest,
  type Portfolio,
  type TradingDecision,
} from '@/lib/truthbenchApi';

/**
 * Hook for managing TruthBench simulation state.
 */
export function useTruthbench() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<SimulationStatus | null>(null);

  // Query for simulation status (polling fallback)
  const {
    data: status,
    isLoading: isStatusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['truthbench', 'status'],
    queryFn: getSimulationStatus,
    refetchInterval: realtimeStatus ? false : 2000, // Poll unless using WebSocket
    staleTime: 1000,
  });

  // Query for simulation results
  const {
    data: results,
    isLoading: isResultsLoading,
    error: resultsError,
    refetch: refetchResults,
  } = useQuery({
    queryKey: ['truthbench', 'results'],
    queryFn: getSimulationResults,
    enabled: status?.status === 'completed' || status?.status === 'paused',
    staleTime: 60000, // Results don't change once simulation ends
  });

  // Mutation to start simulation
  const startMutation = useMutation({
    mutationFn: (config: StartSimulationRequest) => startSimulation(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truthbench'] });
      // Connect WebSocket for real-time updates
      connectWebSocket();
    },
  });

  // Mutation to stop simulation
  const stopMutation = useMutation({
    mutationFn: stopSimulation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['truthbench'] });
      disconnectWebSocket();
    },
  });

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = createSimulationWebSocket(
        (update) => {
          setRealtimeStatus(update);
          // Update query cache with realtime data
          queryClient.setQueryData(['truthbench', 'status'], update);
        },
        (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        },
        (event) => {
          console.log('WebSocket closed:', event.code);
          setIsConnected(false);
          setRealtimeStatus(null);
          // Fall back to polling
          queryClient.invalidateQueries({ queryKey: ['truthbench', 'status'] });
        }
      );

      ws.onopen = () => {
        setIsConnected(true);
      };

      wsRef.current = ws;
    } catch (e) {
      console.error('Failed to connect WebSocket:', e);
    }
  }, [queryClient]);

  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
      setRealtimeStatus(null);
    }
  }, []);

  // Auto-connect WebSocket if simulation is running
  useEffect(() => {
    if (status?.status === 'running' && !isConnected) {
      connectWebSocket();
    }
  }, [status?.status, isConnected, connectWebSocket]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, [disconnectWebSocket]);

  // Use realtime status if available, otherwise use query data
  const currentStatus = realtimeStatus || status;

  return {
    // Status
    status: currentStatus,
    isStatusLoading,
    statusError,
    isConnected,

    // Results
    results,
    isResultsLoading,
    resultsError,

    // Actions
    startSimulation: startMutation.mutate,
    isStarting: startMutation.isPending,
    startError: startMutation.error,

    stopSimulation: stopMutation.mutate,
    isStopping: stopMutation.isPending,
    stopError: stopMutation.error,

    // Utils
    refetchStatus,
    refetchResults,
  };
}

/**
 * Hook for getting sorted portfolios by ROI.
 */
export function useSortedPortfolios(portfolios: Portfolio[] | undefined) {
  return [...(portfolios || [])].sort((a, b) => b.roi - a.roi);
}

/**
 * Hook for formatting currency values (cents to dollars).
 */
export function useFormatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Hook for formatting percentages.
 */
export function useFormatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(value);
}

