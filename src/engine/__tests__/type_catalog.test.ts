import { TypeCatalogService } from '../../services/typeCatalog';
import { EVE_TYPES_CATALOG } from '../../data/universe';
import { AuthService } from '../../services/authService';
import { EveCharacterSession } from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTypeCatalogAndEnvironmentTests() {
  console.log('=== RUNNING TYPE CATALOG & REPRODUCIBILITY TESTS ===');

  // 1. Catalog Loading & Status Invariant
  console.log('1. Testing Catalog deterministic load & status...');
  const result = TypeCatalogService.loadCatalog();
  assert(
    result.metadata.status === 'CATALOG_READY' || result.metadata.status === 'CATALOG_LOADED' || result.metadata.status === 'CATALOG_FALLBACK_CORE',
    `Expected CATALOG_READY, CATALOG_LOADED or CATALOG_FALLBACK_CORE, got ${result.metadata.status}`
  );
  assert(result.metadata.item_count > 0, `Expected items count > 0, got ${result.metadata.item_count}`);
  assert(result.metadata.checksum.length === 64, `Expected 64-char SHA256 checksum, got ${result.metadata.checksum.length}`);
  assert(result.types.length === result.metadata.item_count, 'Types array length must match metadata count');
  console.log(`✅ Loaded ${result.metadata.item_count} types with status ${result.metadata.status}.`);

  // 2. Data Integrity of Market Types
  console.log('2. Testing data integrity and positive type_ids...');
  const types = TypeCatalogService.getTypes();
  for (const t of types.slice(0, 100)) {
    assert(typeof t.type_id === 'number' && t.type_id > 0, `Invalid type_id: ${t.type_id}`);
    assert(typeof t.name === 'string' && t.name.trim().length > 0, `Invalid name for type ${t.type_id}`);
    assert(typeof t.volume === 'number' && t.volume >= 0, `Invalid volume for type ${t.type_id}`);
  }
  console.log('✅ Type integrity verified across sample items.');

  // 3. EVE Universe Core Commodities Lookup
  console.log('3. Testing core trade items lookup...');
  const tritanium = TypeCatalogService.getTypeById(34);
  assert(tritanium !== undefined && tritanium.name === 'Tritanium', 'Tritanium (34) must exist in catalog');
  assert(tritanium!.volume === 0.01, `Tritanium volume must be 0.01 m3, got ${tritanium?.volume}`);

  const plex = TypeCatalogService.getTypeById(44992);
  assert(plex !== undefined && plex.name === 'PLEX', 'PLEX (44992) must exist in catalog');

  const rifter = TypeCatalogService.getTypeById(587);
  assert(rifter !== undefined && rifter.name === 'Rifter', 'Rifter (587) must exist in catalog');
  console.log('✅ Core market types lookup verified.');

  // 4. Memory Cache Performance & Determinism
  console.log('4. Testing memory cache determinism...');
  const meta1 = TypeCatalogService.getMetadata();
  const meta2 = TypeCatalogService.getMetadata();
  assert(meta1.checksum === meta2.checksum, 'Metadata checksum must be deterministic across queries');
  assert(meta1.item_count === meta2.item_count, 'Metadata item count must be constant');
  console.log('✅ Cache determinism verified.');

  // 5. AuthService Refresh Locking & Deduplication
  console.log('5. Testing AuthService concurrent refresh deduplication...');
  const mockSession: EveCharacterSession = {
    character_id: 99999999,
    character_name: 'Test Trader',
    portrait_url: 'https://images.evetech.net/characters/99999999/portrait?size=128',
    access_token: 'old_access_token',
    refresh_token: 'valid_refresh_token',
    expires_at: Date.now() - 5000, // Expired
    is_active: true,
  };

  // Mock fetch for token refresh test
  const originalFetch = globalThis.fetch;
  let refreshCallCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('/api/auth/refresh')) {
      refreshCallCount++;
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        ok: true,
        json: async () => ({
          access_token: 'new_token_123',
          refresh_token: 'new_refresh_456',
          expires_in: 1200,
        }),
      } as any;
    }
    return originalFetch(input);
  };

  try {
    // Trigger two concurrent refresh calls for the same character
    const [s1, s2] = await Promise.all([
      AuthService.refreshCharacterToken(mockSession),
      AuthService.refreshCharacterToken(mockSession),
    ]);
    assert(refreshCallCount === 1, `Expected exactly 1 network call due to refresh lock, got ${refreshCallCount}`);
    assert(s1.access_token === 'new_token_123', 's1 received fresh token');
    assert(s2.access_token === 'new_token_123', 's2 received fresh token');
    console.log('✅ AuthService concurrent refresh atomic locking verified.');
    console.log('🎉 ALL TYPE CATALOG & REPRODUCIBILITY TESTS PASSED WITH 100% SUCCESS!');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  try {
    await runTypeCatalogAndEnvironmentTests();
  } catch (err) {
    console.error('Test execution failure:', err);
    process.exit(1);
  }
}

main();
