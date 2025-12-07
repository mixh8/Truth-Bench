import { MarketEvent, MODELS_CONFIG } from "@/lib/simulation";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { OpenAIIcon, ClaudeIcon, GrokIcon, GeminiIcon, DeepSeekIcon } from "@/components/ui/icons";
import { Terminal } from "lucide-react";
import { useEffect, useRef, useMemo } from "react";

const ModelIcon = ({ id, className }: { id: string, className?: string }) => {
  switch (id) {
    case 'grok_heavy_x': return <GrokIcon className={className} />;
    case 'grok_heavy': return <GrokIcon className={className} />;
    case 'gemini_pro': return <GeminiIcon className={className} />;
    case 'claude_opus': return <ClaudeIcon className={className} />;
    case 'gpt_5': return <OpenAIIcon className={className} />;
    case 'deepseek_v3': return <DeepSeekIcon className={className} />;
    default: return null;
  }
};

interface ReasoningFeedProps {
  events: MarketEvent[];
}

export function ReasoningFeed({ events }: ReasoningFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const probabilityMapRef = useRef(new Map<string, number>());

  // Generate and cache probability for each event
  const eventProbabilities = useMemo(() => {
    events.forEach(event => {
      if (!probabilityMapRef.current.has(event.id)) {
        probabilityMapRef.current.set(event.id, Math.floor(Math.random() * 99) + 1);
      }
    });
    return probabilityMapRef.current;
  }, [events]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="bg-card border border-border rounded-lg flex flex-col h-full overflow-hidden font-mono text-sm">
      <div className="p-3 border-b border-border bg-muted/30">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-xs uppercase tracking-wider">
          <Terminal className="w-3 h-3 text-primary" />
          Live Reasoning Feed
        </h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 bg-black/20">
        <AnimatePresence initial={false}>
          {events.map((event) => {
            const modelConfig = MODELS_CONFIG[event.modelId];
            const probability = eventProbabilities.get(event.id) || 50;
            const actionText = event.action === 'Buy' ? 'bought YES' : 'bought NO';
            
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-1 border-l-2 border-border pl-3"
                style={{ borderLeftColor: modelConfig.color }}
              >
                <div className="flex items-center flex-wrap gap-x-2 text-foreground/90">
                  <span className="text-muted-foreground text-xs">
                    [{format(event.timestamp, 'HH:mm')}]
                  </span>
                  
                  <div className="inline-flex items-center justify-center w-4 h-4">
                    <ModelIcon id={event.modelId} className="w-3 h-3" />
                  </div>
                  
                  <span className="font-bold" style={{ color: modelConfig.color }}>
                    {modelConfig.name.split(' ')[0].toUpperCase()}
                  </span>
                  
                  <span>
                    {actionText} on{' '}
                    <a 
                      href="https://polymarket.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline hover:text-blue-400 transition-colors"
                    >
                      '{event.market}'
                    </a>
                  </span>
                  
                  <span className="text-muted-foreground">
                    (Prob: {probability}%)
                  </span>
                </div>

                <div className="text-slate-400 text-xs pl-[5.5rem] leading-relaxed opacity-80">
                  // {event.comment}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {events.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-xs font-mono">
            &gt; Awaiting market signals...
          </div>
        )}
      </div>
    </div>
  );
}
