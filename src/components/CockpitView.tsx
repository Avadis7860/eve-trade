import React from 'react';
import {
  ArrowRight,
  CheckCircle,
  Award,
  Globe,
} from 'lucide-react';
import {
  EveTypeDetail,
  MarketHub,
  TradeStrategy,
  InterRegionalOpportunity,
} from '../types';
import { MarketDataStore } from '../services/marketDataStore';
import { fmtIsk, fmtPct, fmtNumber } from '../engine/money';

interface CockpitViewProps {
  selectedType: EveTypeDetail;
  hubs: MarketHub[];
  strategy: TradeStrategy;
  opportunities: InterRegionalOpportunity[];
  sortedOpportunities: InterRegionalOpportunity[];
  sortBy: 'score' | 'profit' | 'roi' | 'profit_day' | 'turnover';
  onSortChange: (sortBy: 'score' | 'profit' | 'roi' | 'profit_day' | 'turnover') => void;
  highSecOnly: boolean;
  onToggleHighSec: (checked: boolean) => void;
  isSyncingLiveEsi: boolean;
  onSyncLiveESI: () => void;
  onSelectOpportunity: (opp: InterRegionalOpportunity) => void;
}

export const CockpitView: React.FC<CockpitViewProps> = ({
  selectedType,
  hubs,
  strategy,
  opportunities,
  sortedOpportunities,
  sortBy,
  onSortChange,
  highSecOnly,
  onToggleHighSec,
  isSyncingLiveEsi,
  onSyncLiveESI,
  onSelectOpportunity,
}) => {
  const activeHubsCount = hubs.filter((h) => h.active).length;
  const analyzedRoutesCount = activeHubsCount * (activeHubsCount - 1);
  const viableCount = opportunities.filter((o) => o.is_viable).length;
  const rejectedCount = opportunities.filter((o) => !o.is_viable).length;
  const topProfitPerDay = opportunities[0]?.profit_per_day || 0;

  return (
    <div className="space-y-6">
      {/* Cockpit Overview Cards - Responsive Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-[#161821] border border-[#262730] rounded-xl p-3.5 sm:p-4">
          <div className="text-xs text-[#808495] font-medium mb-1">Paires de Hubs Analysées</div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-[#fafafa] tabular-nums">
            {analyzedRoutesCount} routes
          </div>
          <div className="text-[11px] text-[#808495] mt-1 truncate">
            Directionnel A &harr; B exhaustif
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-xl p-3.5 sm:p-4">
          <div className="text-xs text-[#808495] font-medium mb-1">Opportunités Viables</div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-green-400 tabular-nums">
            {viableCount}
          </div>
          <div className="text-[11px] text-[#808495] mt-1 truncate">
            {rejectedCount} rejetées (filtres stricts)
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-xl p-3.5 sm:p-4">
          <div className="text-xs text-[#808495] font-medium mb-1">Meilleur Profit / Jour</div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 tabular-nums">
            {fmtIsk(topProfitPerDay)}
          </div>
          <div className="text-[11px] text-[#808495] mt-1 truncate">
            Pondéré rotation du capital
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-xl p-3.5 sm:p-4">
          <div className="text-xs text-[#808495] font-medium mb-1">Stratégie en Cours</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-[#ff4b4b] uppercase truncate">
            {strategy === 'relist' ? 'Buy & Relist' : 'Immédiate'}
          </div>
          <div className="text-[11px] text-[#808495] mt-1 truncate">
            Frais bilatéraux inclus
          </div>
        </div>
      </div>

      {/* Filters & Sorters Toolbar */}
      <div className="bg-[#161821] border border-[#262730] rounded-xl p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[#808495] hidden sm:inline">Trier par :</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as any)}
              className="bg-[#0e1117] border border-[#31333f] text-[#fafafa] rounded-lg px-2.5 py-1.5 text-xs cursor-pointer focus:outline-none focus:border-[#ff4b4b]"
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
              onChange={(e) => onToggleHighSec(e.target.checked)}
              className="rounded bg-[#0e1117] text-[#ff4b4b] focus:ring-0"
            />
            <span className="text-xs">100% High-Sec</span>
          </label>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {MarketDataStore.isLiveEsi(selectedType.type_id, 10000002) ? (
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded font-mono">
              <CheckCircle className="w-3 h-3 text-green-400" />
              ESI Live
            </span>
          ) : null}

          <button
            onClick={onSyncLiveESI}
            disabled={isSyncingLiveEsi}
            className="flex items-center gap-1.5 bg-[#ff4b4b]/15 hover:bg-[#ff4b4b]/25 text-[#ff4b4b] border border-[#ff4b4b]/30 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Globe className={`w-3.5 h-3.5 ${isSyncingLiveEsi ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncingLiveEsi ? 'Sync ESI...' : 'Actualiser Live ESI'}</span>
            <span className="sm:hidden">{isSyncingLiveEsi ? 'Sync...' : 'ESI'}</span>
          </button>

          <div className="text-[11px] text-[#808495] hidden lg:block">
            <strong className="text-[#fafafa] tabular-nums">{sortedOpportunities.length}</strong> opportunités pour{' '}
            <span className="text-[#fafafa] font-semibold">{selectedType.name}</span>
          </div>
        </div>
      </div>

      {/* Opportunities Matrix Table - Responsive with Tabular Nums & Breakpoints */}
      <div className="bg-[#161821] border border-[#262730] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#0e1117] text-[#808495] uppercase tracking-wider text-[11px] border-b border-[#262730]">
              <tr>
                <th className="p-3 sm:p-3.5">Route Commerciale</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap">Prix Achat</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap hidden md:table-cell">Prix Vente</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap">Qté</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap">Profit Net</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap hidden xl:table-cell">Capturable</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap hidden lg:table-cell">Profit / Jour</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap hidden sm:table-cell">ROI</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap hidden xl:table-cell">Jours</th>
                <th className="p-3 sm:p-3.5 text-right whitespace-nowrap">Score</th>
                <th className="p-3 sm:p-3.5 text-center">Action</th>
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
                      onClick={() => onSelectOpportunity(opp)}
                      className={`hover:bg-[#1a1d29] cursor-pointer transition-colors ${
                        isAnom ? 'bg-amber-950/10' : !isViable ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="p-3 sm:p-3.5 min-w-[140px]">
                        <div className="flex items-center gap-1.5 font-bold text-[#fafafa]">
                          <span className="truncate max-w-[80px] sm:max-w-none">{opp.buy_hub.name}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#808495] flex-shrink-0" />
                          <span className="truncate max-w-[80px] sm:max-w-none">{opp.sell_hub.name}</span>
                        </div>
                        <div className="text-[10px] text-[#808495] flex items-center gap-1.5 sm:gap-2 mt-0.5">
                          <span>{opp.route.jumps}j</span>
                          <span>· {opp.strategy === 'relist' ? 'Relist' : 'Direct'}</span>
                          {opp.jita_price_benchmark?.is_jita_verified && (
                            <span
                              className="text-amber-400/90 hidden sm:inline-flex items-center gap-0.5"
                              title={opp.jita_price_benchmark.reliability_assessment}
                            >
                              <Award className="w-2.5 h-2.5" />
                              <span>Jita</span>
                            </span>
                          )}
                          {isAnom && (
                            <span className="text-amber-400 font-bold">⚠️</span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 sm:p-3.5 text-right text-[#4d8dff] tabular-nums whitespace-nowrap">
                        {fmtIsk(opp.effective_buy_price)}
                      </td>

                      <td className="p-3 sm:p-3.5 text-right text-green-400 tabular-nums whitespace-nowrap hidden md:table-cell">
                        {fmtIsk(opp.effective_sell_price)}
                      </td>

                      <td className="p-3 sm:p-3.5 text-right text-[#fafafa] tabular-nums whitespace-nowrap">
                        {fmtNumber(opp.quantity_tradable)}
                        <div className="text-[10px] text-[#808495] tabular-nums">
                          {fmtNumber(opp.total_cargo_volume)} m³
                        </div>
                      </td>

                      <td className="p-3 sm:p-3.5 text-right font-bold text-green-400 tabular-nums whitespace-nowrap">
                        {fmtIsk(opp.costs.net_profit)}
                      </td>

                      <td className="p-3 sm:p-3.5 text-right text-purple-300 tabular-nums whitespace-nowrap hidden xl:table-cell">
                        {fmtIsk(opp.capturable_profit)}
                      </td>

                      <td className="p-3 sm:p-3.5 text-right font-bold text-amber-400 tabular-nums whitespace-nowrap hidden lg:table-cell">
                        {fmtIsk(opp.profit_per_day)}
                      </td>

                      <td className="p-3 sm:p-3.5 text-right text-green-400 font-semibold tabular-nums whitespace-nowrap hidden sm:table-cell">
                        {fmtPct(opp.costs.roi)}
                      </td>

                      <td className="p-3 sm:p-3.5 text-right text-[#808495] tabular-nums whitespace-nowrap hidden xl:table-cell">
                        {opp.expected_days_to_sell.toFixed(1)} j
                      </td>

                      <td className="p-3 sm:p-3.5 text-right">
                        <span
                          className={`px-1.5 sm:px-2 py-0.5 rounded-md font-bold text-xs tabular-nums ${
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

                      <td className="p-3 sm:p-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOpportunity(opp);
                          }}
                          className="px-2 sm:px-2.5 py-1 rounded bg-[#262730] hover:bg-[#31333f] text-[#fafafa] text-[11px] font-medium transition-colors"
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
  );
};
