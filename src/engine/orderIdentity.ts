import type { OrderId } from '../types/order';

/**
 * Canonicalizes an EVE order identifier at an application boundary.
 *
 * String input is preferred because it can preserve a full JSON integer.
 * Numeric input is accepted only when it is a safe positive integer.
 * Unsafe numeric values fail closed because precision may already have been
 * lost by JSON parsing before reaching this function.
 */
export function normalizeOrderId(value: unknown): OrderId | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;

    try {
      const normalized = BigInt(trimmed);
      return normalized > 0n ? normalized.toString() : null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }

  return null;
}

/** Deterministic numeric ordering without converting IDs through Number(). */
export function compareOrderIds(a: OrderId, b: OrderId): number {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
