"""
FastAPI application for the LLM service.

This module provides:
- REST API endpoints for chat completions
- Streaming support via Server-Sent Events
- Health check and model listing endpoints
- CORS configuration for frontend access
"""

import logging
import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from datetime import datetime, timedelta
import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from llm_service.config import Settings, configure_logging, get_logger, get_settings
from llm_service.llm.client import LLMClient
from llm_service.llm.providers import list_available_models
from llm_service.llm.schemas import (
    ChatRequest,
    ChatResponse,
    ChatMessage,
    HealthResponse,
    ModelsResponse,
)

# Import Kalshi client for market data
from kalshi.client import scrape_kalshi_feed
from kalshi.twitter_augmentation import augment_kalshi_with_twitter

# Global instances
_llm_client: LLMClient | None = None
_logger: logging.Logger | None = None

# Simple in-memory cache for Kalshi feed
_kalshi_cache = {
    'data': None,
    'timestamp': None,
    'ttl_seconds': 300  # 5 minutes
}

# Simple in-memory cache for market analysis (keyed by market_title)
_analysis_cache: dict[str, dict] = {}
_analysis_cache_ttl = 300  # 5 minutes


def get_llm_client() -> LLMClient:
    """Get the global LLM client instance."""
    if _llm_client is None:
        raise RuntimeError("LLM client not initialized")
    return _llm_client


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.

    Initializes logging and LLM client on startup.
    """
    global _llm_client, _logger

    # Load settings
    settings = get_settings()

    # Configure logging
    _logger = configure_logging(settings)
    _logger.info("Starting LLM service", extra={"port": settings.service_port})

    # Initialize LLM client
    _llm_client = LLMClient(settings)
    _logger.info("LLM client initialized")

    yield

    # Cleanup on shutdown
    _logger.info("Shutting down LLM service")


# Create FastAPI application
app = FastAPI(
    title="LLM Service",
    description="Multi-provider LLM service using LiteLLM",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns:
        HealthResponse: Service health status
    """
    logger = get_logger()
    logger.debug("Health check requested")

    return HealthResponse(
        status="healthy",
        service="llm-service",
        version="0.1.0",
    )


@app.get("/api/models", response_model=ModelsResponse, tags=["Models"])
async def list_models() -> ModelsResponse:
    """
    List available LLM models.

    Returns:
        ModelsResponse: List of available models with their capabilities
    """
    logger = get_logger()
    logger.debug("Models list requested")

    models = list_available_models()
    return ModelsResponse(models=models)


@app.get("/api/kalshi/feed", tags=["Kalshi"])
async def get_kalshi_feed(limit: int = 10, augment_twitter: bool = True, use_cache: bool = True):
    """
    Fetch the Kalshi feed data, optionally augmented with Twitter metrics.

    Args:
        limit: Maximum number of events to return (default: 10)
        augment_twitter: Whether to augment with Twitter data (default: True)
        use_cache: Whether to use cached data if available (default: True)

    Returns:
        dict: Kalshi feed data with top events, optionally with Twitter metrics
    """
    logger = get_logger()
    logger.info("Kalshi feed requested", extra={"limit": limit, "augment_twitter": augment_twitter})

    # Check cache
    if use_cache and _kalshi_cache['data'] is not None and _kalshi_cache['timestamp'] is not None:
        cache_age = (datetime.utcnow() - _kalshi_cache['timestamp']).total_seconds()
        if cache_age < _kalshi_cache['ttl_seconds']:
            logger.info(f"Returning cached data (age: {cache_age:.1f}s)")
            cached_result = _kalshi_cache['data'].copy()
            # Apply limit to cached data
            if "kalshi_feed" in cached_result and "feed" in cached_result["kalshi_feed"]:
                cached_result["kalshi_feed"]["feed"] = cached_result["kalshi_feed"]["feed"][:limit]
            cached_result["metadata"]["from_cache"] = True
            cached_result["metadata"]["cache_age_seconds"] = round(cache_age, 1)
            return cached_result

    try:
        feed_data = scrape_kalshi_feed()
        
        # Filter to top N events by volume if the feed has events
        if "feed" in feed_data and isinstance(feed_data["feed"], list):
            feed_data["feed"] = feed_data["feed"][:limit]
        
        logger.info(
            "Kalshi feed fetched successfully",
            extra={"event_count": len(feed_data.get("feed", []))},
        )
        
        # Augment with Twitter data if requested
        if augment_twitter:
            logger.info("Augmenting Kalshi feed with Twitter data")
            try:
                # Get X API key from settings
                settings = get_settings()
                x_api_key = settings.x_api_key
                
                augmented_data = augment_kalshi_with_twitter(feed_data, x_api_key=x_api_key)
                augmented_data["metadata"]["from_cache"] = False
                logger.info(
                    "Twitter augmentation complete",
                    extra={
                        "markets_augmented": augmented_data['metadata']['markets_augmented'],
                        "api_calls": augmented_data['metadata']['api_calls_used']
                    }
                )
                
                # Cache the result
                _kalshi_cache['data'] = augmented_data
                _kalshi_cache['timestamp'] = datetime.utcnow()
                
                return augmented_data
            except Exception as twitter_error:
                logger.warning(
                    "Twitter augmentation failed, returning Kalshi data only",
                    extra={"error": str(twitter_error)}
                )
                # Return Kalshi data without Twitter augmentation
                return {
                    'kalshi_feed': feed_data,
                    'twitter_augmentation': {},
                    'metadata': {
                        'error': str(twitter_error),
                        'markets_augmented': 0,
                        'api_calls_used': 0,
                        'from_cache': False
                    }
                }
        
        # Return without augmentation
        result = {
            'kalshi_feed': feed_data,
            'twitter_augmentation': {},
            'metadata': {
                'markets_augmented': 0,
                'api_calls_used': 0,
                'from_cache': False
            }
        }
        
        # Cache even if no Twitter augmentation
        _kalshi_cache['data'] = result
        _kalshi_cache['timestamp'] = datetime.utcnow()
        
        return result

    except Exception as e:
        logger.error(
            "Failed to fetch Kalshi feed",
            extra={"error": str(e)},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch Kalshi feed: {str(e)}",
        )


class MarketOutcome(BaseModel):
    """Individual outcome in a market."""
    label: str
    current_price: int  # Price in cents (0-100)
    ticker: str


class MarketAnalysisRequest(BaseModel):
    """Request for market analysis."""
    market_title: str
    outcomes: list[MarketOutcome]  # All possible outcomes in this event
    twitter_metrics: dict | None = None


class ModelPrediction(BaseModel):
    """Individual model's prediction."""
    model_id: str
    name: str
    vote: str  # "YES" or "NO" (legacy yes/no compatibility)
    predicted_outcome: str  # Exact label of the outcome the model picked
    confidence: int  # 0-100
    reasoning: str
    timestamp: str


class MarketAnalysisResponse(BaseModel):
    """Response with all model predictions."""
    market_title: str
    predictions: list[ModelPrediction]
    consensus: dict
    metadata: dict


@app.post("/api/kalshi/markets/batch", tags=["Kalshi"])
async def get_markets_batch(request: dict):
    """
    Fetch specific markets by their tickers (for pricing open positions).
    
    Request body:
    {
        "tickers": ["PRES-28", "FED-DEC", ...]
    }
    
    Returns market data including current prices for each ticker.
    """
    logger = get_logger()
    tickers = request.get("tickers", [])
    
    if not tickers:
        return {"markets": []}
    
    logger.info(f"Fetching {len(tickers)} specific markets: {tickers}")
    
    try:
        from kalshi.client import KalshiClient
        client = KalshiClient(use_demo=False)
        
        markets = []
        for ticker in tickers:
            try:
                # Fetch market data via the trade API
                response = client._get(f"/markets/{ticker}")
                market_data = response.get("market", {})
                
                if market_data:
                    markets.append({
                        "ticker": market_data.get("ticker", ticker),
                        "title": market_data.get("title", ""),
                        "last_price": market_data.get("last_price", 0) or 0,
                        "yes_bid": market_data.get("yes_bid", 0) or 0,
                        "yes_ask": market_data.get("yes_ask", 0) or 0,
                        "no_bid": market_data.get("no_bid", 0) or 0,
                        "no_ask": market_data.get("no_ask", 0) or 0,
                        "close_time": market_data.get("close_time"),
                        "status": market_data.get("status", ""),
                    })
            except Exception as market_error:
                logger.warning(f"Failed to fetch market {ticker}: {market_error}")
                # Return placeholder with entry price if market not found
                markets.append({
                    "ticker": ticker,
                    "title": f"Unknown Market ({ticker})",
                    "last_price": 0,
                    "yes_bid": 0,
                    "yes_ask": 0,
                    "no_bid": 0,
                    "no_ask": 0,
                    "close_time": None,
                    "status": "unknown",
                })
        
        logger.info(f"Successfully fetched {len(markets)} markets")
        return {"markets": markets}
        
    except Exception as e:
        logger.error(f"Failed to fetch markets batch: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch markets: {str(e)}")


@app.post("/api/kalshi/analyze", response_model=MarketAnalysisResponse, tags=["Kalshi"])
async def analyze_market(request: MarketAnalysisRequest, use_cache: bool = True):
    """
    Analyze a market using multiple LLMs to generate predictions.
    
    Args:
        request: Market details including title, price, and Twitter metrics
        use_cache: Whether to use cached predictions (default: True)
    
    Returns:
        Market analysis with predictions from multiple models
    """
    logger = get_logger()
    logger.info(f"Market analysis requested for: {request.market_title}")
    
    # Check cache
    cache_key = request.market_title
    if use_cache and cache_key in _analysis_cache:
        cached_entry = _analysis_cache[cache_key]
        cache_age = (datetime.utcnow() - cached_entry['timestamp']).total_seconds()
        if cache_age < _analysis_cache_ttl:
            logger.info(f"Returning cached analysis (age: {cache_age:.1f}s)")
            cached_result = cached_entry['data']
            cached_result.metadata['from_cache'] = True
            cached_result.metadata['cache_age_seconds'] = round(cache_age, 1)
            return cached_result
    
    # Define models to query (using the actual models from the platform)
    models = [
        {"id": "grok-beta", "model_id": "grok-4-1-fast-reasoning", "name": "Grok 4.1 Fast (Reasoning)"},  # Regular Grok without search
        {"id": "grok-beta-x", "model_id": "grok-4-1-fast-reasoning", "name": "Grok w/ X", "enable_x_search": True},  # Grok with X search enabled
        {"id": "gpt-5.1", "model_id": "gpt-5.1", "name": "GPT-5.1"},
        {"id": "anthropic/claude-opus-4-5-20251101", "model_id": "anthropic/claude-opus-4-5-20251101", "name": "Claude Opus 4.5"},
        {"id": "gemini/gemini-3-pro", "model_id": "gemini/gemini-3-pro-preview", "name": "Gemini 3 Pro"},
    ]
    
    # Build analysis prompt
    twitter_context = ""
    if request.twitter_metrics:
        twitter_context = f"""
Twitter Activity (Last 24h):
- Total tweets: {request.twitter_metrics.get('total_tweets', 0)}
- Tweet velocity (24h): {request.twitter_metrics.get('tweet_velocity_24h', 0)} tweets
- Unique authors: {request.twitter_metrics.get('unique_authors', 0)}
- Avg engagement rate: {request.twitter_metrics.get('avg_engagement_rate', 0):.2%}
- Verified users: {request.twitter_metrics.get('verified_user_tweets', 0)}
"""
    
    # Build list of all outcomes with their prices
    outcomes_text = "\n".join([
        f"  - {outcome.label}: {outcome.current_price}¢ (market implies {outcome.current_price}% probability)"
        for outcome in request.outcomes
    ])
    
    # Find the most likely outcome based on current prices
    top_outcome = max(request.outcomes, key=lambda x: x.current_price)
    
    prompt = f"""You are analyzing a prediction market with multiple possible outcomes.

MARKET QUESTION: {request.market_title}

ALL POSSIBLE OUTCOMES:
{outcomes_text}

{twitter_context}

Based on this information, which outcome do you think is most likely?

Provide your analysis in this EXACT format:
OUTCOME: [The exact label of the outcome you predict, e.g., "{top_outcome.label}"]
CONFIDENCE: [0-100]
REASONING: [2-3 sentences explaining why you chose this outcome. Consider current market prices, Twitter sentiment if available, and any relevant factors. Be specific about why this outcome is more likely than the others.]

Important: Choose ONE outcome from the list above and use its EXACT label."""
    
    client = get_llm_client()
    
    # Define async function to query a single model
    async def query_model(model):
        try:
            logger.info(f"Querying {model['name']}...")
            
            # Build chat request (use model_id for the actual API call)
            chat_request = ChatRequest(
                model=model.get("model_id", model["id"]),  # Use model_id for API, fallback to id
                messages=[ChatMessage(role="user", content=prompt)],
                temperature=0.7,
                max_tokens=200,
                x_search=model.get("enable_x_search", False)  # Enable X search if specified
            )
            
            # Use async completion (supports X search)
            response = await client.achat_completion(chat_request)
            
            # Parse response - handle different response formats
            if hasattr(response, 'choices') and response.choices:
                content = response.choices[0].message.content
            elif hasattr(response, 'message'):
                content = response.message.content if hasattr(response.message, 'content') else str(response.message)
            else:
                content = str(response)
            
            # Extract OUTCOME (the predicted outcome label)
            import re
            outcome_match = re.search(r'OUTCOME:\s*(.+?)(?:\n|$)', content)
            predicted_outcome = outcome_match.group(1).strip() if outcome_match else top_outcome.label
            
            # Find which outcome was predicted and convert to YES/NO
            # (YES if they picked the top outcome, NO otherwise - for compatibility)
            vote = "YES" if predicted_outcome == top_outcome.label else "NO"
            
            # Extract CONFIDENCE
            confidence = 70  # default
            confidence_match = re.search(r'CONFIDENCE:\s*(\d+)', content)
            if confidence_match:
                confidence = int(confidence_match.group(1))
            
            # Extract REASONING
            reasoning = content.split("REASONING:")[-1].strip()
            if not reasoning or len(reasoning) < 10:
                reasoning = f"Predicted outcome: {predicted_outcome}. " + content[:150]
            
            return ModelPrediction(
                model_id=model["id"],
                name=model["name"],
                vote=vote,
                predicted_outcome=predicted_outcome,
                confidence=min(100, max(0, confidence)),
                reasoning=reasoning,
                timestamp=datetime.utcnow().isoformat() + 'Z'
            )
            
        except Exception as e:
            logger.error(f"Failed to get prediction from {model['name']}: {e}", exc_info=True)
            # Add a neutral prediction on failure - pick the highest priced outcome
            return ModelPrediction(
                model_id=model["id"],
                name=model["name"],
                vote="YES",  # Default to yes for the top outcome
                predicted_outcome=top_outcome.label,
                confidence=50,
                reasoning=f"Analysis unavailable. Error: {type(e).__name__}",
                timestamp=datetime.utcnow().isoformat() + 'Z'
            )
    
    # Run ALL models in parallel using asyncio.gather for 5x speedup!
    predictions = await asyncio.gather(*[query_model(m) for m in models])
    
    # Calculate consensus
    yes_votes = [p for p in predictions if p.vote == "YES"]
    no_votes = [p for p in predictions if p.vote == "NO"]
    avg_confidence = sum(p.confidence for p in predictions) / len(predictions) if predictions else 0
    
    consensus = {
        "recommendation": "YES" if len(yes_votes) > len(no_votes) else "NO",
        "yes_count": len(yes_votes),
        "no_count": len(no_votes),
        "avg_confidence": round(avg_confidence),
        "is_strong": abs(len(yes_votes) - len(no_votes)) >= 2
    }
    
    result = MarketAnalysisResponse(
        market_title=request.market_title,
        predictions=predictions,
        consensus=consensus,
        metadata={
            "analyzed_at": datetime.utcnow().isoformat() + 'Z',
            "models_queried": len(models),
            "successful_predictions": len([p for p in predictions if "error" not in p.reasoning.lower()]),
            "from_cache": False
        }
    )
    
    # Cache the result
    _analysis_cache[cache_key] = {
        'data': result,
        'timestamp': datetime.utcnow()
    }
    
    return result


@app.post("/api/chat", response_model=ChatResponse, tags=["Chat"])
async def chat_completion(request: ChatRequest) -> ChatResponse:
    """
    Perform a chat completion.

    Args:
        request: Chat completion request with model, messages, and options

    Returns:
        ChatResponse: The model's response

    Raises:
        HTTPException: If the request fails
    """
    logger = get_logger()
    client = get_llm_client()

    logger.info(
        "Chat completion request received",
        extra={
            "model": request.model,
            "message_count": len(request.messages),
            "has_tools": bool(request.tools),
            "web_search": request.web_search,
            "stream": request.stream,
        },
    )

    # Check if provider is configured
    if not client.check_provider_configured(request.model):
        logger.warning(
            "Provider not configured",
            extra={"model": request.model},
        )
        raise HTTPException(
            status_code=400,
            detail=f"Provider for model '{request.model}' is not configured. Please set the appropriate API key.",
        )

    # Handle streaming request - redirect to stream endpoint
    if request.stream:
        logger.info("Redirecting to streaming endpoint")
        raise HTTPException(
            status_code=400,
            detail="For streaming, use POST /api/chat/stream endpoint",
        )

    try:
        response = await client.achat_completion(request)
        logger.info(
            "Chat completion successful",
            extra={
                "model": request.model,
                "finish_reason": response.finish_reason,
            },
        )
        return response

    except Exception as e:
        logger.error(
            "Chat completion failed",
            extra={"model": request.model, "error": str(e)},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Chat completion failed: {str(e)}",
        )


@app.post("/api/chat/stream", tags=["Chat"])
async def stream_chat_completion(request: ChatRequest) -> StreamingResponse:
    """
    Stream a chat completion response.

    Args:
        request: Chat completion request

    Returns:
        StreamingResponse: Server-Sent Events stream of the response

    Raises:
        HTTPException: If the request fails
    """
    logger = get_logger()
    client = get_llm_client()

    logger.info(
        "Streaming chat completion request received",
        extra={"model": request.model},
    )

    # Check if provider is configured
    if not client.check_provider_configured(request.model):
        raise HTTPException(
            status_code=400,
            detail=f"Provider for model '{request.model}' is not configured.",
        )

    async def generate() -> AsyncGenerator[str, None]:
        """Generate SSE events from the streaming response."""
        try:
            async for chunk in client.astream_completion(request):
                # Format as Server-Sent Event
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"data: [ERROR] {str(e)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    logger = get_logger()

    # Log request
    logger.debug(
        "Request received",
        extra={
            "method": request.method,
            "path": request.url.path,
            "client": request.client.host if request.client else "unknown",
        },
    )

    # Process request
    response = await call_next(request)

    # Log response
    logger.debug(
        "Response sent",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
        },
    )

    return response


def main() -> None:
    """Run the application using uvicorn."""
    import uvicorn

    settings = get_settings()

    uvicorn.run(
        "llm_service.main:app",
        host="0.0.0.0",
        port=settings.service_port,
        reload=True,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()

