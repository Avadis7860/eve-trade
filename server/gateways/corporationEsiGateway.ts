import { createEsiGateway, EsiGateway } from '../utils/esiGateway';
import type { EsiGatewayResponse, EsiPrincipalContext } from '../utils/esiTypes';

export interface CorporationProfile {
  readonly corporation_id?: number;
  readonly name?: string;
  readonly ticker?: string;
  readonly member_count?: number;
}

export interface CorporationWallet {
  readonly division: number;
  readonly balance: number;
}

export interface CorporationWalletDivision {
  readonly division: number;
  readonly name: string;
}

export interface CorporationWalletDivisions {
  readonly wallet?: CorporationWalletDivision[];
}

const ANONYMOUS_PRINCIPAL: EsiPrincipalContext = { type: 'anonymous' };

function characterContext(characterId: number, bearerCredential: string): EsiPrincipalContext {
  return {
    type: 'character',
    id: characterId,
    bearerCredential,
  };
}

/**
 * Corporation ESI boundary.
 *
 * Corporation endpoints are authenticated by the character whose OAuth
 * credential is being used. There is deliberately no synthetic corporation
 * principal: CCP authorization is attached to the authenticated character.
 *
 * This gateway owns endpoint mapping only. Trading, treasury and future
 * industry consumers must remain outside this transport boundary.
 */
export class CorporationEsiGateway {
  constructor(
    private readonly gateway: Pick<EsiGateway, 'request'> = createEsiGateway(),
  ) {}

  async fetchProfile(
    corporationId: number,
  ): Promise<EsiGatewayResponse<CorporationProfile>> {
    return this.gateway.request<CorporationProfile>(
      {
        method: 'GET',
        path: `/corporations/${corporationId}/`,
        query: { datasource: 'tranquility' },
      },
      ANONYMOUS_PRINCIPAL,
    );
  }

  async fetchWallets(
    corporationId: number,
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CorporationWallet[]>> {
    return this.gateway.request<CorporationWallet[]>(
      {
        method: 'GET',
        path: `/corporations/${corporationId}/wallets/`,
        query: { datasource: 'tranquility' },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchDivisions(
    corporationId: number,
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CorporationWalletDivisions>> {
    return this.gateway.request<CorporationWalletDivisions>(
      {
        method: 'GET',
        path: `/corporations/${corporationId}/divisions/`,
        query: { datasource: 'tranquility' },
      },
      characterContext(characterId, bearerCredential),
    );
  }
}

export const corporationEsiGateway = new CorporationEsiGateway();
