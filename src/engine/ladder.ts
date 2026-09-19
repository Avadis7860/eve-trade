import { PriceLevel, Fill } from '../types';

export type PriceVolume = [number, number];

export class PriceLadder {
  /**
   * Group orders by price, summing volume_remaining; sort best-first.
   * descending=true => highest price first (best for buy side / disposal)
   * descending=false => lowest price first (best for sell side / acquisition)
   */
  static aggregate(orders: PriceVolume[], descending: boolean = false): PriceLevel[] {
    const volumes = new Map<number, number>();
    const counts = new Map<number, number>();

    for (const [price, vol] of orders) {
      if (vol <= 0) continue;
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
}
