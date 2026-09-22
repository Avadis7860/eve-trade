import React, { useState } from 'react';
import {
  TraderPerformanceMetrics,
  TradeCycleRecord,
  CharacterFinancialResult,
  PerformanceScope,
  FleetFinancialResult,
} from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import { FleetFinancialEngine } from '../engine/fleetFinancial';
import {
  Trophy,
  TrendingUp,
  Percent,
  Clock,
  Coins,
  Award,
  Layers,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  X,
  Search,
  ExternalLink,
  Users,
  User,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface TraderPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: TraderPerformanceMetrics | null;
  onSelectTypeForArbitrage?: (typeId: number) => void;
  characterResults?: CharacterFinancialResult[];
  activeCharacterId?: string;
  scope?: PerformanceScope;
  onChangeScope?: (scope: PerformanceScope) => void;
}

export const TraderPerformanceModal: React.FC<TraderPerformanceModalProps> = ({
  isOpen,
  onClose,
  metrics: fallbackMetrics,
  onSelectTypeForArbitrage,
  characterResults = [],
  activeCharacterId = '',
  scope: initialScope,
  onChangeScope,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'cycles' | 'categories'>('overview');
  const [cycleSearch, setCycleSearch] = useState('');
  const [internalScope, setInternalScope] = useState<PerformanceScope>(
    initialScope || { type: 'active_character' }
  );

  const effectiveScope = initialScope || internalScope;

  const handleScopeChange = (newScope: PerformanceScope) => {
    setInternalScope(newScope);
    if (onChangeScope) {
      onChangeScope(newScope);
    }
  };

  // Derive resolved metrics and fleetResult using FleetFinancialEngine
  let resolvedMetrics: TraderPerformanceMetrics | null = fallbackMetrics;
  let currentFleetResult: FleetFinancialResult | undefined = undefined;

  if (characterResults.length > 0) {
    const selection = FleetFinancialEngine.selectPerformanceByScope(
      characterResults,
      effectiveScope,
      activeCharacterId
    );
    resolvedMetrics = selection.selectedMetrics || fallbackMetrics;
    currentFleetResult = selection.fleetResult;
  }

  if (!isOpen || !resolvedMetrics) return null;
  const metrics = resolvedMetrics;

  const isFleetMode = effectiveScope.type === 'fleet';

  const filteredCycles = metrics.recent_trade_cycles.filter((c) => {
    if (!cycleSearch.trim()) return true;
    const q = cycleSearch.toLowerCase();
    return (
      c.type_name.toLowerCase().includes(q) ||
      (c.category_name || '').toLowerCase().includes(q) ||
      (c.sell_location || '').toLowerCase().includes(q) ||
      (c.character_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#161821] border border-[#262730] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#262730] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e1117]">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isFleetMode ? 'bg-purple-500/15 border border-purple-500/30 text-purple-400' : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'}`}>
              {isFleetMode ? <Users className="w-6 h-6" /> : <Trophy className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#fafafa]">
                  {isFleetMode
                    ? `Performances Flotte &bull; ${metrics.character_name}`
                    : `Performances Réelles de Trader &bull; ${metrics.character_name}`}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${metrics.trader_badge_color}`}>
                  {metrics.trader_title}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                    metrics.financial_completeness === 'OBSERVED'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : metrics.financial_completeness === 'PARTIAL'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  }`}
                  title="Source de vérité financière déterministe via RealizedFinancialOutcomeEngine"
                >
                  Vérité Comptable : {metrics.financial_completeness || 'ESTIMATED'}
                </span>
              </div>
              <p className="text-xs text-[#808495] mt-0.5">
                {isFleetMode
                  ? 'Consolidation financière déterministe multi-personnages (calcul individuel strict par pilote)'
                  : 'Calculé via RealizedFinancialOutcomeEngine (Causal FIFO temporel Achat ➔ Vente strict)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* Scope Switcher in Modal if multiple characters exist */}
            {characterResults.length > 1 && (
              <div className="flex items-center bg-[#161821] p-1 rounded-lg border border-[#262730] gap-1">
                <button
                  onClick={() => handleScopeChange({ type: 'active_character' })}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition-colors flex items-center gap-1 ${
                    effectiveScope.type === 'active_character'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-[#808495] hover:text-[#fafafa]'
                  }`}
                  title="Afficher les performances du personnage actif"
                >
                  <User className="w-3 h-3" />
                  <span>Actif</span>
                </button>

                <button
                  onClick={() => handleScopeChange({ type: 'fleet' })}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition-colors flex items-center gap-1 ${
                    effectiveScope.type === 'fleet'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'text-[#808495] hover:text-[#fafafa]'
                  }`}
                  title="Afficher la performance consolidée de la flotte"
                >
                  <Users className="w-3 h-3" />
                  <span>Flotte ({characterResults.length})</span>
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="text-[#808495] hover:text-[#fafafa] p-1.5 rounded-lg hover:bg-[#262730] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unavailable/Stale Characters Banner for Fleet Mode */}
        {isFleetMode && currentFleetResult?.hasUnavailableCharacters && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-amber-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>
              <strong>Données Flotte Partielles :</strong> Synchronisation indisponible ou jeton expiré pour :{' '}
              {currentFleetResult.unavailableCharacterNames.join(', ')}. Leurs résultats sont exclus du cumul.
            </span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[#0e1117] border-b border-[#262730] text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'overview'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            Vue d'Ensemble
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'items'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            Top Objets Rentables ({metrics.top_profitable_items.length})
          </button>
          <button
            onClick={() => setActiveTab('cycles')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'cycles'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            Cycles Réalisés ({metrics.recent_trade_cycles.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              activeTab === 'categories'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            Réussite par Catégorie
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Primary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0e1117] p-3.5 rounded-xl border border-emerald-500/30 space-y-1">
                  <div className="text-[11px] text-[#808495] flex items-center justify-between">
                    <span>{metrics.realized_profit_label || (metrics.financial_completeness === 'UNAVAILABLE' ? 'Profit Réalisé (Hors Frais)' : 'Bénéfice Net Réalisé')}</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    +{fmtIsk(metrics.total_realized_profit)}
                  </div>
                  <div className="text-[10px] text-[#808495]">
                    {metrics.financial_completeness === 'UNAVAILABLE'
                      ? 'Frais non configurés (non déduits)'
                      : metrics.is_net_estimated
                      ? 'Taxes et courtage estimés déduits'
                      : 'Taxes et courtage certifiés déduits'}
                  </div>
                </div>

                <div className="bg-[#0e1117] p-3.5 rounded-xl border border-blue-500/30 space-y-1">
                  <div className="text-[11px] text-[#808495] flex items-center justify-between">
                    <span>Taux de Réussite (Win Rate)</span>
                    <Percent className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-blue-400">
                    {metrics.win_rate_pct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[#808495]">
                    {metrics.profitable_trades} gagnants / {metrics.total_closed_trades} cycles
                  </div>
                </div>

                <div className="bg-[#0e1117] p-3.5 rounded-xl border border-purple-500/30 space-y-1">
                  <div className="text-[11px] text-[#808495] flex items-center justify-between">
                    <span>ROI Réalisé Moyen</span>
                    <Coins className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-purple-300">
                    +{(metrics.average_realized_roi * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[#808495]">
                    Rendement net moyen par cycle
                  </div>
                </div>

                <div className="bg-[#0e1117] p-3.5 rounded-xl border border-amber-500/30 space-y-1">
                  <div className="text-[11px] text-[#808495] flex items-center justify-between">
                    <span>Durée Moyenne de Détention</span>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-amber-300">
                    ~{metrics.average_hold_days.toFixed(1)} jours
                  </div>
                  <div className="text-[10px] text-[#808495]">
                    Vitesse de rotation du capital
                  </div>
                </div>
              </div>

              {/* Character Breakdown if Fleet Mode */}
              {isFleetMode && characterResults.length > 0 && (
                <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
                  <div className="flex items-center justify-between border-b border-[#262730] pb-2">
                    <span className="font-bold text-[#fafafa] flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-400" />
                      Contribution Financière par Pilote ({characterResults.length})
                    </span>
                    <span className="text-[11px] text-[#808495]">
                      Calculs isolés &bull; Agrégation sans mélange
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {characterResults.map((res) => {
                      const isUnavail = res.dataHealth === 'unavailable';
                      const m = res.metrics;
                      return (
                        <div
                          key={res.characterId}
                          onClick={() => handleScopeChange({ type: 'character', characterId: res.characterId })}
                          className={`p-3 rounded-lg border transition-all cursor-pointer ${
                            isUnavail
                              ? 'bg-zinc-900/50 border-zinc-800 opacity-60'
                              : 'bg-[#161821] border-[#262730] hover:border-purple-500/40 hover:bg-[#1a1d27]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#fafafa] truncate">{res.characterName}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                                isUnavail
                                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                  : res.dataHealth === 'stale'
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              }`}
                            >
                              {res.dataHealth}
                            </span>
                          </div>

                          {!isUnavail && m ? (
                            <div className="mt-2 space-y-1 text-xs">
                              <div className="flex justify-between font-mono">
                                <span className="text-[#808495]">Profit Net:</span>
                                <span className="font-bold text-emerald-400">+{fmtIsk(m.total_realized_profit)}</span>
                              </div>
                              <div className="flex justify-between font-mono text-[11px]">
                                <span className="text-[#808495]">Volume:</span>
                                <span className="text-[#fafafa]">{fmtIsk(m.total_turnover)}</span>
                              </div>
                              <div className="flex justify-between font-mono text-[11px]">
                                <span className="text-[#808495]">Trades:</span>
                                <span className="text-[#fafafa]">{m.total_closed_trades} ({m.win_rate_pct.toFixed(0)}% win)</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[10px] text-zinc-500 italic">
                              {res.errorMessage || 'Données non disponibles'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Volume & Fees Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#808495] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    Volumes d'Échange Totaux
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#808495]">Volume d'Achat :</span>
                      <span className="font-mono font-bold text-[#fafafa]">{fmtIsk(metrics.total_buy_volume)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#808495]">Volume de Vente :</span>
                      <span className="font-mono font-bold text-[#fafafa]">{fmtIsk(metrics.total_sell_volume)}</span>
                    </div>
                    <div className="pt-2 border-t border-[#262730] flex justify-between items-center text-xs">
                      <span className="text-[#808495] font-bold">Chiffre d'Affaires Global :</span>
                      <span className="font-mono font-bold text-blue-400">{fmtIsk(metrics.total_turnover)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#808495] flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    Taxes &amp; Frais Réglés (Déduits)
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#808495]">Frais de Courtage (Broker Fees) :</span>
                      <span className="font-mono text-amber-400">-{fmtIsk(metrics.total_broker_fees_paid)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#808495]">Taxe sur les Ventes (Sales Tax) :</span>
                      <span className="font-mono text-amber-400">-{fmtIsk(metrics.total_sales_tax_paid)}</span>
                    </div>
                    <div className="pt-2 border-t border-[#262730] flex justify-between items-center text-xs">
                      <span className="text-[#808495] font-bold">Total Frais Déduits :</span>
                      <span className="font-mono font-bold text-amber-300">
                        -{fmtIsk(metrics.total_broker_fees_paid + metrics.total_sales_tax_paid)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity by Location */}
              {metrics.activity_by_location && metrics.activity_by_location.length > 0 && (
                <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#808495] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    Activité par Station / Hub Principal
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {metrics.activity_by_location.map((loc) => (
                      <div
                        key={loc.location_id}
                        className="flex items-center justify-between p-2 rounded-lg bg-[#161821] border border-[#262730] text-xs"
                      >
                        <div className="truncate pr-2">
                          <div className="font-bold text-[#fafafa] truncate">{loc.location_name}</div>
                          <div className="text-[10px] text-[#808495]">{loc.transaction_count} transactions</div>
                        </div>
                        <div className="font-mono font-bold text-blue-400 flex-shrink-0">
                          {fmtIsk(loc.total_volume_isk)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TOP PROFITABLE ITEMS */}
          {activeTab === 'items' && (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0e1117] text-[#808495] uppercase font-semibold text-[10px] tracking-wider border-b border-[#262730]">
                    <tr>
                      <th className="py-2.5 px-3">Objet</th>
                      <th className="py-2.5 px-2">Catégorie</th>
                      <th className="py-2.5 px-2">Trades</th>
                      <th className="py-2.5 px-2">Volume Unités</th>
                      <th className="py-2.5 px-2">ROI Moyen</th>
                      <th className="py-2.5 px-2">Délai Moyen</th>
                      <th className="py-2.5 px-3 text-right">
                        {metrics.financial_completeness === 'UNAVAILABLE' ? 'Profit Réalisé (Hors Frais)' : 'Bénéfice Net Réalisé'}
                      </th>
                      <th className="py-2.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#262730]">
                    {metrics.top_profitable_items.map((item) => (
                      <tr key={item.type_id} className="hover:bg-[#1a1d27]">
                        <td className="py-2.5 px-3 font-bold text-[#fafafa]">{item.type_name}</td>
                        <td className="py-2.5 px-2 text-[#808495]">{item.category_name}</td>
                        <td className="py-2.5 px-2 font-mono">{item.trades_count}</td>
                        <td className="py-2.5 px-2 font-mono">{fmtNumber(item.total_volume_units)}</td>
                        <td className="py-2.5 px-2 font-mono font-bold text-purple-400">
                          +{(item.avg_roi * 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-2 font-mono text-amber-400">
                          ~{item.avg_hold_days.toFixed(1)}j
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                          <div>+{fmtIsk(item.total_profit)}</div>
                          <div className="text-[9px] text-[#808495] font-normal">
                            {item.profit_label?.includes('Hors Frais')
                              ? 'hors frais'
                              : item.profit_label?.includes('Partiel')
                              ? 'partiel'
                              : item.is_net_estimated
                              ? 'net estimé'
                              : 'net certifié'}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {onSelectTypeForArbitrage && (
                            <button
                              onClick={() => {
                                onClose();
                                onSelectTypeForArbitrage(item.type_id);
                              }}
                              className="px-2 py-1 bg-[#262730] hover:bg-purple-600 text-[#fafafa] rounded text-[10px] font-bold"
                            >
                              Arbitrer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TRADE CYCLES */}
          {activeTab === 'cycles' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#808495]" />
                <input
                  type="text"
                  placeholder="Rechercher par nom d'item, station, pilote ou catégorie..."
                  value={cycleSearch}
                  onChange={(e) => setCycleSearch(e.target.value)}
                  className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] rounded-lg px-3 py-1.5 pl-8 text-xs focus:outline-none"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0e1117] text-[#808495] uppercase font-semibold text-[10px] tracking-wider border-b border-[#262730]">
                    <tr>
                      <th className="py-2 px-3">Date Vente</th>
                      {isFleetMode && <th className="py-2 px-2">Pilote</th>}
                      <th className="py-2 px-3">Objet</th>
                      <th className="py-2 px-2">Statut</th>
                      <th className="py-2 px-2">Quantité</th>
                      <th className="py-2 px-2">Prix Achat Moy.</th>
                      <th className="py-2 px-2">Prix Vente Moy.</th>
                      <th className="py-2 px-2">Durée</th>
                      <th className="py-2 px-2">ROI</th>
                      <th className="py-2 px-3 text-right">
                        {metrics.financial_completeness === 'UNAVAILABLE' ? 'Profit Réalisé (Hors Frais)' : 'Bénéfice Net'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#262730]">
                    {filteredCycles.slice(0, 50).map((cycle) => (
                      <tr key={cycle.cycle_id} className="hover:bg-[#1a1d27]">
                        <td className="py-2 px-3 text-[#808495] font-mono text-[10px]">
                          {new Date(cycle.sell_date).toLocaleDateString()}
                        </td>
                        {isFleetMode && (
                          <td className="py-2 px-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 truncate max-w-[100px] inline-block">
                              {cycle.character_name || `ID ${cycle.character_id}`}
                            </span>
                          </td>
                        )}
                        <td className="py-2 px-3 font-bold text-[#fafafa]">
                          <div>{cycle.type_name}</div>
                          {cycle.unmatched_sell_quantity && cycle.unmatched_sell_quantity > 0 ? (
                            <div className="text-[9px] text-amber-400 font-mono">
                              Stock non couvert: {cycle.unmatched_sell_quantity}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                              cycle.financial_completeness === 'OBSERVED'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : cycle.financial_completeness === 'PARTIAL'
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : cycle.financial_completeness === 'UNAVAILABLE'
                                ? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
                                : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            }`}
                            title={
                              cycle.financial_completeness === 'UNAVAILABLE'
                                ? 'Frais non configurés (non disponibles)'
                                : cycle.is_net_estimated
                                ? 'Frais estimés basés sur compétences'
                                : 'Frais certifiés'
                            }
                          >
                            {cycle.financial_completeness || 'ESTIMATED'}
                          </span>
                        </td>
                        <td className="py-2 px-2 font-mono">{fmtNumber(cycle.quantity)}</td>
                        <td className="py-2 px-2 font-mono text-[#808495]">{fmtIsk(cycle.avg_buy_price)}</td>
                        <td className="py-2 px-2 font-mono text-[#fafafa]">{fmtIsk(cycle.avg_sell_price)}</td>
                        <td className="py-2 px-2 font-mono text-amber-400">~{cycle.hold_days}j</td>
                        <td className={`py-2 px-2 font-mono font-bold ${cycle.is_profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          {cycle.is_profitable ? `+${(cycle.roi * 100).toFixed(1)}%` : `${(cycle.roi * 100).toFixed(1)}%`}
                        </td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${cycle.is_profitable ? 'text-emerald-400' : 'text-red-400'}`}>
                          <div>{cycle.is_profitable ? `+${fmtIsk(cycle.net_profit)}` : fmtIsk(cycle.net_profit)}</div>
                          {cycle.estimated_fees_paid !== undefined && (
                            <div className="text-[9px] text-[#808495] font-normal font-mono">
                              {cycle.financial_completeness === 'UNAVAILABLE'
                                ? 'Frais: Non configurés'
                                : `Frais: -${fmtIsk(cycle.estimated_fees_paid)}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: CATEGORIES SUCCESS */}
          {activeTab === 'categories' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(metrics.category_success_rate).map(([catName, data]) => (
                  <div
                    key={catName}
                    className="p-3.5 bg-[#0e1117] rounded-xl border border-[#262730] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#fafafa] text-xs">{catName}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        {data.win_rate.toFixed(0)}% Succès
                      </span>
                    </div>
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-[#808495]">{data.total_trades} transactions</span>
                      <span className="font-bold text-emerald-400">
                        +{fmtIsk(data.profit_isk)}
                        {data.profit_label?.includes('Hors Frais') || metrics.financial_completeness === 'UNAVAILABLE' ? (
                          <span className="text-[10px] text-[#808495] font-normal ml-1">(hors frais)</span>
                        ) : data.profit_label?.includes('Partiel') ? (
                          <span className="text-[10px] text-amber-400 font-normal ml-1">(partiel)</span>
                        ) : data.is_net_estimated === false ? (
                          <span className="text-[10px] text-emerald-400/80 font-normal ml-1">(net certifié)</span>
                        ) : (
                          <span className="text-[10px] text-[#808495] font-normal ml-1">(net estimé)</span>
                        )}
                      </span>
                    </div>
                    <div className="text-[11px] text-purple-300 font-mono">
                      ROI Moyen : +{(data.avg_roi * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div className="text-[11px] text-[#808495] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-green-400" />
            Ce profil calibre dynamiquement le scanner d'arbitrage inter-régional pour ajuster vos scores de confiance.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] rounded-lg text-xs font-bold transition-colors ml-auto"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
