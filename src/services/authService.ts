import { EveCharacterSession, SessionAuthStatus } from '../types';

const STORAGE_KEY_CHARACTERS = 'eve_linked_characters';
const STORAGE_KEY_ACTIVE_CHAR_ID = 'eve_active_character_id';
const LEGACY_STORAGE_KEY = 'eve_char_session';

const memoryStore = new Map<string, string>();

const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {}
    return memoryStore.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
        return;
      }
    } catch {}
    memoryStore.set(key, value);
  },
  removeItem(key: string): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
    } catch {}
    memoryStore.delete(key);
  },
};

export class AuthService {
  private static listeners = new Set<(session: EveCharacterSession | null) => void>();
  private static refreshLockMap = new Map<number, Promise<EveCharacterSession>>();

  /**
   * Deterministically computes the formal SessionAuthStatus for any character session.
   */
  static computeSessionStatus(session: Partial<EveCharacterSession>): SessionAuthStatus {
    if (!session || !session.character_id || !session.access_token) {
      return 'SESSION_CORRUPTED';
    }
    if (this.refreshLockMap.has(session.character_id)) {
      return 'SESSION_REFRESHING';
    }
    if (
      session.auth_error &&
      (session.auth_error.includes('401') ||
        session.auth_error.toLowerCase().includes('revoked') ||
        session.auth_error.toLowerCase().includes('révoqué') ||
        session.auth_error.toLowerCase().includes('invalid_grant'))
    ) {
      return 'SESSION_REVOKED';
    }
    if (session.is_token_expired) {
      return 'SESSION_EXPIRED';
    }
    if (!session.expires_at) {
      return session.refresh_token ? 'SESSION_EXPIRING' : 'SESSION_VALID';
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
   * Normalizes an existing session to v2 standards.
   */
  static normalizeSession(session: any): EveCharacterSession {
    const status = this.computeSessionStatus(session);
    return {
      character_id: Number(session.character_id),
      character_name: session.character_name || `Character #${session.character_id}`,
      portrait_url: session.portrait_url || `https://images.evetech.net/characters/${session.character_id}/portrait?size=128`,
      access_token: session.access_token || '',
      refresh_token: session.refresh_token || '',
      expires_at: session.expires_at || (Date.now() + 1200 * 1000),
      last_sync: session.last_sync || new Date().toISOString(),
      is_active: Boolean(session.is_active),
      is_token_expired: session.is_token_expired ?? (status === 'SESSION_EXPIRED' || status === 'SESSION_REVOKED'),
      auth_error: session.auth_error,
      session_version: 2,
      auth_status: status,
      last_validated_at: session.last_validated_at || session.last_sync || new Date().toISOString(),
    };
  }

  /**
   * Subscribe to character session updates (e.g. token refreshed, logged out, switched).
   */
  static subscribe(callback: (session: EveCharacterSession | null) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private static notifyListeners(session: EveCharacterSession | null) {
    this.listeners.forEach((cb) => {
      try {
        cb(session);
      } catch (err) {
        console.warn('AuthService listener notification error:', err);
      }
    });
  }

  /**
   * Retrieves all linked EVE characters from persistent storage.
   * Migrates legacy single-character format and v1 sessions seamlessly.
   */
  static getLinkedCharacters(): EveCharacterSession[] {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_CHARACTERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => this.normalizeSession(item));
        }
      }

      // Legacy fallback
      const legacyRaw = safeStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacyChar = JSON.parse(legacyRaw) as EveCharacterSession;
        if (legacyChar && legacyChar.character_id) {
          const list = [this.normalizeSession({ ...legacyChar, is_active: true })];
          safeStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(list));
          safeStorage.setItem(STORAGE_KEY_ACTIVE_CHAR_ID, String(legacyChar.character_id));
          return list;
        }
      }
    } catch (e) {
      console.warn('Failed to parse linked characters from storage:', e);
    }
    return [];
  }

  /**
   * Returns the currently active character session or null.
   */
  static getActiveCharacter(): EveCharacterSession | null {
    const list = this.getLinkedCharacters();
    if (list.length === 0) return null;

    const activeIdStr = safeStorage.getItem(STORAGE_KEY_ACTIVE_CHAR_ID);
    if (activeIdStr) {
      const activeId = Number(activeIdStr);
      const found = list.find((c) => c.character_id === activeId);
      if (found) return found;
    }

    // Default to the first character marked is_active, or simply the first one
    return list.find((c) => c.is_active) || list[0];
  }

  /**
   * Saves or updates a character session in the persistent registry.
   * If it is the first character or marked active, makes it active.
   */
  static saveCharacter(session: EveCharacterSession, makeActive: boolean = true): EveCharacterSession[] {
    const list = this.getLinkedCharacters();
    const existingIndex = list.findIndex((c) => c.character_id === session.character_id);

    const normalized = this.normalizeSession({
      ...session,
      is_active: makeActive,
      last_sync: new Date().toISOString(),
    });

    let updatedList: EveCharacterSession[];

    if (existingIndex >= 0) {
      // Merge with existing session to preserve any missing fields
      updatedList = list.map((c, idx) =>
        idx === existingIndex
          ? { ...c, ...normalized, refresh_token: session.refresh_token || c.refresh_token }
          : makeActive ? { ...c, is_active: false } : c
      );
    } else {
      updatedList = makeActive
        ? [...list.map((c) => ({ ...c, is_active: false })), normalized]
        : [...list, normalized];
    }

    safeStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(updatedList));
    if (makeActive) {
      safeStorage.setItem(STORAGE_KEY_ACTIVE_CHAR_ID, String(session.character_id));
      safeStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(normalized));
      this.notifyListeners(normalized);
    }

    return updatedList;
  }

  /**
   * Sets a specific character as active.
   */
  static setActiveCharacter(characterId: number): EveCharacterSession | null {
    const list = this.getLinkedCharacters();
    const target = list.find((c) => c.character_id === characterId);
    if (!target) return null;

    const updatedList = list.map((c) => ({
      ...c,
      is_active: c.character_id === characterId,
    }));

    safeStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(updatedList));
    safeStorage.setItem(STORAGE_KEY_ACTIVE_CHAR_ID, String(characterId));
    const activeObj = { ...target, is_active: true };
    safeStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(activeObj));
    this.notifyListeners(activeObj);

    return activeObj;
  }

  /**
   * Removes a character from the registry.
   */
  static removeCharacter(characterId: number): EveCharacterSession[] {
    const list = this.getLinkedCharacters();
    const updatedList = list.filter((c) => c.character_id !== characterId);

    safeStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(updatedList));

    const activeIdStr = safeStorage.getItem(STORAGE_KEY_ACTIVE_CHAR_ID);
    if (activeIdStr === String(characterId)) {
      if (updatedList.length > 0) {
        this.setActiveCharacter(updatedList[0].character_id);
      } else {
        safeStorage.removeItem(STORAGE_KEY_ACTIVE_CHAR_ID);
        safeStorage.removeItem(LEGACY_STORAGE_KEY);
        this.notifyListeners(null);
      }
    }

    return updatedList;
  }

  /**
   * Checks if an access token is expired or close to expiration (< 2 minutes).
   */
  static isTokenExpiredOrExpiringSoon(session: EveCharacterSession): boolean {
    if (!session.expires_at) {
      // If we have a refresh_token but no expiration time, we should refresh proactively
      return Boolean(session.refresh_token);
    }
    const now = Date.now();
    // Consider expiring if less than 2 minutes remaining or already in the past
    return now >= session.expires_at - (2 * 60 * 1000);
  }

  /**
   * Mark a character's token as expired when ESI returns 401 or token is stale.
   */
  static markTokenExpired(characterId: number, errorMsg: string = 'Session expirée (401)'): EveCharacterSession | null {
    const list = this.getLinkedCharacters();
    const target = list.find((c) => c.character_id === characterId);
    if (!target) return null;

    const isRevoked =
      errorMsg.includes('401') ||
      errorMsg.toLowerCase().includes('revoked') ||
      errorMsg.toLowerCase().includes('invalid_grant');

    const updatedSession: EveCharacterSession = {
      ...target,
      is_token_expired: true,
      auth_error: errorMsg,
      auth_status: isRevoked ? 'SESSION_REVOKED' : 'SESSION_EXPIRED',
      last_sync: new Date().toISOString(),
    };

    this.saveCharacter(updatedSession, target.is_active ?? false);
    return updatedSession;
  }

  /**
   * Marks a character session as explicitly revoked (e.g. invalid_grant or permission revoked in EVE account management).
   */
  static markTokenRevoked(characterId: number, reason: string = 'Jeton SSO révoqué ou invalide'): EveCharacterSession | null {
    return this.markTokenExpired(characterId, reason);
  }

  /**
   * Records a successful authenticated API validation timestamp.
   */
  static recordSuccessfulValidation(characterId: number): void {
    const list = this.getLinkedCharacters();
    const target = list.find((c) => c.character_id === characterId);
    if (!target) return;

    const updatedSession: EveCharacterSession = {
      ...target,
      is_token_expired: false,
      auth_error: undefined,
      auth_status: 'SESSION_VALID',
      last_validated_at: new Date().toISOString(),
    };
    this.saveCharacter(updatedSession, target.is_active ?? false);
  }

  /**
   * Refreshes the access token of a character session via /api/auth/refresh
   */
  static async refreshCharacterToken(session: EveCharacterSession): Promise<EveCharacterSession> {
    if (!session.refresh_token) {
      return this.markTokenExpired(session.character_id, 'Aucun jeton de renouvellement (refresh token) disponible') || session;
    }

    if (this.refreshLockMap.has(session.character_id)) {
      return this.refreshLockMap.get(session.character_id)!;
    }

    const refreshPromise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn('Failed to refresh token from CCP SSO:', errText);
          return this.markTokenExpired(session.character_id, 'Échec du renouvellement du jeton SSO auprès de CCP') || session;
        }

        const tokenData = await response.json();
        const expiresInSec = tokenData.expires_in || 1200; // EVE SSO standard is 20 min (1200s)
        const expiresAt = Date.now() + (expiresInSec * 1000);

        const updatedSession: EveCharacterSession = {
          ...session,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || session.refresh_token,
          expires_at: expiresAt,
          is_token_expired: false,
          auth_error: undefined,
          auth_status: 'SESSION_VALID',
          session_version: 2,
          last_validated_at: new Date().toISOString(),
          last_sync: new Date().toISOString(),
        };

        // Save to persistence
        this.saveCharacter(updatedSession, session.is_active ?? false);
        return updatedSession;
      } catch (err) {
        console.warn('Token refresh network error:', err);
        return session;
      } finally {
        this.refreshLockMap.delete(session.character_id);
      }
    })();

    this.refreshLockMap.set(session.character_id, refreshPromise);
    return refreshPromise;
  }

  /**
   * Ensures the character has a valid, unexpired token, refreshing if necessary.
   */
  static async ensureValidToken(session: EveCharacterSession): Promise<EveCharacterSession> {
    if (this.isTokenExpiredOrExpiringSoon(session)) {
      return await this.refreshCharacterToken(session);
    }
    return session;
  }

  /**
   * Gets a fresh, valid token for a character by ID, auto-refreshing if expired or needed.
   */
  static async getFreshToken(characterId: number): Promise<string | null> {
    const list = this.getLinkedCharacters();
    const char = list.find((c) => c.character_id === characterId);
    if (!char) return null;

    if (this.isTokenExpiredOrExpiringSoon(char)) {
      const refreshed = await this.refreshCharacterToken(char);
      if (!refreshed.is_token_expired && refreshed.access_token) {
        return refreshed.access_token;
      }
      return null;
    }

    return char.access_token;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  static async exchangeCodeForSession(code: string, redirectUri?: string, state?: string): Promise<EveCharacterSession> {
    const payloadBody: Record<string, string> = {
      code: code.trim(),
      redirect_uri: redirectUri || 'http://localhost:8000/callback',
    };
    if (state) {
      payloadBody.state = state;
    }

    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Échec de l échange de code' }));
      throw new Error(err.message || err.error || err.details || 'Échec de l échange de code SSO');
    }

    const data = await response.json();
    const expiresInSec = data.expires_in || 1200;
    const expiresAt = Date.now() + (expiresInSec * 1000);

    const session: EveCharacterSession = {
      character_id: data.character_id,
      character_name: data.character_name || `Character #${data.character_id}`,
      portrait_url: data.portrait_url || `https://images.evetech.net/characters/${data.character_id}/portrait?size=128`,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      last_sync: new Date().toISOString(),
      is_active: true,
      session_version: 2,
      auth_status: 'SESSION_VALID',
      last_validated_at: new Date().toISOString(),
    };

    this.saveCharacter(session, true);
    return session;
  }
}
