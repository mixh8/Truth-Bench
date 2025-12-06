import { Model, MODELS_CONFIG } from "@/lib/simulation";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from "date-fns";

interface PerformanceChartProps {
  models: Model[];
}

export function PerformanceChart({ models }: PerformanceChartProps) {
  // Transform data for Recharts
  // We need an array of objects where each object is a time point with values for all models
  // Assumes all models have same history length/timestamps for simplicity (which they do in our sim)
  
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
    <div className="bg-card border border-border rounded-lg p-4 h-[500px] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
            <h2 className="text-lg font-semibold text-foreground">Portfolio Value Over Time</h2>
            <p className="text-sm text-muted-foreground">Benchmarking simulated trading performance</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
            {models.map(model => (
                <div key={model.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MODELS_CONFIG[model.id].color }} />
                    <span className="text-muted-foreground">{model.name}</span>
                </div>
            ))}
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              {models.map(model => (
                <linearGradient key={model.id} id={`gradient-${model.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={MODELS_CONFIG[model.id].color} stopOpacity={0.1}/>
                  <stop offset="95%" stopColor={MODELS_CONFIG[model.id].color} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
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
            <Tooltip 
                contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))'
                }}
                itemStyle={{ fontSize: '12px' }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, '']}
            />
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
                    isAnimationActive={false} // Disable animation for live feeling updates
                />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
