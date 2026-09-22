import React, { useState, useMemo, useEffect } from 'react';
import { GlobalMarketSyncService } from '../services/globalMarketSync';
import {
  UniverseWideOpportunity,
  MarketHub,
  FinancialConfig,
  TradeStrategy,
} from '../types';
import { InterRegionalFinancialEngine } from '../engine/interRegional';
import {
  Globe,
  Filter,
  ArrowUpDown,
  Search,
  Sparkles,
  TrendingUp,
  Coins,
  ShieldAlert,
  ShieldCheck,
  Zap,
  RefreshCw,
  ExternalLink,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  Package,
  Info,
} from 'lucide-react';

interface GlobalScannerViewProps {
  hubs: MarketHub[];
  config: FinancialConfig;
  strategy: TradeStrategy;
  onOpenGlobalSyncModal: () => void;
  onSelectOpportunityForCockpit: (opp: UniverseWideOpportunity) => void;
}

export const GlobalScannerView: React.FC<GlobalScannerViewProps> = ({
  hubs,
  config,
  strategy,
  onOpenGlobalSyncModal,
  onSelectOpportunityForCockpit,
}) => {
  const [opportunities, setOpportunities] = useState<UniverseWideOpportunity[]>(() => {
    const mem = GlobalMarketSyncService.getUniverseOpportunities();
    if (mem.length > 0) return mem;
    try {
      const saved = localStorage.getItem('eve_universe_opportunities');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cargoFilter, setCargoFilter] = useState<'all' | '1000' | '5000' | '12000' | '35000' | '60000' | 'freighter'>('all');
  const [minProfitFilter, setMinProfitFilter] = useState<number>(0); // Default 0 to show all discovered opportunities
  const [minRoiFilter, setMinRoiFilter] = useState<number>(0); // Default 0 to show all positive ROIs
  const [maxJumpsFilter, setMaxJumpsFilter] = useState<number>(50); // Default 50 to cover all routes
  const [highSecOnly, setHighSecOnly] = useState<boolean>(false); // Default false to show all discovered routes
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'roi' | 'turnover' | 'capital' | 'cargo'>('score');

  useEffect(() => {
    // 1. If memory has opportunities, set them
    const mem = GlobalMarketSyncService.getUniverseOpportunities();
    if (mem.length > 0) {
      setOpportunities(mem);
    } else {
      // Hydrate asynchronously from IndexedDB / Storage
      GlobalMarketSyncService.initFromStorage().then((stored) => {
        if (stored && stored.length > 0) {
          setOpportunities(stored);
        }
      });
    }

    // 2. Subscribe to live stream
    const unsub = GlobalMarketSyncService.subscribeOpportunities((opps) => {
      setOpportunities(opps);
    });
    return () => unsub();
  }, []);

  const handleResetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setCargoFilter('all');
    setMinProfitFilter(0);
    setMinRoiFilter(0);
    setMaxJumpsFilter(50);
    setHighSecOnly(false);
    setSortBy('score');
  };

  const isFiltered = Boolean(
    searchQuery.trim() ||
    categoryFilter !== 'all' ||
    cargoFilter !== 'all' ||
    minProfitFilter > 0 ||
    minRoiFilter > 0 ||
    maxJumpsFilter < 50 ||
    highSecOnly
  );

  // Synchronize all opportunities in real-time with current FinancialConfig (including max_cargo_m3, available_capital, broker fees, taxes, transport costs)
  const liveOpportunities = useMemo(() => {
    return opportunities.map((opp) => {
      try {
        return InterRegionalFinancialEngine.recalculateOpportunityWithConfig(opp, config);
      } catch {
        return opp;
      }
    });
  }, [opportunities, config]);

  const filteredOpportunities = useMemo(() => {
    return liveOpportunities
      .filter((opp) => {
        if (!opp) return false;

        // High Sec filter
        if (highSecOnly && opp.route && !opp.route.is_highsec_only) return false;

        // Jumps filter
        if (opp.route && opp.route.jumps > maxJumpsFilter) return false;

        // Profit filter
        const profit = opp.costs?.net_profit ?? 0;
        if (profit < minProfitFilter) return false;

        // ROI filter
        const roi = opp.costs?.roi ?? 0;
        if (roi < minRoiFilter) return false;

        // Cargo volume filter
        const cargoVol = opp.total_cargo_volume ?? 0;
        if (cargoFilter === '1000' && cargoVol > 1000) return false;
        if (cargoFilter === '5000' && cargoVol > 5000) return false;
        if (cargoFilter === '12000' && cargoVol > 12000) return false;
        if (cargoFilter === '35000' && cargoVol > 35000) return false;
        if (cargoFilter === '60000' && cargoVol > 60000) return false;
        if (cargoFilter === 'freighter' && cargoVol <= 60000) return false;

        // Chokepoints filter if avoid_chokepoints enabled in config
        if (config.avoid_chokepoints && opp.route?.chokepoints && opp.route.chokepoints.length > 0) {
          return false;
        }

        // Category filter
        const oppCategory = opp.category_name || '';
        if (categoryFilter !== 'all' && oppCategory !== categoryFilter) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = (opp.item_name || opp.type_name || '').toLowerCase().includes(q);
          const matchGroup = (opp.group_name || '').toLowerCase().includes(q);
          const matchCategory = (opp.category_name || '').toLowerCase().includes(q);
          const matchBuyHub = (opp.buy_hub?.name || '').toLowerCase().includes(q);
          const matchSellHub = (opp.sell_hub?.name || '').toLowerCase().includes(q);
          if (!matchName && !matchGroup && !matchCategory && !matchBuyHub && !matchSellHub) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return (b.scores?.overall_score ?? 0) - (a.scores?.overall_score ?? 0);
        if (sortBy === 'profit') return (b.costs?.net_profit ?? 0) - (a.costs?.net_profit ?? 0);
        if (sortBy === 'roi') return (b.costs?.roi ?? 0) - (a.costs?.roi ?? 0);
        if (sortBy === 'turnover') return (a.expected_days_to_sell ?? 0) - (b.expected_days_to_sell ?? 0);
        if (sortBy === 'capital') return (b.costs?.purchase_cost ?? 0) - (a.costs?.purchase_cost ?? 0);
        if (sortBy === 'cargo') return (b.total_cargo_volume ?? 0) - (a.total_cargo_volume ?? 0);
        return 0;
      });
  }, [liveOpportunities, searchQuery, categoryFilter, cargoFilter, minProfitFilter, minRoiFilter, maxJumpsFilter, highSecOnly, sortBy, config.avoid_chokepoints]);

  // Unique categories for dropdown
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const opp of opportunities) {
      if (opp.category_name) cats.add(opp.category_name);
    }
    return Array.from(cats).sort();
  }, [opportunities]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Actions */}
      <div className="bg-[#161821] border border-[#262730] p-5 rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#fafafa] flex items-center gap-2">
              Découverte Globale d'Arbitrage Universel
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-semibold">
                {filteredOpportunities.length} / {opportunities.length} opportunité{opportunities.length > 1 ? 's' : ''}
              </span>
              {isFiltered && (
                <button
                  onClick={handleResetFilters}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#262730] hover:bg-[#31333f] text-[#808495] hover:text-[#fafafa] transition-colors"
                >
                  Réinitialiser filtres
                </button>
              )}
            </h1>
            <p className="text-xs text-[#808495] mt-0.5">
              Classement universel des meilleurs flux commerciaux inter-régionaux synchronisés en direct avec votre soute et capital
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Cargo & Capital Badge */}
          <div className="hidden sm:flex items-center gap-2 bg-[#0e1117] border border-[#262730] px-3 py-1.5 rounded-xl text-[11px] font-mono">
            <span className="text-[#808495] flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              Soute :
            </span>
            <span className="text-[#fafafa] font-bold">
              {(config.max_cargo_m3 ?? 35000).toLocaleString('fr-FR')} m³
            </span>
            <span className="text-[#808495]">&bull;</span>
            <span className="text-[#808495]">Capital :</span>
            <span className="text-emerald-400 font-bold">
              {((config.available_capital ?? 1000000000) / 1000000).toFixed(0)}M ISK
            </span>
          </div>

          <button
            onClick={onOpenGlobalSyncModal}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all text-xs"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Lancer un Scan Global ESI</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#161821] border border-[#262730] p-4 rounded-xl space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#808495]" />
            <input
              type="text"
              placeholder="Rechercher un item, groupe, hub..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] pl-9 pr-3 py-2 rounded-lg focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-2 rounded-lg focus:border-purple-500 focus:outline-none"
            >
              <option value="all">Toutes les Catégories ({availableCategories.length})</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Cargo Capacity Filter */}
          <div>
            <select
              value={cargoFilter}
              onChange={(e) => setCargoFilter(e.target.value as any)}
              className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-2 rounded-lg focus:border-purple-500 focus:outline-none"
            >
              <option value="all">Toutes tailles de cargaison</option>
              <option value="1000">&le; 1 000 m³ (Frégate / Transport léger)</option>
              <option value="5000">&le; 5 000 m³ (Transporteur rapide)</option>
              <option value="12000">&le; 12 000 m³ (Blockade Runner)</option>
              <option value="35000">&le; 35 000 m³ (Deep Space Transport)</option>
              <option value="60000">&le; 60 000 m³ (Industriel standard)</option>
              <option value="freighter">&gt; 60 000 m³ (Freighter / JF)</option>
            </select>
          </div>

          {/* Min Profit Preset */}
          <div>
            <select
              value={minProfitFilter}
              onChange={(e) => setMinProfitFilter(Number(e.target.value))}
              className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-2 rounded-lg focus:border-purple-500 focus:outline-none"
            >
              <option value={0}>Tous les profits (0+ ISK)</option>
              <option value={50000}>Profit Net &gt; 50k ISK</option>
              <option value={100000}>Profit Net &gt; 100k ISK</option>
              <option value={250000}>Profit Net &gt; 250k ISK</option>
              <option value={500000}>Profit Net &gt; 500k ISK</option>
              <option value={2000000}>Profit Net &gt; 2M ISK</option>
              <option value={10000000}>Profit Net &gt; 10M ISK</option>
              <option value={50000000}>Profit Net &gt; 50M ISK</option>
            </select>
          </div>

          {/* Sorting */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-2 rounded-lg font-bold text-purple-300 focus:border-purple-500 focus:outline-none"
            >
              <option value="score">Trier par : Score Global (Qualité/Risque)</option>
              <option value="profit">Trier par : Profit Net Total (ISK)</option>
              <option value="roi">Trier par : ROI (%)</option>
              <option value="cargo">Trier par : Volume de cargo (m³)</option>
              <option value="turnover">Trier par : Rapidité de rotation</option>
              <option value="capital">Trier par : Capital engagé</option>
            </select>
          </div>
        </div>

        {/* Secondary Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#262730] text-[11px] text-[#808495]">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer text-[#cfd3dc] hover:text-white">
              <input
                type="checkbox"
                checked={highSecOnly}
                onChange={(e) => setHighSecOnly(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span>High-Sec uniquement (0.5+)</span>
            </label>

            <div className="flex items-center gap-2">
              <span>Max sauts :</span>
              <input
                type="range"
                min={5}
                max={60}
                value={maxJumpsFilter}
                onChange={(e) => setMaxJumpsFilter(Number(e.target.value))}
                className="accent-purple-500 w-24"
              />
              <span className="font-mono text-purple-300 font-bold">{maxJumpsFilter}j</span>
            </div>

            <div className="flex items-center gap-2">
              <span>Min ROI :</span>
              <select
                value={minRoiFilter}
                onChange={(e) => setMinRoiFilter(Number(e.target.value))}
                className="bg-[#0e1117] border border-[#262730] text-[#cfd3dc] rounded px-1.5 py-0.5"
              >
                <option value={0}>Tous (0%+)</option>
                <option value={0.01}>1%+</option>
                <option value={0.02}>2%+</option>
                <option value={0.05}>5%+</option>
                <option value={0.10}>10%+</option>
                <option value={0.20}>20%+</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span>
              Stratégie : <span className="text-[#fafafa] font-bold uppercase">{strategy}</span>
            </span>
            <span>&bull;</span>
            <span>
              Transport : <span className="text-emerald-400 font-bold">{config.enable_transport_costs ? 'Actif' : '0 ISK (Désactivé)'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Opportunities Table */}
      {filteredOpportunities.length === 0 ? (
        <div className="bg-[#161821] border border-[#262730] p-12 rounded-2xl text-center space-y-3">
          <Globe className="w-12 h-12 mx-auto text-[#808495] opacity-40" />
          {opportunities.length > 0 ? (
            <>
              <h3 className="font-bold text-base text-amber-300">
                {opportunities.length} opportunité{opportunities.length > 1 ? 's' : ''} masquée{opportunities.length > 1 ? 's' : ''} par vos filtres actuels
              </h3>
              <p className="text-xs text-[#808495] max-w-md mx-auto">
                Des opportunités existent en mémoire mais ne correspondent pas à vos critères (profit min, soute max, sauts, high-sec, catégorie ou recherche).
              </p>
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-2 transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Réinitialiser tous les filtres ({opportunities.length} disponibles)
              </button>
            </>
          ) : (
            <>
              <h3 className="font-bold text-base text-[#fafafa]">Aucune opportunité globale en mémoire</h3>
              <p className="text-xs text-[#808495] max-w-md mx-auto">
                Lancez une synchronisation globale du marché pour scanner l'univers et découvrir les flux d'arbitrage inter-hubs en temps réel.
              </p>
              <button
                onClick={onOpenGlobalSyncModal}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Lancer un Scan Global du Marché
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="bg-[#161821] border border-[#262730] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#262730] bg-[#0e1117] text-[#808495] uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 font-bold">Score</th>
                  <th className="p-3.5 font-bold">Item &amp; Catégorie</th>
                  <th className="p-3.5 font-bold">Route Commerciale</th>
                  <th className="p-3.5 font-bold text-right">Achat Source &rarr; Vente Cible</th>
                  <th className="p-3.5 font-bold text-right">Volume &amp; Soute</th>
                  <th className="p-3.5 font-bold text-right">Profit Net</th>
                  <th className="p-3.5 font-bold text-right">ROI</th>
                  <th className="p-3.5 font-bold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262730]">
                {filteredOpportunities.map((opp) => {
                  const score = opp.scores?.overall_score ?? 0;
                  const scoreColor =
                    score >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                    score >= 60 ? 'text-blue-400 bg-blue-500/10 border-blue-500/30' :
                    'text-amber-400 bg-amber-500/10 border-amber-500/30';

                  const itemName = opp.item_name || opp.type_name || `Type #${opp.type_id}`;
                  const buyHubName = opp.buy_hub?.name || 'Hub Achat';
                  const sellHubName = opp.sell_hub?.name || 'Hub Vente';
                  const jumps = opp.route?.jumps ?? 0;
                  const isHighSec = Boolean(opp.route?.is_highsec_only);
                  const minSec = opp.route?.min_security ?? 1.0;

                  const cargoCapacity = config.max_cargo_m3 ?? 35000;
                  const totalCargo = opp.total_cargo_volume ?? 0;
                  const cargoPercent = cargoCapacity > 0 ? Math.min(100, Math.round((totalCargo / cargoCapacity) * 100)) : 0;
                  const bottleneck = opp.bottleneck || 'capital';

                  return (
                    <tr
                      key={opp.id}
                      className="hover:bg-[#1a1d29] transition-colors group"
                    >
                      {/* Score Badge */}
                      <td className="p-3.5 font-mono">
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold ${scoreColor}`}>
                          {score}
                        </div>
                      </td>

                      {/* Item Details */}
                      <td className="p-3.5">
                        <div className="font-bold text-[#fafafa] text-xs flex items-center gap-1.5 flex-wrap">
                          <span>{itemName}</span>
                          {opp.certification && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                                opp.certification.status === 'CERTIFIED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : opp.certification.status === 'DEGRADED'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/40'
                              }`}
                              title={`Certification ${opp.certification.certification_version || '4-pillars-v1'} | Preuve SHA-256: ${opp.certification.evidence_hash || 'non hashé'} | Confiance: ${((opp.certification.confidence || 1) * 100).toFixed(0)}%`}
                            >
                              {opp.certification.status === 'CERTIFIED'
                                ? `✓ CERTIFIÉ (${opp.certification.certification_version || 'v1'})`
                                : opp.certification.status === 'DEGRADED'
                                ? `⚠ DÉGRADÉ (${opp.certification.certification_version || 'v1'})`
                                : '✕ REJETÉ'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#808495] flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="px-1.5 py-0.2 rounded bg-[#0e1117] border border-[#262730]">
                            {opp.category_name || 'Item'}
                          </span>
                          <span>&bull;</span>
                          <span>{opp.group_name || 'Groupe'}</span>
                          {opp.certification?.evidence_hash && (
                            <>
                              <span>&bull;</span>
                              <span
                                className="font-mono text-[9px] text-[#606475] bg-[#0e1117] px-1 py-0.2 rounded border border-[#202330]"
                                title={`Preuve SHA-256 : ${opp.certification.evidence_hash}`}
                              >
                                sha256:{opp.certification.evidence_hash.slice(0, 8)}…
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Route Details */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span className="text-emerald-400">{buyHubName}</span>
                          <span className="text-[#808495]">&rarr;</span>
                          <span className="text-blue-400">{sellHubName}</span>
                        </div>
                        <div className="text-[10px] text-[#808495] flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            {isHighSec ? (
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ShieldAlert className="w-3 h-3 text-amber-400" />
                            )}
                            {jumps} sauts
                          </span>
                          <span>&bull;</span>
                          <span>Sec: {minSec.toFixed(1)}</span>
                          {opp.route?.chokepoints && opp.route.chokepoints.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[9px] font-bold">
                              ⚠️ {opp.route.chokepoints.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-[#cfd3dc]">
                          {(opp.effective_buy_price ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ISK
                        </div>
                        <div className="text-[10px] text-purple-300">
                          &rarr; {(opp.effective_sell_price ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ISK
                        </div>
                      </td>

                      {/* Quantity & Cargo Synchronized */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-[#fafafa] font-bold">
                          {(opp.quantity_tradable ?? 0).toLocaleString('fr-FR')} u.
                        </div>
                        <div className="text-[10px] text-blue-300 flex items-center justify-end gap-1">
                          <span>{totalCargo.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m³</span>
                          <span className="text-[#606475]">({cargoPercent}%)</span>
                        </div>
                        <div className="mt-1 flex justify-end">
                          {bottleneck === 'cargo' && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              title={`Volume limité à 100% par votre capacité de soute (${cargoCapacity.toLocaleString()} m³)`}
                            >
                              📦 Soute Pleine
                            </span>
                          )}
                          {bottleneck === 'capital' && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              title={`Quantité limitée par votre capital disponible (${((config.available_capital ?? 1000000000) / 1000000).toFixed(0)}M ISK)`}
                            >
                              💰 Plafond Capital
                            </span>
                          )}
                          {bottleneck === 'source_market' && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30"
                              title="Quantité limitée par la profondeur du stock vendeur au hub source"
                            >
                              🏪 Stock Source
                            </span>
                          )}
                          {bottleneck === 'destination_market' && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              title="Quantité limitée par la capacité d'absorption au hub de destination"
                            >
                              🎯 Demande Cible
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Net Profit */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-emerald-400 font-bold text-sm">
                          +{(opp.costs?.net_profit ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ISK
                        </div>
                        <div className="text-[10px] text-[#808495]">
                          +{(opp.costs?.profit_per_unit ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ISK / u
                        </div>
                      </td>

                      {/* ROI */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-purple-300 font-bold">
                          +{((opp.costs?.roi ?? 0) * 100).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-[#808495]">
                          ~{(opp.expected_days_to_sell ?? 0).toFixed(1)}j vente
                        </div>
                      </td>

                      {/* Action Button */}
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => onSelectOpportunityForCockpit(opp)}
                          className="px-3 py-1.5 bg-blue-600/90 hover:bg-blue-500 text-white rounded-lg font-bold text-[11px] shadow transition-colors flex items-center gap-1 mx-auto"
                        >
                          <span>Cockpit</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

