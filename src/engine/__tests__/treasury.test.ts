import { TreasuryEngine } from '../treasury';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

async function runTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
      await fn();
      console.log('  [PASS] ' + name);
      passed++;
    } catch (error: unknown) {
      console.error('  [FAIL] ' + name + ': ' + String(error));
      failed++;
    }
  }

  await test('negative wallet balance becomes zero spendable capital without mutating the factual balance', () => {
    const factualBalance = -12_500_000.25;
    const tradingCapital = TreasuryEngine.normalizeWalletTradingCapital(factualBalance);

    assert(tradingCapital === 0, 'Negative wallet must produce zero spendable capital');
    assert(factualBalance === -12_500_000.25, 'Factual negative wallet must remain unchanged');
  });

  await test('zero wallet balance stays zero capital', () => {
    assert(TreasuryEngine.normalizeWalletTradingCapital(0) === 0, 'Zero wallet must remain zero capital');
  });

  await test('positive wallet balance is preserved with the canonical money rounding policy', () => {
    assert(
      TreasuryEngine.normalizeWalletTradingCapital(1234.56) === 1234.56,
      'Wallet capital must use the canonical two-decimal ISK rounding',
    );
  });

  await test('missing or non-finite wallet data does not overwrite an existing capital value', () => {
    assert(
      TreasuryEngine.normalizeWalletTradingCapital(null) === undefined,
      'Null wallet must not fabricate capital',
    );
    assert(
      TreasuryEngine.normalizeWalletTradingCapital(undefined) === undefined,
      'Undefined wallet must not fabricate capital',
    );
    assert(
      TreasuryEngine.normalizeWalletTradingCapital(Number.NaN) === undefined,
      'NaN wallet must not fabricate capital',
    );
    assert(
      TreasuryEngine.normalizeWalletTradingCapital(Number.POSITIVE_INFINITY) === undefined,
      'Infinite wallet must not fabricate capital',
    );
  });

  await test('active-character treasury never exposes negative spendable capital', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'active_character',
        available_capital: 800_000_000,
      },
      [{
        character_id: 1001,
        character_name: 'Negative Wallet Pilot',
        wallet_balance: -5_000_000,
        is_active: true,
      } as any],
      1001,
    );

    assert(result.effective_capital === 0, 'Active-character spendable capital must be zero');
  });

  await test('legacy corporation config without wallet provenance fails closed despite a positive stored balance', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'corporation',
        corporation_wallet_division: 1,
        corporation_wallet_balance: 5_000_000_000,
        corporation_divisions: [
          { division: 1, name: 'Legacy', balance: 5_000_000_000 },
        ],
        available_capital: 2_000_000_000,
      },
      [],
    );

    assert(result.effective_capital === 0, 'Missing corporation provenance must not certify legacy capital');
    assert(result.capital_status === 'unavailable', 'Missing provenance must remain unavailable');
  });

  await test('corporation treasury uses observed corporation balance even when the character wallet is negative', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'corporation',
        corporation_wallet_division: 1,
        corporation_wallet_balance: 5_000_000_000,
        corporation_wallet_source: 'esi',
        corporation_divisions: [
          { division: 1, name: 'Trade', balance: 5_000_000_000 },
        ],
        available_capital: 0,
      },
      [{
        character_id: 1001,
        character_name: 'Negative Wallet Pilot',
        wallet_balance: -250_000_000,
        is_active: true,
      } as any],
      1001,
    );

    assert(result.effective_capital === 5_000_000_000, 'Corporation capital must not be reduced by the character wallet');
    assert(result.capital_status === 'observed_esi', 'Corporation source must be marked as observed ESI');
  });

  await test('corporation treasury does not fall back to character-derived available capital when ESI data is unavailable', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'corporation',
        corporation_wallet_division: 1,
        corporation_wallet_balance: 5_000_000_000,
        corporation_wallet_source: 'unavailable',
        available_capital: 3_000_000_000,
      },
      [{
        character_id: 1001,
        character_name: 'Negative Wallet Pilot',
        wallet_balance: -250_000_000,
        is_active: true,
      } as any],
      1001,
    );

    assert(result.effective_capital === 0, 'Unavailable corporation capital must fail closed to zero spendable capital');
    assert(result.capital_status === 'unavailable', 'Unavailable corporation data must remain distinguishable from zero');
  });

  await test('corporation manual budget remains explicit and independent from character wallet', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'corporation',
        corporation_wallet_division: 2,
        corporation_wallet_balance: 1_500_000_000,
        corporation_wallet_source: 'manual',
        available_capital: 50_000_000,
      },
      [{
        character_id: 1001,
        character_name: 'Negative Wallet Pilot',
        wallet_balance: -250_000_000,
        is_active: true,
      } as any],
      1001,
    );

    assert(result.effective_capital === 1_500_000_000, 'Explicit corporation manual capital must be used');
    assert(result.capital_status === 'manual', 'Manual corporation capital must be labeled manual');
  });

  await test('negative corporation wallet remains factual while producing zero spendable capital', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'corporation',
        corporation_wallet_division: 1,
        corporation_wallet_balance: -100_000_000,
        corporation_wallet_source: 'esi',
        corporation_divisions: [
          { division: 1, name: 'Trade', balance: -100_000_000 },
        ],
      },
      [],
    );

    assert(result.effective_capital === 0, 'Negative corporation balance must not become negative spendable capital');
    assert(result.capital_status === 'observed_esi', 'Negative corporation balance is still observed ESI data');
  });

  await test('non-finite ESI corporation balance cannot be certified, even when legacy data is present', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'corporation',
        corporation_wallet_division: 2,
        corporation_wallet_balance: Number.NaN,
        corporation_wallet_source: 'esi',
        corporation_divisions: [
          { division: 2, name: 'Invalid', balance: Number.NaN },
        ],
        available_capital: 9_000_000_000,
      },
      [],
    );

    assert(result.effective_capital === 0, 'Non-finite corporation balance must fail closed');
    assert(result.capital_status === 'unavailable', 'Non-finite ESI balance must not be marked observed');
  });

  await test('fleet treasury is not marked observed ESI when character wallets are unavailable', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'fleet_consolidated',
        fleet_consolidated_capital: 1_500_000_000,
      },
      [{
        character_id: 1001,
        character_name: 'Wallet Pending',
        wallet_balance: undefined,
      } as any],
    );

    assert(result.effective_capital === 0, 'Unavailable fleet wallets must retain the existing zero-capital behavior');
    assert(result.capital_status === 'unavailable', 'Missing wallet observations must not be certified as ESI');
  });

  await test('fleet treasury is observed ESI when at least one finite character wallet is available', () => {
    const result = TreasuryEngine.resolveEffectiveCapital(
      {
        treasury_source_mode: 'fleet_consolidated',
      },
      [
        {
          character_id: 1001,
          character_name: 'Observed Wallet',
          wallet_balance: 750_000_000,
        } as any,
        {
          character_id: 1002,
          character_name: 'Wallet Pending',
          wallet_balance: undefined,
        } as any,
      ],
    );

    assert(result.effective_capital === 750_000_000, 'Observed fleet wallet must contribute to capital');
    assert(result.capital_status === 'observed_esi', 'A finite wallet observation must certify fleet source');
  });

  console.log('\nTreasury wallet invariants: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runTests().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
