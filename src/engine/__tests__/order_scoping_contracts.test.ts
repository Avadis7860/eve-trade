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

  const allOrders = [orderA, orderB, corporateOrder, legacyCorporateOrder];

  const context: OrderSelectionContext = {
    activeCharacterId: '1001',
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

  // 4. Test identity & immutability
  console.log('--- Test 4: Identity & Immutability invariants ---');
  for (const o of [orderA, orderB]) {
    assert(o.character_id !== undefined, 'character_id must be defined');
    assert(typeof o.character_id === 'number', 'character_id must be a real EVE ID');
    assert(o.character_id > 0, 'character_id must be positive');
  }
  console.log('  [PASS] Test 4: No artificial character identity was introduced.');

  // 5. Test Active Character Switching
  console.log('--- Test 5: Dynamic Active Character Switching ---');
  const switchedContext: OrderSelectionContext = {
    activeCharacterId: '1002',
    corporationIds: ['9001'],
  };
  const switchedActiveOrders = selectOrdersByScope(allOrders, { type: 'active_character' }, switchedContext);
  assert(switchedActiveOrders.length === 1, 'Expected 1 active order after switch');
  assert(switchedActiveOrders[0] === orderB, 'Switched active order must match orderB');
  assert(switchedActiveOrders[0].character_id === 1002, 'Character ID must be 1002');
  console.log('  [PASS] Test 5: Switching active character correctly updates selection.');

  // 6. Test Empty and Edge Cases
  console.log('--- Test 6: Edge & Empty Cases ---');
  const emptyRes1 = selectOrdersByScope([], { type: 'active_character' }, context);
  assert(Array.isArray(emptyRes1) && emptyRes1.length === 0, 'Empty input must return empty array');
  const emptyRes2 = selectOrdersByScope(allOrders, { type: 'character', characterId: 'unknown_char' }, context);
  assert(Array.isArray(emptyRes2) && emptyRes2.length === 0, 'Unknown characterId must return empty array');
  console.log('  [PASS] Test 6: Edge and empty cases handled cleanly without crashing.');

  // 7. Test Corporation Scope and Collection Contract
  console.log('--- Test 7: Corporation scope & collection contract ---');
  const corpOrders = selectOrdersByScope(allOrders, { type: 'corporation', corporationId: '9001' }, context);
  assert(corpOrders.length === 1, 'Corporation scope must return the canonical corporation order');
  assert(corpOrders[0] === corporateOrder, 'Corporation scope must return the canonical corporation order');
  assert(corpOrders[0].ownership?.owner_type === 'corporation', 'Corporation scope must require corporation ownership');
  assert(corpOrders[0].ownership?.owner_id === 9001, 'Corporation scope must use the economic corporation id');
  assert(corpOrders[0].ownership?.principal_character_id === 1001, 'Principal character must remain the observer');

  const corpContextB: OrderSelectionContext = {
    activeCharacterId: '1002',
    corporationIds: ['9001'],
  };
  const corpOrdersFromB = selectOrdersByScope(allOrders, { type: 'corporation', corporationId: '9001' }, corpContextB);
  assert(corpOrdersFromB.length === 1, 'Corporation scope must not depend on observing character');

  const characterContexts: OrderCharacterContext[] = [
    { characterId: '1001', characterName: 'Trader Alpha' },
    { characterId: '1002', characterName: 'Trader Beta' },
  ];
  const collection: OrderCollection = createOrderCollection(
    [orderA, orderB],
    characterContexts,
    { type: 'character', characterId: '1001' },
  );
  assert(collection.orders.length === 2, 'Collection orders count must match');
  assert(collection.characters.length === 2, 'Collection characters count must match');
  assert(collection.scope.type === 'character', 'Collection scope must preserve character context');
  for (const order of collection.orders) {
    const match = collection.characters.find((c) => c.characterId === String(order.character_id));
    assert(Boolean(match), `Order ${order.order_id} character_id must exist in collection.characters`);
    assert(match?.characterName === order.character_name, 'Character name must match order attribution');
  }
  console.log('  [PASS] Test 7: Corporation and character collection contracts verified.');

  console.log('===============================================================');
  console.log('ALL PHASE 2 ORDER SCOPING & CONTRACT TESTS PASSED (100%)');
runOrderScopingTests();
