import React, { useState, useMemo, useEffect } from 'react';
import { GlobalMarketSyncService } from '../services/globalMarketSync';
import {
  UniverseWideOpportunity,
  MarketHub,
  FinancialConfig,
  TradeStrategy,
} from '../types';
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
  const [minProfitFilter, setMinProfitFilter] = useState<number>(500000); // 500k ISK default
  const [minRoiFilter, setMinRoiFilter] = useState<number>(0.02); // 2%
  const [maxJumpsFilter, setMaxJumpsFilter] = useState<number>(25);
  const [highSecOnly, setHighSecOnly] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'roi' | 'turnover' | 'capital'>('score');

  useEffect(() => {
    const unsub = GlobalMarketSyncService.subscribeOpportunities((opps) => {
      setOpportunities(opps);
    });
    return () => unsub();
  }, []);

  const filteredOpportunities = useMemo(() => {
    return opportunities
      .filter((opp) => {
        // High Sec filter
        if (highSecOnly && !opp.route.is_highsec_only) return false;

        // Jumps filter
        if (opp.route.jumps > maxJumpsFilter) return false;

        // Profit filter
        if (opp.costs.net_profit < minProfitFilter) return false;

        // ROI filter
        if (opp.costs.roi < minRoiFilter) return false;

        // Chokepoints filter if avoid_chokepoints enabled in config
        if (config.avoid_chokepoints && opp.route.chokepoints && opp.route.chokepoints.length > 0) {
          return false;
        }

        // Category filter
        if (categoryFilter !== 'all' && opp.category_name !== categoryFilter) {
          return false;
        }

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = opp.item_name.toLowerCase().includes(q);
          const matchGroup = opp.group_name.toLowerCase().includes(q);
          const matchHub = opp.buy_hub.name.toLowerCase().includes(q) || opp.sell_hub.name.toLowerCase().includes(q);
          if (!matchName && !matchGroup && !matchHub) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score') return b.scores.overall_score - a.scores.overall_score;
        if (sortBy === 'profit') return b.costs.net_profit - a.costs.net_profit;
        if (sortBy === 'roi') return b.costs.roi - a.costs.roi;
        if (sortBy === 'turnover') return a.expected_days_to_sell - b.expected_days_to_sell;
        if (sortBy === 'capital') return b.costs.purchase_cost - a.costs.purchase_cost;
        return 0;
      });
  }, [opportunities, searchQuery, categoryFilter, minProfitFilter, minRoiFilter, maxJumpsFilter, highSecOnly, sortBy]);

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
                {filteredOpportunities.length} opportunité{filteredOpportunities.length > 1 ? 's' : ''} active{filteredOpportunities.length > 1 ? 's' : ''}
              </span>
            </h1>
            <p className="text-xs text-[#808495] mt-0.5">
              Classement universel des meilleurs flux commerciaux inter-régionaux analysés en temps réel
            </p>
          </div>
        </div>

        <button
          onClick={onOpenGlobalSyncModal}
          className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-purple-900/30 transition-all text-xs"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Lancer une Synchronisation Globale ESI</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-[#161821] border border-[#262730] p-4 rounded-xl space-y-3 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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

          {/* Min Profit Preset */}
          <div>
            <select
              value={minProfitFilter}
              onChange={(e) => setMinProfitFilter(Number(e.target.value))}
              className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-2 rounded-lg focus:border-purple-500 focus:outline-none"
            >
              <option value={100000}>Profit Net &gt; 100k ISK</option>
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
              <option value="turnover">Trier par : Rapidité de rotation</option>
              <option value="capital">Trier par : Capital engagé</option>
            </select>
          </div>
        </div>

        {/* Secondary Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#262730] text-[11px] text-[#808495]">
          <div className="flex items-center gap-4">
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
                max={40}
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
                <option value={0.01}>1%</option>
                <option value={0.02}>2%</option>
                <option value={0.05}>5%</option>
                <option value={0.10}>10%</option>
                <option value={0.20}>20%</option>
              </select>
            </div>
          </div>

          <div>
            Stratégie appliquée : <span className="text-[#fafafa] font-bold uppercase">{strategy}</span> &bull; Frais transport : <span className="text-emerald-400 font-bold">{config.enable_transport_costs ? 'Actifs' : '0 ISK (Désactivés)'}</span>
          </div>
        </div>
      </div>

      {/* Main Opportunities Table */}
      {filteredOpportunities.length === 0 ? (
        <div className="bg-[#161821] border border-[#262730] p-12 rounded-2xl text-center space-y-3">
          <Globe className="w-12 h-12 mx-auto text-[#808495] opacity-40" />
          <h3 className="font-bold text-base text-[#fafafa]">Aucune opportunité ne correspond à vos filtres</h3>
          <p className="text-xs text-[#808495] max-w-md mx-auto">
            Ajustez vos filtres de profit minimum ou lancez une nouvelle synchronisation globale du marché pour découvrir de nouveaux flux.
          </p>
          <button
            onClick={onOpenGlobalSyncModal}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Lancer un Scan Global du Marché
          </button>
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
                  <th className="p-3.5 font-bold text-right">Volume &amp; Cargo</th>
                  <th className="p-3.5 font-bold text-right">Profit Net</th>
                  <th className="p-3.5 font-bold text-right">ROI</th>
                  <th className="p-3.5 font-bold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262730]">
                {filteredOpportunities.map((opp) => {
                  const score = opp.scores.overall_score;
                  const scoreColor =
                    score >= 80 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                    score >= 60 ? 'text-blue-400 bg-blue-500/10 border-blue-500/30' :
                    'text-amber-400 bg-amber-500/10 border-amber-500/30';

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
                          <span>{opp.item_name}</span>
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
                          <span>{opp.group_name}</span>
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
                          <span className="text-emerald-400">{opp.buy_hub.name}</span>
                          <span className="text-[#808495]">&rarr;</span>
                          <span className="text-blue-400">{opp.sell_hub.name}</span>
                        </div>
                        <div className="text-[10px] text-[#808495] flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            {opp.route.is_highsec_only ? (
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <ShieldAlert className="w-3 h-3 text-amber-400" />
                            )}
                            {opp.route.jumps} sauts
                          </span>
                          <span>&bull;</span>
                          <span>Sec: {opp.route.min_security.toFixed(1)}</span>
                          {opp.route.chokepoints && opp.route.chokepoints.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[9px] font-bold">
                              ⚠️ {opp.route.chokepoints.join(', ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Pricing */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-[#cfd3dc]">
                          {opp.effective_buy_price.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ISK
                        </div>
                        <div className="text-[10px] text-purple-300">
                          &rarr; {opp.effective_sell_price.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ISK
                        </div>
                      </td>

                      {/* Quantity & Cargo */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-[#fafafa] font-bold">
                          {opp.quantity_tradable.toLocaleString('fr-FR')} u.
                        </div>
                        <div className="text-[10px] text-[#808495]">
                          {opp.total_cargo_volume.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m³
                        </div>
                      </td>

                      {/* Net Profit */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-emerald-400 font-bold text-sm">
                          +{opp.costs.net_profit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ISK
                        </div>
                        <div className="text-[10px] text-[#808495]">
                          +{opp.costs.profit_per_unit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ISK / u
                        </div>
                      </td>

                      {/* ROI */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="text-purple-300 font-bold">
                          +{(opp.costs.roi * 100).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-[#808495]">
                          ~{opp.expected_days_to_sell.toFixed(1)}j vente
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
