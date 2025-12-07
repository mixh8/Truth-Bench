"""Data models for TruthBench."""

from dataclasses import dataclass, field


@dataclass
class Candlestick:
    """Single OHLC data point with bid/ask spreads."""

    timestamp: int  # Unix timestamp (end of period)
    # Price OHLC (in cents)
    price_open: int
    price_high: int
    price_low: int
    price_close: int
    # Bid/Ask spreads (in cents)
    yes_bid_close: int
    yes_ask_close: int
    # Volume metrics
    volume: int
    open_interest: int


@dataclass
class ResolvedMarket:
    """Resolved market with full price history for benchmarking."""

    ticker: str
    event_ticker: str
    series_ticker: str
    title: str
    subtitle: str
    category: str
    rules_primary: str
    rules_secondary: str | None

    # Final state (from market object, in cents)
    last_price: int
    yes_bid: int
    yes_ask: int
    volume: int
    volume_24h: int
    open_interest: int

    # Timestamps (ISO format)
    open_time: str
    close_time: str
    expiration_time: str

    # Ground truth (hidden from LLMs during benchmark)
    result: str  # 'yes' or 'no'

    # Full price evolution (hourly candlesticks) - optional, loaded separately
    price_history: list[Candlestick] = field(default_factory=list)


@dataclass
class MarketSnapshot:
    """A point-in-time snapshot of a Kalshi market's state."""

    timestamp: str
    ticker: str
    event_ticker: str
    series_ticker: str
    title: str
    category: str
    subtitle: str
    status: str
    yes_price: int
    no_price: int
    yes_bid: int
    yes_ask: int
    volume: int
    volume_24h: int
    open_interest: int
    bid_depth: int
    ask_depth: int
    close_time: str | None
    expiration_time: str | None
    result: str | None
    floor_strike: float | None
    cap_strike: float | None
