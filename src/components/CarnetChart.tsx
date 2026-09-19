import React from 'react';
import { PriceLevel } from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';

interface CarnetChartProps {
  sellLevels: PriceLevel[];
  buyLevels: PriceLevel[];
}

export const CarnetChart: React.FC<CarnetChartProps> = ({ sellLevels, buyLevels }) => {
  if (sellLevels.length === 0 && buyLevels.length === 0) {
    return (
      <div className="bg-[#262730] border border-[#31333f] rounded-lg p-6 text-center text-[#808495]">
        Aucun ordre local pour cette sélection.
      </div>
    );
  }

  // Combine data points sorted by price for the chart
  // Buy levels are sorted descending originally, sell levels ascending
  const allLevels = [
    ...buyLevels.map((l) => ({ ...l, type: 'buy' as const })),
    ...sellLevels.map((l) => ({ ...l, type: 'sell' as const })),
  ].sort((a, b) => a.price - b.price);

  const maxCumulative = Math.max(
    ...sellLevels.map((l) => l.cumulative),
    ...buyLevels.map((l) => l.cumulative),
    1
  );

  const maxVolume = Math.max(
    ...sellLevels.map((l) => l.volume),
    ...buyLevels.map((l) => l.volume),
    1
  );

  return (
    <div className="bg-[#0e1117] border border-[#31333f] rounded-lg p-4 text-[#fafafa]">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mb-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ff4d4d]"></span>
          <span className="text-[#fafafa]">Vente (prix croissant)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-[#ff4d4d] opacity-40"></span>
          <span className="text-[#808495]">Volume vente</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#4d8dff]"></span>
          <span className="text-[#fafafa]">Achat (prix décroissant)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-[#4d8dff] opacity-40"></span>
          <span className="text-[#808495]">Volume achat</span>
        </div>
      </div>

      {/* Visual Chart Canvas */}
      <div className="relative h-72 w-full bg-[#161821] rounded border border-[#262730] overflow-hidden p-2 flex flex-col justify-end">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-4 opacity-15">
          <div className="border-b border-[#fafafa]"></div>
          <div className="border-b border-[#fafafa]"></div>
          <div className="border-b border-[#fafafa]"></div>
          <div className="border-b border-[#fafafa]"></div>
        </div>

        {/* Dual side breakdown bars & cumulative curves */}
        <div className="relative h-56 w-full flex items-end gap-1.5 px-3 z-10">
          {allLevels.map((lv, idx) => {
            const isBuy = lv.type === 'buy';
            const barHeightPct = Math.max(8, Math.min(95, (lv.volume / maxVolume) * 90));
            const cumHeightPct = Math.max(5, Math.min(95, (lv.cumulative / maxCumulative) * 90));

            return (
              <div
                key={`${lv.type}-${lv.price}-${idx}`}
                className="flex-1 flex flex-col items-center justify-end h-full group relative"
              >
                {/* Cumulative point pip */}
                <div
                  className={`absolute w-2 h-2 rounded-full z-20 transition-all ${
                    isBuy ? 'bg-[#4d8dff]' : 'bg-[#ff4d4d]'
                  }`}
                  style={{ bottom: `${cumHeightPct}%` }}
                />

                {/* Bar volume */}
                <div
                  className={`w-full rounded-t transition-all ${
                    isBuy
                      ? 'bg-[#4d8dff] opacity-35 group-hover:opacity-75'
                      : 'bg-[#ff4d4d] opacity-35 group-hover:opacity-75'
                  }`}
                  style={{ height: `${barHeightPct}%` }}
                />

                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col z-30 bg-[#262730] border border-[#31333f] text-xs rounded p-2.5 shadow-xl whitespace-nowrap pointer-events-none">
                  <div className="font-semibold text-[#fafafa]">
                    {isBuy ? 'Ordre d\'Achat' : 'Ordre de Vente'}
                  </div>
                  <div className="text-[#808495] mt-1">
                    Prix: <span className="text-[#fafafa] font-mono">{fmtIsk(lv.price)}</span>
                  </div>
                  <div className="text-[#808495]">
                    Volume niveau: <span className="text-[#fafafa] font-mono">{fmtNumber(lv.volume)}</span>
                  </div>
                  <div className="text-[#808495]">
                    Volume cumulé: <span className="text-[#fafafa] font-mono">{fmtNumber(lv.cumulative)}</span>
                  </div>
                  <div className="text-[#808495]">
                    Ordres: <span className="text-[#fafafa] font-mono">{lv.orders}</span>
                  </div>
                </div>

                {/* Bottom price tick label */}
                <div className="text-[10px] text-[#808495] truncate w-full text-center mt-1 font-mono">
                  {lv.price >= 1000000 ? `${(lv.price / 1000000).toFixed(1)}M` : lv.price >= 1000 ? `${(lv.price / 1000).toFixed(0)}k` : lv.price.toFixed(1)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Axes labels */}
        <div className="flex justify-between items-center text-[11px] text-[#808495] px-2 pt-2 border-t border-[#262730]">
          <span>Prix min: {fmtIsk(allLevels[0]?.price)}</span>
          <span className="font-medium text-[#fafafa]">Prix (ISK) · Profondeur cumulée et volume</span>
          <span>Prix max: {fmtIsk(allLevels[allLevels.length - 1]?.price)}</span>
        </div>
      </div>

      {/* Raw Order Table snippet matching raw view */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <div>
          <div className="font-semibold text-[#4d8dff] mb-2 flex items-center justify-between">
            <span>Ordres d'Achat (Niveaux agrégés)</span>
            <span className="text-[#808495]">{buyLevels.length} niveaux</span>
          </div>
          <div className="bg-[#161821] rounded border border-[#262730] overflow-x-auto">
            <table className="w-full text-left font-mono">
              <thead className="bg-[#262730] text-[#808495]">
                <tr>
                  <th className="p-2">Prix (ISK)</th>
                  <th className="p-2 text-right">Volume</th>
                  <th className="p-2 text-right">Cumulé</th>
                  <th className="p-2 text-right">Ordres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262730]">
                {buyLevels.slice(0, 5).map((l, i) => (
                  <tr key={i} className="hover:bg-[#20222c]">
                    <td className="p-2 text-[#4d8dff]">{fmtIsk(l.price)}</td>
                    <td className="p-2 text-right text-[#fafafa]">{fmtNumber(l.volume)}</td>
                    <td className="p-2 text-right text-[#808495]">{fmtNumber(l.cumulative)}</td>
                    <td className="p-2 text-right text-[#808495]">{l.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="font-semibold text-[#ff4d4d] mb-2 flex items-center justify-between">
            <span>Ordres de Vente (Niveaux agrégés)</span>
            <span className="text-[#808495]">{sellLevels.length} niveaux</span>
          </div>
          <div className="bg-[#161821] rounded border border-[#262730] overflow-x-auto">
            <table className="w-full text-left font-mono">
              <thead className="bg-[#262730] text-[#808495]">
                <tr>
                  <th className="p-2">Prix (ISK)</th>
                  <th className="p-2 text-right">Volume</th>
                  <th className="p-2 text-right">Cumulé</th>
                  <th className="p-2 text-right">Ordres</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262730]">
                {sellLevels.slice(0, 5).map((l, i) => (
                  <tr key={i} className="hover:bg-[#20222c]">
                    <td className="p-2 text-[#ff4d4d]">{fmtIsk(l.price)}</td>
                    <td className="p-2 text-right text-[#fafafa]">{fmtNumber(l.volume)}</td>
                    <td className="p-2 text-right text-[#808495]">{fmtNumber(l.cumulative)}</td>
                    <td className="p-2 text-right text-[#808495]">{l.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
