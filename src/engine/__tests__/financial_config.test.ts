import { loadPersistedFinancialConfig, normalizeFinancialConfig } from '../financialConfig';
import type { FinancialConfig } from '../../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

const defaults = {
  available_capital: 1_000_000_000,
  broker_fee: 0.0145,
  sales_tax: 0.035,
} as FinancialConfig;

async function runTests(): Promise<void> {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void): void {
    try {
      fn();
      console.log('  [PASS] ' + name);
      passed++;
    } catch (error: unknown) {
      console.error('  [FAIL] ' + name + ': ' + String(error));
      failed++;
    }
  }

  test('legacy corporation config without provenance is fail-closed', () => {
    const result = normalizeFinancialConfig({
      treasury_source_mode: 'corporation',
      corporation_wallet_balance: 5_000_000_000,
      corporation_divisions: [
        { division: 1, name: 'Legacy', balance: 5_000_000_000 },
      ],
    });

    assert(result.corporation_wallet_source === 'unavailable', 'Missing source must become unavailable');
    assert(result.corporation_wallet_balance === 5_000_000_000, 'Raw legacy balance must remain readable');
  });

  test('explicit ESI provenance is preserved', () => {
    const result = normalizeFinancialConfig({
      treasury_source_mode: 'corporation',
      corporation_wallet_source: 'esi',
      corporation_wallet_balance: 5_000_000_000,
    });
    assert(result.corporation_wallet_source === 'esi', 'ESI provenance must be preserved');
  });

  test('explicit manual provenance is preserved', () => {
    const result = normalizeFinancialConfig({
      treasury_source_mode: 'corporation',
      corporation_wallet_source: 'manual',
      corporation_wallet_balance: 2_000_000_000,
    });
    assert(result.corporation_wallet_source === 'manual', 'Manual provenance must be preserved');
  });

  test('invalid corporation provenance fails closed instead of being trusted', () => {
    const result = normalizeFinancialConfig({
      treasury_source_mode: 'corporation',
      corporation_wallet_source: 'unexpected' as any,
      corporation_wallet_balance: 9_000_000_000,
    });
    assert(result.corporation_wallet_source === 'unavailable', 'Invalid provenance must become unavailable');
  });

  test('non-corporation treasury modes are not polluted by corporation provenance defaults', () => {
    const result = normalizeFinancialConfig({
      treasury_source_mode: 'manual_budget',
    });
    assert(result.corporation_wallet_source === undefined, 'Non-corporation mode should not gain a corporation source');
  });

  test('persisted legacy JSON is merged with defaults and normalized', () => {
    const result = loadPersistedFinancialConfig(
      JSON.stringify({
        treasury_source_mode: 'corporation',
        corporation_wallet_balance: 7_000_000_000,
      }),
      defaults,
    );
    assert(result.available_capital === defaults.available_capital, 'Defaults must remain available');
    assert(result.corporation_wallet_source === 'unavailable', 'Persisted legacy source must fail closed');
    assert(result.corporation_wallet_balance === 7_000_000_000, 'Persisted balance must remain readable');
  });

  test('invalid persisted JSON falls back to defaults without throwing', () => {
    const result = loadPersistedFinancialConfig('{not-json', defaults);
    assert(result.available_capital === defaults.available_capital, 'Invalid JSON must fall back to defaults');
  });

  console.log('\nFinancial config provenance contract: ' + passed + ' passed, ' + failed + ' failed.');
  if (failed > 0) process.exit(1);
}

runTests().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
