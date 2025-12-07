"""Data models for TruthBench simulation.

This module defines the core data structures used throughout the simulation:
- TradingDecision: An LLM's decision on a market
- Position: A holding in a specific market
- Portfolio: An LLM's complete trading state
- MarketState: Current state of a market at a timestep
- SimulationConfig: Configuration for running a simulation
- SimulationStatus: Real-time status of a running simulation
- SimulationResult: Final results and scores
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Literal


class Action(str, Enum):
    """Trading actions an LLM can take."""
    BUY_YES = "buy_yes"
    BUY_NO = "buy_no"
    HOLD = "hold"
    SELL_YES = "sell_yes"
    SELL_NO = "sell_no"


@dataclass
class TradingDecision:
    """A trading decision made by an LLM.
    
    Attributes:
        model_id: The LLM model identifier
        market_ticker: The Kalshi market ticker
        timestamp: Unix timestamp when decision was made
        action: The trading action taken
        quantity: Number of contracts to trade
        confidence: Confidence level 0-100
        reasoning: LLM's explanation for the decision
        probability_yes: LLM's estimated probability of YES outcome (0-1)
    """
    model_id: str
    market_ticker: str
    timestamp: int
    action: Action
    quantity: int
    confidence: float
    reasoning: str
    probability_yes: float = 0.5


@dataclass
class Position:
    """A position held in a market.
    
    Attributes:
        market_ticker: The Kalshi market ticker
        side: Whether holding YES or NO contracts
        quantity: Number of contracts held
        avg_price: Average entry price in cents (0-100)
        entry_timestamp: When position was opened
    """
    market_ticker: str
    side: Literal["yes", "no"]
    quantity: int
    avg_price: float
    entry_timestamp: int


@dataclass
class Portfolio:
    """An LLM's complete trading state.
    
    Attributes:
        model_id: The LLM model identifier
        model_name: Human-readable model name
        bankroll: Available cash in cents
        initial_bankroll: Starting bankroll for ROI calculation
        positions: Dict of market_ticker -> Position
        pnl_history: List of {timestamp, bankroll, unrealized_pnl}
        decisions: List of all trading decisions made
        total_trades: Count of executed trades
        winning_trades: Count of profitable trades
    """
    model_id: str
    model_name: str
    bankroll: float
    initial_bankroll: float
    positions: dict[str, Position] = field(default_factory=dict)
    pnl_history: list[dict] = field(default_factory=list)
    decisions: list[TradingDecision] = field(default_factory=list)
    total_trades: int = 0
    winning_trades: int = 0


@dataclass
class Candlestick:
    """A single candlestick data point.
    
    Attributes:
        timestamp: Unix timestamp (end of period)
        yes_bid: Best bid price for YES
        yes_ask: Best ask price for YES
        price_close: Last traded price
        volume: Volume traded in period
        open_interest: Total open contracts
    """
    timestamp: int
    yes_bid: float
    yes_ask: float
    price_close: float
    volume: int
    open_interest: int


@dataclass
class MarketState:
    """Current state of a market at a specific timestep.
    
    This represents what an LLM would "see" when evaluating a market,
    containing only information available up to the current timestep.
    
    Attributes:
        ticker: Market ticker
        title: Market title/question
        rules_primary: Primary resolution rules
        rules_secondary: Additional rules
        current_timestamp: Current simulation time
        open_time: When market opened
        close_time: When market closes
        current_yes_bid: Current best bid for YES
        current_yes_ask: Current best ask for YES
        current_price: Last traded price
        volume: Total volume traded
        open_interest: Current open interest
        price_history: List of candlesticks up to current time
        result: Ground truth result (hidden from LLMs during simulation)
    """
    ticker: str
    title: str
    rules_primary: str
    rules_secondary: str | None
    current_timestamp: int
    open_time: str
    close_time: str
    current_yes_bid: float
    current_yes_ask: float
    current_price: float
    volume: int
    open_interest: int
    price_history: list[Candlestick]
    result: str  # Hidden from LLMs, used for settlement


@dataclass
class SimulationConfig:
    """Configuration for running a TruthBench simulation.
    
    Attributes:
        models: List of model IDs to evaluate
        markets_file: Path to resolved markets JSON file
        initial_bankroll: Starting bankroll per model (in cents)
        max_position_pct: Max % of bankroll per position
        timestep_interval: Minutes between decision points (60=hourly, 1440=daily)
        max_markets: Limit number of markets (None = all)
        min_volume: Minimum market volume to include
        speed_multiplier: Simulation speed (1.0 = real-time replay)
    """
    models: list[str]
    markets_file: str = "resolved_markets_with_history.json"
    initial_bankroll: float = 10000_00  # $10,000 in cents
    max_position_pct: float = 0.10  # 10% max per position
    timestep_interval: int = 60  # Hourly
    max_markets: int | None = None
    min_volume: int = 1000
    speed_multiplier: float = 100.0  # 100x speed by default


@dataclass
class ModelScore:
    """Scoring metrics for a single model.
    
    Attributes:
        model_id: The model identifier
        model_name: Human-readable name
        roi: Return on investment (final/initial - 1)
        final_bankroll: Ending bankroll
        brier_score: Calibration score (lower is better)
        accuracy: % of correct directional predictions
        win_rate: % of profitable trades
        total_trades: Number of trades executed
        sharpe_ratio: Risk-adjusted returns
    """
    model_id: str
    model_name: str
    roi: float
    final_bankroll: float
    brier_score: float
    accuracy: float
    win_rate: float
    total_trades: int
    sharpe_ratio: float


@dataclass
class SimulationStatus:
    """Real-time status of a running simulation.
    
    Attributes:
        simulation_id: Unique simulation identifier
        status: Current state (running, paused, completed, error)
        current_market: Market currently being evaluated
        current_timestep: Current simulation timestamp
        markets_completed: Number of markets finished
        total_markets: Total markets in simulation
        portfolios: Current state of all portfolios
        recent_decisions: Last N trading decisions
        elapsed_time: Seconds since start
        estimated_remaining: Estimated seconds to completion
    """
    simulation_id: str
    status: Literal["initializing", "running", "paused", "completed", "error"]
    current_market: str | None
    current_timestep: int | None
    markets_completed: int
    total_markets: int
    portfolios: list[Portfolio]
    recent_decisions: list[TradingDecision]
    elapsed_time: float
    estimated_remaining: float | None
    error_message: str | None = None


@dataclass
class SimulationResult:
    """Final results of a completed simulation.
    
    Attributes:
        simulation_id: Unique simulation identifier
        config: The configuration used
        start_time: When simulation started
        end_time: When simulation completed
        scores: List of scores per model
        rankings: Model IDs in order of performance (by ROI)
        all_decisions: Complete decision history
        market_results: Per-market breakdown
    """
    simulation_id: str
    config: SimulationConfig
    start_time: datetime
    end_time: datetime
    scores: list[ModelScore]
    rankings: list[str]
    all_decisions: list[TradingDecision]
    market_results: list[dict]

