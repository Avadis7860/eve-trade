/**
 * ============================================================================
 * EVE TRADE — REALIZED FINANCIAL OUTCOME ENGINE (PHASE 2B: CHANTIER 3B-4A)
 * ============================================================================
 * 
 * Pure mathematical, deterministic calculation engine that computes realized
 * financial results (P&L, FIFO cost basis, revenue, fees, ROI, margin, and
 * quantity-weighted hold duration) from correlated CharacterExecutionRecords.
 * 
 * CORE INVARIANTS:
 * 1. Strict Purity: Zero network calls, zero React hooks, zero localStorage,
 *    zero IndexedDB access, zero Date.now() / system clock dependencies.
 * 2. Immutability: Inputs (CharacterExecutionRecord, transactions, options) are
 *    never mutated. Defensive copies are utilized throughout.
 * 3. Deterministic FIFO Cost Basis: Buy transactions form discrete lots that are
 *    consumed in chronological order (timestamp ASC, transaction_id ASC).
 *    A single sell can consume multiple buy lots; a buy lot can be consumed by
 *    multiple sales. Traceability is completely retained in fifo_allocations.
 * 4. Zero Cost Fabrication: If sell quantity exceeds buy inventory (orphan/oversold),
 *    missing cost is NEVER set to 0.00 ISK or fabricated. Instead, the outcome is
 *    explicitly flagged with data_state = 'PARTIAL', has_unmatched_sell_quantity = true,
 *    and unmatched_sell_quantity = X.
 * 5. Transparent Fee Sourcing: Differentiates observed vs estimated vs unavailable.
 *    Since current wallet transactions do not directly expose tax/fee deductions,
 *    fees are computed via FeeEngine as CONFIG_ESTIMATE (or UNAVAILABLE if no config).
 *    Never misrepresents estimates as observed paid fees.
 * 6. Protection Against Mathematical Hazards: safeDiv guards against division by
 *    zero, NaN, and Infinity in all ROI, margin, and per-unit calculations.
 */

import {
  CharacterExecutionRecord,
  ExecutionFeeRoleMode,
  ExecutionTransactionRef,
  FifoAllocationRecord,
  FifoLotRecord,
  FinancialCompleteness,
  FinancialFeeMode,
  FinancialFeeSource,
  PersistedCharacterTransaction,
  RealizedFeeBreakdown,
  RealizedFinancialCalculationOptions,
  RealizedFinancialOutcome,
} from '../types';
import { FeeEngine } from './fee';
import { safeDiv, roundIsk } from './money';
import { reconstructPositionLedger } from './positionLedger';
import type { PositionLedgerTransaction } from './positionLedger';

export const REALIZED_FINANCIAL_ENGINE_VERSION = '1.0.0';

export class CrossCharacterFinancialMappingViolationError extends Error {
  constructor(
    public readonly transactionCharacterId: number,
    public readonly executionCharacterId: number,
    public readonly transactionId: number
  ) {
    super(
      `Cross-character mapping violation: Transaction ${transactionId} belongs to character ${transactionCharacterId}, but execution record belongs to character ${executionCharacterId}. Cross-character financial attribution is strictly prohibited.`
    );
    this.name = 'CrossCharacterFinancialMappingViolationError';
  }
}

export class RealizedFinancialOutcomeEngine {
  /**
   * Calculates deterministic realized financial outcomes for a given CharacterExecutionRecord.
   * 
   * @param executionRecord The correlated CharacterExecutionRecord to analyze
   * @param options Optional configuration including FinancialConfig, fee profiles, roles, or explicit transactions
   * @returns Pure immutable RealizedFinancialOutcome
   */
  static calculate(
    executionRecord: CharacterExecutionRecord,
    options?: RealizedFinancialCalculationOptions
  ): RealizedFinancialOutcome {
    if (!executionRecord) {
      throw new Error('RealizedFinancialOutcomeEngine.calculate requires a valid CharacterExecutionRecord');
    }

    const characterId = executionRecord.character_id;
    if (!characterId || characterId <= 0) {
      throw new Error(
        `RealizedFinancialOutcomeEngine.calculate requires a valid positive character_id. Received: ${characterId} (character_id=0 is reserved for fleet contexts and cannot be used for individual character calculations)`
      );
    }
    const observationId = executionRecord.observation_id;
    const executionId = executionRecord.execution_id;
    const opportunityId = executionRecord.opportunity_id;

    // 1. Resolve candidate transactions
    const { buyTxs, sellTxs, typeId, provenanceByTransactionId } =
      this.resolveTransactions(executionRecord, options);

    // 2. Sort chronologically (timestamp ASC, transaction_id ASC)
    const sortedBuys = [...buyTxs].sort((a, b) => {
      const timeA = Number.isNaN(new Date(a.timestamp).getTime()) ? 0 : new Date(a.timestamp).getTime();
      const timeB = Number.isNaN(new Date(b.timestamp).getTime()) ? 0 : new Date(b.timestamp).getTime();
      const timeDiff = timeA - timeB;
      return timeDiff !== 0 ? timeDiff : a.transaction_id - b.transaction_id;
    });

    const sortedSells = [...sellTxs].sort((a, b) => {
      const timeA = Number.isNaN(new Date(a.timestamp).getTime()) ? 0 : new Date(a.timestamp).getTime();
      const timeB = Number.isNaN(new Date(b.timestamp).getTime()) ? 0 : new Date(b.timestamp).getTime();
      const timeDiff = timeA - timeB;
      return timeDiff !== 0 ? timeDiff : a.transaction_id - b.transaction_id;
    });

    // 3-4. Reconstruct economic position state through the canonical ledger.
    // Market order side is deliberately absent: transaction is the accounting fact.
    const ledgerTransactions: PositionLedgerTransaction[] = [
      ...sortedBuys,
      ...sortedSells,
    ].map((tx) => ({
      ...tx,
      provenance:
        provenanceByTransactionId.get(tx.transaction_id) ?? {
          source_kind: 'EXECUTION_TRANSACTION',
          source_id: String(tx.transaction_id),
          principal_scope: `character:${characterId}`,
        },
    }));

    const positionLedger = reconstructPositionLedger(characterId, typeId, ledgerTransactions);

    const ledgerLots = positionLedger.position.lots;
    const lots: FifoLotRecord[] = ledgerLots.map((lot) => ({
      lot_id: lot.lot_id,
      provenance: lot.provenance,
      buy_transaction_id: lot.transaction_id,
      type_id: lot.type_id,
      location_id: lot.location_id,
      timestamp: lot.acquired_at,
      original_quantity: lot.quantity_acquired,
      remaining_quantity: lot.remaining_quantity,
      unit_cost: lot.unit_cost,
      total_original_cost: lot.total_original_cost,
      total_remaining_cost: lot.remaining_cost_basis,
    }));

    let allocationSeq = 1;
    const allocations: FifoAllocationRecord[] = positionLedger.position.allocations.map((allocation) => {
      const holdDurationMs = Math.max(
        0,
        Date.parse(allocation.disposed_at) - Date.parse(allocation.acquired_at),
      );
      return {
        allocation_id: `alloc_${allocation.disposition_transaction_id}_${allocation.acquisition_lot_id.replace(/^acquisition_/, '')}_${allocationSeq++}`,
        provenance: allocation.provenance,
        sell_transaction_id: allocation.disposition_transaction_id,
        buy_transaction_id: allocation.acquisition_transaction_id,
        type_id: typeId,
        allocated_quantity: allocation.allocated_quantity,
        buy_unit_price: allocation.acquisition_unit_cost,
        sell_unit_price: allocation.disposal_unit_price,
        buy_timestamp: allocation.acquired_at,
        sell_timestamp: allocation.disposed_at,
        hold_duration_ms: holdDurationMs,
        hold_days: holdDurationMs / 86_400_000,
        gross_cost: allocation.acquisition_cost,
        gross_revenue: allocation.disposal_revenue,
        gross_profit: allocation.gross_realized_profit,
      };
    });

    const unmatchedSellQuantity = positionLedger.position.unmatched_disposition_quantity;
    // 5. Aggregate Quantities and Financial Totals
    const totalBuyQuantity = positionLedger.position.lots.reduce(
      (acc, lot) => acc + lot.quantity_acquired,
      0,
    );
    const totalSellQuantity = positionLedger.position.disposition_states.reduce(
      (acc, state) => acc + state.disposed_quantity + state.unmatched_quantity,
      0,
    );
    const matchedQuantity = allocations.reduce((acc, a) => acc + a.allocated_quantity, 0);
    const remainingInventoryQuantity = lots.reduce((acc, l) => acc + l.remaining_quantity, 0);
    const hasUnmatchedSellQuantity = unmatchedSellQuantity > 0;
    const positionLifecycle = positionLedger.position.lifecycle_status;
    const positionRemainingQuantity = positionLedger.position.remaining_quantity;

    const realizedAcquisitionCost = roundIsk(allocations.reduce((acc, a) => acc + a.gross_cost, 0));
    const realizedRevenue = roundIsk(allocations.reduce((acc, a) => acc + a.gross_revenue, 0));
    const grossRealizedProfit = roundIsk(realizedRevenue - realizedAcquisitionCost);
    const remainingInventoryCostBasis = roundIsk(lots.reduce((acc, l) => acc + l.total_remaining_cost, 0));

    // Capital recovery is projected directly from the canonical position ledger.
    // It is intentionally independent from realized P&L and disposal-level ROI.
    const capitalCommitted = positionLedger.position.capital_committed;
    const cashRecovered = positionLedger.position.cash_recovered;
    const capitalRecoveryDelta = positionLedger.position.capital_recovery_delta;
    const capitalRecoveryRatio = positionLedger.position.capital_recovery_ratio;

    // 6. Fee Calculations via FeeEngine
    const fees = this.calculateFees(
      realizedAcquisitionCost,
      realizedRevenue,
      options
    );

    const netRealizedProfit = roundIsk(grossRealizedProfit - fees.estimated_total_fees);

    // 7. Financial Completeness & Quality Determination
    // Strictly distinguishes between observed facts, estimations, partial inventory, and unavailable data.
    let financialCompleteness: FinancialCompleteness;
    let isNetEstimated = false;
    let isFinanciallyComplete = false;
    let realizedNetEstimated: number | null = null;

    if (
      positionLedger.position.invalid_transaction_ids.length > 0 ||
      hasUnmatchedSellQuantity ||
      (matchedQuantity === 0 && totalSellQuantity > 0)
    ) {
      financialCompleteness = 'PARTIAL';
      isNetEstimated = fees.fee_mode === 'ESTIMATED';
      realizedNetEstimated = fees.fee_mode === 'ESTIMATED' ? netRealizedProfit : null;
      isFinanciallyComplete = false;
    } else if (fees.fee_mode === 'UNAVAILABLE') {
      financialCompleteness = 'UNAVAILABLE';
      isNetEstimated = false;
      realizedNetEstimated = null; // NO DATA ≠ ZERO DATA: No fake estimated net profit is provided
      isFinanciallyComplete = false;
    } else if (fees.fee_mode === 'ESTIMATED') {
      financialCompleteness = 'ESTIMATED';
      isNetEstimated = true;
      realizedNetEstimated = netRealizedProfit;
      isFinanciallyComplete = false; // ESTIMATE ≠ OBSERVED FACT: Estimated net is never 100% complete observed truth
    } else if (fees.fee_mode === 'OBSERVED') {
      financialCompleteness = 'OBSERVED';
      isNetEstimated = false;
      realizedNetEstimated = null;
      isFinanciallyComplete = true; // Fully matched + 100% observed fees from journal
    } else {
      financialCompleteness = 'PARTIAL';
      isNetEstimated = false;
      realizedNetEstimated = null;
      isFinanciallyComplete = false;
    }

    // 8. Ratios and Rates (protected against zero division)
    const roi = realizedAcquisitionCost > 0 ? safeDiv(netRealizedProfit, realizedAcquisitionCost, 0.0) : null;
    const margin = realizedRevenue > 0 ? safeDiv(netRealizedProfit, realizedRevenue, 0.0) : null;
    const profitPerUnit = matchedQuantity > 0 ? safeDiv(netRealizedProfit, matchedQuantity, 0.0) : null;

    // 9. Timestamps & Quantity-Weighted Hold Durations
    const firstBuyAt = sortedBuys.length > 0 ? sortedBuys[0].timestamp : null;
    const lastBuyAt = sortedBuys.length > 0 ? sortedBuys[sortedBuys.length - 1].timestamp : null;

    const matchedSells = sortedSells.filter((s) =>
      allocations.some((a) => a.sell_transaction_id === s.transaction_id)
    );
    const firstRealizedSellAt = matchedSells.length > 0 ? matchedSells[0].timestamp : null;
    const lastRealizedSellAt = matchedSells.length > 0 ? matchedSells[matchedSells.length - 1].timestamp : null;

    let weightedBuyTimestamp: string | null = null;
    let weightedSellTimestamp: string | null = null;
    let weightedHoldMs = 0;
    let weightedHoldDays = 0;

    if (matchedQuantity > 0) {
      const totalWeightedBuyTimeMs = allocations.reduce(
        (sum, a) => sum + a.allocated_quantity * (Number.isNaN(new Date(a.buy_timestamp).getTime()) ? 0 : new Date(a.buy_timestamp).getTime()),
        0
      );
      const totalWeightedSellTimeMs = allocations.reduce(
        (sum, a) => sum + a.allocated_quantity * (Number.isNaN(new Date(a.sell_timestamp).getTime()) ? 0 : new Date(a.sell_timestamp).getTime()),
        0
      );

      const avgBuyTimeMs = totalWeightedBuyTimeMs / matchedQuantity;
      const avgSellTimeMs = totalWeightedSellTimeMs / matchedQuantity;

      weightedBuyTimestamp = new Date(Math.round(avgBuyTimeMs)).toISOString();
      weightedSellTimestamp = new Date(Math.round(avgSellTimeMs)).toISOString();
      weightedHoldMs = Math.max(0, Math.round(avgSellTimeMs - avgBuyTimeMs));
      weightedHoldDays = weightedHoldMs / 86_400_000;
    }

    // 10. Data State & Diagnostic Reasons
    let dataState: 'VALID' | 'PARTIAL' = 'VALID';
    const stateReasons: string[] = [];

    if (positionLedger.position.invalid_transaction_ids.length > 0) {
      dataState = 'PARTIAL';
      stateReasons.push(
        `Invalid transaction facts excluded from accounting: ${positionLedger.position.invalid_transaction_ids.join(', ')}`
      );
    }

    if (hasUnmatchedSellQuantity) {
      dataState = 'PARTIAL';
      stateReasons.push(
        `Unmatched sell quantity: ${unmatchedSellQuantity} units sold exceed available buy inventory in this execution`
      );
    }

    // Check if any sale occurred before any prior buy (causal sequence deficit)
    const hasCausalDeficit = sortedSells.some((sell) => {
      const sellTimeMs = Number.isNaN(new Date(sell.timestamp).getTime()) ? 0 : new Date(sell.timestamp).getTime();
      return !sortedBuys.some((buy) => {
        const buyTimeMs = Number.isNaN(new Date(buy.timestamp).getTime()) ? 0 : new Date(buy.timestamp).getTime();
        return buyTimeMs < sellTimeMs || (buyTimeMs === sellTimeMs && buy.transaction_id <= sell.transaction_id);
      });
    });

    if (hasCausalDeficit && sortedSells.length > 0) {
      stateReasons.push(
        'Causal inventory deficit: one or more sales occurred before any causally prior buy transaction'
      );
    }

    if (executionRecord.data_state !== 'VALID') {
      dataState = 'PARTIAL';
      stateReasons.push(`Source execution record is in state ${executionRecord.data_state}`);
    }

    if (fees.fee_mode === 'UNAVAILABLE') {
      dataState = 'PARTIAL';
      stateReasons.push('Fee configuration is unavailable; net profit cannot account for broker fees and taxes');
    }

    if (matchedQuantity === 0 && totalSellQuantity > 0) {
      dataState = 'PARTIAL';
      stateReasons.push(`Zero buy units available to match ${totalSellQuantity} sold units`);
    }

    if (fees.execution_fee_mode === 'UNKNOWN' && fees.fee_mode === 'ESTIMATED') {
      stateReasons.push(
        'Execution role (Maker/Taker) unknown: net profit is a baseline estimate assuming Taker (0% broker fee)'
      );
    }

    // Filter remaining lots to return immutable snapshots
    const remainingLots = Object.freeze(lots.filter((l) => l.remaining_quantity > 0));

    const outcomeId = `outcome_${executionId}`;

    return Object.freeze({
      outcome_id: outcomeId,
      execution_id: executionId,
      character_id: characterId,
      observation_id: observationId,
      opportunity_id: opportunityId,
      type_id: typeId,

      total_buy_quantity: totalBuyQuantity,
      total_sell_quantity: totalSellQuantity,
      matched_quantity: matchedQuantity,
      remaining_inventory_quantity: remainingInventoryQuantity,
      unmatched_sell_quantity: unmatchedSellQuantity,
      has_unmatched_sell_quantity: hasUnmatchedSellQuantity,

      realized_acquisition_cost: realizedAcquisitionCost,
      realized_revenue: realizedRevenue,
      gross_realized_profit: grossRealizedProfit,
      realized_gross: grossRealizedProfit,

      fees,
      net_realized_profit: netRealizedProfit,
      realized_net_estimated: realizedNetEstimated,
      is_net_estimated: isNetEstimated,
      is_financially_complete: isFinanciallyComplete,
      financial_completeness: financialCompleteness,

      roi,
      margin,
      profit_per_unit: profitPerUnit,

      remaining_inventory_cost_basis: remainingInventoryCostBasis,
      capital_committed: capitalCommitted,
      cash_recovered: cashRecovered,
      capital_recovery_delta: capitalRecoveryDelta,
      capital_recovery_ratio: capitalRecoveryRatio,

      position_lifecycle: positionLifecycle,
      position_remaining_quantity: positionRemainingQuantity,

      first_buy_at: firstBuyAt,
      last_buy_at: lastBuyAt,
      first_realized_sell_at: firstRealizedSellAt,
      last_realized_sell_at: lastRealizedSellAt,
      weighted_buy_timestamp: weightedBuyTimestamp,
      weighted_sell_timestamp: weightedSellTimestamp,
      weighted_hold_ms: weightedHoldMs,
      weighted_hold_days: weightedHoldDays,

      data_state: dataState,
      state_reasons: stateReasons.length > 0 ? Object.freeze(stateReasons) : undefined,
      fifo_allocations: Object.freeze(allocations),
      remaining_lots: remainingLots,

      realized_financial_engine_version: REALIZED_FINANCIAL_ENGINE_VERSION,
    });
  }

  /**
   * Resolves buy and sell transaction lists for this execution, validating character isolation.
   */
  private static resolveTransactions(
    executionRecord: CharacterExecutionRecord,
    options?: RealizedFinancialCalculationOptions
  ): {
    buyTxs: ExecutionTransactionRef[];
    sellTxs: ExecutionTransactionRef[];
    typeId: number;
    provenanceByTransactionId: ReadonlyMap<number, import('../types').FinancialProvenance>;
  } {
    const characterId = executionRecord.character_id;

    // If external transactions were provided, validate isolation and filter
    if (options?.transactions && options.transactions.length > 0) {
      const allowedTxIds = new Set(executionRecord.transaction_ids);
      const buyList: ExecutionTransactionRef[] = [];
      const sellList: ExecutionTransactionRef[] = [];
      const provenanceByTransactionId = new Map<number, import('../types').FinancialProvenance>();
      let foundTypeId = 0;

      for (const tx of options.transactions) {
        // Enforce cross-character guard if character_id is present
        if ('character_id' in tx && tx.character_id !== undefined && tx.character_id !== characterId) {
          throw new CrossCharacterFinancialMappingViolationError(
            tx.character_id,
            characterId,
            tx.transaction_id
          );
        }

        if (allowedTxIds.has(tx.transaction_id)) {
          foundTypeId = tx.type_id;
          const ref: ExecutionTransactionRef = {
            transaction_id: tx.transaction_id,
            type_id: tx.type_id,
            location_id: tx.location_id,
            is_buy: tx.is_buy,
            quantity: tx.quantity,
            unit_price: tx.unit_price,
            timestamp: 'timestamp' in tx && tx.timestamp
              ? tx.timestamp
              : ('date' in tx && tx.date ? tx.date : new Date(0).toISOString()),
            character_id: characterId,
            ...( 'order_id' in tx && tx.order_id ? { order_id: tx.order_id } : {}),
            observation_id: executionRecord.observation_id,
            opportunity_id: executionRecord.opportunity_id,
          };

          const explicitProvenance =
            'provenance' in tx && tx.provenance && typeof tx.provenance === 'object'
              ? tx.provenance as import('../types').FinancialProvenance
              : null;
          const provenance: import('../types').FinancialProvenance =
            explicitProvenance ??
            ('source' in tx && tx.source === 'ESI'
              ? {
                  source_kind: 'ESI_WALLET_TRANSACTION',
                  source_id: String(tx.transaction_id),
                  principal_scope: `character:${characterId}`,
                }
              : {
                  source_kind: 'EXECUTION_TRANSACTION',
                  source_id: String(tx.transaction_id),
                  principal_scope: `character:${characterId}`,
                });
          provenanceByTransactionId.set(tx.transaction_id, provenance);

          if (tx.is_buy) {
            buyList.push(ref);
          } else {
            sellList.push(ref);
          }
        }
      }

      return {
        buyTxs: buyList,
        sellTxs: sellList,
        typeId: foundTypeId,
        provenanceByTransactionId,
      };
    }

    // Default: use the transactions already correlated inside executionRecord.execution_outcome
    const buyTxs = [...executionRecord.execution_outcome.buy_transactions];
    const sellTxs = [...executionRecord.execution_outcome.sell_transactions];
    const provenanceByTransactionId = new Map<number, import('../types').FinancialProvenance>();
    for (const tx of [...buyTxs, ...sellTxs]) {
      provenanceByTransactionId.set(tx.transaction_id, {
        source_kind: 'EXECUTION_TRANSACTION',
        source_id: String(tx.transaction_id),
        principal_scope: `character:${characterId}`,
      });
    }
    const sampleTx = buyTxs[0] || sellTxs[0];
    const typeId = sampleTx ? sampleTx.type_id : 0;

    return { buyTxs, sellTxs, typeId, provenanceByTransactionId };
  }

  /**
   * Calculates fees using FeeEngine, distinguishing between observed, estimated, and unavailable.
   */
  private static calculateFees(
    realizedAcquisitionCost: number,
    realizedRevenue: number,
    options?: RealizedFinancialCalculationOptions
  ): RealizedFeeBreakdown {
    const config = options?.financialConfig;

    if (!config) {
      return {
        fee_mode: 'UNAVAILABLE',
        fee_source: 'UNAVAILABLE',
        execution_fee_mode: options?.executionFeeMode ?? 'UNKNOWN',
        estimated_buy_broker_fee: 0.0,
        estimated_sell_broker_fee: 0.0,
        estimated_sales_tax: 0.0,
        estimated_total_fees: 0.0,
        is_role_assumed: (options?.executionFeeMode ?? 'UNKNOWN') === 'UNKNOWN',
        notes: Object.freeze([
          'No financial configuration provided: fees and sales tax cannot be estimated',
        ]),
      };
    }

    // Resolve rates via FeeEngine
    const buyFeeRes = FeeEngine.resolveRates({
      config,
      locationProfile: options?.buyLocationProfile,
      isBuy: true,
    });
    const sellFeeRes = FeeEngine.resolveRates({
      config,
      locationProfile: options?.sellLocationProfile,
      isBuy: false,
    });

    const executionFeeMode: ExecutionFeeRoleMode = options?.executionFeeMode ?? 'UNKNOWN';

    // In EVE Online:
    // Taker = buying from existing sell order or selling to existing buy order (0% broker fee)
    // Maker = placing a limit order (broker fee applies)
    // If UNKNOWN, default to Taker buy (0% broker fee) and Taker sell (0% broker fee + sales tax applies)
    const isBuyMaker = executionFeeMode === 'MAKER_TAKER' || executionFeeMode === 'MAKER_MAKER';
    const isSellMaker = executionFeeMode === 'TAKER_MAKER' || executionFeeMode === 'MAKER_MAKER';

    const buyBrokerRate = FeeEngine.getExecutionBrokerRate(isBuyMaker, buyFeeRes.broker_fee_rate);
    const sellBrokerRate = FeeEngine.getExecutionBrokerRate(isSellMaker, sellFeeRes.broker_fee_rate);
    const salesTaxRate = sellFeeRes.sales_tax_rate;

    const estimatedBuyBrokerFee = FeeEngine.brokerCost(realizedAcquisitionCost, buyBrokerRate);
    const estimatedSellBrokerFee = FeeEngine.brokerCost(realizedRevenue, sellBrokerRate);
    const estimatedSalesTax = FeeEngine.salesTaxCost(realizedRevenue, salesTaxRate);
    const estimatedTotalFees = roundIsk(estimatedBuyBrokerFee + estimatedSellBrokerFee + estimatedSalesTax);

    const notes: string[] = [
      `Fee source: CONFIG_ESTIMATE (Sales Tax: ${(salesTaxRate * 100).toFixed(2)}%, Buy Broker: ${(buyBrokerRate * 100).toFixed(2)}%, Sell Broker: ${(sellBrokerRate * 100).toFixed(2)}%)`,
    ];

    const isRoleAssumed = executionFeeMode === 'UNKNOWN';

    if (isRoleAssumed) {
      notes.push(
        'Execution role unknown from wallet transactions: assumed Taker for baseline estimate (0% broker fee). True net profit may be lower if limit orders were placed as Maker.'
      );
    } else {
      notes.push(`Execution role specified: ${executionFeeMode}`);
    }

    return {
      fee_mode: 'ESTIMATED',
      fee_source: 'CONFIG_ESTIMATE',
      execution_fee_mode: executionFeeMode,
      estimated_buy_broker_fee: estimatedBuyBrokerFee,
      estimated_sell_broker_fee: estimatedSellBrokerFee,
      estimated_sales_tax: estimatedSalesTax,
      estimated_total_fees: estimatedTotalFees,
      is_role_assumed: isRoleAssumed,
      notes: Object.freeze(notes),
    };
  }

  /**
   * Helper method to attach RealizedFinancialOutcome to a CharacterExecutionRecord immutably.
   */
  static attachOutcome(
    executionRecord: CharacterExecutionRecord,
    options?: RealizedFinancialCalculationOptions
  ): CharacterExecutionRecord {
    const outcome = this.calculate(executionRecord, options);
    return Object.freeze({
      ...executionRecord,
      realized_financial_outcome: outcome,
    });
  }

  /**
   * Calculates realized financial outcome directly for a specific character and item type from transactions.
   * Ensures pure, deterministic causal FIFO calculation without requiring a pre-existing CharacterExecutionRecord.
   * 
   * @param characterId Character ID
   * @param typeId EVE Item Type ID
   * @param transactions Array of buy and sell transactions (supports ExecutionTransactionRef, PersistedCharacterTransaction, or raw transactions)
   * @param options Calculation options (FinancialConfig, fee profiles, execution fee mode, etc.)
   * @returns Pure immutable RealizedFinancialOutcome
   */
  static calculateForTransactions(
    characterId: number,
    typeId: number,
    transactions: readonly (ExecutionTransactionRef | PersistedCharacterTransaction | {
      transaction_id: number;
      date?: string;
      timestamp?: string;
      type_id: number;
      location_id: number;
      unit_price: number;
      quantity: number;
      is_buy: boolean;
      character_id?: number;
    })[],
    options?: RealizedFinancialCalculationOptions
  ): RealizedFinancialOutcome {
    if (!characterId || characterId <= 0) {
      throw new Error(
        `RealizedFinancialOutcomeEngine.calculateForTransactions requires a valid positive characterId. Received: ${characterId} (character_id=0 is reserved for fleet contexts and cannot be used for individual character calculations)`
      );
    }

    // Invariant: Direct cross-character isolation check across ALL provided transactions BEFORE any type_id filtering.
    // If ANY transaction contains a character_id different from characterId, immediately reject with
    // CrossCharacterFinancialMappingViolationError, regardless of its type_id.
    for (const tx of transactions) {
      const txCharId = 'character_id' in tx && tx.character_id !== undefined ? tx.character_id : characterId;
      if (txCharId !== characterId) {
        throw new CrossCharacterFinancialMappingViolationError(txCharId, characterId, tx.transaction_id);
      }
    }

    const refs: ExecutionTransactionRef[] = transactions
      .filter((tx) => tx.type_id === typeId)
      .map((tx) => {
        const ts =
          'timestamp' in tx && tx.timestamp
            ? tx.timestamp
            : ('date' in tx && tx.date ? tx.date : new Date(0).toISOString());
        return {
          transaction_id: tx.transaction_id,
          character_id: characterId,
          type_id: tx.type_id,
          location_id: tx.location_id,
          is_buy: tx.is_buy,
          quantity: tx.quantity,
          unit_price: tx.unit_price,
          timestamp: ts,
          ...( 'order_id' in tx && tx.order_id ? { order_id: tx.order_id } : {}),
        };
      });

    const buyTxs = refs.filter((r) => r.is_buy);
    const sellTxs = refs.filter((r) => !r.is_buy);
    const totalBuyQuantity = buyTxs.reduce((acc, b) => acc + b.quantity, 0);
    const totalSellQuantity = sellTxs.reduce((acc, s) => acc + s.quantity, 0);
    const totalBuyCost = buyTxs.reduce((acc, b) => acc + b.quantity * b.unit_price, 0);
    const totalSellRevenue = sellTxs.reduce((acc, s) => acc + s.quantity * s.unit_price, 0);

    const firstTime = refs[0]?.timestamp || new Date(0).toISOString();
    const lastTime = refs[refs.length - 1]?.timestamp || new Date(0).toISOString();

    const executionStatus =
      buyTxs.length > 0 && sellTxs.length > 0
        ? (totalSellQuantity >= totalBuyQuantity ? 'CLOSED' : 'SELL_PARTIAL')
        : (buyTxs.length > 0 ? 'BUY_FILLED' : 'PLANNED');

    const syntheticRecord: CharacterExecutionRecord = Object.freeze({
      execution_id: `exec_synth_${characterId}_${typeId}`,
      character_id: characterId,
      observation_id: `obs_synth_${typeId}`,
      opportunity_id: `opp_synth_${typeId}`,
      match_level: 'DIRECT_MATCH',
      transaction_ids: Object.freeze(refs.map((r) => r.transaction_id)),
      first_correlated_at: firstTime,
      last_updated_at: lastTime,
      correlation_engine_version: REALIZED_FINANCIAL_ENGINE_VERSION,
      data_state: 'VALID',
      execution_outcome: Object.freeze({
        execution_status: executionStatus,
        match_level: 'DIRECT_MATCH',
        planned_quantity: Math.max(totalBuyQuantity, totalSellQuantity),
        executed_buy_quantity: totalBuyQuantity,
        executed_sell_quantity: totalSellQuantity,
        remaining_inventory_quantity: Math.max(0, totalBuyQuantity - totalSellQuantity),
        buy_fill_ratio: 1.0,
        sell_fill_ratio: totalBuyQuantity > 0 ? Math.min(1.0, totalSellQuantity / totalBuyQuantity) : 0,
        vwap_buy_price: totalBuyQuantity > 0 ? totalBuyCost / totalBuyQuantity : null,
        vwap_sell_price: totalSellQuantity > 0 ? totalSellRevenue / totalSellQuantity : null,
        first_buy_at: buyTxs[0]?.timestamp || null,
        last_buy_at: buyTxs[buyTxs.length - 1]?.timestamp || null,
        first_sell_at: sellTxs[0]?.timestamp || null,
        last_sell_at: sellTxs[sellTxs.length - 1]?.timestamp || null,
        buy_transactions: Object.freeze(buyTxs),
        sell_transactions: Object.freeze(sellTxs),
        linked_order_ids: Object.freeze([]),
        candidate_observation_ids: Object.freeze([`obs_synth_${typeId}`]),
      }),
    });

    return this.calculate(syntheticRecord, {
      ...options,
      transactions,
    });
  }
}
