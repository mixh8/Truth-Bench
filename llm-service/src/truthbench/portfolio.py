"""Portfolio Manager for TruthBench.

This module handles portfolio tracking, trade execution,
position management, and P&L calculation.
"""

import logging
from copy import deepcopy
from dataclasses import dataclass

from .models import Action, MarketState, Portfolio, Position, TradingDecision

logger = logging.getLogger(__name__)


@dataclass
class TradeExecution:
    """Result of a trade execution."""
    success: bool
    model_id: str
    market_ticker: str
    action: Action
    quantity: int
    price: float
    cost: float
    error: str | None = None


class PortfolioManager:
    """Manages portfolios for all LLMs in the simulation.
    
    Handles trade execution, position tracking, and settlement
    when markets resolve.
    """
    
    def __init__(
        self,
        model_ids: list[str],
        model_names: dict[str, str],
        initial_bankroll: float,
        max_position_pct: float = 0.10,
    ):
        """Initialize the portfolio manager.
        
        Args:
            model_ids: List of model IDs to track
            model_names: Dict mapping model_id -> display name
            initial_bankroll: Starting bankroll for each model (in cents)
            max_position_pct: Maximum % of bankroll per position
        """
        self.initial_bankroll = initial_bankroll
        self.max_position_pct = max_position_pct
        
        # Initialize portfolios for each model
        self.portfolios: dict[str, Portfolio] = {}
        for model_id in model_ids:
            self.portfolios[model_id] = Portfolio(
                model_id=model_id,
                model_name=model_names.get(model_id, model_id),
                bankroll=initial_bankroll,
                initial_bankroll=initial_bankroll,
                positions={},
                pnl_history=[],
                decisions=[],
                total_trades=0,
                winning_trades=0,
            )
        
        logger.info(
            f"PortfolioManager initialized for {len(model_ids)} models",
            extra={"initial_bankroll": initial_bankroll},
        )
    
    def get_portfolio(self, model_id: str) -> Portfolio | None:
        """Get a model's portfolio."""
        return self.portfolios.get(model_id)
    
    def get_all_portfolios(self) -> list[Portfolio]:
        """Get all portfolios."""
        return list(self.portfolios.values())
    
    def _calculate_max_quantity(
        self,
        portfolio: Portfolio,
        price: float,
    ) -> int:
        """Calculate maximum contracts that can be purchased.
        
        Args:
            portfolio: The portfolio to check
            price: Price per contract in cents
            
        Returns:
            Maximum number of contracts affordable
        """
        if price <= 0:
            return 0
        
        # Max position size
        max_position_value = portfolio.bankroll * self.max_position_pct
        
        # How many contracts at this price
        max_quantity = int(max_position_value / price)
        
        return max(0, max_quantity)
    
    def execute_decision(
        self,
        decision: TradingDecision,
        state: MarketState,
    ) -> TradeExecution:
        """Execute a trading decision.
        
        Args:
            decision: The trading decision to execute
            state: Current market state with prices
            
        Returns:
            TradeExecution result
        """
        portfolio = self.portfolios.get(decision.model_id)
        if not portfolio:
            return TradeExecution(
                success=False,
                model_id=decision.model_id,
                market_ticker=decision.market_ticker,
                action=decision.action,
                quantity=0,
                price=0,
                cost=0,
                error="Portfolio not found",
            )
        
        # Record the decision
        portfolio.decisions.append(decision)
        
        # Handle HOLD - no trade execution
        if decision.action == Action.HOLD:
            return TradeExecution(
                success=True,
                model_id=decision.model_id,
                market_ticker=decision.market_ticker,
                action=decision.action,
                quantity=0,
                price=0,
                cost=0,
            )
        
        # Determine price based on action
        if decision.action == Action.BUY_YES:
            price = state.current_yes_ask  # Pay ask price
        elif decision.action == Action.BUY_NO:
            price = 100 - state.current_yes_bid  # NO price is 100 - YES bid
        elif decision.action in (Action.SELL_YES, Action.SELL_NO):
            # Check if we have a position to sell
            if decision.market_ticker not in portfolio.positions:
                return TradeExecution(
                    success=False,
                    model_id=decision.model_id,
                    market_ticker=decision.market_ticker,
                    action=decision.action,
                    quantity=0,
                    price=0,
                    cost=0,
                    error="No position to sell",
                )
            price = state.current_yes_bid if decision.action == Action.SELL_YES else (100 - state.current_yes_ask)
        else:
            price = 50  # Fallback
        
        # Ensure price is valid
        if price <= 0:
            price = 1
        if price > 100:
            price = 99
        
        # Calculate quantity
        requested_quantity = decision.quantity
        if decision.action in (Action.BUY_YES, Action.BUY_NO):
            max_quantity = self._calculate_max_quantity(portfolio, price)
            quantity = min(requested_quantity, max_quantity)
            
            if quantity <= 0:
                return TradeExecution(
                    success=False,
                    model_id=decision.model_id,
                    market_ticker=decision.market_ticker,
                    action=decision.action,
                    quantity=0,
                    price=price,
                    cost=0,
                    error="Insufficient bankroll",
                )
        else:
            # Selling - use position quantity
            position = portfolio.positions.get(decision.market_ticker)
            if position:
                quantity = min(requested_quantity, position.quantity)
            else:
                quantity = 0
        
        # Execute trade
        cost = quantity * price
        
        if decision.action == Action.BUY_YES:
            portfolio.bankroll -= cost
            
            # Update or create position
            if decision.market_ticker in portfolio.positions:
                pos = portfolio.positions[decision.market_ticker]
                if pos.side == "yes":
                    # Add to existing YES position
                    total_cost = pos.avg_price * pos.quantity + cost
                    pos.quantity += quantity
                    pos.avg_price = total_cost / pos.quantity
                else:
                    # Close NO position and open YES
                    portfolio.positions[decision.market_ticker] = Position(
                        market_ticker=decision.market_ticker,
                        side="yes",
                        quantity=quantity,
                        avg_price=price,
                        entry_timestamp=decision.timestamp,
                    )
            else:
                portfolio.positions[decision.market_ticker] = Position(
                    market_ticker=decision.market_ticker,
                    side="yes",
                    quantity=quantity,
                    avg_price=price,
                    entry_timestamp=decision.timestamp,
                )
            portfolio.total_trades += 1
            
        elif decision.action == Action.BUY_NO:
            portfolio.bankroll -= cost
            
            if decision.market_ticker in portfolio.positions:
                pos = portfolio.positions[decision.market_ticker]
                if pos.side == "no":
                    total_cost = pos.avg_price * pos.quantity + cost
                    pos.quantity += quantity
                    pos.avg_price = total_cost / pos.quantity
                else:
                    portfolio.positions[decision.market_ticker] = Position(
                        market_ticker=decision.market_ticker,
                        side="no",
                        quantity=quantity,
                        avg_price=price,
                        entry_timestamp=decision.timestamp,
                    )
            else:
                portfolio.positions[decision.market_ticker] = Position(
                    market_ticker=decision.market_ticker,
                    side="no",
                    quantity=quantity,
                    avg_price=price,
                    entry_timestamp=decision.timestamp,
                )
            portfolio.total_trades += 1
            
        elif decision.action in (Action.SELL_YES, Action.SELL_NO):
            # Sell position
            position = portfolio.positions.get(decision.market_ticker)
            if position and quantity > 0:
                proceeds = quantity * price
                portfolio.bankroll += proceeds
                
                # Check if profitable
                if price > position.avg_price:
                    portfolio.winning_trades += 1
                
                position.quantity -= quantity
                if position.quantity <= 0:
                    del portfolio.positions[decision.market_ticker]
                
                portfolio.total_trades += 1
        
        logger.debug(
            f"Trade executed: {decision.model_id} {decision.action.value} "
            f"{quantity} @ {price}¢ on {decision.market_ticker}",
            extra={
                "model": decision.model_id,
                "action": decision.action.value,
                "quantity": quantity,
                "price": price,
                "cost": cost,
            },
        )
        
        return TradeExecution(
            success=True,
            model_id=decision.model_id,
            market_ticker=decision.market_ticker,
            action=decision.action,
            quantity=quantity,
            price=price,
            cost=cost,
        )
    
    def settle_market(
        self,
        market_ticker: str,
        result: str,
    ) -> dict[str, float]:
        """Settle all positions in a resolved market.
        
        Args:
            market_ticker: The market that resolved
            result: "yes" or "no"
            
        Returns:
            Dict of model_id -> P&L from this market
        """
        pnl_by_model: dict[str, float] = {}
        
        for model_id, portfolio in self.portfolios.items():
            if market_ticker not in portfolio.positions:
                pnl_by_model[model_id] = 0
                continue
            
            position = portfolio.positions[market_ticker]
            
            # Calculate settlement value
            # Winning contracts pay 100¢, losing pay 0¢
            if result == "yes":
                settlement_value = 100 if position.side == "yes" else 0
            else:
                settlement_value = 100 if position.side == "no" else 0
            
            # Calculate P&L
            proceeds = position.quantity * settlement_value
            cost_basis = position.quantity * position.avg_price
            pnl = proceeds - cost_basis
            
            # Update bankroll
            portfolio.bankroll += proceeds
            
            # Track winning trades
            if pnl > 0:
                portfolio.winning_trades += 1
            
            # Remove position
            del portfolio.positions[market_ticker]
            
            pnl_by_model[model_id] = pnl
            
            logger.info(
                f"Settled {market_ticker} for {model_id}: "
                f"{position.quantity} {position.side} -> {result}, P&L: {pnl}¢",
                extra={
                    "model": model_id,
                    "market": market_ticker,
                    "result": result,
                    "pnl": pnl,
                },
            )
        
        return pnl_by_model
    
    def record_snapshot(self, timestamp: int) -> None:
        """Record a P&L snapshot for all portfolios.
        
        Args:
            timestamp: Current simulation timestamp
        """
        for portfolio in self.portfolios.values():
            # Calculate unrealized P&L (simplified - would need current prices)
            total_value = portfolio.bankroll
            for pos in portfolio.positions.values():
                # Estimate position value at 50¢ (neutral)
                total_value += pos.quantity * 50
            
            portfolio.pnl_history.append({
                "timestamp": timestamp,
                "bankroll": portfolio.bankroll,
                "total_value": total_value,
                "positions": len(portfolio.positions),
            })
    
    def get_summary(self) -> dict[str, dict]:
        """Get a summary of all portfolios."""
        summary = {}
        for model_id, portfolio in self.portfolios.items():
            roi = (portfolio.bankroll - portfolio.initial_bankroll) / portfolio.initial_bankroll
            win_rate = (
                portfolio.winning_trades / portfolio.total_trades
                if portfolio.total_trades > 0
                else 0
            )
            
            summary[model_id] = {
                "model_name": portfolio.model_name,
                "bankroll": portfolio.bankroll,
                "initial_bankroll": portfolio.initial_bankroll,
                "roi": roi,
                "total_trades": portfolio.total_trades,
                "winning_trades": portfolio.winning_trades,
                "win_rate": win_rate,
                "open_positions": len(portfolio.positions),
            }
        
        return summary

