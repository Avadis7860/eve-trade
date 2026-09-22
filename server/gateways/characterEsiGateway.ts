import { createEsiGateway, EsiGateway } from '../utils/esiGateway';
import type { EsiGatewayResponse, EsiPrincipalContext, EsiResponseMetadata } from '../utils/esiTypes';

export interface CharacterPublicIdentity {
  readonly character_id: number;
  readonly corporation_id?: number;
  readonly name?: string;
}

export interface CharacterOrder {
  readonly [key: string]: unknown;
}

export interface CharacterSkillSet {
  readonly [key: string]: unknown;
}

export interface CharacterTransaction {
  readonly [key: string]: unknown;
}

export interface CharacterJournalEntry {
  readonly [key: string]: unknown;
}

const ANONYMOUS_PRINCIPAL: EsiPrincipalContext = { type: 'anonymous' };\n\nfunction characterContext(characterId: number, bearerCredential: string): EsiPrincipalContext {
  return {
    type: 'character',
    id: characterId,
    bearerCredential,
  };
}

export class CharacterEsiGateway {
  constructor(
    private readonly gateway: Pick<EsiGateway, 'request'> = createEsiGateway(),
  ) {}

  async fetchOrders(
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CharacterOrder[]>> {
    return this.gateway.request<CharacterOrder[]>(
      {
        method: 'GET',
        path: `/characters/${characterId}/orders/`,
        query: { datasource: 'tranquility' },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchOrderHistory(
    characterId: number,
    bearerCredential: string,
    page = 1,
  ): Promise<EsiGatewayResponse<CharacterOrder[]>> {
    return this.gateway.request<CharacterOrder[]>(
      {
        method: 'GET',
        path: `/characters/${characterId}/orders/history/`,
        query: { datasource: 'tranquility', page },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchWallet(
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<number>> {
    return this.gateway.request<number>(
      {
        method: 'GET',
        path: `/characters/${characterId}/wallet/`,
        query: { datasource: 'tranquility' },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchSkills(
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CharacterSkillSet>> {
    return this.gateway.request<CharacterSkillSet>(
      {
        method: 'GET',
        path: `/characters/${characterId}/skills/`,
        query: { datasource: 'tranquility' },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchTransactions(
    characterId: number,
    bearerCredential: string,
    fromId?: number,
  ): Promise<EsiGatewayResponse<CharacterTransaction[]>> {
    return this.gateway.request<CharacterTransaction[]>(
      {
        method: 'GET',
        path: `/characters/${characterId}/wallet/transactions/`,
        query: {
          datasource: 'tranquility',
          from_id: fromId,
        },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchJournal(
    characterId: number,
    bearerCredential: string,
  ): Promise<EsiGatewayResponse<CharacterJournalEntry[]>> {
    return this.gateway.request<CharacterJournalEntry[]>(
      {
        method: 'GET',
        path: `/characters/${characterId}/wallet/journal/`,
        query: { datasource: 'tranquility' },
      },
      characterContext(characterId, bearerCredential),
    );
  }

  async fetchPublicIdentity(
    characterId: number,
  ): Promise<EsiGatewayResponse<CharacterPublicIdentity>> {
    return this.gateway.request<CharacterPublicIdentity>({
      method: 'GET',
      path: `/characters/${characterId}/`,
      query: { datasource: 'tranquility' },
    });
  }
}

export function setCharacterRetryAfter(res: { setHeader(name: string, value: string): void }, metadata: EsiResponseMetadata): void {
  if (metadata.rateLimit.retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(metadata.rateLimit.retryAfterSeconds));
  }
  if (metadata.rateLimit.errorLimitRemain !== undefined) {
    res.setHeader('x-esi-error-limit-remain', String(metadata.rateLimit.errorLimitRemain));
  }
  if (metadata.rateLimit.errorLimitResetSeconds !== undefined) {
    res.setHeader('x-esi-error-limit-reset', String(metadata.rateLimit.errorLimitResetSeconds));
  }
}

export const characterEsiGateway = new CharacterEsiGateway();
