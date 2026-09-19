import React, { useState } from 'react';
import { MarketHub, EveType, AppSettings } from '../types';
import { RefreshCw, Save, Globe, Check } from 'lucide-react';

interface SidebarProps {
  hubs: MarketHub[];
  selectedHub: MarketHub;
  onSelectHub: (hub: MarketHub) => void;
  types: EveType[];
  selectedTypeId: number;
  onSelectTypeId: (typeId: number) => void;
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  onRefresh: () => void;
  onSyncLiveEsi: () => void;
  isSyncingEsi: boolean;
  syncMessage: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  hubs,
  selectedHub,
  onSelectHub,
  types,
  selectedTypeId,
  onSelectTypeId,
  settings,
  onSaveSettings,
  onRefresh,
  onSyncLiveEsi,
  isSyncingEsi,
  syncMessage,
}) => {
  const [capital, setCapital] = useState<number>(settings.available_capital);
  const [brokerFee, setBrokerFee] = useState<number>(settings.broker_fee);
  const [salesTax, setSalesTax] = useState<number>(settings.sales_tax);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const handleSave = () => {
    onSaveSettings({
      default_hub: selectedHub.name,
      available_capital: capital,
      broker_fee: brokerFee,
      sales_tax: salesTax,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <aside className="w-full md:w-80 bg-[#161821] border-r border-[#262730] flex flex-col h-full min-h-screen p-5 text-[#fafafa] select-none">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">⚙️</span>
        <h2 className="text-xl font-bold tracking-tight">Paramètres</h2>
      </div>

      {/* Hub Select */}
      <div className="mb-5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[#808495] mb-2">
          Hub
        </label>
        <select
          value={selectedHub.name}
          onChange={(e) => {
            const found = hubs.find((h) => h.name === e.target.value);
            if (found) onSelectHub(found);
          }}
          className="w-full bg-[#262730] border border-[#31333f] text-[#fafafa] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#ff4b4b] cursor-pointer"
        >
          {hubs.map((h) => (
            <option key={h.name} value={h.name}>
              {h.name} ({h.region})
            </option>
          ))}
        </select>
      </div>

      {/* Object (Item) Select */}
      <div className="mb-6">
        <label className="block text-xs font-semibold uppercase tracking-wider text-[#808495] mb-2">
          Objet
        </label>
        <select
          value={selectedTypeId}
          onChange={(e) => onSelectTypeId(Number(e.target.value))}
          className="w-full bg-[#262730] border border-[#31333f] text-[#fafafa] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#ff4b4b] cursor-pointer"
        >
          {types.map((t) => (
            <option key={t.type_id} value={t.type_id}>
              {t.name} (id {t.type_id})
            </option>
          ))}
        </select>
      </div>

      <div className="border-t border-[#262730] my-4"></div>

      {/* Capital & Fees */}
      <div className="mb-6 space-y-4">
        <h3 className="text-sm font-bold text-[#fafafa] tracking-wide">
          Capital &amp; frais
        </h3>

        <div>
          <label className="block text-xs text-[#808495] mb-1">
            Capital disponible (ISK)
          </label>
          <input
            type="number"
            min="0"
            step="10000000"
            value={capital}
            onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
            className="w-full bg-[#262730] border border-[#31333f] text-[#fafafa] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#ff4b4b]"
          />
        </div>

        <div>
          <label className="block text-xs text-[#808495] mb-1">
            Frais de courtage
          </label>
          <input
            type="number"
            min="0"
            max="0.2"
            step="0.001"
            value={brokerFee}
            onChange={(e) => setBrokerFee(parseFloat(e.target.value) || 0)}
            className="w-full bg-[#262730] border border-[#31333f] text-[#fafafa] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#ff4b4b]"
          />
          <span className="text-[11px] text-[#808495] mt-0.5 block">
            {(brokerFee * 100).toFixed(2)} %
          </span>
        </div>

        <div>
          <label className="block text-xs text-[#808495] mb-1">
            Taxe de vente
          </label>
          <input
            type="number"
            min="0"
            max="0.2"
            step="0.001"
            value={salesTax}
            onChange={(e) => setSalesTax(parseFloat(e.target.value) || 0)}
            className="w-full bg-[#262730] border border-[#31333f] text-[#fafafa] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#ff4b4b]"
          />
          <span className="text-[11px] text-[#808495] mt-0.5 block">
            {(salesTax * 100).toFixed(2)} %
          </span>
        </div>

        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] border border-[#31333f] rounded-md py-2 px-3 text-sm font-medium transition-colors"
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-green-400">Config enregistrée !</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>💾 Enregistrer dans config.yaml</span>
            </>
          )}
        </button>
      </div>

      <div className="border-t border-[#262730] my-4"></div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={onRefresh}
          className="w-full flex items-center justify-center gap-2 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] border border-[#31333f] rounded-md py-2 px-3 text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>🔄 Rafraîchir</span>
        </button>

        <button
          onClick={onSyncLiveEsi}
          disabled={isSyncingEsi}
          className="w-full flex items-center justify-center gap-2 bg-[#ff4b4b]/20 hover:bg-[#ff4b4b]/30 text-[#ff4b4b] border border-[#ff4b4b]/40 rounded-md py-2 px-3 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Globe className={`w-4 h-4 ${isSyncingEsi ? 'animate-spin' : ''}`} />
          <span>{isSyncingEsi ? 'Sync ESI en cours...' : '⚡ Sync Live ESI (CCP)'}</span>
        </button>

        {syncMessage && (
          <div className="text-xs p-2 rounded bg-[#262730] border border-[#31333f] text-[#808495]">
            {syncMessage}
          </div>
        )}
      </div>

      <div className="mt-auto pt-6 text-xs text-[#808495] leading-relaxed">
        <p>Miroir local : <code className="text-[#fafafa]">data/eve_trade.db</code></p>
        <p className="mt-1">Mode lecture / simulation pure.</p>
      </div>
    </aside>
  );
};
