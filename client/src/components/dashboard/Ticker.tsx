import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Activity, Zap } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: string;
  change: number;
}

const INDICES: TickerItem[] = [
  { symbol: "S&P 500", price: "5,432.10", change: 0.45 },
  { symbol: "NASDAQ", price: "17,890.00", change: 1.2 },
  { symbol: "BTC-USD", price: "98,420.50", change: 2.1 },
  { symbol: "NVDA", price: "145.20", change: -0.5 },
  { symbol: "TSLA", price: "245.80", change: 3.4 },
  { symbol: "ETH-USD", price: "3,890.10", change: 0.8 },
  { symbol: "VIX", price: "14.20", change: -2.1 },
];

export function Ticker() {
  return (
    <div className="h-10 bg-secondary/30 border-b border-border flex items-center overflow-hidden whitespace-nowrap relative z-50">
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none"></div>
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none"></div>
      
      <div className="flex items-center gap-4 px-4 border-r border-border z-20 bg-background/95 backdrop-blur-sm h-full shrink-0">
         <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
            <span className="text-xs font-bold tracking-wider text-muted-foreground">LIVE MARKETS</span>
         </div>
         <div className="h-4 w-[1px] bg-border"></div>
         <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-yellow-500" />
            <span className="text-xs font-bold text-foreground">SENTIMENT: <span className="text-emerald-500">GREED (78)</span></span>
         </div>
      </div>

      <div className="animate-ticker flex items-center gap-8 pl-4">
        {[...INDICES, ...INDICES, ...INDICES].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-sm font-mono">
            <span className="font-bold text-muted-foreground">{item.symbol}</span>
            <span className="text-foreground">{item.price}</span>
            <span className={cn(
              "flex items-center text-xs",
              item.change >= 0 ? "text-emerald-500" : "text-rose-500"
            )}>
              {item.change >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {Math.abs(item.change)}%
            </span>
          </div>
        ))}
      </div>
      
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 60s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
