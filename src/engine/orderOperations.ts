import type { EveCharacterOrder } from '../types/character';
import type { RawMarketOrder } from '../types/market';

/** Structural timing semantics used by Operations. No financial prediction is introduced here. */
export const ORDER_AGEING_RISK_REMAINING_RATIO = 0.2;

export interface OrderTiming {
  issuedAtMs: number;
  durationMs: number;
  expiresAtMs: number;
  ageMs: number;
  remainingMs: number;
  fillRatio: number;
  remainingRatio: number;
  isAgeingRisk: boolean;
}

export interface OrderMarketDistance {
  referencePrice?: number;
  distancePct?: number;
}

export function getOrderTiming(order: EveCharacterOrder, nowMs: number = Date.now()): OrderTiming {
  const issuedAtMs = new Date(order.issued).getTime();
  const durationMs = Math.max(0, order.duration * 86_400_000);
  const expiresAtMs = Number.isFinite(issuedAtMs) ? issuedAtMs + durationMs : nowMs;
  const ageMs = Math.max(0, nowMs - (Number.isFinite(issuedAtMs) ? issuedAtMs : nowMs));
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const remainingRatio = durationMs > 0 ? remainingMs / durationMs : 0;
  const fillRatio = Math.max(
    0,
    Math.min(1, 1 - order.volume_remain / Math.max(1, order.volume_total)),
  );

  return {
    issuedAtMs: Number.isFinite(issuedAtMs) ? issuedAtMs : nowMs,
    durationMs,
    expiresAtMs,
    ageMs,
    remainingMs,
    fillRatio,
    remainingRatio,
    isAgeingRisk:
      durationMs === 0 || remainingRatio <= ORDER_AGEING_RISK_REMAINING_RATIO,
  };
}

/**
 * Display convention already used by Operations:
 * escrow for buys, remaining order value for sells.
 * For sell orders this is exposure/value, not realized accounting capital.
 */
export function getOrderLockedValue(order: EveCharacterOrder): number {
  if (order.is_buy_order) {
    return order.escrow ?? (order.price * order.volume_remain);
  }
  return order.price * order.volume_remain;
}

/**
 * Compare an active order with the best competing same-side price in its type/region.
 * Null means the current observed order book contains no comparable competitor.
 */
export function getOrderMarketDistance(
  order: EveCharacterOrder,
  marketOrders: RawMarketOrder[],
): OrderMarketDistance | null {
  const competing = marketOrders.filter(
    (marketOrder) =>
      marketOrder.type_id === order.type_id &&
      marketOrder.is_buy_order === order.is_buy_order &&
      marketOrder.order_id !== order.order_id &&
      marketOrder.price > 0,
  );

  if (competing.length === 0) return null;

  const referencePrice = order.is_buy_order
    ? Math.max(...competing.map((entry) => entry.price))
    : Math.min(...competing.map((entry) => entry.price));

  if (!(referencePrice > 0)) return { referencePrice };

  return {
    referencePrice,
    distancePct: ((order.price - referencePrice) / referencePrice) * 100,
  };
}
