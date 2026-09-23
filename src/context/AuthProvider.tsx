import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { EveCharacterSession } from '../types';
import { AuthService } from '../services/authService';

interface AuthContextType {
  characterSession: EveCharacterSession | null;
  linkedCharacters: EveCharacterSession[];
  activeCharacterId: number | null;
  setActiveCharacter: (characterId: number) => void;
  removeCharacter: (characterId: number) => void;
  updateSession: (session: EveCharacterSession) => void;
  refreshActiveSession: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [characterSession, setCharacterSession] = useState<EveCharacterSession | null>(() =>
    AuthService.getActiveCharacter()
  );
  const [linkedCharacters, setLinkedCharacters] = useState<EveCharacterSession[]>(() =>
    AuthService.getLinkedCharacters()
  );

  const refreshState = useCallback(() => {
    setCharacterSession(AuthService.getActiveCharacter());
    setLinkedCharacters(AuthService.getLinkedCharacters());
  }, []);

  useEffect(() => {
    const unsub = AuthService.subscribe(() => {
      refreshState();
    });
    return () => unsub();
  }, [refreshState]);

  // Authentication bootstrap is authoritative at provider mount. This keeps
  // expired persisted sessions from waiting for a downstream data-sync effect
  // before attempting their refresh.
  useEffect(() => {
    let cancelled = false;
    const refreshExpiredActiveSession = async () => {
      const active = AuthService.getActiveCharacter();
      if (!active) return;

      try {
        const refreshed = await AuthService.ensureValidToken(active);
        if (!cancelled) {
          refreshState();
          if (refreshed.access_token && !refreshed.is_token_expired) {
            refreshState();
          }
        }
      } catch (error) {
        if (!cancelled) {
          refreshState();
          console.warn('[AuthProvider] session bootstrap refresh failed:', error);
        }
      }
    };

    void refreshExpiredActiveSession();

    return () => {
      cancelled = true;
    };
  }, [refreshState]);

  const setActiveCharacter = useCallback((characterId: number) => {
    AuthService.setActiveCharacter(characterId);
    refreshState();
  }, [refreshState]);

  const removeCharacter = useCallback((characterId: number) => {
    AuthService.removeCharacter(characterId);
    refreshState();
  }, [refreshState]);

  const updateSession = useCallback((session: EveCharacterSession) => {
    AuthService.saveCharacter(session, true);
    refreshState();
  }, [refreshState]);

  const refreshActiveSession = useCallback(async (): Promise<string | null> => {
    if (!characterSession) return null;
    try {
      const freshToken = await AuthService.getFreshToken(characterSession.character_id);
      refreshState();
      return freshToken;
    } catch {
      return null;
    }
  }, [characterSession, refreshState]);

  const value = {
    characterSession,
    linkedCharacters,
    activeCharacterId: characterSession?.character_id ?? null,
    setActiveCharacter,
    removeCharacter,
    updateSession,
    refreshActiveSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
