import { PriceLevel, Fill, RawMarketOrder, ExecutionFill, ExecutionLevelConsumption } from '../types';
import { roundIsk, safeDiv } from './money';
import type { OrderId } from '../types/order';

export type PriceVolume = [number, number];

export interface LadderExecutionResult {
  fulfilled_quantity: number;
  effective_average_price: number;
  top_of_book_price: number;
  total_gross_value: number;
  slippage_amount: number;
  slippage_percent: number;
  levels_consumed: number;
  levels: PriceLevel[];
  remaining_book_liquidity?: number;
  levels_consumed_detail?: ExecutionLevelConsumption[];
}

export class PriceLadderEngine {
  /**
   * Group orders by price, summing volume_remaining; sort best-first.
   * Accepts either [price, volume] tuples or RawMarketOrder objects.
   * descending=true => highest price first (best for buy side / taker selling)
   * descending=false => lowest price first (best for sell side / taker buying)
   *
   * Preserves audit metadata: order_ids, location_ids, min_volume_max.
   */
  static aggregate(orders: (PriceVolume | RawMarketOrder)[], descending: boolean = false): PriceLevel[] {
    const volumes = new Map<number, number>();
    const counts = new Map<number, number>();
    const orderIds = new Map<number, OrderId[]>();
    const locationIds = new Map<number, number[]>();
    const minVols = new Map<number, number>();

    for (const item of orders) {
      let price: number;
      let vol: number;
      let orderId: OrderId | undefined;
      let locId: number | undefined;
      let minVol: number | undefined;

      if (Array.isArray(item)) {
        price = item[0];
        vol = item[1];
      } else {
        price = item.price;
        vol = item.volume_remain;
        orderId = item.order_id;
        locId = item.location_id;
        minVol = item.min_volume;
      }

      if (vol <= 0 || price <= 0 || !isFinite(price) || !isFinite(vol)) continue;

      // Round price key to 2 decimal places to avoid floating point grouping issues
      const normalizedPrice = roundIsk(price);
      volumes.set(normalizedPrice, (volumes.get(normalizedPrice) || 0) + vol);
      counts.set(normalizedPrice, (counts.get(normalizedPrice) || 0) + 1);

      if (orderId !== undefined) {
        const ids = orderIds.get(normalizedPrice) || [];
        ids.push(orderId);
        orderIds.set(normalizedPrice, ids);
      }

      if (locId !== undefined) {
        const locs = locationIds.get(normalizedPrice) || [];
        if (!locs.includes(locId)) locs.push(locId);
        locationIds.set(normalizedPrice, locs);
      }

      if (minVol !== undefined && minVol > 0) {
        const curMin = minVols.get(normalizedPrice) || 0;
        minVols.set(normalizedPrice, Math.max(curMin, minVol));
      }
    }

    const sortedEntries = Array.from(volumes.entries()).sort((a, b) => {
      return descending ? b[0] - a[0] : a[0] - b[0];
    });

    const result: PriceLevel[] = [];
    let cumulative = 0;

    for (const [price, vol] of sortedEntries) {
      cumulative += vol;
      result.push({
        price,
        volume: vol,
        orders: counts.get(price) || 1,
        cumulative,
        order_ids: orderIds.get(price),
        location_ids: locationIds.get(price),
        min_volume_max: minVols.get(price),
      });
    }

    return result;
  }

  static bestPrice(levels: PriceLevel[]): number | null {
    return levels.length > 0 ? levels[0].price : null;
  }

  /**
   * Fast fill helper matching basic Fill interface
   */
  static fill(levels: PriceLevel[], quantity: number): Fill {
    const sim = this.simulateExecution(levels, quantity, false);
    return {
      filled_quantity: sim.filled_quantity,
      effective_price: sim.effective_price,
      levels_used: sim.levels_exhausted,
    };
  }

  /**
   * Rigorous Execution Simulation across order book levels.
   * @param levels Aggregated PriceLevels (sorted best-first)
   * @param targetQuantity Target quantity to execute
   * @param isBuySide True if disposing into Buy Orders (descending), False if taking from Sell Orders (ascending)
   */
  static simulateExecution(
    levels: PriceLevel[],
    targetQuantity: number,
    isBuySide: boolean = false
  ): ExecutionFill {
    const totalBookVolume = levels.reduce((sum, l) => sum + l.volume, 0);
    const topOfBookPrice = levels.length > 0 ? levels[0].price : 0.0;

    if (levels.length === 0 || targetQuantity <= 0 || !isFinite(targetQuantity)) {
      return {
        requested_quantity: Math.max(0, Math.floor(targetQuantity || 0)),
        filled_quantity: 0,
        effective_price: 0,
        top_of_book_price: topOfBookPrice,
        total_cost_or_revenue: 0,
        slippage_pct: 0,
        slippage_isk: 0,
        levels_exhausted: 0,
        remaining_book_liquidity: totalBookVolume,
        levels_consumed_detail: [],
      };
    }

    let remaining = Math.max(0, Math.floor(targetQuantity));
    let totalSpentOrEarned = 0.0;
    let levelsUsed = 0;
    const consumedDetail: ExecutionLevelConsumption[] = [];

    for (const lvl of levels) {
      if (remaining <= 0) break;

      // In EVE Online, selling to a buy order with min_volume > total available transaction is rejected
      if (isBuySide && lvl.min_volume_max && lvl.min_volume_max > targetQuantity) {
        continue;
      }

      const take = Math.min(remaining, lvl.volume);
      totalSpentOrEarned += take * lvl.price;
      remaining -= take;
      levelsUsed += 1;

      consumedDetail.push({
        price: lvl.price,
        volume_taken: take,
        volume_available_at_level: lvl.volume,
        orders_at_level: lvl.orders,
      });
    }

    const filled = Math.max(0, Math.floor(targetQuantity) - remaining);
    const avgPrice = filled > 0 ? roundIsk(totalSpentOrEarned / filled) : 0.0;
    const remainingLiquidity = Math.max(0, totalBookVolume - filled);

    // Slippage calculation:
    // When buying from sell ladder: higher avg price than top of book is positive slippage (unfavorable)
    // When selling into buy ladder: lower avg price than top of book is positive slippage (unfavorable)
    let slippageIsk = 0.0;
    if (filled > 0 && topOfBookPrice > 0) {
      if (isBuySide) {
        // Selling into buy orders
        slippageIsk = Math.max(0, topOfBookPrice - avgPrice);
      } else {
        // Buying from sell orders
        slippageIsk = Math.max(0, avgPrice - topOfBookPrice);
      }
    }
    const slippagePct = safeDiv(slippageIsk, topOfBookPrice, 0.0);

    return {
      requested_quantity: Math.floor(targetQuantity),
      filled_quantity: filled,
      effective_price: avgPrice,
      top_of_book_price: topOfBookPrice,
      total_cost_or_revenue: roundIsk(totalSpentOrEarned),
      slippage_pct: slippagePct,
      slippage_isk: roundIsk(slippageIsk),
      levels_exhausted: levelsUsed,
      remaining_book_liquidity: remainingLiquidity,
      levels_consumed_detail: consumedDetail,
    };
  }

  /**
   * Full execution simulation for buying from sell orders (Taker Buy)
   */
  static buildBuyLadder(orders: (PriceVolume | RawMarketOrder)[], requestedQuantity: number): LadderExecutionResult {
    const levels = this.aggregate(orders, false); // Lowest sell price first
    const sim = this.simulateExecution(levels, requestedQuantity, false);

    return {
      fulfilled_quantity: sim.filled_quantity,
      effective_average_price: sim.effective_price,
      top_of_book_price: sim.top_of_book_price || (levels.length > 0 ? levels[0].price : 0),
      total_gross_value: sim.total_cost_or_revenue,
      slippage_amount: sim.slippage_isk || 0,
      slippage_percent: (sim.slippage_pct || 0) * 100,
      levels_consumed: sim.levels_exhausted,
      levels,
      remaining_book_liquidity: sim.remaining_book_liquidity,
      levels_consumed_detail: sim.levels_consumed_detail,
    };
  }

  /**
   * Full execution simulation for selling into buy orders (Taker Sell)
   */
  static buildSellLadder(orders: (PriceVolume | RawMarketOrder)[], requestedQuantity: number): LadderExecutionResult {
    const levels = this.aggregate(orders, true); // Highest buy price first
    const sim = this.simulateExecution(levels, requestedQuantity, true);

    return {
      fulfilled_quantity: sim.filled_quantity,
      effective_average_price: sim.effective_price,
      top_of_book_price: sim.top_of_book_price || (levels.length > 0 ? levels[0].price : 0),
      total_gross_value: sim.total_cost_or_revenue,
      slippage_amount: sim.slippage_isk || 0,
      slippage_percent: (sim.slippage_pct || 0) * 100,
      levels_consumed: sim.levels_exhausted,
      levels,
      remaining_book_liquidity: sim.remaining_book_liquidity,
      levels_consumed_detail: sim.levels_consumed_detail,
    };
  }
}

export const PriceLadder = PriceLadderEngine;


