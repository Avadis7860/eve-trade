import { CatalogHashing } from '../../domain/catalog/CatalogHashing';
import { CatalogValidator } from '../../domain/catalog/CatalogValidator';
import { CatalogRepository } from '../../domain/catalog/CatalogRepository';
import { EveTypeDetail, TypeCatalogMetadata } from '../../types';
import { EVE_TYPES_CATALOG } from '../../data/universe';
import { CANONICAL_CATALOG_MANIFEST } from '../../data/catalogManifest';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runCatalogIntegrityTests() {
  console.log('=== RUNNING CATALOG INTEGRITY & HASHING DOMAIN TESTS ===');

  // Test 1: Deterministic Hashing Order Invariance
  console.log('1. Testing CatalogHashing order invariance...');
  const itemA: EveTypeDetail = { type_id: 34, name: 'Tritanium', volume: 0.01, group_id: 18, category_id: 4 };
  const itemB: EveTypeDetail = { type_id: 35, name: 'Pyerite', volume: 0.01, group_id: 18, category_id: 4 };
  const itemC: EveTypeDetail = { type_id: 36, name: 'Mexallon', volume: 0.01, group_id: 18, category_id: 4 };

  const hash1 = CatalogHashing.computeCatalogChecksum([itemA, itemB, itemC]);
  const hash2 = CatalogHashing.computeCatalogChecksum([itemC, itemA, itemB]);
  const hash3 = CatalogHashing.computeCatalogChecksum([itemB, itemC, itemA]);

  assert(hash1 === hash2 && hash2 === hash3, 'Checksum must be strictly invariant to item permutation');
  assert(hash1.length === 64, 'Checksum must be a 64-character hex SHA-256 string');
  console.log('✅ Deterministic hashing is order invariant:', hash1.substring(0, 16) + '...');

  // Test 2: Validation of Invalid Items
  console.log('2. Testing CatalogValidator schema rules...');
  assert(!CatalogValidator.validateType(null).isValid, 'null item must be invalid');
  assert(!CatalogValidator.validateType({ type_id: -1, name: 'Bad', volume: 1 }).isValid, 'negative type_id must be invalid');
  assert(!CatalogValidator.validateType({ type_id: 0, name: 'Bad', volume: 1 }).isValid, 'zero type_id must be invalid');
  assert(!CatalogValidator.validateType({ type_id: 1.5, name: 'Bad', volume: 1 }).isValid, 'float type_id must be invalid');
  assert(!CatalogValidator.validateType({ type_id: 10, name: '', volume: 1 }).isValid, 'empty name must be invalid');
  assert(!CatalogValidator.validateType({ type_id: 10, name: '   ', volume: 1 }).isValid, 'whitespace name must be invalid');
  assert(!CatalogValidator.validateType({ type_id: 10, name: 'Valid', volume: -0.1 }).isValid, 'negative volume must be invalid');
  assert(!CatalogValidator.validateType({ type_id: 10, name: 'Valid', volume: NaN }).isValid, 'NaN volume must be invalid');
  console.log('✅ Validation correctly rejects malformed entries.');

  // Test 3: Deduplication in CatalogValidator
  console.log('3. Testing CatalogValidator deduplication...');
  const duplicateCollection = [
    { type_id: 34, name: 'Tritanium Old', volume: 0.01 },
    { type_id: 34, name: 'Tritanium', volume: 0.01 },
  ];
  const { validTypes, errors } = CatalogValidator.validateCollection(duplicateCollection);
  assert(validTypes.length === 1, 'Duplicate type_id must be deduplicated to a single item');
  assert(validTypes[0].name === 'Tritanium', 'Deduplication must retain latest valid item');
  assert(errors.some((e) => e.includes('Duplicate type_id 34')), 'Duplicate warning must be emitted');
  console.log('✅ Deduplication works as specified.');

  // Test 4: Invariant - Fallback Core can NEVER be CATALOG_READY
  console.log('4. Testing CATALOG_FALLBACK_CORE vs CATALOG_READY invariant...');
  const fallbackItems = [itemA, itemB];
  const fallbackChecksum = CatalogHashing.computeCatalogChecksum(fallbackItems);

  const fallbackCheck = CatalogValidator.validateCatalogCompleteness(fallbackItems, {
    expectedCount: 2,
    expectedChecksum: fallbackChecksum,
    currentChecksum: fallbackChecksum,
    source: 'fallback_core',
  });
  assert(
    fallbackCheck.status === 'CATALOG_FALLBACK_CORE',
    `Fallback core must have status CATALOG_FALLBACK_CORE, got ${fallbackCheck.status}`
  );
  assert(!fallbackCheck.isReady, 'Fallback core must NOT be considered ready as universal catalog');
  assert(fallbackCheck.isDegraded, 'Fallback core must be marked as degraded');
  console.log('✅ Invariant satisfied: Fallback core is never CATALOG_READY.');

  // Test 5: Checksum Mismatch Detection
  console.log('5. Testing checksum mismatch detection...');
  const canonicalChecksum = CatalogHashing.computeCatalogChecksum(EVE_TYPES_CATALOG);
  const mismatchCheck = CatalogValidator.validateCatalogCompleteness(EVE_TYPES_CATALOG, {
    expectedCount: CANONICAL_CATALOG_MANIFEST.expectedCount,
    expectedChecksum: '0000000000000000000000000000000000000000000000000000000000000000',
    currentChecksum: canonicalChecksum,
    source: 'canonical_asset',
  });
  assert(
    mismatchCheck.status === 'CATALOG_CORRUPTED',
    `Checksum mismatch must produce CATALOG_CORRUPTED, got ${mismatchCheck.status}`
  );
  assert(!mismatchCheck.isReady, 'Corrupted catalog must not be ready');
  console.log('✅ Checksum corruption detected correctly.');

  // Test 6: CatalogRepository State Machine & Lookups
  console.log('6. Testing CatalogRepository initial state and lookups...');
  CatalogRepository.resetInstance();
  const repo = CatalogRepository.getInstance();

  assert(repo.isReady(), 'Bundled canonical repository must start READY');
  assert(!repo.isDegraded(), 'Canonical repository must not be degraded');
  assert(repo.getMetadata().status === 'CATALOG_READY', 'Status must be CATALOG_READY');
  assert(repo.getMetadata().item_count === CANONICAL_CATALOG_MANIFEST.expectedCount, 'Canonical repository count must match manifest');

  // Verify O(1) lookups
  const tri = repo.getTypeById(34);
  assert(tri !== undefined && tri.name === 'Tritanium', 'Tritanium must be retrievable');
  assert(repo.getTypeName(34) === 'Tritanium', 'getTypeName(34) must return "Tritanium"');
  assert(repo.getTypeName(99999999) === 'Type #99999999', 'Unknown ID returns formatted placeholder');

  // Test 7: A caller cannot self-declare a truncated dataset as READY.
  console.log('7. Testing canonical readiness cannot be forced by caller metadata...');
  const fakeMeta: TypeCatalogMetadata = {
    version: CANONICAL_CATALOG_MANIFEST.version,
    checksum: fallbackChecksum,
    item_count: 2,
    expected_count: 2,
    status: 'CATALOG_READY',
    loaded_at: new Date().toISOString(),
    source: 'server',
    is_degraded: false,
  };
  repo.loadExplicitDataset(fallbackItems, fakeMeta);
  assert(!repo.isReady(), 'A two-item dataset must never become CATALOG_READY');
  assert(repo.getMetadata().status === 'CATALOG_PARTIAL', 'Truncated self-declared dataset must be PARTIAL');

  repo.loadExplicitDataset(EVE_TYPES_CATALOG, {
    version: CANONICAL_CATALOG_MANIFEST.version,
    checksum: CANONICAL_CATALOG_MANIFEST.checksum,
    item_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
    expected_count: CANONICAL_CATALOG_MANIFEST.expectedCount,
    status: 'CATALOG_READY',
    loaded_at: new Date().toISOString(),
    source: 'canonical_asset',
    is_degraded: false,
  });
  assert(repo.isReady(), 'Exact canonical dataset must become READY');
  assert(!repo.isDegraded(), 'Exact canonical dataset must not be degraded');
  assert(repo.getMetadata().status === 'CATALOG_READY', 'Status must be CATALOG_READY');

  console.log('🎉 ALL CATALOG INTEGRITY DOMAIN TESTS PASSED WITH 100% SUCCESS!');
}

runCatalogIntegrityTests().catch((err) => {
  console.error('Catalog integrity test failure:', err);
  process.exit(1);
});
