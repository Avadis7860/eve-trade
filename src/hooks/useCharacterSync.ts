import { useState, useEffect, useCallback, useRef } from 'react';
import { EveCharacterSession, EveCharacterOrder, MarketHub } from '../types';
import { EsiService } from '../services/esi';
import { AuthService } from '../services/authService';
import { MarketDataStore } from '../services/marketDataStore';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { CharacterRepository } from '../domain/character/CharacterRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { useAuth } from '../context/AuthProvider';
import { useTradingConfig } from '../context/TradingConfigProvider';
import { TreasuryEngine } from '../engine/treasury';
import { mergeCharacterAndCorporationOrders } from '../engine/corporationOrder';

export function useCharacterSync(
  orderBooks: Record<number, any[]>,
  hubs: MarketHub[],
  onLoginSuccess?: () => void
) {
  const { characterSession, updateSession, removeCharacter } = useAuth();
  const { setConfig } = useTradingConfig();
  const [characterOrders, setCharacterOrders] = useState<EveCharacterOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(false);
  const ssoPopupRef = useRef<Window | null>(null);

  const loadCharacterData = useCallback(
    async (
      token: string,
      charId: number,
      charName: string,
      existingSession?: EveCharacterSession,
      makeActive: boolean = true
    ) => {
      const activeChar = AuthService.getActiveCharacter();
      const isTargetActive = makeActive || (activeChar ? activeChar.character_id === charId : true);

      if (isTargetActive) {
        setIsLoadingOrders(true);
      }

      try {
        const balance = await EsiService.fetchCharacterWallet(charId, token);
        const skills = await EsiService.fetchCharacterSkills(charId, token);
        const ordersResult = await EsiService.fetchCharacterOrders(charId, token);
        const rawOrders = EsiService.requireUsableCollection(ordersResult, 'character orders');

        let corporationOrders: EveCharacterOrder[] = [];
        let corporationInfo: Awaited<ReturnType<typeof EsiService.fetchCorporationInfo>> | undefined;

        try {
          corporationInfo = await EsiService.fetchCorporationInfo(charId);
          if (corporationInfo.ok && corporationInfo.data?.corporation_id) {
            const corporationOrdersResult = await EsiService.fetchCharacterCorporationOrders(
              charId,
              token,
              corporationInfo.data.corporation_id,
              corporationInfo.data.corporation_name,
            );

            if (
              corporationOrdersResult.state === 'AVAILABLE' ||
              corporationOrdersResult.state === 'EMPTY'
            ) {
              corporationOrders = corporationOrdersResult.data;
            } else {
              console.warn(
                `[useCharacterSync] Corporation orders unavailable for #${charId}: ${corporationOrdersResult.state}`,
              );
            }
          }
        } catch (corporationError) {
          console.warn(
            `[useCharacterSync] Corporation order sync notice for #${charId}:`,
            corporationError,
          );
        }

        const effectiveOrders = mergeCharacterAndCorporationOrders(
          rawOrders,
          corporationOrders,
        );

        const orderTypeIds = Array.from(new Set(effectiveOrders.map((o) => o.type_id)));
        if (orderTypeIds.length > 0) {
          MarketDataStore.syncCharacterOrdersMarketData(orderTypeIds, hubs).catch((err) => {
            console.warn('[useCharacterSync] syncCharacterOrdersMarketData failed:', err);
          });
        }

        const enrichedOrders: EveCharacterOrder[] = [];
        for (const o of effectiveOrders) {
          const typeName = CatalogRepository.getInstance().getTypeName(o.type_id);
          const loc = UniverseRepository.getInstance().resolveLocationSync(o.location_id);
          const locName = loc.name;

          const regOrders = MarketDataStore.getOrders(o.type_id, o.region_id) || orderBooks[o.region_id] || [];
          const sameTypeOrders = regOrders.filter((ro: any) => ro.type_id === o.type_id);
          let isOutbid = false;
          let diffPct = 0;
          let highestBuy = 0;
          let lowestSell = 0;

          if (sameTypeOrders.length > 0) {
            const buyOrders = sameTypeOrders.filter((ro: any) => ro.is_buy_order);
            const sellOrders = sameTypeOrders.filter((ro: any) => !ro.is_buy_order);

            if (buyOrders.length > 0) highestBuy = Math.max(...buyOrders.map((b: any) => b.price));
            if (sellOrders.length > 0) lowestSell = Math.min(...sellOrders.map((s: any) => s.price));

            if (o.is_buy_order) {
              if (highestBuy > o.price) {
                isOutbid = true;
                diffPct = ((highestBuy - o.price) / o.price) * 100;
              }
            } else {
              if (lowestSell > 0 && lowestSell < o.price) {
                isOutbid = true;
                diffPct = ((o.price - lowestSell) / lowestSell) * 100;
              }
            }
          }

          const ownership = o.ownership ?? (
            o.is_corporation === true
              ? undefined
              : {
                  principal_character_id: charId,
                  owner_type: 'character' as const,
                  owner_id: charId,
                  owner_name: charName,
                  observed_by_character_ids: [charId],
                }
          );

          enrichedOrders.push({
            ...o,
            ...(ownership
              ? { ownership }
              : {
                  // A corporation order must never be relabeled as personally owned
                  // by the character whose credential observed it.
                  character_id: undefined,
                  character_name: undefined,
                }),
            ...(ownership?.owner_type === 'character'
              ? { character_id: charId, character_name: charName }
              : {}),
            type_name: typeName,
            location_name: locName,
            market_competition: {
              is_outbid: isOutbid,
              price_diff_percent: diffPct,
              highest_buy: highestBuy,
              lowest_sell: lowestSell,
            },
          });
        }

        if (isTargetActive) {
          setCharacterOrders(enrichedOrders);
        }

        CharacterRepository.getInstance().saveSnapshot(charId, {
          wallet_balance: balance,
          skills: skills || { accounting: 5, broker_relations: 5 },
          active_orders: enrichedOrders,
          source: 'server_proxy',
        });

        const accountingLvl = skills ? skills.accounting : 5;
        const brokerRelLvl = skills ? skills.broker_relations : 5;
        const calculatedBrokerFee = Math.max(0.01, 0.03 - brokerRelLvl * 0.003);
        const calculatedSalesTax = Math.max(0.036, 0.08 * (1 - accountingLvl * 0.11));

        const sessionObj: EveCharacterSession = {
          ...(existingSession || {}),
          character_id: charId,
          character_name: charName,
          ...(corporationInfo?.ok && corporationInfo.data?.corporation_id
            ? {
                corporation_id: corporationInfo.data.corporation_id,
                corporation_name: corporationInfo.data.corporation_name,
                ...(corporationInfo.data.ticker
                  ? { corporation_ticker: corporationInfo.data.ticker }
                  : {}),
              }
            : {}),
          access_token: token,
          portrait_url: `https://images.evetech.net/characters/${charId}/portrait?size=128`,
          wallet_balance: balance !== null ? balance : existingSession?.wallet_balance,
          accounting_skill: accountingLvl,
          broker_relations_skill: brokerRelLvl,
          last_sync: new Date().toISOString(),
          is_active: isTargetActive,
          session_version: 2,
          auth_status: 'SESSION_VALID',
        };

        if (isTargetActive) {
          updateSession(sessionObj);
          setConfig((prev) => ({
            ...prev,
            // Character wallet synchronization must not become an implicit
            // corporation treasury source.
            available_capital:
              prev.treasury_source_mode === 'corporation'
                ? prev.available_capital
                : TreasuryEngine.normalizeWalletTradingCapital(balance) ?? prev.available_capital,
            accounting_level: accountingLvl,
            broker_relations_level: brokerRelLvl,
            broker_fee: calculatedBrokerFee,
            sales_tax: calculatedSalesTax,
          }));

        } else {
          AuthService.saveCharacter(sessionObj, false);
        }
      } catch (err) {
        console.error('Error loading character data:', err);
      } finally {
        if (isTargetActive) {
          setIsLoadingOrders(false);
        }
      }
    },
    [
      orderBooks,
      hubs,
      updateSession,
      setConfig,
    ]
  );

  // Handle SSO redirect in main window
  useEffect(() => {
    const handleUrlCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code') || urlParams.get('eve_sso_code');
      const state = urlParams.get('state');
      if (code) {
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
          const session = await AuthService.exchangeCodeForSession(code, undefined, state || undefined);
          await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
          if (onLoginSuccess) onLoginSuccess();
        } catch (err) {
          console.error('Failed to exchange code from URL:', err);
        }
      }
    };
    handleUrlCallback();
  }, [loadCharacterData, onLoginSuccess]);

  // Handle postMessage from OAuth popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!ssoPopupRef.current || event.source !== ssoPopupRef.current) return;
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'OAUTH_AUTH_SUCCESS') {
        ssoPopupRef.current = null;
        if (event.data?.session) {
          const s = event.data.session as EveCharacterSession;
          updateSession(s);
          await loadCharacterData(s.access_token, s.character_id, s.character_name, s);
          if (onLoginSuccess) onLoginSuccess();
        } else if (event.data?.token) {
          const { token, character_id, character_name, refresh_token, expires_in } = event.data;
          const s: EveCharacterSession = {
            character_id,
            character_name,
            access_token: token,
            refresh_token,
            expires_at: expires_in ? Date.now() + expires_in * 1000 : 0,
            portrait_url: `https://images.evetech.net/characters/${character_id}/portrait?size=128`,
            last_sync: new Date().toISOString(),
            is_active: true,
            session_version: 2,
            auth_status: 'SESSION_VALID',
            last_validated_at: new Date().toISOString(),
          };
          updateSession(s);
          await loadCharacterData(token, character_id, character_name, s);
          if (onLoginSuccess) onLoginSuccess();
        } else if (event.data?.code) {
          const session = await AuthService.exchangeCodeForSession(
            event.data.code,
            undefined,
            event.data.state || undefined
          );
          await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
          if (onLoginSuccess) onLoginSuccess();
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        console.error('SSO OAuth Error received from popup:', event.data.error, event.data.errorDescription);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadCharacterData, onLoginSuccess, updateSession]);

  // Check and refresh all linked character sessions periodically
  useEffect(() => {
    const checkAndRefresh = async () => {
      const activeChar = AuthService.getActiveCharacter();
      if (activeChar) {
        const snap = CharacterRepository.getInstance().getSnapshot(activeChar.character_id);
        if (snap && snap.active_orders.length > 0) {
          setCharacterOrders(snap.active_orders);
        }
      }

      const linkedChars = AuthService.getLinkedCharacters();
      for (const char of linkedChars) {
        try {
          const validSession = await AuthService.ensureValidToken(char);
          if (!validSession.is_token_expired && validSession.access_token) {
            const isActive = activeChar ? validSession.character_id === activeChar.character_id : false;
            await loadCharacterData(
              validSession.access_token,
              validSession.character_id,
              validSession.character_name,
              validSession,
              isActive
            );
          }
        } catch (e) {
          console.warn(`Character token sync notice for ${char.character_name}:`, e);
        }
      }
    };

    checkAndRefresh();

    const interval = setInterval(() => {
      const linkedChars = AuthService.getLinkedCharacters();
      for (const char of linkedChars) {
        if (!char.is_token_expired) {
          AuthService.ensureValidToken(char).catch(() => {});
        }
      }
    }, 90000);

    return () => clearInterval(interval);
  }, [loadCharacterData]);

  const handleConnectSSO = async (customRedirectUri?: string) => {
    try {
      const urlParam = customRedirectUri ? `?redirect_uri=${encodeURIComponent(customRedirectUri)}` : '';
      const response = await fetch(`/api/auth/url${urlParam}`);
      if (!response.ok) {
        throw new Error('Failed to generate SSO authorization URL');
      }
      const data = await response.json();
      const authUrl = data.url;

      const width = 600;
      const height = 750;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        authUrl,
        'eve_sso_login',
        `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
      );

      if (!popup) {
        ssoPopupRef.current = null;
        window.location.href = authUrl;
      } else {
        ssoPopupRef.current = popup;
      }
    } catch (err) {
      alert(`Erreur d initialisation SSO : ${err}`);
    }
  };

  const handleExchangeCode = async (code: string, redirectUri?: string, state?: string) => {
    const session = await AuthService.exchangeCodeForSession(code, redirectUri, state);
    await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
  };

  const handleDirectTokenInput = async (token: string, characterId: number, characterName: string) => {
    const claims = AuthService.parseJwtClaims(token.trim());
    const realExpiresAt = claims?.exp ? claims.exp * 1000 : 0;

    const session: EveCharacterSession = {
      character_id: characterId || (claims?.sub ? Number(claims.sub.split(':').pop()) || 0 : 0),
      character_name: characterName || claims?.name || `Character #${characterId}`,
      access_token: token.trim(),
      expires_at: realExpiresAt,
      portrait_url: characterId ? `https://images.evetech.net/characters/${characterId}/portrait?size=128` : '',
      last_sync: new Date().toISOString(),
      is_active: true,
      session_version: 2,
      auth_status: realExpiresAt && realExpiresAt > Date.now() ? 'SESSION_VALID' : 'SESSION_EXPIRED',
      last_validated_at: new Date().toISOString(),
    };
    updateSession(session);
    await loadCharacterData(token, session.character_id, session.character_name, session);
  };

  const handleLogoutCharacter = () => {
    if (characterSession) {
      removeCharacter(characterSession.character_id);
    }
    setCharacterOrders([]);
  };

  return {
    characterOrders,
    isLoadingOrders,
    loadCharacterData,
    handleConnectSSO,
    handleExchangeCode,
    handleDirectTokenInput,
    handleLogoutCharacter,
  };
}
