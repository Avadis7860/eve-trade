import { EveCharacterSession, SessionAuthStatus } from '../../types';
import { CharacterSnapshot, CharacterStoreSchemaV3, FreshnessStatus } from './CharacterTypes';
import type { CharacterTransactionSyncSummary } from '../../types/execution';

const STORAGE_KEY_V3 = 'eve_trade_character_store_v3';
const LEGACY_STORAGE_KEY = 'eve_char_session';
const STORAGE_KEY_CHARACTERS = 'eve_linked_characters';
const STORAGE_KEY_ACTIVE_CHAR_ID = 'eve_active_character_id';

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn('Storage write failed for key:', key, e);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },
};

export class CharacterRepository {
  private static instance: CharacterRepository;
  private store: CharacterStoreSchemaV3;
  private listeners = new Set<(activeSession: EveCharacterSession | null, snapshot: CharacterSnapshot | null) => void>();

  private constructor() {
    this.store = this.loadAndMigrate();
  }

  static getInstance(): CharacterRepository {
    if (!CharacterRepository.instance) {
      CharacterRepository.instance = new CharacterRepository();
    }
    return CharacterRepository.instance;
  }

  /**
   * Computes strict session status without forging timestamps.
   */
  static computeSessionStatus(session: Partial<EveCharacterSession>): SessionAuthStatus {
    if (session.auth_error && (session.auth_error.includes('revoked') || session.auth_error.includes('401'))) {
      return 'SESSION_REVOKED';
    }
    if (session.is_token_expired) {
      return 'SESSION_EXPIRED';
    }
    if (!session.expires_at || session.expires_at <= 0) {
      return session.refresh_token ? 'SESSION_EXPIRING' : 'SESSION_EXPIRED';
    }
    const diff = session.expires_at - Date.now();
    if (diff <= 0) {
      return 'SESSION_EXPIRED';
    }
    if (diff < 2 * 60 * 1000) {
      return 'SESSION_EXPIRING';
    }
    return 'SESSION_VALID';
  }

  /**
   * Normalizes an existing session strictly adhering to EVE SSO standards.
   * If expires_at is missing, it is explicitly treated as 0 (expired/needing refresh), NEVER forged.
   */
  static normalizeSession(session: any): EveCharacterSession {
    const rawExpiresAt = Number(session.expires_at) || 0;
    const status = this.computeSessionStatus({ ...session, expires_at: rawExpiresAt });
    const isExpired = session.is_token_expired ?? (status === 'SESSION_EXPIRED' || status === 'SESSION_REVOKED');

    return {
      character_id: Number(session.character_id),
      character_name: session.character_name || `Character #${session.character_id}`,
      portrait_url: session.portrait_url || `https://images.evetech.net/characters/${session.character_id}/portrait?size=128`,
      access_token: session.access_token || '',
      refresh_token: session.refresh_token || '',
      expires_at: rawExpiresAt,
      assigned_hub_id: session.assigned_hub_id,
      assigned_hub_name: session.assigned_hub_name,
      assigned_station_id:
        typeof session.assigned_station_id === 'number' && Number.isInteger(session.assigned_station_id)
          ? session.assigned_station_id
          : undefined,
      last_sync: session.last_sync || new Date().toISOString(),
      is_active: Boolean(session.is_active),
      is_token_expired: isExpired,
      auth_error: session.auth_error,
      session_version: 2,
      auth_status: status,
      last_validated_at: session.last_validated_at || session.last_sync || new Date().toISOString(),
    };
  }

  /**
   * Calculates freshness classification for a snapshot timestamp.
   */
  static computeFreshness(fetchedAtIso: string): FreshnessStatus {
    try {
      const fetchedTime = new Date(fetchedAtIso).getTime();
      const ageMs = Date.now() - fetchedTime;
      if (ageMs < 2 * 60 * 1000) return 'fresh';
      if (ageMs < 15 * 60 * 1000) return 'recent';
      if (ageMs < 60 * 60 * 1000) return 'stale';
      return 'expired';
    } catch {
      return 'unknown';
    }
  }

  private loadAndMigrate(): CharacterStoreSchemaV3 {
    // 1. Try Loading V3 Schema
    try {
      const rawV3 = safeStorage.getItem(STORAGE_KEY_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3);
        if (parsed && parsed.version === 3 && Array.isArray(parsed.characters)) {
          parsed.characters = parsed.characters.map((c: any) => CharacterRepository.normalizeSession(c));
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to parse character store v3:', err);
    }

    // 2. Migrate from legacy V2 / V1 keys
    let migratedChars: EveCharacterSession[] = [];
    let activeCharId: number | null = null;

    try {
      const rawChars = safeStorage.getItem(STORAGE_KEY_CHARACTERS);
      if (rawChars) {
        const parsed = JSON.parse(rawChars);
        if (Array.isArray(parsed)) {
          migratedChars = parsed.map((c) => CharacterRepository.normalizeSession(c));
        }
      }

      const activeIdRaw = safeStorage.getItem(STORAGE_KEY_ACTIVE_CHAR_ID);
      if (activeIdRaw) {
        activeCharId = Number(activeIdRaw);
      }

      if (migratedChars.length === 0) {
        const legacyRaw = safeStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          const leg = JSON.parse(legacyRaw);
          if (leg && leg.character_id) {
            migratedChars = [CharacterRepository.normalizeSession({ ...leg, is_active: true })];
            activeCharId = Number(leg.character_id);
          }
        }
      }
      // If legacy keys were migrated, clean them up to ensure single source of truth (V3 exclusive)
      if (migratedChars.length > 0 || activeCharId !== null) {
        safeStorage.removeItem(STORAGE_KEY_CHARACTERS);
        safeStorage.removeItem(STORAGE_KEY_ACTIVE_CHAR_ID);
        safeStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Error during legacy session migration:', e);
    }

    const defaultV3: CharacterStoreSchemaV3 = {
      version: 3,
      characters: migratedChars,
      active_character_id: activeCharId || (migratedChars[0]?.character_id ?? null),
      snapshots: {},
      transaction_sync_summaries: {},
      updated_at: new Date().toISOString(),
    };

    this.persist(defaultV3);
    return defaultV3;
  }

  private persist(store: CharacterStoreSchemaV3): void {
    this.store = store;
    // Strictly persist to Schema V3 (eliminating legacy key multi-write debt)
    safeStorage.setItem(STORAGE_KEY_V3, JSON.stringify(store));
  }

  getLinkedCharacters(): EveCharacterSession[] {
    return this.store.characters;
  }

  getActiveCharacter(): EveCharacterSession | null {
    if (!this.store.active_character_id) {
      return this.store.characters[0] || null;
    }
    return this.store.characters.find((c) => c.character_id === this.store.active_character_id) || this.store.characters[0] || null;
  }

  saveCharacter(session: EveCharacterSession, makeActive = true): EveCharacterSession[] {
    const normalized = CharacterRepository.normalizeSession({
      ...session,
      is_active: makeActive,
      last_sync: new Date().toISOString(),
    });

    const existingIdx = this.store.characters.findIndex((c) => c.character_id === session.character_id);
    let updatedChars: EveCharacterSession[];

    if (existingIdx >= 0) {
      updatedChars = this.store.characters.map((c, idx) =>
        idx === existingIdx
          ? { ...c, ...normalized, refresh_token: session.refresh_token || c.refresh_token }
          : makeActive ? { ...c, is_active: false } : c
      );
    } else {
      updatedChars = makeActive
        ? [...this.store.characters.map((c) => ({ ...c, is_active: false })), normalized]
        : [...this.store.characters, normalized];
    }

    const nextStore: CharacterStoreSchemaV3 = {
      ...this.store,
      characters: updatedChars,
      active_character_id: makeActive ? normalized.character_id : this.store.active_character_id,
      updated_at: new Date().toISOString(),
    };

    this.persist(nextStore);
    this.notify();
    return updatedChars;
  }

  setActiveCharacter(characterId: number): EveCharacterSession | null {
    const target = this.store.characters.find((c) => c.character_id === characterId);
    if (!target) return null;

    const updated = this.store.characters.map((c) => ({
      ...c,
      is_active: c.character_id === characterId,
    }));

    const nextStore: CharacterStoreSchemaV3 = {
      ...this.store,
      characters: updated,
      active_character_id: characterId,
      updated_at: new Date().toISOString(),
    };

    this.persist(nextStore);
    this.notify();
    return { ...target, is_active: true };
  }

  removeCharacter(characterId: number): EveCharacterSession[] {
    const updated = this.store.characters.filter((c) => c.character_id !== characterId);
    const updatedSnapshots = { ...this.store.snapshots };
    delete updatedSnapshots[characterId];

    let nextActive = this.store.active_character_id;
    if (nextActive === characterId) {
      nextActive = updated.length > 0 ? updated[0].character_id : null;
    }

    const nextStore: CharacterStoreSchemaV3 = {
      ...this.store,
      characters: updated,
      active_character_id: nextActive,
      snapshots: updatedSnapshots,
      updated_at: new Date().toISOString(),
    };

    this.persist(nextStore);
    this.notify();
    return updated;
  }

  /**
   * Updates the operational hub assignment for a connected character.
   */
  updateCharacterHubSettings(
    characterId: number,
    settings: {
      assigned_hub_id?: string;
      assigned_hub_name?: string;
      assigned_station_id?: number;
    }
  ): EveCharacterSession[] {
    const updated = this.store.characters.map((c) => {
      if (c.character_id === characterId) {
        return {
          ...c,
          assigned_hub_id: settings.assigned_hub_id !== undefined ? settings.assigned_hub_id : c.assigned_hub_id,
          assigned_hub_name: settings.assigned_hub_name !== undefined ? settings.assigned_hub_name : c.assigned_hub_name,
          assigned_station_id: settings.assigned_station_id !== undefined ? settings.assigned_station_id : c.assigned_station_id,
        };
      }
      return c;
    });

    const nextStore: CharacterStoreSchemaV3 = {
      ...this.store,
      characters: updated,
      updated_at: new Date().toISOString(),
    };

    this.persist(nextStore);
    this.notify();
    return updated;
  }

  /**
   * Returns a snapshot map of all connected characters.
   */
  getAllSnapshots(): Record<number, CharacterSnapshot> {
    return this.store.snapshots;
  }

  /** Stores transaction sync evidence without changing the freshness timestamp of market/order snapshots. */
  saveTransactionSyncSummary(
    characterId: number,
    summary: CharacterTransactionSyncSummary,
  ): void {
    if (!Number.isSafeInteger(characterId) || characterId <= 0) {
      throw new Error('Invalid characterId for transaction sync summary');
    }

    const existing = this.store.transaction_sync_summaries ?? {};
    const nextStore: CharacterStoreSchemaV3 = {
      ...this.store,
      transaction_sync_summaries: {
        ...existing,
        [characterId]: summary,
      },
      updated_at: new Date().toISOString(),
    };

    this.persist(nextStore);
    this.notify();
  }

  getTransactionSyncSummary(characterId: number) {
    return this.store.transaction_sync_summaries?.[characterId];
  }

  saveSnapshot(characterId: number, snapshot: Partial<CharacterSnapshot>): CharacterSnapshot {
    const existing = this.store.snapshots[characterId];
    const nowIso = new Date().toISOString();

    const fullSnapshot: CharacterSnapshot = {
      character_id: characterId,
      wallet_balance: snapshot.wallet_balance !== undefined ? snapshot.wallet_balance : existing?.wallet_balance ?? null,
      skills: snapshot.skills || existing?.skills || { accounting: 0, broker_relations: 0 },
      active_orders: snapshot.active_orders || existing?.active_orders || [],
      order_history: snapshot.order_history || existing?.order_history || [],
      transactions: snapshot.transactions || existing?.transactions || [],
      journal: snapshot.journal || existing?.journal || [],
      fetched_at: nowIso,
      source: snapshot.source || existing?.source || 'server_proxy',
      freshness: 'fresh',
    };

    const nextStore: CharacterStoreSchemaV3 = {
      ...this.store,
      snapshots: {
        ...this.store.snapshots,
        [characterId]: fullSnapshot,
      },
      updated_at: nowIso,
    };

    this.persist(nextStore);
    this.notify();
    return fullSnapshot;
  }

  getSnapshot(characterId: number): CharacterSnapshot | null {
    const snap = this.store.snapshots[characterId];
    if (!snap) return null;

    // Recalculate dynamic freshness
    return {
      ...snap,
      freshness: CharacterRepository.computeFreshness(snap.fetched_at),
    };
  }

  subscribe(listener: (activeSession: EveCharacterSession | null, snapshot: CharacterSnapshot | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const active = this.getActiveCharacter();
    const snap = active ? this.getSnapshot(active.character_id) : null;
    this.listeners.forEach((fn) => {
      try {
        fn(active, snap);
      } catch (e) {
        console.warn('CharacterRepository listener error:', e);
      }
    });
  }
}
