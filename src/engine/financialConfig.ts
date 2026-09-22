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


/**
 * Changes the selected corporation wallet division without inventing or
 * cross-contaminating the selected capital source.
 *
 * ESI provenance: the selected division balance is authoritative when the
 * division exists in the last observed wallet snapshot.
 * Manual/unavailable provenance: preserve the explicit balance; historical
 * ESI division rows are not a valid source for a manual budget.
 */
export function selectCorporationWalletDivision(
  config: Partial<FinancialConfig>,
  division: number,
): Partial<FinancialConfig> {
  const selectedDivision = Math.max(1, Math.min(7, Math.floor(Number(division) || 1)));
  const next: Partial<FinancialConfig> = {
    corporation_wallet_division: selectedDivision,
  };

  if (config.corporation_wallet_source === 'esi') {
    const observedDivision = config.corporation_divisions?.find(
      (entry) => entry.division === selectedDivision,
    );

    if (observedDivision && Number.isFinite(observedDivision.balance)) {
      next.corporation_wallet_balance = observedDivision.balance;
    } else {
      // Never retain the previous division's observed balance under a new
      // division identity. The caller must establish a fresh ESI observation.
      next.corporation_wallet_balance = undefined;
      next.corporation_wallet_source = 'unavailable';
    }
  }

  return next;
}
