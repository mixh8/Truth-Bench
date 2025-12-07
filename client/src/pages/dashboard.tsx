import { useSimulation } from "@/lib/simulation";
import { Ticker } from "@/components/dashboard/Ticker";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { ReasoningFeed } from "@/components/dashboard/ReasoningFeed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Pause, RefreshCw, LayoutDashboard, FileText } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Link } from "wouter";

export default function Dashboard() {
  const { models, events, totalVolume, isPlaying, setIsPlaying } = useSimulation();

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-6">
              <span className="text-lg font-bold text-foreground">Truth Bench</span>
              <div className="flex items-center gap-1">
                <Link href="/" className="flex items-center gap-2 px-3 py-2 text-sm text-emerald-500 bg-emerald-500/10 rounded-md" data-testid="link-dashboard">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <Link href="/report" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors" data-testid="link-report">
                  <FileText className="w-4 h-4" />
                  Report
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsPlaying(!isPlaying)}
                className="gap-2"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? "Pause" : "Resume"}
              </Button>
              <ModeToggle />
            </div>
          </div>
        </div>
      </nav>

      <Ticker />
      
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="space-y-1">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Live Simulation</h1>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-pulse">
                        LIVE
                    </Badge>
                </div>
                <p className="text-muted-foreground">Prediction Market Simulator</p>
            </div>
        </header>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)] min-h-[600px]">
            {/* Left Column: Chart */}
            <div className="lg:col-span-2 flex flex-col gap-6">
                <PerformanceChart models={models} />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {/* Stats Cards could go here */}
                     <div className="bg-card border border-border rounded-lg p-4">
                         <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Total Volume</h4>
                         <span className="text-2xl font-mono font-bold">
                            ${(totalVolume / 1000000).toFixed(2)}M
                         </span>
                     </div>
                     <div className="bg-card border border-border rounded-lg p-4">
                         <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Models</h4>
                         <span className="text-2xl font-mono font-bold">5</span>
                     </div>
                     <div className="bg-card border border-border rounded-lg p-4">
                         <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Market State</h4>
                         <span className="text-2xl font-mono font-bold text-emerald-500">Volatile</span>
                     </div>
                </div>
            </div>

            {/* Right Column: Sidebar */}
            <div className="lg:col-span-1 flex flex-col gap-6 h-full">
                <Leaderboard models={models} />
                <div className="flex-1 min-h-0">
                    <ReasoningFeed events={events} />
                </div>
            </div>
        </div>
      </main>
    </div>
  );
}
