/**
 * EVE Trade — Phase 2B: Execution Outcome Engine (Chantier 1)
 *
 * Pure, deterministic mathematical engine for measuring real trader execution outcomes.
 * Decoupled from correlation, persistence, ESI network calls, and UI state.
 *
 * INVARIANTS:
 * 1. Pure functions: no side effects, no Date.now(), no external dependencies.
 * 2. Strict non-negative inventory: remaining_inventory_quantity >= 0 at all times.
 * 3. Division by zero protection: no NaN, no Infinity.
 * 4. Immutable contract: inputs are never mutated, outputs are frozen.
 * 5. Deterministic calculation: input A -> output A every time.
 */

import {
  ExecutionStatus,
  CorrelationMatchLevel,
  ExecutionTransactionRef,
  OpportunityExecutionOutcome,
  ExecutionOutcomeCalculationOptions,
} from '../types';

/**
 * Calculates Volume-Weighted Average Price (VWAP) for a collection of transactions.
 *
 * Formula:
 *   VWAP = Σ(quantity × unit_price) / Σ(quantity)
 *
 * Edge cases:
 * - Empty array -> null
 * - Total quantity <= 0 -> null
 * - Non-finite price or quantity -> safely filtered out
 *
 * @param transactions Readonly list of execution transaction references
 * @returns VWAP as a finite positive number, or null if no valid volume exists
 */
export function calculateVwap(
  transactions: readonly ExecutionTransactionRef[]
): number | null {
  if (!transactions || transactions.length === 0) {
    return null;
  }

  let totalCost = 0;
  let totalQuantity = 0;

  for (const tx of transactions) {
    if (
      typeof tx.quantity === 'number' &&
      Number.isFinite(tx.quantity) &&
      tx.quantity > 0 &&
      typeof tx.unit_price === 'number' &&
      Number.isFinite(tx.unit_price) &&
      tx.unit_price >= 0
    ) {
      totalCost += tx.quantity * tx.unit_price;
      totalQuantity += tx.quantity;
    }
  }

  if (totalQuantity <= 0) {
    return null;
  }

  const vwap = totalCost / totalQuantity;
  return Number.isFinite(vwap) ? vwap : null;
}

/**
 * Extracts earliest and latest timestamp bounds from transactions.
 * Pure and deterministic: timestamps are derived strictly from provided records.
 *
 * Invariant: first_at <= last_at when both exist.
 *
 * @param transactions Readonly list of execution transaction references
 * @returns Object with first_at and last_at ISO strings, or null if empty
 */
export function extractTransactionTimestampBounds(
  transactions: readonly ExecutionTransactionRef[]
): {
  readonly first_at: string | null;
  readonly last_at: string | null;
} {
  if (!transactions || transactions.length === 0) {
    return { first_at: null, last_at: null };
  }

  const validTimestamps = transactions
    .map((t) => t.timestamp)
    .filter((ts): ts is string => typeof ts === 'string' && ts.trim().length > 0);

  if (validTimestamps.length === 0) {
    return { first_at: null, last_at: null };
  }

  // Pure sort without mutating original list
  const sorted = [...validTimestamps].sort((a, b) => {
    const timeA = Date.parse(a);
    const timeB = Date.parse(b);
    if (!Number.isNaN(timeA) && !Number.isNaN(timeB)) {
      return timeA - timeB;
    }
    return a.localeCompare(b);
  });

  return {
    first_at: sorted[0],
    last_at: sorted[sorted.length - 1],
  };
}

/**
 * Determines the execution lifecycle status based strictly on planned quantity
 * and executed buy/sell volume.
 *
 * Lifecycle Transitions:
 * - 0 bought, 0 sold -> PLANNED
 * - bought > 0, bought < planned, 0 sold -> BUY_PARTIAL
 * - bought >= planned, 0 sold -> BUY_FILLED
 * - sold > 0, sold < bought -> SELL_PARTIAL
 * - sold >= bought, bought > 0 -> CLOSED
 * - forced status (e.g. ABANDONED, AMBIGUOUS) overrides automatic derivation
 */
export function determineExecutionStatus(
  plannedQuantity: number,
  executedBuyQuantity: number,
  executedSellQuantity: number,
  forcedStatus?: ExecutionStatus
): ExecutionStatus {
  if (forcedStatus) {
    return forcedStatus;
  }

  // 1. Zero execution
  if (executedBuyQuantity === 0 && executedSellQuantity === 0) {
    return 'PLANNED';
  }

  // 2. All bought units have been completely sold
  if (executedBuyQuantity > 0 && executedSellQuantity >= executedBuyQuantity) {
    return 'CLOSED';
  }

  // 3. Selling has begun but inventory remains
  if (executedSellQuantity > 0) {
    return 'SELL_PARTIAL';
  }

  // 4. Buying phase (executedSellQuantity === 0)
  if (plannedQuantity > 0) {
    if (executedBuyQuantity >= plannedQuantity) {
      return 'BUY_FILLED';
    }
    return 'BUY_PARTIAL';
  }

  // If plannedQuantity is 0 or unconstrained, any buy fill is treated as filled
  return executedBuyQuantity > 0 ? 'BUY_FILLED' : 'PLANNED';
}

/**
 * Main pure entry point for Phase 2B Execution Outcome Tracking.
 *
 * Computes execution volume, fill ratios, VWAPs, inventory, timestamps, and status
 * with zero side-effects and absolute mathematical guarantees.
 *
 * @param plannedQuantity Target tradable quantity planned for the opportunity
 * @param buyTransactions Readonly list of buy transactions
 * @param sellTransactions Readonly list of sell transactions
 * @param options Optional calculation parameters (match level, force status, linked order ids)
 * @returns Fully populated, immutable OpportunityExecutionOutcome
 */
export function calculateExecutionOutcome(
  plannedQuantity: number,
  buyTransactions: readonly ExecutionTransactionRef[] = [],
  sellTransactions: readonly ExecutionTransactionRef[] = [],
  options?: ExecutionOutcomeCalculationOptions
): OpportunityExecutionOutcome {
  const safePlannedQuantity = Math.max(0, Number.isFinite(plannedQuantity) ? plannedQuantity : 0);

  // 1. Calculate executed buy quantity
  let executedBuyQuantity = 0;
  for (const tx of buyTransactions) {
    if (typeof tx.quantity === 'number' && Number.isFinite(tx.quantity) && tx.quantity > 0) {
      executedBuyQuantity += tx.quantity;
    }
  }

  // 2. Calculate executed sell quantity
  let executedSellQuantity = 0;
  for (const tx of sellTransactions) {
    if (typeof tx.quantity === 'number' && Number.isFinite(tx.quantity) && tx.quantity > 0) {
      executedSellQuantity += tx.quantity;
    }
  }

  // 3. Inventory calculation with strict non-negative invariant
  let remainingInventory = 0;
  let hasInventoryInconsistency = false;
  const inconsistencyReasons: string[] = [];

  if (executedSellQuantity > executedBuyQuantity) {
    remainingInventory = 0; // Invariant: no negative inventory
    hasInventoryInconsistency = true;
    inconsistencyReasons.push(
      `Sold quantity (${executedSellQuantity}) exceeds bought quantity (${executedBuyQuantity})`
    );
  } else {
    remainingInventory = executedBuyQuantity - executedSellQuantity;
  }

  // 4. Fill ratios with division-by-zero protection
  const buyFillRatio = safePlannedQuantity > 0 ? executedBuyQuantity / safePlannedQuantity : 0;
  const sellFillRatio = safePlannedQuantity > 0 ? executedSellQuantity / safePlannedQuantity : 0;

  // 5. VWAPs
  const vwapBuyPrice = calculateVwap(buyTransactions);
  const vwapSellPrice = calculateVwap(sellTransactions);

  // 6. Timestamps
  const buyBounds = extractTransactionTimestampBounds(buyTransactions);
  const sellBounds = extractTransactionTimestampBounds(sellTransactions);

  // 7. Status & Match Level
  const executionStatus = determineExecutionStatus(
    safePlannedQuantity,
    executedBuyQuantity,
    executedSellQuantity,
    options?.force_status
  );

  const matchLevel: CorrelationMatchLevel =
    options?.match_level ??
    (buyTransactions.length === 0 && sellTransactions.length === 0 ? 'UNMATCHED' : 'DIRECT_MATCH');

  // 8. Collect linked order IDs
  const orderIdSet = new Set<number>();
  if (options?.linked_order_ids) {
    for (const id of options.linked_order_ids) {
      if (typeof id === 'number' && Number.isFinite(id)) {
        orderIdSet.add(id);
      }
    }
  }
  for (const tx of buyTransactions) {
    if (typeof tx.order_id === 'number' && Number.isFinite(tx.order_id)) {
      orderIdSet.add(tx.order_id);
    }
  }
  for (const tx of sellTransactions) {
    if (typeof tx.order_id === 'number' && Number.isFinite(tx.order_id)) {
      orderIdSet.add(tx.order_id);
    }
  }
  const linkedOrderIds = Object.freeze(Array.from(orderIdSet).sort((a, b) => a - b));

  // 9. Candidate observation IDs
  const candidateObservationIds = Object.freeze(
    options?.candidate_observation_ids
      ? Array.from(new Set(options.candidate_observation_ids))
      : []
  );

  // 10. Copy and freeze transaction lists (ensure immutability)
  const frozenBuyTransactions = Object.freeze([...buyTransactions]);
  const frozenSellTransactions = Object.freeze([...sellTransactions]);
  const frozenInconsistencyReasons = Object.freeze([...inconsistencyReasons]);

  return Object.freeze({
    execution_status: executionStatus,
    match_level: matchLevel,
    planned_quantity: safePlannedQuantity,
    executed_buy_quantity: executedBuyQuantity,
    executed_sell_quantity: executedSellQuantity,
    remaining_inventory_quantity: remainingInventory,
    buy_fill_ratio: buyFillRatio,
    sell_fill_ratio: sellFillRatio,
    vwap_buy_price: vwapBuyPrice,
    vwap_sell_price: vwapSellPrice,
    first_buy_at: buyBounds.first_at,
    last_buy_at: buyBounds.last_at,
    first_sell_at: sellBounds.first_at,
    last_sell_at: sellBounds.last_at,
    buy_transactions: frozenBuyTransactions,
    sell_transactions: frozenSellTransactions,
    linked_order_ids: linkedOrderIds,
    candidate_observation_ids: candidateObservationIds,
    has_inventory_inconsistency: hasInventoryInconsistency,
    inconsistency_reasons: frozenInconsistencyReasons,
  });
}
