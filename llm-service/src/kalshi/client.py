"""Kalshi API client for fetching market data."""

from datetime import datetime, timezone

import requests

from .models import MarketSnapshot

# API base URLs
PROD_API_URL = "https://api.elections.kalshi.com/trade-api/v2"
DEMO_API_URL = "https://demo-api.kalshi.co/trade-api/v2"


def scrape_kalshi_feed():
    """
    Scrapes the Kalshi homepage feed and returns the JSON data.
    
    Returns:
        dict: The feed data from Kalshi API
    """
    url = 'https://api.elections.kalshi.com/v1/users/feed'
    
    headers = {
        'accept': 'application/json',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'dnt': '1',
        'origin': 'https://kalshi.com',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://kalshi.com/',
        'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    }
    
    response = requests.get(url, headers=headers)
    response.raise_for_status()  # Raise an error for bad status codes
    
    return response.json()


class KalshiClient:
    """Client for interacting with the Kalshi API."""

    def __init__(self, use_demo: bool = False):
        """Initialize the Kalshi client.

        Args:
            use_demo: If True, use the demo API. Otherwise use production.
        """
        self.base_url = DEMO_API_URL if use_demo else PROD_API_URL
        self.session = requests.Session()

    def _get(self, endpoint: str, params: dict | None = None) -> dict:
        """Make a GET request to the API.

        Args:
            endpoint: API endpoint path (without base URL).
            params: Optional query parameters.

        Returns:
            JSON response as a dictionary.

        Raises:
            requests.HTTPError: If the request fails.
        """
        url = f"{self.base_url}{endpoint}"
        response = self.session.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def get_markets_by_event(
        self,
        event_ticker: str,
        status: str | None = None,
        limit: int = 1000,
    ) -> list[dict]:
        """Fetch all markets for a given event ticker.

        Args:
            event_ticker: The event ticker to filter by.
            status: Optional status filter (e.g., 'open', 'settled').
            limit: Maximum number of markets per page (max 1000).

        Returns:
            List of market dictionaries.
        """
        markets = []
        cursor = None

        while True:
            params = {
                "event_ticker": event_ticker,
                "limit": limit,
            }
            if status:
                params["status"] = status
            if cursor:
                params["cursor"] = cursor

            response = self._get("/markets", params=params)
            markets.extend(response.get("markets", []))

            cursor = response.get("cursor")
            if not cursor:
                break

        return markets

    def get_orderbook(self, ticker: str, depth: int = 100) -> dict:
        """Fetch the orderbook for a specific market.

        Args:
            ticker: The market ticker.
            depth: Maximum number of price levels per side (max 100).

        Returns:
            Orderbook dictionary with 'yes' and 'no' bid arrays.
        """
        response = self._get(f"/markets/{ticker}/orderbook", {"depth": depth})
        return response.get("orderbook", {"yes": [], "no": []})

    def get_event_snapshots(
        self,
        event_ticker: str,
        category: str = "",
        status: str | None = None,
    ) -> list[MarketSnapshot]:
        """Get MarketSnapshot objects for all markets in an event.

        Args:
            event_ticker: The event ticker to fetch markets for.
            category: Category label to assign to all snapshots.
            status: Optional status filter for markets.

        Returns:
            List of MarketSnapshot objects with current market data.
        """
        timestamp = datetime.now(timezone.utc)
        markets = self.get_markets_by_event(event_ticker, status=status)
        snapshots = []

        for market in markets:
            ticker = market.get("ticker", "")

            # Fetch orderbook for bid/ask depth
            orderbook = self.get_orderbook(ticker)
            bid_depth = sum(qty for _, qty in orderbook.get("yes", []))
            ask_depth = sum(qty for _, qty in orderbook.get("no", []))

            last_price = market.get("last_price", 0) or 0

            # Normalize empty strings to None for optional fields
            result = market.get("result") or None

            snapshot = MarketSnapshot(
                timestamp=timestamp.isoformat(),
                ticker=ticker,
                event_ticker=market.get("event_ticker", ""),
                series_ticker=market.get("series_ticker", ""),
                title=market.get("title", ""),
                category=category,
                subtitle=market.get("subtitle", ""),
                status=market.get("status", ""),
                yes_price=last_price,
                no_price=100 - last_price,
                yes_bid=market.get("yes_bid", 0) or 0,
                yes_ask=market.get("yes_ask", 0) or 0,
                volume=market.get("volume", 0) or 0,
                volume_24h=market.get("volume_24h", 0) or 0,
                open_interest=market.get("open_interest", 0) or 0,
                bid_depth=bid_depth,
                ask_depth=ask_depth,
                close_time=market.get("close_time") or None,
                expiration_time=market.get("expiration_time") or None,
                result=result,
                floor_strike=market.get("floor_strike"),
                cap_strike=market.get("cap_strike"),
            )
            snapshots.append(snapshot)

        return snapshots

    def get_political_series(self) -> list[dict]:
        """Fetch all series in the Politics category.

        Returns:
            List of series dictionaries containing ticker, title, category, etc.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.debug("Fetching political series from Kalshi API")
        response = self._get("/series", params={"category": "Politics"})
        series = response.get("series", [])
        logger.info(f"Retrieved {len(series)} political series")
        
        return series

    def get_settled_markets(
        self,
        series_ticker: str,
        min_close_ts: int | None = None,
        max_close_ts: int | None = None,
        limit: int = 1000,
    ) -> list[dict]:
        """Fetch settled markets for a specific series.

        Args:
            series_ticker: The series ticker to filter by.
            min_close_ts: Minimum close timestamp (Unix seconds).
            max_close_ts: Maximum close timestamp (Unix seconds).
            limit: Maximum number of markets per page (max 1000).

        Returns:
            List of settled market dictionaries.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.debug(f"Fetching settled markets for series: {series_ticker}")
        markets = []
        cursor = None

        while True:
            params = {
                "series_ticker": series_ticker,
                "status": "settled",
                "limit": limit,
            }
            if min_close_ts:
                params["min_close_ts"] = min_close_ts
            if max_close_ts:
                params["max_close_ts"] = max_close_ts
            if cursor:
                params["cursor"] = cursor

            response = self._get("/markets", params=params)
            batch = response.get("markets", [])
            markets.extend(batch)
            logger.debug(f"Retrieved batch of {len(batch)} markets, total: {len(markets)}")

            cursor = response.get("cursor")
            if not cursor:
                break

        logger.info(f"Retrieved {len(markets)} settled markets for series {series_ticker}")
        return markets

    def get_market_candlesticks(
        self,
        series_ticker: str,
        market_ticker: str,
        start_ts: int | None = None,
        end_ts: int | None = None,
        period_interval: int = 60,
    ) -> list[dict]:
        """Fetch OHLC price history with bid/ask spreads for a market.

        Args:
            series_ticker: The series ticker containing the market.
            market_ticker: The market ticker.
            start_ts: Start timestamp (Unix seconds).
            end_ts: End timestamp (Unix seconds).
            period_interval: Candlestick period in minutes (1, 60, or 1440).

        Returns:
            List of candlestick dictionaries with OHLC and bid/ask data.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.debug(f"Fetching candlesticks for market: {market_ticker}")
        
        params = {"period_interval": period_interval}
        if start_ts:
            params["start_ts"] = start_ts
        if end_ts:
            params["end_ts"] = end_ts

        endpoint = f"/series/{series_ticker}/markets/{market_ticker}/candlesticks"
        response = self._get(endpoint, params=params)
        candlesticks = response.get("candlesticks", [])
        
        logger.info(f"Retrieved {len(candlesticks)} candlesticks for {market_ticker}")
        return candlesticks
