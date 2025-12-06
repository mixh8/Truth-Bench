import { Model, MODELS_CONFIG } from "@/lib/simulation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";
import { 
  OpenAIIcon, 
  ClaudeIcon, 
  GrokIcon, 
  GeminiIcon, 
  DeepSeekIcon 
} from "@/components/ui/icons";

interface PerformanceChartProps {
  models: Model[];
}

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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Sort payload by value descending
    const sortedPayload = [...payload].sort((a: any, b: any) => b.value - a.value);

    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-xl min-w-[200px]">
        <p className="text-muted-foreground text-xs mb-2 font-mono">{label}</p>
        <div className="space-y-1">
          {sortedPayload.map((entry: any) => {
            const modelConfig = Object.values(MODELS_CONFIG).find(m => m.name === entry.name);
            const modelId = modelConfig?.id;
            
            return (
              <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {modelId && <ModelIcon id={modelId} className="w-3 h-3 text-muted-foreground" />}
                  <span className="font-medium text-foreground">{entry.name}</span>
                </div>
                <span className="font-mono" style={{ color: entry.color }}>
                  ${Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

// Custom dot render function to place icon at the end of the line
const CustomizedDot = (props: any) => {
  const { cx, cy, stroke, index, dataLength, modelId } = props;
  
  // Only render for the last point
  if (index !== dataLength - 1) return null;

  return (
    <foreignObject x={cx + 5} y={cy - 10} width={30} height={30}>
      <div 
        className="w-5 h-5 rounded-full flex items-center justify-center shadow-md bg-background border border-border"
        style={{ borderColor: stroke }}
      >
        <ModelIcon id={modelId} className="w-3 h-3" />
      </div>
    </foreignObject>
  );
};

export function PerformanceChart({ models }: PerformanceChartProps) {
  if (!models.length || !models[0].history.length) return null;

  const chartData = models[0].history.map((point, index) => {
    const dataPoint: any = {
      time: point.time,
      formattedTime: format(point.time, 'HH:mm'),
    };
    
    models.forEach(model => {
      dataPoint[model.id] = model.history[index]?.value || model.currentValue;
    });
    
    return dataPoint;
  });

  return (
    <div className="bg-card border border-border rounded-lg p-4 h-[500px] flex flex-col relative">
      <div className="mb-6 flex items-center justify-between z-10 relative">
        <div>
            <h2 className="text-lg font-semibold text-foreground">Portfolio Value Over Time</h2>
            <p className="text-sm text-muted-foreground">Benchmarking simulated trading performance</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
            {models.map(model => (
                <div key={model.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MODELS_CONFIG[model.id].color }} />
                    <span className="text-muted-foreground hidden md:inline">{model.name}</span>
                </div>
            ))}
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              {models.map(model => (
                <linearGradient key={model.id} id={`gradient-${model.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={MODELS_CONFIG[model.id].color} stopOpacity={0.1}/>
                  <stop offset="95%" stopColor={MODELS_CONFIG[model.id].color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
            <XAxis 
                dataKey="formattedTime" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
            />
            <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
                domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            {models.map(model => (
                <Area
                    key={model.id}
                    type="monotone"
                    dataKey={model.id}
                    name={model.name}
                    stroke={MODELS_CONFIG[model.id].color}
                    fill={`url(#gradient-${model.id})`}
                    strokeWidth={2}
                    animationDuration={500}
                    isAnimationActive={false}
                    dot={(props: any) => (
                      <CustomizedDot 
                        {...props} 
                        dataLength={chartData.length} 
                        modelId={model.id} 
                      />
                    )}
                />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
