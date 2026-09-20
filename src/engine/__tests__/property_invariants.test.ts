import { ProfitEngine } from '../profit';
import { FeeEngine } from '../fee';
import { TradableQuantityEngine } from '../quantity';
import { OpportunityScoringEngine } from '../scoring';
import { PredictionEngine } from '../prediction';
import { FinancialConfig, TradeLiquidityMetrics, MarketFeatureVector } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[InvariantPropertyTest] FAILED: ${message}`);
  }
}

export function runPropertyInvariantTests() {
  console.log('=== RUNNING PROPERTY-BASED INVARIANT TESTS ===');

  const baseConfig: FinancialConfig = {
    available_capital: 500_000_000,
    broker_fee: 0.015,
    sales_tax: 0.036,
    enable_transport_costs: true,
    transport_cost_per_m3: 15.0,
    transport_cost_per_jump: 0,
    max_cargo_m3: 5000,
    min_roi: 0.02,
    min_net_profit: 50000,
    max_days_to_sell: 7,
    max_capital_per_trade: 200_000_000,
    max_portfolio_concentration_type: 0.35,
    max_portfolio_concentration_group: 0.50,
  };

  // -------------------------------------------------------------------------
  // 1. INVARIANT: fees >= 0 in all conditions
  // -------------------------------------------------------------------------
  console.log('1. Checking Invariant: fees >= 0...');
  for (let acc = -2; acc <= 8; acc++) {
    const rate = FeeEngine.calculateSalesTaxRate(acc);
    assert(rate >= 0 && rate <= 0.08, `Sales tax rate must be within [0, 0.08], got ${rate} for level ${acc}`);
  }
  for (let br = -2; br <= 8; br++) {
    for (let stand = -15; stand <= 15; stand += 5) {
      const npcBroker = FeeEngine.calculateNpcBrokerFeeRate(br, stand, stand);
      assert(npcBroker >= 0.01 && npcBroker <= 0.04, `NPC broker fee rate must be within [0.01, 0.04], got ${npcBroker}`);
    }
  }
  for (let advBr = 0; advBr <= 5; advBr++) {
    const relist = FeeEngine.calculateRelistFeeRate(0.02, advBr);
    assert(relist >= 0 && relist <= 0.02, `Relist fee rate must be within [0, base], got ${relist}`);
  }
  console.log('✅ Invariant fees >= 0 verified.');

  // -------------------------------------------------------------------------
  // 2. INVARIANT: profit <= net_revenue and ROI = profit / total_acquisition_cost
  // -------------------------------------------------------------------------
  console.log('2. Checking Invariants: profit <= revenue & ROI = profit / capital...');
  const testScenarios = ['taker_taker', 'taker_maker', 'maker_taker', 'maker_maker'] as const;
  const quantities = [1, 10, 500, 10000];
  const buyPrices = [1.5, 100, 25000, 5000000];
  const sellPriceRatios = [0.8, 1.0, 1.05, 1.25, 2.0];

  for (const sc of testScenarios) {
    for (const q of quantities) {
      for (const bp of buyPrices) {
        for (const ratio of sellPriceRatios) {
          const sp = bp * ratio;
          const res = ProfitEngine.calculateScenario({
            scenario: sc,
            quantity: q,
            effective_buy_price: bp,
            effective_sell_price: sp,
            config: baseConfig,
          });

          // profit <= net_revenue
          assert(
            res.net_profit <= res.net_revenue + 1e-4,
            `Net profit (${res.net_profit}) cannot exceed net revenue (${res.net_revenue})`
          );

          // profit <= gross_revenue
          assert(
            res.net_profit <= res.gross_revenue + 1e-4,
            `Net profit (${res.net_profit}) cannot exceed gross revenue (${res.gross_revenue})`
          );

          // total_exit_fees >= 0
          assert(res.total_exit_fees >= 0, `Total exit fees must be >= 0, got ${res.total_exit_fees}`);

          // acquisition cost >= 0
          assert(res.total_acquisition_cost >= 0, `Acquisition cost must be >= 0, got ${res.total_acquisition_cost}`);

          // ROI definition
          if (res.total_acquisition_cost > 0) {
            const expectedRoi = res.net_profit / res.total_acquisition_cost;
            assert(
              Math.abs(res.roi - expectedRoi) < 1e-4,
              `ROI mismatch: expected ${expectedRoi}, got ${res.roi}`
            );
          } else {
            assert(res.roi === 0, `Zero capital should give 0 ROI`);
          }
        }
      }
    }
  }
  console.log('✅ Invariants profit <= revenue & ROI exactness verified.');

  // -------------------------------------------------------------------------
  // 3. INVARIANT: quantity_tradable <= source_liquidity && quantity_tradable <= dest_liquidity
  // -------------------------------------------------------------------------
  console.log('3. Checking Invariant: quantity <= liquidity bounds...');
  const capitalTests = [10000, 1_000_000, 500_000_000];
  const cargoTests = [100, 5000, 60000];
  const unitVolumes = [0.01, 1.0, 50.0];
  const unitPrices = [5.0, 1000.0, 500000.0];
  const sourceVols = [50, 10000];
  const destVols = [30, 20000];

  for (const cap of capitalTests) {
    for (const cargo of cargoTests) {
      for (const uv of unitVolumes) {
        for (const up of unitPrices) {
          for (const sVol of sourceVols) {
            for (const dVol of destVols) {
              const qRes = TradableQuantityEngine.calculateTradableQuantity({
                capital_limit: cap,
                cargo_limit_m3: cargo,
                estimated_unit_buy_price: up,
                unit_volume_m3: uv,
                source_available_units: sVol,
                dest_available_units: dVol,
              });

              assert(
                qRes.tradable_quantity <= sVol,
                `Quantity (${qRes.tradable_quantity}) cannot exceed source depth (${sVol})`
              );
              assert(
                qRes.tradable_quantity <= dVol,
                `Quantity (${qRes.tradable_quantity}) cannot exceed destination depth (${dVol})`
              );
              assert(
                qRes.tradable_quantity * uv <= cargo + 1e-4,
                `Total volume (${qRes.tradable_quantity * uv}) cannot exceed cargo limit (${cargo})`
              );
              assert(
                qRes.tradable_quantity * up <= cap + 1e-4,
                `Total capital required (${qRes.tradable_quantity * up}) cannot exceed available capital (${cap})`
              );
              assert(qRes.tradable_quantity >= 0, `Quantity must be non-negative`);
            }
          }
        }
      }
    }
  }
  console.log('✅ Invariant quantity <= liquidity & physical constraints verified.');

  // -------------------------------------------------------------------------
  // 4. INVARIANT: probability ∈ [0, 100] & score ∈ [0, 100]
  // -------------------------------------------------------------------------
  console.log('4. Checking Invariants: probability ∈ [0, 100] & score ∈ [0, 100]...');
  const testProfits = [-50000, 0, 500000, 100_000_000];
  const testRois = [-0.2, 0, 0.05, 0.45, 1.5];
  const testDays = [0.05, 0.5, 3.0, 14.0, 60.0];

  for (const p of testProfits) {
    for (const r of testRois) {
      for (const d of testDays) {
        const dummyCost = {
          purchase_cost: 1_000_000,
          buy_broker_fee: 15000,
          buy_broker_fee_cost: 15000,
          transport_cost: 0,
          total_acquisition_cost: 1_015_000,
          gross_revenue: 1_015_000 + p,
          sales_tax: 36000,
          sales_tax_cost: 36000,
          sell_broker_fee: 15000,
          sell_broker_fee_cost: 15000,
          total_exit_fees: 51000,
          net_revenue: 1_015_000 + p - 51000,
          net_profit: p,
          profit_per_unit: p / 100,
          roi: r,
          margin: r / (1 + r),
          capital_locked: 1_015_000,
        };

        const dummyLiq: TradeLiquidityMetrics = {
          buy_hub_depth_volume: 10000,
          sell_hub_depth_volume: 8000,
          daily_volume_dest: 5000,
          daily_volume_source: 6000,
          volume_exhaustion_pct: 0.1,
          turnover_ratio: 0.2,
          expected_days_to_sell: d,
        };

        const scoreRes = OpportunityScoringEngine.evaluate(
          dummyCost,
          dummyLiq,
          undefined,
          5,
          true,
          baseConfig
        );

        // Check each component ∈ [0, 100]
        const sc = scoreRes.scores;
        assert(sc.profit_score >= 0 && sc.profit_score <= 100, `profit_score must be ∈ [0,100], got ${sc.profit_score}`);
        assert(sc.roi_score >= 0 && sc.roi_score <= 100, `roi_score must be ∈ [0,100], got ${sc.roi_score}`);
        assert(sc.liquidity_score >= 0 && sc.liquidity_score <= 100, `liquidity_score must be ∈ [0,100], got ${sc.liquidity_score}`);
        assert(sc.volume_score >= 0 && sc.volume_score <= 100, `volume_score must be ∈ [0,100], got ${sc.volume_score}`);
        assert(sc.turnover_score >= 0 && sc.turnover_score <= 100, `turnover_score must be ∈ [0,100], got ${sc.turnover_score}`);
        assert(sc.overall_score >= 0 && sc.overall_score <= 100, `overall_score must be ∈ [0,100], got ${sc.overall_score}`);

        const dummyFeatures: MarketFeatureVector = {
          spread_momentum_1h: 0.5,
          spread_momentum_24h: 1.2,
          volume_acceleration_7d_30d: 1.0,
          competition_velocity_orders: 0.3,
          depth_velocity_volume: 500,
          spread_persistence_ratio: 0.95,
          volatility_zscore: 0.2,
          observations_count: 5,
        };

        const forecast = PredictionEngine.forecast({
          strategy: 'immediate',
          costs: dummyCost,
          capturableProfit: Math.max(0, scoreRes.capturableProfit),
          expectedDaysToSell: d,
          liquidity: dummyLiq,
          features: dummyFeatures,
        });

        assert(
          forecast.survival_probability >= 0 && forecast.survival_probability <= 100,
          `survival_probability must be ∈ [0,100], got ${forecast.survival_probability}`
        );
        assert(
          forecast.profit_realization_probability >= 0 && forecast.profit_realization_probability <= 100,
          `profit_realization_probability must be ∈ [0,100], got ${forecast.profit_realization_probability}`
        );
        assert(
          forecast.prediction_confidence >= 0 && forecast.prediction_confidence <= 100,
          `prediction_confidence must be ∈ [0,100], got ${forecast.prediction_confidence}`
        );
      }
    }
  }
  console.log('✅ Invariants probability & score ∈ [0, 100] verified across all permutations.');

  console.log('🎉 ALL PROPERTY-BASED INVARIANT TESTS PASSED WITH 100% SUCCESS!');
}

runPropertyInvariantTests();
