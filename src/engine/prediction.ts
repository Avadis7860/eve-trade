import {
  TradeCostBreakdown,
  TradeLiquidityMetrics,
  HistoricalStats,
  MarketFeatureVector,
  PredictionForecast,
  TradeStrategy,
} from '../types';

/**
 * Pure deterministic prediction and forecasting engine.
 * STRICT INVARIANT: Pure math only, no network, no browser state, no React.
 * 
 * Accurately decouples Opportunity Score (economic upside) from
 * Prediction Confidence (statistical certainty and data verifiability).
 */
export class PredictionEngine {
  /**
   * Forecasts the survival and profit realization probabilities for an opportunity.
   */
  static forecast(params: {
    strategy: TradeStrategy;
    costs: TradeCostBreakdown;
    capturableProfit: number;
    expectedDaysToSell: number;
    liquidity: TradeLiquidityMetrics;
    features: MarketFeatureVector;
    history?: HistoricalStats;
    dataConfidence?: number;
    isJitaVerified?: boolean;
    routeJumps?: number;
    isHighSecOnly?: boolean;
    isAnomalous?: boolean;
  }): PredictionForecast {
    const {
      strategy,
      costs,
      capturableProfit,
      expectedDaysToSell,
      liquidity,
      features,
      history,
      dataConfidence = 1.0,
      isJitaVerified = true,
      routeJumps = 0,
      isHighSecOnly = true,
      isAnomalous = false,
    } = params;

    const keyDrivers: string[] = [];
    const limitingFactors: string[] = [];

    // 1. Base Survival Probability: starts at 90% for immediate, 80% for relist
    let survival = strategy === 'immediate' ? 95 : 82;

    // A. Time decay: each day to sell decreases survival chance by ~2.5%
    const timeDecayPenalty = Math.min(35, expectedDaysToSell * 2.5);
    survival -= timeDecayPenalty;
    if (expectedDaysToSell <= 1.0) {
      keyDrivers.push(`Rotation rapide (${expectedDaysToSell.toFixed(1)}j) limitant le risque d'évolution du carnet.`);
    } else {
      limitingFactors.push(`Délai de vente estimé à ${expectedDaysToSell.toFixed(1)} jours (${timeDecayPenalty.toFixed(0)}% d'érosion probabiliste).`);
    }

    // B. Spread Momentum Factor
    if (features.spread_momentum_24h > 2.0) {
      survival += 5;
      keyDrivers.push(`Dynamique de spread positive (+${features.spread_momentum_24h.toFixed(1)}% sur 24h).`);
    } else if (features.spread_momentum_24h < -3.0) {
      survival -= 10;
      limitingFactors.push(`Compression du spread en cours (${features.spread_momentum_24h.toFixed(1)}% sur 24h).`);
    }

    // C. Competition Velocity Factor
    if (features.competition_velocity_orders > 2.0) {
      survival -= 8;
      limitingFactors.push(`Arrivée rapide de vendeurs concurrents (+${features.competition_velocity_orders.toFixed(1)} ordres/h).`);
    } else if (features.competition_velocity_orders <= 0.2) {
      survival += 4;
      keyDrivers.push(`Faible pression concurrentielle sur les ordres de vente.`);
    }

    // D. Transport Route Risk
    if (!isHighSecOnly) {
      survival -= 15;
      limitingFactors.push(`Route traversant des systèmes de basse sécurité (LowSec/NullSec).`);
    } else if (routeJumps > 15) {
      survival -= 5;
      limitingFactors.push(`Trajet long (${routeJumps} sauts), augmentant le délai d'acheminement.`);
    }

    // E. Spread Persistence Bonus
    if (features.spread_persistence_ratio >= 0.90) {
      survival += 5;
      keyDrivers.push(`Spread historiquement persistant (${Math.round(features.spread_persistence_ratio * 100)}% des observations).`);
    } else if (features.spread_persistence_ratio < 0.50 && features.observations_count > 3) {
      survival -= 12;
      limitingFactors.push(`Spread intermittent (< 50% de persistance sur les observations récentes).`);
    }

    // Clamp survival between 5% and 98%
    const survivalProbability = Math.round(Math.max(5, Math.min(98, survival)));

    // 2. Profit Realization Probability
    // Measures the proportion of projected net profit expected to be realized in practice
    let realization = survivalProbability * 0.92;

    // Immediate strategy has almost zero relisting fee risk
    if (strategy === 'immediate') {
      realization += 6;
      keyDrivers.push(`Exécution immédiate sur ordres d'achat existants : élimination du risque de relisting.`);
    } else {
      // Relist strategy is subject to 0.01 ISK undercutting and relist broker fees
      const turnoverRatio = liquidity.turnover_ratio || 1.0;
      if (turnoverRatio > 0.5) {
        realization -= 10;
        limitingFactors.push(`Part de marché importante demandée (${Math.round(turnoverRatio * 100)}% du volume journalier).`);
      }
    }

    if (isAnomalous) {
      realization -= 20;
      limitingFactors.push(`Anomalie de cotation détectée : risque élevé d'illiquidité ou d'ordre erroné.`);
    }

    const profitRealizationProbability = Math.round(Math.max(5, Math.min(95, realization)));

    // 3. Expected Realized Profit (Mathematical expectation)
    const expectedRealizedProfit = Math.round(capturableProfit * (profitRealizationProbability / 100));

    // 4. Prediction Statistical Confidence (0 to 100%)
    // Strictly separates certainty from attractiveness
    let confidence = 50; // base prior

    // A. Number of immutable observations available
    if (features.observations_count >= 10) {
      confidence += 20;
      keyDrivers.push(`Échantillon d'observations robuste (${features.observations_count} captures).`);
    } else if (features.observations_count >= 3) {
      confidence += 10;
    } else {
      limitingFactors.push(`Historique d'observations restreint (${features.observations_count} capture(s)).`);
    }

    // B. Historical ESI depth
    if (history && history.daily_volume_30d_median && history.daily_volume_30d_median > 0) {
      confidence += 15;
      keyDrivers.push(`Séries chronologiques ESI 30 jours complètes.`);
    }

    // C. Data Quality and ESI freshness
    confidence = Math.round(confidence * Math.max(0.2, dataConfidence));

    // D. Jita validation
    if (isJitaVerified) {
      confidence += 10;
      keyDrivers.push(`Cotations validées par le benchmark indépendant Jita 4-4.`);
    } else {
      confidence -= 10;
      limitingFactors.push(`Absence de benchmark comparatif Jita direct.`);
    }

    // E. Volatility penalty
    if (history && history.price_volatility > 0.25) {
      confidence -= 15;
      limitingFactors.push(`Forte volatilité des cours historiques (${(history.price_volatility * 100).toFixed(1)}%).`);
    }

    const predictionConfidence = Math.round(Math.max(10, Math.min(98, confidence)));

    // 5. Risk Level Categorization
    let riskLevel: 'low' | 'moderate' | 'elevated' | 'speculative' = 'moderate';
    if (survivalProbability >= 80 && predictionConfidence >= 75 && isHighSecOnly && !isAnomalous) {
      riskLevel = 'low';
    } else if (survivalProbability < 50 || !isHighSecOnly || isAnomalous || costs.roi > 0.60) {
      riskLevel = 'speculative';
    } else if (survivalProbability < 65 || predictionConfidence < 50) {
      riskLevel = 'elevated';
    }

    const estimatedTurnoverHours = Math.max(1, Math.round(expectedDaysToSell * 24));

    return {
      survival_probability: survivalProbability,
      profit_realization_probability: profitRealizationProbability,
      expected_realized_profit: expectedRealizedProfit,
      prediction_confidence: predictionConfidence,
      risk_level: riskLevel,
      estimated_turnover_hours: estimatedTurnoverHours,
      key_drivers: keyDrivers,
      limiting_factors: limitingFactors,
    };
  }
}
