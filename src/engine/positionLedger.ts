import type {
  AcquisitionLot,
  CurrentPosition,
  DisposalAllocation,
  FinancialProvenance,
  PositionDispositionState,
  PositionLedgerResult,
  PositionLifecycleStatus,
} from '../types';
import type { OrderId } from '../types/order';
import { normalizeOrderId } from './orderIdentity';
import { roundIsk } from './money';

export type PositionLedgerTransaction = {
  readonly transaction_id: number;
  readonly character_id?: number;
  readonly type_id: number;
  readonly location_id: number;
  /** Economic transaction direction. Never derived from MarketOrder.is_buy_order. */
  readonly is_buy: boolean;
  readonly quantity: number;
  readonly unit_price: number;
  readonly timestamp?: string;
  readonly date?: string;
  /** Optional corroborating CCP order identity; never required for accounting. */
  readonly order_id?: OrderId;
  readonly opportunity_id?: string;
  /** Explicit source/provenance supplied by the caller at the accounting boundary. */
  readonly provenance: FinancialProvenance;
};

function transactionTimestamp(tx: LedgerTransaction): string | null {
  const candidate = 'timestamp' in tx ? tx.timestamp : undefined;
  if (candidate && !Number.isNaN(Date.parse(candidate))) return candidate;

  const legacyCandidate = 'date' in tx ? tx.date : undefined;
  if (legacyCandidate && !Number.isNaN(Date.parse(legacyCandidate))) return legacyCandidate;

  return null;
}

function transactionCharacterId(tx: LedgerTransaction, fallback: number): number {
  const value = 'character_id' in tx ? tx.character_id : undefined;
  return value === undefined ? fallback : value;
}

function validProvenance(provenance: FinancialProvenance | undefined): boolean {
  if (!provenance) return false;
  return (
    provenance.source_kind === 'ESI_WALLET_TRANSACTION' ||
    provenance.source_kind === 'EXECUTION_TRANSACTION'
  ) &&
    typeof provenance.source_id === 'string' &&
    provenance.source_id.length > 0 &&
    typeof provenance.principal_scope === 'string' &&
    provenance.principal_scope.length > 0;
}

function transactionProvenance(tx: PositionLedgerTransaction): FinancialProvenance {
  return tx.provenance;
}

function validTransaction(tx: PositionLedgerTransaction, characterId: number): boolean {
  return (
    Number.isSafeInteger(tx.transaction_id) &&
    tx.transaction_id > 0 &&
    transactionCharacterId(tx, characterId) === characterId &&
    Number.isSafeInteger(tx.type_id) &&
    tx.type_id > 0 &&
    Number.isSafeInteger(tx.location_id) &&
    tx.location_id > 0 &&
    Number.isSafeInteger(tx.quantity) &&
    tx.quantity > 0 &&
    Number.isFinite(tx.unit_price) &&
    tx.unit_price > 0 &&
    transactionTimestamp(tx) !== null &&
    validProvenance(tx.provenance)
  );
}

function relatedOrderId(tx: PositionLedgerTransaction): OrderId | undefined {
  if (!tx.order_id) return undefined;
  return normalizeOrderId(tx.order_id) ?? undefined;
}

function statusFor(
  lots: readonly AcquisitionLot[],
  totalAcquired: number,
  totalDisposed: number,
  unmatched: number,
): PositionLifecycleStatus {
  if (totalAcquired <= 0) return 'UNKNOWN';
  const remaining = lots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
  if (remaining <= 0 && unmatched <= 0) return 'CLOSED';
  if (totalDisposed > 0) return 'PARTIALLY_REALIZED';
  return 'OPEN';
}

/**
 * Reconstructs economic position state from transaction facts.
 *
 * Market orders are deliberately absent from the input contract: their side is
 * not an accounting direction. A transaction with is_buy=true creates an
 * acquisition lot; a transaction with is_buy=false consumes causally prior lots.
 */
export function reconstructPositionLedger(
  characterId: number,
  typeId: number,
  transactions: readonly PositionLedgerTransaction[],
): PositionLedgerResult {
  if (!Number.isSafeInteger(characterId) || characterId <= 0) {
    throw new Error(`Invalid characterId: ${characterId}`);
  }
  if (!Number.isSafeInteger(typeId) || typeId <= 0) {
    throw new Error(`Invalid typeId: ${typeId}`);
  }

  const ordered = [...transactions]
    .filter((tx) => tx.type_id === typeId)
    .sort((a, b) => {
      const ta = transactionTimestamp(a);
      const tb = transactionTimestamp(b);
      if (ta === null && tb === null) return a.transaction_id - b.transaction_id;
      if (ta === null) return 1;
      if (tb === null) return -1;
      const diff = ta.localeCompare(tb);
      return diff !== 0 ? diff : a.transaction_id - b.transaction_id;
    });

  const invalidTransactionIds = ordered
    .filter((tx) => !validTransaction(tx, characterId))
    .map((tx) => tx.transaction_id);

  const valid = ordered.filter((tx) => validTransaction(tx, characterId));
  const buyTransactions = valid.filter((tx) => tx.is_buy);
  const sellTransactions = valid.filter((tx) => !tx.is_buy);

  const lots: AcquisitionLot[] = buyTransactions.map((tx) => {
    const timestamp = transactionTimestamp(tx)!;
    const qty = tx.quantity;
    const unitCost = tx.unit_price;
    const provenance = transactionProvenance(tx, characterId);

    return {
      lot_id: `acquisition_${tx.transaction_id}`,
      provenance,
      transaction_id: tx.transaction_id,
      type_id: tx.type_id,
      location_id: tx.location_id,
      quantity_acquired: qty,
      remaining_quantity: qty,
      unit_cost: unitCost,
      total_original_cost: roundIsk(qty * unitCost),
      remaining_cost_basis: roundIsk(qty * unitCost),
      acquired_at: timestamp,
      economic_owner_type: 'character',
      economic_owner_id: characterId,
      related_order_id: relatedOrderId(tx),
      status: 'OPEN',
    };
  });

  const allocations: DisposalAllocation[] = [];
  const dispositionStates: PositionDispositionState[] = [];
  let unmatchedDispositionQuantity = 0;

  for (const sell of sellTransactions) {
    const sellAt = transactionTimestamp(sell)!;
    let remaining = sell.quantity;

    for (let index = 0; index < lots.length && remaining > 0; index += 1) {
      const lot = lots[index];
      if (lot.remaining_quantity <= 0) continue;

      if (
        sellAt < lot.acquired_at ||
        (sellAt === lot.acquired_at && sell.transaction_id < lot.transaction_id)
      ) {
        break;
      }

      const allocated = Math.min(lot.remaining_quantity, remaining);
      const acquisitionCost = roundIsk(allocated * lot.unit_cost);
      const revenue = roundIsk(allocated * sell.unit_price);

      lots[index] = {
        ...lot,
        remaining_quantity: lot.remaining_quantity - allocated,
        remaining_cost_basis: roundIsk((lot.remaining_quantity - allocated) * lot.unit_cost),
        status: lot.remaining_quantity - allocated === 0 ? 'CLOSED' : 'PARTIALLY_REALIZED',
      };

      allocations.push({
        allocation_id: `allocation_${sell.transaction_id}_${lot.transaction_id}`,
        disposition_transaction_id: sell.transaction_id,
        acquisition_lot_id: lot.lot_id,
        acquisition_transaction_id: lot.transaction_id,
        provenance: transactionProvenance(sell, characterId),
        allocated_quantity: allocated,
        acquisition_unit_cost: lot.unit_cost,
        disposal_unit_price: sell.unit_price,
        acquisition_cost: acquisitionCost,
        disposal_revenue: revenue,
        gross_realized_profit: roundIsk(revenue - acquisitionCost),
        acquired_at: lot.acquired_at,
        disposed_at: sellAt,
      });

      remaining -= allocated;
    }

    if (remaining > 0) unmatchedDispositionQuantity += remaining;

    const remainingPositionQuantity = lots.reduce(
      (sum, lot) => sum + lot.remaining_quantity,
      0,
    );
    const disposedQuantity = sell.quantity - remaining;
    const lifecycleStatus: PositionLifecycleStatus =
      remaining > 0
        ? 'PARTIALLY_REALIZED'
        : remainingPositionQuantity === 0
          ? 'CLOSED'
          : disposedQuantity > 0
            ? 'PARTIALLY_REALIZED'
            : 'UNKNOWN';

    dispositionStates.push({
      disposition_transaction_id: sell.transaction_id,
      disposed_quantity: disposedQuantity,
      unmatched_quantity: remaining,
      remaining_position_quantity: remainingPositionQuantity,
      lifecycle_status: lifecycleStatus,
    });
  }

  const quantityAcquired = lots.reduce((sum, lot) => sum + lot.quantity_acquired, 0);
  const quantityDisposed = allocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0);
  const remainingQuantity = lots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
  const remainingCostBasis = roundIsk(
    lots.reduce((sum, lot) => sum + lot.remaining_cost_basis, 0),
  );
  const realizedGrossProfit = roundIsk(
    allocations.reduce((sum, allocation) => sum + allocation.gross_realized_profit, 0),
  );

  const provenanceByKey = new Map<string, FinancialProvenance>();
  for (const lot of lots) {
    const provenance = lot.provenance;
    provenanceByKey.set(
      `${provenance.source_kind}|${provenance.source_id}|${provenance.principal_scope}`,
      provenance,
    );
  }
  for (const allocation of allocations) {
    const provenance = allocation.provenance;
    provenanceByKey.set(
      `${provenance.source_kind}|${provenance.source_id}|${provenance.principal_scope}`,
      provenance,
    );
  }
  const positionProvenance = Object.freeze(
    [...provenanceByKey.values()].sort((a, b) =>
      `${a.source_kind}|${a.source_id}|${a.principal_scope}`.localeCompare(
        `${b.source_kind}|${b.source_id}|${b.principal_scope}`,
      ),
    ),
  );

  // Capital recovery is position-level progress, not realized P&L:
  // - committed = original cost of known acquisition lots;
  // - recovered = revenue from causally allocated disposals only;
  // - unmatched/orphan disposal revenue is never credited to a known acquisition position;
  // - no known acquisition means recovery is UNKNOWN/null rather than synthetic zero.
  const capitalCommitted =
    quantityAcquired > 0
      ? roundIsk(lots.reduce((sum, lot) => sum + lot.total_original_cost, 0))
      : null;
  const cashRecovered =
    quantityAcquired > 0
      ? roundIsk(allocations.reduce((sum, allocation) => sum + allocation.disposal_revenue, 0))
      : null;
  const capitalRecoveryDelta =
    capitalCommitted !== null && cashRecovered !== null
      ? roundIsk(cashRecovered - capitalCommitted)
      : null;
  const capitalRecoveryRatio =
    capitalCommitted !== null && capitalCommitted > 0 && cashRecovered !== null
      ? cashRecovered / capitalCommitted
      : null;

  const position: CurrentPosition = Object.freeze({
    position_id: `position_${characterId}_${typeId}`,
    type_id: typeId,
    economic_owner_type: 'character',
    economic_owner_id: characterId,
    quantity_acquired: quantityAcquired,
    quantity_disposed: quantityDisposed,
    remaining_quantity: remainingQuantity,
    remaining_cost_basis: remainingCostBasis,
    realized_gross_profit: realizedGrossProfit,
    capital_committed: capitalCommitted,
    cash_recovered: cashRecovered,
    capital_recovery_delta: capitalRecoveryDelta,
    capital_recovery_ratio: capitalRecoveryRatio,
    provenance: positionProvenance,
    lifecycle_status: statusFor(lots, quantityAcquired, quantityDisposed, unmatchedDispositionQuantity),
    financial_completeness:
      invalidTransactionIds.length > 0 || unmatchedDispositionQuantity > 0
        ? 'PARTIAL'
        : 'OBSERVED',
    lots: Object.freeze(lots.filter((lot) => lot.remaining_quantity > 0 || lot.quantity_acquired > 0)),
    allocations: Object.freeze(allocations),
    disposition_states: Object.freeze(dispositionStates),
    unmatched_disposition_quantity: unmatchedDispositionQuantity,
    invalid_transaction_ids: Object.freeze(invalidTransactionIds),
  });

  return Object.freeze({
    character_id: characterId,
    type_id: typeId,
    principal_scope: `character:${characterId}`,
    position,
  });
}
