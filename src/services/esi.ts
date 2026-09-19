import { RawMarketOrder } from '../types';

export interface EsiMarketOrder {
  order_id: number;
  type_id: number;
  region_id?: number;
  system_id: number;
  location_id: number;
  price: number;
  volume_remain: number;
  volume_total: number;
  is_buy_order: boolean;
  range?: string;
  issued: string;
  duration: number;
}

export class EsiService {
  private static BASE_URL = 'https://esi.evetech.net/latest';

  /**
   * Fetch live market orders for a given region and type from EVE ESI.
   */
  static async fetchLiveOrders(regionId: number, typeId: number): Promise<RawMarketOrder[]> {
    const url = `${this.BASE_URL}/markets/${regionId}/orders/?datasource=tranquility&order_type=all&type_id=${typeId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'eve-trade/0.1 (+https://github.com/avadis/eve-trade)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`ESI returned status ${response.status}: ${response.statusText}`);
      }

      const orders: EsiMarketOrder[] = await response.json();
      const now = new Date().toISOString();

      return orders.map((o) => ({
        order_id: o.order_id,
        type_id: o.type_id || typeId,
        region_id: regionId,
        system_id: o.system_id,
        location_id: o.location_id,
        price: o.price,
        volume_remain: o.volume_remain,
        volume_total: o.volume_total,
        is_buy_order: o.is_buy_order,
        order_range: o.range,
        issued: o.issued,
        duration: o.duration,
        captured_at: now,
      }));
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  /**
   * Resolve type name from ESI.
   */
  static async resolveTypeName(typeId: number): Promise<string | null> {
    try {
      const res = await fetch(`${this.BASE_URL}/universe/types/${typeId}/?datasource=tranquility`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.name || null;
    } catch {
      return null;
    }
  }
}
