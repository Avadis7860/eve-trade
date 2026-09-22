import { FinancialConfig, TreasurySourceMode, TreasuryResolution, EveCharacterSession, CorporationWalletDivisionInfo } from '../types';
import { roundIsk } from './money';

/**
 * TreasuryEngine — Pure, deterministic EVE Online Treasury & Wallet Resolution Engine.
 * Supports:
 * - Corporation Wallets (7 Divisions: Master Division 1 through Division 7)
 * - Fleet Consolidated Wallets (Aggregated character balances)
 * - Active Character Wallet (Individual pilot)
 * - Manual Budget (Fixed ISK allocation)
 *
 * Invariant: Pure functions, zero network, zero React, zero side effects.
 */
export class TreasuryEngine {
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

      // Balance resolution priority: divisionInfo.balance > cfg.corporation_wallet_balance > cfg.available_capital
      let balance = 0;
      if (divisionInfo && typeof divisionInfo.balance === 'number') {
        balance = divisionInfo.balance;
      } else if (typeof cfg.corporation_wallet_balance === 'number') {
        balance = cfg.corporation_wallet_balance;
      } else {
        balance = cfg.available_capital || 0;
      }

      const effectiveCapital = Math.max(0, roundIsk(balance));

      return {
        source_mode: 'corporation',
        effective_capital: effectiveCapital,
        label: `${corpName} — ${divisionName}`,
        division,
        division_name: divisionName,
        corporation_name: corpName,
        is_corporation: true,
      };
    }

    if (mode === 'fleet_consolidated') {
      let total = 0;
      if (characters && characters.length > 0) {
        for (const c of characters) {
          if (typeof c.wallet_balance === 'number') {
            total += Math.max(0, c.wallet_balance);
          }
        }
      } else if (typeof cfg.fleet_consolidated_capital === 'number') {
        total = cfg.fleet_consolidated_capital;
      } else {
        total = cfg.available_capital || 0;
      }

      const effectiveCapital = Math.max(0, roundIsk(total));
      const charCount = characters?.length || 0;

      return {
        source_mode: 'fleet_consolidated',
        effective_capital: effectiveCapital,
        label: `Trésorerie Flotte (${charCount} pilote${charCount > 1 ? 's' : ''})`,
        is_corporation: false,
      };
    }

    if (mode === 'active_character') {
      const activeChar = characters.find((c) =>
        activeCharacterId ? c.character_id === activeCharacterId : c.is_active
      ) || characters[0];

      let balance = 0;
      if (activeChar && typeof activeChar.wallet_balance === 'number') {
        balance = activeChar.wallet_balance;
      } else {
        balance = cfg.available_capital || 0;
      }

      const effectiveCapital = Math.max(0, roundIsk(balance));
      const name = activeChar?.character_name || 'Pilote Actif';

      return {
        source_mode: 'active_character',
        effective_capital: effectiveCapital,
        label: `Wallet Personnel (${name})`,
        is_corporation: false,
      };
    }

    // Default: 'manual_budget'
    const manualCapital = Math.max(0, roundIsk(cfg.available_capital || 0));
    return {
      source_mode: 'manual_budget',
      effective_capital: manualCapital,
      label: 'Budget Fixe Alloué',
      is_corporation: false,
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
