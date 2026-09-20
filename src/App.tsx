import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  EVE_TYPES_CATALOG,
  MAJOR_MARKET_HUBS,
} from './data/universe';
import {
  EveTypeDetail,
  MarketHub,
  FinancialConfig,
  TradeStrategy,
  InterRegionalOpportunity,
  RawMarketOrder,
  HistoricalStats,
  RecordedTradeExecution,
  EveCharacterSession,
  EveCharacterOrder,
  UniverseWideOpportunity,
  GlobalSyncProgress,
} from './types';
import { InterRegionalScanner } from './services/scanner';
import { PortfolioOptimizer } from './engine/portfolio';
import { EsiService } from './services/esi';
import { AuthService } from './services/authService';
import { GlobalMarketSyncService } from './services/globalMarketSync';
import { MarketDataStore } from './services/marketDataStore';
import { CatalogRepository } from './domain/catalog/CatalogRepository';
import { CharacterRepository } from './domain/character/CharacterRepository';
import { MarketTree } from './components/MarketTree';
import { HeaderNav } from './components/HeaderNav';
import { CockpitView } from './components/CockpitView';
import { OpportunityModal } from './components/OpportunityModal';
import { PortfolioView } from './components/PortfolioView';
import { TradeJournal } from './components/TradeJournal';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { MyOrdersView } from './components/MyOrdersView';
import { ConnectedCharactersModal } from './components/ConnectedCharactersModal';
import { GlobalMarketSyncModal } from './components/GlobalMarketSyncModal';
import { GlobalScannerView } from './components/GlobalScannerView';

export const App: React.FC = () => {
  // Navigation & Catalog state
  const [selectedType, setSelectedType] = useState<EveTypeDetail>(() => {
    return CatalogRepository.getInstance().getTypeById(34) || EVE_TYPES_CATALOG[0];
  });
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('eve_trade_favs');
      return saved ? JSON.parse(saved) : [34, 37, 40519, 44992];
    } catch {
      return [34, 37, 40519, 44992];
    }
  });
  const [recentTypeIds, setRecentTypeIds] = useState<number[]>([34, 37, 40519]);
  const [customTypes, setCustomTypes] = useState<EveTypeDetail[]>([]);

  // Hubs state
  const [hubs, setHubs] = useState<MarketHub[]>(MAJOR_MARKET_HUBS);

  // Strategy & Configuration
  const [strategy, setStrategy] = useState<TradeStrategy>('relist');
  const [config, setConfig] = useState<FinancialConfig>(() => {
    const saved = localStorage.getItem('eve_trade_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      available_capital: 1000000000.0, // 1 Billion ISK
      enable_transport_costs: false,   // Disabled by default -> 0 ISK transport cost
      broker_fee: 0.0145,              // 1.45%
      sales_tax: 0.035,               // 3.5%
      transport_cost_per_m3: 0,        // 0 ISK / m³
      transport_cost_per_jump: 0,      // 0 ISK / jump
      transport_collateral_rate: 0,    // 0%
      max_cargo_m3: 35000.0,           // 35,000 m³ (Deep Space Transport / Hauler)
      min_roi: 0.02,                   // Min 2% ROI
      min_net_profit: 200000.0,        // Min 200k ISK profit
      max_days_to_sell: 10.0,          // Max 10 days turnover
      max_capital_per_trade: 400000000.0, // 400M ISK max per position
      max_portfolio_concentration_type: 0.35,
      max_portfolio_concentration_group: 0.50,
      accounting_level: 5,
      broker_relations_level: 5,
      corp_standing: 0,
      faction_standing: 0,
    };
  });

  // Views & Modals
  const [currentView, setCurrentView] = useState<'cockpit' | 'global' | 'portfolio' | 'orders' | 'journal' | 'config'>('cockpit');
  const [selectedOpportunity, setSelectedOpportunity] = useState<InterRegionalOpportunity | null>(null);
  const [isCharactersModalOpen, setIsCharactersModalOpen] = useState<boolean>(false);
  const [isGlobalSyncModalOpen, setIsGlobalSyncModalOpen] = useState<boolean>(false);
  const [isMobileCatalogOpen, setIsMobileCatalogOpen] = useState<boolean>(false);

  // Global Sync Live State
  const [globalSyncProgress, setGlobalSyncProgress] = useState<GlobalSyncProgress>(GlobalMarketSyncService.getProgress());

  // EVE Character Session & Real Orders (SSO)
  const [characterSession, setCharacterSession] = useState<EveCharacterSession | null>(() => {
    return AuthService.getActiveCharacter();
  });
  const [characterOrders, setCharacterOrders] = useState<EveCharacterOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Trade Journal
  const [tradeExecutions, setTradeExecutions] = useState<RecordedTradeExecution[]>(() => {
    try {
      const saved = localStorage.getItem('eve_trade_journal');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Market Orders & History Cache: keyed by region_id
  const [orderBooks, setOrderBooks] = useState<Record<number, RawMarketOrder[]>>({});
  const [historyCache, setHistoryCache] = useState<Record<number, HistoricalStats>>({});
  const [isSyncingLiveEsi, setIsSyncingLiveEsi] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Sorting & Filtering
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'roi' | 'profit_day' | 'turnover'>('score');
  const [filterRoute, setFilterRoute] = useState<string>('all');
  const [highSecOnly, setHighSecOnly] = useState<boolean>(true);

  // Subscribe to Global Market Sync progress
  useEffect(() => {
    const unsub = GlobalMarketSyncService.subscribe((p) => {
      setGlobalSyncProgress(p);
    });
    return () => unsub();
  }, []);

  // Load Character Data and Orders
  const loadCharacterData = useCallback(async (
    token: string,
    charId: number,
    charName: string,
    existingSession?: EveCharacterSession
  ) => {
    setIsLoadingOrders(true);
    try {
      const balance = await EsiService.fetchCharacterWallet(charId, token);
      const skills = await EsiService.fetchCharacterSkills(charId, token);
      const rawOrders = await EsiService.fetchCharacterOrders(charId, token);

      const orderTypeIds = Array.from(new Set(rawOrders.map((o) => o.type_id)));
      if (orderTypeIds.length > 0) {
        MarketDataStore.syncCharacterOrdersMarketData(orderTypeIds, hubs).catch(() => {});
      }

      const enrichedOrders: EveCharacterOrder[] = [];
      for (const o of rawOrders) {
        const typeName = CatalogRepository.getInstance().getTypeName(o.type_id);
        const locName = await EsiService.resolveLocationName(o.location_id, token);

        const regOrders = MarketDataStore.getOrders(o.type_id, o.region_id) || orderBooks[o.region_id] || [];
        const sameTypeOrders = regOrders.filter((ro) => ro.type_id === o.type_id);
        let isOutbid = false;
        let diffPct = 0;
        let highestBuy = 0;
        let lowestSell = 0;

        if (sameTypeOrders.length > 0) {
          const buyOrders = sameTypeOrders.filter((ro) => ro.is_buy_order);
          const sellOrders = sameTypeOrders.filter((ro) => !ro.is_buy_order);

          if (buyOrders.length > 0) highestBuy = Math.max(...buyOrders.map((b) => b.price));
          if (sellOrders.length > 0) lowestSell = Math.min(...sellOrders.map((s) => s.price));

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

        enrichedOrders.push({
          ...o,
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

      setCharacterOrders(enrichedOrders);

      CharacterRepository.getInstance().saveSnapshot(charId, {
        wallet_balance: balance,
        skills: skills || { accounting: 5, broker_relations: 5 },
        active_orders: enrichedOrders,
        source: 'server_proxy',
      });

      const accountingLvl = skills ? skills.accounting : 5;
      const brokerRelLvl = skills ? skills.broker_relations : 5;
      const calculatedBrokerFee = Math.max(0.01, 0.03 - (brokerRelLvl * 0.003));
      const calculatedSalesTax = Math.max(0.036, 0.08 * (1 - (accountingLvl * 0.11)));

      const sessionObj: EveCharacterSession = {
        ...(existingSession || {}),
        character_id: charId,
        character_name: charName,
        access_token: token,
        portrait_url: `https://images.evetech.net/characters/${charId}/portrait?size=128`,
        wallet_balance: balance !== null ? balance : existingSession?.wallet_balance,
        accounting_skill: accountingLvl,
        broker_relations_skill: brokerRelLvl,
        last_sync: new Date().toISOString(),
        is_active: true,
      };

      AuthService.saveCharacter(sessionObj, true);
      setCharacterSession(sessionObj);

      setConfig((prev) => ({
        ...prev,
        available_capital: (balance && balance > 0) ? balance : prev.available_capital,
        accounting_level: accountingLvl,
        broker_relations_level: brokerRelLvl,
        broker_fee: calculatedBrokerFee,
        sales_tax: calculatedSalesTax,
      }));
    } catch (err) {
      console.error('Error loading character data:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [orderBooks, hubs]);

  // Initial URL check (handle SSO redirect callback in main window)
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
          setCurrentView('orders');
        } catch (err) {
          console.error('Failed to exchange code from URL:', err);
        }
      }
    };
    handleUrlCallback();
  }, [loadCharacterData]);

  // Listen for OAuth Success postMessage
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (event.data?.session) {
          const s = event.data.session as EveCharacterSession;
          AuthService.saveCharacter(s, true);
          await loadCharacterData(s.access_token, s.character_id, s.character_name, s);
          setCurrentView('orders');
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
          AuthService.saveCharacter(s, true);
          await loadCharacterData(token, character_id, character_name, s);
          setCurrentView('orders');
        } else if (event.data?.code) {
          const session = await AuthService.exchangeCodeForSession(event.data.code, undefined, event.data.state || undefined);
          await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
          setCurrentView('orders');
        }
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        console.error('SSO OAuth Error received from popup:', event.data.error, event.data.errorDescription);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadCharacterData]);

  // Subscribe to AuthService session changes & periodic token maintenance
  useEffect(() => {
    const unsubscribe = AuthService.subscribe((updatedSession) => {
      setCharacterSession(updatedSession);
      if (updatedSession) {
        const snap = CharacterRepository.getInstance().getSnapshot(updatedSession.character_id);
        if (snap && snap.active_orders.length > 0 && characterOrders.length === 0) {
          setCharacterOrders(snap.active_orders);
        }
      }
    });

    const checkAndRefresh = async () => {
      const activeChar = AuthService.getActiveCharacter();
      if (activeChar) {
        const snap = CharacterRepository.getInstance().getSnapshot(activeChar.character_id);
        if (snap && snap.active_orders.length > 0) {
          setCharacterOrders(snap.active_orders);
        }

        try {
          const validSession = await AuthService.ensureValidToken(activeChar);
          setCharacterSession(validSession);
          if (!validSession.is_token_expired && validSession.access_token) {
            await loadCharacterData(
              validSession.access_token,
              validSession.character_id,
              validSession.character_name,
              validSession
            );
          }
        } catch (e) {
          console.warn('Initial character token sync notice:', e);
        }
      }
    };

    checkAndRefresh();

    const interval = setInterval(() => {
      const activeChar = AuthService.getActiveCharacter();
      if (activeChar && !activeChar.is_token_expired) {
        AuthService.ensureValidToken(activeChar).catch(() => {});
      }
    }, 90000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadCharacterData]);

  // Connect SSO popup trigger
  const handleConnectSSO = async (customRedirectUri?: string) => {
    try {
      const urlParam = customRedirectUri ? `?redirect_uri=${encodeURIComponent(customRedirectUri)}` : '';
      const response = await fetch(`/api/auth/url${urlParam}`);
      if (!response.ok) {
        throw new Error('Impossible de générer l URL d autorisation SSO');
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
        window.location.href = authUrl;
      }
    } catch (err) {
      alert(`Erreur d initialisation SSO : ${err}`);
    }
  };

  // Manual code exchange
  const handleExchangeCode = async (code: string, redirectUri?: string) => {
    const session = await AuthService.exchangeCodeForSession(code, redirectUri);
    await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
  };

  // Direct Token Input
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
    AuthService.saveCharacter(session, true);
    await loadCharacterData(token, session.character_id, session.character_name, session);
  };

  // Logout Character
  const handleLogoutCharacter = () => {
    if (characterSession) {
      AuthService.removeCharacter(characterSession.character_id);
    }
    setCharacterSession(null);
    setCharacterOrders([]);
  };

  // Jump from an order to arbitrage cockpit
  const handleSelectTypeForArbitrage = (typeId: number) => {
    const catalogRepo = CatalogRepository.getInstance();
    const found = catalogRepo.getTypeById(typeId);
    if (found) {
      handleSelectType(found);
      setCurrentView('cockpit');
    } else {
      EsiService.lookupTypeById(typeId).then((detail) => {
        if (detail) {
          const mDetail: EveTypeDetail = { ...detail, category_id: 0 };
          catalogRepo.registerCustomType(mDetail);
          handleSelectType(mDetail);
          setCurrentView('cockpit');
        }
      });
    }
  };

  // Subscribe to MarketDataStore updates to keep Cockpit order books and history in sync
  useEffect(() => {
    const unsub = MarketDataStore.subscribe(() => {
      const books = MarketDataStore.getOrdersForType(selectedType.type_id, hubs);
      const hist = MarketDataStore.getHistoryForType(selectedType.type_id);
      setOrderBooks(books);
      setHistoryCache(hist);
    });
    return () => unsub();
  }, [selectedType.type_id, hubs]);

  // Initial load and background sync on item change
  useEffect(() => {
    const books = MarketDataStore.getOrdersForType(selectedType.type_id, hubs);
    const hist = MarketDataStore.getHistoryForType(selectedType.type_id);
    setOrderBooks(books);
    setHistoryCache(hist);

    MarketDataStore.fetchLiveItemData(selectedType.type_id, hubs, false)
      .then((res) => {
        setOrderBooks(res.orderBooks);
        setHistoryCache(res.history);
      })
      .catch(() => {});
  }, [selectedType.type_id, hubs]);

  const handleToggleFavorite = (typeId: number) => {
    setFavorites((prev) => {
      const next = prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId];
      try {
        localStorage.setItem('eve_trade_favs', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleSelectType = (type: EveTypeDetail) => {
    setSelectedType(type);
    setIsMobileCatalogOpen(false);
    setRecentTypeIds((prev) => [type.type_id, ...prev.filter((id) => id !== type.type_id)].slice(0, 10));

    const books = MarketDataStore.getOrdersForType(type.type_id, hubs);
    const hist = MarketDataStore.getHistoryForType(type.type_id);
    setOrderBooks(books);
    setHistoryCache(hist);

    MarketDataStore.fetchLiveItemData(type.type_id, hubs, false)
      .then((res) => {
        setOrderBooks(res.orderBooks);
        setHistoryCache(res.history);
      })
      .catch(() => {});
  };

  const handleToggleHub = (hubId: string) => {
    setHubs((prev) =>
      prev.map((h) => (h.id === hubId ? { ...h, active: !h.active } : h))
    );
  };

  const handleUpdateConfig = (newConfig: FinancialConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem('eve_trade_config', JSON.stringify(newConfig));
    } catch {}
  };

  const handleSyncLiveESI = async () => {
    setIsSyncingLiveEsi(true);
    setSyncStatusMsg(`Synchronisation CCP ESI pour ${selectedType.name} sur les 5 hubs...`);

    try {
      const res = await MarketDataStore.fetchLiveItemData(selectedType.type_id, hubs, true);
      setOrderBooks(res.orderBooks);
      setHistoryCache(res.history);
      setSyncStatusMsg(
        res.successCount > 0
          ? `Succès : ${res.successCount} régions synchronisées en temps réel depuis Tranquility.`
          : 'Données ESI temporairement inaccessibles, carnet mis à jour.'
      );
    } catch (err) {
      console.warn('Error during manual ESI sync:', err);
      setSyncStatusMsg('Erreur lors de la synchronisation ESI.');
    } finally {
      setIsSyncingLiveEsi(false);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  // Opportunities calculation for Cockpit
  const opportunities = useMemo(() => {
    const qualities = MarketDataStore.getQualitiesForType(selectedType.type_id, hubs);
    return InterRegionalScanner.scanItemAcrossHubs(
      selectedType,
      hubs,
      strategy,
      config,
      orderBooks,
      historyCache,
      qualities
    );
  }, [selectedType, hubs, strategy, config, orderBooks, historyCache]);

  const sortedOpportunities = useMemo(() => {
    return opportunities
      .filter((opp) => {
        if (highSecOnly && !opp.route.is_highsec_only) return false;
        if (filterRoute !== 'all') {
          const rKey = `${opp.buy_hub.id}_${opp.sell_hub.id}`;
          if (rKey !== filterRoute) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return b.scores.overall_score - a.scores.overall_score;
        if (sortBy === 'profit') return b.costs.net_profit - a.costs.net_profit;
        if (sortBy === 'roi') return b.costs.roi - a.costs.roi;
        if (sortBy === 'profit_day') return b.profit_per_day - a.profit_per_day;
        if (sortBy === 'turnover') return a.expected_days_to_sell - b.expected_days_to_sell;
        return 0;
      });
  }, [opportunities, sortBy, filterRoute, highSecOnly]);

  const portfolioSimulation = useMemo(() => {
    return PortfolioOptimizer.optimize(opportunities, config);
  }, [opportunities, config]);

  const handleExecuteTrade = (opp: InterRegionalOpportunity) => {
    const entry: RecordedTradeExecution = {
      id: `${Date.now()}_${opp.id}`,
      opportunity_id: opp.id,
      timestamp: new Date().toISOString(),
      type_id: opp.type_id,
      type_name: opp.type_name,
      from_hub: opp.buy_hub.name,
      to_hub: opp.sell_hub.name,
      strategy: opp.strategy,
      predicted_buy_price: opp.effective_buy_price,
      predicted_sell_price: opp.effective_sell_price,
      predicted_quantity: opp.quantity_tradable,
      predicted_net_profit: opp.costs.net_profit,
      predicted_days_to_sell: opp.expected_days_to_sell,
      status: 'planned',
    };

    const next = [entry, ...tradeExecutions];
    setTradeExecutions(next);
    try {
      localStorage.setItem('eve_trade_journal', JSON.stringify(next));
    } catch {}
  };

  const handleUpdateExecution = (updated: RecordedTradeExecution) => {
    const next = tradeExecutions.map((x) => (x.id === updated.id ? updated : x));
    setTradeExecutions(next);
    try {
      localStorage.setItem('eve_trade_journal', JSON.stringify(next));
    } catch {}
  };

  const handleSelectOpportunityForCockpit = (opp: UniverseWideOpportunity) => {
    const found = CatalogRepository.getInstance().getTypeById(opp.type_id)
      || customTypes.find((t) => t.type_id === opp.type_id);

    if (found) {
      handleSelectType(found);
    } else {
      const genericType: EveTypeDetail = {
        type_id: opp.type_id,
        name: opp.item_name,
        description: '',
        volume: opp.total_cargo_volume / (opp.quantity_tradable || 1),
        group_id: 0,
        group_name: opp.group_name,
        category_id: 0,
        category_name: opp.category_name,
        average_price: opp.effective_buy_price,
      };
      setCustomTypes((prev) => [...prev, genericType]);
      handleSelectType(genericType);
    }

    setSelectedOpportunity(opp);
    setCurrentView('cockpit');
  };

  return (
    <div className="flex h-screen bg-[#0e1117] text-[#fafafa] overflow-hidden font-sans">
      {/* 1. Left Nav: Market Browser Tree */}
      <aside className="w-80 flex-shrink-0 h-full hidden lg:block">
        <MarketTree
          selectedTypeId={selectedType.type_id}
          onSelectType={handleSelectType}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          recentTypeIds={recentTypeIds}
          customTypes={customTypes}
          onAddCustomType={(t) => setCustomTypes((prev) => [...prev, t])}
        />
      </aside>

      {/* Mobile Catalog Drawer (< lg) */}
      {isMobileCatalogOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileCatalogOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] h-full bg-[#0e1117] shadow-2xl z-10 flex flex-col border-r border-[#262730]">
            <div className="p-3 bg-[#161821] border-b border-[#262730] flex items-center justify-between">
              <span className="font-bold text-sm text-[#fafafa] flex items-center gap-2">
                📦 Catalogue d'Objets
              </span>
              <button
                onClick={() => setIsMobileCatalogOpen(false)}
                className="px-2.5 py-1 rounded bg-[#262730] hover:bg-[#31333f] text-xs text-[#808495] hover:text-[#fafafa] transition-colors"
              >
                Fermer
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MarketTree
                selectedTypeId={selectedType.type_id}
                onSelectType={handleSelectType}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                recentTypeIds={recentTypeIds}
                customTypes={customTypes}
                onAddCustomType={(t) => setCustomTypes((prev) => [...prev, t])}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <HeaderNav
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedType={selectedType}
          characterSession={characterSession}
          characterOrdersCount={characterOrders.length}
          portfolioPositionsCount={portfolioSimulation.positions.length}
          tradeExecutionsCount={tradeExecutions.length}
          globalSyncProgress={globalSyncProgress}
          onOpenGlobalSync={() => setIsGlobalSyncModalOpen(true)}
          onOpenCharactersModal={() => setIsCharactersModalOpen(true)}
          onToggleCatalogDrawer={() => setIsMobileCatalogOpen((prev) => !prev)}
        />

        {/* Sync notification banner */}
        {syncStatusMsg && (
          <div className="bg-[#161821] border-b border-[#262730] px-6 py-2 text-xs text-[#808495] flex items-center justify-between">
            <span>{syncStatusMsg}</span>
          </div>
        )}

        {/* Scrollable View Body */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {currentView === 'global' ? (
            <GlobalScannerView
              hubs={hubs}
              config={config}
              strategy={strategy}
              onOpenGlobalSyncModal={() => setIsGlobalSyncModalOpen(true)}
              onSelectOpportunityForCockpit={handleSelectOpportunityForCockpit}
            />
          ) : currentView === 'orders' ? (
            <MyOrdersView
              session={characterSession}
              orders={characterOrders}
              isLoadingOrders={isLoadingOrders}
              onRefreshOrders={() => {
                if (characterSession) {
                  loadCharacterData(
                    characterSession.access_token,
                    characterSession.character_id,
                    characterSession.character_name,
                    characterSession
                  );
                }
              }}
              onConnectSSO={handleConnectSSO}
              onExchangeCode={handleExchangeCode}
              onDirectTokenInput={handleDirectTokenInput}
              onLogout={handleLogoutCharacter}
              onSelectTypeForArbitrage={handleSelectTypeForArbitrage}
              hubs={hubs}
              config={config}
              orderBooks={orderBooks}
              historyCache={historyCache}
            />
          ) : currentView === 'portfolio' ? (
            <PortfolioView
              simulation={portfolioSimulation}
              onSelectOpportunity={(oppId) => {
                const found = opportunities.find((o) => o.id === oppId);
                if (found) setSelectedOpportunity(found);
              }}
            />
          ) : currentView === 'journal' ? (
            <TradeJournal
              executions={tradeExecutions}
              onUpdateExecution={handleUpdateExecution}
            />
          ) : currentView === 'config' ? (
            <ConfigurationPanel
              hubs={hubs}
              onToggleHub={handleToggleHub}
              onSetHubsActive={(activeIds) => {
                setHubs((prev) => prev.map((h) => ({ ...h, active: activeIds.includes(h.id) })));
              }}
              config={config}
              onUpdateConfig={handleUpdateConfig}
              strategy={strategy}
              onChangeStrategy={setStrategy}
            />
          ) : (
            <CockpitView
              selectedType={selectedType}
              hubs={hubs}
              strategy={strategy}
              opportunities={opportunities}
              sortedOpportunities={sortedOpportunities}
              sortBy={sortBy}
              onSortChange={setSortBy}
              highSecOnly={highSecOnly}
              onToggleHighSec={setHighSecOnly}
              isSyncingLiveEsi={isSyncingLiveEsi}
              onSyncLiveESI={handleSyncLiveESI}
              onSelectOpportunity={setSelectedOpportunity}
            />
          )}
        </main>
      </div>

      {/* Detail Modal */}
      {selectedOpportunity && (
        <OpportunityModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
          onExecuteTrade={handleExecuteTrade}
        />
      )}

      {/* Connected Characters Modal */}
      <ConnectedCharactersModal
        isOpen={isCharactersModalOpen}
        onClose={() => setIsCharactersModalOpen(false)}
        activeCharacter={characterSession}
        onSelectCharacter={(session) => {
          setCharacterSession(session);
          loadCharacterData(session.access_token, session.character_id, session.character_name, session);
        }}
        onConnectSSO={handleConnectSSO}
        onRefreshCharacter={async (session) => {
          await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
        }}
      />

      {/* Global Market Synchronizer Modal */}
      <GlobalMarketSyncModal
        isOpen={isGlobalSyncModalOpen}
        onClose={() => setIsGlobalSyncModalOpen(false)}
        hubs={hubs}
        config={config}
        strategy={strategy}
        customItems={customTypes}
        onOpenOpportunity={(opp) => handleSelectOpportunityForCockpit(opp)}
        onGoToGlobalScanner={() => setCurrentView('global')}
      />
    </div>
  );
};

export default App;
