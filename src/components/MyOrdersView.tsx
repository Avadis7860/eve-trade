import React, { useState, useMemo, useEffect } from 'react';
import {
  EveCharacterSession,
  EveCharacterOrder,
  MarketHub,
  FinancialConfig,
  RawMarketOrder,
  HistoricalStats,
  OrderAdvisorRecommendation,
  OrderCollection,
  OrderScope,
} from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import { AuthService } from '../services/authService';
import { OrderAdvisorService } from '../services/orderAdvisor';
import { getOrderLockedValue, getOrderMarketDistance, getOrderTiming } from '../engine/orderOperations';
import { GlobalMarketSyncService } from '../services/globalMarketSync';
import { MarketDataStore } from '../services/marketDataStore';
import { FailureSemantics } from '../engine/failureSemantics';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { OrderAdvisorModal } from './OrderAdvisorModal';
import { OrderOperationsDetail } from './OrderOperationsDetail';
import { SsoConnectCard } from './SsoConnectCard';
import {
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  ShoppingBag,
  Sparkles,
  Search,
  Zap,
  LogOut,
  Truck,
  XCircle,
  Clock,
  Globe,
  Users,
  User,
} from 'lucide-react';

interface MyOrdersViewProps {
  session: EveCharacterSession | null;
  orderCollection?: OrderCollection;
  orders?: EveCharacterOrder[];
  isLoadingOrders: boolean;
  orderSyncError?: string | null;
  onRefreshOrders: () => void;
  onConnectSSO: (customRedirectUri?: string) => void;
  onExchangeCode: (code: string, redirectUri?: string) => Promise<void>;
  onDirectTokenInput: (token: string, characterId: number, characterName: string) => void;
  onLogout: () => void;
  onSelectTypeForArbitrage: (typeId: number) => void;
  hubs: MarketHub[];
  config?: FinancialConfig;
  orderBooks?: Record<number, RawMarketOrder[]>;
  historyCache?: Record<number, HistoricalStats>;
  onChangeScope?: (scope: OrderScope) => void;
}

function formatOrderAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86_400) return Math.floor(seconds / 3600) + 'h';
  return Math.floor(seconds / 86_400) + 'j';
}

function formatRemainingDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 3600) return Math.max(1, Math.floor(seconds / 60)) + 'm';
  if (seconds < 86_400) return Math.floor(seconds / 3600) + 'h';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  return hours > 0 ? days + 'j ' + hours + 'h' : days + 'j';
}

export const MyOrdersView: React.FC<MyOrdersViewProps> = ({
  session,
  orderCollection,
  orders: rawOrders = [],
  isLoadingOrders,
  orderSyncError,
  onRefreshOrders,
  onConnectSSO,
  onExchangeCode,
  onDirectTokenInput,
  onLogout,
  onSelectTypeForArbitrage,
  hubs,
  config,
  orderBooks = {},
  historyCache = {},
  onChangeScope,
}) => {
  const orders = useMemo(() => {
    return orderCollection?.orders ?? rawOrders;
  }, [orderCollection, rawOrders]);

  const [filterTab, setFilterTab] = useState<'all' | 'buy' | 'sell' | 'outbid' | 'action_needed' | 'ageing_risk'>('all');
  const [selectedOrder, setSelectedOrder] = useState<EveCharacterOrder | null>(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Order Advisor State
  const [selectedRecommendation, setSelectedRecommendation] = useState<OrderAdvisorRecommendation | null>(null);
  const [isAdvisorModalOpen, setIsAdvisorModalOpen] = useState(false);

  // Reactive store trigger
  const [storeTick, setStoreTick] = useState(0);
  const [isSyncingOrderMarkets, setIsSyncingOrderMarkets] = useState(false);

  // Subscribe to MarketDataStore updates to instantly recalculate recommendations when Global Sync or item sync completes
  useEffect(() => {
    const unsub = MarketDataStore.subscribe(() => {
      setStoreTick((t) => t + 1);
    });
    return () => unsub();
  }, []);

  // Automatically synchronize market books across hubs for all items in character's active orders
  useEffect(() => {
    if (orders && orders.length > 0) {
      const typeIds = orders.map((o) => o.type_id);
      setIsSyncingOrderMarkets(true);
      MarketDataStore.syncCharacterOrdersMarketData(typeIds, hubs)
        .catch(() => {})
        .finally(() => setIsSyncingOrderMarkets(false));
    }
  }, [orders, hubs]);

  // Compile combined market orders from App state, MarketDataStore, and GlobalMarketSyncService cache
  const combinedMarketOrders = useMemo(() => {
    const storeOrders = MarketDataStore.getAllOrdersByRegion();
    const syncOrders = GlobalMarketSyncService.getLatestRegionalOrders();
    const result: Record<number, RawMarketOrder[]> = { ...orderBooks };

    const addOrders = (regionId: number, ordersList: RawMarketOrder[]) => {
      const current = result[regionId] ?? [];
      const byOrderId = new Map<string, RawMarketOrder>();
      for (const order of current) byOrderId.set(order.order_id, order);
      for (const order of ordersList) byOrderId.set(order.order_id, order);
      result[regionId] = Array.from(byOrderId.values());
    };

    for (const [regIdStr, ordersList] of Object.entries(storeOrders)) {
      addOrders(Number(regIdStr), ordersList);
    }

    for (const [regIdStr, ordersList] of Object.entries(syncOrders)) {
      addOrders(Number(regIdStr), ordersList);
    }
    return result;
  }, [orderBooks, storeTick]);

  const combinedHistoryStats = useMemo(() => {
    const syncHistory = GlobalMarketSyncService.getLatestRegionalHistory();
    return { ...historyCache, ...syncHistory };
  }, [historyCache, storeTick]);

  // Operations market context is derived from canonical MarketDataStore state.
  // A missing quality is UNKNOWN and never becomes a healthy empty market.
  const orderMarketContexts = useMemo(() => {
    const map = new Map<string, {
      health: import('../types').DataHealthStatus;
      quality: import('../types').MarketDataQuality | null;
      distance: ReturnType<typeof getOrderMarketDistance>;
      timing: ReturnType<typeof getOrderTiming>;
    }>();

    for (const order of orders) {
      const quality = MarketDataStore.getQuality(order.type_id, order.region_id);
      const regionalOrders = combinedMarketOrders[order.region_id] ?? [];
      map.set(order.order_id, {
        health: quality?.health_status ?? 'UNKNOWN',
        quality,
        distance: getOrderMarketDistance(order, regionalOrders),
        timing: getOrderTiming(order, Date.now()),
      });
    }
    return map;
  }, [orders, combinedMarketOrders, storeTick]);

  // Compute Order Advisor Recommendations for each active order
  const orderRecommendations = useMemo(() => {
    const map = new Map<string, OrderAdvisorRecommendation>();
    for (const order of orders) {
      const context = orderMarketContexts.get(order.order_id);
      if (!context || !FailureSemantics.isActionable(context.health)) continue;

      const rec = OrderAdvisorService.analyzeOrder(
        order,
        combinedMarketOrders,
        combinedHistoryStats,
        config
      );
      map.set(order.order_id, rec);
    }
    return map;
  }, [orders, combinedMarketOrders, combinedHistoryStats, config, orderMarketContexts]);

  const stats = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let escrowTotal = 0;
    let sellTotal = 0;
    let capitalLocked = 0;
    let outbidCount = 0;
    let actionNeededCount = 0;
    let ageingRiskCount = 0;

    for (const order of orders) {
      if (order.is_buy_order) {
        buyCount++;
        escrowTotal += order.escrow ?? order.price * order.volume_remain;
      } else {
        sellCount++;
        sellTotal += order.price * order.volume_remain;
      }

      capitalLocked += getOrderLockedValue(order);
      const context = orderMarketContexts.get(order.order_id);
      const distance = context?.distance?.distancePct;
      if (
        context &&
        context.health !== 'ERROR' &&
        context.health !== 'UNKNOWN' &&
        distance !== undefined &&
        (order.is_buy_order ? distance < 0 : distance > 0)
      ) {
        outbidCount++;
      }

      const rec = orderRecommendations.get(order.order_id);
      if (rec && rec.action !== 'keep') actionNeededCount++;
      if (context?.timing.isAgeingRisk) ageingRiskCount++;
    }

    return {
      total: orders.length,
      buyCount,
      sellCount,
      escrowTotal,
      sellTotal,
      capitalLocked,
      outbidCount,
      actionNeededCount,
      ageingRiskCount,
    };
  }, [orders, orderRecommendations, orderMarketContexts]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterTab === 'buy' && !o.is_buy_order) return false;
      if (filterTab === 'sell' && o.is_buy_order) return false;
      if (filterTab === 'outbid') {
        const context = orderMarketContexts.get(o.order_id);
        const distance = context?.distance?.distancePct;
        if (
          !context ||
          context.health === 'ERROR' ||
          context.health === 'UNKNOWN' ||
          distance === undefined ||
          (o.is_buy_order ? distance >= 0 : distance <= 0)
        ) return false;
      }
      if (filterTab === 'action_needed') {
        const rec = orderRecommendations.get(o.order_id);
        if (!rec || rec.action === 'keep') return false;
      }
      if (filterTab === 'ageing_risk' && !orderMarketContexts.get(o.order_id)?.timing.isAgeingRisk) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (o.type_name || `Type #${o.type_id}`).toLowerCase().includes(q);
        const matchesLoc = (o.location_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesLoc) return false;
      }

      return true;
    });
  }, [orders, filterTab, searchQuery, orderRecommendations, orderMarketContexts]);

  // Helper for rendering advice pill
  const renderAdvicePill = (rec: OrderAdvisorRecommendation | undefined) => {
    if (!rec) return null;

    switch (rec.action) {
      case 'lower_price':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRecommendation(rec);
              setIsAdvisorModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-all text-left"
            title="Cliquez pour afficher les calculs de rentabilité et copier le prix"
          >
            <TrendingDown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <div className="truncate">
              <div>Ajuster : {fmtIsk(rec.suggested_new_price || 0)}</div>
              {rec.estimated_profit_if_lowered !== undefined && (
                <div className="text-[9px] text-emerald-400 font-mono">
                  +{fmtIsk(rec.estimated_profit_if_lowered)} net préservé
                </div>
              )}
            </div>
          </button>
        );

      case 'relocate':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRecommendation(rec);
              setIsAdvisorModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all text-left"
            title="Cliquez pour voir la route et le gain net après transport"
          >
            <Truck className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <div className="truncate">
              <div>Déplacer ➔ {rec.suggested_relocate_hub?.hub_name}</div>
              {rec.suggested_relocate_hub?.estimated_extra_profit_isk !== undefined && (
                <div className="text-[9px] text-emerald-400 font-mono">
                  +{fmtIsk(rec.suggested_relocate_hub.estimated_extra_profit_isk)} gain net
                </div>
              )}
            </div>
          </button>
        );

      case 'cancel':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRecommendation(rec);
              setIsAdvisorModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-all text-left"
            title="Marché mort ou marge cassée - Cliquez pour voir l'analyse de coût d'opportunité"
          >
            <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <div className="truncate">
              <div>Annuler l'Ordre</div>
              <div className="text-[9px] text-red-300/80 font-mono">
                {rec.cancel_reason === 'dead_volume' ? 'Marché inactif' : 'Marge écrasée'}
              </div>
            </div>
          </button>
        );

      case 'keep':
      default:
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRecommendation(rec);
              setIsAdvisorModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-left"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <div>
              <div>Conserver</div>
              <div className="text-[9px] text-[#808495] font-mono">1er Vendeur</div>
            </div>
          </button>
        );
    }
  };

  // 1. Not connected view (Unified SSO Subsystem)
  if (!session) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0e1117] text-[#fafafa]">
        <div className="max-w-4xl mx-auto space-y-6">
          <SsoConnectCard
            onConnectSSO={onConnectSSO}
            onSessionReady={async (newSession) => {
              await onExchangeCode(newSession.access_token);
            }}
            title="Visualisez & Gérez vos Ordres Réels & Performances"
            subtitle="Connectez votre compte EVE Online pour synchroniser vos ordres actifs, analyser votre historique réel d'achats/ventes, obtenir un conseil d'arbitrage automatisé (Ajuster / Déplacer / Annuler) et calibrer les prédictions du scanner."
          />
        </div>
      </div>
    );
  }

  // 2. Connected Character Dashboard
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0e1117] text-[#fafafa] space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Session Expired / Auth Error Banner */}
        {session.is_token_expired && (
          <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-bold text-amber-300">
                  Session EVE SSO expirée (Jeton 401 Unauthorized)
                </div>
                <div className="text-xs text-[#808495] leading-relaxed">
                  Le jeton d'authentification CCP ESI a expiré et le renouvellement automatique nécessite une nouvelle autorisation.
                  Cliquez sur <strong className="text-[#fafafa]">Reconnecter</strong> ou utilisez la saisie manuelle pour synchroniser vos ordres.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 w-full md:w-auto">
              <button
                onClick={() => onConnectSSO(AuthService.getPreferredRedirectUri())}
                className="flex items-center justify-center gap-1.5 bg-[#ff4b4b] hover:bg-[#ff3333] text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-md transition-all w-full md:w-auto"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Reconnecter EVE SSO</span>
              </button>
            </div>
          </div>
        )}

        {/* Character Header Banner */}
        <div className="bg-[#161821] border border-[#262730] rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={session.portrait_url}
                alt={session.character_name}
                className={`w-16 h-16 rounded-xl border-2 ${session.is_token_expired ? 'border-amber-500/60' : 'border-[#ff4b4b]/40'} shadow-lg object-cover bg-[#0e1117]`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.evetech.net/characters/1/portrait?size=128';
                }}
              />
              <span className={`absolute -bottom-1 -right-1 w-4 h-4 ${session.is_token_expired ? 'bg-amber-500 animate-pulse' : 'bg-green-500'} border-2 border-[#161821] rounded-full`} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-[#fafafa] tracking-tight">
                  {session.character_name}
                </h2>
                {session.is_token_expired ? (
                  <span className="text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Session expirée (401)
                  </span>
                ) : (
                  <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-mono font-medium">
                    Connecté ESI
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-[#808495] flex-wrap">
                <span>ID Pilote : <strong className="text-[#fafafa]">{session.character_id}</strong></span>
                {session.accounting_skill !== undefined && (
                  <span>Accounting : <strong className="text-amber-400">Niv {session.accounting_skill}</strong></span>
                )}
                {session.broker_relations_skill !== undefined && (
                  <span>Broker Relations : <strong className="text-blue-400">Niv {session.broker_relations_skill}</strong></span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons & Performance Modal Trigger */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                if (orders && orders.length > 0) {
                  const typeIds = orders.map((o) => o.type_id);
                  setIsSyncingOrderMarkets(true);
                  MarketDataStore.refreshCharacterOrdersMarketData(typeIds, hubs)
                    .catch(() => {})
                    .finally(() => setIsSyncingOrderMarkets(false));
                }
              }}
              disabled={isSyncingOrderMarkets || orders.length === 0}
              className="flex items-center gap-1.5 bg-[#4d8dff]/15 hover:bg-[#4d8dff]/25 text-[#4d8dff] border border-[#4d8dff]/30 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
              title="Synchroniser les carnets de marché ESI des objets de tous vos ordres actifs"
            >
              <Globe className={`w-3.5 h-3.5 ${isSyncingOrderMarkets ? 'animate-spin' : ''}`} />
              <span>{isSyncingOrderMarkets ? 'Sync Marchés...' : 'Sync Marché des Ordres'}</span>
            </button>

            <button
              onClick={onRefreshOrders}
              disabled={isLoadingOrders}
              className="flex items-center gap-1.5 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] text-xs font-semibold px-3.5 py-2 rounded-lg border border-[#31333f] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
              <span>{isLoadingOrders ? 'Actualisation...' : 'Actualiser'}</span>
            </button>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold px-3 py-2 rounded-lg border border-red-500/20 transition-colors"
              title="Déconnecter la session ESI"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>

        {isLoadingOrders && orders.length === 0 && (
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-5 flex items-center gap-3 text-sm text-[#cfd3dc]">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            <div>
              <div className="font-semibold">Chargement des ordres actifs…</div>
              <div className="text-xs text-[#808495] mt-1">Le chargement reste distinct d’un carnet vide.</div>
            </div>
          </div>
        )}

        {orderSyncError && orders.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold">La dernière synchronisation des ordres a échoué.</div>
              <div className="text-amber-200/70 mt-0.5">Les ordres déjà connus restent visibles ; cela ne signifie pas qu’il n’y a aucun ordre.</div>
              <div className="font-mono text-[10px] mt-1 break-words">{orderSyncError}</div>
            </div>
          </div>
        )}

        {/* Phase 2 — Order Scope Selector */}
        {orderCollection && (
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-3 shadow-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#808495]">
              <Users className="w-4 h-4 text-purple-400" />
              <span>Portée des Ordres (Scope) :</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onChangeScope?.({ type: 'active_character' })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  orderCollection.scope.type === 'active_character'
                    ? 'bg-[#ff4b4b]/20 border-[#ff4b4b] text-[#ff4b4b] font-bold shadow-sm'
                    : 'bg-[#0e1117] border-[#262730] text-[#808495] hover:text-[#fafafa] hover:border-[#31333f]'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Personnage Actif ({session.character_name})</span>
              </button>

              {orderCollection.characters.length > 1 && (
                <button
                  onClick={() => onChangeScope?.({ type: 'fleet' })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    orderCollection.scope.type === 'fleet'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold shadow-sm'
                      : 'bg-[#0e1117] border-[#262730] text-[#808495] hover:text-purple-300 hover:border-purple-500/30'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Fleet Complète ({orderCollection.characters.length} pilotes)</span>
                </button>
              )}

              {orderCollection.corporations?.map((corp) => {
                const isSelected =
                  orderCollection.scope.type === 'corporation' &&
                  orderCollection.scope.corporationId === corp.corporationId;
                return (
                  <button
                    key={`corp-${corp.corporationId}`}
                    onClick={() =>
                      onChangeScope?.({ type: 'corporation', corporationId: corp.corporationId })
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-red-500/15 border-red-500 text-red-300 font-bold shadow-sm'
                        : 'bg-[#0e1117] border-[#262730] text-[#808495] hover:text-red-300 hover:border-red-500/30'
                    }`}
                    title="Afficher les ordres économiquement détenus par cette corporation"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    <span>{corp.corporationName || `Corporation #${corp.corporationId}`}</span>
                  </button>
                );
              })}

              {orderCollection.characters.map((char) => {
                const isSelected =
                  orderCollection.scope.type === 'character' &&
                  orderCollection.scope.characterId === char.characterId;
                return (
                  <button
                    key={char.characterId}
                    onClick={() =>
                      onChangeScope?.({ type: 'character', characterId: char.characterId })
                    }
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold shadow-sm'
                        : 'bg-[#0e1117] border-[#262730] text-[#808495] hover:text-blue-300 hover:border-blue-500/30'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span>{char.characterName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {orders.length === 0 && orderCollection?.corporations && orderCollection.corporations.length > 0 && (
          <div className="bg-[#161821] border border-red-900/50 rounded-xl px-4 py-3 text-xs text-[#cfd3dc]">
            <div className="font-semibold text-red-200">Aucun ordre dans la portée actuelle.</div>
            <div className="text-[#808495] mt-1">
              Des ordres économiquement détenus par une corporation sont disponibles dans cette session. Utilisez la portée corporation ci-dessus pour les consulter ; ils ne sont pas attribués artificiellement au personnage observateur.
            </div>
          </div>
        )}

        {/* Operations KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[
            { label: 'Liquidités', value: session.wallet_balance !== undefined ? fmtIsk(session.wallet_balance) : '—', note: 'ISK disponible', tone: 'text-amber-400' },
            { label: 'Escrow', value: fmtIsk(stats.escrowTotal), note: stats.buyCount + ' achats actifs', tone: 'text-blue-400' },
            { label: 'Ordres actifs', value: String(stats.total), note: stats.buyCount + ' achat · ' + stats.sellCount + ' vente', tone: 'text-[#fafafa]' },
            { label: 'Capital immobilisé', value: fmtIsk(stats.capitalLocked), note: 'escrow + exposition vente', tone: 'text-purple-300' },
            { label: 'Actions requises', value: String(stats.actionNeededCount), note: stats.actionNeededCount > 0 ? 'décisions à traiter' : 'aucune action identifiée', tone: 'text-orange-300' },
            { label: 'Risque d’expiration', value: String(stats.ageingRiskCount), note: '≤ 20% de durée restante', tone: 'text-red-300' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#161821] border border-[#262730] rounded-xl p-3.5 space-y-1.5 min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-[#808495] truncate">{kpi.label}</div>
              <div className={"text-lg font-bold font-mono truncate " + kpi.tone}>{kpi.value}</div>
              <div className="text-[10px] text-[#808495] leading-tight">{kpi.note}</div>
            </div>
          ))}
        </div>

        {/* Orders Table Container */}
        <div className="bg-[#161821] border border-[#262730] rounded-xl overflow-hidden shadow-xl">
          {/* Table Controls Header */}
          <div className="p-4 border-b border-[#262730] flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex flex-wrap items-center bg-[#0e1117] p-1 rounded-lg border border-[#262730] text-xs">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'all'
                    ? 'bg-[#262730] text-[#fafafa]'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                Tous ({orders.length})
              </button>
              <button
                onClick={() => setFilterTab('action_needed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'action_needed'
                    ? 'bg-purple-500/20 text-purple-300 font-bold'
                    : 'text-[#808495] hover:text-purple-300'
                }`}
              >
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>Conseils d'Action ({stats.actionNeededCount})</span>
              </button>
              <button
                onClick={() => setFilterTab('outbid')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'outbid'
                    ? 'bg-[#ff4b4b]/20 text-[#ff4b4b]'
                    : 'text-[#808495] hover:text-[#ff4b4b]'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                <span>Dépassés ({stats.outbidCount})</span>
              </button>
              <button
                onClick={() => setFilterTab('ageing_risk')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'ageing_risk' ? 'bg-red-500/15 text-red-300' : 'text-[#808495] hover:text-red-300'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Expiration ({stats.ageingRiskCount})</span>
              </button>
              <button
                onClick={() => setFilterTab('buy')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'buy'
                    ? 'bg-[#262730] text-blue-400'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                Achats ({stats.buyCount})
              </button>
              <button
                onClick={() => setFilterTab('sell')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'sell'
                    ? 'bg-[#262730] text-green-400'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                Ventes ({stats.sellCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#808495]" />
              <input
                type="text"
                placeholder="Filtrer par objet ou station..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] rounded-lg px-3 py-1.5 pl-8 text-xs focus:outline-none focus:border-[#ff4b4b]"
              />
            </div>
          </div>

          {/* Orders Table */}
          {isLoadingOrders && orders.length === 0 ? null : orderSyncError && orders.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <AlertCircle className="w-9 h-9 mx-auto text-red-300 opacity-80" />
              <p className="text-sm font-semibold text-red-200">Impossible de déterminer l’état actuel des ordres.</p>
              <p className="text-xs text-[#808495] max-w-xl mx-auto">La synchronisation ESI a échoué. L’absence de lignes n’est pas interprétée comme une absence d’ordres.</p>
              <div className="font-mono text-[10px] text-red-200/70 max-w-xl mx-auto break-words">{orderSyncError}</div>
              <button type="button" onClick={onRefreshOrders} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#262730] hover:bg-[#31333f] text-xs font-semibold">
                <RefreshCw className="w-3.5 h-3.5" /> Réessayer
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-[#808495] space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm font-medium">Aucun ordre ne correspond aux critères.</p>
              <p className="text-xs">{orders.length === 0 ? 'Aucun ordre actif n’est connu dans cette portée.' : 'Réduisez les filtres ou la recherche pour réafficher les ordres.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] text-left text-xs">
                <thead className="bg-[#0e1117] text-[#808495] uppercase font-semibold text-[10px] tracking-wider border-b border-[#262730]">
                  <tr>
                    <th className="py-3 px-4">Propriétaire</th>
                    <th className="py-3 px-3">Ordre</th>
                    <th className="py-3 px-3">Objet</th>
                    <th className="py-3 px-3">Lieu</th>
                    <th className="py-3 px-3">Prix</th>
                    <th className="py-3 px-3">Restant / fill</th>
                    <th className="py-3 px-3">Durée</th>
                    <th className="py-3 px-3">Immobilisé</th>
                    <th className="py-3 px-3">Marché</th>
                    <th className="py-3 px-3">Données</th>
                    <th className="py-3 px-4">Décision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262730]">
                  {filteredOrders.map((order) => {
                    const isBuy = order.is_buy_order;
                    const context = orderMarketContexts.get(order.order_id);
                    const recommendation = orderRecommendations.get(order.order_id);
                    const timing = context?.timing;
                    const quality = context?.quality;
                    const ownerType = order.ownership?.owner_type;
                    const ownerName = order.ownership?.owner_name || order.character_name || (ownerType === 'corporation' ? 'Corporation inconnue' : 'Propriétaire inconnu');
                    const location = order.location_name || UniverseRepository.getInstance().getStationNameSync(order.location_id);
                    const health = context?.health ?? 'UNKNOWN';
                    const healthTone = health === 'LIVE'
                      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                      : health === 'CACHE'
                        ? 'text-blue-300 bg-blue-500/10 border-blue-500/30'
                        : health === 'STALE'
                          ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                          : health === 'PARTIAL'
                            ? 'text-orange-300 bg-orange-500/10 border-orange-500/30'
                            : health === 'ERROR'
                              ? 'text-red-300 bg-red-500/10 border-red-500/30'
                              : 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30';

                    return (
                      <tr key={order.order_id} onClick={() => setSelectedOrder(order)} className="hover:bg-[#1a1d27] transition-colors cursor-pointer align-top">
                        <td className="py-3 px-4 max-w-[170px]">
                          <div className="font-semibold text-[#fafafa] truncate" title={ownerName}>{ownerName}</div>
                          <div className="text-[10px] text-[#808495]">{ownerType === 'corporation' ? 'Corporation' : 'Personnage'}</div>
                        </td>

                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${isBuy ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
                            {isBuy ? 'ACHAT' : 'VENTE'}
                          </span>
                          <div className="text-[10px] text-[#808495] mt-1">{timing ? (timing.remainingMs > 0 ? 'ACTIVE' : 'À EXPIRER') : 'ACTIVE'}</div>
                        </td>

                        <td className="py-3 px-3 min-w-[170px]">
                          <div className="flex items-center gap-2">
                            <img
                              src={`https://images.evetech.net/types/${order.type_id}/icon?size=32`}
                              alt=""
                              className="w-7 h-7 rounded bg-[#0e1117] border border-[#31333f] flex-shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-[#fafafa] truncate">{order.type_name || CatalogRepository.getInstance().getTypeName(order.type_id)}</div>
                              <div className="text-[10px] text-[#808495] font-mono">#{order.type_id}</div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 max-w-[170px]">
                          <div className="text-[#cfd3dc] truncate" title={location}>{location}</div>
                          <div className="text-[10px] text-[#808495] truncate" title={order.region_name || 'Région inconnue'}>{order.region_name || 'Région inconnue'}</div>
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-[#fafafa] whitespace-nowrap">{fmtIsk(order.price)}</td>

                        <td className="py-3 px-3 min-w-[130px]">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                            <span className="text-[#fafafa] font-bold">{fmtNumber(order.volume_remain)}</span>
                            <span className="text-emerald-300">{((1 - order.volume_remain / Math.max(1, order.volume_total)) * 100).toFixed(0)}% fill</span>
                          </div>
                          <div className="mt-1.5 h-1.5 bg-[#0e1117] rounded overflow-hidden">
                            <div className={`h-full ${isBuy ? 'bg-blue-400' : 'bg-emerald-400'}`} style={{ width: `${Math.round((1 - order.volume_remain / Math.max(1, order.volume_total)) * 100)}%` }} />
                          </div>
                          <div className="text-[9px] text-[#808495] mt-1">sur {fmtNumber(order.volume_total)}</div>
                        </td>

                        <td className="py-3 px-3 min-w-[120px]">
                          <div className={`font-mono font-semibold ${timing?.isAgeingRisk ? 'text-red-300' : 'text-[#cfd3dc]'}`}>
                            {timing ? (timing.remainingMs > 0 ? formatRemainingDuration(timing.remainingMs) : 'Expiré') : '—'}
                          </div>
                          <div className="text-[9px] text-[#808495]">âge {timing ? formatOrderAge(timing.ageMs) : '—'}</div>
                        </td>

                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          <div className="text-purple-200">{fmtIsk(getOrderLockedValue(order))}</div>
                          <div className="text-[9px] text-[#808495]">{isBuy ? 'escrow' : 'exposition vente'}</div>
                        </td>

                        <td className="py-3 px-3 min-w-[120px]">
                          {context?.distance?.distancePct !== undefined ? (
                            <>
                              <div className={`font-mono font-semibold ${isBuy ? (context.distance.distancePct >= 0 ? 'text-emerald-300' : 'text-red-300') : (context.distance.distancePct <= 0 ? 'text-emerald-300' : 'text-red-300')}`}>
                                {(context.distance.distancePct >= 0 ? '+' : '') + context.distance.distancePct.toFixed(2) + '%'}
                              </div>
                              <div className="text-[9px] text-[#808495]">vs meilleur {isBuy ? 'achat' : 'vente'}</div>
                            </>
                          ) : <span className="text-[#808495]">—</span>}
                        </td>

                        <td className="py-3 px-3 min-w-[120px]">
                          <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${healthTone}`}>{health}</span>
                          <div className="text-[9px] text-[#808495] font-mono mt-1">{quality ? formatOrderAge(quality.age_seconds * 1000) : '—'}</div>
                        </td>

                        <td className="py-3 px-4 min-w-[190px] max-w-[240px]">
                          {recommendation ? renderAdvicePill(recommendation) : (
                            <div className="space-y-1">
                              <div className={`text-[10px] font-semibold ${health === 'ERROR' ? 'text-red-300' : health === 'UNKNOWN' ? 'text-zinc-300' : 'text-amber-300'}`}>
                                {health === 'ERROR' || health === 'PARTIAL' || health === 'STALE' ? 'Décision indisponible' : health === 'UNKNOWN' ? 'Données insuffisantes' : 'Pas de recommandation'}
                              </div>
                              <div className="text-[9px] text-[#808495]">Ouvrir le détail pour le contexte.</div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order Advisor Strategy Breakdown Modal */}
      <OrderAdvisorModal
        isOpen={isAdvisorModalOpen}
        onClose={() => setIsAdvisorModalOpen(false)}
        recommendation={selectedRecommendation}
        onSelectTypeForArbitrage={onSelectTypeForArbitrage}
      />

      {selectedOrder && (() => {
        const context = orderMarketContexts.get(selectedOrder.order_id);
        return (
          <OrderOperationsDetail
            order={selectedOrder}
            recommendation={orderRecommendations.get(selectedOrder.order_id)}
            quality={context?.quality ?? null}
            marketOrders={combinedMarketOrders[selectedOrder.region_id] ?? []}
            history={combinedHistoryStats[selectedOrder.region_id] ?? null}
            onClose={() => setSelectedOrder(null)}
            onSelectTypeForArbitrage={onSelectTypeForArbitrage}
          />
        );
      })()}

    </div>
  );
};
