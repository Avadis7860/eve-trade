import {
  ExecutionTransactionRef,
  FinancialConfig,
} from '../../types';
import { RealizedFinancialOutcomeEngine } from '../realizedFinancialOutcome';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function tx(
  transaction_id: number,
  is_buy: boolean,
  quantity: number,
  unit_price: number,
  timestamp: string,
  character_id: number,
  accounting_scope_id?: string,
  extra: Partial<ExecutionTransactionRef> = {},
): ExecutionTransactionRef {
  return {
    transaction_id,
    character_id,
    type_id: 34,
    location_id: 60003760,
    is_buy,
    quantity,
    unit_price,
    timestamp,
    ...(accounting_scope_id ? { accounting_scope_id } : {}),
    provenance: {
      source_kind: 'ESI_WALLET_TRANSACTION',
      source_id: String(transaction_id),
      principal_scope: 'character:' + character_id,
    },
    ...extra,
  } as ExecutionTransactionRef;
}

const config: Partial<FinancialConfig> = {
  accounting_level: 5,
  broker_relations_level: 5,
  corp_standing: 0,
  faction_standing: 0,
  enable_transport_costs: false,
};

function run() {
  console.log('=== FIN-002 SELECTIVE ARCHIVE RECOVERY REGRESSION TESTS ===');

  // 1. Partial disposal: positive disposal result does not close the economic position.
  {
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(100, true, 10_000, 100, '2026-09-20T10:00:00Z', 1001),
      tx(200, false, 1, 140, '2026-09-21T10:00:00Z', 1001),
    ], { financialConfig: config, executionFeeMode: 'TAKER_TAKER' });

    assert(outcome.gross_realized_profit === 40, 'disposal-level gross result must be +40 ISK');
    assert(outcome.position_lifecycle === 'PARTIALLY_REALIZED', 'economic position remains partially realized');
    assert(outcome.position_remaining_quantity === 9_999, '9,999 units remain');
    assert(outcome.remaining_inventory_cost_basis === 999_900, 'remaining cost basis is preserved');
    assert(outcome.capital_committed === 1_000_000, 'full acquired capital remains committed');
    assert(outcome.cash_recovered === 140, 'only disposed cash is recovered');
    assert(outcome.capital_recovery_delta === -999_860, 'capital recovery remains negative');
    assert(outcome.position_segments[0].realized_gross_profit === 40, 'segment retains disposal result');
    assert(outcome.position_segments[0].lifecycle_status === 'PARTIALLY_REALIZED', 'segment is not closed by partial disposal');
  }

  // 2. Fee absence is not a numeric zero result.
  {
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(300, true, 100, 100, '2026-09-20T10:00:00Z', 1001),
      tx(301, false, 100, 120, '2026-09-20T11:00:00Z', 1001),
    ]);
    assert(outcome.fees === null, 'missing fee evidence must expose no fee breakdown');
    assert(outcome.net_realized_profit === null, 'net realized profit must be null without fee evidence');
    assert(outcome.roi === null, 'ROI must be null without net fee evidence');
    assert(outcome.margin === null, 'margin must be null without net fee evidence');
    assert(outcome.profit_per_unit === null, 'profit per unit must be null without net fee evidence');
  }

  // 3. Oversold / unmatched disposal never fabricates acquisition cost.
  {
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(400, false, 25, 150, '2026-09-20T10:00:00Z', 1001),
    ], { financialConfig: config });
    assert(outcome.unmatched_sell_quantity === 25, 'unmatched disposal quantity remains explicit');
    assert(outcome.has_unmatched_sell_quantity === true, 'oversold condition is retained');
    assert(outcome.realized_acquisition_cost === 0, 'no matched cost line exists');
    assert(outcome.gross_realized_profit === 0, 'unmatched disposal has no fabricated realized profit');
    assert(outcome.financial_completeness === 'PARTIAL', 'oversold result is PARTIAL');
    assert(outcome.position_lifecycle === 'UNKNOWN', 'no known acquisition means no closed position');
  }

  // 4. Explicit accounting scope permits cross-character economic allocation.
  {
    const scope = 'ecosystem:recovery-test';
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(500, true, 100, 100, '2026-09-20T10:00:00Z', 1001, scope),
      tx(501, false, 40, 140, '2026-09-20T11:00:00Z', 1002, scope),
    ], { financialConfig: config, accounting_scope_id: scope });

    assert(outcome.accounting_scope_id === scope, 'explicit accounting scope is preserved');
    assert(outcome.matched_quantity === 40, 'cross-character disposal is allocated inside shared scope');
    assert(outcome.position_segments[0].provenance.some(p => p.principal_scope === 'character:1001'), 'buy provenance is preserved');
    assert(outcome.position_segments[0].provenance.some(p => p.principal_scope === 'character:1002'), 'sell provenance is preserved');
  }

  // 5. Cross-character transactions without common scope remain rejected.
  {
    let thrown = false;
    try {
      RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
        tx(600, true, 100, 100, '2026-09-20T10:00:00Z', 1001),
        tx(601, false, 100, 140, '2026-09-20T11:00:00Z', 1002),
      ], { financialConfig: config });
    } catch {
      thrown = true;
    }
    assert(thrown, 'cross-character accounting without explicit common scope must be rejected');
  }

  // 6. Corporation ownership is explicit, not inferred from the observing character.
  {
    const scope = 'corp:9001';
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      {
        ...tx(700, true, 500, 100, '2026-09-20T10:00:00Z', 1001, scope),
        economic_owner_type: 'corporation',
        economic_owner_id: 9001,
      },
      tx(701, false, 50, 140, '2026-09-20T11:00:00Z', 1002, scope),
    ], { financialConfig: config, accounting_scope_id: scope });

    const lot = outcome.position_segments[0].lots[0];
    assert(lot.economic_owner_type === 'corporation', 'corporation ownership remains explicit');
    assert(lot.economic_owner_id === 9001, 'corporation owner ID remains explicit');
    assert(lot.provenance.principal_scope === 'character:1001', 'observing character remains provenance');
  }

  // 7. Missing coverage evidence remains UNKNOWN rather than overstating completeness.
  {
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(800, true, 10, 100, '2026-09-20T10:00:00Z', 1001),
      tx(801, false, 10, 140, '2026-09-20T11:00:00Z', 1001),
    ], { financialConfig: config });

    assert(outcome.history_coverage === 'UNKNOWN', 'history coverage defaults to UNKNOWN');
    assert(outcome.economic_origin_coverage === 'UNKNOWN', 'economic origin coverage defaults to UNKNOWN');
    assert(outcome.position_segments[0].position_completeness === 'PARTIAL', 'unknown coverage blocks observed completeness');
    assert(outcome.source_coverage === 'MARKET_TRACEABLE', 'transaction cost lineage can remain traceable');
  }

  // 8. Complete coverage upgrades position completeness without changing financial semantics.
  {
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(900, true, 10, 100, '2026-09-20T10:00:00Z', 1001),
      tx(901, false, 10, 140, '2026-09-20T11:00:00Z', 1001),
    ], {
      financialConfig: config,
      accounting_scope_id: 'character:1001',
      coverage_evidence: {
        history_coverage: 'COMPLETE_FOR_SCOPE',
        economic_origin_coverage: 'COMPLETE_FOR_SCOPE',
      },
    });
    assert(outcome.position_segments[0].position_completeness === 'OBSERVED', 'complete evidence permits OBSERVED position completeness');
    assert(outcome.position_lifecycle === 'CLOSED', 'full disposal closes the economic position');
  }

  // 9. Market-order identity is optional correlation only; economic calculation uses transaction direction.
  {
    const outcome = RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      tx(1000, true, 10, 100, '2026-09-20T10:00:00Z', 1001, undefined, { order_id: '1234567890123456789' as any }),
      tx(1001, false, 10, 140, '2026-09-20T11:00:00Z', 1001, undefined, { order_id: '9876543210987654321' as any }),
    ], { financialConfig: config });

    assert(outcome.fifo_allocations[0].buy_transaction_id === 1000, 'accounting direction comes from transaction fact');
    assert(outcome.fifo_allocations[0].sell_transaction_id === 1001, 'disposal direction comes from transaction fact');
    assert(outcome.fifo_allocations[0].provenance.source_id === '1001', 'disposal provenance uses transaction source ID');
  }

  console.log('[PASS] FIN-002 selective recovery financial invariants validated.');
}

run();