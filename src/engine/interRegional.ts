import {
  TradeStrategy,
  FinancialConfig,
  PriceLevel,
  ExecutionFill,
  TradeCostBreakdown,
  JumpRoute,
} from '../types';
import { FeeCalculator } from './fee';

export class InterRegionalFinancialEngine {
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
    const transportCost = FeeCalculator.calculateTransportCost(
      config,
      totalCargoVolume,
      route.jumps,
      purchaseCost
    );

    const totalAcquisitionCost = purchaseCost + buyBrokerFee + transportCost;

    // Revenue calculation
    const grossRevenue = sellExecution.effective_price * q;
    const salesTax = grossRevenue * config.sales_tax;

    // Sell broker fee applies when relisting (posting a new sell order as a Maker)
    const sellBrokerFee = strategy === 'relist' ? grossRevenue * config.broker_fee : 0.0;
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
}
