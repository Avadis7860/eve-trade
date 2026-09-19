import { PriceLevel, Fill, RawMarketOrder } from '../types';

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
}

export class PriceLadderEngine {
  /**
   * Group orders by price, summing volume_remaining; sort best-first.
   * Accepts either [price, volume] tuples or RawMarketOrder objects.
   * descending=true => highest price first (best for buy side / disposal)
   * descending=false => lowest price first (best for sell side / acquisition)
   */
  static aggregate(orders: (PriceVolume | RawMarketOrder)[], descending: boolean = false): PriceLevel[] {
    const volumes = new Map<number, number>();
    const counts = new Map<number, number>();

    for (const item of orders) {
      let price: number;
      let vol: number;
      if (Array.isArray(item)) {
        price = item[0];
        vol = item[1];
      } else {
        price = item.price;
        vol = item.volume_remain;
      }
      if (vol <= 0 || price <= 0) continue;
      volumes.set(price, (volumes.get(price) || 0) + vol);
      counts.set(price, (counts.get(price) || 0) + 1);
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
      });
    }

    return result;
  }

  static bestPrice(levels: PriceLevel[]): number | null {
    return levels.length > 0 ? levels[0].price : null;
  }

  static fill(levels: PriceLevel[], quantity: number): Fill {
    let remaining = Math.max(0, Math.floor(quantity));
    let spent = 0.0;
    let used = 0;

    for (const lv of levels) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lv.volume);
      spent += take * lv.price;
      remaining -= take;
      used += 1;
    }

    const filled = quantity > 0 ? Math.floor(quantity) - remaining : 0;
    const avg = filled > 0 ? spent / filled : 0.0;

    return {
      filled_quantity: filled,
      effective_price: avg,
      levels_used: used,
    };
  }

  /**
   * Full execution simulation for buying from sell orders
   */
  static buildBuyLadder(orders: (PriceVolume | RawMarketOrder)[], requestedQuantity: number): LadderExecutionResult {
    const levels = this.aggregate(orders, false); // Lowest sell price first
    if (levels.length === 0 || requestedQuantity <= 0) {
      return {
        fulfilled_quantity: 0,
        effective_average_price: 0,
        top_of_book_price: levels.length > 0 ? levels[0].price : 0,
        total_gross_value: 0,
        slippage_amount: 0,
        slippage_percent: 0,
        levels_consumed: 0,
        levels,
      };
    }

    const fillResult = this.fill(levels, requestedQuantity);
    const topOfBook = levels[0].price;
    const slippageAmount = Math.max(0, fillResult.effective_price - topOfBook);
    const slippagePct = topOfBook > 0 ? (slippageAmount / topOfBook) * 100 : 0;

    return {
      fulfilled_quantity: fillResult.filled_quantity,
      effective_average_price: fillResult.effective_price,
      top_of_book_price: topOfBook,
      total_gross_value: fillResult.filled_quantity * fillResult.effective_price,
      slippage_amount: slippageAmount,
      slippage_percent: slippagePct,
      levels_consumed: fillResult.levels_used,
      levels,
    };
  }

  /**
   * Full execution simulation for selling into buy orders
   */
  static buildSellLadder(orders: (PriceVolume | RawMarketOrder)[], requestedQuantity: number): LadderExecutionResult {
    const levels = this.aggregate(orders, true); // Highest buy price first
    if (levels.length === 0 || requestedQuantity <= 0) {
      return {
        fulfilled_quantity: 0,
        effective_average_price: 0,
        top_of_book_price: levels.length > 0 ? levels[0].price : 0,
        total_gross_value: 0,
        slippage_amount: 0,
        slippage_percent: 0,
        levels_consumed: 0,
        levels,
      };
    }

    const fillResult = this.fill(levels, requestedQuantity);
    const topOfBook = levels[0].price;
    const slippageAmount = Math.max(0, topOfBook - fillResult.effective_price);
    const slippagePct = topOfBook > 0 ? (slippageAmount / topOfBook) * 100 : 0;

    return {
      fulfilled_quantity: fillResult.filled_quantity,
      effective_average_price: fillResult.effective_price,
      top_of_book_price: topOfBook,
      total_gross_value: fillResult.filled_quantity * fillResult.effective_price,
      slippage_amount: slippageAmount,
      slippage_percent: slippagePct,
      levels_consumed: fillResult.levels_used,
      levels,
    };
  }
}

export const PriceLadder = PriceLadderEngine;

