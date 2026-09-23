import React, { useState, useEffect, useMemo } from 'react';
import {
  EveTypeDetail,
  FinancialConfig,
  InterRegionalOpportunity,
  UniverseWideOpportunity,
  GlobalSyncProgress,
  OrderScope,
  OrderCollection,
  OrderSelectionContext,
  OrderCharacterContext,
  OrderCorporationContext,
  EveCharacterOrder,
} from './types';
import { EsiService } from './services/esi';
import { GlobalMarketSyncService } from './services/globalMarketSync';
import { CatalogRepository } from './domain/catalog/CatalogRepository';
import { CharacterRepository } from './domain/character/CharacterRepository';
import { MarketOutcomeTracker } from './services/marketOutcomeTracker';
import { selectOrdersByScope } from './engine/orderScoping';
import { mergeOrderObservations } from './engine/corporationOrder';

import { AuthProvider, useAuth } from './context/AuthProvider';
import { CatalogProvider, useCatalog } from './context/CatalogProvider';
import { TradingConfigProvider, useTradingConfig } from './context/TradingConfigProvider';

import { useCharacterSync } from './hooks/useCharacterSync';
import { useCorporationTreasurySync } from './hooks/useCorporationTreasurySync';
import { useMarketData } from './hooks/useMarketData';
import { useTradeJournal } from './hooks/useTradeJournal';
import { useTradingOpportunities } from './hooks/useTradingOpportunities';

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
import { MarketDataHealth } from './components/MarketDataHealth';

const AppShell: React.FC = () => {
  // Catalog Context
  const {
    selectedType,
    setSelectedType,
    favorites,
    toggleFavorite,
    recentTypeIds,
    catalogMetadata,
  } = useCatalog();

  // Trading Config Context
  const {
    config,
    setConfig,
    strategy,
    setStrategy,
    hubs,
    setHubs,
    sortBy,
    setSortBy,
    filterRoute,
    highSecOnly,
    setHighSecOnly,
  } = useTradingConfig();

  // Auth Context
  const { characterSession, linkedCharacters, setActiveCharacter } = useAuth();

  // Views & Modals
  const [currentView, setCurrentView] = useState<'cockpit' | 'global' | 'portfolio' | 'orders' | 'journal' | 'config'>('cockpit');
  const [selectedOpportunity, setSelectedOpportunity] = useState<InterRegionalOpportunity | null>(null);
  const [isCharactersModalOpen, setIsCharactersModalOpen] = useState<boolean>(false);
  const [isGlobalSyncModalOpen, setIsGlobalSyncModalOpen] = useState<boolean>(false);
  const [isMobileCatalogOpen, setIsMobileCatalogOpen] = useState<boolean>(false);

  // Initialize global opportunities from storage on mount
  useEffect(() => {
    GlobalMarketSyncService.initFromStorage();
  }, []);

  // Market Data (Live ESI & cached books)
  const {
    orderBooks,
    historyCache,
    isSyncingLiveEsi,
    syncStatusMsg,
    qualities,
    syncLiveESI,
  } = useMarketData(selectedType.type_id, selectedType.name, hubs);

  // Character Data & SSO Sync
  const {
    characterOrders,
    isLoadingOrders,
    orderSyncError,
    loadCharacterData,
    handleConnectSSO,
    handleExchangeCode,
    handleDirectTokenInput,
    handleLogoutCharacter,
  } = useCharacterSync(orderBooks, hubs, () => setCurrentView('orders'));

  // Corporation treasury has its own lifecycle: character OAuth remains the
  // authenticated principal, while treasury synchronization stays isolated.
  useCorporationTreasurySync();


  // Phase 2 — Order Scoping & Multi-Character Context
  const [orderScope, setOrderScope] = useState<OrderScope>({ type: 'active_character' });

  const allFleetOrders = useMemo(() => {
    const snapshots = CharacterRepository.getInstance().getAllSnapshots();
    const orderMap = new Map<string, EveCharacterOrder>();

    // Add orders from snapshots for each linked character
    for (const char of linkedCharacters) {
      const snap = snapshots[char.character_id];
      if (snap?.active_orders) {
        for (const ord of snap.active_orders) {
          const corporationOwned =
            ord.ownership?.owner_type === 'corporation' || ord.is_corporation === true;

          const candidateOrder: EveCharacterOrder = {
            ...ord,
            ...(corporationOwned
              ? {
                  character_id: undefined,
                  character_name: undefined,
                }
              : {
                  character_id: char.character_id,
                  character_name: char.character_name,
                }),
          };
          const existingOrder = orderMap.get(ord.order_id);
          if (existingOrder) {
            const mergedOrder = mergeOrderObservations(existingOrder, candidateOrder);
            if (mergedOrder) {
              orderMap.set(ord.order_id, mergedOrder);
            } else {
              console.warn(
                `[App] conflicting ownership observations for order ${ord.order_id}; order excluded from aggregate`,
              );
            }
          } else {
            orderMap.set(ord.order_id, candidateOrder);
          }
        }
      }
    }

    // Also include currently loaded characterOrders (from active character)
    if (characterSession) {
      for (const ord of characterOrders) {
        const corporationOwned =
          ord.ownership?.owner_type === 'corporation' || ord.is_corporation === true;

        const candidateOrder: EveCharacterOrder = {
          ...ord,
          ...(corporationOwned
            ? {
                character_id: undefined,
                character_name: undefined,
              }
            : {
                character_id: characterSession.character_id,
                character_name: characterSession.character_name,
              }),
        };
        const existingOrder = orderMap.get(ord.order_id);
        if (existingOrder) {
          const mergedOrder = mergeOrderObservations(existingOrder, candidateOrder);
          if (mergedOrder) {
            orderMap.set(ord.order_id, mergedOrder);
          } else {
            console.warn(
              `[App] conflicting ownership observations for order ${ord.order_id}; order excluded from aggregate`,
            );
          }
        } else {
          orderMap.set(ord.order_id, candidateOrder);
        }
      }
    }

    return Array.from(orderMap.values());
  }, [linkedCharacters, characterSession, characterOrders]);

  const orderContextCharacters = useMemo(
    () => (
      linkedCharacters.length > 0
        ? linkedCharacters
        : characterSession
          ? [characterSession]
          : []
    ),
    [linkedCharacters, characterSession]
  );

  const orderSelectionContext: OrderSelectionContext = useMemo(
    () => ({
      activeCharacterId: characterSession ? String(characterSession.character_id) : '',
      fleetCharacterIds: orderContextCharacters.map((c) => String(c.character_id)),
      corporationIds: Array.from(
        new Set(
          orderContextCharacters
            .map((c) => c.corporation_id)
            .filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
            .map((id) => String(id))
        )
      ),
    }),
    [characterSession, orderContextCharacters]
  );

  const scopedOrders = useMemo(() => {
    return selectOrdersByScope(allFleetOrders, orderScope, orderSelectionContext);
  }, [allFleetOrders, orderScope, orderSelectionContext]);

  const orderCharacterContexts: OrderCharacterContext[] = useMemo(() => {
    if (linkedCharacters.length > 0) {
      return linkedCharacters.map((c) => ({
        characterId: String(c.character_id),
        characterName: c.character_name,
      }));
    }
    if (characterSession) {
      return [
        {
          characterId: String(characterSession.character_id),
          characterName: characterSession.character_name,
        },
      ];
    }
    return [];
  }, [linkedCharacters, characterSession]);

  const orderCorporationContexts = useMemo(() => {
    const byId = new Map<string, OrderCorporationContext>();

    for (const char of orderContextCharacters) {
      if (char.corporation_id && char.corporation_id > 0) {
        byId.set(String(char.corporation_id), {
          corporationId: String(char.corporation_id),
          corporationName: char.corporation_name,
        });
      }
    }

    return Array.from(byId.values()).map((entry) => ({
      corporationId: entry.corporationId,
      corporationName: entry.corporationName,
    }));
  }, [orderContextCharacters]);

  const orderCollection: OrderCollection = useMemo(
    () => ({
      orders: scopedOrders,
      characters: orderCharacterContexts,
      corporations: orderCorporationContexts,
      scope: orderScope,
    }),
    [scopedOrders, orderCharacterContexts, orderCorporationContexts, orderScope]
  );

  // Global Sync Progress
  const [globalSyncProgress, setGlobalSyncProgress] = useState<GlobalSyncProgress>(GlobalMarketSyncService.getProgress());

  useEffect(() => {
    const unsub = GlobalMarketSyncService.subscribe((p) => setGlobalSyncProgress(p));
    return () => unsub();
  }, []);

  // Phase 2A Operational Lifecycle: Background Market Outcome Tracker Scheduler
  useEffect(() => {
    // Start recurring scheduler (default 60s interval)
    MarketOutcomeTracker.startScheduler(60000);
    return () => {
      // Cleanly stop recurring timer on unmount
      MarketOutcomeTracker.stopScheduler();
    };
  }, []);

  // Trade Journal Persistence
  const { tradeExecutions, handleExecuteTrade, handleUpdateExecution } = useTradeJournal();

  // Opportunities & Portfolio calculations for Cockpit
  const { opportunities, sortedOpportunities, portfolioSimulation } = useTradingOpportunities(
    selectedType,
    hubs,
    strategy,
    config,
    orderBooks,
    historyCache,
    highSecOnly,
    filterRoute,
    sortBy,
    linkedCharacters
  );

  const handleSelectOpportunityForCockpit = (opp: UniverseWideOpportunity) => {
    const resolution = CatalogRepository.getInstance().resolveType(opp.type_id, {
      name: opp.item_name,
      volume: opp.total_cargo_volume / (opp.quantity_tradable || 1),
      group_name: opp.group_name,
      category_name: opp.category_name,
      average_price: opp.effective_buy_price,
    });

    if (resolution.type) {
      setSelectedType(resolution.type);
    }
    setSelectedOpportunity(opp);
    setCurrentView('cockpit');
  };

  const handleSelectTypeForArbitrage = (typeId: number) => {
    const catalogRepo = CatalogRepository.getInstance();
    const found = catalogRepo.getTypeById(typeId);
    if (found) {
      setSelectedType(found);
      setCurrentView('cockpit');
    } else {
      catalogRepo.resolveTypeAsync(typeId).then((res) => {
        if (res.type) {
          setSelectedType(res.type);
        }
        setCurrentView('cockpit');
      });
    }
  };

  const handleToggleHub = (hubId: string) => {
    setHubs((prev) => prev.map((h) => (h.id === hubId ? { ...h, active: !h.active } : h)));
  };

  const handleUpdateConfig = (newConfig: FinancialConfig) => {
    setConfig(newConfig);
  };

  return (
    <div className="flex h-screen bg-[#0e1117] text-[#fafafa] overflow-hidden font-sans">
      {/* 1. Left Nav: Market Browser Tree */}
      <aside className="w-80 flex-shrink-0 h-full hidden lg:block border-r border-[#262730]">
        <MarketTree
          selectedTypeId={selectedType.type_id}
          onSelectType={(t) => setSelectedType(t)}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          recentTypeIds={recentTypeIds}
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
                onSelectType={(t) => {
                  setSelectedType(t);
                  setIsMobileCatalogOpen(false);
                }}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                recentTypeIds={recentTypeIds}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
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

        {/* Degradation Warning Banner */}
        {catalogMetadata.is_degraded && (
          <div className="bg-amber-950/40 border-b border-amber-800/60 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              <span className="truncate">
                <strong>Mode Dégradé (Fallback Core) :</strong> Catalogue de secours actif ({catalogMetadata.item_count} types). Synchronisation globale restreinte aux types vérifiés.
              </span>
            </div>
            <span className="text-[11px] text-amber-300/80 font-mono flex-shrink-0">
              Status: {catalogMetadata.status}
            </span>
          </div>
        )}

        <MarketDataHealth typeName={selectedType.name} hubs={hubs} qualities={qualities} isSyncing={isSyncingLiveEsi} onRefresh={syncLiveESI} />

        {/* Live ESI sync notification */}
        {syncStatusMsg && (
          <div className="bg-[#161821] border-b border-[#262730] px-6 py-2 text-xs text-[#808495] flex items-center justify-between">
            <span className="truncate">{syncStatusMsg}</span>
          </div>
        )}

        {/* Scrollable View Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-w-0">
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
              orderCollection={orderCollection}
              orders={scopedOrders}
              isLoadingOrders={isLoadingOrders}
              orderSyncError={orderSyncError}
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
              onChangeScope={setOrderScope}
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
              onSyncLiveESI={syncLiveESI}
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
          setActiveCharacter(session.character_id);
          loadCharacterData(session.access_token, session.character_id, session.character_name, session, true);
        }}
        onConnectSSO={handleConnectSSO}
        onRefreshCharacter={async (session) => {
          const isActive = session.character_id === characterSession?.character_id;
          await loadCharacterData(session.access_token, session.character_id, session.character_name, session, isActive);
        }}
      />

      {/* Global Market Synchronizer Modal */}
      <GlobalMarketSyncModal
        isOpen={isGlobalSyncModalOpen}
        onClose={() => setIsGlobalSyncModalOpen(false)}
        hubs={hubs}
        config={config}
        strategy={strategy}
        onOpenOpportunity={(opp) => handleSelectOpportunityForCockpit(opp)}
        onGoToGlobalScanner={() => setCurrentView('global')}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CatalogProvider>
        <TradingConfigProvider>
          <AppShell />
        </TradingConfigProvider>
      </CatalogProvider>
    </AuthProvider>
  );
};

export default App;
