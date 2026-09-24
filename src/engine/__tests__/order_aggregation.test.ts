import type { EveCharacterOrder } from '../../types';
import { aggregateOrderObservations, normalizeCorporationOrder } from '../corporationOrder';
import { selectOrdersByScope } from '../orderScoping';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('[OrderAggregationTest] ' + message);
}

function run(): void {
  const normalized = normalizeCorporationOrder(
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
    2124224223,
    98830882,
    'The Defense Of Ikuchi',
  );

  assert(normalized !== null, 'Observed CCP corporation payload must normalize');

  const snapshotLike = aggregateOrderObservations([
    {
      observerCharacterId: 2124224223,
      observerCharacterName: 'Observed Capsuleer',
      orders: [normalized as EveCharacterOrder],
    },
  ]);

  assert(snapshotLike.length === 1, 'Snapshot observation must survive order aggregation');
  assert(
    snapshotLike[0].order_id === '7429091434',
    'Canonical order ID must remain exact through aggregation',
  );
  assert(
    snapshotLike[0].ownership?.owner_type === 'corporation' &&
      snapshotLike[0].ownership?.owner_id === 98830882,
    'Economic owner must remain the corporation, not the observer',
  );
  assert(
    snapshotLike[0].ownership?.principal_character_id === 2124224223 &&
      snapshotLike[0].ownership?.wallet_division === 1,
    'Observation and corporation wallet provenance must survive aggregation',
  );
  assert(
    snapshotLike[0].character_id === undefined &&
      snapshotLike[0].character_name === undefined,
    'Corporation order must not gain a synthetic character owner',
  );

  const secondObservation = {
    ...(normalized as EveCharacterOrder),
    ownership: {
      ...(normalized as EveCharacterOrder).ownership!,
      principal_character_id: 2124224999,
      observed_by_character_ids: [2124224999],
    },
  };
  const multiObserved = aggregateOrderObservations([
    {
      observerCharacterId: 2124224223,
      observerCharacterName: 'Observed Capsuleer',
      orders: [normalized as EveCharacterOrder],
    },
    {
      observerCharacterId: 2124224999,
      observerCharacterName: 'Second Observer',
      orders: [secondObservation],
    },
  ]);
  assert(multiObserved.length === 1, 'The same CCP order must remain one canonical entity across observers');
  assert(
    JSON.stringify(multiObserved[0].ownership?.observed_by_character_ids) === '[2124224223,2124224999]',
    'Observer provenance must accumulate without changing economic ownership',
  );
  assert(
    multiObserved[0].ownership?.principal_character_id === 2124224223,
    'Primary observation principal remains deterministic',
  );
  assert(
    multiObserved[0].ownership?.issuer_character_id === 2124224223,
    'Issuer provenance remains distinct from economic owner',
  );
  assert(
    multiObserved[0].is_buy_order === false,
    'Market order side remains a market observation and is not rewritten as accounting direction',
  );

  const corporationScoped = selectOrdersByScope(
    snapshotLike,
    { type: 'corporation', corporationId: '98830882' },
    {
      activeCharacterId: '2124224223',
      corporationIds: ['98830882'],
    },
  );

  assert(
    corporationScoped.length === 1,
    'Corporation scope must expose the order retained by the aggregate',
  );
  assert(
    corporationScoped[0].order_id === '7429091434',
    'Corporation scope must return the exact observed order',
  );

  console.log('✅ Order aggregation from durable observation to corporation scope verified.');
}

run();
