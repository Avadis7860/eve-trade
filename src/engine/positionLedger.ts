import type {
  AcquisitionLot,
  CurrentPosition,
  DisposalAllocation,
  EconomicOrigin,
  EconomicOwnerType,
  FinancialProvenance,
  FinancialSourceCoverage,
  FinancialCoverageEvidence,
  FinancialHistoryCoverage,
  EconomicOriginCoverage,
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
  /**
   * Explicit economic accounting scope. Character identity is not the scope.
   * Legacy callers may omit it and inherit the scope passed to the ledger.
   */
  readonly accounting_scope_id?: string;
  /** Explicit economic origin when already established by an upstream source. */
  readonly economic_origin?: EconomicOrigin;
  /** Transaction-level owner attribution; never used as an accounting silo. */
  readonly economic_owner_type?: Exclude<EconomicOwnerType, 'mixed'>;
  readonly economic_owner_id?: number | string | null;
  /** Explicit source/provenance supplied at the accounting boundary. */
  readonly provenance: FinancialProvenance;
};

function transactionTimestamp(tx: PositionLedgerTransaction): string | null {
  const candidate = tx.timestamp;
  if (candidate && !Number.isNaN(Date.parse(candidate))) return candidate;
  const legacyCandidate = tx.date;
  if (legacyCandidate && !Number.isNaN(Date.parse(legacyCandidate))) return legacyCandidate;
  return null;
}

function validProvenance(provenance: FinancialProvenance | undefined): boolean {
  if (!provenance) return false;
  return (
    (provenance.source_kind === 'ESI_WALLET_TRANSACTION' ||
      provenance.source_kind === 'EXECUTION_TRANSACTION') &&
    typeof provenance.source_id === 'string' &&
    provenance.source_id.length > 0 &&
    typeof provenance.principal_scope === 'string' &&
    provenance.principal_scope.length > 0
  );
}

function validScope(accountingScopeId: string, tx: PositionLedgerTransaction): boolean {
  return tx.accounting_scope_id === undefined || tx.accounting_scope_id === accountingScopeId;
}

function validTransaction(accountingScopeId: string, tx: PositionLedgerTransaction): boolean {
  return (
    Number.isSafeInteger(tx.transaction_id) &&
    tx.transaction_id > 0 &&
    validScope(accountingScopeId, tx) &&
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

function resolveEconomicOrigin(tx: PositionLedgerTransaction): EconomicOrigin {
  return tx.economic_origin ?? (tx.is_buy ? 'MARKET_ACQUISITION' : 'UNKNOWN_ORIGIN');
}

function resolveEconomicOwnerType(tx: PositionLedgerTransaction): Exclude<EconomicOwnerType, 'mixed'> {
  return tx.economic_owner_type ?? 'unknown';
}

function resolveEconomicOwnerId(tx: PositionLedgerTransaction): number | string | null {
  return tx.economic_owner_id ?? null;
}

function derivePositionOwner(
  lots: readonly AcquisitionLot[],
): { type: EconomicOwnerType; id: number | string | null } {
  const owners = new Map<string, { type: Exclude<EconomicOwnerType, 'mixed'>; id: number | string | null }>();
  for (const lot of lots) {
    const key = lot.economic_owner_type + '|' + String(lot.economic_owner_id);
    owners.set(key, { type: lot.economic_owner_type, id: lot.economic_owner_id });
  }
  if (owners.size === 0) return { type: 'unknown', id: null };
  if (owners.size === 1) {
    const owner = [...owners.values()][0];
    return { type: owner.type, id: owner.id };
  }
  return { type: 'mixed', id: null };
}

function lifecycleStatus(
  lots: readonly AcquisitionLot[],
  totalAcquired: number,
  _totalDisposed: number,
  _unmatched: number,
): PositionLifecycleStatus {
  if (totalAcquired <= 0) return 'UNKNOWN';
  const remaining = lots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
  if (remaining <= 0) return 'CLOSED';
  if (_totalDisposed > 0) return 'PARTIALLY_REALIZED';
  return 'OPEN';
}

function operationRecoveryState(delta: number): import('../types').EconomicOperationRecoveryState {
  if (delta < 0) return 'NEGATIVE';
  if (delta === 0) return 'RECOVERED';
  return 'POSITIVE';
}

export function reconstructPositionLedger(
  accountingScopeInput: string | number,
  typeId: number,
  transactions: readonly PositionLedgerTransaction[],
  coverageEvidence?: FinancialCoverageEvidence,
): PositionLedgerResult {
  const accountingScopeId =
    typeof accountingScopeInput === 'number'
      ? 'character:' + accountingScopeInput
      : accountingScopeInput.trim();

  if (!accountingScopeId) throw new Error('Invalid accountingScopeId: empty scope');
  if (!Number.isSafeInteger(typeId) || typeId <= 0) throw new Error('Invalid typeId: ' + typeId);

  const historyCoverage: FinancialHistoryCoverage =
    coverageEvidence?.history_coverage ?? 'UNKNOWN';
  const economicOriginCoverage: EconomicOriginCoverage =
    coverageEvidence?.economic_origin_coverage ?? 'UNKNOWN';

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
    .filter((tx) => !validTransaction(accountingScopeId, tx))
    .map((tx) => tx.transaction_id);
  const valid = ordered.filter((tx) => validTransaction(accountingScopeId, tx));

  const lots: AcquisitionLot[] = [];
  const allocations: DisposalAllocation[] = [];
  const dispositionStates: PositionDispositionState[] = [];
  let unmatchedDispositionQuantity = 0;
  let unreconciledLocationTransitionCount = 0;

  const activeOperationLotIds = new Set<string>();
  let operationSequence = 0;
  let activeOperationId: string | null = null;
  let operationQuantityAcquired = 0;
  let operationCapitalCommitted = 0;
  let operationCashRecovered = 0;

  for (const tx of valid) {
    const timestamp = transactionTimestamp(tx)!;

    if (tx.is_buy) {
      if (activeOperationLotIds.size === 0) {
        operationSequence += 1;
        activeOperationId = ['operation', accountingScopeId, typeId, operationSequence].join('_');
        operationQuantityAcquired = 0;
        operationCapitalCommitted = 0;
        operationCashRecovered = 0;
      }

      const originalCost = roundIsk(tx.quantity * tx.unit_price);
      const lot: AcquisitionLot = {
        lot_id: 'acquisition_' + tx.transaction_id,
        provenance: tx.provenance,
        transaction_id: tx.transaction_id,
        type_id: tx.type_id,
        location_id: tx.location_id,
        quantity_acquired: tx.quantity,
        remaining_quantity: tx.quantity,
        unit_cost: tx.unit_price,
        total_original_cost: originalCost,
        remaining_cost_basis: originalCost,
        acquired_at: timestamp,
        economic_origin: resolveEconomicOrigin(tx),
        economic_owner_type: resolveEconomicOwnerType(tx),
        economic_owner_id: resolveEconomicOwnerId(tx),
        related_order_id: relatedOrderId(tx),
        status: 'OPEN',
      };
      lots.push(lot);
      activeOperationLotIds.add(lot.lot_id);
      operationQuantityAcquired += tx.quantity;
      operationCapitalCommitted = roundIsk(operationCapitalCommitted + originalCost);
      continue;
    }

    const operationIdAtDisposition = activeOperationId;
    let remainingSellQuantity = tx.quantity;

    if (operationIdAtDisposition && activeOperationLotIds.size > 0) {
      for (let index = 0; index < lots.length && remainingSellQuantity > 0; index += 1) {
        const lot = lots[index];
        if (!activeOperationLotIds.has(lot.lot_id) || lot.remaining_quantity <= 0) continue;
        if (lot.location_id !== tx.location_id) unreconciledLocationTransitionCount += 1;

        const allocated = Math.min(lot.remaining_quantity, remainingSellQuantity);
        const acquisitionCost = roundIsk(allocated * lot.unit_cost);
        const revenue = roundIsk(allocated * tx.unit_price);

        lots[index] = {
          ...lot,
          remaining_quantity: lot.remaining_quantity - allocated,
          remaining_cost_basis: roundIsk((lot.remaining_quantity - allocated) * lot.unit_cost),
          status: lot.remaining_quantity - allocated === 0 ? 'CLOSED' : 'PARTIALLY_REALIZED',
        };

        allocations.push({
          allocation_id: 'allocation_' + tx.transaction_id + '_' + lot.transaction_id,
          disposition_transaction_id: tx.transaction_id,
          acquisition_lot_id: lot.lot_id,
          acquisition_transaction_id: lot.transaction_id,
          provenance: tx.provenance,
          allocated_quantity: allocated,
          acquisition_unit_cost: lot.unit_cost,
          disposal_unit_price: tx.unit_price,
          acquisition_cost: acquisitionCost,
          disposal_revenue: revenue,
          gross_realized_profit: roundIsk(revenue - acquisitionCost),
          acquired_at: lot.acquired_at,
          disposed_at: timestamp,
        });

        remainingSellQuantity -= allocated;
        operationCashRecovered = roundIsk(operationCashRecovered + revenue);
      }
    }

    if (remainingSellQuantity > 0) unmatchedDispositionQuantity += remainingSellQuantity;

    const remainingPositionQuantity =
      activeOperationLotIds.size > 0
        ? lots.filter((lot) => activeOperationLotIds.has(lot.lot_id))
            .reduce((sum, lot) => sum + lot.remaining_quantity, 0)
        : 0;
    const disposedQuantity = tx.quantity - remainingSellQuantity;
    const state: PositionLifecycleStatus =
      remainingPositionQuantity === 0 && disposedQuantity > 0
        ? 'CLOSED'
        : disposedQuantity > 0
          ? 'PARTIALLY_REALIZED'
          : 'UNKNOWN';

    if (operationIdAtDisposition) {
      const recoveryDelta = roundIsk(operationCashRecovered - operationCapitalCommitted);
      const recoveryRatio =
        operationCapitalCommitted > 0 ? operationCashRecovered / operationCapitalCommitted : null;
      dispositionStates.push({
        disposition_transaction_id: tx.transaction_id,
        disposed_quantity: disposedQuantity,
        unmatched_quantity: remainingSellQuantity,
        remaining_position_quantity: remainingPositionQuantity,
        lifecycle_status: state,
        operation_id: operationIdAtDisposition,
        operation_quantity_acquired: operationQuantityAcquired,
        operation_capital_committed: operationCapitalCommitted,
        operation_cash_recovered: operationCashRecovered,
        operation_recovery_delta: recoveryDelta,
        operation_recovery_ratio: recoveryRatio,
        operation_recovery_state: operationRecoveryState(recoveryDelta),
      });
    } else {
      dispositionStates.push({
        disposition_transaction_id: tx.transaction_id,
        disposed_quantity: disposedQuantity,
        unmatched_quantity: remainingSellQuantity,
        remaining_position_quantity: 0,
        lifecycle_status: 'UNKNOWN',
      });
    }

    if (activeOperationLotIds.size > 0 && remainingPositionQuantity === 0) {
      activeOperationLotIds.clear();
      activeOperationId = null;
      operationQuantityAcquired = 0;
      operationCapitalCommitted = 0;
      operationCashRecovered = 0;
    }
  }

  const quantityAcquired = lots.reduce((sum, lot) => sum + lot.quantity_acquired, 0);
  const quantityDisposed = allocations.reduce((sum, allocation) => sum + allocation.allocated_quantity, 0);
  const remainingQuantity = lots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);
  const remainingCostBasis = roundIsk(lots.reduce((sum, lot) => sum + lot.remaining_cost_basis, 0));
  const realizedGrossProfit = roundIsk(
    allocations.reduce((sum, allocation) => sum + allocation.gross_realized_profit, 0),
  );

  const provenanceByKey = new Map<string, FinancialProvenance>();
  for (const source of [
    ...lots.map((lot) => lot.provenance),
    ...allocations.map((allocation) => allocation.provenance),
  ]) {
    provenanceByKey.set(
      source.source_kind + '|' + source.source_id + '|' + source.principal_scope,
      source,
    );
  }
  const positionProvenance = Object.freeze(
    [...provenanceByKey.values()].sort((a, b) =>
      (a.source_kind + '|' + a.source_id + '|' + a.principal_scope).localeCompare(
        b.source_kind + '|' + b.source_id + '|' + b.principal_scope,
      ),
    ),
  );

  const capitalCommitted = quantityAcquired > 0
    ? roundIsk(lots.reduce((sum, lot) => sum + lot.total_original_cost, 0))
    : null;
  const cashRecovered = quantityAcquired > 0
    ? roundIsk(allocations.reduce((sum, allocation) => sum + allocation.disposal_revenue, 0))
    : null;
  const capitalRecoveryDelta =
    capitalCommitted !== null && cashRecovered !== null ? roundIsk(cashRecovered - capitalCommitted) : null;
  const capitalRecoveryRatio =
    capitalCommitted !== null && capitalCommitted > 0 && cashRecovered !== null
      ? cashRecovered / capitalCommitted
      : null;

  const hasUnknownOrigin = lots.some((lot) => lot.economic_origin !== 'MARKET_ACQUISITION');
  const hasSourceDefects = invalidTransactionIds.length > 0 || unmatchedDispositionQuantity > 0 || hasUnknownOrigin || unreconciledLocationTransitionCount > 0;
  const sourceCoverage: FinancialSourceCoverage =
    hasSourceDefects ? 'PARTIAL' : quantityAcquired <= 0 ? 'UNAVAILABLE' : 'MARKET_TRACEABLE';

  const owner = derivePositionOwner(lots);
  const position: CurrentPosition = Object.freeze({
    position_id: 'position_' + accountingScopeId + '_' + typeId,
    accounting_scope_id: accountingScopeId,
    type_id: typeId,
    economic_owner_type: owner.type,
    economic_owner_id: owner.id,
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
    lifecycle_status: lifecycleStatus(lots, quantityAcquired, quantityDisposed, unmatchedDispositionQuantity),
    position_completeness:
      sourceCoverage === 'UNAVAILABLE'
        ? 'UNAVAILABLE'
        : sourceCoverage === 'PARTIAL' ||
            historyCoverage !== 'COMPLETE_FOR_SCOPE' ||
            economicOriginCoverage !== 'COMPLETE_FOR_SCOPE'
          ? 'PARTIAL'
          : 'OBSERVED',
    financial_completeness: sourceCoverage === 'UNAVAILABLE' ? 'UNAVAILABLE' : sourceCoverage === 'PARTIAL' ? 'PARTIAL' : 'OBSERVED',
    source_coverage: sourceCoverage,
    history_coverage: historyCoverage,
    economic_origin_coverage: economicOriginCoverage,
    lots: Object.freeze(lots.filter((lot) => lot.remaining_quantity > 0 || lot.quantity_acquired > 0)),
    allocations: Object.freeze(allocations),
    disposition_states: Object.freeze(dispositionStates),
    unmatched_disposition_quantity: unmatchedDispositionQuantity,
    invalid_transaction_ids: Object.freeze(invalidTransactionIds),
    unreconciled_location_transition_count: unreconciledLocationTransitionCount,
  });

  const firstCharacterId = valid.find((tx) => tx.character_id !== undefined)?.character_id;
  return Object.freeze({
    accounting_scope_id: accountingScopeId,
    type_id: typeId,
    character_id: firstCharacterId,
    principal_scope: accountingScopeId,
    position,
  });
}