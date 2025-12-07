"""TruthBench - LLM Prediction Market Benchmark.

A simulation framework for evaluating LLM performance on prediction markets
using historical resolved Kalshi data.
"""

from .models import (
    Action,
    TradingDecision,
    Position,
    Portfolio,
    Candlestick,
    MarketState,
    SimulationConfig,
    ModelScore,
    SimulationStatus,
    SimulationResult,
)
from .replay import MarketReplayEngine
from .decision import LLMDecisionEngine, DecisionResult
from .portfolio import PortfolioManager, TradeExecution
from .scoring import ScoringEngine
from .simulation import TruthBenchSimulation
from .tracing import SimulationTracer, SimulationTrace, LLMCallTrace

__all__ = [
    # Models
    "Action",
    "TradingDecision",
    "Position",
    "Portfolio",
    "Candlestick",
    "MarketState",
    "SimulationConfig",
    "ModelScore",
    "SimulationStatus",
    "SimulationResult",
    # Engines
    "MarketReplayEngine",
    "LLMDecisionEngine",
    "DecisionResult",
    "PortfolioManager",
    "TradeExecution",
    "ScoringEngine",
    "TruthBenchSimulation",
    # Tracing
    "SimulationTracer",
    "SimulationTrace",
    "LLMCallTrace",
]

