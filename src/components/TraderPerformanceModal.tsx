import React, { useState } from 'react';
import { TraderPerformanceMetrics, TradeCycleRecord } from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
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
} from 'lucide-react';

interface TraderPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: TraderPerformanceMetrics | null;
  onSelectTypeForArbitrage?: (typeId: number) => void;
}

export const TraderPerformanceModal: React.FC<TraderPerformanceModalProps> = ({
  isOpen,
  onClose,
  metrics,
  onSelectTypeForArbitrage,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'cycles' | 'categories'>('overview');
  const [cycleSearch, setCycleSearch] = useState('');

  if (!isOpen || !metrics) return null;

  const filteredCycles = metrics.recent_trade_cycles.filter((c) => {
    if (!cycleSearch.trim()) return true;
    const q = cycleSearch.toLowerCase();
    return (
      c.type_name.toLowerCase().includes(q) ||
      (c.category_name || '').toLowerCase().includes(q) ||
      (c.sell_location || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#161821] border border-[#262730] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#fafafa]">
                  Performances Réelles de Trader &bull; {metrics.character_name}
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
                Calculé via RealizedFinancialOutcomeEngine (Causal FIFO temporel Achat ➔ Vente strict)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#808495] hover:text-[#fafafa] p-1.5 rounded-lg hover:bg-[#262730] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                    {metrics.financial_completeness === 'UNAVAILABLE'
                      ? 'Rentabilité brute par flip'
                      : 'Rentabilité nette par flip'}
                  </div>
                </div>

                <div className="bg-[#0e1117] p-3.5 rounded-xl border border-amber-500/30 space-y-1">
                  <div className="text-[11px] text-[#808495] flex items-center justify-between">
                    <span>Délai de Rotation Moyen</span>
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-amber-400">
                    ~{metrics.average_hold_days.toFixed(1)} jours
                  </div>
                  <div className="text-[10px] text-[#808495]">Vitesse de rotation réelle</div>
                </div>
              </div>

              {/* Volume & Turnover */}
              <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] text-[#808495]">Volume d'Achat Total</div>
                  <div className="text-sm font-bold font-mono text-[#fafafa] mt-1">
                    {fmtIsk(metrics.total_buy_volume)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#808495]">Volume de Vente Total</div>
                  <div className="text-sm font-bold font-mono text-[#fafafa] mt-1">
                    {fmtIsk(metrics.total_sell_volume)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#808495]">Chiffre d'Affaires Global (Turnover)</div>
                  <div className="text-sm font-bold font-mono text-amber-400 mt-1">
                    {fmtIsk(metrics.total_turnover)}
                  </div>
                </div>
              </div>

              {/* Financial Truth & Accounting Decomposition (Chantier 3B-4A.2 & 3B-4A.3) */}
              <div className="bg-[#0e1117] p-4 rounded-xl border border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[#fafafa] text-xs flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span>Réconciliation Comptable &bull; Décomposition des Frais</span>
                  </div>
                  <span className="text-[10px] text-[#808495] font-mono">
                    Mode: {metrics.financial_completeness === 'UNAVAILABLE'
                      ? 'UNAVAILABLE (Non configuré)'
                      : `${metrics.financial_completeness || 'ESTIMATED'} (${metrics.execution_fee_mode === 'MAKER_MAKER' ? 'Frais MAKER' : metrics.execution_fee_mode || 'Frais configurés'})`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                    <div className="text-[10px] text-[#808495]">Bénéfice Brut Réalisé</div>
                    <div className="text-xs font-bold font-mono text-[#fafafa] mt-0.5">
                      +{fmtIsk(metrics.total_realized_gross ?? (metrics.total_realized_profit + (metrics.total_estimated_fees ?? 0)))}
                    </div>
                  </div>

                  <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                    <div className="text-[10px] text-[#808495]">
                      {metrics.financial_completeness === 'UNAVAILABLE' ? 'Frais (Non Configurés)' : 'Frais Estimés Déduits'}
                    </div>
                    <div className="text-xs font-bold font-mono text-amber-400 mt-0.5">
                      {metrics.financial_completeness === 'UNAVAILABLE'
                        ? 'Non disponibles'
                        : `-${fmtIsk(metrics.total_estimated_fees ?? (metrics.total_broker_fees_paid + metrics.total_sales_tax_paid))}`}
                    </div>
                    <div className="text-[9px] text-[#808495] mt-0.5 font-mono">
                      {metrics.financial_completeness === 'UNAVAILABLE'
                        ? 'Compétences requises pour calcul'
                        : `Courtage: ${fmtIsk(metrics.total_broker_fees_paid)} | Taxe: ${fmtIsk(metrics.total_sales_tax_paid)}`}
                    </div>
                  </div>

                  <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                    <div className="text-[10px] text-[#808495]">
                      {metrics.realized_profit_label ||
                        (metrics.financial_completeness === 'UNAVAILABLE'
                          ? 'Bénéfice Réalisé (Hors Frais)'
                          : metrics.is_net_estimated
                          ? 'Bénéfice Net Réalisé (Estimé)'
                          : 'Bénéfice Net Réalisé (Certifié)')}
                    </div>
                    <div className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
                      +{fmtIsk(metrics.total_realized_profit)}
                    </div>
                    <div className="text-[9px] text-[#808495] mt-0.5 font-mono">
                      {metrics.financial_completeness === 'UNAVAILABLE'
                        ? 'Frais non configurés'
                        : metrics.is_net_estimated
                        ? 'Frais estimés déduits'
                        : 'Exactitude: Réconciliation certifiée'}
                    </div>
                  </div>
                </div>

                {metrics.has_unmatched_trades && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-center gap-2">
                    <span className="font-bold">⚠️ Intégrité Comptable :</span>
                    <span>
                      {metrics.unmatched_trades_count} cycle(s) comportent des ventes sans stock antérieur correspondant (vente à découvert ou historique ESI antérieur tronqué). Aucun coût artificiel à 0 ISK n'a été fabriqué.
                    </span>
                  </div>
                )}
              </div>

              {/* Top Locations */}
              <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
                <div className="font-bold text-[#fafafa] text-xs flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  Centres d'Activité et Hubs les Plus Utilisés
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {metrics.activity_by_location.map((loc) => (
                    <div
                      key={loc.location_id}
                      className="p-2.5 bg-[#161821] rounded-lg border border-[#262730] flex items-center justify-between"
                    >
                      <div className="truncate max-w-[220px]">
                        <div className="font-bold text-[#fafafa] truncate">{loc.location_name}</div>
                        <div className="text-[10px] text-[#808495]">{loc.transaction_count} transactions</div>
                      </div>
                      <div className="text-right font-mono font-bold text-amber-400 text-xs">
                        {fmtIsk(loc.total_volume_isk)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
                      <th className="py-2.5 px-2">Flips Réalisés</th>
                      <th className="py-2.5 px-2">Unités Échangées</th>
                      <th className="py-2.5 px-2">ROI Moyen</th>
                      <th className="py-2.5 px-2">Rotation</th>
                      <th className="py-2.5 px-3 text-right">
                        {metrics.financial_completeness === 'UNAVAILABLE' ? 'Profit Réalisé (Hors Frais)' : 'Profit Net ISK'}
                      </th>
                      <th className="py-2.5 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#262730]">
                    {metrics.top_profitable_items.map((item) => (
                      <tr key={item.type_id} className="hover:bg-[#1a1d27]">
                        <td className="py-2.5 px-3 flex items-center gap-2">
                          <img
                            src={`https://images.evetech.net/types/${item.type_id}/icon?size=32`}
                            alt=""
                            className="w-6 h-6 rounded bg-[#0e1117] border border-[#31333f]"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span className="font-bold text-[#fafafa]">{item.type_name}</span>
                        </td>
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
                  placeholder="Rechercher par nom d'item, station ou catégorie..."
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
