"""Comprehensive Tracing and Observability for TruthBench.

This module provides full tracing of every action in the simulation:
- LLM prompts and responses
- Trading decisions and executions
- Market states and settlements
- Performance metrics and costs
"""

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class LLMCallTrace:
    """Trace of a single LLM API call."""
    trace_id: str
    timestamp: str
    model_id: str
    market_ticker: str
    
    # Request
    system_prompt: str
    user_prompt: str
    temperature: float
    max_tokens: int
    
    # Response
    raw_response: str
    parsed_successfully: bool
    parse_error: str | None
    
    # Parsed decision (if successful)
    action: str | None
    quantity: int | None
    confidence: float | None
    probability_yes: float | None
    reasoning: str | None
    
    # Performance
    latency_ms: float
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    estimated_cost_usd: float | None


@dataclass
class TradeExecutionTrace:
    """Trace of a trade execution."""
    trace_id: str
    timestamp: str
    model_id: str
    market_ticker: str
    
    # Decision
    action: str
    requested_quantity: int
    
    # Execution
    executed: bool
    executed_quantity: int
    execution_price: float
    total_cost: float
    error: str | None
    
    # Portfolio impact
    bankroll_before: float
    bankroll_after: float
    position_before: dict | None
    position_after: dict | None


@dataclass
class MarketStateTrace:
    """Trace of market state shown to LLMs."""
    trace_id: str
    timestamp: str
    market_ticker: str
    decision_point_index: int
    
    # Market info
    title: str
    rules_primary: str
    current_yes_bid: float
    current_yes_ask: float
    volume: int
    open_interest: int
    
    # Price history summary
    price_history_length: int
    price_at_open: float | None
    price_at_current: float | None
    price_high: float | None
    price_low: float | None
    
    # Hidden ground truth
    actual_result: str


@dataclass
class MarketSettlementTrace:
    """Trace of market settlement."""
    trace_id: str
    timestamp: str
    market_ticker: str
    result: str  # 'yes' or 'no'
    
    # P&L by model
    settlements: list[dict]  # [{model_id, position_side, quantity, pnl}]


@dataclass 
class SimulationTrace:
    """Complete trace of a simulation run."""
    simulation_id: str
    start_time: str
    end_time: str | None
    status: str
    
    # Configuration
    config: dict
    
    # Traces (populated during simulation)
    llm_calls: list[LLMCallTrace] = field(default_factory=list)
    trade_executions: list[TradeExecutionTrace] = field(default_factory=list)
    market_states: list[MarketStateTrace] = field(default_factory=list)
    market_settlements: list[MarketSettlementTrace] = field(default_factory=list)
    
    # Aggregate metrics
    total_llm_calls: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_latency_ms: float = 0.0
    
    # Final results
    final_scores: list[dict] = field(default_factory=list)
    final_rankings: list[str] = field(default_factory=list)


class SimulationTracer:
    """Tracer for capturing all simulation events.
    
    Provides comprehensive observability over the entire simulation,
    capturing every LLM call, trade, and market event.
    """
    
    def __init__(
        self,
        simulation_id: str,
        config: dict,
        output_dir: Path | None = None,
    ):
        """Initialize the tracer.
        
        Args:
            simulation_id: Unique simulation identifier
            config: Simulation configuration dict
            output_dir: Directory to save traces (default: ./traces)
        """
        self.simulation_id = simulation_id
        self.output_dir = output_dir or Path("traces")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self._trace_counter = 0
        
        self.trace = SimulationTrace(
            simulation_id=simulation_id,
            start_time=datetime.now(timezone.utc).isoformat(),
            end_time=None,
            status="running",
            config=config,
        )
        
        logger.info(
            f"SimulationTracer initialized for {simulation_id}",
            extra={"output_dir": str(self.output_dir)},
        )
    
    def _next_trace_id(self) -> str:
        """Generate next trace ID."""
        self._trace_counter += 1
        return f"{self.simulation_id}-{self._trace_counter:06d}"
    
    def trace_llm_call(
        self,
        model_id: str,
        market_ticker: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        raw_response: str,
        parsed_successfully: bool,
        parse_error: str | None = None,
        action: str | None = None,
        quantity: int | None = None,
        confidence: float | None = None,
        probability_yes: float | None = None,
        reasoning: str | None = None,
        latency_ms: float = 0.0,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        total_tokens: int | None = None,
        estimated_cost_usd: float | None = None,
    ) -> LLMCallTrace:
        """Record an LLM API call."""
        trace = LLMCallTrace(
            trace_id=self._next_trace_id(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            model_id=model_id,
            market_ticker=market_ticker,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            raw_response=raw_response,
            parsed_successfully=parsed_successfully,
            parse_error=parse_error,
            action=action,
            quantity=quantity,
            confidence=confidence,
            probability_yes=probability_yes,
            reasoning=reasoning,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=estimated_cost_usd,
        )
        
        self.trace.llm_calls.append(trace)
        self.trace.total_llm_calls += 1
        self.trace.total_latency_ms += latency_ms
        if total_tokens:
            self.trace.total_tokens += total_tokens
        if estimated_cost_usd:
            self.trace.total_cost_usd += estimated_cost_usd
        
        logger.debug(
            f"Traced LLM call: {model_id} -> {action} on {market_ticker}",
            extra={"trace_id": trace.trace_id},
        )
        
        return trace
    
    def trace_trade_execution(
        self,
        model_id: str,
        market_ticker: str,
        action: str,
        requested_quantity: int,
        executed: bool,
        executed_quantity: int,
        execution_price: float,
        total_cost: float,
        error: str | None,
        bankroll_before: float,
        bankroll_after: float,
        position_before: dict | None,
        position_after: dict | None,
    ) -> TradeExecutionTrace:
        """Record a trade execution."""
        trace = TradeExecutionTrace(
            trace_id=self._next_trace_id(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            model_id=model_id,
            market_ticker=market_ticker,
            action=action,
            requested_quantity=requested_quantity,
            executed=executed,
            executed_quantity=executed_quantity,
            execution_price=execution_price,
            total_cost=total_cost,
            error=error,
            bankroll_before=bankroll_before,
            bankroll_after=bankroll_after,
            position_before=position_before,
            position_after=position_after,
        )
        
        self.trace.trade_executions.append(trace)
        
        logger.debug(
            f"Traced trade: {model_id} {action} {executed_quantity}@{execution_price}",
            extra={"trace_id": trace.trace_id, "executed": executed},
        )
        
        return trace
    
    def trace_market_state(
        self,
        market_ticker: str,
        decision_point_index: int,
        title: str,
        rules_primary: str,
        current_yes_bid: float,
        current_yes_ask: float,
        volume: int,
        open_interest: int,
        price_history_length: int,
        price_at_open: float | None,
        price_at_current: float | None,
        price_high: float | None,
        price_low: float | None,
        actual_result: str,
    ) -> MarketStateTrace:
        """Record market state at a decision point."""
        trace = MarketStateTrace(
            trace_id=self._next_trace_id(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            market_ticker=market_ticker,
            decision_point_index=decision_point_index,
            title=title,
            rules_primary=rules_primary,
            current_yes_bid=current_yes_bid,
            current_yes_ask=current_yes_ask,
            volume=volume,
            open_interest=open_interest,
            price_history_length=price_history_length,
            price_at_open=price_at_open,
            price_at_current=price_at_current,
            price_high=price_high,
            price_low=price_low,
            actual_result=actual_result,
        )
        
        self.trace.market_states.append(trace)
        
        logger.debug(
            f"Traced market state: {market_ticker} point {decision_point_index}",
            extra={"trace_id": trace.trace_id},
        )
        
        return trace
    
    def trace_market_settlement(
        self,
        market_ticker: str,
        result: str,
        settlements: list[dict],
    ) -> MarketSettlementTrace:
        """Record market settlement."""
        trace = MarketSettlementTrace(
            trace_id=self._next_trace_id(),
            timestamp=datetime.now(timezone.utc).isoformat(),
            market_ticker=market_ticker,
            result=result,
            settlements=settlements,
        )
        
        self.trace.market_settlements.append(trace)
        
        logger.debug(
            f"Traced settlement: {market_ticker} -> {result}",
            extra={"trace_id": trace.trace_id},
        )
        
        return trace
    
    def set_final_results(
        self,
        scores: list[dict],
        rankings: list[str],
    ) -> None:
        """Set final simulation results."""
        self.trace.final_scores = scores
        self.trace.final_rankings = rankings
        self.trace.status = "completed"
        self.trace.end_time = datetime.now(timezone.utc).isoformat()
    
    def set_error(self, error_message: str) -> None:
        """Mark simulation as errored."""
        self.trace.status = "error"
        self.trace.end_time = datetime.now(timezone.utc).isoformat()
    
    def _dataclass_to_dict(self, obj: Any) -> Any:
        """Recursively convert dataclasses to dicts."""
        if hasattr(obj, '__dataclass_fields__'):
            return {k: self._dataclass_to_dict(v) for k, v in asdict(obj).items()}
        elif isinstance(obj, list):
            return [self._dataclass_to_dict(item) for item in obj]
        elif isinstance(obj, dict):
            return {k: self._dataclass_to_dict(v) for k, v in obj.items()}
        return obj
    
    def save(self) -> Path:
        """Save trace to JSON file.
        
        Returns:
            Path to saved file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"truthbench_{self.simulation_id}_{timestamp}.json"
        filepath = self.output_dir / filename
        
        # Convert to dict
        trace_dict = self._dataclass_to_dict(self.trace)
        
        with open(filepath, "w") as f:
            json.dump(trace_dict, f, indent=2, default=str)
        
        logger.info(
            f"Saved simulation trace to {filepath}",
            extra={
                "filepath": str(filepath),
                "llm_calls": len(self.trace.llm_calls),
                "trades": len(self.trace.trade_executions),
                "total_cost": self.trace.total_cost_usd,
            },
        )
        
        return filepath
    
    def get_summary(self) -> dict:
        """Get a summary of the trace."""
        return {
            "simulation_id": self.simulation_id,
            "status": self.trace.status,
            "start_time": self.trace.start_time,
            "end_time": self.trace.end_time,
            "total_llm_calls": self.trace.total_llm_calls,
            "total_tokens": self.trace.total_tokens,
            "total_cost_usd": round(self.trace.total_cost_usd, 4),
            "total_latency_ms": round(self.trace.total_latency_ms, 2),
            "avg_latency_ms": round(
                self.trace.total_latency_ms / max(1, self.trace.total_llm_calls), 2
            ),
            "markets_processed": len(self.trace.market_settlements),
            "trades_executed": len([
                t for t in self.trace.trade_executions if t.executed
            ]),
        }

