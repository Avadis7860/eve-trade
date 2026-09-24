import {
  ExecutionTransactionRef,
} from '../../types';
import { reconstructPositionLedger } from '../positionLedger';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function tx(
  transaction_id: number,
  is_buy: boolean,
  quantity: number,
  unit_price: number,
  timestamp: string,
  character_id = 1001,
  accounting_scope_id?: string,
): ExecutionTransactionRef & { provenance: { source_kind: 'ESI_WALLET_TRANSACTION'; source_id: string; principal_scope: string } } {
  return {
    transaction_id,
    type_id: 34,
    location_id: 60003760,
    is_buy,
    quantity,
    unit_price,
    timestamp,
    character_id,
    ...(accounting_scope_id ? { accounting_scope_id } : {}),
    provenance: {

      source_kind: 'ESI_WALLET_TRANSACTION',
      source_id: String(transaction_id),
      principal_scope: 'character:' + String(character_id),
    },
  };
}

function run() {
  console.log('=== FIN-001 ACQUISITION LOT / POSITION LEDGER TESTS ===');

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(100, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(200, false, 1, 140, '2026-09-21T10:00:00Z'),
    ]);
    const p = result.position;

    assert(p.quantity_acquired === 10_000, 'acquisition quantity must remain 10,000');
    assert(p.quantity_disposed === 1, 'only the disposed unit must be recognized as disposed');
    assert(p.remaining_quantity === 9_999, '9,999 units must remain open');
    assert(p.remaining_cost_basis === 999_900, 'remaining cost basis must remain 999,900 ISK');
    assert(p.realized_gross_profit === 40, 'realized gross profit must be +40 ISK');

    assert(p.capital_committed === 1_000_000, 'capital committed must be 1,000,000 ISK');
    assert(p.cash_recovered === 140, 'cash recovered must be 140 ISK');
    assert(p.capital_recovery_delta === -999_860, 'capital recovery delta must be -999,860 ISK');
    assert(
      p.capital_recovery_ratio !== null &&
        Math.abs(p.capital_recovery_ratio - 0.00014) < Number.EPSILON,
      'capital recovery ratio must be approximately 0.014%'
    );

    assert(p.lifecycle_status === 'PARTIALLY_REALIZED', 'large position must remain partially realized');
    assert(p.lots.length === 1 && p.lots[0].remaining_quantity === 9_999, 'lot must retain 9,999 units');
    assert(p.allocations.length === 1 && p.allocations[0].allocated_quantity === 1, 'one disposal allocation must exist');
    assert(p.lots[0].provenance.source_kind === 'ESI_WALLET_TRANSACTION', 'lot source kind must remain explicit');
    assert(p.allocations[0].provenance.source_id === '200', 'disposal provenance must preserve transaction source ID');
    assert(p.allocations[0].provenance.principal_scope === 'character:1001', 'disposal provenance must preserve principal scope');
    assert(p.provenance.length === 2, 'position provenance must expose both acquisition and disposal sources');
    assert(p.provenance[0].source_id === '100', 'position provenance must be deterministic by source identity');
    assert(p.provenance[1].source_id === '200', 'position provenance must retain the disposal source identity');
    assert(p.disposition_states[0].operation_id !== undefined, 'partial disposal must identify its economic operation');
    assert(p.disposition_states[0].operation_capital_committed === 1_000_000, 'operation capital must include the full acquisition');
    assert(p.disposition_states[0].operation_cash_recovered === 140, 'operation cash recovery must be cumulative');
    assert(p.disposition_states[0].operation_recovery_delta === -999_860, 'operation recovery delta must remain negative after one sale');
    assert(p.disposition_states[0].operation_recovery_state === 'NEGATIVE', 'operation recovery state must remain negative');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(310, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(320, false, 10_000, 140, '2026-09-21T10:00:00Z'),
      tx(330, true, 10_000, 100, '2026-09-22T10:00:00Z'),
      tx(340, false, 1, 50, '2026-09-23T10:00:00Z'),
    ]);
    const [firstOperation, secondOperation] = result.all_disposition_states;
    assert(firstOperation.lifecycle_status === 'CLOSED', 'a later acquisition must not keep the earlier operation open');
    assert(firstOperation.operation_recovery_state === 'POSITIVE', 'closed operation should expose positive recovery state');
    assert(firstOperation.operation_recovery_delta === 400_000, 'first operation recovery delta must use its own capital');
    assert(secondOperation.lifecycle_status === 'PARTIALLY_REALIZED', 'second operation must remain partial');
    assert(secondOperation.operation_recovery_delta === -999_950, 'second operation recovery must use its own capital');
    assert(secondOperation.operation_id !== firstOperation.operation_id, 'a new operation must start after full liquidation');
    assert(secondOperation.remaining_position_quantity === 9_999, 'second operation must retain 9,999 units');
    assert(result.position_segments.length === 2, 'each sequential economic position segment must remain separately addressable');
    assert(result.position_segments[0].capital_committed === 1_000_000, 'first segment capital must remain isolated');
    assert(result.position_segments[0].cash_recovered === 1_400_000, 'first segment recovery must remain isolated');
    assert(result.position_segments[1].capital_committed === 1_000_000, 'second segment capital must remain isolated');
    assert(result.position_segments[1].cash_recovered === 50, 'second segment recovery must remain isolated');
    assert(result.position.position_segment_id === result.position_segments[1].position_segment_id, 'current position must point to the active segment');
    assert(result.position.capital_recovery_delta === -999_950, 'current position recovery must not include the closed segment');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(401, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(402, false, 7_143, 140, '2026-09-21T10:00:00Z'),
    ]);
    const state = result.position.disposition_states[0];
    assert(state.lifecycle_status === 'PARTIALLY_REALIZED', 'recovery can be positive before physical closure');
    assert(state.remaining_position_quantity === 2_857, '2,857 units remain after 7,143 disposals');
    assert(state.operation_recovery_delta === 20, '7,143 sales recover 1,000,020 ISK against 1,000,000 capital');
    assert(state.operation_recovery_state === 'POSITIVE', 'operation can be positive while partially realized');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(101, true, 1_000, 100, '2026-09-20T10:00:00Z'),
      tx(201, false, 1_000, 140, '2026-09-21T10:00:00Z'),
    ]);
    assert(result.position.lifecycle_status === 'CLOSED', 'position must close only at zero remaining quantity');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(101, true, 1_000, 100, '2026-09-20T10:00:00Z'),
      tx(102, true, 1_000, 120, '2026-09-20T11:00:00Z'),
      tx(201, false, 1_500, 150, '2026-09-20T12:00:00Z'),
    ]);
    const [first, second] = result.position.allocations;
    assert(first.acquisition_lot_id === 'acquisition_101', 'FIFO must consume first acquisition lot first');
    assert(first.allocated_quantity === 1_000, 'first lot must contribute 1,000 units');
    assert(second.acquisition_lot_id === 'acquisition_102', 'second lot must contribute the remainder');
    assert(second.allocated_quantity === 500, 'second lot must contribute 500 units');
    assert(result.position.remaining_quantity === 500, '500 units must remain');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(201, false, 10, 150, '2026-09-20T10:00:00Z'),
      tx(101, true, 10, 100, '2026-09-20T11:00:00Z'),
    ]);
    assert(result.position.unmatched_disposition_quantity === 10, 'disposition before acquisition must remain unmatched');
    assert(result.position.financial_completeness === 'PARTIAL', 'causal inventory deficit must be PARTIAL');
    assert(result.position.realized_gross_profit === 0, 'unmatched disposition must not fabricate profit');
    assert(result.position.capital_committed === 1_000, 'the later valid acquisition still contributes known committed capital');
    assert(result.position.cash_recovered === 0, 'the unmatched earlier disposal contributes no allocated recovery');
    assert(result.position.capital_recovery_delta === -1_000, 'recovery delta reflects known capital with no allocated recovery yet');
    assert(result.position.capital_recovery_ratio === 0, 'zero recovery is valid when known committed capital has no allocated disposals');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      tx(101, true, 10, 100, '2026-09-20T10:00:00Z'),
      tx(201, false, 4, 140, '2026-09-20T11:00:00Z'),
      tx(202, false, 6, 130, '2026-09-20T12:00:00Z'),
    ]);
    assert(result.position.remaining_quantity === 0, 'all acquired inventory must be disposed');
    assert(result.position.lifecycle_status === 'CLOSED', 'position must close after final disposal');
    assert(result.position.disposition_states[0].lifecycle_status === 'PARTIALLY_REALIZED', 'first disposal must remain partial');
    assert(result.position.disposition_states[1].lifecycle_status === 'CLOSED', 'final disposal closes the position');
  }

  {
    const result = reconstructPositionLedger(1001, 34, [
      { ...tx(101, true, 5, 100, '2026-09-20T10:00:00Z'), quantity: 0 },
      tx(201, false, 1, 130, '2026-09-20T11:00:00Z'),
    ]);
    assert(result.position.financial_completeness === 'PARTIAL', 'invalid source data must remain partial');
    assert(result.position.invalid_transaction_ids.includes(101), 'invalid acquisition must be identified');
    assert(result.position.unmatched_disposition_quantity === 1, 'unmatched sale quantity must remain explicit');
  }

  {
    const unprovenanced = tx(301, true, 2, 50, '2026-09-20T10:00:00Z') as any;
    delete unprovenanced.provenance;
    const result = reconstructPositionLedger(1001, 34, [unprovenanced]);
    assert(result.position.financial_completeness === 'PARTIAL', 'missing provenance must keep the position partial');
    assert(result.position.invalid_transaction_ids.includes(301), 'missing provenance transaction must be rejected explicitly');
    assert(result.position.quantity_acquired === 0, 'unprovenanced acquisition must not enter economic inventory');
  }

  {
    const result = reconstructPositionLedger('ecosystem:test', 34, [
      tx(401, true, 10_000, 100, '2026-09-20T10:00:00Z', 1001, 'ecosystem:test'),
      tx(402, false, 1, 140, '2026-09-20T11:00:00Z', 1002, 'ecosystem:test'),
    ]);
    assert(result.position.remaining_quantity === 9_999, 'shared ecosystem inventory must be consumable by another character');
    assert(result.position.lifecycle_status === 'PARTIALLY_REALIZED', 'cross-character partial disposal must preserve lifecycle');
    assert(result.position.lots[0].provenance.principal_scope === 'character:1001', 'acquisition provenance remains on character A');
    assert(result.position.allocations[0].provenance.principal_scope === 'character:1002', 'disposal provenance remains on character B');
    assert(result.position.accounting_scope_id === 'ecosystem:test', 'position uses explicit accounting scope');
  }

  {
    const corporationBuy = {
      transaction_id: 601,
      character_id: 1001,
      type_id: 34,
      location_id: 60003760,
      is_buy: true,
      quantity: 500,
      unit_price: 100,
      timestamp: '2026-09-20T10:00:00Z',
      accounting_scope_id: 'ecosystem:test',
      economic_owner_type: 'corporation' as const,
      economic_owner_id: 9001,
      provenance: {
        source_kind: 'ESI_WALLET_TRANSACTION' as const,
        source_id: '601',
        principal_scope: 'character:1001',
      },
    };
    const characterSell = tx(602, false, 50, 140, '2026-09-20T11:00:00Z', 1002, 'ecosystem:test');
    const result = reconstructPositionLedger('ecosystem:test', 34, [corporationBuy, characterSell]);
    assert(result.position.allocations.length === 1, 'corporation acquisition must feed character disposal');
    assert(result.position.remaining_quantity === 450, '450 corporation-acquired units must remain');
    assert(result.position.lots[0].economic_owner_type === 'corporation', 'owner attribution remains corporation');
    assert(result.position.lots[0].economic_owner_id === 9001, 'corporation owner identity remains explicit');
    assert(result.position.allocations[0].provenance.principal_scope === 'character:1002', 'character seller remains provenance only');
  }

  {
    const result = reconstructPositionLedger('ecosystem:test', 34, [
      tx(501, true, 10, 100, '2026-09-20T10:00:00Z', 1001, 'ecosystem:test'),
      tx(502, false, 10, 150, '2026-09-20T11:00:00Z', 1002, 'ecosystem:other'),
    ]);
    assert(result.position.allocations.length === 0, 'different economic scopes must not be matched');
    assert(result.position.invalid_transaction_ids.includes(502), 'scope mismatch must remain explicit');
    assert(result.position.source_coverage === 'PARTIAL', 'scope mismatch must degrade source coverage');
  }


  {
    const buy = tx(701, true, 100, 100, '2026-09-20T10:00:00Z');
    const sell = { ...tx(702, false, 100, 140, '2026-09-20T11:00:00Z'), location_id: 60008494 };
    const result = reconstructPositionLedger('ecosystem:location-test', 34, [
      { ...buy, accounting_scope_id: 'ecosystem:location-test' },
      { ...sell, accounting_scope_id: 'ecosystem:location-test' },
    ]);
    assert(result.position.allocations.length === 1, 'cross-location disposal may be allocated when economic lineage is otherwise known');
    assert(result.position.unreconciled_location_transition_count === 1, 'missing transfer evidence must be counted');
    assert(result.position.source_coverage === 'PARTIAL', 'unsupported cross-location lineage precision must degrade source coverage');
    assert(result.position.position_completeness === 'PARTIAL', 'position completeness must follow economic lineage coverage');
  }

  {
    const transactions = [
      tx(901, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(902, false, 1, 140, '2026-09-20T11:00:00Z'),
    ];
    const result = reconstructPositionLedger('ecosystem:coverage-complete', 34, transactions, {
      history_coverage: 'COMPLETE_FOR_SCOPE',
      economic_origin_coverage: 'COMPLETE_FOR_SCOPE',
    });
    assert(result.position.history_coverage === 'COMPLETE_FOR_SCOPE', 'explicit complete history coverage must be preserved');
    assert(
      result.position.economic_origin_coverage === 'COMPLETE_FOR_SCOPE',
      'explicit economic-origin coverage must be preserved',
    );
    assert(
      result.position.position_completeness === 'OBSERVED',
      'complete coverage can produce an observed position-completeness state',
    );
  }

  {
    const result = reconstructPositionLedger('ecosystem:coverage-unknown', 34, [
      tx(911, true, 10_000, 100, '2026-09-20T10:00:00Z'),
      tx(912, false, 1, 140, '2026-09-20T11:00:00Z'),
    ]);
    assert(
      result.position.history_coverage === 'UNKNOWN',
      'missing history evidence must remain UNKNOWN even for coherent transaction data',
    );
    assert(
      result.position.economic_origin_coverage === 'UNKNOWN',
      'missing economic-origin evidence must remain UNKNOWN',
    );
    assert(
      result.position.position_completeness === 'PARTIAL',
      'unknown coverage must prevent an observed completeness claim',
    );
    assert(
      result.position.source_coverage === 'MARKET_TRACEABLE',
      'market cost lineage can remain traceable independently of broader coverage',
    );
  }

  {
    const result = reconstructPositionLedger('ecosystem:owner-boundary', 34, [
      tx(921, true, 10, 100, '2026-09-20T10:00:00Z', 1001, 'ecosystem:owner-boundary'),
    ]);
    assert(
      result.position.economic_owner_type === 'unknown',
      'observer character must not be inferred as economic owner without explicit ownership evidence',
    );
    assert(
      result.position.economic_owner_id === null,
      'economic owner ID must remain unknown without explicit ownership evidence',
    );
  }

  console.log('[PASS] FIN-001 position ledger scenarios validated.');
}

run();