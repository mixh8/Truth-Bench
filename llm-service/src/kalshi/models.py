"""Data models for TruthBench."""

from dataclasses import dataclass


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
