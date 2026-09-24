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

  const corporationScoped = selectOrdersByScope(
    snapshotLike,
    { type: 'corporation', corporationId: '98830882' },
    {
      activeCharacterId: '2124224223',
      fleetCharacterIds: ['2124224223'],
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
