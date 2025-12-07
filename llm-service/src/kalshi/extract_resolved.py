"""Extract resolved political markets from Kalshi for benchmarking."""

import json
import logging
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .client import KalshiClient
from .models import Candlestick, ResolvedMarket

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def extract_political_markets(
    days: int = 90,
    output_path: str | None = None,
    rate_limit_delay: float = 0.5,
) -> list[ResolvedMarket]:
    """Extract resolved political markets from the last N days.

    Args:
        days: Number of days to look back for settled markets.
        output_path: Optional path to save results as JSON.
        rate_limit_delay: Delay between API calls in seconds.

    Returns:
        List of ResolvedMarket objects with full price history.
    """
    logger.info(f"Starting extraction of political markets from last {days} days")

    client = KalshiClient()

    # Calculate time range
    now = datetime.now(timezone.utc)
    min_close_ts = int((now - timedelta(days=days)).timestamp())
    max_close_ts = int(now.timestamp())

    logger.info(f"Time range: {datetime.fromtimestamp(min_close_ts, tz=timezone.utc)} to {datetime.fromtimestamp(max_close_ts, tz=timezone.utc)}")

    # Step 1: Get political series
    logger.info("Step 1: Fetching political series...")
    political_series = client.get_political_series()
    logger.info(f"Found {len(political_series)} political series")

    if not political_series:
        logger.warning("No political series found")
        return []

    # Step 2: Get settled markets for each series
    logger.info("Step 2: Fetching settled markets for each series...")
    all_markets = []

    for series in political_series:
        series_ticker = series.get("ticker", "")
        if not series_ticker:
            continue

        logger.info(f"Fetching markets for series: {series_ticker}")
        time.sleep(rate_limit_delay)  # Rate limiting

        try:
            markets = client.get_settled_markets(
                series_ticker=series_ticker,
                min_close_ts=min_close_ts,
                max_close_ts=max_close_ts,
            )
            # Add series info to each market
            for market in markets:
                market["_series_category"] = series.get("category", "Politics")
            all_markets.extend(markets)
            logger.info(f"Found {len(markets)} settled markets in {series_ticker}")
        except Exception as e:
            logger.error(f"Error fetching markets for {series_ticker}: {e}")
            continue

    logger.info(f"Total settled political markets found: {len(all_markets)}")

    if not all_markets:
        logger.warning("No settled political markets found")
        return []

    # Step 3: Fetch candlestick history for each market
    logger.info("Step 3: Fetching candlestick history for each market...")
    resolved_markets = []

    for i, market in enumerate(all_markets):
        ticker = market.get("ticker", "")
        series_ticker = market.get("series_ticker", "")

        if not ticker or not series_ticker:
            logger.warning(f"Skipping market with missing ticker or series_ticker")
            continue

        logger.info(f"[{i+1}/{len(all_markets)}] Fetching candlesticks for {ticker}")
        time.sleep(rate_limit_delay)  # Rate limiting

        try:
            # Get candlestick history
            candlesticks_raw = client.get_market_candlesticks(
                series_ticker=series_ticker,
                market_ticker=ticker,
                period_interval=60,  # Hourly
            )

            # Convert to Candlestick objects
            candlesticks = []
            for cs in candlesticks_raw:
                price_data = cs.get("price", {})
                yes_bid_data = cs.get("yes_bid", {})
                yes_ask_data = cs.get("yes_ask", {})

                candlestick = Candlestick(
                    timestamp=cs.get("end_period_ts", 0),
                    price_open=price_data.get("open", 0) or 0,
                    price_high=price_data.get("high", 0) or 0,
                    price_low=price_data.get("low", 0) or 0,
                    price_close=price_data.get("close", 0) or 0,
                    yes_bid_close=yes_bid_data.get("close", 0) or 0,
                    yes_ask_close=yes_ask_data.get("close", 0) or 0,
                    volume=cs.get("volume", 0) or 0,
                    open_interest=cs.get("open_interest", 0) or 0,
                )
                candlesticks.append(candlestick)

            # Create ResolvedMarket object
            resolved_market = ResolvedMarket(
                ticker=ticker,
                event_ticker=market.get("event_ticker", ""),
                series_ticker=series_ticker,
                title=market.get("title", ""),
                subtitle=market.get("subtitle", ""),
                category=market.get("_series_category", "Politics"),
                rules_primary=market.get("rules_primary", ""),
                rules_secondary=market.get("rules_secondary"),
                last_price=market.get("last_price", 0) or 0,
                yes_bid=market.get("yes_bid", 0) or 0,
                yes_ask=market.get("yes_ask", 0) or 0,
                volume=market.get("volume", 0) or 0,
                volume_24h=market.get("volume_24h", 0) or 0,
                open_interest=market.get("open_interest", 0) or 0,
                open_time=market.get("open_time", ""),
                close_time=market.get("close_time", ""),
                expiration_time=market.get("expiration_time", ""),
                result=market.get("result", ""),
                price_history=candlesticks,
            )
            resolved_markets.append(resolved_market)
            logger.debug(f"Created ResolvedMarket for {ticker} with {len(candlesticks)} candlesticks")

        except Exception as e:
            logger.error(f"Error processing market {ticker}: {e}")
            continue

    logger.info(f"Successfully extracted {len(resolved_markets)} resolved markets")

    # Save to JSON if output path specified
    if output_path:
        save_to_json(resolved_markets, output_path)

    return resolved_markets


def save_to_json(markets: list[ResolvedMarket], output_path: str) -> None:
    """Save resolved markets to a JSON file.

    Args:
        markets: List of ResolvedMarket objects.
        output_path: Path to save the JSON file.
    """
    logger.info(f"Saving {len(markets)} markets to {output_path}")

    # Convert dataclasses to dicts
    data = []
    for market in markets:
        market_dict = {
            "ticker": market.ticker,
            "event_ticker": market.event_ticker,
            "series_ticker": market.series_ticker,
            "title": market.title,
            "subtitle": market.subtitle,
            "category": market.category,
            "rules_primary": market.rules_primary,
            "rules_secondary": market.rules_secondary,
            "last_price": market.last_price,
            "yes_bid": market.yes_bid,
            "yes_ask": market.yes_ask,
            "volume": market.volume,
            "volume_24h": market.volume_24h,
            "open_interest": market.open_interest,
            "open_time": market.open_time,
            "close_time": market.close_time,
            "expiration_time": market.expiration_time,
            "result": market.result,
            "price_history": [
                {
                    "timestamp": cs.timestamp,
                    "price_open": cs.price_open,
                    "price_high": cs.price_high,
                    "price_low": cs.price_low,
                    "price_close": cs.price_close,
                    "yes_bid_close": cs.yes_bid_close,
                    "yes_ask_close": cs.yes_ask_close,
                    "volume": cs.volume,
                    "open_interest": cs.open_interest,
                }
                for cs in market.price_history
            ],
        }
        data.append(market_dict)

    # Write to file
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w") as f:
        json.dump(
            {
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "total_markets": len(markets),
                "markets": data,
            },
            f,
            indent=2,
        )

    logger.info(f"Successfully saved to {output_path}")


def load_from_json(input_path: str) -> list[ResolvedMarket]:
    """Load resolved markets from a JSON file.

    Args:
        input_path: Path to the JSON file.

    Returns:
        List of ResolvedMarket objects.
    """
    logger.info(f"Loading markets from {input_path}")

    with open(input_path, "r") as f:
        data = json.load(f)

    markets = []
    for market_dict in data.get("markets", []):
        candlesticks = [
            Candlestick(
                timestamp=cs["timestamp"],
                price_open=cs["price_open"],
                price_high=cs["price_high"],
                price_low=cs["price_low"],
                price_close=cs["price_close"],
                yes_bid_close=cs["yes_bid_close"],
                yes_ask_close=cs["yes_ask_close"],
                volume=cs["volume"],
                open_interest=cs["open_interest"],
            )
            for cs in market_dict.get("price_history", [])
        ]

        market = ResolvedMarket(
            ticker=market_dict["ticker"],
            event_ticker=market_dict["event_ticker"],
            series_ticker=market_dict["series_ticker"],
            title=market_dict["title"],
            subtitle=market_dict["subtitle"],
            category=market_dict["category"],
            rules_primary=market_dict["rules_primary"],
            rules_secondary=market_dict.get("rules_secondary"),
            last_price=market_dict["last_price"],
            yes_bid=market_dict["yes_bid"],
            yes_ask=market_dict["yes_ask"],
            volume=market_dict["volume"],
            volume_24h=market_dict["volume_24h"],
            open_interest=market_dict["open_interest"],
            open_time=market_dict["open_time"],
            close_time=market_dict["close_time"],
            expiration_time=market_dict["expiration_time"],
            result=market_dict["result"],
            price_history=candlesticks,
        )
        markets.append(market)

    logger.info(f"Loaded {len(markets)} markets")
    return markets


if __name__ == "__main__":
    # Run extraction when script is executed directly
    import argparse

    parser = argparse.ArgumentParser(description="Extract resolved political markets from Kalshi")
    parser.add_argument("--days", type=int, default=90, help="Number of days to look back")
    parser.add_argument("--output", type=str, default="resolved_markets.json", help="Output JSON file path")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between API calls in seconds")

    args = parser.parse_args()

    markets = extract_political_markets(
        days=args.days,
        output_path=args.output,
        rate_limit_delay=args.delay,
    )

    print(f"\nExtraction complete!")
    print(f"Total markets: {len(markets)}")
    if markets:
        print(f"Markets with results: {sum(1 for m in markets if m.result)}")
        print(f"Sample market: {markets[0].title}")

