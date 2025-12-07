/**
 * Risk Engine - Enforces trading rules and risk parameters
 */

import type { ModelId } from "./tradingSimulation";

// ============================================================================
// RISK PARAMETERS
// ============================================================================

export const RISK_PARAMS = {
  // Position limits
  MAX_POSITION_PER_MARKET: 1,              // Max 1 position per market (per model)
  
  // Position sizing (dollar-based)
  TARGET_POSITION_SIZE_PCT: 0.10,          // Aim for 10% of portfolio per new position
  MAX_POSITION_VALUE_DOLLARS: 1500,        // Hard cap per position in dollars
  
  // Capital management
  MIN_CASH_RESERVE: 500,                   // Always keep at least $500 in cash
  MAX_POSITION_SIZE_PCT: 0.15,             // Max 15% of portfolio per position
  
  // Trade execution
  MIN_CONFIDENCE_TO_BUY: 60,               // Minimum confidence % to enter position
  MIN_CONFIDENCE_TO_HOLD: 50,              // Minimum confidence % to keep position
  TRANSACTION_FEE_PCT: 0.001,              // 0.1% transaction fee
  
  // Risk limits
  MAX_DRAWDOWN_PCT: 50,                    // Max 50% drawdown before halting trades
  MIN_PORTFOLIO_VALUE: 1000,               // Minimum portfolio value to continue trading
};

// ============================================================================
// POSITION TRACKING
// ============================================================================

export interface Position {
  marketTicker: string;
  marketTitle: string;
  side: 'YES' | 'NO';
  contracts: number;
  entryPrice: number;
  cost: number;
  timestamp: Date;
  closeTime?: Date;                         // Market close time
}

export interface ModelPortfolio {
  modelId: ModelId;
  cash: number;
  positions: Map<string, Position>;
  totalValue: number;
  history: { time: number; value: number }[];
  peakValue: number;                        // Track for drawdown calculation
  tradesThisSession: number;
}

// ============================================================================
// RISK CHECKS
// ============================================================================

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export class RiskEngine {
  /**
   * Check if model can open a new position
   */
  static canOpenPosition(
    portfolio: ModelPortfolio,
    marketTicker: string,
    positionCost: number
  ): RiskCheckResult {
    // Check 1: Already have position in this market?
    if (portfolio.positions.has(marketTicker)) {
      return {
        allowed: false,
        reason: `Already have position in market ${marketTicker}`
      };
    }
    
    // Check 2: Sufficient cash?
    const cashAfterTrade = portfolio.cash - positionCost;
    if (cashAfterTrade < RISK_PARAMS.MIN_CASH_RESERVE) {
      return {
        allowed: false,
        reason: `Insufficient cash (need ${RISK_PARAMS.MIN_CASH_RESERVE} reserve, would have ${cashAfterTrade.toFixed(2)})`
      };
    }
    
    // Check 3: Position size too large relative to portfolio?
    const maxPositionSize = portfolio.totalValue * RISK_PARAMS.MAX_POSITION_SIZE_PCT;
    if (positionCost > maxPositionSize) {
      return {
        allowed: false,
        reason: `Position too large (${positionCost.toFixed(2)} > ${maxPositionSize.toFixed(2)} max)`
      };
    }
    
    // Check 4: Portfolio in drawdown?
    const drawdown = (portfolio.peakValue - portfolio.totalValue) / portfolio.peakValue;
    if (drawdown > RISK_PARAMS.MAX_DRAWDOWN_PCT / 100) {
      return {
        allowed: false,
        reason: `Portfolio in excessive drawdown (${(drawdown * 100).toFixed(1)}%)`
      };
    }
    
    // Check 5: Portfolio value above minimum?
    if (portfolio.totalValue < RISK_PARAMS.MIN_PORTFOLIO_VALUE) {
      return {
        allowed: false,
        reason: `Portfolio value below minimum (${portfolio.totalValue.toFixed(2)} < ${RISK_PARAMS.MIN_PORTFOLIO_VALUE})`
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check if position should be closed
   */
  static shouldClosePosition(
    position: Position,
    currentPrice: number,
    confidence: number,
    marketCloseTime?: Date
  ): { shouldClose: boolean; reason: string } {
    // Reason 1: Market has closed/expired
    if (marketCloseTime && new Date() >= marketCloseTime) {
      return {
        shouldClose: true,
        reason: 'Market expired - auto-closing position'
      };
    }
    
    // Reason 2: Confidence dropped below threshold
    if (confidence < RISK_PARAMS.MIN_CONFIDENCE_TO_HOLD) {
      return {
        shouldClose: true,
        reason: `Low confidence (${confidence}% < ${RISK_PARAMS.MIN_CONFIDENCE_TO_HOLD}%)`
      };
    }
    
    // Reason 3: Stop loss - position down >30%
    const currentValue = currentPrice * position.contracts;
    const loss = (currentValue - position.cost) / position.cost;
    if (loss < -0.30) {
      return {
        shouldClose: true,
        reason: `Stop loss triggered (${(loss * 100).toFixed(1)}% loss)`
      };
    }
    
    // Reason 4: Take profit - position up >100%
    if (loss > 1.0) {
      return {
        shouldClose: true,
        reason: `Take profit triggered (+${(loss * 100).toFixed(1)}% gain)`
      };
    }
    
    return { shouldClose: false, reason: '' };
  }
  
  /**
   * Calculate position cost with fees
   */
  static calculatePositionCost(price: number, contracts: number): number {
    return price * contracts * (1 + RISK_PARAMS.TRANSACTION_FEE_PCT);
  }
  
  /**
   * Calculate position proceeds with fees
   */
  static calculatePositionProceeds(price: number, contracts: number): number {
    return price * contracts * (1 - RISK_PARAMS.TRANSACTION_FEE_PCT);
  }
  
  /**
   * Validate confidence level
   */
  static isConfidenceSufficient(confidence: number, action: 'BUY' | 'HOLD'): boolean {
    if (action === 'BUY') {
      return confidence >= RISK_PARAMS.MIN_CONFIDENCE_TO_BUY;
    } else {
      return confidence >= RISK_PARAMS.MIN_CONFIDENCE_TO_HOLD;
    }
  }
  
  /**
   * Update peak value for drawdown tracking
   */
  static updatePeakValue(portfolio: ModelPortfolio): void {
    if (portfolio.totalValue > portfolio.peakValue) {
      portfolio.peakValue = portfolio.totalValue;
    }
  }
  
  /**
   * Check for expired markets and force close positions
   */
  static getExpiredPositions(portfolio: ModelPortfolio): Position[] {
    const now = new Date();
    const expired: Position[] = [];
    
    for (const [ticker, position] of Array.from(portfolio.positions.entries())) {
      if (position.closeTime && now >= position.closeTime) {
        expired.push(position);
      }
    }
    
    return expired;
  }
  
  /**
   * Get risk metrics summary for a portfolio
   */
  static getRiskMetrics(portfolio: ModelPortfolio): {
    numPositions: number;
    cashReserve: number;
    cashReservePct: number;
    drawdown: number;
    drawdownPct: number;
    utilizationPct: number;
    isHealthy: boolean;
  } {
    const drawdown = portfolio.peakValue - portfolio.totalValue;
    const drawdownPct = (drawdown / portfolio.peakValue) * 100;
    const cashReservePct = (portfolio.cash / portfolio.totalValue) * 100;
    const utilizationPct = ((portfolio.totalValue - portfolio.cash) / portfolio.totalValue) * 100;
    
    const isHealthy = 
      portfolio.cash >= RISK_PARAMS.MIN_CASH_RESERVE &&
      drawdownPct < RISK_PARAMS.MAX_DRAWDOWN_PCT &&
      portfolio.totalValue >= RISK_PARAMS.MIN_PORTFOLIO_VALUE;
    
    return {
      numPositions: portfolio.positions.size,
      cashReserve: portfolio.cash,
      cashReservePct,
      drawdown,
      drawdownPct,
      utilizationPct,
      isHealthy
    };
  }
}

