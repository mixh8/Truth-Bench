"""Main TruthBench Simulation Orchestrator.

This module ties together all components to run the complete
benchmark simulation, coordinating market replay, LLM decisions,
portfolio management, and scoring.
"""

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .decision import LLMDecisionEngine, SYSTEM_PROMPT, build_market_prompt
from .models import (
    Action,
    MarketState,
    ModelScore,
    Portfolio,
    SimulationConfig,
    SimulationResult,
    SimulationStatus,
    TradingDecision,
)
from .portfolio import PortfolioManager
from .replay import MarketReplayEngine
from .scoring import ScoringEngine
from .tracing import SimulationTracer

logger = logging.getLogger(__name__)


class TruthBenchSimulation:
    """Main orchestrator for TruthBench benchmark simulations.
    
    Coordinates all components to run a complete simulation:
    1. Load historical market data
    2. Step through markets chronologically
    3. Query LLMs for trading decisions
    4. Execute trades and track portfolios
    5. Settle markets and calculate scores
    6. Stream real-time updates
    """
    
    def __init__(
        self,
        config: SimulationConfig,
        llm_client: Any,
        model_names: dict[str, str] | None = None,
    ):
        """Initialize the simulation.
        
        Args:
            config: Simulation configuration
            llm_client: LLM client for making API calls
            model_names: Optional dict mapping model_id -> display name
        """
        self.simulation_id = str(uuid.uuid4())[:8]
        self.config = config
        self.llm_client = llm_client
        
        # Default model names
        self.model_names = model_names or {
            model_id: model_id.split("/")[-1].replace("-", " ").title()
            for model_id in config.models
        }
        
        # Initialize components
        self.replay_engine = MarketReplayEngine(config)
        self.decision_engine = LLMDecisionEngine(llm_client, rate_limit_delay=1.0)
        self.portfolio_manager = PortfolioManager(
            model_ids=config.models,
            model_names=self.model_names,
            initial_bankroll=config.initial_bankroll,
            max_position_pct=config.max_position_pct,
        )
        self.scoring_engine = ScoringEngine()
        
        # State tracking
        self._status = "initializing"
        self._current_market: str | None = None
        self._current_timestep: int | None = None
        self._markets_completed = 0
        self._start_time: datetime | None = None
        self._end_time: datetime | None = None
        self._recent_decisions: list[TradingDecision] = []
        self._all_decisions: list[TradingDecision] = []
        self._market_results: list[dict] = []
        self._error_message: str | None = None
        self._stop_requested = False
        
        # Callbacks for streaming updates
        self._update_callbacks: list[Callable[[SimulationStatus], None]] = []
        
        # Initialize tracer for full observability
        self.tracer = SimulationTracer(
            simulation_id=self.simulation_id,
            config={
                "models": config.models,
                "initial_bankroll": config.initial_bankroll,
                "max_position_pct": config.max_position_pct,
                "max_markets": config.max_markets,
                "min_volume": config.min_volume,
                "timestep_interval": config.timestep_interval,
            },
        )
        
        logger.info(
            f"TruthBenchSimulation {self.simulation_id} initialized",
            extra={
                "models": config.models,
                "initial_bankroll": config.initial_bankroll,
            },
        )
    
    def add_update_callback(
        self,
        callback: Callable[[SimulationStatus], None],
    ) -> None:
        """Add a callback to receive status updates.
        
        Args:
            callback: Function to call with SimulationStatus
        """
        self._update_callbacks.append(callback)
    
    def _broadcast_status(self) -> None:
        """Broadcast current status to all callbacks."""
        status = self.get_status()
        for callback in self._update_callbacks:
            try:
                callback(status)
            except Exception as e:
                logger.error(f"Error in update callback: {e}")
    
    def get_status(self) -> SimulationStatus:
        """Get current simulation status."""
        elapsed = 0.0
        if self._start_time:
            elapsed = (datetime.now(timezone.utc) - self._start_time).total_seconds()
        
        # Estimate remaining time
        estimated_remaining = None
        if self._markets_completed > 0 and self._status == "running":
            total_markets = self.replay_engine.get_total_markets()
            remaining_markets = total_markets - self._markets_completed
            time_per_market = elapsed / self._markets_completed
            estimated_remaining = remaining_markets * time_per_market
        
        return SimulationStatus(
            simulation_id=self.simulation_id,
            status=self._status,
            current_market=self._current_market,
            current_timestep=self._current_timestep,
            markets_completed=self._markets_completed,
            total_markets=self.replay_engine.get_total_markets(),
            portfolios=self.portfolio_manager.get_all_portfolios(),
            recent_decisions=self._recent_decisions[-10:],
            elapsed_time=elapsed,
            estimated_remaining=estimated_remaining,
            error_message=self._error_message,
        )
    
    def stop(self) -> None:
        """Request the simulation to stop."""
        logger.info(f"Stop requested for simulation {self.simulation_id}")
        self._stop_requested = True
    
    async def run(
        self,
        base_path: Path | None = None,
        decision_points_per_market: int = 3,
    ) -> SimulationResult:
        """Run the complete simulation.
        
        Args:
            base_path: Base path for finding market data file
            decision_points_per_market: Number of times to query LLMs per market
            
        Returns:
            SimulationResult with final scores
        """
        self._start_time = datetime.now(timezone.utc)
        self._status = "running"
        self._broadcast_status()
        
        try:
            # Load markets
            logger.info("Loading markets...")
            num_markets = self.replay_engine.load_markets(base_path)
            logger.info(f"Loaded {num_markets} markets")
            
            if num_markets == 0:
                raise ValueError("No markets loaded - check file path and filters")
            
            self._broadcast_status()
            
            # Process each market
            for market in self.replay_engine.markets:
                if self._stop_requested:
                    logger.info("Simulation stopped by user request")
                    self._status = "paused"
                    break
                
                self._current_market = market.ticker
                logger.info(f"Processing market: {market.ticker}")
                
                # Get decision points for this market
                decision_points = self.replay_engine.get_decision_points(
                    market,
                    num_points=decision_points_per_market,
                )
                
                # Query LLMs at each decision point
                for dp_idx, state in enumerate(decision_points):
                    if self._stop_requested:
                        break
                    
                    self._current_timestep = state.current_timestamp
                    
                    # Trace market state
                    prices = [c.price_close for c in state.price_history if c.price_close]
                    self.tracer.trace_market_state(
                        market_ticker=state.ticker,
                        decision_point_index=dp_idx,
                        title=state.title,
                        rules_primary=state.rules_primary,
                        current_yes_bid=state.current_yes_bid,
                        current_yes_ask=state.current_yes_ask,
                        volume=state.volume,
                        open_interest=state.open_interest,
                        price_history_length=len(state.price_history),
                        price_at_open=prices[0] if prices else None,
                        price_at_current=prices[-1] if prices else None,
                        price_high=max(prices) if prices else None,
                        price_low=min(prices) if prices else None,
                        actual_result=state.result,
                    )
                    
                    # Get decisions from all models with tracing
                    for model_id in self.config.models:
                        portfolio = self.portfolio_manager.get_portfolio(model_id)
                        if not portfolio:
                            continue
                        
                        # Build prompts for tracing
                        user_prompt = build_market_prompt(state, portfolio)
                        
                        # Time the LLM call
                        start_time = time.time()
                        result = await self.decision_engine.get_decision(
                            model_id, state, portfolio
                        )
                        latency_ms = (time.time() - start_time) * 1000
                        
                        # Trace the LLM call
                        self.tracer.trace_llm_call(
                            model_id=model_id,
                            market_ticker=state.ticker,
                            system_prompt=SYSTEM_PROMPT,
                            user_prompt=user_prompt,
                            temperature=0.3,
                            max_tokens=500,
                            raw_response=result.raw_response,
                            parsed_successfully=result.success,
                            parse_error=result.error,
                            action=result.decision.action.value if result.decision else None,
                            quantity=result.decision.quantity if result.decision else None,
                            confidence=result.decision.confidence if result.decision else None,
                            probability_yes=result.decision.probability_yes if result.decision else None,
                            reasoning=result.decision.reasoning if result.decision else None,
                            latency_ms=latency_ms,
                        )
                        
                        if result.success and result.decision:
                            decision = result.decision
                            
                            # Get portfolio state before trade
                            bankroll_before = portfolio.bankroll
                            position_before = None
                            if state.ticker in portfolio.positions:
                                pos = portfolio.positions[state.ticker]
                                position_before = {
                                    "side": pos.side,
                                    "quantity": pos.quantity,
                                    "avg_price": pos.avg_price,
                                }
                            
                            # Execute trade
                            execution = self.portfolio_manager.execute_decision(
                                decision,
                                state,
                            )
                            
                            # Get portfolio state after trade
                            bankroll_after = portfolio.bankroll
                            position_after = None
                            if state.ticker in portfolio.positions:
                                pos = portfolio.positions[state.ticker]
                                position_after = {
                                    "side": pos.side,
                                    "quantity": pos.quantity,
                                    "avg_price": pos.avg_price,
                                }
                            
                            # Trace trade execution
                            self.tracer.trace_trade_execution(
                                model_id=model_id,
                                market_ticker=state.ticker,
                                action=decision.action.value,
                                requested_quantity=decision.quantity,
                                executed=execution.success,
                                executed_quantity=execution.quantity,
                                execution_price=execution.price,
                                total_cost=execution.cost,
                                error=execution.error,
                                bankroll_before=bankroll_before,
                                bankroll_after=bankroll_after,
                                position_before=position_before,
                                position_after=position_after,
                            )
                            
                            # Record for scoring
                            self.scoring_engine.record_prediction(
                                decision,
                                market.result,
                            )
                            
                            # Track decision
                            self._all_decisions.append(decision)
                            self._recent_decisions.append(decision)
                            if len(self._recent_decisions) > 50:
                                self._recent_decisions = self._recent_decisions[-50:]
                    
                    # Record portfolio snapshot
                    self.portfolio_manager.record_snapshot(state.current_timestamp)
                    self._broadcast_status()
                
                # Settle the market
                pnl_by_model = self.portfolio_manager.settle_market(
                    market.ticker,
                    market.result,
                )
                
                # Trace settlement
                settlements = [
                    {"model_id": model_id, "pnl": pnl}
                    for model_id, pnl in pnl_by_model.items()
                ]
                self.tracer.trace_market_settlement(
                    market_ticker=market.ticker,
                    result=market.result,
                    settlements=settlements,
                )
                
                # Record market result
                self._market_results.append({
                    "ticker": market.ticker,
                    "title": market.title,
                    "result": market.result,
                    "pnl_by_model": pnl_by_model,
                })
                
                self._markets_completed += 1
                self._broadcast_status()
                
                # Small delay between markets
                await asyncio.sleep(0.1)
            
            # Calculate final scores
            self._status = "completed"
            self._end_time = datetime.now(timezone.utc)
            
            portfolios = self.portfolio_manager.get_all_portfolios()
            scores = self.scoring_engine.calculate_all_scores(portfolios)
            rankings = self.scoring_engine.get_rankings(scores)
            
            # Log results
            report = self.scoring_engine.generate_report(scores)
            logger.info(f"\n{report}")
            
            # Save trace with final results
            self.tracer.set_final_results(
                scores=self.scoring_engine.to_dict(scores),
                rankings=rankings,
            )
            trace_path = self.tracer.save()
            logger.info(f"Simulation trace saved to {trace_path}")
            
            # Log trace summary
            summary = self.tracer.get_summary()
            logger.info(
                f"Trace summary: {summary['total_llm_calls']} LLM calls, "
                f"${summary['total_cost_usd']:.4f} total cost, "
                f"{summary['avg_latency_ms']:.0f}ms avg latency"
            )
            
            self._broadcast_status()
            
            return SimulationResult(
                simulation_id=self.simulation_id,
                config=self.config,
                start_time=self._start_time,
                end_time=self._end_time,
                scores=scores,
                rankings=rankings,
                all_decisions=self._all_decisions,
                market_results=self._market_results,
            )
            
        except Exception as e:
            logger.error(f"Simulation error: {e}", exc_info=True)
            self._status = "error"
            self._error_message = str(e)
            
            # Save trace even on error
            self.tracer.set_error(str(e))
            try:
                trace_path = self.tracer.save()
                logger.info(f"Error trace saved to {trace_path}")
            except Exception as save_error:
                logger.error(f"Failed to save error trace: {save_error}")
            
            self._broadcast_status()
            raise
    
    async def stream_updates(self) -> AsyncIterator[dict]:
        """Stream simulation updates as they happen.
        
        Yields:
            Dict representation of SimulationStatus
        """
        last_markets_completed = -1
        
        while self._status in ("initializing", "running"):
            if self._markets_completed != last_markets_completed:
                last_markets_completed = self._markets_completed
                status = self.get_status()
                yield self._status_to_dict(status)
            
            await asyncio.sleep(0.5)
        
        # Final status
        status = self.get_status()
        yield self._status_to_dict(status)
    
    def _status_to_dict(self, status: SimulationStatus) -> dict:
        """Convert SimulationStatus to a JSON-serializable dict."""
        return {
            "simulation_id": status.simulation_id,
            "status": status.status,
            "current_market": status.current_market,
            "current_timestep": status.current_timestep,
            "markets_completed": status.markets_completed,
            "total_markets": status.total_markets,
            "elapsed_time": status.elapsed_time,
            "estimated_remaining": status.estimated_remaining,
            "error_message": status.error_message,
            "portfolios": [
                {
                    "model_id": p.model_id,
                    "model_name": p.model_name,
                    "bankroll": p.bankroll,
                    "initial_bankroll": p.initial_bankroll,
                    "roi": (p.bankroll - p.initial_bankroll) / p.initial_bankroll if p.initial_bankroll > 0 else 0,
                    "total_trades": p.total_trades,
                    "winning_trades": p.winning_trades,
                    "open_positions": len(p.positions),
                }
                for p in status.portfolios
            ],
            "recent_decisions": [
                {
                    "model_id": d.model_id,
                    "market_ticker": d.market_ticker,
                    "action": d.action.value,
                    "quantity": d.quantity,
                    "confidence": d.confidence,
                    "reasoning": d.reasoning[:100] + "..." if len(d.reasoning) > 100 else d.reasoning,
                }
                for d in status.recent_decisions
            ],
        }
    
    def get_results_dict(self, result: SimulationResult) -> dict:
        """Convert SimulationResult to a JSON-serializable dict."""
        return {
            "simulation_id": result.simulation_id,
            "start_time": result.start_time.isoformat(),
            "end_time": result.end_time.isoformat(),
            "config": {
                "models": result.config.models,
                "initial_bankroll": result.config.initial_bankroll,
                "max_position_pct": result.config.max_position_pct,
                "max_markets": result.config.max_markets,
                "min_volume": result.config.min_volume,
            },
            "scores": self.scoring_engine.to_dict(result.scores),
            "rankings": result.rankings,
            "total_decisions": len(result.all_decisions),
            "markets_evaluated": len(result.market_results),
        }

