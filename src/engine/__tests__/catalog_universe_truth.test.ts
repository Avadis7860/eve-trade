import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { CatalogValidator } from '../../domain/catalog/CatalogValidator';
import { UniverseRepository } from '../../domain/universe/UniverseRepository';
import { UniverseValidator } from '../../domain/universe/UniverseValidator';
import { InterRegionalFinancialEngine } from '../interRegional';
import { EVE_TYPES_CATALOG, MAJOR_MARKET_HUBS } from '../../data/universe';
import { CANONICAL_CATALOG_MANIFEST } from '../../data/catalogManifest';
import { CANONICAL_UNIVERSE_MANIFEST } from '../../data/universeManifest';
import { CANONICAL_UNIVERSE_GRAPH_MANIFEST } from '../../data/universeGraphManifest';
import universeDataRaw from '../../data/universeData.json';
import { EveTypeDetail, MarketHub, RawMarketOrder, TypeCatalogMetadata } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion Failed: ${message}`);
}

console.log('=== RUNNING CATALOG & UNIVERSE TRUTH TESTS ===');

assert(CANONICAL_UNIVERSE_GRAPH_MANIFEST.sdeBuild === '3503375', 'Runtime graph must be pinned to the validated CCP SDE build');
assert(CANONICAL_UNIVERSE_GRAPH_MANIFEST.systemsCount === 5485, 'Runtime graph system count mismatch');
assert(CANONICAL_UNIVERSE_GRAPH_MANIFEST.directedEdgesCount === 13978, 'Runtime graph edge count mismatch');
assert(CANONICAL_UNIVERSE_GRAPH_MANIFEST.graphChecksum === '5465da368fa3b6bf03d610554de453af1c54182199d325fe318d431d29225b3c', 'Runtime graph checksum mismatch');


const canonicalCatalogChecksum = CatalogValidator.computeCanonicalChecksum(EVE_TYPES_CATALOG);
assert(EVE_TYPES_CATALOG.length === CANONICAL_CATALOG_MANIFEST.expectedCount, 'Bundled catalog cardinality must match manifest');
assert(
  canonicalCatalogChecksum === CANONICAL_CATALOG_MANIFEST.checksum,
  `Bundled catalog checksum must match manifest: expected ${CANONICAL_CATALOG_MANIFEST.checksum}, got ${canonicalCatalogChecksum}`
);

const truncatedCatalog = EVE_TYPES_CATALOG.slice(0, -1);
const truncated = CatalogValidator.validateCatalogCompleteness(truncatedCatalog, {
  expectedCount: CANONICAL_CATALOG_MANIFEST.expectedCount,
  expectedChecksum: CANONICAL_CATALOG_MANIFEST.checksum,
  currentChecksum: CatalogValidator.computeCanonicalChecksum(truncatedCatalog),
  source: 'canonical_asset',
});
assert(truncated.status === 'CATALOG_PARTIAL', 'Truncated catalog must be PARTIAL');
assert(!truncated.isReady, 'Truncated catalog must never be READY');

const mismatch = CatalogValidator.validateCatalogCompleteness(EVE_TYPES_CATALOG, {
  expectedCount: CANONICAL_CATALOG_MANIFEST.expectedCount,
  expectedChecksum: '0'.repeat(64),
  currentChecksum: canonicalCatalogChecksum,
  source: 'server',
});
assert(mismatch.status === 'CATALOG_CORRUPTED', 'Checksum mismatch must be CORRUPTED');

CatalogRepository.resetInstance();
const catalog = CatalogRepository.getInstance();
assert(catalog.isReady(), 'Bundled canonical catalog must start READY');
assert(catalog.getMetadata().item_count === CANONICAL_CATALOG_MANIFEST.expectedCount, 'Canonical repository count mismatch');

const fakeItems: EveTypeDetail[] = EVE_TYPES_CATALOG.slice(0, 2);
const fakeMeta: TypeCatalogMetadata = {
  version: CANONICAL_CATALOG_MANIFEST.version,
  checksum: CatalogValidator.computeCanonicalChecksum(fakeItems),
  item_count: fakeItems.length,
  expected_count: fakeItems.length,
  status: 'CATALOG_READY',
  loaded_at: new Date().toISOString(),
  source: 'server',
  is_degraded: false,
};
catalog.loadExplicitDataset(fakeItems, fakeMeta);
assert(!catalog.isReady(), 'A caller cannot force READY with a self-declared two-item catalog');
assert(catalog.getMetadata().status === 'CATALOG_PARTIAL', 'Self-declared truncated catalog must become PARTIAL');

// Reset the repository so subsequent collision tests exercise the real canonical dataset.
CatalogRepository.resetInstance();
const canonicalCatalog = CatalogRepository.getInstance();
assert(canonicalCatalog.isReady(), 'Canonical catalog must be restored before collision tests');

const dynamic = canonicalCatalog.resolveType(987654321, { type_id: 987654321, name: 'Synthetic Type', volume: 1 });
assert(!dynamic.is_verified && dynamic.confidence === 0, 'Dynamic fallback resolution must remain unverified');

const canonicalCollision = canonicalCatalog.registerCustomType({
  type_id: 34,
  name: 'Fake Canonical Override',
  volume: 999,
  group_id: 1,
  category_id: 1,
});
assert(
  canonicalCollision.status === 'RESOLVED_CATALOG' &&
    canonicalCollision.is_verified === true &&
    canonicalCollision.name === 'Tritanium',
  'Dynamic registration must never shadow a canonical catalog type'
);

assert(
  canonicalCatalog.getMetadata().item_count === CANONICAL_CATALOG_MANIFEST.expectedCount,
  'Dynamic registrations must never change canonical catalog item_count'
);

const jitaHub = MAJOR_MARKET_HUBS.find((h) => h.id === 'jita')!;
const unknownRangeOrder: RawMarketOrder = {
  order_id: 990001,
  type_id: 34,
  region_id: jitaHub.region_id,
  system_id: 39999999,
  location_id: 69999999,
  price: 5,
  volume_remain: 10,
  volume_total: 10,
  is_buy_order: true,
  order_range: '40',
  min_volume: 1,
  issued: new Date().toISOString(),
  duration: 90,
};
const unknownRangeAccessible = InterRegionalFinancialEngine.filterAccessibleOrdersForHub(
  [unknownRangeOrder],
  jitaHub,
  false,
  true
);
assert(
  unknownRangeAccessible.length === 0,
  'An order whose numeric range depends on an UNKNOWN route must never be considered accessible'
);

const universeIntegrity = UniverseValidator.validate(universeDataRaw);
assert(
  universeIntegrity.isReady,
  `Bundled universe dataset must pass its canonical integrity manifest: status=${universeIntegrity.status}, expected=${CANONICAL_UNIVERSE_MANIFEST.checksum}, got=${universeIntegrity.checksum}, counts=${universeIntegrity.regionsCount}/${universeIntegrity.systemsCount}/${universeIntegrity.stationsCount}`
);
assert(universeIntegrity.regionsCount === CANONICAL_UNIVERSE_MANIFEST.regionsCount, 'Region count mismatch');
assert(universeIntegrity.systemsCount === CANONICAL_UNIVERSE_MANIFEST.systemsCount, 'System count mismatch');
assert(universeIntegrity.stationsCount === CANONICAL_UNIVERSE_MANIFEST.stationsCount, 'Station count mismatch');
assert(
  universeIntegrity.checksum === CANONICAL_UNIVERSE_MANIFEST.checksum,
  `Universe checksum mismatch: expected ${CANONICAL_UNIVERSE_MANIFEST.checksum}, got ${universeIntegrity.checksum}`
);

const truncatedUniverse = {
  ...universeDataRaw,
  systems: Object.fromEntries(Object.entries(universeDataRaw.systems).slice(0, -1)),
};
const partialUniverse = UniverseValidator.validate(truncatedUniverse);
assert(partialUniverse.status === 'PARTIAL' && !partialUniverse.isReady, 'Truncated universe must be PARTIAL');

UniverseRepository.resetInstance();
const universe = UniverseRepository.getInstance();
assert(universe.getIntegrity().isReady, 'UniverseRepository must expose READY integrity for bundled dataset');

const knownRoute = universe.getRoute(30000142, 30002187, 'SAFE');
assert(
  knownRoute.status === 'KNOWN' &&
    knownRoute.is_verified === true &&
    knownRoute.source === 'canonical_graph' &&
    knownRoute.is_highsec_only === true &&
    knownRoute.jumps === 39,
  'Jita -> Amarr must resolve as a certified canonical SDE high-sec route',
);
assert(
  knownRoute.provenance?.source === 'sde_canonical' &&
    knownRoute.provenance.dataset_version === '3503375',
  'Runtime route provenance must identify the pinned CCP SDE graph',
);

const shortestRoute = universe.getRoute(30000142, 30002187, 'SHORTEST');
assert(
  shortestRoute.status === 'KNOWN' &&
    shortestRoute.is_verified === true &&
    shortestRoute.source === 'canonical_graph' &&
    Number.isFinite(shortestRoute.jumps) &&
    shortestRoute.jumps === 11 &&
    shortestRoute.is_highsec_only === false &&
    shortestRoute.min_security < 0.5,
  'Shortest route policy must resolve the true shortest path, even when it is not High-Sec only',
);

const unknownRoute = universe.getRoute(30000142, 999999999, 'SHORTEST');
assert(
  unknownRoute.status === 'UNKNOWN' &&
    unknownRoute.is_verified === false &&
    unknownRoute.jumps === -1,
  'Unknown route must never receive synthetic values',
);

const safeRouteIndexA = universe.getRouteIndex(30002187, 'SAFE');
const safeRouteIndexB = universe.getRouteIndex(30002187, 'SAFE');
assert(safeRouteIndexA === safeRouteIndexB, 'Route index must be reused for identical graph/policy/destination identity');
assert(safeRouteIndexA.build_count === 1, 'Route index must build its destination traversal only once');

const unknownLocation = universe.resolveLocationSync(999999999);
assert(unknownLocation.status === 'LOCATION_UNKNOWN' && unknownLocation.is_verified === false, 'Unknown location must remain UNKNOWN');

const dynamicStructureId = 1000000000001;
const registeredStructure = universe.registerStructure({
  location_id: dynamicStructureId,
  name: 'Dynamic Test Structure',
  system_id: 30000142,
  system_name: 'Jita',
  region_id: 10000002,
  region_name: 'The Forge',
  security_status: 0.95,
}, true);
assert(registeredStructure.is_verified, 'Dynamic structure resolution may be verified for display/orchestration');
const dynamicSyncLookup = universe.resolveLocationSync(dynamicStructureId);
assert(
  dynamicSyncLookup.status === 'RESOLVED_STRUCTURE' && dynamicSyncLookup.is_verified === true,
  'General synchronous location resolution must expose explicitly registered dynamic structures'
);
const dynamicCanonicalLookup = universe.resolveCanonicalLocationSync(dynamicStructureId);
assert(
  dynamicCanonicalLookup.status === 'LOCATION_UNKNOWN' && dynamicCanonicalLookup.is_verified === false,
  'Canonical synchronous resolution must ignore dynamic/ESI structure cache entries'
);

console.log('🎉 CATALOG & UNIVERSE TRUTH TESTS PASSED.');
