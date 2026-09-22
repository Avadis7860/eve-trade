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

  await test('positive wallet balance is preserved with ISK rounding policy', () => {
    assert(
      TreasuryEngine.normalizeWalletTradingCapital(1234.56) === 1235,
      'Wallet capital must use canonical ISK rounding',
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

  console.log('\nTreasury wallet invariants: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runTests().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
