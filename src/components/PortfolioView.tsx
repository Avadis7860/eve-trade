import React from 'react';
import { PortfolioSimulation } from '../types';
import { fmtIsk, fmtPct, fmtNumber } from '../engine/money';
import { PieChart, DollarSign, Layers, ShieldCheck } from 'lucide-react';

interface PortfolioViewProps {
  simulation: PortfolioSimulation;
  onSelectOpportunity: (oppId: string) => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  simulation,
  onSelectOpportunity,
}) => {
  const {
    total_capital_available,
    total_capital_invested,
    total_expected_profit,
    total_expected_daily_profit,
    weighted_roi,
    positions,
    diversification,
  } = simulation;

  const cashRemaining = total_capital_available - total_capital_invested;

  return (
    <div className="space-y-6 text-[#fafafa] text-xs">
      {/* Portfolio Header Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
          <div className="text-[#808495] flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Capital Alloué</span>
          </div>
          <div className="text-xl font-bold font-mono text-[#fafafa]">
            {fmtIsk(total_capital_invested)}
          </div>
          <div className="text-[11px] text-[#808495] mt-1">
            Cash libre : <span className="font-mono text-green-400">{fmtIsk(cashRemaining)}</span>
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
          <div className="text-[#808495] flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 text-green-400" />
            <span>Profit Net Prévu</span>
          </div>
          <div className="text-xl font-bold font-mono text-green-400">
            {fmtIsk(total_expected_profit)}
          </div>
          <div className="text-[11px] text-[#808495] mt-1">
            Positions actives : <span className="font-bold text-[#fafafa]">{positions.length}</span>
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
          <div className="text-[#808495] flex items-center gap-1.5 mb-1">
            <PieChart className="w-3.5 h-3.5 text-amber-400" />
            <span>Rendement Pondéré (ROI)</span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-400">
            {fmtPct(weighted_roi)}
          </div>
          <div className="text-[11px] text-[#808495] mt-1">
            Sur capital investi
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
          <div className="text-[#808495] flex items-center gap-1.5 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Rendement Journalier</span>
          </div>
          <div className="text-xl font-bold font-mono text-blue-400">
            {fmtIsk(total_expected_daily_profit)} / j
          </div>
          <div className="text-[11px] text-[#808495] mt-1">
            Rotation optimisée
          </div>
        </div>
      </div>

      {/* Diversification Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
          <h3 className="font-bold text-[#fafafa] text-sm mb-3">
            Diversification par Catégorie d'Objets
          </h3>
          <div className="space-y-2">
            {Object.entries(diversification.by_category).map(([cat, amount]) => {
              const pct = total_capital_invested > 0 ? (amount / total_capital_invested) * 100 : 0;
              return (
                <div key={cat} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#fafafa] font-medium">{cat}</span>
                    <span className="text-[#808495] font-mono">
                      {fmtIsk(amount)} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#ff4b4b] h-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
          <h3 className="font-bold text-[#fafafa] text-sm mb-3">
            Répartition par Route Commerciale
          </h3>
          <div className="space-y-2">
            {Object.entries(diversification.by_route).map(([route, amount]) => {
              const pct = total_capital_invested > 0 ? (amount / total_capital_invested) * 100 : 0;
              return (
                <div key={route} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#fafafa] font-medium">{route}</span>
                    <span className="text-[#808495] font-mono">
                      {fmtIsk(amount)} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-400 h-full transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Allocated Positions Table */}
      <div className="bg-[#161821] border border-[#262730] rounded-lg overflow-hidden">
        <div className="p-3 bg-[#262730] font-bold text-xs flex justify-between items-center">
          <span>Positions Recommandées du Portefeuille ({positions.length})</span>
          <span className="text-[#808495] text-[11px]">
            Trié par Score &amp; Efficacité du Capital
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#1c1e28] text-[#808495] text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-3">Objet</th>
                <th className="p-3">Route</th>
                <th className="p-3 text-right">Capital Alloué</th>
                <th className="p-3 text-right">Part (%)</th>
                <th className="p-3 text-right">Qté</th>
                <th className="p-3 text-right">Profit Prévu</th>
                <th className="p-3 text-right">Profit / Jour</th>
                <th className="p-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262730]">
              {positions.map((pos, idx) => (
                <tr
                  key={idx}
                  onClick={() => onSelectOpportunity(pos.opportunity.id)}
                  className="hover:bg-[#20222c] cursor-pointer transition-colors"
                >
                  <td className="p-3 text-[#fafafa] font-semibold">
                    {pos.opportunity.type_name}
                  </td>
                  <td className="p-3 text-[#808495]">
                    {pos.opportunity.buy_hub.name} → {pos.opportunity.sell_hub.name}
                  </td>
                  <td className="p-3 text-right text-amber-400 font-bold">
                    {fmtIsk(pos.allocated_capital)}
                  </td>
                  <td className="p-3 text-right text-[#808495]">
                    {(pos.share_of_portfolio * 100).toFixed(1)}%
                  </td>
                  <td className="p-3 text-right text-[#fafafa]">
                    {fmtNumber(pos.allocated_quantity)}
                  </td>
                  <td className="p-3 text-right text-green-400 font-bold">
                    {fmtIsk(pos.expected_profit)}
                  </td>
                  <td className="p-3 text-right text-green-300">
                    {fmtIsk(pos.expected_daily_profit)}
                  </td>
                  <td className="p-3 text-right text-[#ff4b4b] font-bold">
                    {pos.opportunity.scores.overall_score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
