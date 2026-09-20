import {
  EveCharacterSession,
  EveCharacterOrder,
  EveCharacterTransaction,
  EveCharacterJournalEntry,
} from '../../types';

export type FreshnessStatus = 'fresh' | 'recent' | 'stale' | 'expired' | 'unknown';

export interface CharacterTradingSkills {
  accounting: number;
  broker_relations: number;
  advanced_broker_relations?: number;
}

export interface CharacterSnapshot {
  character_id: number;
  wallet_balance: number | null;
  skills: CharacterTradingSkills;
  active_orders: EveCharacterOrder[];
  order_history: EveCharacterOrder[];
  transactions: EveCharacterTransaction[];
  journal: EveCharacterJournalEntry[];
  fetched_at: string;
  source: 'esi_direct' | 'server_proxy' | 'cached';
  freshness: FreshnessStatus;
}

export interface CharacterStoreSchemaV3 {
  version: 3;
  characters: EveCharacterSession[];
  active_character_id: number | null;
  snapshots: Record<number, CharacterSnapshot>;
  updated_at: string;
}
