import { EsiService } from '../esi';
import { syncCorporationTreasury } from '../corporationTreasurySync';

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error('[CorporationTreasurySyncTest] ' + message);
}

const originalFetchCorporationInfo = EsiService.fetchCorporationInfo;
const originalFetchCorporationWallets = EsiService.fetchCorporationWallets;

async function withMocks(
  fetchInfo: typeof EsiService.fetchCorporationInfo,
  fetchWallets: typeof EsiService.fetchCorporationWallets,
  run: () => Promise<void>,
): Promise<void> {
  EsiService.fetchCorporationInfo = fetchInfo;
  EsiService.fetchCorporationWallets = fetchWallets;

  try {
    await run();
  } finally {
    EsiService.fetchCorporationInfo = originalFetchCorporationInfo;
    EsiService.fetchCorporationWallets = originalFetchCorporationWallets;
  }
}

async function runTests(): Promise<void> {
  await withMocks(
    async () => ({
      ok: true,
      status: 200,
      data: {
        character_id: 1001,
        corporation_id: 9001,
        corporation_name: 'Starlight Holdings Inc.',
      },
    }),
    async () => ({
      ok: true,
      status: 200,
      data: {
        corporation_id: 9001,
        wallets: [
          { division: 1, name: 'Master Operations', balance: 5_000_000_000 },
          { division: 2, name: 'Hauling Fund', balance: 750_000_000 },
        ],
      },
    }),
    async () => {
      const result = await syncCorporationTreasury({
        characterId: 1001,
        accessToken: 'token-alpha',
        division: 2,
      });

      assert(result.ok, 'Observed wallet snapshot should succeed');
      if (!result.ok) return;
      assert(result.selectedWallet.division === 2, 'Requested division must be selected');
      assert(result.selectedWallet.balance === 750_000_000, 'Selected ESI division balance must be exact');
      assert(result.corporation.corporation_id === 9001, 'Corporation identity must be preserved');
    },
  );

  await withMocks(
    async () => ({
      ok: false,
      status: 403,
      error: 'HTTP_403',
    }),
    async () => {
      throw new Error('wallets must not be queried when profile resolution fails');
    },
    async () => {
      const result = await syncCorporationTreasury({
        characterId: 1001,
        accessToken: 'token-alpha',
        division: 1,
      });

      assert(!result.ok, 'Profile failure must fail synchronization');
      assert(result.stage === 'profile', 'Profile failure stage must be preserved');
      assert(result.status === 403, 'Profile HTTP status must be preserved');
      assert(result.error === 'HTTP_403', 'Profile error must be preserved');
    },
  );

  await withMocks(
    async () => ({
      ok: true,
      status: 200,
      data: {
        character_id: 1001,
        corporation_id: 9001,
        corporation_name: 'Starlight Holdings Inc.',
      },
    }),
    async () => ({
      ok: false,
      status: 403,
      error: 'HTTP_403',
    }),
    async () => {
      const result = await syncCorporationTreasury({
        characterId: 1001,
        accessToken: 'token-alpha',
        division: 1,
      });

      assert(!result.ok, 'Wallet authorization failure must fail synchronization');
      assert(result.stage === 'wallets', 'Wallet failure stage must be preserved');
      assert(result.status === 403, 'Wallet HTTP status must be preserved');
      assert(result.corporation?.corporation_id === 9001, 'Known corporation identity must remain available');
    },
  );

  await withMocks(
    async () => ({
      ok: true,
      status: 200,
      data: {
        character_id: 1001,
        corporation_id: 9001,
        corporation_name: 'Starlight Holdings Inc.',
      },
    }),
    async () => ({
      ok: true,
      status: 200,
      data: {
        corporation_id: 9010,
        wallets: [{ division: 1, name: 'Wrong Corp', balance: 5_000_000_000 }],
      },
    }),
    async () => {
      const result = await syncCorporationTreasury({
        characterId: 1001,
        accessToken: 'token-alpha',
        division: 1,
      });

      assert(!result.ok, 'Mismatched corporation data must fail closed');
      assert(result.stage === 'validation', 'Mismatch must be a validation failure');
      assert(result.error === 'CORPORATION_ID_MISMATCH', 'Mismatch error must be explicit');
    },
  );

  await withMocks(
    async () => ({
      ok: true,
      status: 200,
      data: {
        character_id: 1001,
        corporation_id: 9001,
        corporation_name: 'Starlight Holdings Inc.',
      },
    }),
    async () => ({
      ok: true,
      status: 200,
      data: {
        corporation_id: 9001,
        wallets: [{ division: 1, name: 'Master Operations', balance: 5_000_000_000 }],
      },
    }),
    async () => {
      const result = await syncCorporationTreasury({
        characterId: 1001,
        accessToken: 'token-alpha',
        division: 7,
      });

      assert(!result.ok, 'Unavailable requested division must fail closed');
      assert(result.stage === 'validation', 'Missing division must be a validation failure');
      assert(result.error === 'CORPORATION_DIVISION_UNAVAILABLE', 'Missing division must be explicit');
    },
  );

  const invalid = await syncCorporationTreasury({
    characterId: 0,
    accessToken: '',
    division: 1,
  });
  assert(!invalid.ok, 'Invalid request must fail');
  assert(invalid.stage === 'invalid_request', 'Invalid request stage must be explicit');
  assert(invalid.status === 400, 'Invalid request must expose HTTP 400 semantics');

  console.log('✅ Corporation treasury synchronization contract verified.');
}

runTests();
