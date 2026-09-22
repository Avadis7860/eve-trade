import { EsiService } from './esi';
import type { CorporationWalletDivisionInfo } from '../types';

export interface CorporationTreasurySyncInput {
  characterId: number;
  accessToken: string;
  division: number;
}

export interface CorporationTreasuryIdentity {
  corporation_id: number;
  corporation_name: string;
  ticker?: string;
  member_count?: number;
}

export type CorporationTreasurySyncFailureStage =
  | 'invalid_request'
  | 'profile'
  | 'wallets'
  | 'validation';

export interface CorporationTreasurySyncSuccess {
  ok: true;
  corporation: CorporationTreasuryIdentity;
  wallets: CorporationWalletDivisionInfo[];
  selectedWallet: CorporationWalletDivisionInfo;
}

export interface CorporationTreasurySyncFailure {
  ok: false;
  stage: CorporationTreasurySyncFailureStage;
  error: string;
  status?: number;
  corporation?: CorporationTreasuryIdentity;
  wallets?: CorporationWalletDivisionInfo[];
}

export type CorporationTreasurySyncResult =
  | CorporationTreasurySyncSuccess
  | CorporationTreasurySyncFailure;

function normalizeDivision(value: number): number {
  return Math.max(1, Math.min(7, Math.floor(Number(value) || 1)));
}

/**
 * Single orchestration boundary for corporation treasury synchronization.
 *
 * This service owns the sequence and consistency contract:
 * 1. resolve the corporation from the active character;
 * 2. read corporation wallets using that same character credential;
 * 3. require the requested division to be present and numerically valid;
 * 4. reject mismatched corporation identities rather than certifying partial data.
 *
 * React consumers only translate this result into UI/config state.
 */
export async function syncCorporationTreasury(
  input: CorporationTreasurySyncInput,
): Promise<CorporationTreasurySyncResult> {
  if (
    !Number.isInteger(input.characterId) ||
    input.characterId <= 0 ||
    typeof input.accessToken !== 'string' ||
    input.accessToken.trim().length === 0 ||
    !Number.isFinite(input.division)
  ) {
    return {
      ok: false,
      stage: 'invalid_request',
      error: 'INVALID_CORPORATION_TREASURY_REQUEST',
      status: 400,
    };
  }

  const division = normalizeDivision(input.division);

  let corpInfo: Awaited<ReturnType<typeof EsiService.fetchCorporationInfo>>;
  try {
    corpInfo = await EsiService.fetchCorporationInfo(
      input.characterId,
      input.accessToken,
    );
  } catch {
    return {
      ok: false,
      stage: 'profile',
      error: 'CORPORATION_PROFILE_UNAVAILABLE',
    };
  }

  if (!corpInfo.ok || !corpInfo.data) {
    return {
      ok: false,
      stage: 'profile',
      error: corpInfo.error || 'CORPORATION_PROFILE_UNAVAILABLE',
      status: corpInfo.status,
    };
  }

  const corporation: CorporationTreasuryIdentity = {
    corporation_id: corpInfo.data.corporation_id,
    corporation_name: corpInfo.data.corporation_name,
    ...(corpInfo.data.ticker !== undefined ? { ticker: corpInfo.data.ticker } : {}),
    ...(corpInfo.data.member_count !== undefined ? { member_count: corpInfo.data.member_count } : {}),
  };

  let walletsRes: Awaited<ReturnType<typeof EsiService.fetchCorporationWallets>>;
  try {
    walletsRes = await EsiService.fetchCorporationWallets(
      input.characterId,
      input.accessToken,
    );
  } catch {
    return {
      ok: false,
      stage: 'wallets',
      error: 'CORPORATION_WALLETS_UNAVAILABLE',
      corporation,
    };
  }

  if (!walletsRes.ok || !walletsRes.data?.wallets) {
    return {
      ok: false,
      stage: 'wallets',
      error: walletsRes.error || 'CORPORATION_WALLETS_UNAVAILABLE',
      status: walletsRes.status,
      corporation,
    };
  }

  const wallets = walletsRes.data.wallets;

  if (
    walletsRes.data.corporation_id !== undefined &&
    walletsRes.data.corporation_id !== corporation.corporation_id
  ) {
    return {
      ok: false,
      stage: 'validation',
      error: 'CORPORATION_ID_MISMATCH',
      corporation,
      wallets,
      status: 502,
    };
  }

  const selectedWallet = wallets.find((wallet) => wallet.division === division);

  if (!selectedWallet || !Number.isFinite(selectedWallet.balance)) {
    return {
      ok: false,
      stage: 'validation',
      error: 'CORPORATION_DIVISION_UNAVAILABLE',
      corporation,
      wallets,
      status: 502,
    };
  }

  return {
    ok: true,
    corporation,
    wallets,
    selectedWallet,
  };
}
