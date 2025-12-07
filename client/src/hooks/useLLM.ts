/**
 * React Query hooks for interacting with the LLM service.
 *
 * Provides:
 * - useAvailableModels: Fetch and cache available models
 * - useLLMHealth: Check and poll backend health status
 * - useChat: Send chat messages and manage conversation state
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  healthCheck,
  getModels,
  chat,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ModelInfo,
  type HealthResponse,
} from '@/lib/llmApi';

// ============================================================================
// Query Keys
// ============================================================================

export const llmQueryKeys = {
  health: ['llm', 'health'] as const,
  models: ['llm', 'models'] as const,
} as const;

// ============================================================================
// useAvailableModels
// ============================================================================

/**
 * Fetch and cache the list of available LLM models.
 */
export function useAvailableModels() {
  return useQuery<ModelInfo[], Error>({
    queryKey: llmQueryKeys.models,
    queryFn: getModels,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// ============================================================================
// useLLMHealth
// ============================================================================

/**
 * Check the health of the LLM service.
 * Polls every 30 seconds to keep connection status updated.
 */
export function useLLMHealth() {
  return useQuery<HealthResponse, Error>({
    queryKey: llmQueryKeys.health,
    queryFn: healthCheck,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Poll every 30 seconds
    retry: 1,
  });
}

// ============================================================================
// useChat
// ============================================================================

export interface ChatOptions {
  model: string;
  webSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: Error | null;
  lastResponse: ChatResponse | null;
}

/**
 * Hook for managing chat conversations with the LLM service.
 *
 * Manages conversation state locally and uses React Query mutation
 * for sending messages.
 */
export function useChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [lastResponse, setLastResponse] = useState<ChatResponse | null>(null);

  const mutation = useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: chat,
    onSuccess: (response) => {
      // Add assistant response to messages
      if (response.message.content) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant' as const,
            content: response.message.content!,
          },
        ]);
      }
      setLastResponse(response);
    },
    onError: (error) => {
      console.error('Chat request failed:', error);
    },
  });

  /**
   * Send a message to the LLM.
   */
  const sendMessage = useCallback(
    (content: string, options: ChatOptions) => {
      // Add user message to state immediately
      const userMessage: ChatMessage = { role: 'user', content };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);

      // Build request
      const request: ChatRequest = {
        model: options.model,
        messages: updatedMessages,
        web_search: options.webSearch,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      };

      // Send to backend
      mutation.mutate(request);
    },
    [messages, mutation]
  );

  /**
   * Clear the conversation history.
   */
  const clearChat = useCallback(() => {
    setMessages([]);
    setLastResponse(null);
    mutation.reset();
  }, [mutation]);

  /**
   * Add a system message to set context.
   */
  const setSystemMessage = useCallback((content: string) => {
    setMessages((prev) => {
      // Replace existing system message or add new one at the start
      const filtered = prev.filter((m) => m.role !== 'system');
      return [{ role: 'system' as const, content }, ...filtered];
    });
  }, []);

  return {
    messages,
    sendMessage,
    clearChat,
    setSystemMessage,
    isLoading: mutation.isPending,
    error: mutation.error,
    lastResponse,
  };
}

