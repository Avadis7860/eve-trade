import {
  EveCharacterSession,
  EveCharacterOrder,
  EveCharacterTransaction,
  EveCharacterJournalEntry,
} from '../../types';
import type { CharacterTransactionSyncSummary } from '../../types/execution';

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
  /** Active personal and corporation orders; ownership.ownership_type is authoritative. */
  active_orders: EveCharacterOrder[];
  /** Character-scoped history currently retained by the snapshot pipeline. */
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
  /** Durable evidence envelope for transaction-history coverage; separate from snapshot freshness. */
  transaction_sync_summaries?: Record<number, CharacterTransactionSyncSummary>;
  updated_at: string;
}
