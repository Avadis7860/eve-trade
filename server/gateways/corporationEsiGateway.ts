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
export interface CorporationOrder {
  readonly [key: string]: unknown;
}

export type CorporationOrderHistory = CorporationOrder;

const ANONYMOUS_PRINCIPAL: EsiPrincipalContext = { type: 'anonymous' };

const EMPTY_METADATA: EsiGatewayResponse<unknown>['metadata'] = {
  cache: {},
  rateLimit: {},
  pagination: {},
};

function invalidRequest<T>(message: string): EsiGatewayResponse<T> {
  return {
    ok: false,
    status: 400,
    data: null,
    error: {
      kind: 'INVALID_REQUEST',
      status: 400,
      message,
      retryable: false,
    },
    metadata: EMPTY_METADATA,
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonEmptyCredential(value: string): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

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
    if (!isPositiveInteger(corporationId)) {
      return invalidRequest<CorporationProfile>(
        'corporationId must be a positive integer',
      );
    }

    return this.gateway.request<CorporationProfile>(
      {
        method: 'GET',
        path: `/corporations/${corporationId}/`,
        query: { datasource: 'tranquility' },
      },
      ANONYMOUS_PRINCIPAL,
    );
  }

  async fetchOrders(
    corporationId: number,
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CorporationOrder[]>> {
    if (!isPositiveInteger(corporationId)) {
      return invalidRequest<CorporationOrder[]>('corporationId must be a positive integer');
    }
    if (!isPositiveInteger(characterId)) {
      return invalidRequest<CorporationOrder[]>('characterId must be a positive integer');
    }
    if (!isNonEmptyCredential(bearerCredential)) {
      return invalidRequest<CorporationOrder[]>('bearerCredential must be a non-empty string');
    }

    return this.gateway.request<CorporationOrder[]>({
      method: 'GET',
      path: '/corporations/' + corporationId + '/orders/',
      query: { datasource: 'tranquility' },
    }, characterContext(characterId, bearerCredential));
  }

  async fetchOrderHistory(
    corporationId: number,
    characterId: number,
    bearerCredential: string,
    page = 1,
  ): Promise<EsiGatewayResponse<CorporationOrderHistory[]>> {
    if (!isPositiveInteger(corporationId)) {
      return invalidRequest<CorporationOrderHistory[]>('corporationId must be a positive integer');
    }
    if (!isPositiveInteger(characterId)) {
      return invalidRequest<CorporationOrderHistory[]>('characterId must be a positive integer');
    }
    if (!isNonEmptyCredential(bearerCredential)) {
      return invalidRequest<CorporationOrderHistory[]>('bearerCredential must be a non-empty string');
    }
    if (!Number.isInteger(page) || page < 1 || page > 1000) {
      return invalidRequest<CorporationOrderHistory[]>('page must be an integer between 1 and 1000');
    }

    return this.gateway.request<CorporationOrderHistory[]>({
      method: 'GET',
      path: '/corporations/' + corporationId + '/orders/history/',
      query: { datasource: 'tranquility', page },
    }, characterContext(characterId, bearerCredential));
  }

  async fetchWallets(
    corporationId: number,
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CorporationWallet[]>> {
    if (!isPositiveInteger(corporationId)) {
      return invalidRequest<CorporationWallet[]>(
        'corporationId must be a positive integer',
      );
    }
    if (!isPositiveInteger(characterId)) {
      return invalidRequest<CorporationWallet[]>(
        'characterId must be a positive integer',
      );
    }
    if (!isNonEmptyCredential(bearerCredential)) {
      return invalidRequest<CorporationWallet[]>(
        'bearerCredential must be a non-empty string',
      );
    }

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
    if (!isPositiveInteger(corporationId)) {
      return invalidRequest<CorporationWalletDivisions>(
        'corporationId must be a positive integer',
      );
    }
    if (!isPositiveInteger(characterId)) {
      return invalidRequest<CorporationWalletDivisions>(
        'characterId must be a positive integer',
      );
    }
    if (!isNonEmptyCredential(bearerCredential)) {
      return invalidRequest<CorporationWalletDivisions>(
        'bearerCredential must be a non-empty string',
      );
    }

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
