import { selectOrdersByScope, createOrderCollection } from '../orderScoping';
import {
  EveCharacterOrder,
  OrderScope,
  OrderSelectionContext,
  OrderCollection,
  OrderCharacterContext,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function runOrderScopingTests() {
  console.log('===============================================================');
  console.log('--- RUNNING PHASE 2 ORDER SCOPING & CONTRACT TESTS ---');
  console.log('===============================================================');

  const orderA: EveCharacterOrder = {
    order_id: '101',
    character_id: 1001,
    character_name: 'Trader Alpha',
    type_id: 34,
    type_name: 'Tritanium',
    region_id: 10000002,
    region_name: 'The Forge',
    location_id: 60003760,
    location_name: 'Jita IV-4',
    price: 5.5,
    volume_remain: 100000,
    volume_total: 100000,
    is_buy_order: true,
    issued: '2026-09-20T12:00:00Z',
    duration: 90,
    ownership: {
      principal_character_id: 1001,
      owner_type: 'character',
      owner_id: 1001,
      owner_name: 'Trader Alpha',
    },
    escrow: 550000,
  };

  const orderB: EveCharacterOrder = {
    order_id: '202',
    character_id: 1002,
    character_name: 'Trader Beta',
    type_id: 35,
    type_name: 'Pyerite',
    region_id: 10000043,
    region_name: 'Domain',
    location_id: 60008494,
    location_name: 'Amarr VIII',
    price: 12.0,
    volume_remain: 50000,
    volume_total: 50000,
    is_buy_order: false,
    issued: '2026-09-20T12:30:00Z',
    ownership: {
      principal_character_id: 1002,
      owner_type: 'character',
      owner_id: 1002,
      owner_name: 'Trader Beta',
    },
    duration: 90,
  };

  const orderC_NonFleet: EveCharacterOrder = {
    order_id: '303',
    character_id: 9999,
    character_name: 'External Alt',
    type_id: 36,
    type_name: 'Mexallon',
    region_id: 10000002,
    region_name: 'The Forge',
    location_id: 60003760,
    location_name: 'Jita IV-4',
    price: 85.0,
    volume_remain: 1000,
    volume_total: 1000,
    is_buy_order: false,
    issued: '2026-09-20T13:00:00Z',
    ownership: {
      principal_character_id: 9999,
      owner_type: 'character',
      owner_id: 9999,
      owner_name: 'External Alt',
    },
    duration: 90,
  };

  const corporateOrder: EveCharacterOrder = {
    order_id: '404',
    character_id: 1001,
    character_name: 'Trader Alpha',
    type_id: 34,
    type_name: 'Tritanium',
    region_id: 10000002,
    region_name: 'The Forge',
    location_id: 60003760,
    location_name: 'Jita IV-4',
    price: 6.0,
    volume_remain: 500,
    volume_total: 500,
    is_buy_order: false,
    issued: '2026-09-20T13:30:00Z',
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
  };

  const legacyCorporateOrder: EveCharacterOrder = {
    ...corporateOrder,
    order_id: '405',
    ownership: undefined,
  };

  const allOrders = [orderA, orderB, orderC_NonFleet, corporateOrder, legacyCorporateOrder];

  const context: OrderSelectionContext = {
    activeCharacterId: '1001',
    fleetCharacterIds: ['1001', '1002'],
    corporationIds: ['9001'],
  };

  // 1. Test active_character
  console.log('--- Test 1: Scope active_character ---');
  const activeOrders = selectOrdersByScope(allOrders, { type: 'active_character' }, context);
  assert(activeOrders.length === 1, `Expected 1 active order, got ${activeOrders.length}`);
  assert(activeOrders[0] === orderA, 'Order reference must match orderA');
  assert(activeOrders[0].character_id === 1001, 'Character ID must remain 1001');
  assert(activeOrders[0].character_name === 'Trader Alpha', 'Character Name must remain Trader Alpha');
  console.log('  [PASS] Test 1: Scope active_character returned only active character orders.');

  // 2. Test specific character A
  console.log('--- Test 2: Scope character A (1001) ---');
  const charAOrders = selectOrdersByScope(allOrders, { type: 'character', characterId: '1001' }, context);
  assert(charAOrders.length === 1, `Expected 1 order for character 1001, got ${charAOrders.length}`);
  assert(charAOrders[0] === orderA, 'Order reference must match orderA');
  assert(charAOrders[0].character_id === 1001, 'Character ID must remain 1001');
  console.log('  [PASS] Test 2: Scope character A returned only character A orders.');

  // 3. Test specific character B
  console.log('--- Test 3: Scope character B (1002) ---');
  const charBOrders = selectOrdersByScope(allOrders, { type: 'character', characterId: '1002' }, context);
  assert(charBOrders.length === 1, `Expected 1 order for character 1002, got ${charBOrders.length}`);
  assert(charBOrders[0] === orderB, 'Order reference must match orderB');
  assert(charBOrders[0].character_id === 1002, 'Character ID must remain 1002');
  assert(charBOrders[0].character_name === 'Trader Beta', 'Character Name must remain Trader Beta');
  console.log('  [PASS] Test 3: Scope character B returned only character B orders.');

  // 4. Test fleet scope
  console.log('--- Test 4: Scope fleet ---');
  const fleetOrders = selectOrdersByScope(allOrders, { type: 'fleet' }, context);
  assert(fleetOrders.length === 2, `Expected 2 fleet orders, got ${fleetOrders.length}`);
  assert(fleetOrders[0] === orderA, 'First order must be orderA');
  assert(fleetOrders[1] === orderB, 'Second order must be orderB');
  assert(fleetOrders[0].character_id === 1001, 'Character ID 1001 preserved');
  assert(fleetOrders[1].character_id === 1002, 'Character ID 1002 preserved');
  // Verify non-fleet order is excluded
  assert(!fleetOrders.some((o) => o.character_id === 9999), 'External alt (9999) must not be in fleet orders');
  assert(!fleetOrders.some((o) => o.order_id === '404'), 'Corporation-owned order must not enter character fleet scope');
  assert(!fleetOrders.some((o) => o.order_id === '405'), 'Legacy corporation order must not be inferred to the observing character');
  console.log('  [PASS] Test 4: Scope fleet returned orders for all fleet characters and excluded non-fleet.');

  // 5. Test identity & immutability (No artificial character_id: 'fleet')
  console.log('--- Test 5: Identity & Immutability invariants ---');
  for (const o of fleetOrders) {
    assert(o.character_id !== undefined, 'character_id must be defined');
    assert(typeof o.character_id === 'number', 'character_id must be real EVE ID (number)');
    assert(String(o.character_id) !== 'fleet', "character_id must NEVER be 'fleet'");
  }
  console.log('  [PASS] Test 5: No artificial character_id was introduced; original properties preserved.');

  // 6. Test Active Character Switching
  console.log('--- Test 6: Dynamic Active Character Switching ---');
  const switchedContext: OrderSelectionContext = {
    activeCharacterId: '1002',
    fleetCharacterIds: ['1001', '1002'],
    corporationIds: ['9001'],
  };
  const switchedActiveOrders = selectOrdersByScope(allOrders, { type: 'active_character' }, switchedContext);
  assert(switchedActiveOrders.length === 1, `Expected 1 active order after switch, got ${switchedActiveOrders.length}`);
  assert(switchedActiveOrders[0] === orderB, 'Switched active order must match orderB');
  assert(switchedActiveOrders[0].character_id === 1002, 'Character ID must be 1002');
  console.log('  [PASS] Test 6: Switching active character correctly updates selection.');

  // 7. Test Empty and Edge Cases
  console.log('--- Test 7: Edge & Empty Cases ---');
  const emptyRes1 = selectOrdersByScope([], { type: 'active_character' }, context);
  assert(Array.isArray(emptyRes1) && emptyRes1.length === 0, 'Empty input must return empty array');

  const emptyRes2 = selectOrdersByScope(allOrders, { type: 'character', characterId: 'unknown_char' }, context);
  assert(Array.isArray(emptyRes2) && emptyRes2.length === 0, 'Unknown characterId must return empty array');

  const emptyRes3 = selectOrdersByScope(allOrders, { type: 'fleet' }, {
    activeCharacterId: '1001',
    fleetCharacterIds: [],
    corporationIds: [],
  });
  assert(Array.isArray(emptyRes3) && emptyRes3.length === 0, 'Empty fleetCharacterIds must return empty array');
  console.log('  [PASS] Test 7: Edge and empty cases handled cleanly without crashing.');

  // 8. Test OrderCollection Contract
  console.log('--- Test 8: OrderCollection Contract & Invariants ---');
  const characterContexts: OrderCharacterContext[] = [
    { characterId: '1001', characterName: 'Trader Alpha' },
    { characterId: '1002', characterName: 'Trader Beta' },
  ];

  const collection: OrderCollection = createOrderCollection(
    [orderA, orderB],
    characterContexts,
    { type: 'fleet' }
  );

  assert(collection.orders.length === 2, 'Collection orders count must match');
  assert(collection.characters.length === 2, 'Collection characters count must match');
  assert(collection.scope.type === 'fleet', 'Collection scope must be fleet');

  // Invariant check: every order's character_id matches a character in collection.characters
  for (const order of collection.orders) {
    const match = collection.characters.find((c) => c.characterId === String(order.character_id));
    assert(Boolean(match), `Order ${order.order_id} character_id (${order.character_id}) must exist in collection.characters`);
    assert(match?.characterName === order.character_name, 'Character name in context must match order character_name');
  }
  console.log('  [PASS] Test 8: OrderCollection contract and inter-character invariants verified.');

  console.log('===============================================================');
  console.log('ALL PHASE 2 ORDER SCOPING & CONTRACT TESTS PASSED (100%)');
  // 9. Test corporation scope
  console.log('--- Test 9: Corporation owner scope ---');
  const corpOrders = selectOrdersByScope(allOrders, { type: 'corporation', corporationId: '9001' }, context);
  assert(corpOrders.length === 1, `Expected 1 canonical corporation order, got ${corpOrders.length}`);
  assert(corpOrders[0] === corporateOrder, 'Corporation scope must return the canonical corporation order');
  assert(corpOrders[0].ownership?.owner_type === 'corporation', 'Corporation scope must require corporation ownership');
  assert(corpOrders[0].ownership?.owner_id === 9001, 'Corporation scope must use economic corporation id');
  assert(corpOrders[0].ownership?.principal_character_id === 1001, 'Principal must remain the observing character');
  assert(corpOrders[0].character_id === 1001, 'Fixture may retain legacy character projection before normalization');

  const corpContextB: OrderSelectionContext = {
    activeCharacterId: '1002',
    fleetCharacterIds: ['1001', '1002'],
    corporationIds: ['9001'],
  };
  const corpOrdersFromB = selectOrdersByScope(allOrders, { type: 'corporation', corporationId: '9001' }, corpContextB);
  assert(corpOrdersFromB.length === 1, 'Corporation scope must not depend on observing character');

  console.log('===============================================================');
}

runOrderScopingTests();
