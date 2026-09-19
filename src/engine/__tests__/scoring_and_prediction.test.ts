import { OpportunityScoringEngine } from '../scoring';
import { MarketFeatureEngine } from '../features';
import { PredictionEngine } from '../prediction';
import {
  TradeCostBreakdown,
  TradeLiquidityMetrics,
  HistoricalStats,
  FinancialConfig,
  MarketObservation,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runScoringAndPredictionTests() {
  console.log('=== RUNNING SCORING & PREDICTION ENGINE TESTS ===');

  const baseConfig: FinancialConfig = {
    available_capital: 1000000000,
    broker_fee: 0.015,
    sales_tax: 0.036,
    enable_transport_costs: false,
    transport_cost_per_m3: 0,
    transport_cost_per_jump: 0,
    max_cargo_m3: 50000,
    min_roi: 0.03,
    min_net_profit: 50000,
    max_days_to_sell: 14,
    max_capital_per_trade: 500000000,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.50,
  };

  // 1. Verify fix for the priceRatio mathematical bug
  console.log('1. Testing priceRatio fix on multi-unit purchase...');
  // Scenario: 1,000,000 units of Tritanium purchased at 5.0 ISK = 5,000,000 ISK total purchase cost.
  // Historical 30d median unit price is 5.0 ISK.
  // Previously: 5,000,000 / 5.0 = 1,000,000 => caused false anomalous flag!
  const costsNormal: TradeCostBreakdown = {
    purchase_cost: 5000000,
    buy_broker_fee: 0,
    transport_cost: 0,
    total_acquisition_cost: 5000000,
    gross_revenue: 6000000,
    sales_tax: 216000,
    sell_broker_fee: 90000,
    total_exit_fees: 306000,
    net_revenue: 5694000,
    net_profit: 694000,
    profit_per_unit: 0.694,
    roi: 0.1388,
    margin: 0.1156,
    capital_locked: 5000000,
  };

  const liquidityNormal: TradeLiquidityMetrics = {
    buy_hub_depth_volume: 10000000,
    sell_hub_depth_volume: 8000000,
    daily_volume_dest: 5000000,
    daily_volume_source: 6000000,
    volume_exhaustion_pct: 0.125,
    turnover_ratio: 0.2, // 1M units out of 5M daily = 20%
    expected_days_to_sell: 0.2,
  };

  const historyNormal: HistoricalStats = {
    type_id: 34,
    region_id: 10000043,
    daily_volume_7d_median: 5000000,
    daily_volume_30d_median: 5000000,
    price_median_30d: 5.0, // unit price
    price_volatility: 0.05,
    volume_trend: 'stable',
    is_live_esi: true,
  };

  const resultNormal = OpportunityScoringEngine.evaluate(
    costsNormal,
    liquidityNormal,
    historyNormal,
    5,
    true,
    baseConfig,
    5.0, // effectiveBuyPrice
    1000000 // quantity
  );

  assert(!resultNormal.isAnomalous, 'Normal multi-unit trade with unit price matching historical median must NOT be anomalous');
  assert(resultNormal.scores.stability_score >= 80, `Stability score should be >= 80, got ${resultNormal.scores.stability_score}`);
  console.log('✅ Multi-unit trade anomaly bug successfully resolved.');

  // 2. Verify genuine anomaly detection
  console.log('2. Testing genuine anomalous pricing detection...');
  // Scenario: unit price is 25.0 ISK, but historical 30d median is 5.0 ISK (5x higher!)
  const resultAnomalous = OpportunityScoringEngine.evaluate(
    costsNormal,
    liquidityNormal,
    historyNormal,
    5,
    true,
    baseConfig,
    25.0, // 5x higher than median!
    200000
  );

  assert(resultAnomalous.isAnomalous, 'Trade with unit price 5x higher than historical median MUST be flagged as anomalous');
  assert(resultAnomalous.anomalyReasons.length > 0, 'Must provide explicable anomaly reason');
  assert(resultAnomalous.scores.stability_score <= 50, 'Stability score should be penalized');
  console.log('✅ Genuine anomaly detection verified.');

  // 3. Testing MarketFeatureEngine
  console.log('3. Testing MarketFeatureEngine feature extraction...');
  const now = Date.now();
  const observations: MarketObservation[] = [
    {
      observation_id: 'obs-1',
      observation_hash: 'hash1',
      type_id: 34,
      region_id: 10000043,
      captured_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      source: 'esi_market_orders',
      best_buy_price: 4.5,
      best_sell_price: 5.2,
      spread_pct: 15.5,
      order_count_sell: 10,
      sell_volume_visible: 500000,
      data_age_seconds: 7200,
      confidence: 1.0,
    },
    {
      observation_id: 'obs-2',
      observation_hash: 'hash2',
      type_id: 34,
      region_id: 10000043,
      captured_at: new Date(now - 1 * 3600 * 1000).toISOString(),
      source: 'esi_market_orders',
      best_buy_price: 4.6,
      best_sell_price: 5.4,
      spread_pct: 17.3,
      order_count_sell: 11,
      sell_volume_visible: 520000,
      data_age_seconds: 3600,
      confidence: 1.0,
    },
    {
      observation_id: 'obs-3',
      observation_hash: 'hash3',
      type_id: 34,
      region_id: 10000043,
      captured_at: new Date(now).toISOString(),
      source: 'esi_market_orders',
      best_buy_price: 4.7,
      best_sell_price: 5.6,
      spread_pct: 19.1,
      order_count_sell: 12,
      sell_volume_visible: 550000,
      data_age_seconds: 0,
      confidence: 1.0,
    },
  ];

  const features = MarketFeatureEngine.extractFeatures(observations, historyNormal, 19.1, 12);
  assert(features.observations_count === 3, 'Must count 3 observations');
  assert(features.spread_persistence_ratio === 1.0, 'All observations were profitable, persistence must be 1.0');
  assert(features.spread_momentum_1h > 0, 'Spread grew from 17.3% to 19.1%, momentum must be positive');
  assert(features.competition_velocity_orders > 0, 'Orders grew over time, competition velocity must be positive');
  console.log('✅ MarketFeatureEngine extracted accurate dynamic features.');

  // 4. Testing PredictionEngine
  console.log('4. Testing PredictionEngine forecasting & decoupling...');
  const forecast = PredictionEngine.forecast({
    strategy: 'relist',
    costs: costsNormal,
    capturableProfit: 600000,
    expectedDaysToSell: 0.5,
    liquidity: liquidityNormal,
    features,
    history: historyNormal,
    dataConfidence: 1.0,
    isJitaVerified: true,
    routeJumps: 5,
    isHighSecOnly: true,
    isAnomalous: false,
  });

  assert(forecast.survival_probability > 70, `Expected survival probability > 70%, got ${forecast.survival_probability}%`);
  assert(forecast.profit_realization_probability > 60, `Expected realization probability > 60%, got ${forecast.profit_realization_probability}%`);
  assert(forecast.expected_realized_profit > 0, 'Expected realized profit must be positive');
  assert(forecast.prediction_confidence >= 60, `Expected prediction confidence >= 60%, got ${forecast.prediction_confidence}%`);
  assert(forecast.risk_level === 'low' || forecast.risk_level === 'moderate', `Risk level should be low or moderate, got ${forecast.risk_level}`);
  assert(forecast.key_drivers.length > 0, 'Must provide explainable key drivers');
  console.log('✅ PredictionEngine successfully generated explainable forecast.');

  console.log('🎉 ALL SCORING & PREDICTION ENGINE TESTS PASSED WITH 100% SUCCESS!');
}

runScoringAndPredictionTests();
