import { Model } from "@/lib/simulation";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Trophy } from "lucide-react";
import { OpenAIIcon, ClaudeIcon, GrokIcon, GeminiIcon, DeepSeekIcon } from "@/components/ui/icons";

const ModelIcon = ({ id, className }: { id: string, className?: string }) => {
  switch (id) {
    case 'grok_heavy_x': return <GrokIcon className={className} />;
    case 'grok_heavy': return <GrokIcon className={className} />;
    case 'gemini_pro': return <GeminiIcon className={className} />;
    case 'claude_opus': return <ClaudeIcon className={className} />;
    case 'gpt_5': return <OpenAIIcon className={className} />;
    default: return null;
  }
};

interface LeaderboardProps {
  models: Model[];
}

export function Leaderboard({ models }: LeaderboardProps) {
  const sortedModels = [...models].sort((a, b) => b.currentValue - a.currentValue);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          Live Standings
        </h3>
        <span className="text-xs text-muted-foreground">Real-time</span>
      </div>
      
      <div className="divide-y divide-border/50">
        {sortedModels.map((model, index) => {
          const returnPct = ((model.currentValue - 10000) / 10000) * 100;
          const isPositive = returnPct >= 0;

          return (
            <div key={model.id} className="p-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                  index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                  index === 1 ? "bg-zinc-500/20 text-zinc-400" :
                  index === 2 ? "bg-amber-700/20 text-amber-700" : "text-muted-foreground"
                )}>
                  {index + 1}
                </div>
                
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                         <span className="text-sm font-medium">{model.name}</span>
                         <ModelIcon id={model.id} className="w-3 h-3 text-muted-foreground" />
                    </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-mono font-medium">
                  ${model.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className={cn(
                  "text-xs font-mono flex items-center justify-end gap-1",
                  isPositive ? "text-emerald-500" : "text-rose-500"
                )}>
                  {isPositive ? "+" : ""}{returnPct.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
