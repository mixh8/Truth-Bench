"""LLM Decision Engine for TruthBench.

This module handles prompting LLMs for trading decisions,
parsing their responses, and managing rate limits across providers.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from .models import Action, MarketState, Portfolio, TradingDecision

logger = logging.getLogger(__name__)


# System prompt for trading decisions
SYSTEM_PROMPT = """You are an expert prediction market trader participating in a simulation.
Your goal is to make profitable trading decisions based on the market information provided.

You will be shown a prediction market and its current state. Based on your analysis,
you must decide whether to:
- BUY YES contracts (if you think the event will happen)
- BUY NO contracts (if you think the event won't happen)  
- HOLD (if you're uncertain or already have a position)
- SELL (if you want to exit an existing position)

Important rules:
1. Contracts pay $1 if correct, $0 if wrong
2. Prices are in cents (0-100), representing probability
3. You should NEVER see the actual result - make predictions based only on the information given
4. Consider the market price as the crowd's estimate - you can agree or disagree
5. Factor in time until resolution when assessing risk

You MUST respond with valid JSON in exactly this format:
{
  "action": "buy_yes" | "buy_no" | "hold" | "sell_yes" | "sell_no",
  "quantity": <number of contracts 1-100>,
  "confidence": <0-100>,
  "probability_yes": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}"""


def build_market_prompt(
    state: MarketState,
    portfolio: Portfolio,
    hide_result: bool = True,
) -> str:
    """Build a prompt describing the current market state.
    
    Args:
        state: Current market state
        portfolio: LLM's current portfolio
        hide_result: Whether to hide the ground truth result
        
    Returns:
        Formatted prompt string
    """
    # Format price history summary
    if state.price_history:
        prices = [c.price_close for c in state.price_history if c.price_close]
        if prices:
            price_summary = (
                f"Price started at {prices[0]}¢, "
                f"now at {prices[-1]}¢ "
                f"(high: {max(prices)}¢, low: {min(prices)}¢)"
            )
        else:
            price_summary = "No price history available"
    else:
        price_summary = "No price history available"
    
    # Check existing position
    position_info = "You have no position in this market."
    if state.ticker in portfolio.positions:
        pos = portfolio.positions[state.ticker]
        position_info = (
            f"You hold {pos.quantity} {pos.side.upper()} contracts "
            f"at avg price {pos.avg_price}¢"
        )
    
    # Calculate implied probability from bid/ask
    mid_price = (state.current_yes_bid + state.current_yes_ask) / 2
    implied_prob = mid_price / 100 if mid_price > 0 else 0.5
    
    prompt = f"""
=== PREDICTION MARKET ===

**Question:** {state.title}

**Rules:** {state.rules_primary}
{f"Additional: {state.rules_secondary}" if state.rules_secondary else ""}

**Market Data:**
- Current YES price: {state.current_yes_bid}¢ bid / {state.current_yes_ask}¢ ask
- Implied probability: {implied_prob:.1%}
- Total volume: {state.volume:,} contracts
- Open interest: {state.open_interest:,} contracts
- {price_summary}

**Timeline:**
- Market opened: {state.open_time}
- Market closes: {state.close_time}

**Your Portfolio:**
- Available bankroll: ${portfolio.bankroll / 100:,.2f}
- {position_info}

Based on this information, what trading decision do you make?
Remember to respond with valid JSON only.
"""
    
    return prompt.strip()


@dataclass
class DecisionResult:
    """Result of an LLM decision query."""
    success: bool
    decision: TradingDecision | None
    raw_response: str
    error: str | None = None


class LLMDecisionEngine:
    """Engine for getting trading decisions from LLMs.
    
    Handles prompt construction, LLM querying, response parsing,
    and rate limiting across multiple providers.
    """
    
    def __init__(
        self,
        llm_client: Any,  # LLMClient from llm_service
        rate_limit_delay: float = 1.0,
    ):
        """Initialize the decision engine.
        
        Args:
            llm_client: The LLM client for making API calls
            rate_limit_delay: Seconds to wait between API calls
        """
        self.llm_client = llm_client
        self.rate_limit_delay = rate_limit_delay
        self._last_call_time: dict[str, float] = {}
        
        logger.info("LLMDecisionEngine initialized")
    
    def _parse_json_response(self, response: str) -> dict | None:
        """Extract and parse JSON from LLM response.
        
        Args:
            response: Raw LLM response text
            
        Returns:
            Parsed JSON dict or None if parsing fails
        """
        # Try direct JSON parse first
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass
        
        # Try to extract JSON from markdown code blocks
        json_patterns = [
            r'```json\s*([\s\S]*?)\s*```',
            r'```\s*([\s\S]*?)\s*```',
            r'\{[\s\S]*\}',
        ]
        
        for pattern in json_patterns:
            match = re.search(pattern, response)
            if match:
                try:
                    json_str = match.group(1) if '```' in pattern else match.group(0)
                    return json.loads(json_str)
                except (json.JSONDecodeError, IndexError):
                    continue
        
        return None
    
    def _parse_decision(
        self,
        response: str,
        model_id: str,
        market_ticker: str,
        timestamp: int,
    ) -> DecisionResult:
        """Parse an LLM response into a TradingDecision.
        
        Args:
            response: Raw LLM response
            model_id: Model identifier
            market_ticker: Market being evaluated
            timestamp: Current simulation timestamp
            
        Returns:
            DecisionResult with parsed decision or error
        """
        parsed = self._parse_json_response(response)
        
        if not parsed:
            return DecisionResult(
                success=False,
                decision=None,
                raw_response=response,
                error="Failed to parse JSON from response",
            )
        
        try:
            # Parse action
            action_str = parsed.get("action", "hold").lower()
            action_map = {
                "buy_yes": Action.BUY_YES,
                "buy_no": Action.BUY_NO,
                "hold": Action.HOLD,
                "sell_yes": Action.SELL_YES,
                "sell_no": Action.SELL_NO,
                "sell": Action.SELL_YES,  # Default sell to YES
            }
            action = action_map.get(action_str, Action.HOLD)
            
            # Parse other fields with defaults
            quantity = int(parsed.get("quantity", 0))
            confidence = float(parsed.get("confidence", 50))
            probability_yes = float(parsed.get("probability_yes", 0.5))
            reasoning = str(parsed.get("reasoning", "No reasoning provided"))
            
            # Validate ranges
            quantity = max(0, min(100, quantity))
            confidence = max(0, min(100, confidence))
            probability_yes = max(0.0, min(1.0, probability_yes))
            
            decision = TradingDecision(
                model_id=model_id,
                market_ticker=market_ticker,
                timestamp=timestamp,
                action=action,
                quantity=quantity,
                confidence=confidence,
                reasoning=reasoning,
                probability_yes=probability_yes,
            )
            
            return DecisionResult(
                success=True,
                decision=decision,
                raw_response=response,
            )
            
        except (ValueError, TypeError, KeyError) as e:
            return DecisionResult(
                success=False,
                decision=None,
                raw_response=response,
                error=f"Failed to parse decision fields: {e}",
            )
    
    async def get_decision(
        self,
        model_id: str,
        state: MarketState,
        portfolio: Portfolio,
    ) -> DecisionResult:
        """Get a trading decision from an LLM.
        
        Args:
            model_id: The LLM model to query
            state: Current market state
            portfolio: LLM's current portfolio
            
        Returns:
            DecisionResult with the decision or error
        """
        # Rate limiting
        import time
        now = time.time()
        if model_id in self._last_call_time:
            elapsed = now - self._last_call_time[model_id]
            if elapsed < self.rate_limit_delay:
                await asyncio.sleep(self.rate_limit_delay - elapsed)
        
        self._last_call_time[model_id] = time.time()
        
        # Build prompt
        user_prompt = build_market_prompt(state, portfolio)
        
        logger.debug(
            f"Querying {model_id} for decision on {state.ticker}",
            extra={"model": model_id, "market": state.ticker},
        )
        
        try:
            # Import here to avoid circular imports
            from llm_service.llm.schemas import ChatMessage, ChatRequest
            
            request = ChatRequest(
                model=model_id,
                messages=[
                    ChatMessage(role="system", content=SYSTEM_PROMPT),
                    ChatMessage(role="user", content=user_prompt),
                ],
                temperature=0.3,  # Lower temperature for more consistent decisions
                max_tokens=500,
            )
            
            response = await self.llm_client.achat_completion(request)
            response_text = response.message.content or ""
            
            result = self._parse_decision(
                response_text,
                model_id,
                state.ticker,
                state.current_timestamp,
            )
            
            if result.success:
                logger.info(
                    f"{model_id} decided {result.decision.action.value} "
                    f"on {state.ticker}",
                    extra={
                        "model": model_id,
                        "market": state.ticker,
                        "action": result.decision.action.value,
                        "quantity": result.decision.quantity,
                    },
                )
            else:
                logger.warning(
                    f"Failed to parse {model_id} decision: {result.error}",
                    extra={"raw_response": response_text[:200]},
                )
            
            return result
            
        except Exception as e:
            logger.error(
                f"Error getting decision from {model_id}: {e}",
                exc_info=True,
            )
            return DecisionResult(
                success=False,
                decision=None,
                raw_response="",
                error=str(e),
            )
    
    async def get_decisions_for_all_models(
        self,
        model_ids: list[str],
        state: MarketState,
        portfolios: dict[str, Portfolio],
    ) -> dict[str, DecisionResult]:
        """Get decisions from multiple models in parallel.
        
        Args:
            model_ids: List of model IDs to query
            state: Current market state
            portfolios: Dict of model_id -> Portfolio
            
        Returns:
            Dict of model_id -> DecisionResult
        """
        tasks = []
        for model_id in model_ids:
            portfolio = portfolios.get(model_id)
            if portfolio:
                tasks.append(self.get_decision(model_id, state, portfolio))
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        decision_map = {}
        for model_id, result in zip(model_ids, results):
            if isinstance(result, Exception):
                decision_map[model_id] = DecisionResult(
                    success=False,
                    decision=None,
                    raw_response="",
                    error=str(result),
                )
            else:
                decision_map[model_id] = result
        
        return decision_map

