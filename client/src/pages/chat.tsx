/**
 * Chat page for testing and interacting with the LLM service.
 *
 * Features:
 * - Model selection dropdown
 * - Web search toggle
 * - Chat interface with message history
 * - Token usage display
 * - Connection status indicator
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import { useAvailableModels, useLLMHealth, useChat } from '@/hooks/useLLM';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  OpenAIIcon,
  ClaudeIcon,
  GrokIcon,
  GeminiIcon,
} from '@/components/ui/icons';
import {
  ArrowLeft,
  Send,
  Trash2,
  Loader2,
  Globe,
  Cpu,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Provider icon mapping
function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  switch (provider) {
    case 'xai':
      return <GrokIcon className={className} />;
    case 'google':
      return <GeminiIcon className={className} />;
    case 'anthropic':
      return <ClaudeIcon className={className} />;
    case 'openai':
      return <OpenAIIcon className={className} />;
    default:
      return <Cpu className={className} />;
  }
}

export default function Chat() {
  // State
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { data: models, isLoading: modelsLoading, error: modelsError } = useAvailableModels();
  const { data: health, isLoading: healthLoading } = useLLMHealth();
  const {
    messages,
    sendMessage,
    clearChat,
    isLoading: chatLoading,
    error: chatError,
    lastResponse,
  } = useChat();

  // Set default model when models load
  useEffect(() => {
    if (models && models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].id);
    }
  }, [models, selectedModel]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Get current model info
  const currentModel = models?.find((m) => m.id === selectedModel);

  // Handle send message
  const handleSend = () => {
    if (!inputValue.trim() || !selectedModel || chatLoading) return;

    sendMessage(inputValue.trim(), {
      model: selectedModel,
      webSearch: webSearchEnabled && currentModel?.supports_web_search,
    });

    setInputValue('');
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Connection status
  const isConnected = health?.status === 'healthy';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Chat Playground
              </h1>
              <p className="text-xs text-muted-foreground">
                Test LLM integrations
              </p>
            </div>
          </div>

          {/* Connection Status */}
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5',
              isConnected
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            )}
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              )}
            />
            {healthLoading
              ? 'Checking...'
              : isConnected
                ? 'Connected'
                : 'Disconnected'}
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 gap-4">
        {/* Controls */}
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Model Selector */}
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label htmlFor="model-select" className="text-xs text-muted-foreground">
                Model
              </Label>
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
                disabled={modelsLoading}
              >
                <SelectTrigger id="model-select" className="w-full">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {modelsError ? (
                    <div className="p-2 text-sm text-rose-500">
                      Failed to load models
                    </div>
                  ) : modelsLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      Loading...
                    </div>
                  ) : (
                    models?.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex items-center gap-2">
                          <ProviderIcon
                            provider={model.provider}
                            className="w-4 h-4"
                          />
                          <span>{model.name}</span>
                          {model.supports_web_search && (
                            <Globe className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Web Search Toggle */}
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label
                  htmlFor="web-search"
                  className="text-sm cursor-pointer"
                >
                  Web Search
                </Label>
              </div>
              <Switch
                id="web-search"
                checked={webSearchEnabled}
                onCheckedChange={setWebSearchEnabled}
                disabled={!currentModel?.supports_web_search}
              />
            </div>

            {/* Clear Chat */}
            <Button
              variant="outline"
              size="sm"
              onClick={clearChat}
              disabled={messages.length === 0}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </Button>
          </div>

          {/* Model Info */}
          {currentModel && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ProviderIcon
                  provider={currentModel.provider}
                  className="w-3 h-3"
                />
                {currentModel.provider.toUpperCase()}
              </span>
              {currentModel.supports_tools && (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  Tools
                </span>
              )}
              {currentModel.supports_web_search && (
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Web Search
                </span>
              )}
              {currentModel.supports_vision && (
                <span className="flex items-center gap-1">
                  <Cpu className="w-3 h-3" />
                  Vision
                </span>
              )}
            </div>
          )}
        </Card>

        {/* Chat Area */}
        <Card className="flex-1 flex flex-col min-h-[400px] overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center space-y-2">
                  <Cpu className="w-12 h-12 mx-auto opacity-50" />
                  <p className="text-sm">
                    Start a conversation by typing below
                  </p>
                  <p className="text-xs">
                    Select a model and send a message to test the integration
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex gap-3',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role !== 'user' && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {currentModel ? (
                          <ProviderIcon
                            provider={currentModel.provider}
                            className="w-4 h-4 text-primary"
                          />
                        ) : (
                          <Cpu className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[80%] rounded-xl px-4 py-3',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted',
                        message.role === 'system' &&
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      )}
                    >
                      {message.role === 'system' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">
                          System
                        </span>
                      )}
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary-foreground">
                          U
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading indicator */}
                {chatLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                    <div className="bg-muted rounded-xl px-4 py-3">
                      <p className="text-sm text-muted-foreground">
                        Thinking...
                      </p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Token Usage */}
          {lastResponse?.usage && (
            <div className="px-4 py-2 border-t border-border bg-muted/30">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Prompt: {lastResponse.usage.prompt_tokens.toLocaleString()}
                </span>
                <span>
                  Completion:{' '}
                  {lastResponse.usage.completion_tokens.toLocaleString()}
                </span>
                <span className="font-medium text-foreground">
                  Total: {lastResponse.usage.total_tokens.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {chatError && (
            <div className="px-4 py-2 border-t border-rose-500/20 bg-rose-500/10">
              <p className="text-xs text-rose-500">
                Error: {chatError.message}
              </p>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                className="min-h-[60px] max-h-[200px] resize-none"
                disabled={chatLoading || !isConnected}
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || chatLoading || !isConnected}
                className="shrink-0 h-auto"
              >
                {chatLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

