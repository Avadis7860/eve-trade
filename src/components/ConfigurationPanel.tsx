import React, { useState } from 'react';
import { MarketHub, FinancialConfig, TradeStrategy } from '../types';
import { Save, RefreshCw, Sliders, ShieldCheck, MapPin, Truck } from 'lucide-react';

interface ConfigurationPanelProps {
  hubs: MarketHub[];
  onToggleHub: (hubId: string) => void;
  config: FinancialConfig;
  onUpdateConfig: (newConfig: FinancialConfig) => void;
  strategy: TradeStrategy;
  onChangeStrategy: (strategy: TradeStrategy) => void;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  hubs,
  onToggleHub,
  config,
  onUpdateConfig,
  strategy,
  onChangeStrategy,
}) => {
  const [form, setForm] = useState<FinancialConfig>(config);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onUpdateConfig(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-[#161821] border border-[#262730] rounded-xl p-5 text-xs text-[#fafafa] space-y-6">
      <div className="flex items-center justify-between border-b border-[#262730] pb-3">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#ff4b4b]" />
          Paramètres Stratégiques du Moteur de Trading
        </h2>
        {saved && (
          <span className="text-green-400 font-semibold flex items-center gap-1 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" /> Enregistré
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Hubs Actifs */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[#808495] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            Hubs Commerciaux Inclus (Matrice A ↔ B)
          </h3>
          <div className="space-y-2">
            {hubs.map((h) => (
              <label
                key={h.id}
                className="flex items-center justify-between p-2 rounded bg-[#0e1117] border border-[#262730] cursor-pointer hover:border-[#31333f]"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={h.active}
                    onChange={() => onToggleHub(h.id)}
                    className="rounded bg-[#262730] text-[#ff4b4b] focus:ring-0"
                  />
                  <span className="font-semibold text-[#fafafa]">{h.name}</span>
                </div>
                <span className="text-[10px] text-[#808495]">
                  {h.region} (Sec {h.security_status.toFixed(1)})
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* 2. Stratégie & Frais de Marché */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[#808495] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            Stratégie Commerciale &amp; Taxes
          </h3>

          <div>
            <label className="block text-[#808495] mb-1">Mode d'Exécution Cible</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChangeStrategy('relist')}
                className={`p-2 rounded border text-left ${
                  strategy === 'relist'
                    ? 'bg-[#ff4b4b]/20 border-[#ff4b4b] text-[#ff4b4b] font-bold'
                    : 'bg-[#0e1117] border-[#262730] text-[#808495]'
                }`}
              >
                <div>Buy &amp; Relist</div>
                <div className="text-[10px] opacity-75 font-normal">Pose d'un sell order cible</div>
              </button>
              <button
                type="button"
                onClick={() => onChangeStrategy('immediate')}
                className={`p-2 rounded border text-left ${
                  strategy === 'immediate'
                    ? 'bg-[#ff4b4b]/20 border-[#ff4b4b] text-[#ff4b4b] font-bold'
                    : 'bg-[#0e1117] border-[#262730] text-[#808495]'
                }`}
              >
                <div>Vente Immédiate</div>
                <div className="text-[10px] opacity-75 font-normal">Revente sur buy order direct</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#808495] mb-1">Frais de Courtage</label>
              <input
                type="number"
                step="0.001"
                value={form.broker_fee}
                onChange={(e) => setForm({ ...form, broker_fee: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1.5 rounded font-mono"
              />
              <span className="text-[10px] text-[#808495]">{(form.broker_fee * 100).toFixed(2)}%</span>
            </div>

            <div>
              <label className="block text-[#808495] mb-1">Taxe de Vente (CCP)</label>
              <input
                type="number"
                step="0.001"
                value={form.sales_tax}
                onChange={(e) => setForm({ ...form, sales_tax: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1.5 rounded font-mono"
              />
              <span className="text-[10px] text-[#808495]">{(form.sales_tax * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* 3. Logistique Transport & Filtres de Risque */}
        <div className="space-y-3">
          <h3 className="font-semibold text-[#808495] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-purple-400" />
            Capacité Cargo &amp; Logistique
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#808495] mb-1">Capacité Cargo (m³)</label>
              <input
                type="number"
                value={form.max_cargo_m3}
                onChange={(e) => setForm({ ...form, max_cargo_m3: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1.5 rounded font-mono"
              />
            </div>

            <div>
              <label className="block text-[#808495] mb-1">Coût par m³ (ISK)</label>
              <input
                type="number"
                value={form.transport_cost_per_m3}
                onChange={(e) => setForm({ ...form, transport_cost_per_m3: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1.5 rounded font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[#808495] mb-1">Max Jours Vente</label>
              <input
                type="number"
                value={form.max_days_to_sell}
                onChange={(e) => setForm({ ...form, max_days_to_sell: parseFloat(e.target.value) || 1 })}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1.5 rounded font-mono"
              />
            </div>

            <div>
              <label className="block text-[#808495] mb-1">Max Cap. / Trade</label>
              <input
                type="number"
                step="10000000"
                value={form.max_capital_per_trade}
                onChange={(e) => setForm({ ...form, max_capital_per_trade: parseFloat(e.target.value) || 0 })}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1.5 rounded font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-[#262730]">
        <button
          onClick={handleSave}
          className="px-5 py-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold rounded-md flex items-center gap-2 shadow transition-colors"
        >
          <Save className="w-4 h-4" />
          <span>Appliquer la Configuration</span>
        </button>
      </div>
    </div>
  );
};
