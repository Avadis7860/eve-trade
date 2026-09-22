import { EveCharacterSession, SessionAuthStatus, FleetRole, TradingFleetOverview } from '../types';
import { CharacterRepository } from '../domain/character/CharacterRepository';

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
   * Zero data invention: missing expiration triggers expiration/refresh, never forged.
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
   * Safely parses JWT claims without relying on any external library.
   * Never fabricates exp if absent.
   */
  static parseJwtClaims(token: string): { exp?: number; sub?: string; name?: string; [key: string]: any } | null {
    try {
      if (!token || typeof token !== 'string') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = typeof atob === 'function'
        ? decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
        : Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  /**
   * Normalizes an existing session to strict standards without inventing expiration timestamps.
   */
  static normalizeSession(session: any): EveCharacterSession {
    const rawExpiresAt = Number(session.expires_at) || 0;
    const status = this.computeSessionStatus({ ...session, expires_at: rawExpiresAt });
    const isExpired = session.is_token_expired ?? (status === 'SESSION_EXPIRED' || status === 'SESSION_REVOKED' || rawExpiresAt <= 0);

    return {
      character_id: Number(session.character_id),
      character_name: session.character_name || `Character #${session.character_id}`,
      portrait_url: session.portrait_url || `https://images.evetech.net/characters/${session.character_id}/portrait?size=128`,
      access_token: session.access_token || '',
      refresh_token: session.refresh_token || '',
      expires_at: rawExpiresAt,
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
   * Migrates seamlessly to CharacterRepository V3.
   */
  static getLinkedCharacters(): EveCharacterSession[] {
    return CharacterRepository.getInstance().getLinkedCharacters();
  }

  /**
   * Returns the currently active character session or null.
   */
  static getActiveCharacter(): EveCharacterSession | null {
    return CharacterRepository.getInstance().getActiveCharacter();
  }

  /**
   * Saves or updates a character session in the persistent registry.
   */
  static saveCharacter(session: EveCharacterSession, makeActive: boolean = true): EveCharacterSession[] {
    const list = CharacterRepository.getInstance().saveCharacter(session, makeActive);
    const active = CharacterRepository.getInstance().getActiveCharacter();
    this.notifyListeners(active);
    return list;
  }

  /**
   * Sets a specific character as active.
   */
  static setActiveCharacter(characterId: number): EveCharacterSession | null {
    const active = CharacterRepository.getInstance().setActiveCharacter(characterId);
    this.notifyListeners(active);
    return active;
  }

  /**
   * Removes a character from the registry.
   */
  static removeCharacter(characterId: number): EveCharacterSession[] {
    const list = CharacterRepository.getInstance().removeCharacter(characterId);
    const active = CharacterRepository.getInstance().getActiveCharacter();
    this.notifyListeners(active);
    return list;
  }

  /**
   * Updates fleet role and assigned hub for an alt.
   */
  static updateCharacterFleetSettings(
    characterId: number,
    settings: {
      fleet_role?: FleetRole;
      assigned_hub_id?: string;
      assigned_hub_name?: string;
      assigned_station_id?: number;
      ship_cargo_capacity_m3?: number;
    }
  ): EveCharacterSession[] {
    const list = CharacterRepository.getInstance().updateCharacterFleetSettings(characterId, settings);
    const active = CharacterRepository.getInstance().getActiveCharacter();
    this.notifyListeners(active);
    return list;
  }

  /**
   * Retrieves the consolidated trading fleet overview.
   */
  static getFleetOverview(): TradingFleetOverview {
    return CharacterRepository.getInstance().getFleetOverview();
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
   * Gets the preferred redirect URI for EVE SSO (defaults to localhost:8000/callback or app callback).
   */
  static getPreferredRedirectUri(): string {
    const stored = safeStorage.getItem('eve_sso_preferred_redirect_uri');
    if (stored && stored.trim()) return stored.trim();
    return 'http://localhost:8000/callback';
  }

  /**
   * Sets the user's preferred redirect URI across the application.
   */
  static setPreferredRedirectUri(uri: string): void {
    if (uri && uri.trim()) {
      safeStorage.setItem('eve_sso_preferred_redirect_uri', uri.trim());
    }
  }

  /**
   * Suggested standard redirect URIs for EVE SSO based on environment.
   */
  static getSuggestedRedirectUris(): { id: string; label: string; uri: string }[] {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return [
      { id: 'localhost8000', label: 'Localhost (8000)', uri: 'http://localhost:8000/callback' },
      { id: 'cloudrun', label: 'App Host / Preview', uri: `${currentOrigin}/auth/callback` },
      { id: 'localhost3000', label: 'Localhost (3000)', uri: 'http://localhost:3000/auth/callback' },
    ];
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   */
  static async exchangeCodeForSession(code: string, redirectUri?: string, state?: string): Promise<EveCharacterSession> {
    let cleanCode = code.trim();
    let effectiveRedirectUri = redirectUri || this.getPreferredRedirectUri();
    let effectiveState = state;

    // Auto-parse full pasted URLs
    if (cleanCode.includes('code=') || cleanCode.startsWith('http')) {
      try {
        const urlObj = new URL(cleanCode);
        const extractedCode = urlObj.searchParams.get('code');
        const extractedState = urlObj.searchParams.get('state');
        if (extractedCode) cleanCode = extractedCode;
        if (extractedState && !effectiveState) effectiveState = extractedState;
        if (!redirectUri) {
          effectiveRedirectUri = `${urlObj.origin}${urlObj.pathname}`;
        }
      } catch {
        const match = cleanCode.match(/code=([^&]+)/);
        if (match) cleanCode = decodeURIComponent(match[1]);
        const stateMatch = cleanCode.match(/state=([^&]+)/);
        if (stateMatch && !effectiveState) effectiveState = decodeURIComponent(stateMatch[1]);
      }
    }

    const payloadBody: Record<string, string> = {
      code: cleanCode,
      redirect_uri: effectiveRedirectUri,
    };
    if (effectiveState) {
      payloadBody.state = effectiveState;
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
