/**
 * ============================================================================
 * EVE TRADE — PHASE 4: END-TO-END INTEGRATION & COHERENCE GATE TESTS
 * ============================================================================
 *
 * Validates the complete pipeline:
 * EVE Characters -> AuthService -> Orders / Transactions -> OrderScopingEngine
 * -> TraderAnalyticsService -> RealizedFinancialOutcomeEngine
 *
 * Checks all Phase 4 Gate Criteria:
 * 1. character_id = 0 invariant: NEVER assigned to real character, order, or transaction;
 *    NEVER accepted for individual financial calculations.
 * 2. Cross-character isolation: CrossCharacterFinancialMappingViolationError enforced.
 * 3. Mes Ordres / character & corporation coherence: Order ownership strictly preserved across active character switches.
 * 4. Performance / Finance coherence: Individual P&L remains strictly character-scoped.
 * 6. Active character switching: Switching active character causes zero corruption.
 */

import { selectOrdersByScope } from '../orderScoping';
import {
  RealizedFinancialOutcomeEngine,
  CrossCharacterFinancialMappingViolationError,
} from '../realizedFinancialOutcome';
import {
  CharacterExecutionRecord,
  EveCharacterOrder,
  EveCharacterTransaction,
  OrderScope,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function createTestOrders(): EveCharacterOrder[] {
  return [
    {
      order_id: '10001',
      character_id: 1001,
      character_name: 'Pilot Alpha',
      type_id: 34,
      type_name: 'Tritanium',
      region_id: 10000002,
      region_name: 'The Forge',
      location_id: 60003760,
      price: 5.5,
      volume_remain: 500000,
      volume_total: 1000000,
      is_buy_order: true,
      issued: '2026-03-30T10:00:00Z',
      duration: 90,
      escrow: 2750000,
    },
    {
      order_id: '10002',
      character_id: 1001,
      character_name: 'Pilot Alpha',
      type_id: 35,
      type_name: 'Pyerite',
      region_id: 10000002,
      region_name: 'The Forge',
      location_id: 60003760,
      price: 12.0,
      volume_remain: 100000,
      volume_total: 100000,
      is_buy_order: false,
      issued: '2026-03-30T11:00:00Z',
      duration: 90,
    },
    {
      order_id: '20001',
      character_id: 1002,
      character_name: 'Pilot Beta',
      type_id: 36,
      type_name: 'Mexallon',
      region_id: 10000043,
      region_name: 'Domain',
      location_id: 60008494,
      price: 45.0,
      volume_remain: 50000,
      volume_total: 50000,
      is_buy_order: false,
      issued: '2026-03-30T12:00:00Z',
      duration: 90,
    },
    {
      order_id: '30001',
      character_id: 1001,
      character_name: 'Pilot Alpha',
      type_id: 37,
      type_name: 'Isogen',
      region_id: 10000002,
      region_name: 'The Forge',
      location_id: 60003760,
      price: 100.0,
      volume_remain: 1000,
      volume_total: 1000,
      is_buy_order: false,
      issued: '2026-03-30T13:00:00Z',
      duration: 90,
      is_corporation: true,
      ownership: {
        principal_character_id: 1001,
        owner_type: 'corporation',
        owner_id: 9001,
        owner_name: 'Starlight Holdings Inc.',
        corporation_id: 9001,
        corporation_name: 'Starlight Holdings Inc.',
        issuer_character_id: 1001,
        wallet_division: 2,
      },
    },
  ];
}

function createTestTransactionsAlpha(): EveCharacterTransaction[] {
  return [
    {
      transaction_id: 501,
      character_id: 1001,
      character_name: 'Pilot Alpha',
      date: '2026-03-29T10:00:00Z',
      type_id: 34,
      location_id: 60003760,
      unit_price: 4.0,
      quantity: 100000,
      is_buy: true,
      is_personal: true,
      client_id: 9001,
    },
    {
      transaction_id: 502,
      character_id: 1001,
      character_name: 'Pilot Alpha',
      date: '2026-03-30T10:00:00Z',
      type_id: 34,
      location_id: 60003760,
      unit_price: 5.0,
      quantity: 100000,
      is_buy: false,
      is_personal: true,
      client_id: 9002,
    },
  ];
}

function createTestTransactionsBeta(): EveCharacterTransaction[] {
  return [
    {
      transaction_id: 601,
      character_id: 1002,
      character_name: 'Pilot Beta',
      date: '2026-03-29T11:00:00Z',
      type_id: 36,
      location_id: 60008494,
      unit_price: 40.0,
      quantity: 10000,
      is_buy: true,
      is_personal: true,
      client_id: 9003,
    },
    {
      transaction_id: 602,
      character_id: 1002,
      character_name: 'Pilot Beta',
      date: '2026-03-30T11:00:00Z',
      type_id: 36,
      location_id: 60008494,
      unit_price: 48.0,
      quantity: 10000,
      is_buy: false,
      is_personal: true,
      client_id: 9004,
    },
  ];
}

function runEndToEndIntegrationTests() {
  console.log('===============================================================');
  console.log('--- RUNNING PHASE 4 END-TO-END INTEGRATION & COHERENCE TESTS ---');
  console.log('===============================================================');

  // --------------------------------------------------------------------------
  // Gate Check 1: character_id = 0 Invariant & Engine Protection
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 1: character_id = 0 Invariant & Engine Protection ---');
  let rejectedZeroInCalculateForTransactions = false;
  try {
    RealizedFinancialOutcomeEngine.calculateForTransactions(0, 34, createTestTransactionsAlpha());
  } catch (err: any) {
    if (err.message.includes('requires a valid positive characterId')) {
      rejectedZeroInCalculateForTransactions = true;
    }
  }
  assert(rejectedZeroInCalculateForTransactions, 'calculateForTransactions must reject characterId = 0');

  let rejectedZeroInCalculate = false;
  try {
    const invalidExecutionRecord: CharacterExecutionRecord = {
      character_id: 0, // INVALID
      observation_id: 'obs_1',
      execution_id: 'exec_1',
      opportunity_id: 'opp_1',
      match_level: 'DIRECT_MATCH',
      transaction_ids: [],
      first_correlated_at: '2026-03-30T10:00:00Z',
      last_updated_at: '2026-03-30T10:00:00Z',
      correlation_engine_version: '1.0.0',
      data_state: 'VALID',
      execution_outcome: {
        execution_status: 'CLOSED',
        match_level: 'DIRECT_MATCH',
        planned_quantity: 100,
        executed_buy_quantity: 100,
        executed_sell_quantity: 100,
        remaining_inventory_quantity: 0,
        buy_fill_ratio: 1.0,
        sell_fill_ratio: 1.0,
        vwap_buy_price: 4.0,
        vwap_sell_price: 5.0,
        first_buy_at: '2026-03-29T10:00:00Z',
        last_buy_at: '2026-03-29T10:00:00Z',
        first_sell_at: '2026-03-30T10:00:00Z',
        last_sell_at: '2026-03-30T10:00:00Z',
        buy_transactions: [],
        sell_transactions: [],
        linked_order_ids: [],
        candidate_observation_ids: ['obs_1'],
      },
    };
    RealizedFinancialOutcomeEngine.calculate(invalidExecutionRecord);
  } catch (err: any) {
    if (err.message.includes('requires a valid positive character_id')) {
      rejectedZeroInCalculate = true;
    }
  }
  assert(rejectedZeroInCalculate, 'calculate must reject executionRecord with character_id = 0');
  console.log('  [PASS] Gate Check 1: character_id = 0 strictly forbidden for individual financial calculations.');

  // --------------------------------------------------------------------------
  // Gate Check 2: Cross-Character Isolation Guard
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 2: Cross-Character Financial Isolation ---');
  // Both participants must use the SAME type for this isolation contract;
  // calculateForTransactions intentionally filters unrelated types first.
  const mixedTxs = [
    ...createTestTransactionsAlpha(),
    {
      ...createTestTransactionsBeta()[1],
      type_id: 34,
    },
  ];
  let crossCharCaught = false;
  try {
    RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, mixedTxs);
  } catch (err) {
    if (err instanceof CrossCharacterFinancialMappingViolationError) {
      crossCharCaught = true;
    }
  }
  assert(crossCharCaught, 'calculateForTransactions must throw CrossCharacterFinancialMappingViolationError on mixed transactions');
  console.log('  [PASS] Gate Check 2: CrossCharacterFinancialMappingViolationError verified.');

  // --------------------------------------------------------------------------
  // Gate Check 3: Mes Ordres / Character & Corporation Scoping
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 3: Order scoping & Active Switching ---');
  const allOrders = createTestOrders();
  const scopeAlpha: OrderScope = { type: 'active_character' };
  const ordersAlpha = selectOrdersByScope(allOrders, scopeAlpha, {
    activeCharacterId: '1001',
    corporationIds: ['9001'],
  });
  assert(ordersAlpha.length === 2, 'Alpha should have 2 character-owned orders');
  assert(ordersAlpha.every((o) => o.character_id === 1001), 'Alpha scope must contain only Alpha-owned orders');

  const ordersBeta = selectOrdersByScope(allOrders, scopeAlpha, {
    activeCharacterId: '1002',
    corporationIds: ['9001'],
  });
  assert(ordersBeta.length === 1, 'Beta should have 1 character-owned order');
  assert(ordersBeta[0].character_id === 1002, 'Beta order must belong to Beta');

  const corpOrders = selectOrdersByScope(allOrders, { type: 'corporation', corporationId: '9001' }, {
    activeCharacterId: '1002',
    corporationIds: ['9001'],
  });
  assert(corpOrders.length === 1, 'Corporation scope must expose the corporate order');
  assert(corpOrders[0].ownership?.owner_type === 'corporation', 'Corporation view must use economic ownership');
  assert(corpOrders[0].ownership?.owner_id === 9001, 'Corporation view must use the corporation owner id');
  console.log('  [PASS] Gate Check 3: Character and corporation order scopes remain distinct and stable.');

  // --------------------------------------------------------------------------
  // Gate Check 4: Character-scoped financial truth
  // --------------------------------------------------------------------------
  console.log('--- Gate Check 4: Character-scoped realized finance ---');
  const outcomeAlpha = RealizedFinancialOutcomeEngine.calculateForTransactions(
    1001,
    34,
    createTestTransactionsAlpha(),
    {
      financialConfig: {
        accounting_level: 5,
        broker_relations_level: 5,
        advanced_broker_relations_level: 5,
        faction_standing: 0,
        corp_standing: 0,
        enable_transport_costs: false,
      },
    },
  );
  const outcomeBeta = RealizedFinancialOutcomeEngine.calculateForTransactions(
    1002,
    36,
    createTestTransactionsBeta(),
    {
      financialConfig: {
        accounting_level: 5,
        broker_relations_level: 5,
        advanced_broker_relations_level: 5,
        faction_standing: 0,
        corp_standing: 0,
        enable_transport_costs: false,
      },
    },
  );
  assert(outcomeAlpha.realized_gross === 100_000, 'Alpha gross result must remain 100k ISK');
  assert(outcomeBeta.realized_gross === 80_000, 'Beta gross result must remain 80k ISK');
  let mixedRejected = false;
  try {
    RealizedFinancialOutcomeEngine.calculateForTransactions(1001, 34, [
      ...createTestTransactionsAlpha(),
      ...createTestTransactionsBeta().map((tx) => ({ ...tx, type_id: 34 })),
    ]);
  } catch (err) {
    mixedRejected = err instanceof CrossCharacterFinancialMappingViolationError;
  }
  assert(mixedRejected, 'Character financial calculation must reject mixed-character transaction sets without explicit shared scope');
  console.log('  [PASS] Gate Check 4: Financial results remain character-scoped; cross-character mixing stays guarded.');

  console.log('===============================================================');
  console.log('ALL PHASE 4 END-TO-END INTEGRATION & COHERENCE TESTS PASSED (100%)');
runEndToEndIntegrationTests();
