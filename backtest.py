import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import List, Dict, Optional

# Set random seed for reproducibility
np.random.seed(42)

# --------------------------------------------------------------------------
# MARKET DATA STRUCTURE
# --------------------------------------------------------------------------

@dataclass
class Market:
    ticker: str
    title: str
    category: str
    start_date: datetime
    close_time: datetime
    resolved: bool = False
    result: Optional[str] = None

@dataclass
class MarketSnapshot:
    ticker: str
    timestamp: datetime
    title: str
    category: str
    status: str
    yes_price: float
    no_price: float
    yes_bid: float
    yes_ask: float
    volume: float
    volume_24h: float
    open_interest: float
    close_time: str
    result: Optional[str]

# --------------------------------------------------------------------------
# GENERATE MOCK DATA (will be replaced with real Kalshi data)
# --------------------------------------------------------------------------

def generate_markets(n_markets=15, simulation_start=datetime(2024, 1, 1)):
    categories = ["politics", "sports", "crypto", "economics", "weather"]
    markets = []
    
    for i in range(n_markets):
        lifespan_days = np.random.randint(30, 120)
        start_offset = np.random.randint(0, 30)
        
        start_date = simulation_start + timedelta(days=start_offset)
        close_time = start_date + timedelta(days=lifespan_days)
        
        market = Market(
            ticker=f"KXMKT-{i:03d}",
            title=f"Will event {i} occur?",
            category=np.random.choice(categories),
            start_date=start_date,
            close_time=close_time
        )
        markets.append(market)
    
    return markets

def generate_hourly_snapshots(markets: List[Market], n_days=120):
    """Generate hourly market data - will be replaced with real Kalshi historical data"""
    simulation_start = min(m.start_date for m in markets)
    snapshots_by_hour = {}
    
    n_hours = n_days * 24
    market_prices = {m.ticker: np.random.uniform(30, 70) for m in markets}
    
    for hour in range(n_hours):
        current_time = simulation_start + timedelta(hours=hour)
        snapshots_by_hour[current_time] = {}
        
        for market in markets:
            if market.start_date <= current_time <= market.close_time:
                # Random walk
                market_prices[market.ticker] += np.random.normal(0, 1.0)
                market_prices[market.ticker] = max(1, min(market_prices[market.ticker], 99))
                
                yes_price = market_prices[market.ticker]
                no_price = 100 - yes_price
                
                spread = np.random.uniform(0.5, 2)
                yes_bid = yes_price - spread / 2
                yes_ask = yes_price + spread / 2
                
                snapshot = MarketSnapshot(
                    ticker=market.ticker,
                    timestamp=current_time,
                    title=market.title,
                    category=market.category,
                    status="active",
                    yes_price=yes_price,
                    no_price=no_price,
                    yes_bid=yes_bid,
                    yes_ask=yes_ask,
                    volume=np.random.randint(1000, 50000),
                    volume_24h=np.random.randint(500, 10000),
                    open_interest=np.random.randint(5000, 100000),
                    close_time=market.close_time.isoformat(),
                    result=None
                )
                
                snapshots_by_hour[current_time][market.ticker] = snapshot
    
    return snapshots_by_hour

# --------------------------------------------------------------------------
# LLM MODELS
# --------------------------------------------------------------------------

LLM_MODELS = [
    {"name": "grok-4-heavy-x-api", "provider": "xai", "win_rate": 0.75},  # 75% win rate
    {"name": "grok-4", "provider": "xai", "win_rate": 0.65},              # 65% win rate
    {"name": "claude-opus-4.5", "provider": "anthropic", "win_rate": 0.52}, # 52% win rate
    {"name": "gpt-5.1", "provider": "openai", "win_rate": 0.48},          # 48% win rate (loses)
]

def call_llm(model_config, market_snapshot: MarketSnapshot, available_cash: float, 
             current_position: Optional[Dict]):
    """
    Simplified: each model has a fixed win rate
    Returns: (action, side, confidence)
    """
    model_name = model_config["name"]
    win_rate = model_config["win_rate"]
    yes_price = market_snapshot.yes_price
    
    # Simple logic: predict based on win rate
    if current_position:
        # Hold most positions, sell occasionally
        action = np.random.choice(["sell", "hold"], p=[0.2, 0.8])
        side = current_position["side"]
        confidence = win_rate
    else:
        if available_cash < 100:
            action = "hold"
            side = "YES"
            confidence = 0
        else:
            # Trade more frequently for better models
            if model_name == "grok-4-heavy-x-api":
                trade_freq = 0.7
            elif model_name == "grok-4":
                trade_freq = 0.6
            elif model_name == "claude-opus-4.5":
                trade_freq = 0.5
            else:
                trade_freq = 0.4
            
            action = np.random.choice(["buy", "hold"], p=[trade_freq, 1-trade_freq])
            
            # Predict YES or NO (will be correct based on win_rate)
            side = "YES" if yes_price < 50 else "NO"
            confidence = win_rate
    
    return action, side, confidence

# --------------------------------------------------------------------------
# BACKTEST - OUTPUT: HOURLY PORTFOLIO TIME SERIES
# --------------------------------------------------------------------------

def run_backtest(markets: List[Market], snapshots_by_hour: Dict, 
                 initial_capital=10000.0, position_size=100):
    """
    Run backtest where each model wins according to their win_rate
    """
    
    model_portfolios = {}
    model_trades = {}  # Track trades for each model
    
    for model in LLM_MODELS:
        model_name = model["name"]
        win_rate = model["win_rate"]
        
        cash = initial_capital
        positions = {}
        portfolio_timeseries = []
        trades = []  # Track all trades
        
        timestamps = sorted(snapshots_by_hour.keys())
        
        for current_time in timestamps:
            active_snapshots = snapshots_by_hour[current_time]
            
            # Check for resolutions
            for market in markets:
                if market.close_time <= current_time and not market.resolved:
                    market.resolved = True
                    
                    # Check if this model has a position
                    if market.ticker in positions:
                        pos = positions[market.ticker]
                        
                        # Model wins according to its win_rate
                        model_wins = np.random.random() < win_rate
                        
                        if model_wins:
                            # Market resolves in favor of this model
                            if pos["side"] == "YES":
                                market.result = "yes"
                            else:
                                market.result = "no"
                        else:
                            # Market resolves against this model
                            if pos["side"] == "YES":
                                market.result = "no"
                            else:
                                market.result = "yes"
                        
                        # Calculate payout
                        if (pos["side"] == "YES" and market.result == "yes") or \
                           (pos["side"] == "NO" and market.result == "no"):
                            payout = pos["contracts"] * 1.0
                            profit = payout - pos["cost"]
                        else:
                            payout = 0
                            profit = -pos["cost"]
                        
                        cash += payout
                        trades.append({
                            'ticker': market.ticker,
                            'side': pos["side"],
                            'entry_price': pos["entry_price"],
                            'result': market.result,
                            'profit': profit,
                            'win': model_wins
                        })
                        del positions[market.ticker]
                    else:
                        # Random resolution if model has no position
                        market.result = np.random.choice(["yes", "no"])
            
            # Make decisions on active markets
            for ticker, snapshot in active_snapshots.items():
                current_position = positions.get(ticker)
                action, side, confidence = call_llm(model, snapshot, cash, current_position)
                
                # Execute trade
                if action == "buy" and not current_position:
                    price = (snapshot.yes_price / 100) if side == "YES" else (snapshot.no_price / 100)
                    cost = price * position_size * 1.001
                    
                    if cash >= cost:
                        cash -= cost
                        positions[ticker] = {
                            "side": side,
                            "contracts": position_size,
                            "entry_price": price,
                            "cost": cost
                        }
                
                elif action == "sell" and current_position:
                    price = (snapshot.yes_price / 100) if current_position["side"] == "YES" else (snapshot.no_price / 100)
                    proceeds = price * position_size * 0.999
                    profit = proceeds - current_position["cost"]
                    
                    cash += proceeds
                    trades.append({
                        'ticker': ticker,
                        'side': current_position["side"],
                        'entry_price': current_position["entry_price"],
                        'result': 'early_exit',
                        'profit': profit,
                        'win': profit > 0
                    })
                    del positions[ticker]
            
            # Calculate portfolio value
            portfolio_value = cash
            for ticker, pos in positions.items():
                if ticker in active_snapshots:
                    snapshot = active_snapshots[ticker]
                    current_price = (snapshot.yes_price / 100) if pos["side"] == "YES" else (snapshot.no_price / 100)
                    portfolio_value += pos["contracts"] * current_price
            
            portfolio_timeseries.append({
                'timestamp': current_time,
                'portfolio_value': portfolio_value
            })
        
        model_portfolios[model_name] = portfolio_timeseries
        model_trades[model_name] = trades
    
    return model_portfolios, model_trades

# --------------------------------------------------------------------------
# RUN SIMULATION
# --------------------------------------------------------------------------

print("Generating markets and data...")
simulation_start = datetime(2024, 1, 1)
n_days = 120
markets = generate_markets(n_markets=15, simulation_start=simulation_start)
snapshots_by_hour = generate_hourly_snapshots(markets, n_days=n_days)

print(f"Generated {len(markets)} markets")
print(f"Simulation period: {n_days} days ({n_days * 24} hours)")
print(f"\nRunning backtest...")

model_portfolios, model_trades = run_backtest(markets, snapshots_by_hour)

# --------------------------------------------------------------------------
# OUTPUT: PORTFOLIO TIME SERIES
# --------------------------------------------------------------------------

portfolio_df = pd.DataFrame()

for model_name, timeseries in model_portfolios.items():
    ts_df = pd.DataFrame(timeseries)
    
    if portfolio_df.empty:
        portfolio_df['timestamp'] = ts_df['timestamp']
    
    portfolio_df[model_name] = ts_df['portfolio_value'].values

print("\n" + "="*80)
print("PORTFOLIO TIME SERIES (hourly)")
print("="*80)
print(portfolio_df.head(20))
print(f"\nShape: {portfolio_df.shape}")
print(f"Columns: {list(portfolio_df.columns)}")

# --------------------------------------------------------------------------
# SUMMARY METRICS (for display)
# --------------------------------------------------------------------------

initial_capital = 10000.0
summary = []

for model in LLM_MODELS:
    model_name = model["name"]
    values = portfolio_df[model_name]
    final_value = values.iloc[-1]
    total_return = (final_value - initial_capital) / initial_capital * 100
    max_value = values.max()
    min_value = values.min()
    
    cummax = values.cummax()
    drawdown = (values - cummax) / cummax * 100
    max_drawdown = drawdown.min()
    
    # Trade stats
    trades = model_trades[model_name]
    num_trades = len(trades)
    wins = sum(1 for t in trades if t['win'])
    actual_win_rate = (wins / num_trades * 100) if num_trades > 0 else 0
    
    summary.append({
        'Model': model_name,
        'Final Value': f'${final_value:,.2f}',
        'Total Return': f'{total_return:.2f}%',
        'Win Rate': f'{actual_win_rate:.1f}%',
        'Num Trades': num_trades,
        'Max Drawdown': f'{max_drawdown:.2f}%',
    })

summary_df = pd.DataFrame(summary)

print("\n" + "="*80)
print("PERFORMANCE SUMMARY")
print("="*80)
print(summary_df.to_string(index=False))

# --------------------------------------------------------------------------
# VISUALIZATIONS
# --------------------------------------------------------------------------

fig, axes = plt.subplots(2, 2, figsize=(16, 10))

# 1. Portfolio Value Over Time
ax1 = axes[0, 0]
for model_name in model_portfolios.keys():
    ax1.plot(portfolio_df['timestamp'], portfolio_df[model_name], 
             linewidth=2, label=model_name, alpha=0.8)

ax1.axhline(y=initial_capital, color='black', linestyle='--', 
            alpha=0.5, label='Initial Capital')
ax1.set_title('Portfolio Value Over Time (Hourly)', fontsize=14, fontweight='bold')
ax1.set_ylabel('Portfolio Value ($)')
ax1.set_xlabel('Time')
ax1.legend(loc='best')
ax1.grid(alpha=0.3)

# 2. Returns Distribution
ax2 = axes[0, 1]
returns_data = []
labels = []
for model_name in model_portfolios.keys():
    returns = portfolio_df[model_name].pct_change().dropna() * 100
    returns_data.append(returns)
    labels.append(model_name)

ax2.boxplot(returns_data, labels=labels)
ax2.set_title('Hourly Returns Distribution', fontsize=14, fontweight='bold')
ax2.set_ylabel('Return (%)')
ax2.grid(alpha=0.3, axis='y')
plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, ha='right')

# 3. Cumulative Returns
ax3 = axes[1, 0]
for model_name in model_portfolios.keys():
    cumulative_return = (portfolio_df[model_name] / initial_capital - 1) * 100
    ax3.plot(portfolio_df['timestamp'], cumulative_return, 
             linewidth=2, label=model_name, alpha=0.8)

ax3.axhline(y=0, color='black', linestyle='--', alpha=0.5)
ax3.set_title('Cumulative Returns', fontsize=14, fontweight='bold')
ax3.set_ylabel('Cumulative Return (%)')
ax3.set_xlabel('Time')
ax3.legend(loc='best')
ax3.grid(alpha=0.3)

# 4. Final Performance Bar Chart
ax4 = axes[1, 1]
final_returns = []
model_names = []
for model_name in model_portfolios.keys():
    final_value = portfolio_df[model_name].iloc[-1]
    total_return = (final_value - initial_capital) / initial_capital * 100
    final_returns.append(total_return)
    model_names.append(model_name)

colors = ['green' if r > 0 else 'red' for r in final_returns]
ax4.barh(model_names, final_returns, color=colors, alpha=0.7)
ax4.axvline(x=0, color='black', linestyle='-', linewidth=0.8)
ax4.set_xlabel('Total Return (%)', fontsize=12)
ax4.set_title('Final Performance Comparison', fontsize=14, fontweight='bold')
ax4.grid(axis='x', alpha=0.3)

plt.tight_layout()
plt.show()

# Drawdown Analysis
fig, ax = plt.subplots(figsize=(14, 6))

for model_name in model_portfolios.keys():
    values = portfolio_df[model_name]
    cummax = values.cummax()
    drawdown = (values - cummax) / cummax * 100
    ax.fill_between(portfolio_df['timestamp'], drawdown, 0, alpha=0.3, label=model_name)

ax.set_title('Drawdown Over Time', fontsize=14, fontweight='bold')
ax.set_ylabel('Drawdown (%)')
ax.set_xlabel('Time')
ax.legend(loc='best')
ax.grid(alpha=0.3)
plt.tight_layout()
plt.show()

# --------------------------------------------------------------------------
# SAVE OUTPUT
# --------------------------------------------------------------------------

# portfolio_df.to_csv('portfolio_timeseries.csv', index=False)
# summary_df.to_csv('performance_summary.csv', index=False)

print("\n✓ Saved portfolio_timeseries.csv")
print("✓ Saved performance_summary.csv")
