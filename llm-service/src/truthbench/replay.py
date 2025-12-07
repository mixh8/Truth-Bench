"""Market Replay Engine for TruthBench.

This module handles loading and replaying historical market data,
stepping through candlesticks chronologically to simulate real-time
market conditions.
"""

import json
import logging
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .models import Candlestick, MarketState, SimulationConfig

logger = logging.getLogger(__name__)


@dataclass
class ResolvedMarket:
    """A resolved market loaded from JSON."""
    ticker: str
    event_ticker: str
    series_ticker: str
    title: str
    subtitle: str
    category: str
    rules_primary: str
    rules_secondary: str | None
    last_price: int
    yes_bid: int
    yes_ask: int
    volume: int
    volume_24h: int
    open_interest: int
    open_time: str
    close_time: str
    expiration_time: str
    result: str
    price_history: list[dict]


class MarketReplayEngine:
    """Engine for replaying historical market data.
    
    Loads resolved markets and provides iteration over market states
    at each timestep, allowing the simulation to progress through
    historical data as if it were happening in real-time.
    """
    
    def __init__(self, config: SimulationConfig):
        """Initialize the replay engine.
        
        Args:
            config: Simulation configuration
        """
        self.config = config
        self.markets: list[ResolvedMarket] = []
        self.current_market_idx: int = 0
        self.current_candlestick_idx: int = 0
        self._loaded = False
        
        logger.info(
            "MarketReplayEngine initialized",
            extra={"markets_file": config.markets_file}
        )
    
    def load_markets(self, base_path: Path | None = None) -> int:
        """Load markets from the JSON file.
        
        Args:
            base_path: Base path to look for the markets file
            
        Returns:
            Number of markets loaded
        """
        if base_path is None:
            base_path = Path(__file__).parent.parent.parent
        
        markets_path = base_path / self.config.markets_file
        
        if not markets_path.exists():
            # Try relative to llm-service
            markets_path = Path(__file__).parent.parent.parent / self.config.markets_file
        
        logger.info(f"Loading markets from {markets_path}")
        
        with open(markets_path, "r") as f:
            data = json.load(f)
        
        raw_markets = data.get("markets", [])
        
        # Filter and convert markets
        for raw in raw_markets:
            # Skip markets with insufficient volume
            if raw.get("volume", 0) < self.config.min_volume:
                continue
            
            # Skip markets without price history
            if not raw.get("price_history"):
                continue
            
            # Skip markets without a result
            if not raw.get("result"):
                continue
            
            market = ResolvedMarket(
                ticker=raw.get("ticker", ""),
                event_ticker=raw.get("event_ticker", ""),
                series_ticker=raw.get("series_ticker", ""),
                title=raw.get("title", ""),
                subtitle=raw.get("subtitle", ""),
                category=raw.get("category", ""),
                rules_primary=raw.get("rules_primary", ""),
                rules_secondary=raw.get("rules_secondary"),
                last_price=raw.get("last_price", 0),
                yes_bid=raw.get("yes_bid", 0),
                yes_ask=raw.get("yes_ask", 0),
                volume=raw.get("volume", 0),
                volume_24h=raw.get("volume_24h", 0),
                open_interest=raw.get("open_interest", 0),
                open_time=raw.get("open_time", ""),
                close_time=raw.get("close_time", ""),
                expiration_time=raw.get("expiration_time", ""),
                result=raw.get("result", ""),
                price_history=raw.get("price_history", []),
            )
            self.markets.append(market)
            
            # Apply max_markets limit
            if self.config.max_markets and len(self.markets) >= self.config.max_markets:
                break
        
        self._loaded = True
        
        logger.info(
            f"Loaded {len(self.markets)} markets",
            extra={
                "total_raw": len(raw_markets),
                "filtered": len(raw_markets) - len(self.markets),
            }
        )
        
        return len(self.markets)
    
    def get_total_markets(self) -> int:
        """Get total number of markets."""
        return len(self.markets)
    
    def get_market_by_ticker(self, ticker: str) -> ResolvedMarket | None:
        """Get a specific market by ticker."""
        for market in self.markets:
            if market.ticker == ticker:
                return market
        return None
    
    def _parse_candlestick(self, raw: dict) -> Candlestick:
        """Parse a raw candlestick dict into a Candlestick object."""
        # Handle nested price structure from Kalshi API
        price_data = raw.get("price", {})
        yes_bid_data = raw.get("yes_bid", {})
        yes_ask_data = raw.get("yes_ask", {})
        
        return Candlestick(
            timestamp=raw.get("timestamp", raw.get("end_period_ts", 0)),
            yes_bid=yes_bid_data.get("close", raw.get("yes_bid_close", 0)) or 0,
            yes_ask=yes_ask_data.get("close", raw.get("yes_ask_close", 0)) or 0,
            price_close=price_data.get("close", raw.get("price_close", 0)) or 0,
            volume=raw.get("volume", 0) or 0,
            open_interest=raw.get("open_interest", 0) or 0,
        )
    
    def get_market_state_at_timestep(
        self,
        market: ResolvedMarket,
        timestep_idx: int,
    ) -> MarketState:
        """Get the market state at a specific timestep.
        
        Args:
            market: The market to get state for
            timestep_idx: Index into price_history
            
        Returns:
            MarketState visible at that timestep
        """
        # Get candlesticks up to and including this timestep
        history_up_to_now = market.price_history[:timestep_idx + 1]
        candlesticks = [self._parse_candlestick(c) for c in history_up_to_now]
        
        # Current candlestick
        current = candlesticks[-1] if candlesticks else None
        
        return MarketState(
            ticker=market.ticker,
            title=market.title,
            rules_primary=market.rules_primary,
            rules_secondary=market.rules_secondary,
            current_timestamp=current.timestamp if current else 0,
            open_time=market.open_time,
            close_time=market.close_time,
            current_yes_bid=current.yes_bid if current else 50,
            current_yes_ask=current.yes_ask if current else 50,
            current_price=current.price_close if current else 50,
            volume=sum(c.volume for c in candlesticks),
            open_interest=current.open_interest if current else 0,
            price_history=candlesticks,
            result=market.result,  # Hidden from LLMs during prompting
        )
    
    def iterate_market_timesteps(
        self,
        market: ResolvedMarket,
        sample_interval: int | None = None,
    ) -> Iterator[MarketState]:
        """Iterate through a market's timesteps.
        
        Args:
            market: The market to iterate
            sample_interval: Only yield every N timesteps (None = all)
            
        Yields:
            MarketState at each timestep
        """
        if not market.price_history:
            return
        
        interval = sample_interval or 1
        
        for i in range(0, len(market.price_history), interval):
            yield self.get_market_state_at_timestep(market, i)
    
    def iterate_all_markets(
        self,
        sample_interval: int | None = None,
    ) -> Iterator[tuple[ResolvedMarket, MarketState]]:
        """Iterate through all markets and their timesteps.
        
        Args:
            sample_interval: Only yield every N timesteps per market
            
        Yields:
            (market, state) tuples for each timestep
        """
        for market in self.markets:
            for state in self.iterate_market_timesteps(market, sample_interval):
                yield (market, state)
    
    def get_decision_points(
        self,
        market: ResolvedMarket,
        num_points: int = 5,
    ) -> list[MarketState]:
        """Get key decision points for a market.
        
        Instead of evaluating at every candlestick, get N evenly
        spaced points through the market's lifetime.
        
        Args:
            market: The market to sample
            num_points: Number of decision points
            
        Returns:
            List of MarketState at each decision point
        """
        if not market.price_history:
            return []
        
        total = len(market.price_history)
        if total <= num_points:
            # Return all if fewer than requested
            return [
                self.get_market_state_at_timestep(market, i)
                for i in range(total)
            ]
        
        # Calculate indices for evenly spaced points
        # Always include first and last
        indices = [0]
        step = (total - 1) / (num_points - 1)
        for i in range(1, num_points - 1):
            indices.append(int(i * step))
        indices.append(total - 1)
        
        return [
            self.get_market_state_at_timestep(market, idx)
            for idx in indices
        ]
    
    def get_final_state(self, market: ResolvedMarket) -> MarketState:
        """Get the final state of a market (just before resolution)."""
        if not market.price_history:
            return self.get_market_state_at_timestep(market, 0)
        return self.get_market_state_at_timestep(
            market, 
            len(market.price_history) - 1
        )

