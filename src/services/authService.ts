import { EveCharacterSession } from '../types';

const STORAGE_KEY_CHARACTERS = 'eve_linked_characters';
const STORAGE_KEY_ACTIVE_CHAR_ID = 'eve_active_character_id';
const LEGACY_STORAGE_KEY = 'eve_char_session';

export class AuthService {
  private static listeners = new Set<(session: EveCharacterSession | null) => void>();

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
   * Migrates legacy single-character format seamlessly if present.
   */
  static getLinkedCharacters(): EveCharacterSession[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CHARACTERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }

      // Legacy fallback
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacyChar = JSON.parse(legacyRaw) as EveCharacterSession;
        if (legacyChar && legacyChar.character_id) {
          const list = [{ ...legacyChar, is_active: true }];
          localStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(list));
          localStorage.setItem(STORAGE_KEY_ACTIVE_CHAR_ID, String(legacyChar.character_id));
          return list;
        }
      }
    } catch (e) {
      console.warn('Failed to parse linked characters from localStorage:', e);
    }
    return [];
  }

  /**
   * Returns the currently active character session or null.
   */
  static getActiveCharacter(): EveCharacterSession | null {
    const list = this.getLinkedCharacters();
    if (list.length === 0) return null;

    const activeIdStr = localStorage.getItem(STORAGE_KEY_ACTIVE_CHAR_ID);
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

    const updatedSession: EveCharacterSession = {
      ...session,
      is_active: makeActive,
      last_sync: new Date().toISOString(),
    };

    let updatedList: EveCharacterSession[];

    if (existingIndex >= 0) {
      // Merge with existing session to preserve any missing fields
      updatedList = list.map((c, idx) =>
        idx === existingIndex
          ? { ...c, ...updatedSession, refresh_token: session.refresh_token || c.refresh_token }
          : makeActive ? { ...c, is_active: false } : c
      );
    } else {
      updatedList = makeActive
        ? [...list.map((c) => ({ ...c, is_active: false })), updatedSession]
        : [...list, updatedSession];
    }

    localStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(updatedList));
    if (makeActive) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_CHAR_ID, String(session.character_id));
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(updatedSession));
      this.notifyListeners(updatedSession);
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

    localStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(updatedList));
    localStorage.setItem(STORAGE_KEY_ACTIVE_CHAR_ID, String(characterId));
    const activeObj = { ...target, is_active: true };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(activeObj));
    this.notifyListeners(activeObj);

    return activeObj;
  }

  /**
   * Removes a character from the registry.
   */
  static removeCharacter(characterId: number): EveCharacterSession[] {
    const list = this.getLinkedCharacters();
    const updatedList = list.filter((c) => c.character_id !== characterId);

    localStorage.setItem(STORAGE_KEY_CHARACTERS, JSON.stringify(updatedList));

    const activeIdStr = localStorage.getItem(STORAGE_KEY_ACTIVE_CHAR_ID);
    if (activeIdStr === String(characterId)) {
      if (updatedList.length > 0) {
        this.setActiveCharacter(updatedList[0].character_id);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_CHAR_ID);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
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
   * Mark a character's token as expired when ESI returns 401
   */
  static markTokenExpired(characterId: number, errorMsg: string = 'Session expirée (401)'): EveCharacterSession | null {
    const list = this.getLinkedCharacters();
    const target = list.find((c) => c.character_id === characterId);
    if (!target) return null;

    const updatedSession: EveCharacterSession = {
      ...target,
      is_token_expired: true,
      auth_error: errorMsg,
      last_sync: new Date().toISOString(),
    };

    this.saveCharacter(updatedSession, target.is_active ?? false);
    return updatedSession;
  }

  /**
   * Refreshes the access token of a character session via /api/auth/refresh
   */
  static async refreshCharacterToken(session: EveCharacterSession): Promise<EveCharacterSession> {
    if (!session.refresh_token) {
      return this.markTokenExpired(session.character_id, 'Aucun jeton de renouvellement (refresh token) disponible') || session;
    }

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
        last_sync: new Date().toISOString(),
      };

      // Save to persistence
      this.saveCharacter(updatedSession, session.is_active ?? false);
      return updatedSession;
    } catch (err) {
      console.warn('Token refresh network error:', err);
      return session;
    }
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
  static async exchangeCodeForSession(code: string, redirectUri?: string): Promise<EveCharacterSession> {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim(),
        redirect_uri: redirectUri || 'http://localhost:8000/callback',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Échec de l échange de code' }));
      throw new Error(err.error || err.details || 'Échec de l échange de code SSO');
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
    };

    this.saveCharacter(session, true);
    return session;
  }
}
