"""TruthBench API Endpoints.

This module provides FastAPI endpoints for the TruthBench simulation:
- POST /api/truthbench/start - Start a new simulation
- GET /api/truthbench/status - Get current simulation status
- POST /api/truthbench/stop - Stop a running simulation
- GET /api/truthbench/results - Get final results
- WS /api/truthbench/stream - Real-time WebSocket updates
"""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .models import SimulationConfig, SimulationResult
from .simulation import TruthBenchSimulation

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/truthbench", tags=["TruthBench"])

# Global simulation state
_current_simulation: TruthBenchSimulation | None = None
_simulation_task: asyncio.Task | None = None
_simulation_result: SimulationResult | None = None
_llm_client: Any = None


def set_llm_client(client: Any) -> None:
    """Set the LLM client for simulations."""
    global _llm_client
    _llm_client = client


class StartSimulationRequest(BaseModel):
    """Request to start a new simulation."""
    models: list[str] = Field(
        default=[
            "grok-4-1-fast-reasoning",
            "gpt-5.1",
            "anthropic/claude-opus-4-5-20251101",
            "gemini/gemini-3-pro-preview",
        ],
        description="List of model IDs to evaluate",
    )
    markets_file: str = Field(
        default="resolved_markets_with_history.json",
        description="Path to resolved markets JSON file",
    )
    initial_bankroll: float = Field(
        default=10000_00,
        description="Starting bankroll per model in cents",
    )
    max_position_pct: float = Field(
        default=0.10,
        description="Maximum % of bankroll per position",
    )
    max_markets: int | None = Field(
        default=50,
        description="Limit number of markets (None = all)",
    )
    min_volume: int = Field(
        default=1000,
        description="Minimum market volume to include",
    )
    decision_points: int = Field(
        default=3,
        description="Number of decision points per market",
    )


class SimulationStatusResponse(BaseModel):
    """Response containing simulation status."""
    simulation_id: str
    status: str
    current_market: str | None
    markets_completed: int
    total_markets: int
    elapsed_time: float
    estimated_remaining: float | None
    portfolios: list[dict]
    recent_decisions: list[dict]
    error_message: str | None


class SimulationResultsResponse(BaseModel):
    """Response containing simulation results."""
    simulation_id: str
    status: str
    scores: list[dict]
    rankings: list[str]
    total_decisions: int
    markets_evaluated: int
    start_time: str | None
    end_time: str | None


@router.post("/start", response_model=dict)
async def start_simulation(request: StartSimulationRequest):
    """Start a new TruthBench simulation.
    
    This will run the simulation in the background, querying each LLM
    for trading decisions at multiple points through each market's lifetime.
    """
    global _current_simulation, _simulation_task, _simulation_result, _llm_client
    
    # Check if simulation is already running
    if _current_simulation is not None and _simulation_task is not None:
        if not _simulation_task.done():
            raise HTTPException(
                status_code=400,
                detail="A simulation is already running. Stop it first.",
            )
    
    # Check LLM client
    if _llm_client is None:
        raise HTTPException(
            status_code=500,
            detail="LLM client not initialized",
        )
    
    # Create config
    config = SimulationConfig(
        models=request.models,
        markets_file=request.markets_file,
        initial_bankroll=request.initial_bankroll,
        max_position_pct=request.max_position_pct,
        max_markets=request.max_markets,
        min_volume=request.min_volume,
    )
    
    # Model display names
    model_names = {
        "grok-4-1-fast-reasoning": "Grok 4.1 Fast",
        "gpt-5.1": "GPT-5.1",
        "anthropic/claude-opus-4-5-20251101": "Claude Opus 4.5",
        "gemini/gemini-3-pro-preview": "Gemini 3 Pro",
    }
    
    # Create simulation
    _current_simulation = TruthBenchSimulation(
        config=config,
        llm_client=_llm_client,
        model_names=model_names,
    )
    _simulation_result = None
    
    # Run in background
    async def run_simulation():
        global _simulation_result
        try:
            base_path = Path(__file__).parent.parent.parent
            result = await _current_simulation.run(
                base_path=base_path,
                decision_points_per_market=request.decision_points,
            )
            _simulation_result = result
            logger.info(f"Simulation {result.simulation_id} completed")
        except Exception as e:
            logger.error(f"Simulation failed: {e}", exc_info=True)
    
    _simulation_task = asyncio.create_task(run_simulation())
    
    logger.info(
        f"Simulation {_current_simulation.simulation_id} started",
        extra={
            "models": request.models,
            "max_markets": request.max_markets,
        },
    )
    
    return {
        "simulation_id": _current_simulation.simulation_id,
        "status": "started",
        "message": "Simulation started in background",
    }


@router.get("/status", response_model=SimulationStatusResponse)
async def get_status():
    """Get the current simulation status."""
    global _current_simulation
    
    if _current_simulation is None:
        return SimulationStatusResponse(
            simulation_id="none",
            status="no_simulation",
            current_market=None,
            markets_completed=0,
            total_markets=0,
            elapsed_time=0,
            estimated_remaining=None,
            portfolios=[],
            recent_decisions=[],
            error_message=None,
        )
    
    status = _current_simulation.get_status()
    
    return SimulationStatusResponse(
        simulation_id=status.simulation_id,
        status=status.status,
        current_market=status.current_market,
        markets_completed=status.markets_completed,
        total_markets=status.total_markets,
        elapsed_time=status.elapsed_time,
        estimated_remaining=status.estimated_remaining,
        portfolios=[
            {
                "model_id": p.model_id,
                "model_name": p.model_name,
                "bankroll": p.bankroll,
                "initial_bankroll": p.initial_bankroll,
                "roi": (p.bankroll - p.initial_bankroll) / p.initial_bankroll if p.initial_bankroll > 0 else 0,
                "total_trades": p.total_trades,
                "winning_trades": p.winning_trades,
                "win_rate": p.winning_trades / p.total_trades if p.total_trades > 0 else 0,
                "open_positions": len(p.positions),
            }
            for p in status.portfolios
        ],
        recent_decisions=[
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
        error_message=status.error_message,
    )


@router.post("/stop")
async def stop_simulation():
    """Stop a running simulation."""
    global _current_simulation, _simulation_task
    
    if _current_simulation is None:
        raise HTTPException(
            status_code=400,
            detail="No simulation is running",
        )
    
    _current_simulation.stop()
    
    # Wait briefly for task to acknowledge stop
    if _simulation_task and not _simulation_task.done():
        try:
            await asyncio.wait_for(asyncio.shield(_simulation_task), timeout=5.0)
        except asyncio.TimeoutError:
            logger.warning("Simulation did not stop within timeout")
    
    return {
        "status": "stopped",
        "message": "Simulation stop requested",
    }


@router.get("/results", response_model=SimulationResultsResponse)
async def get_results():
    """Get the final results of a completed simulation."""
    global _current_simulation, _simulation_result
    
    if _current_simulation is None:
        raise HTTPException(
            status_code=400,
            detail="No simulation has been run",
        )
    
    status = _current_simulation.get_status()
    
    if status.status not in ("completed", "paused", "error"):
        return SimulationResultsResponse(
            simulation_id=status.simulation_id,
            status=status.status,
            scores=[],
            rankings=[],
            total_decisions=0,
            markets_evaluated=0,
            start_time=None,
            end_time=None,
        )
    
    if _simulation_result is None:
        # Simulation completed but no result stored - calculate from current state
        portfolios = _current_simulation.portfolio_manager.get_all_portfolios()
        scores = _current_simulation.scoring_engine.calculate_all_scores(portfolios)
        
        return SimulationResultsResponse(
            simulation_id=status.simulation_id,
            status=status.status,
            scores=_current_simulation.scoring_engine.to_dict(scores),
            rankings=[s.model_id for s in scores],
            total_decisions=len(_current_simulation._all_decisions),
            markets_evaluated=_current_simulation._markets_completed,
            start_time=_current_simulation._start_time.isoformat() if _current_simulation._start_time else None,
            end_time=_current_simulation._end_time.isoformat() if _current_simulation._end_time else None,
        )
    
    return SimulationResultsResponse(
        simulation_id=_simulation_result.simulation_id,
        status="completed",
        scores=_current_simulation.scoring_engine.to_dict(_simulation_result.scores),
        rankings=_simulation_result.rankings,
        total_decisions=len(_simulation_result.all_decisions),
        markets_evaluated=len(_simulation_result.market_results),
        start_time=_simulation_result.start_time.isoformat(),
        end_time=_simulation_result.end_time.isoformat(),
    )


@router.websocket("/stream")
async def stream_updates(websocket: WebSocket):
    """WebSocket endpoint for real-time simulation updates."""
    await websocket.accept()
    
    global _current_simulation
    
    if _current_simulation is None:
        await websocket.send_json({
            "type": "error",
            "message": "No simulation running",
        })
        await websocket.close()
        return
    
    try:
        async for update in _current_simulation.stream_updates():
            await websocket.send_json({
                "type": "status_update",
                "data": update,
            })
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": str(e),
            })
        except Exception:
            pass

