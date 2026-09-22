import { readFileSync } from 'node:fs';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function runTests(): void {
  const routeSource = readFileSync(
    new URL('../routes/characters.ts', import.meta.url),
    'utf-8',
  );
  const characterSyncSource = readFileSync(
    new URL('../../src/hooks/useCharacterSync.ts', import.meta.url),
    'utf-8',
  );
  const corporationTreasurySyncSource = readFileSync(
    new URL('../../src/hooks/useCorporationTreasurySync.ts', import.meta.url),
    'utf-8',
  );
  const corporationTreasuryServiceSource = readFileSync(
    new URL('../../src/services/corporationTreasurySync.ts', import.meta.url),
    'utf-8',
  );
  const appSource = readFileSync(
    new URL('../../src/App.tsx', import.meta.url),
    'utf-8',
  );

  assert(
    !routeSource.includes("from '../utils/esiClient'"),
    'Character routes must not import the shared ESI transport directly',
  );
  assert(
    !/\bfetchEsi\s*\(/.test(routeSource),
    'Character routes must not call fetchEsi directly',
  );
  assert(
    routeSource.includes("from '../gateways/corporationEsiGateway'"),
    'Character routes must use the corporation ESI gateway for corporation resources',
  );
  assert(
    !characterSyncSource.includes('fetchCorporationInfo') &&
      !characterSyncSource.includes('fetchCorporationWallets'),
    'Character synchronization must not own corporation treasury acquisition',
  );
  assert(
    corporationTreasuryServiceSource.includes('fetchCorporationInfo') &&
      corporationTreasuryServiceSource.includes('fetchCorporationWallets'),
    'Corporation treasury acquisition must live in the shared treasury sync service',
  );
  assert(
    !corporationTreasurySyncSource.includes('fetchCorporationInfo') &&
      !corporationTreasurySyncSource.includes('fetchCorporationWallets') &&
      corporationTreasurySyncSource.includes("from '../services/corporationTreasurySync'"),
    'The lifecycle hook must delegate corporation treasury acquisition to the shared service',
  );
  assert(
    appSource.includes("useCorporationTreasurySync"),
    'App must wire the dedicated corporation treasury lifecycle',
  );


  console.log('  [PASS] character ESI access remains gateway-only');
  console.log('\nCorporation ESI architecture contract: 1 passed, 0 failed.');
}

try {
  runTests();
} catch (error: unknown) {
  console.error('  [FAIL] character ESI access remains gateway-only');
  console.error(String(error));
  process.exit(1);
}
