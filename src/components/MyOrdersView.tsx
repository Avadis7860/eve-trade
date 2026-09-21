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
} from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import { EsiService } from '../services/esi';
import { TraderAnalyticsService } from '../services/traderAnalytics';
import { OrderAdvisorService } from '../services/orderAdvisor';
import { GlobalMarketSyncService } from '../services/globalMarketSync';
import { MarketDataStore } from '../services/marketDataStore';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { OrderAdvisorModal } from './OrderAdvisorModal';
import { TraderPerformanceModal } from './TraderPerformanceModal';
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
} from 'lucide-react';

interface MyOrdersViewProps {
  session: EveCharacterSession | null;
  orders: EveCharacterOrder[];
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
}

export const MyOrdersView: React.FC<MyOrdersViewProps> = ({
  session,
  orders,
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
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'buy' | 'sell' | 'outbid' | 'action_needed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Trader Performance & Analytics State
  const [traderMetrics, setTraderMetrics] = useState<TraderPerformanceMetrics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);

  // Order Advisor State
  const [selectedRecommendation, setSelectedRecommendation] = useState<OrderAdvisorRecommendation | null>(null);
  const [isAdvisorModalOpen, setIsAdvisorModalOpen] = useState(false);

  // Manual code/token accordion
  const [manualCode, setManualCode] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualCharId, setManualCharId] = useState('');
  const [manualCharName, setManualCharName] = useState('');
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [selectedRedirectMode, setSelectedRedirectMode] = useState<string>('localhost8000');
  const [customRedirectUri, setCustomRedirectUri] = useState<string>('');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const cloudRunCallback = `${currentOrigin}/auth/callback`;
  const localhost8000Callback = 'http://localhost:8000/callback';
  const localhost3000Callback = 'http://localhost:3000/auth/callback';

  const activeRedirectUri =
    selectedRedirectMode === 'localhost8000'
      ? localhost8000Callback
      : selectedRedirectMode === 'cloudrun'
      ? cloudRunCallback
      : selectedRedirectMode === 'localhost3000'
      ? localhost3000Callback
      : customRedirectUri.trim() || localhost8000Callback;

  const [manualRedirectUri, setManualRedirectUri] = useState(activeRedirectUri);

  useEffect(() => {
    setManualRedirectUri(activeRedirectUri);
  }, [activeRedirectUri]);

  // Load and compute Trader Performance Metrics when character session changes
  useEffect(() => {
    if (!session) {
      setTraderMetrics(null);
      return;
    }

    // Check localStorage cache first
    const cached = TraderAnalyticsService.getCachedMetrics(session.character_id);
    if (cached) {
      setTraderMetrics(cached);
    }

    // Fetch fresh transactions and orders history from ESI
    const fetchAnalytics = async () => {
      setIsLoadingAnalytics(true);
      try {
        const [txs, orderHistory, journal] = await Promise.all([
          EsiService.fetchCharacterTransactions(session.character_id, session.access_token),
          EsiService.fetchCharacterOrderHistory(session.character_id, session.access_token, 1),
          EsiService.fetchCharacterJournal(session.character_id, session.access_token),
        ]);

        const computed = TraderAnalyticsService.processTransactions(
          session.character_id,
          session.character_name,
          txs,
          orderHistory,
          journal,
          session.accounting_skill || 4,
          session.broker_relations_skill || 4
        );

        setTraderMetrics(computed);
      } catch (err) {
        console.warn('Failed to compute trader analytics:', err);
      } finally {
        setIsLoadingAnalytics(false);
      }
    };

    fetchAnalytics();
  }, [session, session?.character_id]);

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
    const map = new Map<number, OrderAdvisorRecommendation>();
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

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let codeToUse = manualCode.trim();
    let redirectUriToUse = manualRedirectUri.trim();

    if (!codeToUse) return;

    if (codeToUse.includes('code=') || codeToUse.startsWith('http')) {
      try {
        const urlObj = new URL(codeToUse);
        const extracted = urlObj.searchParams.get('code');
        if (extracted) {
          codeToUse = extracted;
          redirectUriToUse = `${urlObj.origin}${urlObj.pathname}`;
          setManualRedirectUri(redirectUriToUse);
        }
      } catch {
        const match = codeToUse.match(/code=([^&]+)/);
        if (match) codeToUse = decodeURIComponent(match[1]);
      }
    }

    setIsSubmittingCode(true);
    setManualError(null);
    try {
      await onExchangeCode(codeToUse, redirectUriToUse);
      setManualCode('');
    } catch (err: unknown) {
      setManualError(String(err));
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const handleDirectTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim() || !manualCharId.trim()) return;
    onDirectTokenInput(
      manualToken.trim(),
      Number(manualCharId.trim()),
      manualCharName.trim() || `Pilote #${manualCharId.trim()}`
    );
  };

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

  // 1. Not connected view
  if (!session) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-[#0e1117] text-[#fafafa]">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute -right-12 -top-12 w-64 h-64 bg-[#ff4b4b]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-[#262730]">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#ff4b4b]/15 text-[#ff4b4b] border border-[#ff4b4b]/30 text-xs font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  EVE Online Single Sign-On v2
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-[#fafafa]">
                  Visualisez &amp; Gérez vos Ordres Réels &amp; Performances
                </h2>
                <p className="text-sm text-[#808495] max-w-2xl leading-relaxed">
                  Connectez votre compte EVE Online pour synchroniser vos ordres actifs, analyser votre historique réel d'achats/ventes,
                  obtenir un conseil d'arbitrage automatisé (Ajuster / Déplacer / Annuler) et calibrer les prédictions du scanner.
                </p>
              </div>

              <div className="flex-shrink-0 w-full md:w-auto">
                <button
                  onClick={() => onConnectSSO(activeRedirectUri)}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold px-6 py-3.5 rounded-lg shadow-lg hover:shadow-[#ff4b4b]/20 transition-all text-sm"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>Se connecter avec EVE SSO</span>
                </button>
              </div>
            </div>

            {/* Application Configuration Info */}
            <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730] space-y-3">
                <div className="flex items-center justify-between text-xs text-[#808495]">
                  <span className="font-semibold uppercase tracking-wider">Identifiants OAuth Configurés</span>
                  <span className="text-green-400 flex items-center gap-1 font-mono">
                    <Check className="w-3 h-3" /> Client Prêt
                  </span>
                </div>
                <div className="text-xs space-y-1 font-mono text-[#808495]">
                  <div className="flex justify-between">
                    <span>Client ID :</span>
                    <span className="text-[#fafafa]">790ee291...3b538</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scopes :</span>
                    <span className="text-[#fafafa]">orders, transactions, wallet</span>
                  </div>
                </div>
              </div>

              {/* Callback URL Selector & Copier */}
              <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730] space-y-3">
                <div className="flex items-center justify-between text-xs text-[#808495]">
                  <span className="font-semibold uppercase tracking-wider">URL de Callback (Redirection EVE SSO)</span>
                  <span className="text-amber-400 text-[11px] font-mono">developers.eveonline.com</span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer bg-[#161821] p-2 rounded border border-[#262730] hover:border-[#31333f]">
                      <input
                        type="radio"
                        name="redirectMode"
                        checked={selectedRedirectMode === 'localhost8000'}
                        onChange={() => setSelectedRedirectMode('localhost8000')}
                        className="text-[#ff4b4b]"
                      />
                      <span className={selectedRedirectMode === 'localhost8000' ? 'text-[#fafafa] font-semibold' : 'text-[#808495]'}>
                        Localhost (8000)
                      </span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-[#161821] p-2 rounded border border-[#262730] hover:border-[#31333f]">
                      <input
                        type="radio"
                        name="redirectMode"
                        checked={selectedRedirectMode === 'localhost3000'}
                        onChange={() => setSelectedRedirectMode('localhost3000')}
                        className="text-[#ff4b4b]"
                      />
                      <span className={selectedRedirectMode === 'localhost3000' ? 'text-[#fafafa] font-semibold' : 'text-[#808495]'}>
                        Localhost (3000)
                      </span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-[#161821] p-2 rounded border border-[#262730] hover:border-[#31333f]">
                      <input
                        type="radio"
                        name="redirectMode"
                        checked={selectedRedirectMode === 'cloudrun'}
                        onChange={() => setSelectedRedirectMode('cloudrun')}
                        className="text-[#ff4b4b]"
                      />
                      <span className={selectedRedirectMode === 'cloudrun' ? 'text-[#fafafa] font-semibold' : 'text-[#808495]'}>
                        Cloud Run Preview
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 bg-[#161821] p-2 rounded border border-[#31333f]">
                    <code className="text-[11px] text-[#00ff88] truncate flex-1 font-mono">
                      {activeRedirectUri}
                    </code>
                    <button
                      onClick={() => copyToClipboard(activeRedirectUri)}
                      className="text-xs bg-[#262730] hover:bg-[#31333f] text-[#fafafa] px-2.5 py-1 rounded flex items-center gap-1 flex-shrink-0"
                    >
                      {copiedUrl === activeRedirectUri ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual OAuth Exchange Form */}
            <form onSubmit={handleManualCodeSubmit} className="pt-6 border-t border-[#262730] mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#808495] uppercase tracking-wider">
                  Validation Manuelle du Code OAuth
                </span>
                <span className="text-[11px] text-[#808495]">
                  Collez l'URL de redirection ou le code retourné par CCP
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://localhost:8000/callback?code=..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="flex-1 bg-[#0e1117] border border-[#262730] text-[#fafafa] p-2 rounded text-xs font-mono focus:outline-none focus:border-[#ff4b4b]"
                />
                <button
                  type="submit"
                  disabled={isSubmittingCode || !manualCode.trim()}
                  className="flex items-center gap-1.5 bg-[#ff4b4b] hover:bg-[#ff3333] text-white text-xs font-bold px-5 py-2 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSubmittingCode ? 'animate-spin' : ''}`} />
                  <span>Valider &amp; Synchroniser</span>
                </button>
              </div>
              {manualError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded">
                  <div className="font-semibold">Échec de validation :</div>
                  <div className="font-mono mt-1 text-[11px]">{manualError}</div>
                </div>
              )}
            </form>
          </div>
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
                onClick={() => onConnectSSO(activeRedirectUri)}
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
            {traderMetrics && (
              <button
                onClick={() => setIsMetricsModalOpen(true)}
                className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold px-3.5 py-2 rounded-lg transition-all shadow-sm"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Performances &amp; Historique Réel</span>
                {traderMetrics.financial_completeness && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0e1117]/80 text-amber-300 border border-amber-500/30">
                    {traderMetrics.financial_completeness}
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
                              <div className="text-[10px] text-[#808495] font-mono">
                                ID: {order.type_id}
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
        metrics={traderMetrics}
        onSelectTypeForArbitrage={onSelectTypeForArbitrage}
      />
    </div>
  );
};
