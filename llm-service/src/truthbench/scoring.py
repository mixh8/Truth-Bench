"""Scoring Engine for TruthBench.

This module calculates benchmark metrics for evaluating LLM performance:
- ROI (Return on Investment)
- Brier Score (calibration)
- Accuracy (directional correctness)
- Sharpe Ratio (risk-adjusted returns)
- Win Rate (profitable trade percentage)
"""

import logging
import math
from dataclasses import dataclass

from .models import Action, ModelScore, Portfolio, TradingDecision

logger = logging.getLogger(__name__)


@dataclass
class MarketPrediction:
    """A prediction made by an LLM for a specific market."""
    model_id: str
    market_ticker: str
    probability_yes: float  # 0-1
    actual_result: str  # "yes" or "no"
    timestamp: int


class ScoringEngine:
    """Engine for calculating benchmark scores.
    
    Computes various metrics to evaluate LLM forecasting ability
    and trading performance.
    """
    
    def __init__(self):
        """Initialize the scoring engine."""
        self.predictions: list[MarketPrediction] = []
        logger.info("ScoringEngine initialized")
    
    def record_prediction(
        self,
        decision: TradingDecision,
        actual_result: str,
    ) -> None:
        """Record a prediction for later scoring.
        
        Args:
            decision: The trading decision containing probability
            actual_result: The actual market outcome ("yes" or "no")
        """
        # Only record if the LLM made a directional bet
        if decision.action in (Action.BUY_YES, Action.BUY_NO):
            self.predictions.append(MarketPrediction(
                model_id=decision.model_id,
                market_ticker=decision.market_ticker,
                probability_yes=decision.probability_yes,
                actual_result=actual_result,
                timestamp=decision.timestamp,
            ))
    
    def calculate_brier_score(self, model_id: str) -> float:
        """Calculate Brier score for a model.
        
        Brier score measures calibration - how well probability estimates
        match actual outcomes. Lower is better (0 = perfect, 0.25 = random).
        
        Formula: (1/N) * Σ(forecast - outcome)²
        
        Args:
            model_id: The model to score
            
        Returns:
            Brier score (0-1, lower is better)
        """
        model_predictions = [
            p for p in self.predictions
            if p.model_id == model_id
        ]
        
        if not model_predictions:
            return 0.25  # Random baseline
        
        total_squared_error = 0.0
        for pred in model_predictions:
            outcome = 1.0 if pred.actual_result == "yes" else 0.0
            error = pred.probability_yes - outcome
            total_squared_error += error ** 2
        
        return total_squared_error / len(model_predictions)
    
    def calculate_accuracy(self, model_id: str) -> float:
        """Calculate directional accuracy for a model.
        
        Accuracy = % of predictions where the model's direction
        (>50% = yes, <50% = no) matched the outcome.
        
        Args:
            model_id: The model to score
            
        Returns:
            Accuracy (0-1, higher is better)
        """
        model_predictions = [
            p for p in self.predictions
            if p.model_id == model_id
        ]
        
        if not model_predictions:
            return 0.5  # Random baseline
        
        correct = 0
        for pred in model_predictions:
            predicted_yes = pred.probability_yes >= 0.5
            actual_yes = pred.actual_result == "yes"
            if predicted_yes == actual_yes:
                correct += 1
        
        return correct / len(model_predictions)
    
    def calculate_roi(self, portfolio: Portfolio) -> float:
        """Calculate Return on Investment.
        
        ROI = (Final Value - Initial Value) / Initial Value
        
        Args:
            portfolio: The portfolio to analyze
            
        Returns:
            ROI as a decimal (e.g., 0.15 = 15% return)
        """
        if portfolio.initial_bankroll == 0:
            return 0.0
        
        return (
            (portfolio.bankroll - portfolio.initial_bankroll) 
            / portfolio.initial_bankroll
        )
    
    def calculate_sharpe_ratio(
        self,
        portfolio: Portfolio,
        risk_free_rate: float = 0.0,
    ) -> float:
        """Calculate Sharpe ratio for risk-adjusted returns.
        
        Sharpe = (Return - Risk Free Rate) / Std Dev of Returns
        
        Uses P&L history to compute return volatility.
        
        Args:
            portfolio: The portfolio to analyze
            risk_free_rate: Risk-free rate (default 0)
            
        Returns:
            Sharpe ratio (higher is better, >1 is good)
        """
        if len(portfolio.pnl_history) < 2:
            return 0.0
        
        # Calculate period returns
        returns = []
        for i in range(1, len(portfolio.pnl_history)):
            prev_value = portfolio.pnl_history[i-1].get("total_value", portfolio.initial_bankroll)
            curr_value = portfolio.pnl_history[i].get("total_value", portfolio.initial_bankroll)
            
            if prev_value > 0:
                period_return = (curr_value - prev_value) / prev_value
                returns.append(period_return)
        
        if not returns:
            return 0.0
        
        # Calculate mean and std dev
        mean_return = sum(returns) / len(returns)
        
        if len(returns) < 2:
            return 0.0
        
        variance = sum((r - mean_return) ** 2 for r in returns) / (len(returns) - 1)
        std_dev = math.sqrt(variance) if variance > 0 else 0.001
        
        # Annualize (assume hourly returns, ~8760 hours/year)
        annualized_return = mean_return * 8760
        annualized_std = std_dev * math.sqrt(8760)
        
        if annualized_std == 0:
            return 0.0
        
        return (annualized_return - risk_free_rate) / annualized_std
    
    def calculate_win_rate(self, portfolio: Portfolio) -> float:
        """Calculate win rate (% of profitable trades).
        
        Args:
            portfolio: The portfolio to analyze
            
        Returns:
            Win rate (0-1, higher is better)
        """
        if portfolio.total_trades == 0:
            return 0.0
        
        return portfolio.winning_trades / portfolio.total_trades
    
    def calculate_model_score(self, portfolio: Portfolio) -> ModelScore:
        """Calculate all scores for a model.
        
        Args:
            portfolio: The model's portfolio
            
        Returns:
            ModelScore with all metrics
        """
        return ModelScore(
            model_id=portfolio.model_id,
            model_name=portfolio.model_name,
            roi=self.calculate_roi(portfolio),
            final_bankroll=portfolio.bankroll,
            brier_score=self.calculate_brier_score(portfolio.model_id),
            accuracy=self.calculate_accuracy(portfolio.model_id),
            win_rate=self.calculate_win_rate(portfolio),
            total_trades=portfolio.total_trades,
            sharpe_ratio=self.calculate_sharpe_ratio(portfolio),
        )
    
    def calculate_all_scores(
        self,
        portfolios: list[Portfolio],
    ) -> list[ModelScore]:
        """Calculate scores for all models.
        
        Args:
            portfolios: List of all portfolios
            
        Returns:
            List of ModelScore sorted by ROI (best first)
        """
        scores = [self.calculate_model_score(p) for p in portfolios]
        
        # Sort by ROI descending
        scores.sort(key=lambda s: s.roi, reverse=True)
        
        return scores
    
    def get_rankings(self, scores: list[ModelScore]) -> list[str]:
        """Get model rankings by ROI.
        
        Args:
            scores: List of ModelScore (should already be sorted)
            
        Returns:
            List of model_ids in ranking order
        """
        return [s.model_id for s in scores]
    
    def generate_report(self, scores: list[ModelScore]) -> str:
        """Generate a text report of benchmark results.
        
        Args:
            scores: List of ModelScore (sorted by ROI)
            
        Returns:
            Formatted report string
        """
        lines = [
            "=" * 60,
            "TRUTHBENCH RESULTS",
            "=" * 60,
            "",
        ]
        
        for rank, score in enumerate(scores, 1):
            lines.extend([
                f"#{rank} {score.model_name}",
                f"  ROI: {score.roi:+.2%}",
                f"  Final Bankroll: ${score.final_bankroll/100:,.2f}",
                f"  Brier Score: {score.brier_score:.4f}",
                f"  Accuracy: {score.accuracy:.1%}",
                f"  Win Rate: {score.win_rate:.1%}",
                f"  Total Trades: {score.total_trades}",
                f"  Sharpe Ratio: {score.sharpe_ratio:.2f}",
                "",
            ])
        
        lines.append("=" * 60)
        
        return "\n".join(lines)
    
    def to_dict(self, scores: list[ModelScore]) -> list[dict]:
        """Convert scores to list of dicts for JSON serialization."""
        return [
            {
                "model_id": s.model_id,
                "model_name": s.model_name,
                "roi": s.roi,
                "final_bankroll": s.final_bankroll,
                "brier_score": s.brier_score,
                "accuracy": s.accuracy,
                "win_rate": s.win_rate,
                "total_trades": s.total_trades,
                "sharpe_ratio": s.sharpe_ratio,
            }
            for s in scores
        ]

