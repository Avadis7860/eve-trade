import type { EveCharacterOrder } from '../../types';
import {
  aggregateOrderObservations,
  mergeCharacterAndCorporationOrders,
  mergeOrderObservations,
  normalizeCorporationOrder,
  normalizeCorporationOrderHistory,
} from '../corporationOrder';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('[CorporationOrderTest] ' + message);
}

function run(): void {
  const raw = {
    order_id: '9007199254740993',
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    price: 6.25,
    volume_remain: 50,
    volume_total: 100,
    is_buy_order: false,
    issued: '2026-09-22T12:00:00Z',
    duration: 90,
    escrow: 1000,
    issued_by: 1001,
    wallet_division: 2,
  };

  const normalizedA = normalizeCorporationOrder(
    raw,
    1001,
    99001,
    'Trade Operations Corporation',
  );

  assert(normalizedA !== null, 'Valid corporation order must normalize');
  assert(normalizedA?.order_id === '9007199254740993', 'Large order ID must remain exact');
  assert(normalizedA?.is_corporation === true, 'Corporation marker must be explicit');
  assert(normalizedA?.character_id === undefined, 'Corporation order must not get a character owner');
  assert(normalizedA?.character_name === undefined, 'Corporation order must not get a character name');
  assert(normalizedA?.ownership?.owner_type === 'corporation', 'Owner type must be corporation');
  assert(normalizedA?.ownership?.owner_id === 99001, 'Owner ID must be corporation ID');
  assert(normalizedA?.ownership?.principal_character_id === 1001, 'Principal must be observing character');
  assert(normalizedA?.ownership?.corporation_name === 'Trade Operations Corporation', 'Corporation name must be preserved');
  assert(normalizedA?.ownership?.issuer_character_id === 1001, 'Issuer must be preserved when CCP exposes it');
  assert(normalizedA?.ownership?.wallet_division === 2, 'Wallet division must be preserved when CCP exposes it');

  const normalizedB = normalizeCorporationOrder(raw, 1002, 99001, 'Trade Operations Corporation');
  assert(normalizedB?.ownership?.principal_character_id === 1002, 'Second observer must retain its principal');
  assert(normalizedB?.ownership?.owner_id === normalizedA?.ownership?.owner_id, 'Economic owner must remain shared');
  const observedByA = normalizedA as NonNullable<typeof normalizedA>;
  const observedByB = normalizedB as NonNullable<typeof normalizedB>;
  const multiObserved = mergeOrderObservations(observedByA, observedByB);

  assert(multiObserved !== null, 'Two compatible observations must merge');
  assert(
    multiObserved?.ownership?.observed_by_character_ids?.join(',') === '1001,1002',
    'Merged order must retain every observing character',
  );
  assert(
    multiObserved?.ownership?.principal_character_id === 1001,
    'Merged observation must choose the lowest character ID deterministically as primary principal',
  );
  assert(
    multiObserved?.ownership?.owner_type === 'corporation' &&
      multiObserved?.ownership?.owner_id === 99001,
    'Merged multi-observer order must retain economic corporation ownership',
  );

  const observedByC = normalizeCorporationOrder(
    raw,
    1003,
    99002,
    'Secondary Trade Corporation',
  );
  assert(observedByC !== null, 'Independent corporation observation must normalize');
  const observedByCOrder = observedByC as NonNullable<typeof observedByC>;
  assert(
    mergeOrderObservations(observedByA, observedByCOrder) === null,
    'Conflicting economic owners must fail closed instead of choosing a winner',
  );




  const history = normalizeCorporationOrderHistory(
    {
      ...raw,
      state: 'fulfilled',
      completed_at: '2026-09-22T18:00:00Z',
    },
    1001,
    99001,
    'Trade Operations Corporation',
  );

  assert(history !== null, 'Valid corporation history must normalize');
  assert(history?.state === 'fulfilled', 'History state must be preserved');
  assert(history?.completed_at === '2026-09-22T18:00:00Z', 'History completion time must be preserved');
  assert(history?.ownership?.owner_type === 'corporation', 'Historical owner type must remain corporation');

  assert(
    normalizeCorporationOrder({ ...raw, price: -1 }, 1001, 99001) === null,
    'Negative price must fail normalization',
  );
  assert(
    normalizeCorporationOrder({ ...raw, order_id: Number.MAX_SAFE_INTEGER + 1 }, 1001, 99001) === null,
    'Unsafe numeric order ID must fail normalization',
  );
  const omittedSide = normalizeCorporationOrder({ ...raw, is_buy_order: undefined }, 1001, 99001);
  assert(
    omittedSide?.is_buy_order === false,
    'Omitted is_buy_order must preserve the sell-side semantics documented by ESI',
  );
  assert(
    normalizeCorporationOrderHistory({ ...raw, state: 'unknown' }, 1001, 99001) === null,
    'Unknown history state must fail normalization',
  );

  assert(
    normalizeCorporationOrder({ ...raw, wallet_division: 8 }, 1001, 99001) === null,
    'Wallet division outside CCP division range must fail normalization',
  );

  const observedShape = normalizeCorporationOrder(
    {
      duration: 90,
      issued: '2026-09-24T01:16:23Z',
      issued_by: 2124224223,
      location_id: 60003760,
      order_id: 7429091434,
      price: 9286,
      range: 'region',
      region_id: 10000002,
      type_id: 3691,
      volume_remain: 3165,
      volume_total: 3165,
      wallet_division: 1,
    },
    1001,
    99001,
  );
  assert(
    observedShape?.is_buy_order === false,
    'Actual CCP corporation payload without is_buy_order must normalize as a sell order',
  );
  assert(
    observedShape?.ownership?.wallet_division === 1,
    'Actual CCP wallet division must be preserved',
  );
  assert(
    normalizeCorporationOrder({ ...raw, issued_by: 0 }, 1001, 99001) === null,
    'Invalid issuer provenance must fail normalization',
  );

  const personal = {
    ...(normalizedA as NonNullable<typeof normalizedA>),
    order_id: '42',
    is_corporation: false,
    ownership: {
      principal_character_id: 1001,
      owner_type: 'character' as const,
      owner_id: 1001,
      owner_name: 'Trader Alpha',
    },
    character_id: 1001,
    character_name: 'Trader Alpha',
  };

  const legacyCorporate = {
    ...observedByA,
    ownership: undefined,
    character_id: undefined,
    character_name: undefined,
    is_corporation: true,
  };

  assert(
    mergeOrderObservations(personal as EveCharacterOrder, legacyCorporate as EveCharacterOrder) === null,
    'Legacy corporate observation must not merge into a personal owner',
  );


  const corp42 = {
    ...(normalizedA as NonNullable<typeof normalizedA>),
    order_id: '42',
  };

  const merged = mergeCharacterAndCorporationOrders([personal], [corp42]);
  assert(merged.length === 1, 'Personal/corporation duplicate order IDs must merge once');
  assert(merged[0].ownership?.owner_type === 'corporation', 'Corporation endpoint must win duplicate ownership');
  assert(merged[0].ownership?.owner_id === 99001, 'Merged duplicate must retain corporation owner');

  const mergedDistinct = mergeCharacterAndCorporationOrders(
    [personal],
    [normalizedA as NonNullable<typeof normalizedA>],
  );
  assert(mergedDistinct.length === 2, 'Distinct order IDs must both remain');

  const aggregatedFromSnapshot = aggregateOrderObservations([
    {
      observerCharacterId: 2124224223,
      observerCharacterName: 'Observed Capsuleer',
      orders: [observedShape as NonNullable<typeof observedShape>],
    },
  ]);
  assert(
    aggregatedFromSnapshot.length === 1,
    'A valid corporation order retained in a snapshot observation must reach aggregation',
  );
  assert(
    aggregatedFromSnapshot[0].ownership?.owner_type === 'corporation' &&
      aggregatedFromSnapshot[0].ownership?.owner_id === 99001,
    'Snapshot aggregation must preserve economic corporation ownership',
  );
  assert(
    aggregatedFromSnapshot[0].character_id === undefined &&
      aggregatedFromSnapshot[0].character_name === undefined,
    'Snapshot aggregation must not assign the observing character as economic owner',
  );
  assert(
    aggregatedFromSnapshot[0].ownership?.principal_character_id === 1001 &&
      aggregatedFromSnapshot[0].ownership?.wallet_division === 1,
    'Snapshot aggregation must preserve observer and wallet provenance',
  );

  console.log('✅ Corporation order normalization and ownership contract verified.');
}

run();
