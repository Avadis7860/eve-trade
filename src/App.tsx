import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  EVE_CATEGORIES,
  EVE_GROUPS,
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
import { generateMockOrders } from './data/mockData';
import { EsiService } from './services/esi';
import { AuthService } from './services/authService';
import { GlobalMarketSyncService } from './services/globalMarketSync';
import { MarketDataStore } from './services/marketDataStore';
import { fmtIsk, fmtPct, fmtNumber } from './engine/money';
import { MarketTree } from './components/MarketTree';
import { OpportunityModal } from './components/OpportunityModal';
import { PortfolioView } from './components/PortfolioView';
import { TradeJournal } from './components/TradeJournal';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { MyOrdersView } from './components/MyOrdersView';
import { ConnectedCharactersModal } from './components/ConnectedCharactersModal';
import { GlobalMarketSyncModal } from './components/GlobalMarketSyncModal';
import { GlobalScannerView } from './components/GlobalScannerView';
import {
  TrendingUp,
  Sliders,
  PieChart,
  BookOpen,
  ArrowRight,
  Filter,
  CheckCircle,
  AlertTriangle,
  Zap,
  Globe,
  RefreshCw,
  ShoppingBag,
  Award,
  Users,
  Sparkles,
} from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & Catalog state
  const [selectedType, setSelectedType] = useState<EveTypeDetail>(EVE_TYPES_CATALOG[0]); // Tritanium
  const [favorites, setFavorites] = useState<number[]>(() => {
    const saved = localStorage.getItem('eve_trade_favs');
    return saved ? JSON.parse(saved) : [34, 37, 40519, 44992];
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
    const saved = localStorage.getItem('eve_trade_journal');
    return saved ? JSON.parse(saved) : [];
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
      // 1. Fetch wallet balance
      const balance = await EsiService.fetchCharacterWallet(charId, token);

      // 2. Fetch skills
      const skills = await EsiService.fetchCharacterSkills(charId, token);

      // 3. Fetch active character orders
      const rawOrders = await EsiService.fetchCharacterOrders(charId, token);

      // Trigger background synchronization of live market data across all hubs for character orders
      const orderTypeIds = Array.from(new Set(rawOrders.map((o) => o.type_id)));
      if (orderTypeIds.length > 0) {
        MarketDataStore.syncCharacterOrdersMarketData(orderTypeIds, hubs).catch(() => {});
      }

      // 4. Enrich orders with item names & outbid calculation & live location names
      const enrichedOrders: EveCharacterOrder[] = [];
      for (const o of rawOrders) {
        const knownType = EVE_TYPES_CATALOG.find((t) => t.type_id === o.type_id)
          || customTypes.find((t) => t.type_id === o.type_id);
        const typeName = knownType ? knownType.name : `Type #${o.type_id}`;
        
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

          if (buyOrders.length > 0) {
            highestBuy = Math.max(...buyOrders.map((b) => b.price));
          }
          if (sellOrders.length > 0) {
            lowestSell = Math.min(...sellOrders.map((s) => s.price));
          }

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

      // Calculate skills fee benefits
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

      // Auto-update capital & skills in config
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
  }, [orderBooks, customTypes]);

  // Initial URL check (handle SSO redirect callback in main window)
  useEffect(() => {
    const handleUrlCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code') || urlParams.get('eve_sso_code');
      if (code) {
        try {
          // Clean URL without reload
          window.history.replaceState({}, document.title, window.location.pathname);
          const session = await AuthService.exchangeCodeForSession(code);
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
            expires_at: expires_in ? Date.now() + expires_in * 1000 : Date.now() + 20 * 60 * 1000,
            portrait_url: `https://images.evetech.net/characters/${character_id}/portrait?size=128`,
            last_sync: new Date().toISOString(),
            is_active: true,
          };
          AuthService.saveCharacter(s, true);
          await loadCharacterData(token, character_id, character_name, s);
          setCurrentView('orders');
        } else if (event.data?.code) {
          const session = await AuthService.exchangeCodeForSession(event.data.code);
          await loadCharacterData(session.access_token, session.character_id, session.character_name, session);
          setCurrentView('orders');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadCharacterData]);

  // Subscribe to AuthService session changes & periodic token maintenance
  useEffect(() => {
    // 1. Listen for storage / background refresh updates
    const unsubscribe = AuthService.subscribe((updatedSession) => {
      setCharacterSession(updatedSession);
    });

    // 2. Initial load
    const checkAndRefresh = async () => {
      const activeChar = AuthService.getActiveCharacter();
      if (activeChar) {
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

    // Check token health every 90s proactively
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

      // Popup window
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
    const session: EveCharacterSession = {
      character_id: characterId,
      character_name: characterName,
      access_token: token,
      expires_at: Date.now() + 20 * 60 * 1000,
      portrait_url: `https://images.evetech.net/characters/${characterId}/portrait?size=128`,
      last_sync: new Date().toISOString(),
      is_active: true,
    };
    AuthService.saveCharacter(session, true);
    await loadCharacterData(token, characterId, characterName, session);
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
    const found = EVE_TYPES_CATALOG.find((t) => t.type_id === typeId)
      || customTypes.find((t) => t.type_id === typeId);
    if (found) {
      handleSelectType(found);
      setCurrentView('cockpit');
    } else {
      EsiService.lookupTypeById(typeId).then((detail) => {
        if (detail) {
          const mDetail: EveTypeDetail = { ...detail, category_id: 0 };
          setCustomTypes((prev) => [...prev, mDetail]);
          handleSelectType(mDetail);
          setCurrentView('cockpit');
        }
      });
    }
  };

  // Subscribe to MarketDataStore updates to keep Cockpit order books and history in sync with Global Sync
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

    // If not in cache or stale, fetch live in background
    MarketDataStore.fetchLiveItemData(selectedType.type_id, hubs, false)
      .then((res) => {
        setOrderBooks(res.orderBooks);
        setHistoryCache(res.history);
      })
      .catch(() => {});
  }, [selectedType.type_id, hubs]);

  // Toggle favorite
  const handleToggleFavorite = (typeId: number) => {
    setFavorites((prev) => {
      const next = prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId];
      localStorage.setItem('eve_trade_favs', JSON.stringify(next));
      return next;
    });
  };

  // Select item from market tree
  const handleSelectType = (type: EveTypeDetail) => {
    setSelectedType(type);
    setRecentTypeIds((prev) => [type.type_id, ...prev.filter((id) => id !== type.type_id)].slice(0, 10));

    // Instantly load from MarketDataStore (if discovered in Global Sync, it's immediately available with real ESI orders!)
    const books = MarketDataStore.getOrdersForType(type.type_id, hubs);
    const hist = MarketDataStore.getHistoryForType(type.type_id);
    setOrderBooks(books);
    setHistoryCache(hist);

    // Auto-fetch fresh ESI if needed
    MarketDataStore.fetchLiveItemData(type.type_id, hubs, false)
      .then((res) => {
        setOrderBooks(res.orderBooks);
        setHistoryCache(res.history);
      })
      .catch(() => {});
  };

  // Toggle Hub active status
  const handleToggleHub = (hubId: string) => {
    setHubs((prev) =>
      prev.map((h) => (h.id === hubId ? { ...h, active: !h.active } : h))
    );
  };

  // Save Config
  const handleUpdateConfig = (newConfig: FinancialConfig) => {
    setConfig(newConfig);
    localStorage.setItem('eve_trade_config', JSON.stringify(newConfig));
  };

  // Synchronize Live ESI orders for all hubs for the selected item (Force refresh)
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

  // Scan inter-regional opportunities for single item (Cockpit)
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

  // Filtered and sorted opportunities
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

  // Run portfolio simulation
  const portfolioSimulation = useMemo(() => {
    return PortfolioOptimizer.optimize(opportunities, config);
  }, [opportunities, config]);

  // Execute trade -> Add to Journal
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
    localStorage.setItem('eve_trade_journal', JSON.stringify(next));
  };

  const handleUpdateExecution = (updated: RecordedTradeExecution) => {
    const next = tradeExecutions.map((x) => (x.id === updated.id ? updated : x));
    setTradeExecutions(next);
    localStorage.setItem('eve_trade_journal', JSON.stringify(next));
  };

  // Jump from Global opportunity to Cockpit
  const handleSelectOpportunityForCockpit = (opp: UniverseWideOpportunity) => {
    const found = EVE_TYPES_CATALOG.find((t) => t.type_id === opp.type_id)
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
      {/* 1. Left Nav: Market Browser Tree (Category -> Group -> Type) */}
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

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="bg-[#161821] border-b border-[#262730] px-5 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold tracking-tight text-[#fafafa] flex items-center gap-2">
              <span className="text-xl">🚀</span> EVE Trade — Moteur Inter-Régions
            </h1>
            <div className="hidden xl:flex items-center gap-1.5 text-xs bg-[#0e1117] px-2.5 py-1 rounded-lg border border-[#262730]">
              <span className="text-[#808495]">Objet actif :</span>
              <span className="font-bold text-[#fafafa]">{selectedType.name}</span>
              <span className="text-[10px] text-[#808495] font-mono">({selectedType.volume} m³)</span>
            </div>
          </div>

          {/* View Switcher Tabs & Actions */}
          <div className="flex items-center gap-2">
            <nav className="flex items-center bg-[#0e1117] p-1 rounded-lg border border-[#262730] text-xs">
              <button
                onClick={() => setCurrentView('cockpit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  currentView === 'cockpit'
                    ? 'bg-[#262730] text-[#fafafa] shadow'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-[#ff4b4b]" />
                <span>Cockpit</span>
              </button>

              <button
                onClick={() => setCurrentView('global')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  currentView === 'global'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow'
                    : 'text-[#808495] hover:text-purple-300'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Découverte Globale</span>
              </button>

              <button
                onClick={() => setCurrentView('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  currentView === 'orders'
                    ? 'bg-[#262730] text-[#fafafa] shadow'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <ShoppingBag className={`w-3.5 h-3.5 ${characterSession ? 'text-[#ff4b4b]' : 'text-[#808495]'}`} />
                <span>Mes Ordres</span>
                {characterSession ? (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-green-500/20 text-green-400 font-bold">
                    {characterOrders.length}
                  </span>
                ) : (
                  <span className="ml-1 text-[10px] text-amber-400 font-mono">SSO</span>
                )}
              </button>

              <button
                onClick={() => setCurrentView('portfolio')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  currentView === 'portfolio'
                    ? 'bg-[#262730] text-[#fafafa] shadow'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <PieChart className="w-3.5 h-3.5 text-amber-400" />
                <span>Portefeuille ({portfolioSimulation.positions.length})</span>
              </button>

              <button
                onClick={() => setCurrentView('journal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  currentView === 'journal'
                    ? 'bg-[#262730] text-[#fafafa] shadow'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 text-green-400" />
                <span>Journal ({tradeExecutions.length})</span>
              </button>

              <button
                onClick={() => setCurrentView('config')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  currentView === 'config'
                    ? 'bg-[#262730] text-[#fafafa] shadow'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-blue-400" />
                <span>Paramètres</span>
              </button>
            </nav>

            {/* Global Market Sync Button with Progress Badge */}
            <button
              onClick={() => setIsGlobalSyncModalOpen(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600/30 to-blue-600/30 hover:from-purple-600/40 hover:to-blue-600/40 text-purple-200 border border-purple-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm"
              title="Lancer une synchronisation globale du catalogue complet"
            >
              <Globe className={`w-3.5 h-3.5 ${globalSyncProgress.is_running ? 'animate-spin text-purple-300' : 'text-purple-400'}`} />
              <span>
                {globalSyncProgress.is_running
                  ? `Sync Globale (${globalSyncProgress.percent}%)`
                  : 'Sync Globale ESI'}
              </span>
            </button>

            {/* Character & Multi-account pill */}
            <button
              onClick={() => setIsCharactersModalOpen(true)}
              className="flex items-center gap-2 bg-[#0e1117] hover:bg-[#1f2330] border border-[#262730] px-2.5 py-1 rounded-lg transition-colors text-left"
              title="Gérer vos personnages et comptes EVE liés"
            >
              {characterSession ? (
                <>
                  <img
                    src={characterSession.portrait_url}
                    alt={characterSession.character_name}
                    className="w-5 h-5 rounded-full border border-green-500/50 bg-[#161821] object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.evetech.net/characters/1/portrait?size=64';
                    }}
                  />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-[#fafafa] leading-tight truncate max-w-[90px]">
                      {characterSession.character_name}
                    </span>
                    {characterSession.wallet_balance !== undefined && (
                      <span className="text-[10px] font-mono text-amber-400 leading-tight">
                        {fmtIsk(characterSession.wallet_balance)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-[#808495] hover:text-[#fafafa]">
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Comptes SSO</span>
                </div>
              )}
            </button>
          </div>
        </header>

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
            /* COCKPIT VIEW */
            <div className="space-y-6">
              {/* Cockpit Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#161821] border border-[#262730] rounded-xl p-4">
                  <div className="text-xs text-[#808495] font-medium mb-1">Paires de Hubs Analysées</div>
                  <div className="text-2xl font-bold font-mono text-[#fafafa]">
                    {hubs.filter((h) => h.active).length * (hubs.filter((h) => h.active).length - 1)} routes
                  </div>
                  <div className="text-[11px] text-[#808495] mt-1">
                    Directionnel A &harr; B exhaustif
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-xl p-4">
                  <div className="text-xs text-[#808495] font-medium mb-1">Opportunités Viables</div>
                  <div className="text-2xl font-bold font-mono text-green-400">
                    {opportunities.filter((o) => o.is_viable).length}
                  </div>
                  <div className="text-[11px] text-[#808495] mt-1">
                    {opportunities.filter((o) => !o.is_viable).length} rejetées (filtres stricts)
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-xl p-4">
                  <div className="text-xs text-[#808495] font-medium mb-1">Meilleur Profit / Jour</div>
                  <div className="text-2xl font-bold font-mono text-amber-400">
                    {fmtIsk(opportunities[0]?.profit_per_day || 0)}
                  </div>
                  <div className="text-[11px] text-[#808495] mt-1">
                    Pondéré rotation du capital
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-xl p-4">
                  <div className="text-xs text-[#808495] font-medium mb-1">Stratégie en Cours</div>
                  <div className="text-xl font-bold font-mono text-[#ff4b4b] uppercase">
                    {strategy === 'relist' ? 'Buy & Relist' : 'Immédiate'}
                  </div>
                  <div className="text-[11px] text-[#808495] mt-1">
                    Frais bilatéraux inclus
                  </div>
                </div>
              </div>

              {/* Filters & Sorters Toolbar */}
              <div className="bg-[#161821] border border-[#262730] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[#808495]">Trier par :</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-[#0e1117] border border-[#31333f] text-[#fafafa] rounded-lg px-2.5 py-1 text-xs cursor-pointer focus:outline-none focus:border-[#ff4b4b]"
                    >
                      <option value="score">Score Global Composite</option>
                      <option value="profit_day">Profit / Jour (Rotation)</option>
                      <option value="profit">Profit Net Total</option>
                      <option value="roi">ROI (%)</option>
                      <option value="turnover">Jours de Vente (Croissant)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer text-[#808495] hover:text-[#fafafa]">
                    <input
                      type="checkbox"
                      checked={highSecOnly}
                      onChange={(e) => setHighSecOnly(e.target.checked)}
                      className="rounded bg-[#0e1117] text-[#ff4b4b] focus:ring-0"
                    />
                    <span>100% High-Sec uniquement</span>
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  {MarketDataStore.isLiveEsi(selectedType.type_id, 10000002) ? (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded font-mono">
                      <CheckCircle className="w-3 h-3 text-green-400" />
                      ESI Tranquility Live
                    </span>
                  ) : null}

                  <button
                    onClick={handleSyncLiveESI}
                    disabled={isSyncingLiveEsi}
                    className="flex items-center gap-1.5 bg-[#ff4b4b]/15 hover:bg-[#ff4b4b]/25 text-[#ff4b4b] border border-[#ff4b4b]/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Globe className={`w-3.5 h-3.5 ${isSyncingLiveEsi ? 'animate-spin' : ''}`} />
                    <span>{isSyncingLiveEsi ? 'Sync ESI...' : 'Actualiser Live ESI'}</span>
                  </button>

                  <div className="text-[11px] text-[#808495]">
                    Affichage de <strong className="text-[#fafafa]">{sortedOpportunities.length}</strong> opportunités pour{' '}
                    <span className="text-[#fafafa] font-semibold">{selectedType.name}</span>
                  </div>
                </div>
              </div>

              {/* Opportunities Matrix Table */}
              <div className="bg-[#161821] border border-[#262730] rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-[#0e1117] text-[#808495] uppercase tracking-wider text-[11px] border-b border-[#262730]">
                      <tr>
                        <th className="p-3.5">Route Commerciale</th>
                        <th className="p-3.5 text-right">Prix Achat (Moyen)</th>
                        <th className="p-3.5 text-right">Prix Vente (Moyen)</th>
                        <th className="p-3.5 text-right">Qté Tradable</th>
                        <th className="p-3.5 text-right">Profit Net</th>
                        <th className="p-3.5 text-right">Capturable</th>
                        <th className="p-3.5 text-right">Profit / Jour</th>
                        <th className="p-3.5 text-right">ROI</th>
                        <th className="p-3.5 text-right">Jours Vente</th>
                        <th className="p-3.5 text-right">Score</th>
                        <th className="p-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262730]">
                      {sortedOpportunities.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-[#808495]">
                            Aucune opportunité rentable trouvée pour {selectedType.name} avec les filtres actuels.
                          </td>
                        </tr>
                      ) : (
                        sortedOpportunities.map((opp) => {
                          const isAnom = opp.is_anomalous;
                          const isViable = opp.is_viable;

                          return (
                            <tr
                              key={opp.id}
                              onClick={() => setSelectedOpportunity(opp)}
                              className={`hover:bg-[#1a1d29] cursor-pointer transition-colors ${
                                isAnom ? 'bg-amber-950/10' : !isViable ? 'opacity-60' : ''
                              }`}
                            >
                              <td className="p-3.5">
                                <div className="flex items-center gap-1.5 font-bold text-[#fafafa]">
                                  <span>{opp.buy_hub.name}</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-[#808495]" />
                                  <span>{opp.sell_hub.name}</span>
                                </div>
                                <div className="text-[10px] text-[#808495] flex items-center gap-2 mt-0.5">
                                  <span>{opp.route.jumps} sauts</span>
                                  <span>· {opp.strategy === 'relist' ? 'Relist' : 'Direct'}</span>
                                  {opp.jita_price_benchmark?.is_jita_verified && (
                                    <span
                                      className="text-amber-400/90 flex items-center gap-0.5"
                                      title={opp.jita_price_benchmark.reliability_assessment}
                                    >
                                      <Award className="w-2.5 h-2.5" />
                                      <span>Jita Ref</span>
                                    </span>
                                  )}
                                  {isAnom && (
                                    <span className="text-amber-400 font-bold">⚠️ anomalie</span>
                                  )}
                                </div>
                              </td>

                              <td className="p-3.5 text-right text-[#4d8dff]">
                                {fmtIsk(opp.effective_buy_price)}
                              </td>

                              <td className="p-3.5 text-right text-green-400">
                                {fmtIsk(opp.effective_sell_price)}
                              </td>

                              <td className="p-3.5 text-right text-[#fafafa]">
                                {fmtNumber(opp.quantity_tradable)}
                                <div className="text-[10px] text-[#808495]">
                                  {fmtNumber(opp.total_cargo_volume)} m³
                                </div>
                              </td>

                              <td className="p-3.5 text-right font-bold text-green-400">
                                {fmtIsk(opp.costs.net_profit)}
                              </td>

                              <td className="p-3.5 text-right text-purple-300">
                                {fmtIsk(opp.capturable_profit)}
                              </td>

                              <td className="p-3.5 text-right font-bold text-amber-400">
                                {fmtIsk(opp.profit_per_day)}
                              </td>

                              <td className="p-3.5 text-right text-green-400 font-semibold">
                                {fmtPct(opp.costs.roi)}
                              </td>

                              <td className="p-3.5 text-right text-[#808495]">
                                {opp.expected_days_to_sell.toFixed(1)} j
                              </td>

                              <td className="p-3.5 text-right">
                                <span
                                  className={`px-2 py-0.5 rounded-md font-bold text-xs ${
                                    opp.scores.overall_score >= 65
                                      ? 'bg-green-950/60 text-green-300 border border-green-700/50'
                                      : opp.scores.overall_score >= 40
                                      ? 'bg-amber-950/60 text-amber-300 border border-amber-700/50'
                                      : 'bg-red-950/60 text-red-300 border border-red-700/50'
                                  }`}
                                >
                                  {opp.scores.overall_score}
                                </span>
                              </td>

                              <td className="p-3.5 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedOpportunity(opp);
                                  }}
                                  className="px-2.5 py-1 rounded bg-[#262730] hover:bg-[#31333f] text-[#fafafa] text-[11px] font-medium transition-colors"
                                >
                                  Détail
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
