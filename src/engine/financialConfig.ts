import type { FinancialConfig, CorporationWalletSource } from '../types';

/**
 * Normalizes persisted/runtime financial configuration at the provenance
 * boundary. This is deliberately pure and side-effect free.
 *
 * A corporation wallet balance without an explicit provenance marker is a
 * legacy/ambiguous value. It remains readable/editable as configuration data,
 * but it is never promoted to certified trading capital automatically.
 */
export function normalizeFinancialConfig(
  config: Partial<FinancialConfig> | null | undefined,
): Partial<FinancialConfig> {
  const normalized: Partial<FinancialConfig> = { ...(config || {}) };

  if (normalized.treasury_source_mode === 'corporation') {
    const source = normalized.corporation_wallet_source;
    const isKnownSource =
      source === 'esi' ||
      source === 'manual' ||
      source === 'unavailable';

    normalized.corporation_wallet_source = (
      isKnownSource ? source : 'unavailable'
    ) as CorporationWalletSource;
  }

  return normalized;
}

/**
 * Safely overlays persisted configuration on top of the application defaults.
 * Invalid JSON or non-object JSON is rejected without allowing persisted data
 * to bypass the provenance normalization boundary.
 */
export function loadPersistedFinancialConfig(
  raw: string | null,
  defaults: FinancialConfig,
): FinancialConfig {
  if (!raw) return normalizeFinancialConfig(defaults) as FinancialConfig;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return normalizeFinancialConfig(defaults) as FinancialConfig;
    }

    return normalizeFinancialConfig({
      ...defaults,
      ...(parsed as Partial<FinancialConfig>),
    }) as FinancialConfig;
  } catch {
    return normalizeFinancialConfig(defaults) as FinancialConfig;
  }
}
