import {
  TradeStrategy, FinancialConfig, PriceLevel, ExecutionFill, TradeCostBreakdown, JumpRoute,
  EveTypeDetail, MarketHub, RawMarketOrder, HistoricalStats, MarketDataQuality,
  RelistMarketContext, LocationResolutionResult, TypeResolutionResult
} from '../types';
import { ProfitEngine } from './profit';
import { PriceLadder } from './ladder';
import { OpportunityScoringEngine } from './scoring';
import { MarketFeatureEngine } from './features';
import { PredictionEngine } from './prediction';
import { roundIsk, safeDiv } from './money';
import { TreasuryEngine } from './treasury';

export interface CertifiedInterRegionalInputs {
  readonly item:EveTypeDetail; readonly typeResolution:TypeResolutionResult;
  readonly sourceLocation:LocationResolutionResult; readonly destinationLocation:LocationResolutionResult;
  readonly route:JumpRoute; readonly buyHub:MarketHub; readonly sellHub:MarketHub;
  readonly strategy:TradeStrategy; readonly config:FinancialConfig;
  readonly buyRegionOrders:readonly RawMarketOrder[]; readonly sellRegionOrders:readonly RawMarketOrder[];
  readonly historyStatsByRegion:Readonly<Record<number,HistoricalStats>>;
  readonly qualitiesByRegion:Readonly<Record<number,MarketDataQuality>>;
  readonly jitaOrders:readonly RawMarketOrder[];
  readonly routeBySystemId:Readonly<Record<number,JumpRoute>>;
}

export interface InterRegionalCalculationResult {
  readonly calculationItem:EveTypeDetail; readonly typeResolution:TypeResolutionResult;
  readonly sourceLocRes:LocationResolutionResult; readonly destLocRes:LocationResolutionResult;
  readonly route:JumpRoute; readonly buyHub:MarketHub; readonly sellHub:MarketHub;
  readonly strategy:TradeStrategy; readonly config:FinancialConfig;
  readonly buyRegionOrders:readonly RawMarketOrder[]; readonly sellRegionOrders:readonly RawMarketOrder[];
  readonly buyQuality?:MarketDataQuality; readonly sellQuality?:MarketDataQuality; readonly jitaQuality?:MarketDataQuality;
  readonly destHistory?:HistoricalStats; readonly sourceLadders:PriceLevel[]; readonly destLadders:PriceLevel[];
  readonly tradableDetails:ReturnType<typeof InterRegionalCalculationEngine.determineTradableQuantity>;
  readonly buyFill:ExecutionFill; readonly sellFill:ExecutionFill; readonly actualQuantity:number;
  readonly totalSourceVolume:number; readonly totalDestVolume:number;
  readonly bestSourceSellPrice:number; readonly bestDestSellTargetPrice:number;
  readonly costs:TradeCostBreakdown; readonly relistContext?:RelistMarketContext;
  readonly expectedDaysToSell:number; readonly capturableDailyVolume:number;
  readonly jitaBenchmark:ReturnType<typeof InterRegionalCalculationEngine.evaluateJitaBenchmark>;
  readonly hardRejection:ReturnType<typeof InterRegionalCalculationEngine.evaluateHardRejection>;
  readonly liquidityMetrics:{buy_hub_depth_volume:number;sell_hub_depth_volume:number;daily_volume_source:number;daily_volume_dest:number;turnover_ratio:number;expected_days_to_sell:number;volume_exhaustion_pct:number};
  readonly scoringEvaluation:ReturnType<typeof OpportunityScoringEngine.evaluate>;
  readonly overallConfidence:number; readonly isAnomalous:boolean; readonly spreadPctVal:number;
  readonly features:ReturnType<typeof MarketFeatureEngine.extractFeatures>;
  readonly prediction:ReturnType<typeof PredictionEngine.forecast>;
}

export class InterRegionalCalculationEngine {
  static validateCertifiedInputs(i:CertifiedInterRegionalInputs):boolean {
    return i.item.type_id===i.typeResolution.type_id &&
      i.typeResolution.status==='RESOLVED_CATALOG' && i.typeResolution.is_verified===true && !!i.typeResolution.type &&
      i.typeResolution.type.type_id===i.item.type_id &&
      i.sourceLocation.location_id===i.buyHub.station_id && i.destinationLocation.location_id===i.sellHub.station_id &&
      i.sourceLocation.is_verified===true && i.destinationLocation.is_verified===true &&
      i.sourceLocation.status!=='LOCATION_UNKNOWN' && i.destinationLocation.status!=='LOCATION_UNKNOWN' &&
      i.sourceLocation.is_structure!==true && i.destinationLocation.is_structure!==true &&
      i.sourceLocation.system_id===i.buyHub.system_id && i.destinationLocation.system_id===i.sellHub.system_id &&
      i.sourceLocation.region_id===i.buyHub.region_id && i.destinationLocation.region_id===i.sellHub.region_id &&
      i.route.status==='KNOWN' && i.route.is_verified===true && Number.isFinite(i.route.jumps) && i.route.jumps>=0;
  }

  static filterAccessibleOrdersForHub(
    orders: readonly RawMarketOrder[],
    hub: MarketHub,
    isSourceHub: boolean,
    isBuyOrder: boolean,
    routeBySystemId: Readonly<Record<number, JumpRoute>> = {}
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
          const route = routeBySystemId[order.system_id];
          return (
            route.status === 'KNOWN' &&
            route.is_verified === true &&
            Number.isFinite(route.jumps) &&
            route.jumps >= 0 &&
            route.jumps <= numericRange
          );
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


  static computeCostsAndProfit(
    buyExecution: ExecutionFill, sellExecution: ExecutionFill, quantity: number, unitVolume: number,
    route: JumpRoute, strategy: TradeStrategy, config: FinancialConfig, isBuyMaker: boolean = false
  ): TradeCostBreakdown {
    const scenario = isBuyMaker
      ? (strategy === 'relist' ? 'maker_maker' : 'maker_taker')
      : (strategy === 'relist' ? 'taker_maker' : 'taker_taker');
    const result = ProfitEngine.calculateScenario({
      scenario, quantity, effective_buy_price: buyExecution.effective_price,
      effective_sell_price: sellExecution.effective_price, unit_volume: unitVolume, jumps: route.jumps, config
    });
    return {
      purchase_cost: result.gross_purchase_cost, buy_broker_fee: result.buy_broker_fee_cost,
      transport_cost: result.transport_cost, total_acquisition_cost: result.total_acquisition_cost,
      gross_revenue: result.gross_revenue, sales_tax: result.sales_tax_cost,
      sell_broker_fee: result.sell_broker_fee_cost, total_exit_fees: result.total_exit_fees,
      net_revenue: result.net_revenue, net_profit: result.net_profit, profit_per_unit: result.profit_per_unit,
      roi: result.roi, margin: result.margin, capital_locked: result.capital_locked
    };
  }

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
    const historical7d = destHistory?.daily_volume_7d_median || destHistory?.daily_volume_7d_avg || 0;
    const historical30d = destHistory?.daily_volume_30d_median || destHistory?.daily_volume_30d_avg || 0;
    const trend = destHistory?.volume_trend || 'stable';

    if (historical7d <= 0 || historical30d <= 0) {
      throw new Error('Relist capturable volume requires positive destination market history');
    }

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
    const baseDailyVolume = historical7d;
    const expectedCapturableVolumePerDay = Math.max(0, Math.round(baseDailyVolume * trendMultiplier * boundedShare));

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
    jitaOrders: readonly RawMarketOrder[],
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


  static calculate(i:CertifiedInterRegionalInputs):InterRegionalCalculationResult|null {
    if(!this.validateCertifiedInputs(i))return null;
    const {item,typeResolution,sourceLocation:sourceLocRes,destinationLocation:destLocRes,route,buyHub,sellHub,strategy,config,buyRegionOrders,sellRegionOrders,historyStatsByRegion,qualitiesByRegion,jitaOrders,routeBySystemId}=i;
    const buyQuality=qualitiesByRegion[buyHub.region_id],sellQuality=qualitiesByRegion[sellHub.region_id],jitaQuality=qualitiesByRegion[10000002];
    const sourceOrders=this.filterAccessibleOrdersForHub(buyRegionOrders,buyHub,true,false,routeBySystemId),sourceLadders=PriceLadder.aggregate(sourceOrders,false);
    if(!sourceLadders.length)return null;
    const totalSourceVolume=sourceLadders.reduce((a,l)=>a+l.volume,0),bestSourceSellPrice=sourceLadders[0].price,destHistory=historyStatsByRegion[sellHub.region_id];
    if(strategy==='relist'&&(!destHistory||((destHistory.daily_volume_7d_median||destHistory.daily_volume_7d_avg||0)<=0)||((destHistory.daily_volume_30d_median||destHistory.daily_volume_30d_avg||0)<=0)))return null;
    let destLadders:PriceLevel[]=[],relistContext:RelistMarketContext|undefined,expectedDaysToSell=0.1,capturableDailyVolume=0;
    if(strategy==='relist'){
      const levels=PriceLadder.aggregate(this.filterAccessibleOrdersForHub(sellRegionOrders,sellHub,false,false,routeBySystemId),false),r=this.computeCapturableVolumeAndRelistContext(levels,destHistory,1,bestSourceSellPrice,config);if(!r)return null;
      relistContext=r.relistContext;const virtual=Math.max(1,r.expectedCapturableVolumePerDay*Math.max(1,config.max_days_to_sell||7));
      destLadders=[{price:r.suggestedRelistPrice,volume:virtual,orders:1,cumulative:virtual}];expectedDaysToSell=r.expectedDaysToSell;capturableDailyVolume=r.expectedCapturableVolumePerDay;
    }else{
      destLadders=PriceLadder.aggregate(this.filterAccessibleOrdersForHub(sellRegionOrders,sellHub,false,true,routeBySystemId),true);
      if(!destLadders.length)return null;capturableDailyVolume=destLadders.reduce((a,l)=>a+l.volume,0);
    }
    if(!destLadders.length)return null;
    const bestDestSellTargetPrice=destLadders[0].price;if(bestDestSellTargetPrice<=bestSourceSellPrice)return null;
    const totalDestVolume=destLadders.reduce((a,l)=>a+l.volume,0),tradableDetails=this.determineTradableQuantity(bestSourceSellPrice,item.volume,totalSourceVolume,totalDestVolume,route,config);
    if(tradableDetails.quantity<=0)return null;
    const buyFill=PriceLadder.simulateExecution(sourceLadders,tradableDetails.quantity,false),sellFill=PriceLadder.simulateExecution(destLadders,tradableDetails.quantity,true);
    if(buyFill.filled_quantity<=0||sellFill.filled_quantity<=0)return null;
    const actualQuantity=Math.min(buyFill.filled_quantity,sellFill.filled_quantity),costs=this.computeCostsAndProfit(buyFill,sellFill,actualQuantity,item.volume,route,strategy,config);
    if(strategy==='relist'&&relistContext){
      const levels=PriceLadder.aggregate(this.filterAccessibleOrdersForHub(sellRegionOrders,sellHub,false,false,routeBySystemId),false),r=this.computeCapturableVolumeAndRelistContext(levels,destHistory,actualQuantity,bestSourceSellPrice,config);if(!r)return null;
      relistContext={...r.relistContext,expected_revenue:costs.gross_revenue,expected_profit:costs.net_profit};expectedDaysToSell=r.expectedDaysToSell;capturableDailyVolume=r.expectedCapturableVolumePerDay;
    }
    const dailyDestVol=destHistory?.daily_volume_7d_median||(strategy==='relist'?capturableDailyVolume:totalDestVolume);
    const liquidityMetrics={buy_hub_depth_volume:totalSourceVolume,sell_hub_depth_volume:totalDestVolume,daily_volume_source:historyStatsByRegion[buyHub.region_id]?.daily_volume_7d_median||totalSourceVolume,daily_volume_dest:dailyDestVol,turnover_ratio:dailyDestVol>0?actualQuantity/dailyDestVol:1,expected_days_to_sell:expectedDaysToSell,volume_exhaustion_pct:totalSourceVolume>0?actualQuantity/totalSourceVolume*100:100};
    const jitaBenchmark=this.evaluateJitaBenchmark(jitaOrders,buyFill.effective_price,sellFill.effective_price,jitaQuality);
    const hardRejection=this.evaluateHardRejection(actualQuantity,costs,expectedDaysToSell,config,sourceLadders,destLadders,buyQuality,sellQuality,jitaBenchmark);
    const scoringEvaluation=OpportunityScoringEngine.evaluate(costs,liquidityMetrics,destHistory,route.jumps,route.is_highsec_only,config,buyFill.effective_price,actualQuantity);
    const overallConfidence=roundIsk(Math.min(buyQuality?.confidence??0,sellQuality?.confidence??0)*(jitaBenchmark.is_jita_verified?1:0.9));
    const isAnomalous=hardRejection.is_anomalous||scoringEvaluation.isAnomalous,spreadPctVal=bestSourceSellPrice>0?(bestDestSellTargetPrice-bestSourceSellPrice)/bestSourceSellPrice:0;
    const features=MarketFeatureEngine.extractFeatures([],destHistory,spreadPctVal*100,relistContext?.orders_ahead||0);
    const prediction=PredictionEngine.forecast({strategy,costs,capturableProfit:scoringEvaluation.capturableProfit,expectedDaysToSell,liquidity:liquidityMetrics,features,history:destHistory,dataConfidence:overallConfidence,isJitaVerified:jitaBenchmark.is_jita_verified,routeJumps:route.jumps,isHighSecOnly:route.is_highsec_only,isAnomalous});
    return {calculationItem:item,typeResolution,sourceLocRes,destLocRes,route,buyHub,sellHub,strategy,config,buyRegionOrders,sellRegionOrders,buyQuality,sellQuality,jitaQuality,destHistory,sourceLadders,destLadders,tradableDetails,buyFill,sellFill,actualQuantity,totalSourceVolume,totalDestVolume,bestSourceSellPrice,bestDestSellTargetPrice,costs,relistContext,expectedDaysToSell,capturableDailyVolume,jitaBenchmark,hardRejection,liquidityMetrics,scoringEvaluation,overallConfidence,isAnomalous,spreadPctVal,features,prediction};
  }
}
