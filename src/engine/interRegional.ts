import {
  TradeStrategy,
  FinancialConfig,
  PriceLevel,
  ExecutionFill,
  TradeCostBreakdown,
  JumpRoute,
  EveTypeDetail,
  MarketHub,
  RawMarketOrder,
  HistoricalStats,
  InterRegionalOpportunity,
  MarketDataQuality,
  RelistMarketContext,
  OpportunityExplanation,
  DataProvenance,
  OpportunityCertification,
  OpportunityProvenance,
  DataState,
  DataHealthStatus,
  TypeResolutionResult,
} from '../types';
import { FeeEngine } from './fee';
import { ProfitEngine } from './profit';
import { PriceLadder } from './ladder';
import { OpportunityScoringEngine } from './scoring';
import { MarketFeatureEngine } from './features';
import { PredictionEngine } from './prediction';
import { roundIsk, safeDiv } from './money';
import { FailureSemantics } from './failureSemantics';
import { OpportunityEvidenceEngine, CURRENT_CERTIFICATION_VERSION } from './evidence';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { TreasuryEngine } from './treasury';

export class InterRegionalFinancialEngine {
  /**
   * Filters orders accessible at a specific Hub station/structure.
   *
   * 1. Source Hub Sell Orders (we buy physical goods from them):
   *    - Physical goods are located at order.location_id.
   *    - To acquire at the Source Hub, order.location_id MUST match hub.station_id.
   *
   * 2. Destination Hub Buy Orders (immediate sell into them as Taker):
   *    - Order range 'station': order.location_id === hub.station_id.
   *    - Order range 'solarsystem': order.system_id === hub.system_id.
   *    - Order range 'region': order.region_id === hub.region_id (or anywhere in region).
   *    - Numeric jump range (e.g. 1..40): jump distance from order.system_id to hub.system_id <= numeric range.
   *    - min_volume: if order specifies min_volume > 1, order.volume_remain must be >= min_volume.
   *
   * 3. Destination Hub Sell Orders (competing sell orders for Relist / Maker strategy):
   *    - Must be located at hub.station_id.
   */
  static filterAccessibleOrdersForHub(
    orders: RawMarketOrder[],
    hub: MarketHub,
    isSourceHub: boolean,
    isBuyOrder: boolean
  ): RawMarketOrder[] {
    return orders.filter((order) => {
      if (order.is_buy_order !== isBuyOrder) return false;
      if (order.price <= 0 || order.volume_remain <= 0 || !isFinite(order.price) || !isFinite(order.volume_remain)) {
        return false;
      }

      // Source Sell orders: Trader is at hub.station_id; seller's items are in station
      if (isSourceHub && !isBuyOrder) {
        return order.location_id === hub.station_id;
      }

      // Destination Buy orders (Trader arrives at destination hub and executes taker sale):
      if (!isSourceHub && isBuyOrder) {
        if (order.location_id === hub.station_id) return true;

        const range = String(order.order_range || 'station').toLowerCase().trim();
        if (range === 'region') {
          return order.region_id === hub.region_id;
        }
        if (range === 'solarsystem') {
          return order.system_id === hub.system_id;
        }

        const numericRange = parseInt(range, 10);
        if (!isNaN(numericRange) && numericRange >= 0) {
          const route = UniverseRepository.getInstance().getRoute(order.system_id, hub.system_id);
          return route.jumps <= numericRange;
        }
        return false;
      }

      // Destination Sell orders (Competing sellers for relist strategy):
      if (!isSourceHub && !isBuyOrder) {
        return order.location_id === hub.station_id;
      }

      return true;
    });
  }

  /**
   * Simulates depth consumption on order book levels using the deterministic ladder engine.
   */
  static simulateFill(levels: PriceLevel[], targetQuantity: number, isBuySide: boolean = false): ExecutionFill {
    return PriceLadder.simulateExecution(levels, targetQuantity, isBuySide);
  }

  /**
   * Computes exact trade cost breakdown using ProfitEngine.
   */
  static computeCostsAndProfit(
    buyExecution: ExecutionFill,
    sellExecution: ExecutionFill,
    quantity: number,
    unitVolume: number,
    route: JumpRoute,
    strategy: TradeStrategy,
    config: FinancialConfig,
    isBuyMaker: boolean = false
  ): TradeCostBreakdown {
    const scenario = isBuyMaker
      ? (strategy === 'relist' ? 'maker_maker' : 'maker_taker')
      : (strategy === 'relist' ? 'taker_maker' : 'taker_taker');

    const result = ProfitEngine.calculateScenario({
      scenario,
      quantity,
      effective_buy_price: buyExecution.effective_price,
      effective_sell_price: sellExecution.effective_price,
      unit_volume: unitVolume,
      jumps: route.jumps,
      config,
    });

    return {
      purchase_cost: result.gross_purchase_cost,
      buy_broker_fee: result.buy_broker_fee_cost,
      transport_cost: result.transport_cost,
      total_acquisition_cost: result.total_acquisition_cost,
      gross_revenue: result.gross_revenue,
      sales_tax: result.sales_tax_cost,
      sell_broker_fee: result.sell_broker_fee_cost,
      total_exit_fees: result.total_exit_fees,
      net_revenue: result.net_revenue,
      net_profit: result.net_profit,
      profit_per_unit: result.profit_per_unit,
      roi: result.roi,
      margin: result.margin,
      capital_locked: result.capital_locked,
    };
  }

  /**
   * Calculates the maximum tradable quantity respecting 4 core physical and market constraints:
   * 1. Available Capital & max capital per trade limit
   * 2. Cargo capacity limit (m³)
   * 3. Source Market Available Volume
   * 4. Destination Market Depth (or daily absorption capacity if relist)
   */
  static determineTradableQuantity(
    unitBuyPrice: number,
    unitVolume: number,
    sourceAvailableVolume: number,
    destinationAbsorptionVolume: number,
    route: JumpRoute,
    config: Partial<FinancialConfig> | FinancialConfig
  ): {
    quantity: number;
    bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market';
    totalCargoVolume: number;
    capitalLimitedUnits: number;
    cargoLimitedUnits: number;
    sourceAvailableUnits: number;
    destAvailableUnits: number;
  } {
    const treasury = TreasuryEngine.resolveEffectiveCapital(config);
    const availableCap = treasury.effective_capital;
    const maxCapPerTrade = config.max_capital_per_trade ?? availableCap;
    const maxCapitalToUse = Math.min(availableCap, maxCapPerTrade);
    const effectiveUnitVolume = unitVolume && unitVolume > 0 ? unitVolume : 0.01;

    const transportPerUnit =
      config.enable_transport_costs !== false
        ? effectiveUnitVolume * (config.transport_cost_per_m3 || 0) + (route.jumps * (config.transport_cost_per_jump || 0) * (effectiveUnitVolume / Math.max(1, config.max_cargo_m3 || 5000)))
        : 0;

    const unitEstCost = unitBuyPrice + transportPerUnit;
    const capitalLimitedUnits = unitEstCost > 0 && maxCapitalToUse > 0 ? Math.floor(maxCapitalToUse / unitEstCost) : 0;
    const cargoCapacity = config.max_cargo_m3 !== undefined && config.max_cargo_m3 !== null ? config.max_cargo_m3 : 35000;
    const cargoLimitedUnits = effectiveUnitVolume > 0 && cargoCapacity > 0 ? Math.floor(cargoCapacity / effectiveUnitVolume) : 999999999;
    const sourceAvailableUnits = Math.max(0, Math.floor(sourceAvailableVolume));
    const destAvailableUnits = Math.max(0, Math.floor(destinationAbsorptionVolume));

    const minQty = Math.max(0, Math.min(capitalLimitedUnits, cargoLimitedUnits, sourceAvailableUnits, destAvailableUnits));

    const limits = [
      { type: 'cargo' as const, limit: cargoLimitedUnits },
      { type: 'capital' as const, limit: capitalLimitedUnits },
      { type: 'source_market' as const, limit: sourceAvailableUnits },
      { type: 'destination_market' as const, limit: destAvailableUnits },
    ];
    limits.sort((a, b) => a.limit - b.limit);
    const bottleneck = limits[0].type;

    return {
      quantity: minQty,
      bottleneck,
      totalCargoVolume: Math.round(minQty * effectiveUnitVolume * 10000) / 10000,
      capitalLimitedUnits,
      cargoLimitedUnits,
      sourceAvailableUnits,
      destAvailableUnits,
    };
  }

  /**
   * Recalculates an opportunity in a pure, deterministic manner given a new FinancialConfig.
   * Dynamically synchronizes tradable quantity, cargo volume, transport costs, fees, taxes,
   * net profit, ROI, liquidity, bottleneck, scoring, and explicability explanations.
   */
  static recalculateOpportunityWithConfig<T extends InterRegionalOpportunity>(
    opp: T,
    config: FinancialConfig
  ): T {
    if (!opp) return opp;

    const unitVolume =
      opp.unit_volume && opp.unit_volume > 0
        ? opp.unit_volume
        : CatalogRepository.getInstance().getTypeVolume(opp.type_id) || 0.01;

    const bestBuyPrice = opp.effective_buy_price || opp.best_buy_order_price || 0;
    const bestSellPrice = opp.effective_sell_price || opp.best_sell_order_price || 0;

    const sourceDepth =
      opp.liquidity?.buy_hub_depth_volume && opp.liquidity.buy_hub_depth_volume > 0
        ? opp.liquidity.buy_hub_depth_volume
        : Math.max(opp.quantity_tradable || 1, 100);

    let destDepth =
      opp.liquidity?.sell_hub_depth_volume && opp.liquidity.sell_hub_depth_volume > 0
        ? opp.liquidity.sell_hub_depth_volume
        : Math.max(opp.quantity_tradable || 1, 100);

    if (opp.strategy === 'relist' && opp.relist_context?.expected_capturable_volume_per_day) {
      destDepth = Math.max(
        1,
        opp.relist_context.expected_capturable_volume_per_day * Math.max(1, config.max_days_to_sell || 7)
      );
    }

    const tradableDetails = this.determineTradableQuantity(
      bestBuyPrice,
      unitVolume,
      sourceDepth,
      destDepth,
      opp.route,
      config
    );

    const actualQuantity = tradableDetails.quantity;

    const buyFill: ExecutionFill = {
      requested_quantity: actualQuantity,
      filled_quantity: actualQuantity,
      effective_price: bestBuyPrice,
      top_of_book_price: opp.top_of_book_buy_price || bestBuyPrice,
      total_cost_or_revenue: roundIsk(bestBuyPrice * actualQuantity),
      slippage_pct: 0,
      levels_exhausted: 1,
    };

    const sellFill: ExecutionFill = {
      requested_quantity: actualQuantity,
      filled_quantity: actualQuantity,
      effective_price: bestSellPrice,
      top_of_book_price: opp.top_of_book_sell_price || bestSellPrice,
      total_cost_or_revenue: roundIsk(bestSellPrice * actualQuantity),
      slippage_pct: 0,
      levels_exhausted: 1,
    };

    const costs = this.computeCostsAndProfit(
      buyFill,
      sellFill,
      actualQuantity,
      unitVolume,
      opp.route,
      opp.strategy,
      config,
      false
    );

    const totalCargoVolume = Math.round(actualQuantity * unitVolume * 10000) / 10000;

    let expectedDaysToSell = opp.expected_days_to_sell ?? 0.1;
    let capturableDailyVolume = opp.relist_context?.expected_capturable_volume_per_day ?? sourceDepth;
    let relistContext = opp.relist_context;

    if (opp.strategy === 'relist' && relistContext) {
      const volumeAhead = relistContext.volume_ahead || 0;
      const baseDailyVol = Math.max(1, relistContext.historical_daily_volume || 100);
      const capturablePerDay = Math.max(1, relistContext.expected_capturable_volume_per_day || 1);
      const timeToClearAhead = volumeAhead > 0 ? volumeAhead / baseDailyVol : 0;
      const timeToClearOurQty = actualQuantity / capturablePerDay;
      expectedDaysToSell = Math.max(0.1, roundIsk(timeToClearAhead + timeToClearOurQty));
      relistContext = {
        ...relistContext,
        expected_days_to_sell: expectedDaysToSell,
        expected_revenue: costs.gross_revenue,
        expected_profit: costs.net_profit,
      };
    }

    const updatedLiquidity = {
      ...opp.liquidity,
      turnover_ratio: opp.liquidity?.daily_volume_dest > 0 ? actualQuantity / opp.liquidity.daily_volume_dest : 1,
      expected_days_to_sell: expectedDaysToSell,
      volume_exhaustion_pct: opp.liquidity?.buy_hub_depth_volume > 0 ? (actualQuantity / opp.liquidity.buy_hub_depth_volume) * 100 : 100,
    };

    const scoringEvaluation = OpportunityScoringEngine.evaluate(
      costs,
      updatedLiquidity,
      opp.history,
      opp.route?.jumps ?? 0,
      opp.route?.is_highsec_only ?? true,
      config,
      bestBuyPrice,
      actualQuantity
    );

    const isViableFinal = scoringEvaluation.isViable && costs.net_profit > 0 && actualQuantity > 0;

    const explanation = this.generateExplanation(
      {
        type_id: opp.type_id,
        name: opp.type_name,
        group_id: opp.group_id,
        category_id: opp.category_id,
        volume: unitVolume,
      },
      opp.buy_hub,
      opp.sell_hub,
      opp.strategy,
      actualQuantity,
      tradableDetails.bottleneck,
      tradableDetails,
      buyFill,
      sellFill,
      costs,
      expectedDaysToSell,
      capturableDailyVolume,
      updatedLiquidity.daily_volume_dest,
      relistContext?.orders_ahead || 0,
      relistContext?.volume_ahead || 0,
      (opp as any).confidence ?? 1.0,
      opp.data_quality?.buy_hub_quality,
      opp.data_quality?.sell_hub_quality,
      opp.jita_price_benchmark?.is_jita_verified ?? false,
      opp.jita_price_benchmark?.buy_vs_jita_pct ?? 0,
      opp.is_anomalous,
      opp.anomaly_reasons || [],
      isViableFinal,
      scoringEvaluation.rejectionReasons || []
    );

    return {
      ...opp,
      unit_volume: unitVolume,
      quantity_tradable: actualQuantity,
      bottleneck: tradableDetails.bottleneck,
      total_cargo_volume: totalCargoVolume,
      costs,
      capturable_profit: scoringEvaluation.capturableProfit,
      profit_per_day: scoringEvaluation.profitPerDay,
      expected_days_to_sell: expectedDaysToSell,
      liquidity: updatedLiquidity,
      scores: scoringEvaluation.scores,
      relist_context: relistContext,
      explanation,
      is_viable: isViableFinal,
      financial_inputs: {
        ...opp.evidence?.financial_inputs,
        available_capital: config.available_capital,
        max_cargo_m3: config.max_cargo_m3,
        broker_fee: config.broker_fee,
        sales_tax: config.sales_tax,
        enable_transport_costs: Boolean(config.enable_transport_costs),
        transport_cost_per_m3: config.transport_cost_per_m3 || 0,
        transport_cost_per_jump: config.transport_cost_per_jump || 0,
        min_roi: config.min_roi || 0.03,
        min_net_profit: config.min_net_profit || 1000,
        unit_volume: unitVolume,
        strategy: opp.strategy,
        accounting_level: config.accounting_level,
        broker_relations_level: config.broker_relations_level,
        advanced_broker_relations_level: config.advanced_broker_relations_level,
      },
      financial_outputs: {
        ...opp.evidence?.financial_outputs,
        quantity: actualQuantity,
        effective_buy_price: bestBuyPrice,
        effective_sell_price: bestSellPrice,
        gross_purchase_cost: costs.purchase_cost,
        buy_broker_fee_cost: costs.buy_broker_fee,
        transport_cost: costs.transport_cost,
        total_acquisition_cost: costs.total_acquisition_cost,
        gross_revenue: costs.gross_revenue,
        sales_tax_cost: costs.sales_tax,
        sell_broker_fee_cost: costs.sell_broker_fee,
        total_exit_fees: costs.total_exit_fees,
        net_revenue: costs.net_revenue,
        net_profit: costs.net_profit,
        profit_per_unit: costs.profit_per_unit,
        roi: costs.roi,
        margin: costs.margin,
        capital_locked: costs.capital_locked,
        bottleneck: tradableDetails.bottleneck,
        is_viable: isViableFinal,
      },
    };
  }

  /**
   * Computes Relist Market Context and Capturable Daily Volume.
   * Clearly separates CURRENT ORDER BOOK from ESTIMATED FUTURE EXECUTION.
   */
  static computeCapturableVolumeAndRelistContext(
    destSellLevels: PriceLevel[],
    destHistory: HistoricalStats | undefined,
    quantity: number,
    unitBuyPrice: number,
    config: FinancialConfig
  ): {
    relistContext: RelistMarketContext;
    suggestedRelistPrice: number;
    expectedCapturableVolumePerDay: number;
    expectedDaysToSell: number;
  } {
    const historical7d = destHistory?.daily_volume_7d_median || destHistory?.daily_volume_7d_avg || 100;
    const historical30d = destHistory?.daily_volume_30d_median || destHistory?.daily_volume_30d_avg || historical7d;
    const trend = destHistory?.volume_trend || 'stable';

    let currentLowestSell = 0.0;
    let suggestedRelistPrice = 0.0;
    let ordersAhead = 0;
    let volumeAhead = 0;

    if (destSellLevels.length > 0) {
      currentLowestSell = destSellLevels[0].price;
      // Undercut by 0.01 ISK if lowest sell is > 0.01, otherwise match
      suggestedRelistPrice = currentLowestSell > 0.01 ? roundIsk(currentLowestSell - 0.01) : currentLowestSell;

      // Calculate orders and volume ahead in the queue (priced <= our suggested price)
      for (const lvl of destSellLevels) {
        if (lvl.price <= suggestedRelistPrice) {
          ordersAhead += lvl.orders;
          volumeAhead += lvl.volume;
        } else {
          break;
        }
      }
    } else {
      // Empty destination sell book: use historical 30d median price or fallback
      const benchmarkPrice = destHistory?.price_median_30d || (unitBuyPrice * 1.15);
      currentLowestSell = benchmarkPrice;
      suggestedRelistPrice = benchmarkPrice;
      ordersAhead = 0;
      volumeAhead = 0;
    }

    // Trend Multiplier
    let trendMultiplier = 1.0;
    if (trend === 'increasing') trendMultiplier = 1.15;
    else if (trend === 'decreasing') trendMultiplier = 0.85;

    // Competition Market Share Factor: in a competitive station, market share decreases with more sellers ahead
    const competitionShare = safeDiv(1.0, 1.0 + ordersAhead * 0.4, 0.5);
    const boundedShare = Math.max(0.10, Math.min(0.90, competitionShare));

    // Capturable Volume per day
    const baseDailyVolume = Math.max(1, historical7d);
    const expectedCapturableVolumePerDay = Math.max(1, Math.round(baseDailyVolume * trendMultiplier * boundedShare));

    // Expected Days to Sell
    const timeToClearAhead = volumeAhead > 0 ? safeDiv(volumeAhead, baseDailyVolume, 0) : 0;
    const timeToClearOurQty = safeDiv(quantity, expectedCapturableVolumePerDay, 1);
    const rawDays = timeToClearAhead + timeToClearOurQty;
    const expectedDaysToSell = Math.max(0.1, roundIsk(rawDays));

    let competitionDensity: 'low' | 'moderate' | 'high' | 'intense' = 'low';
    if (ordersAhead >= 10 || volumeAhead > baseDailyVolume * 3) competitionDensity = 'intense';
    else if (ordersAhead >= 5 || volumeAhead > baseDailyVolume) competitionDensity = 'high';
    else if (ordersAhead >= 2) competitionDensity = 'moderate';

    const grossRevenue = roundIsk(suggestedRelistPrice * quantity);
    const estimatedProfit = roundIsk(grossRevenue * 0.10); // temporary reference for context

    const relistContext: RelistMarketContext = {
      is_estimated_execution: true,
      current_lowest_sell: currentLowestSell,
      suggested_relist_price: suggestedRelistPrice,
      orders_ahead: ordersAhead,
      volume_ahead: volumeAhead,
      historical_daily_volume: Math.round(baseDailyVolume),
      historical_volume_7d_median: Math.round(historical7d),
      historical_volume_30d_median: Math.round(historical30d),
      volume_trend: trend,
      expected_capturable_volume_per_day: expectedCapturableVolumePerDay,
      expected_days_to_sell: expectedDaysToSell,
      expected_revenue: grossRevenue,
      expected_profit: estimatedProfit,
      competition_density: competitionDensity,
    };

    return {
      relistContext,
      suggestedRelistPrice,
      expectedCapturableVolumePerDay,
      expectedDaysToSell,
    };
  }

  /**
   * Evaluates Jita (The Forge 10000002 / Jita 4-4 60003760) as an independent market benchmark.
   */
  static evaluateJitaBenchmark(
    jitaOrders: RawMarketOrder[],
    effectiveBuyPrice: number,
    effectiveSellPrice: number,
    jitaQuality?: MarketDataQuality
  ): {
    jita_sell_price: number;
    jita_buy_price: number;
    buy_vs_jita_pct: number;
    sell_vs_jita_pct: number;
    is_jita_verified: boolean;
    reliability_assessment: string;
  } {
    const jitaStationOrders = jitaOrders.filter((o) => o.location_id === 60003760 || o.region_id === 10000002);
    const jitaSells = jitaStationOrders.filter((o) => !o.is_buy_order && o.price > 0 && o.volume_remain > 0);
    const jitaBuys = jitaStationOrders.filter((o) => o.is_buy_order && o.price > 0 && o.volume_remain > 0);

    const jitaSellLevels = PriceLadder.aggregate(jitaSells, false);
    const jitaBuyLevels = PriceLadder.aggregate(jitaBuys, true);

    const jitaSellPrice = jitaSellLevels.length > 0 ? jitaSellLevels[0].price : 0;
    const jitaBuyPrice = jitaBuyLevels.length > 0 ? jitaBuyLevels[0].price : 0;

    let buyVsJitaPct = 0.0;
    let sellVsJitaPct = 0.0;

    if (jitaSellPrice > 0 && effectiveBuyPrice > 0) {
      buyVsJitaPct = roundIsk(((effectiveBuyPrice - jitaSellPrice) / jitaSellPrice) * 100);
    }
    if (jitaSellPrice > 0 && effectiveSellPrice > 0) {
      sellVsJitaPct = roundIsk(((effectiveSellPrice - jitaSellPrice) / jitaSellPrice) * 100);
    }

    const isVerified = (jitaQuality?.validation_status === 'valid' || jitaStationOrders.length > 0 || jitaOrders.length > 0);

    let reliabilityAssessment = 'Benchmark Jita actif.';
    if (jitaSellPrice === 0) {
      reliabilityAssessment = 'Données Jita non disponibles pour cet article.';
    } else if (buyVsJitaPct < -10) {
      reliabilityAssessment = `Prix d'achat ${Math.abs(buyVsJitaPct).toFixed(1)}% sous le sell Jita (Excellente opportunité d'approvisionnement).`;
    } else if (buyVsJitaPct > 30) {
      reliabilityAssessment = `Prix d'achat ${buyVsJitaPct.toFixed(1)}% au-dessus du sell Jita (Approvisionnement potentiellement coûteux).`;
    } else if (sellVsJitaPct > 100) {
      reliabilityAssessment = `Prix de vente ${sellVsJitaPct.toFixed(1)}% au-dessus de Jita. Risque d'anomalie de cotation destination.`;
    } else {
      reliabilityAssessment = 'Alignement de prix cohérent avec les cours de référence Jita 4-4.';
    }

    return {
      jita_sell_price: jitaSellPrice,
      jita_buy_price: jitaBuyPrice,
      buy_vs_jita_pct: buyVsJitaPct,
      sell_vs_jita_pct: sellVsJitaPct,
      is_jita_verified: isVerified,
      reliability_assessment: reliabilityAssessment,
    };
  }

  /**
   * Hard Rejection Engine:
   * Rejects invalid trades BEFORE or DURING scoring. Score must never save an invalid trade.
   */
  static evaluateHardRejection(
    quantity: number,
    costs: TradeCostBreakdown,
    expectedDaysToSell: number,
    config: FinancialConfig,
    sourceSellLevels: PriceLevel[],
    destLevels: PriceLevel[],
    buyQuality?: MarketDataQuality,
    sellQuality?: MarketDataQuality,
    jitaBenchmark?: { jita_sell_price: number; buy_vs_jita_pct: number; sell_vs_jita_pct: number }
  ): {
    is_viable: boolean;
    rejection_reasons: string[];
    is_anomalous: boolean;
    anomaly_reasons: string[];
  } {
    const rejectionReasons: string[] = [];
    const anomalyReasons: string[] = [];
    let isViable = true;
    let isAnomalous = false;

    // 1. Data Quality Checks
    if (buyQuality?.freshness === 'expired' || sellQuality?.freshness === 'expired') {
      isViable = false;
      rejectionReasons.push('Données de marché expirées (>24h).');
    }
    if (buyQuality?.validation_status === 'invalid' || sellQuality?.validation_status === 'invalid') {
      isViable = false;
      rejectionReasons.push('Données de carnet invalidées par le contrôleur de conformité.');
    }
    if (buyQuality?.completeness === 'partial' || sellQuality?.completeness === 'partial') {
      isAnomalous = true;
      anomalyReasons.push('Données de carnet partielles (certaines pages manquantes).');
    }
    if (buyQuality?.freshness === 'stale' || sellQuality?.freshness === 'stale') {
      isAnomalous = true;
      anomalyReasons.push('Données de marché synchronisées récemment (stale cache).');
    }

    // 2. Quantity & Liquidity Checks
    if (quantity <= 0) {
      isViable = false;
      rejectionReasons.push('Quantité tradable nulle après application des contraintes de capital, cargo et profondeur.');
    }
    if (sourceSellLevels.length === 0) {
      isViable = false;
      rejectionReasons.push('Aucun ordre de vente accessible à la station source.');
    }
    if (destLevels.length === 0) {
      isViable = false;
      rejectionReasons.push('Aucune liquidité de destination disponible ou accessible.');
    }

    // 3. Profitability & ROI Thresholds
    if (costs.net_profit <= 0) {
      isViable = false;
      rejectionReasons.push(`Profit net négatif (${costs.net_profit.toLocaleString()} ISK) après déduction des taxes, courtages et fret.`);
    }
    if (costs.net_profit < (config.min_net_profit || 0)) {
      isViable = false;
      rejectionReasons.push(`Profit net (${costs.net_profit.toLocaleString()} ISK) inférieur au minimum configuré (${(config.min_net_profit || 0).toLocaleString()} ISK).`);
    }
    if (costs.roi < (config.min_roi || 0)) {
      isViable = false;
      rejectionReasons.push(`ROI (${(costs.roi * 100).toFixed(2)}%) inférieur au seuil minimal configuré (${((config.min_roi || 0) * 100).toFixed(2)}%).`);
    }

    // 4. Turnover & Days to Sell
    const maxDays = config.max_days_to_sell || 14;
    if (expectedDaysToSell > maxDays) {
      isViable = false;
      rejectionReasons.push(`Délai d'absorption estimé (${expectedDaysToSell.toFixed(1)}j) supérieur au maximum toléré (${maxDays}j).`);
    }

    // 5. Anomaly Detection vs Benchmark
    if (costs.roi > 0.80) {
      isAnomalous = true;
      anomalyReasons.push(`ROI exceptionnellement élevé (${(costs.roi * 100).toFixed(1)}%). Risque de manipulation de carnet ou piège margin scam.`);
    }

    if (jitaBenchmark && jitaBenchmark.jita_sell_price > 0) {
      if (jitaBenchmark.sell_vs_jita_pct > 250) {
        isAnomalous = true;
        anomalyReasons.push(`Prix de vente destination à +${jitaBenchmark.sell_vs_jita_pct.toFixed(0)}% du cours Jita 4-4.`);
      }
      if (jitaBenchmark.buy_vs_jita_pct > 150) {
        isAnomalous = true;
        anomalyReasons.push(`Prix d'achat source à +${jitaBenchmark.buy_vs_jita_pct.toFixed(0)}% du cours Jita 4-4.`);
      }
    }

    return {
      is_viable: isViable,
      rejection_reasons: rejectionReasons,
      is_anomalous: isAnomalous,
      anomaly_reasons: anomalyReasons,
    };
  }

  /**
   * Generates a fully transparent, step-by-step explicability breakdown answering all 6 "Why" questions.
   */
  static generateExplanation(
    item: EveTypeDetail,
    buyHub: MarketHub,
    sellHub: MarketHub,
    strategy: TradeStrategy,
    quantity: number,
    bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market',
    tradableDetails: { capitalLimitedUnits: number; cargoLimitedUnits: number; sourceAvailableUnits: number; destAvailableUnits: number },
    buyFill: ExecutionFill,
    sellFill: ExecutionFill,
    costs: TradeCostBreakdown,
    expectedDaysToSell: number,
    capturableDailyVolume: number,
    dailyMarketVolume: number,
    ordersAhead: number,
    volumeAhead: number,
    overallConfidence: number,
    buyQuality?: MarketDataQuality,
    sellQuality?: MarketDataQuality,
    jitaVerified: boolean = false,
    jitaSpreadPct: number = 0,
    isAnomalous: boolean = false,
    anomalyReasons: string[] = [],
    isViable: boolean = true,
    rejectionReasons: string[] = []
  ): OpportunityExplanation {
    const whyDetected = `Opportunité d'arbitrage ${strategy === 'relist' ? 'Taker -> Maker (Relist)' : 'Taker -> Taker (Immédiat)'} pour ${item.name} de ${buyHub.name} vers ${sellHub.name} avec un profit net simulé de ${costs.net_profit.toLocaleString()} ISK (ROI: ${(costs.roi * 100).toFixed(2)}%).`;

    let bottleneckSummary = '';
    if (bottleneck === 'capital') bottleneckSummary = `Limité par le capital alloué (${tradableDetails.capitalLimitedUnits.toLocaleString()} unités max).`;
    else if (bottleneck === 'cargo') bottleneckSummary = `Limité par la capacité de soute du vaisseau (${tradableDetails.cargoLimitedUnits.toLocaleString()} unités max pour ${costs.capital_locked.toLocaleString()} ISK).`;
    else if (bottleneck === 'source_market') bottleneckSummary = `Limité par la liquidité disponible sur le carnet source (${tradableDetails.sourceAvailableUnits.toLocaleString()} unités).`;
    else bottleneckSummary = `Limité par la capacité d'absorption du marché de destination (${tradableDetails.destAvailableUnits.toLocaleString()} unités).`;

    const whyThisQuantity = {
      tradable_quantity: quantity,
      bottleneck,
      capital_limit_units: tradableDetails.capitalLimitedUnits,
      cargo_limit_units: tradableDetails.cargoLimitedUnits,
      source_available_units: tradableDetails.sourceAvailableUnits,
      dest_available_units: tradableDetails.destAvailableUnits,
      summary: bottleneckSummary,
    };

    const whyThisPrice = {
      source_top_of_book: buyFill.top_of_book_price || buyFill.effective_price,
      source_effective_price: buyFill.effective_price,
      source_slippage_pct: roundIsk(buyFill.slippage_pct * 100),
      source_levels_consumed: buyFill.levels_exhausted,
      dest_top_of_book: sellFill.top_of_book_price || sellFill.effective_price,
      dest_effective_price: sellFill.effective_price,
      dest_slippage_pct: roundIsk(sellFill.slippage_pct * 100),
      dest_levels_consumed: sellFill.levels_exhausted,
      summary: `Achat source sur ${buyFill.levels_exhausted} niveau(x) (Top: ${(buyFill.top_of_book_price || buyFill.effective_price).toLocaleString()} ISK, Moyen: ${buyFill.effective_price.toLocaleString()} ISK, Slippage: ${(buyFill.slippage_pct * 100).toFixed(2)}%). Vente destination ${strategy === 'relist' ? 'au prix relist suggéré' : `sur ${sellFill.levels_exhausted} niveau(x) d'ordres d'achat`} (${sellFill.effective_price.toLocaleString()} ISK).`,
    };

    const whyThisProfit = {
      gross_purchase: costs.purchase_cost,
      buy_broker_fee: costs.buy_broker_fee,
      transport_cost: costs.transport_cost,
      gross_revenue: costs.gross_revenue,
      sales_tax: costs.sales_tax,
      sell_broker_fee: costs.sell_broker_fee,
      net_profit: costs.net_profit,
      roi_pct: roundIsk(costs.roi * 100),
      margin_pct: roundIsk(costs.margin * 100),
      summary: `Revenu brut: ${costs.gross_revenue.toLocaleString()} ISK - Achat: ${costs.purchase_cost.toLocaleString()} ISK - Courtage: ${(costs.buy_broker_fee + costs.sell_broker_fee).toLocaleString()} ISK - Taxes: ${costs.sales_tax.toLocaleString()} ISK - Fret: ${costs.transport_cost.toLocaleString()} ISK = Profit Net: ${costs.net_profit.toLocaleString()} ISK.`,
    };

    const whyThisDelay = {
      strategy,
      expected_days_to_sell: expectedDaysToSell,
      capturable_volume_per_day: capturableDailyVolume,
      daily_market_volume: dailyMarketVolume,
      orders_ahead: ordersAhead,
      volume_ahead: volumeAhead,
      summary: strategy === 'immediate'
        ? 'Exécution immédiate à l\'arrivée en station destination.'
        : `Vente relist estimée sur ${expectedDaysToSell.toFixed(1)} jour(s) (${volumeAhead.toLocaleString()} unités en compétition devant l'ordre, absorption estimée à ${capturableDailyVolume.toLocaleString()} u/jour).`,
    };

    const whyThisConfidence = {
      overall_confidence: overallConfidence,
      source_freshness: buyQuality?.freshness || 'fresh',
      dest_freshness: sellQuality?.freshness || 'fresh',
      jita_verified: jitaVerified,
      jita_spread_pct: jitaSpreadPct,
      is_anomalous: isAnomalous,
      anomaly_reasons: anomalyReasons,
      summary: `Indice de confiance ${Math.round(overallConfidence * 100)}%. ${jitaVerified ? 'Aligné sur le benchmark Jita.' : 'Benchmark Jita indicatif.'} ${isAnomalous ? `Attention : ${anomalyReasons.join(' ')}` : 'Données stables et vérifiées.'}`,
    };

    return {
      why_detected: whyDetected,
      why_this_quantity: whyThisQuantity,
      why_this_price: whyThisPrice,
      why_this_profit: whyThisProfit,
      why_this_delay: whyThisDelay,
      why_this_confidence: whyThisConfidence,
      why_rejected: !isViable ? { is_viable: false, rejection_reasons: rejectionReasons } : undefined,
    };
  }

  /**
   * Complete Directed Inter-Regional Arbitrage Opportunity Calculator (Hub A -> Hub B).
   * Fully deterministic execution simulation with order books, accessibility, logistics, and audit tracing.
   */
  static calculateOpportunity(
    item: EveTypeDetail,
    buyHub: MarketHub,
    sellHub: MarketHub,
    strategy: TradeStrategy,
    config: FinancialConfig,
    buyRegionOrders: RawMarketOrder[] = [],
    sellRegionOrders: RawMarketOrder[] = [],
    historyStatsByRegion: Record<number, HistoricalStats> = {},
    qualitiesByRegion: Record<number, MarketDataQuality> = {},
    jitaOrders: RawMarketOrder[] = []
  ): InterRegionalOpportunity | null {
    if (buyHub.id === sellHub.id) return null;

    const catalogRepository = CatalogRepository.getInstance();
    const universeRepository = UniverseRepository.getInstance();
    const typeResolution = catalogRepository.resolveType(item.type_id);

    // Financial calculations may only consume canonical, verified catalog data.
    if (
      !catalogRepository.isReady() ||
      typeResolution.status !== 'RESOLVED_CATALOG' ||
      !typeResolution.type ||
      !typeResolution.is_verified
    ) return null;

    const sourceLocRes = universeRepository.resolveLocationSync(buyHub.station_id);
    const destLocRes = universeRepository.resolveLocationSync(sellHub.station_id);

    // Financial calculations may only consume verified hub locations.
    if (
      !sourceLocRes.is_verified ||
      !destLocRes.is_verified ||
      sourceLocRes.status === 'LOCATION_UNKNOWN' ||
      destLocRes.status === 'LOCATION_UNKNOWN' ||
      !sourceLocRes.system_id ||
      !destLocRes.system_id
    ) return null;

    const route = universeRepository.getRoute(buyHub.system_id, sellHub.system_id);

    // Unknown routes have no financial semantics and must be rejected before quantity/cost/scoring.
    if (route.status !== 'KNOWN' || route.is_verified !== true || route.jumps < 0) return null;

    const calculationItem = typeResolution.type;
    const buyQuality = qualitiesByRegion[buyHub.region_id];
    const sellQuality = qualitiesByRegion[sellHub.region_id];
    const jitaQuality = qualitiesByRegion[10000002];

    // 1. Filter source sell orders located physically AT buyHub station
    const sourceSellOrders = this.filterAccessibleOrdersForHub(buyRegionOrders, buyHub, true, false);
    const sourceLadders = PriceLadder.aggregate(sourceSellOrders, false); // Lowest sell price first
    if (sourceLadders.length === 0) return null;

    const totalSourceVolume = sourceLadders.reduce((acc, l) => acc + l.volume, 0);
    const bestSourceSellPrice = sourceLadders[0].price;

    let destLadders: PriceLevel[] = [];
    let relistContext: RelistMarketContext | undefined;
    let expectedDaysToSell = 0.1;
    let capturableDailyVolume = 0;
    const destHistory = historyStatsByRegion[sellHub.region_id];

    // 2. Build Destination Execution Ladder
    if (strategy === 'relist') {
      const destSellOrders = this.filterAccessibleOrdersForHub(sellRegionOrders, sellHub, false, false);
      const destSellLadders = PriceLadder.aggregate(destSellOrders, false);

      const relistRes = this.computeCapturableVolumeAndRelistContext(
        destSellLadders,
        destHistory,
        1, // Initial reference unit
        bestSourceSellPrice,
        config
      );

      relistContext = relistRes.relistContext;
      const targetRelistPrice = relistRes.suggestedRelistPrice;
      const virtualAbsorption = Math.max(1, relistRes.expectedCapturableVolumePerDay * Math.max(1, config.max_days_to_sell || 7));

      destLadders = [
        {
          price: targetRelistPrice,
          volume: virtualAbsorption,
          orders: 1,
          cumulative: virtualAbsorption,
        },
      ];
      expectedDaysToSell = relistRes.expectedDaysToSell;
      capturableDailyVolume = relistRes.expectedCapturableVolumePerDay;
    } else {
      // Immediate strategy (Taker Sell into existing accessible Buy Orders)
      const destBuyOrders = this.filterAccessibleOrdersForHub(sellRegionOrders, sellHub, false, true);
      destLadders = PriceLadder.aggregate(destBuyOrders, true); // Highest buy price first
      if (destLadders.length === 0) return null;

      expectedDaysToSell = 0.1; // Execution is immediate upon docking
      capturableDailyVolume = destLadders.reduce((acc, l) => acc + l.volume, 0);
    }

    if (destLadders.length === 0) return null;
    const bestDestSellTargetPrice = destLadders[0].price;

    // Early gross spread check
    if (bestDestSellTargetPrice <= bestSourceSellPrice) return null;

    const totalDestVolume = destLadders.reduce((acc, l) => acc + l.volume, 0);
    // Verified route declared at the financial boundary above and reused here.

    // 3. Multi-constraint tradable quantity resolution
    const tradableDetails = this.determineTradableQuantity(
      bestSourceSellPrice,
      calculationItem.volume,
      totalSourceVolume,
      totalDestVolume,
      route,
      config
    );

    const quantity = tradableDetails.quantity;
    if (quantity <= 0) return null;

    // 4. Exact Execution Fill Simulation on source and destination books
    const buyFill = this.simulateFill(sourceLadders, quantity, false);
    const sellFill = this.simulateFill(destLadders, quantity, true);

    if (buyFill.filled_quantity <= 0 || sellFill.filled_quantity <= 0) return null;
    const actualQuantity = Math.min(buyFill.filled_quantity, sellFill.filled_quantity);

    // 5. Cost and Profit Calculation
    const costs = this.computeCostsAndProfit(
      buyFill,
      sellFill,
      actualQuantity,
      calculationItem.volume,
      route,
      strategy,
      config,
      false
    );

    // Update relist context with actual final trade quantity
    if (strategy === 'relist' && relistContext) {
      const destSellOrders = this.filterAccessibleOrdersForHub(sellRegionOrders, sellHub, false, false);
      const destSellLadders = PriceLadder.aggregate(destSellOrders, false);
      const updatedRelist = this.computeCapturableVolumeAndRelistContext(
        destSellLadders,
        destHistory,
        actualQuantity,
        buyFill.effective_price,
        config
      );
      relistContext = {
        ...updatedRelist.relistContext,
        expected_revenue: costs.gross_revenue,
        expected_profit: costs.net_profit,
      };
      expectedDaysToSell = updatedRelist.expectedDaysToSell;
      capturableDailyVolume = updatedRelist.expectedCapturableVolumePerDay;
    }

    // 6. Independent Jita Benchmark Evaluation
    const jitaBenchmark = this.evaluateJitaBenchmark(
      jitaOrders,
      buyFill.effective_price,
      sellFill.effective_price,
      jitaQuality
    );

    // 7. Hard Rejection & Viability Evaluation
    const hardRejection = this.evaluateHardRejection(
      actualQuantity,
      costs,
      expectedDaysToSell,
      config,
      sourceLadders,
      destLadders,
      buyQuality,
      sellQuality,
      jitaBenchmark
    );

    // 8. Liquidity Metrics
    const dailyDestVol = destHistory?.daily_volume_7d_median || (strategy === 'relist' ? capturableDailyVolume : totalDestVolume);
    const liquidityMetrics = {
      buy_hub_depth_volume: totalSourceVolume,
      sell_hub_depth_volume: totalDestVolume,
      daily_volume_source: historyStatsByRegion[buyHub.region_id]?.daily_volume_7d_median || totalSourceVolume,
      daily_volume_dest: dailyDestVol,
      turnover_ratio: dailyDestVol > 0 ? actualQuantity / dailyDestVol : 1,
      expected_days_to_sell: expectedDaysToSell,
      volume_exhaustion_pct: totalSourceVolume > 0 ? (actualQuantity / totalSourceVolume) * 100 : 100,
    };

    // 9. Transparent Factor Scoring
    const scoringEvaluation = OpportunityScoringEngine.evaluate(
      costs,
      liquidityMetrics,
      destHistory,
      route.jumps,
      route.is_highsec_only,
      config,
      buyFill.effective_price,
      actualQuantity
    );

    // Overall Data Quality Confidence
    const buyConf = buyQuality?.confidence ?? 1.0;
    const sellConf = sellQuality?.confidence ?? 1.0;
    const overallConfidence = roundIsk(Math.min(buyConf, sellConf) * (jitaBenchmark.is_jita_verified ? 1.0 : 0.9));

    // 10. Audit & Explicability Rationale Generation
    const explanation = this.generateExplanation(
      calculationItem,
      buyHub,
      sellHub,
      strategy,
      actualQuantity,
      tradableDetails.bottleneck,
      tradableDetails,
      buyFill,
      sellFill,
      costs,
      expectedDaysToSell,
      capturableDailyVolume,
      dailyDestVol,
      relistContext?.orders_ahead || 0,
      relistContext?.volume_ahead || 0,
      overallConfidence,
      buyQuality,
      sellQuality,
      jitaBenchmark.is_jita_verified,
      jitaBenchmark.buy_vs_jita_pct,
      hardRejection.is_anomalous,
      hardRejection.anomaly_reasons,
      hardRejection.is_viable,
      hardRejection.rejection_reasons
    );

    const group = catalogRepository.getGroup(calculationItem.group_id);
    const category = catalogRepository.getCategory(calculationItem.category_id);

    const isAnomalous = hardRejection.is_anomalous || scoringEvaluation.isAnomalous;
    const spreadPctVal = bestSourceSellPrice > 0 ? (bestDestSellTargetPrice - bestSourceSellPrice) / bestSourceSellPrice : 0;

    // Deterministic feature engineering & predictive forecast
    const features = MarketFeatureEngine.extractFeatures(
      [],
      destHistory,
      spreadPctVal * 100,
      relistContext?.orders_ahead || 0
    );

    const prediction = PredictionEngine.forecast({
      strategy,
      costs,
      capturableProfit: scoringEvaluation.capturableProfit,
      expectedDaysToSell,
      liquidity: liquidityMetrics,
      features,
      history: destHistory,
      dataConfidence: overallConfidence,
      isJitaVerified: jitaBenchmark.is_jita_verified,
      routeJumps: route.jumps,
      isHighSecOnly: route.is_highsec_only,
      isAnomalous,
    });

    // --- PHASE 2C: FOUR-PILLARS OPPORTUNITY CERTIFICATION ---
    // Pillar 1: MarketData Evaluation (via FailureSemantics)
    const healthSource: DataHealthStatus = buyQuality?.health_status || (buyQuality ? FailureSemantics.evaluateHealth(buyQuality) : 'UNKNOWN');
    const healthDest: DataHealthStatus = sellQuality?.health_status || (sellQuality ? FailureSemantics.evaluateHealth(sellQuality) : 'UNKNOWN');

    const buyDataState: DataState = buyQuality?.data_state || FailureSemantics.healthToDataState(healthSource, totalSourceVolume);
    const sellDataState: DataState = sellQuality?.data_state || FailureSemantics.healthToDataState(healthDest, totalDestVolume);

    let marketDataPillarStatus: 'PASS' | 'DEGRADED' | 'FAIL' = 'PASS';
    let marketDataDetail = 'Données de marché complètes et fraîches.';
    if (healthSource === 'ERROR' || healthDest === 'ERROR' || healthSource === 'UNKNOWN' || healthDest === 'UNKNOWN' || buyDataState === 'ERROR' || sellDataState === 'ERROR') {
      marketDataPillarStatus = 'FAIL';
      marketDataDetail = 'Données de marché sources ou destination manquantes, inconnues ou en erreur.';
    } else if (
      healthSource === 'STALE' ||
      healthDest === 'STALE' ||
      healthSource === 'PARTIAL' ||
      healthDest === 'PARTIAL' ||
      buyDataState === 'STALE' ||
      sellDataState === 'STALE' ||
      buyDataState === 'PARTIAL' ||
      sellDataState === 'PARTIAL'
    ) {
      marketDataPillarStatus = 'DEGRADED';
      marketDataDetail = 'Données de marché partielles ou obsolètes (stale).';
    }

    // Pillar 2: Catalog Evaluation
    // typeResolution was verified before financial calculation.
    let catalogPillarStatus: 'PASS' | 'DEGRADED' | 'FAIL' = 'PASS';
    let catalogDetail = `Type ${calculationItem.name} (#${calculationItem.type_id}) certifié au catalogue officiel.`;
    if (typeResolution.status !== 'RESOLVED_CATALOG' || !typeResolution.is_verified || !catalogRepository.isReady()) {
      catalogPillarStatus = 'FAIL';
      catalogDetail = `Type ${calculationItem.name} (#${calculationItem.type_id}) non certifié par le catalogue canonique.`;
    }

    // Pillar 3: Universe Evaluation
    // sourceLocRes and destLocRes were verified before financial calculation.
    let universePillarStatus: 'PASS' | 'DEGRADED' | 'FAIL' = 'PASS';
    let universeDetail = `Stations et route Highsec validées (${route.jumps} sauts).`;
    if (!route.is_highsec_only || sourceLocRes.is_structure || destLocRes.is_structure) {
      universePillarStatus = 'DEGRADED';
      universeDetail = `Route ou localisation non conforme au profil Highsec (${route.jumps} sauts, Highsec: ${route.is_highsec_only ? 'oui' : 'non'}).`;
    }

    // Pillar 4: Financial Engine Evaluation
    const isViableFinal = hardRejection.is_viable && scoringEvaluation.isViable;
    let financialPillarStatus: 'PASS' | 'DEGRADED' | 'FAIL' = 'PASS';
    let financialDetail = `Rentabilité confirmée (Net: ${costs.net_profit.toLocaleString()} ISK, ROI: ${(costs.roi * 100).toFixed(1)}%).`;
    if (!isViableFinal || costs.net_profit <= 0 || actualQuantity <= 0) {
      financialPillarStatus = 'FAIL';
      financialDetail = `Arbitrage non viable ou perte nette: ${hardRejection.rejection_reasons.concat(scoringEvaluation.rejectionReasons).join(', ') || 'profit nul ou négatif'}`;
    } else if (
      costs.roi < (config.min_roi || 0.03) ||
      isAnomalous ||
      overallConfidence < 0.8 ||
      scoringEvaluation.scores.overall_score < 40
    ) {
      financialPillarStatus = 'DEGRADED';
      financialDetail = `Marges ou indice de confiance réduits (ROI: ${(costs.roi * 100).toFixed(1)}%, anomalie: ${isAnomalous ? 'oui' : 'non'}, score: ${scoringEvaluation.scores.overall_score}).`;
    }

    // 4-Pillar Synthesis: CERTIFIED | DEGRADED | REJECTED
    let certificationStatus: 'CERTIFIED' | 'DEGRADED' | 'REJECTED' = 'CERTIFIED';
    let isActionable = true;

    if (
      marketDataPillarStatus === 'FAIL' ||
      catalogPillarStatus === 'FAIL' ||
      universePillarStatus === 'FAIL' ||
      financialPillarStatus === 'FAIL'
    ) {
      certificationStatus = 'REJECTED';
      isActionable = false;
    } else if (
      marketDataPillarStatus === 'DEGRADED' ||
      catalogPillarStatus === 'DEGRADED' ||
      universePillarStatus === 'DEGRADED' ||
      financialPillarStatus === 'DEGRADED'
    ) {
      certificationStatus = 'DEGRADED';
      isActionable = false;
    }

    const blockingReasons = Array.from(
      new Set([
        ...hardRejection.rejection_reasons,
        ...scoringEvaluation.rejectionReasons,
        ...(marketDataPillarStatus === 'FAIL' ? [marketDataDetail] : []),
        ...(catalogPillarStatus === 'FAIL' ? [catalogDetail] : []),
        ...(universePillarStatus === 'FAIL' ? [universeDetail] : []),
        ...(financialPillarStatus === 'FAIL' ? [financialDetail] : []),
      ])
    );

    const warnings = Array.from(
      new Set([
        ...hardRejection.anomaly_reasons,
        ...scoringEvaluation.anomalyReasons,
        ...(marketDataPillarStatus === 'DEGRADED' ? [marketDataDetail] : []),
        ...(catalogPillarStatus === 'DEGRADED' ? [catalogDetail] : []),
        ...(universePillarStatus === 'DEGRADED' ? [universeDetail] : []),
        ...(financialPillarStatus === 'DEGRADED' ? [financialDetail] : []),
      ])
    );

    const sourceSnapshotHash = OpportunityEvidenceEngine.computeMarketSnapshotHash(buyRegionOrders);
    const destSnapshotHash = OpportunityEvidenceEngine.computeMarketSnapshotHash(sellRegionOrders);

    const pillarEvaluations = {
      market_data: {
        status: marketDataPillarStatus,
        health_source: healthSource,
        health_dest: healthDest,
        detail: marketDataDetail,
      },
      catalog: {
        status: catalogPillarStatus,
        type_id: calculationItem.type_id,
        status_code: typeResolution.status,
        detail: catalogDetail,
      },
      universe: {
        status: universePillarStatus,
        source_station_id: buyHub.station_id,
        dest_station_id: sellHub.station_id,
        detail: universeDetail,
      },
      financial_engine: {
        status: financialPillarStatus,
        net_profit: costs.net_profit,
        roi: costs.roi,
        detail: financialDetail,
      },
    };

    const sourceProvenance: DataProvenance | undefined = buyQuality ? {
      source: buyQuality.source,
      freshness: buyQuality.freshness,
      data_state: buyDataState,
      health_status: healthSource,
      completeness: buyQuality.completeness,
      validation_status: buyQuality.validation_status,
      fetched_at: buyQuality.fetched_at,
      age_seconds: buyQuality.age_seconds,
      pages_fetched: buyQuality.pages_fetched,
      expected_pages: buyQuality.expected_pages,
      orders_fetched: buyQuality.orders_fetched,
      orders_valid: buyQuality.orders_valid,
      duplicate_orders_removed: buyQuality.duplicate_orders_removed,
      rejected_orders_count: buyQuality.rejected_orders_count,
      error_count: buyQuality.error_count,
      last_error: buyQuality.last_error,
      confidence: buyQuality.confidence,
      sync_duration_ms: buyQuality.sync_duration_ms,
    } : undefined;

    const destProvenance: DataProvenance | undefined = sellQuality ? {
      source: sellQuality.source,
      freshness: sellQuality.freshness,
      data_state: sellDataState,
      health_status: healthDest,
      completeness: sellQuality.completeness,
      validation_status: sellQuality.validation_status,
      fetched_at: sellQuality.fetched_at,
      age_seconds: sellQuality.age_seconds,
      pages_fetched: sellQuality.pages_fetched,
      expected_pages: sellQuality.expected_pages,
      orders_fetched: sellQuality.orders_fetched,
      orders_valid: sellQuality.orders_valid,
      duplicate_orders_removed: sellQuality.duplicate_orders_removed,
      rejected_orders_count: sellQuality.rejected_orders_count,
      error_count: sellQuality.error_count,
      last_error: sellQuality.last_error,
      confidence: sellQuality.confidence,
      sync_duration_ms: sellQuality.sync_duration_ms,
    } : undefined;

    const provenance: OpportunityProvenance = {
      source_market_provenance: sourceProvenance,
      dest_market_provenance: destProvenance,
      type_resolution: typeResolution,
      source_location_resolution: sourceLocRes,
      dest_location_resolution: destLocRes,
      route_resolution: route,
      catalog_version: typeResolution.catalog_version || '2026.09.20.1',
      catalog_checksum: typeResolution.catalog_checksum || 'canonical',
      calculation_timestamp: new Date().toISOString(),
    };

    const opportunityId = `${item.type_id}_${buyHub.id}_${sellHub.id}_${strategy}`;
    const detectedTimestamp = new Date().toISOString();

    const evidence = OpportunityEvidenceEngine.buildEvidence({
      opportunity_id: opportunityId,
      detected_at: detectedTimestamp,
      certification_version: CURRENT_CERTIFICATION_VERSION,
      certification_status: certificationStatus,
      is_actionable: isActionable,
      type_id: item.type_id,
      source_market: {
        type_id: item.type_id,
        region_id: buyHub.region_id,
        timestamp: buyQuality?.fetched_at ? new Date(buyQuality.fetched_at).getTime() : Date.now(),
        orders_count: buyRegionOrders.length,
        health_status: healthSource,
        data_state: buyDataState,
        market_hash: sourceSnapshotHash,
        source: buyQuality?.source || 'esi',
        freshness: buyQuality?.freshness || 'fresh',
        completeness: buyQuality?.completeness || 'complete',
        confidence: buyQuality?.confidence ?? 1.0,
        age_seconds: buyQuality?.age_seconds ?? 0,
      },
      dest_market: {
        type_id: item.type_id,
        region_id: sellHub.region_id,
        timestamp: sellQuality?.fetched_at ? new Date(sellQuality.fetched_at).getTime() : Date.now(),
        orders_count: sellRegionOrders.length,
        health_status: healthDest,
        data_state: sellDataState,
        market_hash: destSnapshotHash,
        source: sellQuality?.source || 'esi',
        freshness: sellQuality?.freshness || 'fresh',
        completeness: sellQuality?.completeness || 'complete',
        confidence: sellQuality?.confidence ?? 1.0,
        age_seconds: sellQuality?.age_seconds ?? 0,
      },
      source_market_provenance: sourceProvenance,
      dest_market_provenance: destProvenance,
      source_market_hash: sourceSnapshotHash,
      dest_market_hash: destSnapshotHash,
      catalog_version: typeResolution.catalog_version || '2026.09.20.1',
      catalog_checksum: typeResolution.catalog_checksum || 'canonical',
      type_resolution: typeResolution,
      source_location_resolution: sourceLocRes,
      dest_location_resolution: destLocRes,
      route_resolution: route,
      financial_inputs: {
        available_capital: config.available_capital,
        max_cargo_m3: config.max_cargo_m3,
        broker_fee: config.broker_fee,
        sales_tax: config.sales_tax,
        enable_transport_costs: Boolean(config.enable_transport_costs),
        transport_cost_per_m3: config.transport_cost_per_m3 || 0,
        transport_cost_per_jump: config.transport_cost_per_jump || 0,
        min_roi: config.min_roi || 0.03,
        min_net_profit: config.min_net_profit || 1000,
        unit_volume: item.volume,
        strategy,
        accounting_level: config.accounting_level,
        broker_relations_level: config.broker_relations_level,
        advanced_broker_relations_level: config.advanced_broker_relations_level,
      },
      financial_outputs: {
        quantity: actualQuantity,
        effective_buy_price: buyFill.effective_price,
        effective_sell_price: sellFill.effective_price,
        gross_purchase_cost: costs.purchase_cost,
        buy_broker_fee_cost: costs.buy_broker_fee,
        transport_cost: costs.transport_cost,
        total_acquisition_cost: costs.total_acquisition_cost,
        gross_revenue: costs.gross_revenue,
        sales_tax_cost: costs.sales_tax,
        sell_broker_fee_cost: costs.sell_broker_fee,
        total_exit_fees: costs.total_exit_fees,
        net_revenue: costs.net_revenue,
        net_profit: costs.net_profit,
        profit_per_unit: costs.profit_per_unit,
        roi: costs.roi,
        margin: costs.margin,
        capital_locked: costs.capital_locked,
        bottleneck: tradableDetails.bottleneck,
        is_viable: isViableFinal,
      },
      strategy,
      confidence: overallConfidence,
      warnings,
      blocking_reasons: blockingReasons,
      pillar_evaluations: pillarEvaluations,
    });

    const certification: OpportunityCertification = {
      status: certificationStatus,
      is_actionable: isActionable,
      certification_version: CURRENT_CERTIFICATION_VERSION,
      evidence_hash: evidence.evidence_hash,
      evidence,
      data_state_source: buyDataState,
      data_state_dest: sellDataState,
      health_state_source: healthSource,
      health_state_dest: healthDest,
      catalog_status: typeResolution.status,
      universe_status_source: sourceLocRes.status,
      universe_status_dest: destLocRes.status,
      financial_status: financialPillarStatus === 'PASS' ? 'VIABLE' : financialPillarStatus === 'DEGRADED' ? 'DEGRADED' : 'UNVIABLE',
      confidence: overallConfidence,
      warnings,
      blocking_reasons: blockingReasons,
      certified_at: detectedTimestamp,
      pillar_evaluations: pillarEvaluations,
    };

    return {
      id: `${item.type_id}_${buyHub.id}_${sellHub.id}_${strategy}`,
      type_id: item.type_id,
      type_name: item.name,
      group_id: item.group_id,
      group_name: group?.name || `Groupe ${item.group_id}`,
      category_id: item.category_id,
      category_name: category?.name || `Catégorie ${item.category_id}`,
      unit_volume: item.volume,
      buy_hub: buyHub,
      sell_hub: sellHub,
      strategy,
      route,
      best_buy_order_price: bestSourceSellPrice,
      best_sell_order_price: bestDestSellTargetPrice,
      effective_buy_price: buyFill.effective_price,
      effective_sell_price: sellFill.effective_price,
      top_of_book_buy_price: buyFill.top_of_book_price || bestSourceSellPrice,
      top_of_book_sell_price: sellFill.top_of_book_price || bestDestSellTargetPrice,
      spread_pct: spreadPctVal,
      quantity_tradable: actualQuantity,
      bottleneck: tradableDetails.bottleneck,
      total_cargo_volume: tradableDetails.totalCargoVolume,
      costs,
      capturable_profit: scoringEvaluation.capturableProfit,
      profit_per_day: scoringEvaluation.profitPerDay,
      expected_days_to_sell: expectedDaysToSell,
      liquidity: liquidityMetrics,
      history: destHistory,
      scores: scoringEvaluation.scores,
      jita_price_benchmark: jitaBenchmark,
      relist_context: relistContext,
      explanation,
      prediction,
      features,
      is_anomalous: isAnomalous,
      anomaly_reasons: Array.from(new Set([...hardRejection.anomaly_reasons, ...scoringEvaluation.anomalyReasons])),
      rejection_reasons: Array.from(new Set([...hardRejection.rejection_reasons, ...scoringEvaluation.rejectionReasons])),
      is_viable: isViableFinal,
      certification,
      provenance,
      evidence,
      data_quality: {
        buy_hub_quality: buyQuality,
        sell_hub_quality: sellQuality,
        overall_confidence: overallConfidence,
        overall_freshness: buyQuality?.freshness === 'expired' || sellQuality?.freshness === 'expired' ? 'expired' : (buyQuality?.freshness === 'stale' || sellQuality?.freshness === 'stale' ? 'stale' : 'fresh'),
        overall_completeness: buyQuality?.completeness === 'partial' || sellQuality?.completeness === 'partial' ? 'partial' : 'complete',
        is_verified_esi: true,
        confidence_score: overallConfidence,
        status_label: certificationStatus === 'CERTIFIED' ? 'Valide & Exécutable' : certificationStatus === 'DEGRADED' ? 'Dégradé (Données partielles/stale)' : 'Rejeté',
      },
      detected_at: new Date().toISOString(),
    };
  }
}

export const InterRegionalEngine = InterRegionalFinancialEngine;
