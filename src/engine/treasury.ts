import { FinancialConfig, TreasurySourceMode, TreasuryResolution, EveCharacterSession, CorporationWalletDivisionInfo, TreasuryCapitalStatus } from '../types';
import { roundIsk } from './money';

/**
 * TreasuryEngine — Pure, deterministic EVE Online Treasury & Wallet Resolution Engine.
 * Supports:
 * - Corporation Wallets (7 Divisions: Master Division 1 through Division 7)
 * - Active Character Wallet (Individual pilot)
 * - Manual Budget (Fixed ISK allocation)
 *
 * Invariant: Pure functions, zero network, zero React, zero side effects.
 */
export class TreasuryEngine {
  /**
   * Converts a factual wallet balance into capital that can be offered to a
   * trading engine. The factual wallet balance itself must remain untouched.
   *
   * A negative wallet is a real observed liability, but it cannot become a
   * negative spendable-capital amount. Returning 0 for that case is deliberate;
   * callers must never retain a stale positive capital value instead.
   */
  static normalizeWalletTradingCapital(
    walletBalance: number | null | undefined,
  ): number | undefined {
    if (typeof walletBalance !== 'number' || !Number.isFinite(walletBalance)) {
      return undefined;
    }

    return Math.max(0, roundIsk(walletBalance));
  }

  /**
   * Standard default division labels in EVE Online.
   */
  static getDivisionDefaultName(division: number): string {
    const div = Math.max(1, Math.min(7, Math.floor(division || 1)));
    if (div === 1) return 'Master (Division 1)';
    return `Division ${div}`;
  }

  /**
   * Resolves the effective trading capital and metadata based on the active treasury mode.
   */
  static resolveEffectiveCapital(
    config?: Partial<FinancialConfig> | null,
    characters: EveCharacterSession[] = [],
    activeCharacterId?: number | null
  ): TreasuryResolution {
    const cfg = config || {};
    const mode: TreasurySourceMode = cfg.treasury_source_mode || 'manual_budget';

    if (mode === 'corporation') {
      const division = Math.max(1, Math.min(7, Math.floor(cfg.corporation_wallet_division || 1)));
      const divisionInfo = cfg.corporation_divisions?.find((d) => d.division === division);
      const divisionName = divisionInfo?.name || this.getDivisionDefaultName(division);
      const corpName = cfg.corporation_name || 'Corporation';
      const source = cfg.corporation_wallet_source || 'unavailable';

      let balance: number | undefined;
      let capitalStatus: TreasuryCapitalStatus = 'unavailable';

      if (source === 'esi') {
        if (divisionInfo && Number.isFinite(divisionInfo.balance)) {
          balance = divisionInfo.balance;
        } else if (Number.isFinite(cfg.corporation_wallet_balance)) {
          balance = cfg.corporation_wallet_balance;
        }
        if (balance !== undefined) capitalStatus = 'observed_esi';
      } else if (source === 'manual' && typeof cfg.corporation_wallet_balance === 'number') {
        balance = cfg.corporation_wallet_balance;
        capitalStatus = 'manual';
      }

      const effectiveCapital = this.normalizeWalletTradingCapital(balance) ?? 0;

      return {
        source_mode: 'corporation',
        effective_capital: effectiveCapital,
        label: source === 'unavailable'
          ? `${corpName} — ${divisionName} (solde ESI indisponible)`
          : `${corpName} — ${divisionName}`,
        division,
        division_name: divisionName,
        corporation_name: corpName,
        is_corporation: true,
        capital_status: capitalStatus,
      };
    }

    if (mode === 'active_character') {
      const activeChar = characters.find((c) =>
        activeCharacterId ? c.character_id === activeCharacterId : c.is_active
      ) || characters[0];

      let balance: number | undefined;
      let capitalStatus: TreasuryCapitalStatus = 'unavailable';
      if (activeChar && Number.isFinite(activeChar.wallet_balance)) {
        balance = activeChar.wallet_balance;
        capitalStatus = 'observed_esi';
      } else if (typeof cfg.available_capital === 'number') {
        balance = cfg.available_capital;
        capitalStatus = 'manual';
      }

      const effectiveCapital = this.normalizeWalletTradingCapital(balance) ?? 0;
      const name = activeChar?.character_name || 'Pilote Actif';

      return {
        source_mode: 'active_character',
        effective_capital: effectiveCapital,
        label: `Wallet Personnel (${name})`,
        is_corporation: false,
        capital_status: capitalStatus,
      };
    }

    // Default: 'manual_budget'
    const manualCapital = this.normalizeWalletTradingCapital(
      typeof cfg.available_capital === 'number' ? cfg.available_capital : undefined
    ) ?? 0;

    return {
      source_mode: 'manual_budget',
      effective_capital: manualCapital,
      label: 'Budget Fixe Alloué',
      is_corporation: false,
      capital_status: typeof cfg.available_capital === 'number' ? 'manual' : 'unavailable',
    };
  }

  /**
   * Generates standard 7-division placeholder structures when initializing a corporation.
   */
  static generateDefaultDivisions(knownDivisions: Partial<CorporationWalletDivisionInfo>[] = []): CorporationWalletDivisionInfo[] {
    const result: CorporationWalletDivisionInfo[] = [];
    const knownMap = new Map<number, Partial<CorporationWalletDivisionInfo>>();
    for (const d of knownDivisions) {
      if (d.division) knownMap.set(d.division, d);
    }

    for (let div = 1; div <= 7; div++) {
      const existing = knownMap.get(div);
      result.push({
        division: div,
        name: existing?.name || this.getDivisionDefaultName(div),
        balance: typeof existing?.balance === 'number' ? existing.balance : 0,
      });
    }

    return result;
  }
}
