import {
  TradeCostBreakdown,
  TradeLiquidityMetrics,
  HistoricalStats,
  ScoreComponents,
  FinancialConfig,
} from '../types';

export class OpportunityScoringEngine {
  /**
   * Transparent factor-based scoring engine (0 to 100 for each component).
   * No opaque black box: each factor is strictly explainable to the trader.
   */
  static evaluate(
    costs: TradeCostBreakdown,
    liquidity: TradeLiquidityMetrics,
    history: HistoricalStats | undefined,
    routeJumps: number,
    isHighSecOnly: boolean,
    config: FinancialConfig,
    effectiveBuyPrice?: number,
    quantity?: number
  ): {
    scores: ScoreComponents;
    capturableProfit: number;
    profitPerDay: number;
    expectedDaysToSell: number;
    isAnomalous: boolean;
    anomalyReasons: string[];
    isViable: boolean;
    rejectionReasons: string[];
  } {
    const anomalyReasons: string[] = [];
    const rejectionReasons: string[] = [];

    // 1. Profit Score (0-100)
    // Scale: 0 ISK => 0, 5M => 50, 50M+ => 100
    const profitScore = Math.min(100, Math.max(0, (Math.log10(Math.max(1, costs.net_profit)) / 8) * 100));

    // 2. ROI Score (0-100)
    // Scale: 0% => 0, 5% => 40, 15% => 80, 25%+ => 100
    const roiScore = Math.min(100, Math.max(0, (costs.roi / 0.25) * 100));

    // 3. Liquidity & Volume Score (0-100)
    // Based on daily volume and orders depth
    const dailyVolume = liquidity.daily_volume_dest || (history?.daily_volume_7d_median || 100);
    const volumeScore = Math.min(100, Math.max(0, (Math.log10(Math.max(1, dailyVolume)) / 6) * 100));

    // 4. Expected Days to Sell & Turnover
    // Trade quantity resolution
    const tradeQuantity = quantity && quantity > 0
      ? quantity
      : (liquidity.turnover_ratio > 0 && dailyVolume > 0
        ? Math.max(1, Math.round(liquidity.turnover_ratio * dailyVolume))
        : 1);

    // Normalize realistically: ratio of trade quantity to daily volume
    const rawDays = dailyVolume > 0 ? Math.max(0.1, tradeQuantity / Math.max(1, dailyVolume)) : 14;
    const daysToSell = Math.max(0.1, Math.min(30, liquidity.expected_days_to_sell && liquidity.expected_days_to_sell > 0 ? liquidity.expected_days_to_sell : rawDays));
    
    // Turnover Score (0-100): Faster turnover => higher score
    // 0.5 days => 100, 3 days => 80, 7 days => 50, 20+ days => 10
    const turnoverScore = Math.min(100, Math.max(0, 100 - (daysToSell / 14) * 80));

    // 5. Liquidity Score: combines spread tightness and depth availability
    const depthRatio = Math.min(1, liquidity.sell_hub_depth_volume / Math.max(1, liquidity.buy_hub_depth_volume));
    const liquidityScore = Math.min(100, Math.max(10, depthRatio * 60 + volumeScore * 0.4));

    // 6. Transport Score (0-100): shorter route & High-Sec is safer and faster
    const jumpPenalty = Math.min(60, routeJumps * 2.2);
    const secBonus = isHighSecOnly ? 40 : 10;
    const transportScore = Math.min(100, Math.max(0, 100 - jumpPenalty + (secBonus - 40)));

    // 7. Stability & Anomaly Detection
    // Unit effective buy price (resolves total purchase cost to per-unit cost)
    const unitEffectiveBuyPrice = effectiveBuyPrice && effectiveBuyPrice > 0
      ? effectiveBuyPrice
      : (costs.purchase_cost > 0 && tradeQuantity > 0
        ? costs.purchase_cost / tradeQuantity
        : costs.purchase_cost);

    let isAnomalous = false;
    let stabilityScore = 80;

    if (costs.roi > 0.60) {
      isAnomalous = true;
      anomalyReasons.push(`ROI anormalement élevé (${(costs.roi * 100).toFixed(1)}%). Risque de manipulation de carnet ou illiquidité.`);
      stabilityScore -= 30;
    }

    if (history && history.price_median_30d !== undefined && history.price_median_30d > 0) {
      const unitPriceRatio = unitEffectiveBuyPrice / history.price_median_30d;
      const priceDeviationPct = ((unitEffectiveBuyPrice - history.price_median_30d) / history.price_median_30d) * 100;
      if (unitPriceRatio > 3.0 || unitPriceRatio < 0.25) {
        isAnomalous = true;
        anomalyReasons.push(`Prix spot unitaire (${unitEffectiveBuyPrice.toLocaleString()} ISK) très éloigné de la médiane historique 30j (${history.price_median_30d.toLocaleString()} ISK, écart: ${priceDeviationPct > 0 ? '+' : ''}${priceDeviationPct.toFixed(1)}%).`);
        stabilityScore -= 30;
      }
    }

    // 8. Capturable Profit Calculation
    // Capturable profit discounts pure theoretical profit by liquidity and turnover friction:
    // Capturable = Net Profit * (turnoverFactor) * (liquidityFactor)
    const turnoverFactor = Math.min(1.0, Math.max(0.15, 1.0 / (1 + daysToSell * 0.12)));
    const liquidityFactor = Math.min(1.0, Math.max(0.20, liquidityScore / 100));
    const capturableProfit = costs.net_profit * turnoverFactor * liquidityFactor;

    // Profit per day
    const profitPerDay = daysToSell > 0 ? capturableProfit / daysToSell : capturableProfit;

    // 9. Capital Efficiency Score: Return per day of capital locked
    const dailyRoi = costs.capital_locked > 0 ? profitPerDay / costs.capital_locked : 0;
    const capitalEfficiencyScore = Math.min(100, Math.max(0, (dailyRoi / 0.05) * 100));

    // 10. Competition Score: estimated from order depth and hub activity
    const competitionScore = Math.min(100, Math.max(20, 90 - (liquidity.sell_hub_depth_volume > 1000000 ? 30 : 10)));

    // Profile-adaptive scoring weights
    const profile = config.trader_profile || 'balanced';
    let wProfit = 0.15, wRoi = 0.15, wLiq = 0.15, wTurn = 0.15, wCap = 0.15, wTrans = 0.10, wStab = 0.15;

    if (profile === 'highsec_daytrader') {
      wTurn = 0.25;
      wLiq = 0.20;
      wStab = 0.20;
      wProfit = 0.15;
      wRoi = 0.10;
      wCap = 0.05;
      wTrans = 0.05;
    } else if (profile === 'heavy_hauler') {
      wProfit = 0.25;
      wTrans = 0.20;
      wCap = 0.15;
      wRoi = 0.15;
      wTurn = 0.10;
      wLiq = 0.10;
      wStab = 0.05;
    } else if (profile === 'station_trader') {
      wCap = 0.25;
      wRoi = 0.25;
      wProfit = 0.20;
      wTurn = 0.15;
      wLiq = 0.15;
      wTrans = 0.0;
      wStab = 0.0;
    }

    // Overall Weighted Score (0 to 100)
    const overallScore = Math.round(
      profitScore * wProfit +
      roiScore * wRoi +
      liquidityScore * wLiq +
      turnoverScore * wTurn +
      capitalEfficiencyScore * wCap +
      transportScore * wTrans +
      stabilityScore * wStab
    );

    const scores: ScoreComponents = {
      profit_score: Math.round(profitScore),
      roi_score: Math.round(roiScore),
      liquidity_score: Math.round(liquidityScore),
      volume_score: Math.round(volumeScore),
      turnover_score: Math.round(turnoverScore),
      capturability_score: Math.round(capturableProfit > 0 ? Math.min(100, (capturableProfit / Math.max(1, costs.net_profit)) * 100) : 0),
      competition_score: Math.round(competitionScore),
      transport_score: Math.round(transportScore),
      stability_score: Math.round(stabilityScore),
      overall_score: Math.min(100, Math.max(0, overallScore)),
    };

    // Viability / Rejection criteria
    let isViable = true;
    if (costs.net_profit < config.min_net_profit) {
      isViable = false;
      rejectionReasons.push(`Profit net (${costs.net_profit.toLocaleString()} ISK) inférieur au seuil minimum.`);
    }
    if (costs.roi < config.min_roi) {
      isViable = false;
      rejectionReasons.push(`ROI (${(costs.roi * 100).toFixed(1)}%) inférieur au minimum configuré (${(config.min_roi * 100).toFixed(1)}%).`);
    }
    if (daysToSell > config.max_days_to_sell) {
      isViable = false;
      rejectionReasons.push(`Temps de rotation estimé (${daysToSell.toFixed(1)}j) supérieur à la limite (${config.max_days_to_sell}j).`);
    }
    if (scores.overall_score < 15) {
      isViable = false;
      rejectionReasons.push('Score global trop faible.');
    }

    return {
      scores,
      capturableProfit,
      profitPerDay,
      expectedDaysToSell: daysToSell,
      isAnomalous,
      anomalyReasons,
      isViable,
      rejectionReasons,
    };
  }
}
