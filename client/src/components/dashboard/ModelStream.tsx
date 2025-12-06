import { MarketEvent, MODELS_CONFIG } from "@/lib/simulation";
import { cn } from "@/lib/utils";
import { MessageSquare, Clock } from "lucide-react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { OpenAIIcon, ClaudeIcon, GrokIcon, GeminiIcon, DeepSeekIcon } from "@/components/ui/icons";

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

interface ModelStreamProps {
  events: MarketEvent[];
}

export function ModelStream({ events }: ModelStreamProps) {
  return (
    <div className="bg-card border border-border rounded-lg flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Model Stream
        </h3>
        <p className="text-xs text-muted-foreground mt-1">Live reasoning logs from trading agents</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {events.map((event) => {
            const modelConfig = MODELS_CONFIG[event.modelId];
            
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0 }}
                className="flex gap-3 text-sm pb-4 border-b border-border/50 last:border-0"
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-border/50 bg-background"
                  style={{ color: modelConfig.color }}
                >
                  <ModelIcon id={event.modelId} className="w-4 h-4" />
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span 
                        className="font-bold text-xs uppercase tracking-wider"
                        style={{ color: modelConfig.color }}
                    >
                        {modelConfig.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(event.timestamp, 'HH:mm:ss')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs mb-1">
                    <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                        event.action === 'Buy' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    )}>
                        {event.action}
                    </span>
                    <span className="text-muted-foreground font-mono">{event.market}</span>
                  </div>

                  <p className="text-muted-foreground leading-relaxed">
                    "{event.comment}"
                  </p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {events.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
                Waiting for market signals...
            </div>
        )}
      </div>
    </div>
  );
}
