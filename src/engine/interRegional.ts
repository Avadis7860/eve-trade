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
} from '../types';
import { FeeEngine } from './fee';
import { PriceLadder } from './ladder';
import { OpportunityScoringEngine } from './scoring';
import { getJumpRoute, EVE_GROUPS, EVE_CATEGORIES } from '../data/universe';

export class InterRegionalFinancialEngine {
  /**
   * Filters orders accessible at a specific Hub station/structure.
   *
   * Source Hub Sell Orders (we buy from them):
   * - Must be located at the Hub station_id (or if player structure, structure_id).
   *
   * Destination Hub Buy Orders (immediate sell into them):
   * - If order_range === 'station': location_id must match destHub.station_id.
   * - If order_range === 'solarsystem': system_id must match destHub.system_id.
   * - If order_range === 'region': matches anywhere in region.
   * - If numeric range: jump distance from order.system_id to destHub.system_id <= range.
   */
  static filterAccessibleOrdersForHub(
    orders: RawMarketOrder[],
    hub: MarketHub,
    isSourceHub: boolean,
    isBuyOrder: boolean
  ): RawMarketOrder[] {
    return orders.filter((order) => {
      if (order.is_buy_order !== isBuyOrder) return false;
      if (order.price <= 0 || order.volume_remain <= 0) return false;

      // Source Sell orders: Trader is at hub.station_id; seller's goods must be at hub.station_id
      if (isSourceHub && !isBuyOrder) {
        return order.location_id === hub.station_id;
      }

      // Destination Buy orders (Trader sells goods at hub):
      if (!isSourceHub && isBuyOrder) {
        if (order.location_id === hub.station_id) return true;
        const range = String(order.order_range || 'station').toLowerCase();
        if (range === 'region') return true;
        if (range === 'solarsystem' && order.system_id === hub.system_id) return true;
        const numericRange = parseInt(range, 10);
        if (!isNaN(numericRange) && numericRange >= 0) {
          const route = getJumpRoute(order.system_id, hub.system_id);
          return route.jumps <= numericRange;
        }
        return false;
      }

      // Destination Sell orders (Competing sellers for relist):
      if (!isSourceHub && !isBuyOrder) {
        return order.location_id === hub.station_id;
      }

      return true;
    });
  }

  /**
   * Simulates depth consumption on order book levels.
   * If buying: walks through sell levels (lowest to highest).
   * If selling: walks through buy levels (highest to lowest).
   */
  static simulateFill(levels: PriceLevel[], targetQuantity: number): ExecutionFill {
    let remaining = Math.max(0, Math.floor(targetQuantity));
    let totalExpenditure = 0.0;
    let levelsUsed = 0;

    for (const lvl of levels) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lvl.volume);
      totalExpenditure += take * lvl.price;
      remaining -= take;
      levelsUsed += 1;
    }

    const filled = Math.max(0, targetQuantity - remaining);
    const avgPrice = filled > 0 ? totalExpenditure / filled : 0.0;
    const topOfBookPrice = levels.length > 0 ? levels[0].price : 0.0;
    const slippage = topOfBookPrice > 0 ? Math.abs((avgPrice - topOfBookPrice) / topOfBookPrice) : 0.0;

    return {
      requested_quantity: targetQuantity,
      filled_quantity: filled,
      effective_price: avgPrice,
      total_cost_or_revenue: totalExpenditure,
      slippage_pct: slippage,
      levels_exhausted: levelsUsed,
    };
  }

  /**
   * Computes exact trade cost breakdown based on EVE Online mechanics:
   *
   * 1. Purchase Phase (Source Hub):
   *    - In EVE Online, buying directly from existing sell orders ("Taker" order) incurs NO broker fee!
   *    - Broker fee only applies if posting a limit Buy order ("Maker").
   *    - By default, inter-regional haul arbitrage executes as a Taker on the source hub:
   *      Buy Broker Fee = 0.
   *
   * 2. Transport Logistics:
   *    - If enable_transport_costs is false or rates are 0, transport cost is strictly 0.00 ISK.
   *    - Otherwise, volumetric cost (m³ * ISK/m³) + jump cost.
   *    - Total acquisition cost = Purchase Cost + Buy Broker Fee + Transport Cost.
   *
   * 3. Revenue & Exit Phase (Destination Hub):
   *    - Strategy 'immediate':
   *      - Taker sell into existing buy orders.
   *      - CCP Sales Tax applies to seller. NO broker fee (taker).
   *    - Strategy 'relist':
   *      - Maker sell order posted on destination market.
   *      - CCP Sales Tax applies upon sale + Broker Fee for posting the order.
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
    const q = Math.max(0, Math.floor(quantity));
    const purchaseCost = buyExecution.effective_price * q;

    // EVE Market Mechanics:
    // Buying from sell orders = Taker (0% broker fee).
    // If explicitly configured as Maker buy, then broker_fee applies.
    const buyBrokerFee = isBuyMaker ? purchaseCost * config.broker_fee : 0.0;

    // Transport logistics: strictly 0 if disabled or rates are 0
    const totalCargoVolume = q * unitVolume;
    const transportCost = FeeEngine.calculateTransportCost(
      config,
      totalCargoVolume,
      route.jumps,
      purchaseCost
    );

    const totalAcquisitionCost = purchaseCost + buyBrokerFee + transportCost;

    // Revenue calculation
    const grossRevenue = sellExecution.effective_price * q;
    const salesTaxRate = config.sales_tax !== undefined ? config.sales_tax : FeeEngine.calculateSalesTaxRate(config.accounting_level ?? 5);
    const salesTax = grossRevenue * salesTaxRate;

    // Sell broker fee applies when relisting (posting a new sell order as a Maker)
    const brokerFeeRate = config.broker_fee !== undefined ? config.broker_fee : FeeEngine.calculateNpcBrokerFeeRate(config.broker_relations_level ?? 5, config.faction_standing ?? 0, config.corp_standing ?? 0);
    const sellBrokerFee = strategy === 'relist' ? grossRevenue * brokerFeeRate : 0.0;
    const totalExitFees = salesTax + sellBrokerFee;

    const netRevenue = grossRevenue - totalExitFees;
    const netProfit = netRevenue - totalAcquisitionCost;

    const profitPerUnit = q > 0 ? netProfit / q : 0.0;
    const roi = totalAcquisitionCost > 0 ? netProfit / totalAcquisitionCost : 0.0;
    const margin = grossRevenue > 0 ? netProfit / grossRevenue : 0.0;

    return {
      purchase_cost: purchaseCost,
      buy_broker_fee: buyBrokerFee,
      transport_cost: transportCost,
      total_acquisition_cost: totalAcquisitionCost,
      gross_revenue: grossRevenue,
      sales_tax: salesTax,
      sell_broker_fee: sellBrokerFee,
      total_exit_fees: totalExitFees,
      net_revenue: netRevenue,
      net_profit: netProfit,
      profit_per_unit: profitPerUnit,
      roi: roi,
      margin: margin,
      capital_locked: totalAcquisitionCost,
    };
  }

  /**
   * Calculates the maximum tradable quantity respecting four core constraints:
   * 1. Available Capital (and user capital limit per trade)
   * 2. Cargo Capacity (m³)
   * 3. Source Market Available Volume
   * 4. Destination Market Depth (or daily absorption capacity if relist)
   */
  static determineTradableQuantity(
    unitBuyPrice: number,
    unitVolume: number,
    sourceAvailableVolume: number,
    destinationAbsorptionVolume: number,
    route: JumpRoute,
    config: FinancialConfig
  ): {
    quantity: number;
    bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market';
    totalCargoVolume: number;
  } {
    // 1. Capital constraint (taking into account unit cost + volumetric freight if enabled)
    const maxCapitalToUse = Math.min(config.available_capital, config.max_capital_per_trade);
    const transportPerUnit =
      config.enable_transport_costs !== false
        ? (unitVolume * (config.transport_cost_per_m3 || 0))
        : 0;
    const unitEstCost = unitBuyPrice + transportPerUnit;
    const capitalQuantity = unitEstCost > 0 ? Math.floor(maxCapitalToUse / unitEstCost) : 0;

    // 2. Cargo constraint
    const cargoQuantity = unitVolume > 0 ? Math.floor(config.max_cargo_m3 / unitVolume) : 999999999;

    // 3. Source & Destination market depth constraints
    const sourceQty = Math.max(0, sourceAvailableVolume);
    const destQty = Math.max(0, destinationAbsorptionVolume);

    const minQty = Math.min(capitalQuantity, cargoQuantity, sourceQty, destQty);
    const finalQty = Math.max(0, minQty);

    let bottleneck: 'capital' | 'cargo' | 'source_market' | 'destination_market' = 'capital';
    if (finalQty === cargoQuantity && cargoQuantity < capitalQuantity) bottleneck = 'cargo';
    else if (finalQty === sourceQty && sourceQty < capitalQuantity) bottleneck = 'source_market';
    else if (finalQty === destQty && destQty < capitalQuantity) bottleneck = 'destination_market';

    return {
      quantity: finalQty,
      bottleneck,
      totalCargoVolume: finalQty * unitVolume,
    };
  }

  /**
   * Single directed opportunity calculator (Hub A -> Hub B)
   */
  static calculateOpportunity(
    item: EveTypeDetail,
    buyHub: MarketHub,
    sellHub: MarketHub,
    strategy: TradeStrategy,
    config: FinancialConfig,
    buyRegionOrders: RawMarketOrder[] = [],
    sellRegionOrders: RawMarketOrder[] = [],
    historyStatsByRegion: Record<number, HistoricalStats> = {}
  ): InterRegionalOpportunity | null {
    if (buyHub.id === sellHub.id) return null;

    // Filter source sell orders located AT buyHub station
    const sourceSellOrders = this.filterAccessibleOrdersForHub(buyRegionOrders, buyHub, true, false);
    const sourceLadders = PriceLadder.aggregate(sourceSellOrders, false);
    if (sourceLadders.length === 0) return null;

    let destLadders: PriceLevel[] = [];
    if (strategy === 'relist') {
      const destSellOrders = this.filterAccessibleOrdersForHub(sellRegionOrders, sellHub, false, false);
      const lowestDestSell = PriceLadder.aggregate(destSellOrders, false);
      if (lowestDestSell.length > 0) {
        const relistPrice = Math.max(0.01, lowestDestSell[0].price - 0.01);
        const histDest = historyStatsByRegion[sellHub.region_id];
        const absorbVol = Math.max(10, histDest?.daily_volume_7d_median || 500);
        destLadders = [{ price: relistPrice, volume: absorbVol, orders: 1, cumulative: absorbVol }];
      }
    } else {
      const destBuyOrders = this.filterAccessibleOrdersForHub(sellRegionOrders, sellHub, false, true);
      destLadders = PriceLadder.aggregate(destBuyOrders, true);
    }

    if (destLadders.length === 0) return null;

    const bestSourceSellPrice = sourceLadders[0].price;
    const bestDestSellTargetPrice = destLadders[0].price;

    if (bestDestSellTargetPrice <= bestSourceSellPrice) return null;

    const totalSourceVolume = sourceLadders.reduce((acc, l) => acc + l.volume, 0);
    const totalDestVolume = destLadders.reduce((acc, l) => acc + l.volume, 0);

    const route = getJumpRoute(buyHub.system_id, sellHub.system_id);

    const { quantity, bottleneck, totalCargoVolume } = this.determineTradableQuantity(
      bestSourceSellPrice,
      item.volume,
      totalSourceVolume,
      totalDestVolume,
      route,
      config
    );

    if (quantity <= 0) return null;

    const buyFill = this.simulateFill(sourceLadders, quantity);
    const sellFill = this.simulateFill(destLadders, quantity);

    if (buyFill.filled_quantity <= 0 || sellFill.filled_quantity <= 0) return null;

    const actualQuantity = Math.min(buyFill.filled_quantity, sellFill.filled_quantity);
    const costs = this.computeCostsAndProfit(
      buyFill,
      sellFill,
      actualQuantity,
      item.volume,
      route,
      strategy,
      config
    );

    const destHistory = historyStatsByRegion[sellHub.region_id];
    const dailyDestVol = destHistory?.daily_volume_7d_median || Math.max(1, totalDestVolume * 0.5);

    const liquidityMetrics = {
      buy_hub_depth_volume: totalSourceVolume,
      sell_hub_depth_volume: totalDestVolume,
      daily_volume_source: historyStatsByRegion[buyHub.region_id]?.daily_volume_7d_median || totalSourceVolume,
      daily_volume_dest: dailyDestVol,
      turnover_ratio: dailyDestVol > 0 ? quantity / dailyDestVol : 1,
      expected_days_to_sell: dailyDestVol > 0 ? Math.max(0.2, quantity / dailyDestVol) : 7,
      volume_exhaustion_pct: totalSourceVolume > 0 ? (quantity / totalSourceVolume) * 100 : 100,
    };

    const evaluation = OpportunityScoringEngine.evaluate(
      costs,
      liquidityMetrics,
      destHistory,
      route.jumps,
      route.is_highsec_only,
      config
    );

    const group = EVE_GROUPS.find((g) => g.group_id === item.group_id);
    const category = EVE_CATEGORIES.find((c) => c.category_id === item.category_id);

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
      top_of_book_buy_price: bestSourceSellPrice,
      top_of_book_sell_price: bestDestSellTargetPrice,
      spread_pct: bestSourceSellPrice > 0 ? (bestDestSellTargetPrice - bestSourceSellPrice) / bestSourceSellPrice : 0,
      quantity_tradable: actualQuantity,
      bottleneck,
      total_cargo_volume: totalCargoVolume,
      costs,
      capturable_profit: evaluation.capturableProfit,
      profit_per_day: evaluation.profitPerDay,
      expected_days_to_sell: evaluation.expectedDaysToSell,
      liquidity: liquidityMetrics,
      history: destHistory,
      scores: evaluation.scores,
      jita_price_benchmark: {
        jita_sell_price: bestSourceSellPrice,
        jita_buy_price: bestDestSellTargetPrice,
        buy_vs_jita_pct: 0,
        sell_vs_jita_pct: 0,
        is_jita_verified: true,
        reliability_assessment: 'Direct hub trade',
      },
      is_anomalous: evaluation.isAnomalous,
      anomaly_reasons: evaluation.anomalyReasons,
      rejection_reasons: evaluation.rejectionReasons,
      is_viable: evaluation.isViable,
      detected_at: new Date().toISOString(),
    };
  }
}

