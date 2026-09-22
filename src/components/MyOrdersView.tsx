import React, { useState, useMemo, useEffect } from 'react';
import {
  EveCharacterSession,
  EveCharacterOrder,
  EveTypeDetail,
  MarketHub,
  FinancialConfig,
  RawMarketOrder,
  HistoricalStats,
  TraderPerformanceMetrics,
  OrderAdvisorRecommendation,
  OrderCollection,
  OrderScope,
  PerformanceScope,
  CharacterFinancialResult,
} from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import { FleetFinancialEngine } from '../engine/fleetFinancial';
import { EsiService } from '../services/esi';
import { AuthService } from '../services/authService';
import { TraderAnalyticsService } from '../services/traderAnalytics';
import { CharacterTransactionSyncService } from '../services/characterTransactionSyncService';
import { OrderAdvisorService } from '../services/orderAdvisor';
import { GlobalMarketSyncService } from '../services/globalMarketSync';
import { MarketDataStore } from '../services/marketDataStore';
import { IndexedDbStore } from '../services/indexedDbStore';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { OrderAdvisorModal } from './OrderAdvisorModal';
import { TraderPerformanceModal } from './TraderPerformanceModal';
import { SsoConnectCard } from './SsoConnectCard';
import {
  Shield,
  Coins,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  ShoppingBag,
  Tag,
  Search,
  Copy,
  Check,
  Zap,
  LogOut,
  Trophy,
  Truck,
  XCircle,
  Sparkles,
  Award,
  Clock,
  Percent,
  SlidersHorizontal,
  Globe,
  Users,
  User,
} from 'lucide-react';

interface MyOrdersViewProps {
  session: EveCharacterSession | null;
  orderCollection?: OrderCollection;
  orders?: EveCharacterOrder[];
  isLoadingOrders: boolean;
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

export const MyOrdersView: React.FC<MyOrdersViewProps> = ({
  session,
  orderCollection,
  orders: rawOrders = [],
  isLoadingOrders,
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

  const [filterTab, setFilterTab] = useState<'all' | 'buy' | 'sell' | 'outbid' | 'action_needed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Trader Performance & Analytics State
  const [traderMetrics, setTraderMetrics] = useState<TraderPerformanceMetrics | null>(null);
  const [fleetConsolidatedMetrics, setFleetConsolidatedMetrics] = useState<TraderPerformanceMetrics | null>(null);
  const [characterFinancialResults, setCharacterFinancialResults] = useState<CharacterFinancialResult[]>([]);
  const [performanceScope, setPerformanceScope] = useState<PerformanceScope>({ type: 'active_character' });
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);

  // Order Advisor State
  const [selectedRecommendation, setSelectedRecommendation] = useState<OrderAdvisorRecommendation | null>(null);
  const [isAdvisorModalOpen, setIsAdvisorModalOpen] = useState(false);

  // Load and compute Trader Performance Metrics for active and linked characters
  useEffect(() => {
    if (!session) {
      setTraderMetrics(null);
      setCharacterFinancialResults([]);
      return;
    }

    const allCharacters = AuthService.getLinkedCharacters();
    const targetList: EveCharacterSession[] = allCharacters.length > 0 ? allCharacters : [session];

    // Seed initial cached results
    const initialResults: CharacterFinancialResult[] = targetList.map((char: EveCharacterSession) => {
      const cached = TraderAnalyticsService.getCachedMetrics(char.character_id);
      if (cached) {
        return {
          characterId: String(char.character_id),
          characterName: char.character_name,
          metrics: cached,
          dataHealth: 'stale',
        };
      }
      return {
        characterId: String(char.character_id),
        characterName: char.character_name,
        metrics: {
          character_id: char.character_id,
          character_name: char.character_name,
          last_calculated: new Date().toISOString(),
          total_realized_profit: 0,
          total_buy_volume: 0,
          total_sell_volume: 0,
          total_turnover: 0,
          total_closed_trades: 0,
          profitable_trades: 0,
          unprofitable_trades: 0,
          win_rate_pct: 100,
          average_realized_roi: 0,
          average_hold_days: 0,
          total_broker_fees_paid: 0,
          total_sales_tax_paid: 0,
          top_profitable_items: [],
          recent_trade_cycles: [],
          activity_by_location: [],
          category_success_rate: {},
          trader_title: 'Synchronisation en cours...',
          trader_badge_color: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
          calibration_weight: 0,
          financial_completeness: 'ESTIMATED',
          is_net_estimated: true,
          realized_profit_label: 'Bénéfice Net Réalisé (Estimé)',
        },
        dataHealth: 'stale',
      };
    });

    setCharacterFinancialResults(initialResults);
    const activeCached = initialResults.find((r) => r.characterId === String(session.character_id));
    if (activeCached?.metrics) {
      setTraderMetrics(activeCached.metrics);
    }

    // Fetch fresh transactions and orders history from ESI per character
    const fetchAnalytics = async () => {
      setIsLoadingAnalytics(true);
      const updatedResults: CharacterFinancialResult[] = [];
      const allFleetTransactions: import('../types').EveCharacterTransaction[] = [];
      const characterSyncDetails: {
        character_id: number;
        character_name: string;
        accounting_level: number;
        broker_relations_level: number;
      }[] = [];

      for (const char of targetList) {
        try {
          const token = await AuthService.getFreshToken(char.character_id);
          if (!token) {
            throw new Error(`Jeton introuvable ou expiré pour ${char.character_name}`);
          }

          // Trigger deep pagination sync into IndexedDB in background (resilient against network hiccups)
          try {
            await CharacterTransactionSyncService.syncCharacterTransactions(char.character_id, {
              maxPages: 10,
              timeoutMs: 8000,
            });
          } catch (syncErr) {
            console.warn(`[MyOrdersView] Deep sync warning for ${char.character_name}:`, syncErr);
          }

          const [freshTxs, orderHistory, journal, storedPersisted] = await Promise.all([
            EsiService.fetchCharacterTransactions(char.character_id, token),
            EsiService.fetchCharacterOrderHistory(char.character_id, token, 1),
            EsiService.fetchCharacterJournal(char.character_id, token),
            IndexedDbStore.getCharacterTransactions(char.character_id).catch(() => []),
          ]);

          // Combine stored and fresh transactions by transaction_id to preserve historical FIFO depth
          const txMap = new Map<number, import('../types').EveCharacterTransaction>();
          for (const p of storedPersisted) {
            txMap.set(p.transaction_id, {
              transaction_id: p.transaction_id,
              character_id: p.character_id ?? char.character_id,
              character_name: (p as any).character_name ?? char.character_name,
              date: p.timestamp,
              type_id: p.type_id,
              location_id: p.location_id,
              unit_price: p.unit_price,
              quantity: p.quantity,
              is_buy: p.is_buy,
              is_personal: p.is_personal ?? true,
              client_id: p.client_id ?? 0,
              journal_ref_id: p.journal_ref_id,
              location_name: p.location_name,
            });
          }
          for (const f of freshTxs) {
            txMap.set(f.transaction_id, {
              ...f,
              character_id: f.character_id ?? char.character_id,
              character_name: f.character_name ?? char.character_name,
            });
          }

          const combinedTxs = Array.from(txMap.values()).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );

          allFleetTransactions.push(...combinedTxs);
          characterSyncDetails.push({
            character_id: char.character_id,
            character_name: char.character_name,
            accounting_level: char.accounting_skill || 4,
            broker_relations_level: char.broker_relations_skill || 4,
          });

          const computed = TraderAnalyticsService.processTransactions(
            char.character_id,
            char.character_name,
            combinedTxs,
            orderHistory,
            journal,
            char.accounting_skill || 4,
            char.broker_relations_skill || 4
          );

          updatedResults.push({
            characterId: String(char.character_id),
            characterName: char.character_name,
            metrics: computed,
            dataHealth: 'fresh',
          });

          if (char.character_id === session.character_id) {
            setTraderMetrics(computed);
          }
        } catch (err: any) {
          console.warn(`[MyOrdersView] Failed to compute analytics for ${char.character_name}:`, err);
          const cached = TraderAnalyticsService.getCachedMetrics(char.character_id);
          if (cached) {
            updatedResults.push({
              characterId: String(char.character_id),
              characterName: char.character_name,
              metrics: cached,
              dataHealth: 'stale',
              errorMessage: err?.message || 'ESI fetch failed, using cached metrics',
            });
          } else {
            updatedResults.push({
              characterId: String(char.character_id),
              characterName: char.character_name,
              metrics: {
                character_id: char.character_id,
                character_name: char.character_name,
                last_calculated: new Date().toISOString(),
                total_realized_profit: 0,
                total_buy_volume: 0,
                total_sell_volume: 0,
                total_turnover: 0,
                total_closed_trades: 0,
                profitable_trades: 0,
                unprofitable_trades: 0,
                win_rate_pct: 100,
                average_realized_roi: 0,
                average_hold_days: 0,
                total_broker_fees_paid: 0,
                total_sales_tax_paid: 0,
                top_profitable_items: [],
                recent_trade_cycles: [],
                activity_by_location: [],
                category_success_rate: {},
                trader_title: 'Indisponible',
                trader_badge_color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
                calibration_weight: 0,
                financial_completeness: 'UNAVAILABLE',
                is_net_estimated: true,
                realized_profit_label: 'Profit Réalisé (Hors Frais)',
              },
              dataHealth: 'unavailable',
              errorMessage: err?.message || 'Authentification ESI expirée ou erreur réseau',
            });
          }
        }
      }

      // Calculate consolidated multi-character fleet metrics to resolve cross-character trades
      if (allFleetTransactions.length > 0 && characterSyncDetails.length > 0) {
        try {
          const fleetConsolidated = TraderAnalyticsService.processFleetConsolidatedTransactions(
            characterSyncDetails,
            allFleetTransactions
          );
          setFleetConsolidatedMetrics(fleetConsolidated);
        } catch (fleetErr) {
          console.warn('[MyOrdersView] Consolidated fleet analytics computation error:', fleetErr);
        }
      }

      setCharacterFinancialResults(updatedResults);
      setIsLoadingAnalytics(false);
    };

    fetchAnalytics();
  }, [session, session?.character_id]);

  // Derive active display metrics using FleetFinancialEngine
  const displayMetrics = useMemo(() => {
    if (!session) return traderMetrics;
    const selected = FleetFinancialEngine.selectPerformanceByScope(
      characterFinancialResults,
      performanceScope,
      String(session.character_id),
      { consolidatedFleetMetrics: fleetConsolidatedMetrics || undefined }
    );
    return selected.selectedMetrics || traderMetrics;
  }, [characterFinancialResults, performanceScope, session, traderMetrics, fleetConsolidatedMetrics]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

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

    for (const [regIdStr, ordersList] of Object.entries(storeOrders)) {
      const regId = Number(regIdStr);
      if (!result[regId]) result[regId] = [];
      result[regId] = [...result[regId], ...ordersList];
    }

    for (const [regIdStr, ordersList] of Object.entries(syncOrders)) {
      const regId = Number(regIdStr);
      if (!result[regId]) result[regId] = [];
      result[regId] = [...result[regId], ...ordersList];
    }
    return result;
  }, [orderBooks, storeTick]);

  const combinedHistoryStats = useMemo(() => {
    const syncHistory = GlobalMarketSyncService.getLatestRegionalHistory();
    return { ...historyCache, ...syncHistory };
  }, [historyCache, storeTick]);

  // Compute Order Advisor Recommendations for each active order
  const orderRecommendations = useMemo(() => {
    const map = new Map<string, OrderAdvisorRecommendation>();
    for (const order of orders) {
      const rec = OrderAdvisorService.analyzeOrder(
        order,
        combinedMarketOrders,
        combinedHistoryStats,
        config
      );
      map.set(order.order_id, rec);
    }
    return map;
  }, [orders, combinedMarketOrders, combinedHistoryStats, config]);

  // Stats calculation
  const stats = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let escrowTotal = 0;
    let sellTotal = 0;
    let outbidCount = 0;
    let actionNeededCount = 0;

    for (const o of orders) {
      if (o.is_buy_order) {
        buyCount++;
        escrowTotal += (o.escrow || 0) || (o.price * o.volume_remain);
      } else {
        sellCount++;
        sellTotal += o.price * o.volume_remain;
      }
      if (o.market_competition?.is_outbid) {
        outbidCount++;
      }
      const rec = orderRecommendations.get(o.order_id);
      if (rec && rec.action !== 'keep') {
        actionNeededCount++;
      }
    }

    return {
      total: orders.length,
      buyCount,
      sellCount,
      escrowTotal,
      sellTotal,
      outbidCount,
      actionNeededCount,
    };
  }, [orders, orderRecommendations]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterTab === 'buy' && !o.is_buy_order) return false;
      if (filterTab === 'sell' && o.is_buy_order) return false;
      if (filterTab === 'outbid' && !o.market_competition?.is_outbid) return false;
      if (filterTab === 'action_needed') {
        const rec = orderRecommendations.get(o.order_id);
        if (!rec || rec.action === 'keep') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (o.type_name || `Type #${o.type_id}`).toLowerCase().includes(q);
        const matchesLoc = (o.location_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesLoc) return false;
      }

      return true;
    });
  }, [orders, filterTab, searchQuery, orderRecommendations]);

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
                {traderMetrics && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${traderMetrics.trader_badge_color}`}>
                    {traderMetrics.trader_title}
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
            {displayMetrics && (
              <button
                onClick={() => setIsMetricsModalOpen(true)}
                className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold px-3.5 py-2 rounded-lg transition-all shadow-sm"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Performances &amp; Historique Réel</span>
                {displayMetrics.financial_completeness && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0e1117]/80 text-amber-300 border border-amber-500/30">
                    {displayMetrics.financial_completeness}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => {
                if (orders && orders.length > 0) {
                  const typeIds = orders.map((o) => o.type_id);
                  setIsSyncingOrderMarkets(true);
                  MarketDataStore.syncCharacterOrdersMarketData(typeIds, hubs)
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
              disabled={isLoadingOrders || isLoadingAnalytics}
              className="flex items-center gap-1.5 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] text-xs font-semibold px-3.5 py-2 rounded-lg border border-[#31333f] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders || isLoadingAnalytics ? 'animate-spin' : ''}`} />
              <span>{isLoadingOrders || isLoadingAnalytics ? 'Actualisation...' : 'Actualiser'}</span>
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

        {/* Real Trader Historical Performance Card - Hidden to avoid redundancy with the dedicated modal triggered by the header button */}
        {traderMetrics && (
          <div className="hidden bg-gradient-to-r from-[#161821] via-[#1a1d2e] to-[#161821] border border-amber-500/30 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#262730] pb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm text-[#fafafa] flex items-center gap-2">
                    Historique Réel &amp; Performances Financières de Trader
                    <span className="text-[11px] font-normal text-amber-300/80">
                      (Calibre le moteur de prédiction)
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#808495]">
                    Basé sur {traderMetrics.total_closed_trades} cycles d'achat/vente clôturés sur votre compte ESI Tranquility
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMetricsModalOpen(true)}
                className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1"
              >
                <span>Détail complet des cycles &amp; objets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0e1117] p-3 rounded-lg border border-emerald-500/20">
                <div className="text-[11px] text-[#808495]">
                  {traderMetrics.realized_profit_label ||
                    (traderMetrics.financial_completeness === 'UNAVAILABLE'
                      ? 'Profit Réalisé (Hors Frais)'
                      : 'Bénéfice Net Réalisé Total')}
                </div>
                <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                  +{fmtIsk(traderMetrics.total_realized_profit)}
                </div>
              </div>

              <div className="bg-[#0e1117] p-3 rounded-lg border border-blue-500/20">
                <div className="text-[11px] text-[#808495]">Taux de Réussite (Win Rate)</div>
                <div className="text-base font-bold font-mono text-blue-400 mt-0.5">
                  {traderMetrics.win_rate_pct.toFixed(1)}% ({traderMetrics.profitable_trades}/{traderMetrics.total_closed_trades})
                </div>
              </div>

              <div className="bg-[#0e1117] p-3 rounded-lg border border-purple-500/20">
                <div className="text-[11px] text-[#808495]">ROI Moyen Réalisé</div>
                <div className="text-base font-bold font-mono text-purple-300 mt-0.5">
                  +{(traderMetrics.average_realized_roi * 100).toFixed(1)}%
                </div>
              </div>

              <div className="bg-[#0e1117] p-3 rounded-lg border border-amber-500/20">
                <div className="text-[11px] text-[#808495]">Rotation Moyenne des Stocks</div>
                <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
                  ~{traderMetrics.average_hold_days.toFixed(1)} jours
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Solde Portefeuille ISK</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {session.wallet_balance !== undefined ? fmtIsk(session.wallet_balance) : '---'}
            </div>
            <div className="text-[11px] text-[#808495]">Liquidités directes disponibles</div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Fonds en Séquestre (Escrow)</span>
              <ShoppingBag className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">
              {fmtIsk(stats.escrowTotal)}
            </div>
            <div className="text-[11px] text-[#808495]">
              {stats.buyCount} ordres d'achat actifs
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Marchandises en Vente</span>
              <Tag className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-xl font-bold font-mono text-green-400">
              {fmtIsk(stats.sellTotal)}
            </div>
            <div className="text-[11px] text-[#808495]">
              {stats.sellCount} ordres de vente actifs
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Conseils d'Action Requis</span>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-bold font-mono text-purple-300">
              {stats.actionNeededCount} / {stats.total}
            </div>
            <div className="text-[11px] text-[#808495]">
              {stats.actionNeededCount > 0 ? 'Ajustements ou déplacements rentables' : 'Aucune action urgente requise'}
            </div>
          </div>
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
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-[#808495] space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto opacity-40 text-[#808495]" />
              <p className="text-sm font-medium">Aucun ordre ne correspond aux critères.</p>
              <p className="text-xs">
                {orders.length === 0
                  ? "Vous n'avez aucun ordre actif sur Tranquility pour le moment."
                  : 'Essayez de réinitialiser vos filtres ou termes de recherche.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0e1117] text-[#808495] uppercase font-semibold text-[10px] tracking-wider border-b border-[#262730]">
                  <tr>
                    <th className="py-3 px-4">Objet</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Prix Actuel</th>
                    <th className="py-3 px-3">Conseil Stratégique d'Ordre</th>
                    <th className="py-3 px-3">Volume Restant</th>
                    <th className="py-3 px-3">Valeur Totale</th>
                    <th className="py-3 px-3">Emplacement</th>
                    <th className="py-3 px-4 text-right">Action Arbitrage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262730]">
                  {filteredOrders.map((order) => {
                    const isBuy = order.is_buy_order;
                    const totalVal = order.price * order.volume_remain;
                    const volPct = Math.round((order.volume_remain / Math.max(1, order.volume_total)) * 100);
                    const recommendation = orderRecommendations.get(order.order_id);

                    return (
                      <tr key={order.order_id} className="hover:bg-[#1a1d27] transition-colors">
                        {/* Type Icon & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={`https://images.evetech.net/types/${order.type_id}/icon?size=32`}
                              alt=""
                              className="w-7 h-7 rounded bg-[#0e1117] border border-[#31333f] flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <div>
                              <div className="font-bold text-[#fafafa]">
                                {order.type_name || CatalogRepository.getInstance().getTypeName(order.type_id)}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-[#808495] font-mono">
                                <span>ID: {order.type_id}</span>
                                {order.character_name &&
                                  (orderCollection?.scope.type === 'fleet' ||
                                    (orderCollection?.characters?.length ?? 0) > 1) && (
                                    <span className="text-purple-300 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20 font-sans font-medium">
                                      {order.character_name}
                                    </span>
                                  )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Order Type Badge */}
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              isBuy
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : 'bg-green-500/15 text-green-400 border border-green-500/30'
                            }`}
                          >
                            {isBuy ? 'ACHAT' : 'VENTE'}
                          </span>
                        </td>

                        {/* Order Price */}
                        <td className="py-3 px-3 font-mono font-bold text-[#fafafa]">
                          {fmtIsk(order.price)}
                        </td>

                        {/* Strategic Order Advisor Pill */}
                        <td className="py-3 px-3">
                          {renderAdvicePill(recommendation)}
                        </td>

                        {/* Volume Remaining Progress */}
                        <td className="py-3 px-3">
                          <div className="space-y-1 w-28">
                            <div className="flex justify-between text-[10px] font-mono text-[#808495]">
                              <span className="text-[#fafafa] font-bold">{fmtNumber(order.volume_remain)}</span>
                              <span>/ {fmtNumber(order.volume_total)}</span>
                            </div>
                            <div className="w-full bg-[#0e1117] h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${isBuy ? 'bg-blue-400' : 'bg-green-400'}`}
                                style={{ width: `${volPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Total ISK Value */}
                        <td className="py-3 px-3 font-mono text-[#fafafa]">
                          {fmtIsk(totalVal)}
                        </td>

                        {/* Location */}
                        <td className="py-3 px-3 text-[#808495] max-w-xs truncate text-[11px]" title={order.location_name || UniverseRepository.getInstance().getStationNameSync(order.location_id)}>
                          {order.location_name || UniverseRepository.getInstance().getStationNameSync(order.location_id)}
                        </td>

                        {/* Scan Arbitrage for this item */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => onSelectTypeForArbitrage(order.type_id)}
                            className="inline-flex items-center gap-1 bg-[#262730] hover:bg-[#ff4b4b] hover:text-white text-[#fafafa] px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors"
                            title="Lancer le scanner d'arbitrage inter-régional sur cet objet"
                          >
                            <span>Arbitrage</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
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

      {/* Trader Real Performance & Historical Cycles Modal */}
      <TraderPerformanceModal
        isOpen={isMetricsModalOpen}
        onClose={() => setIsMetricsModalOpen(false)}
        metrics={displayMetrics}
        onSelectTypeForArbitrage={onSelectTypeForArbitrage}
        characterResults={characterFinancialResults}
        activeCharacterId={session ? String(session.character_id) : ''}
        scope={performanceScope}
        onChangeScope={setPerformanceScope}
        consolidatedFleetMetrics={fleetConsolidatedMetrics}
      />
    </div>
  );
};
