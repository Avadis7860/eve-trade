import React, { useState, useMemo, useEffect } from 'react';
import {
  MARKET_HUBS,
  KNOWN_TYPES,
  INITIAL_TABLE_COUNTS,
  generateMockOrders,
  INITIAL_OPPORTUNITIES,
} from './data/mockData';
import { MarketHub, RawMarketOrder, AppSettings, Opportunity } from './types';
import { PriceLadder } from './engine/ladder';
import { ProfitCalculator } from './engine/profit';
import { QuantityCalculator } from './engine/quantity';
import { fmtIsk, fmtPct, fmtAge, fmtNumber } from './engine/money';
import { CarnetChart } from './components/CarnetChart';
import { Sidebar } from './components/Sidebar';
import { EsiService } from './services/esi';
import { TrendingUp, AlertTriangle, CheckCircle, Database } from 'lucide-react';

export const App: React.FC = () => {
  const [hubs] = useState<MarketHub[]>(MARKET_HUBS);
  const [selectedHub, setSelectedHub] = useState<MarketHub>(MARKET_HUBS[0]);
  const [types] = useState(KNOWN_TYPES);
  const [selectedTypeId, setSelectedTypeId] = useState<number>(34); // Default: Tritanium

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('eve_trade_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return {
      default_hub: 'Jita',
      available_capital: 500000000.0,
      broker_fee: 0.0145,
      sales_tax: 0.035,
    };
  });

  // Table counts
  const [counts, setCounts] = useState(INITIAL_TABLE_COUNTS);

  // Orders cache (keyed by `${region_id}-${type_id}`)
  const [orderCache, setOrderCache] = useState<Record<string, RawMarketOrder[]>>({});
  const [lastSyncMeta, setLastSyncMeta] = useState<Record<string, { captured_at: string; expires_at: string }>>({});

  // Opportunities
  const [opportunities] = useState<Opportunity[]>(INITIAL_OPPORTUNITIES);

  // Live ESI Sync state
  const [isSyncingEsi, setIsSyncingEsi] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const cacheKey = `${selectedHub.region_id}-${selectedTypeId}`;

  // Get or initialize orders for the selected (hub, type)
  useEffect(() => {
    if (!orderCache[cacheKey]) {
      const generated = generateMockOrders(selectedHub.region_id, selectedTypeId);
      setOrderCache((prev) => ({ ...prev, [cacheKey]: generated }));
      const now = new Date();
      setLastSyncMeta((prev) => ({
        ...prev,
        [cacheKey]: {
          captured_at: new Date(now.getTime() - 42 * 1000).toISOString(),
          expires_at: new Date(now.getTime() + 258 * 1000).toISOString(),
        },
      }));
    }
  }, [cacheKey, selectedHub.region_id, selectedTypeId, orderCache]);

  const rawOrders = orderCache[cacheKey] || [];
  const syncInfo = lastSyncMeta[cacheKey];

  // Aggregated Price Ladders
  const { sellLevels, buyLevels, bestSell, bestBuy, spread, spreadPct } = useMemo(() => {
    const sells: [number, number][] = rawOrders
      .filter((o) => !o.is_buy_order)
      .map((o) => [o.price, o.volume_remain]);
    const buys: [number, number][] = rawOrders
      .filter((o) => o.is_buy_order)
      .map((o) => [o.price, o.volume_remain]);

    const sLevels = PriceLadder.aggregate(sells, false); // Ascending
    const bLevels = PriceLadder.aggregate(buys, true);   // Descending

    const bSell = PriceLadder.bestPrice(sLevels);
    const bBuy = PriceLadder.bestPrice(bLevels);

    const sp = bSell !== null && bBuy !== null ? bSell - bBuy : null;
    const spPct = sp !== null && bSell ? sp / bSell : null;

    return {
      sellLevels: sLevels,
      buyLevels: bLevels,
      bestSell: bSell,
      bestBuy: bBuy,
      spread: sp,
      spreadPct: spPct,
    };
  }, [rawOrders]);

  // Simulation: quantity, effective fill, profit
  const simulation = useMemo(() => {
    if (!bestSell || sellLevels.length === 0 || buyLevels.length === 0) {
      return null;
    }

    const totalSellVolume = sellLevels.reduce((acc, lv) => acc + lv.volume, 0);

    const qty = QuantityCalculator.compute(
      bestSell,
      totalSellVolume,
      settings.available_capital,
      settings.broker_fee
    );

    const fill = PriceLadder.fill(sellLevels, qty.max_trade_quantity);
    const effBuy = fill.effective_price;

    const disposal = PriceLadder.fill(buyLevels, fill.filled_quantity);
    const effSell = disposal.effective_price;

    const profit = ProfitCalculator.compute(
      effBuy,
      effSell,
      disposal.filled_quantity,
      settings.broker_fee,
      settings.sales_tax
    );

    return {
      qty,
      fill,
      disposal,
      effBuy,
      effSell,
      profit,
    };
  }, [bestSell, sellLevels, buyLevels, settings]);

  const currentType = types.find((t) => t.type_id === selectedTypeId) || {
    type_id: selectedTypeId,
    name: `? (id ${selectedTypeId})`,
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('eve_trade_settings', JSON.stringify(newSettings));
  };

  const handleRefresh = () => {
    const generated = generateMockOrders(selectedHub.region_id, selectedTypeId);
    setOrderCache((prev) => ({ ...prev, [cacheKey]: generated }));
    const now = new Date();
    setLastSyncMeta((prev) => ({
      ...prev,
      [cacheKey]: {
        captured_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 300 * 1000).toISOString(),
      },
    }));
    setSyncMessage('Snapshot local rafraîchi.');
    setTimeout(() => setSyncMessage(null), 3000);
  };

  const handleSyncLiveEsi = async () => {
    setIsSyncingEsi(true);
    setSyncMessage('Appel de l\'API CCP ESI Tranquility...');
    try {
      const liveOrders = await EsiService.fetchLiveOrders(selectedHub.region_id, selectedTypeId);
      if (liveOrders.length > 0) {
        setOrderCache((prev) => ({ ...prev, [cacheKey]: liveOrders }));
        const now = new Date();
        setLastSyncMeta((prev) => ({
          ...prev,
          [cacheKey]: {
            captured_at: now.toISOString(),
            expires_at: new Date(now.getTime() + 300 * 1000).toISOString(),
          },
        }));
        setCounts((prev) => ({
          ...prev,
          esi_cache: prev.esi_cache + 1,
          market_orders: prev.market_orders + liveOrders.length,
        }));
        setSyncMessage(`Succès : ${liveOrders.length} ordres réels synchronisés depuis ESI.`);
      } else {
        setSyncMessage('Aucun ordre actif trouvé sur ESI pour cette sélection.');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setSyncMessage(`Erreur ESI (${errMsg}). Utilisation du miroir local.`);
    } finally {
      setIsSyncingEsi(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#0e1117] text-[#fafafa]">
      {/* Sidebar */}
      <Sidebar
        hubs={hubs}
        selectedHub={selectedHub}
        onSelectHub={setSelectedHub}
        types={types}
        selectedTypeId={selectedTypeId}
        onSelectTypeId={setSelectedTypeId}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onRefresh={handleRefresh}
        onSyncLiveEsi={handleSyncLiveEsi}
        isSyncingEsi={isSyncingEsi}
        syncMessage={syncMessage}
      />

      {/* Main Page Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl overflow-y-auto">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-[#fafafa] flex items-center gap-3">
            <span>🚀</span> EVE Trade — {selectedHub.name}
          </h1>
          <p className="text-xs text-[#808495] mt-1">
            Région {selectedHub.region_id} · système {selectedHub.system_id}
            {selectedHub.station_id
              ? ` · station ${selectedHub.station_id}`
              : ' · station non résolue'}
          </p>
        </div>

        {/* 4 DB Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium flex items-center gap-1.5 mb-1">
              <Database className="w-3.5 h-3.5" />
              <span>Ordres en DB</span>
            </div>
            <div className="text-2xl font-bold font-mono text-[#fafafa]">
              {fmtNumber(counts.market_orders)}
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Types nommés</div>
            <div className="text-2xl font-bold font-mono text-[#fafafa]">
              {fmtNumber(counts.types)}
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Systèmes</div>
            <div className="text-2xl font-bold font-mono text-[#fafafa]">
              {fmtNumber(counts.solar_systems)}
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Entrées cache ESI</div>
            <div className="text-2xl font-bold font-mono text-[#fafafa]">
              {fmtNumber(counts.esi_cache)}
            </div>
          </div>
        </div>

        <div className="border-t border-[#262730] my-6"></div>

        {/* Carnet d'ordres Header */}
        <div className="mb-4">
          <h2 className="text-xl font-bold tracking-tight text-[#fafafa]">
            Carnet d'ordres — {currentType.name}
          </h2>
          {syncInfo ? (
            <p className="text-xs text-[#808495] mt-1">
              Dernière sync : {fmtAge(syncInfo.captured_at)} (expire{' '}
              {fmtAge(syncInfo.expires_at)})
            </p>
          ) : (
            <p className="text-xs text-[#808495] mt-1">
              Pas encore de snapshot pour ce couple région/objet — lancez la synchronisation.
            </p>
          )}
        </div>

        {/* 4 Order Book Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Meilleur sell</div>
            <div className="text-xl font-bold font-mono text-[#ff4d4d]">
              {fmtIsk(bestSell)}
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Meilleur buy</div>
            <div className="text-xl font-bold font-mono text-[#4d8dff]">
              {fmtIsk(bestBuy)}
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Spread</div>
            <div className="text-xl font-bold font-mono text-[#fafafa]">
              {fmtIsk(spread)}
            </div>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="text-xs text-[#808495] font-medium mb-1">Spread %</div>
            <div className="text-xl font-bold font-mono text-[#fafafa]">
              {fmtPct(spreadPct)}
            </div>
          </div>
        </div>

        {/* Depth & Volume Chart */}
        <div className="mb-8">
          <CarnetChart sellLevels={sellLevels} buyLevels={buyLevels} />
        </div>

        <div className="border-t border-[#262730] my-8"></div>

        {/* Trade Simulator */}
        <div className="mb-8">
          <h2 className="text-xl font-bold tracking-tight text-[#fafafa] mb-4">
            Simulateur de trade
          </h2>

          {simulation ? (
            <div className="space-y-4">
              {simulation.profit.is_profitable ? (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-950/40 border border-green-700/50 text-green-300 text-sm">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-400" />
                  <span>
                    Trade rentable : <strong>{fmtIsk(simulation.profit.net_profit)}</strong> net
                    sur <strong>{fmtNumber(simulation.profit.quantity)}</strong> unités.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-300 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                  <span>Pas de profit avec les ordres locaux actuels.</span>
                </div>
              )}

              {/* 5 Primary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1 leading-tight">
                    Qté tradable (capital × volume)
                  </div>
                  <div className="text-lg font-bold font-mono text-[#fafafa]">
                    {fmtNumber(simulation.qty.max_trade_quantity)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">
                    Prix d'achat moyen
                  </div>
                  <div className="text-lg font-bold font-mono text-[#fafafa]">
                    {fmtIsk(simulation.effBuy)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">
                    Prix de revente moyen
                  </div>
                  <div className="text-lg font-bold font-mono text-[#fafafa]">
                    {fmtIsk(simulation.effSell)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">Profit net</div>
                  <div
                    className={`text-lg font-bold font-mono ${
                      simulation.profit.net_profit > 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {fmtIsk(simulation.profit.net_profit)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">ROI</div>
                  <div
                    className={`text-lg font-bold font-mono ${
                      simulation.profit.roi > 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {fmtPct(simulation.profit.roi)}
                  </div>
                </div>
              </div>

              {/* 4 Secondary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">Coût d'achat</div>
                  <div className="text-base font-bold font-mono text-[#fafafa]">
                    {fmtIsk(simulation.profit.purchase_cost)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">
                    Frais de courtage
                  </div>
                  <div className="text-base font-bold font-mono text-[#fafafa]">
                    {fmtIsk(simulation.profit.broker_cost)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">
                    Taxe de vente
                  </div>
                  <div className="text-base font-bold font-mono text-[#fafafa]">
                    {fmtIsk(simulation.profit.sales_tax_cost)}
                  </div>
                </div>

                <div className="bg-[#161821] border border-[#262730] rounded-lg p-3.5">
                  <div className="text-[11px] text-[#808495] font-medium mb-1">Marge</div>
                  <div className="text-base font-bold font-mono text-[#fafafa]">
                    {fmtPct(simulation.profit.margin)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#262730] border border-[#31333f] rounded-lg p-6 text-center text-[#808495] text-sm">
              Simulation impossible : il faut à la fois des ordres de vente et d'achat.
            </div>
          )}
        </div>

        <div className="border-t border-[#262730] my-8"></div>

        {/* Saved Opportunities */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight text-[#fafafa] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#ff4b4b]" />
              Opportunités enregistrées
            </h2>
            <span className="text-xs text-[#808495]">
              {opportunities.length} opportunités détectées
            </span>
          </div>

          <div className="bg-[#161821] border border-[#262730] rounded-lg overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#262730] text-[#808495] uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3">Objet</th>
                  <th className="p-3">Achat</th>
                  <th className="p-3">Vente</th>
                  <th className="p-3 text-right">Prix Achat</th>
                  <th className="p-3 text-right">Prix Vente</th>
                  <th className="p-3 text-right">Qté</th>
                  <th className="p-3 text-right">Profit Net</th>
                  <th className="p-3 text-right">ROI</th>
                  <th className="p-3 text-right">Marge</th>
                  <th className="p-3 text-right">Capital Requis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262730]">
                {opportunities.map((opp, idx) => (
                  <tr key={idx} className="hover:bg-[#20222c] transition-colors">
                    <td className="p-3 font-semibold text-[#fafafa]">
                      {opp.type_name || `ID ${opp.type_id}`}
                    </td>
                    <td className="p-3 text-[#808495]">{opp.buy_region_name}</td>
                    <td className="p-3 text-[#808495]">{opp.sell_region_name}</td>
                    <td className="p-3 text-right text-[#4d8dff]">{fmtIsk(opp.buy_price)}</td>
                    <td className="p-3 text-right text-[#ff4d4d]">{fmtIsk(opp.sell_price)}</td>
                    <td className="p-3 text-right text-[#fafafa]">{fmtNumber(opp.quantity)}</td>
                    <td className="p-3 text-right text-green-400 font-bold">
                      {fmtIsk(opp.net_profit)}
                    </td>
                    <td className="p-3 text-right text-green-400">{fmtPct(opp.roi)}</td>
                    <td className="p-3 text-right text-[#808495]">{fmtPct(opp.margin)}</td>
                    <td className="p-3 text-right text-[#808495]">{fmtIsk(opp.capital_required)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
export default App;
