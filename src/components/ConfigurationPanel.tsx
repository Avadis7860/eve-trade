import React, { useState, useEffect } from 'react';
import { MarketHub, FinancialConfig, TradeStrategy, TreasurySourceMode } from '../types';
import { FeeCalculator } from '../engine/fee';
import { selectCorporationWalletDivision } from '../engine/financialConfig';
import { EsiService } from '../services/esi';
import { syncCorporationTreasury } from '../services/corporationTreasurySync';
import { TreasuryEngine } from '../engine/treasury';
import { useAuth } from '../context/AuthProvider';
import {
  Save,
  Sliders,
  ShieldCheck,
  MapPin,
  Truck,
  GraduationCap,
  Database,
  Trash2,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  Building2,
  Wallet,
  Users,
  Coins,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface ConfigurationPanelProps {
  hubs: MarketHub[];
  onToggleHub: (hubId: string) => void;
  onSetHubsActive?: (activeIds: string[]) => void;
  config: FinancialConfig;
  onUpdateConfig: (newConfig: FinancialConfig) => void;
  strategy: TradeStrategy;
  onChangeStrategy: (strategy: TradeStrategy) => void;
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  hubs,
  onToggleHub,
  onSetHubsActive,
  config,
  onUpdateConfig,
  strategy,
  onChangeStrategy,
}) => {
  const { characterSession, linkedCharacters } = useAuth();
  const [form, setForm] = useState<FinancialConfig>({
    ...config,
    treasury_source_mode: config.treasury_source_mode ?? 'corporation',
    corporation_wallet_division: config.corporation_wallet_division ?? 1,
    corporation_wallet_balance: config.corporation_wallet_balance,
    corporation_wallet_source: config.corporation_wallet_source ?? 'unavailable',
    corporation_name: config.corporation_name ?? 'Ma Corporation',
    enable_transport_costs: config.enable_transport_costs ?? false,
    accounting_level: config.accounting_level ?? 5,
    broker_relations_level: config.broker_relations_level ?? 5,
    faction_standing: config.faction_standing ?? 0,
    corp_standing: config.corp_standing ?? 0,
  });
  const [saved, setSaved] = useState(false);
  const [cacheStats, setCacheStats] = useState(() => EsiService.getOrderDatabaseStats());
  const [isSyncingCorp, setIsSyncingCorp] = useState(false);
  const [corpSyncStatus, setCorpSyncStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  // Keep corporation fields aligned with authoritative external config updates
  // without allowing an external ESI refresh to destroy an unsaved manual
  // budget selected locally in this form.
  useEffect(() => {
    setForm((prev) => {
      const preservingLocalManualEdits =
        prev.corporation_wallet_source === 'manual' &&
        config.corporation_wallet_source === 'esi';

      if (preservingLocalManualEdits) {
        return prev;
      }

      return {
        ...prev,
        corporation_id: config.corporation_id,
        corporation_name: config.corporation_name ?? prev.corporation_name,
        corporation_wallet_division: config.corporation_wallet_division ?? prev.corporation_wallet_division,
        corporation_wallet_balance: config.corporation_wallet_balance,
        corporation_wallet_source: config.corporation_wallet_source ?? 'unavailable',
        corporation_divisions: config.corporation_divisions,
      };
    });
  }, [
    config.corporation_id,
    config.corporation_name,
    config.corporation_wallet_division,
    config.corporation_wallet_balance,
    config.corporation_wallet_source,
    config.corporation_divisions,
  ]);

  // Compute live treasury resolution for preview
  const treasuryResolution = TreasuryEngine.resolveEffectiveCapital(
    form,
    linkedCharacters,
    characterSession?.character_id
  );

  const handleSave = () => {
    // When saving, also synchronize available_capital with effective treasury capital
    const resolved = TreasuryEngine.resolveEffectiveCapital(
      form,
      linkedCharacters,
      characterSession?.character_id
    );
    const updatedForm: FinancialConfig = {
      ...form,
      // Corporation capital is a distinct funding source and must not overwrite
      // the manual/character-oriented available_capital field.
      available_capital:
        form.treasury_source_mode === 'corporation'
          ? form.available_capital
          : resolved.effective_capital,
    };
    onUpdateConfig(updatedForm);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // Manual UI trigger delegates to the same corporation treasury sync boundary
  // used by the automatic character lifecycle.
  const handleSyncCorpWallets = async () => {
    if (!characterSession) {
      setCorpSyncStatus({
        success: false,
        message: 'Aucun personnage EVE SSO actif connecté.',
      });
      return;
    }

    setIsSyncingCorp(true);
    setCorpSyncStatus(null);

    try {
      const result = await syncCorporationTreasury({
        characterId: characterSession.character_id,
        accessToken: characterSession.access_token,
        division: form.corporation_wallet_division || 1,
      });

      if (result.ok) {
        setForm((prev) => ({
          ...prev,
          corporation_name: result.corporation.corporation_name,
          corporation_id: result.corporation.corporation_id,
          corporation_wallet_balance: result.selectedWallet.balance,
          corporation_wallet_source: 'esi',
          corporation_divisions: result.wallets,
        }));
        setCorpSyncStatus({
          success: true,
          message: `Synchronisé depuis ESI : ${result.corporation.corporation_name} (Division ${result.selectedWallet.division} : ${result.selectedWallet.balance.toLocaleString()} ISK)`,
        });
        return;
      }

      setForm((prev) => ({
        ...prev,
        ...(result.corporation
          ? {
              corporation_id: result.corporation.corporation_id,
              corporation_name: result.corporation.corporation_name,
            }
          : {}),
        corporation_wallet_source: 'unavailable',
      }));

      const detail = result.error || 'Synchronisation corporation indisponible.';
      const suffix = result.status ? ` (HTTP ${result.status})` : '';
      setCorpSyncStatus({
        success: false,
        message:
          result.stage === 'wallets'
            ? `Corporation détectée${result.corporation ? ` : ${result.corporation.corporation_name}` : ''}, mais les portefeuilles ESI sont indisponibles : ${detail}${suffix}`
            : `Synchronisation corporation impossible : ${detail}${suffix}`,
      });
    } catch (err) {
      setForm((prev) => ({
        ...prev,
        corporation_wallet_source: 'unavailable',
      }));
      setCorpSyncStatus({
        success: false,
        message: `Erreur lors de la synchronisation : ${String(err)}`,
      });
    } finally {
      setIsSyncingCorp(false);
    }
  };
  // Skill based auto recalculation
  const updateSkills = (accounting: number, brokerRelations: number, faction: number = 0, corp: number = 0) => {
    const newSalesTax = FeeCalculator.calculateSalesTaxRate(accounting);
    const newBrokerFee = FeeCalculator.calculateNpcBrokerFeeRate(brokerRelations, faction, corp);
    setForm((prev) => ({
      ...prev,
      accounting_level: accounting,
      broker_relations_level: brokerRelations,
      faction_standing: faction,
      corp_standing: corp,
      sales_tax: parseFloat(newSalesTax.toFixed(4)),
      broker_fee: parseFloat(newBrokerFee.toFixed(4)),
    }));
  };

  // Transport preset helpers
  const applyTransportPreset = (type: 'zero' | 'standard' | 'redfrog') => {
    if (type === 'zero') {
      setForm((prev) => ({
        ...prev,
        enable_transport_costs: false,
        transport_cost_per_m3: 0,
        transport_cost_per_jump: 0,
        collateral_fee_pct: 0,
      }));
    } else if (type === 'standard') {
      setForm((prev) => ({
        ...prev,
        enable_transport_costs: true,
        transport_cost_per_m3: 15,
        transport_cost_per_jump: 200000,
        collateral_fee_pct: 0.01,
      }));
    } else if (type === 'redfrog') {
      setForm((prev) => ({
        ...prev,
        enable_transport_costs: true,
        transport_cost_per_m3: 45,
        transport_cost_per_jump: 500000,
        collateral_fee_pct: 0.015,
      }));
    }
  };

  // Hub filter presets
  const handleHubPreset = (preset: 'top5' | 'top12' | 'all' | 'none') => {
    if (!onSetHubsActive) return;
    if (preset === 'top5') {
      onSetHubsActive(['jita', 'amarr', 'dodixie', 'rens', 'hek']);
    } else if (preset === 'top12') {
      onSetHubsActive([
        'jita', 'amarr', 'dodixie', 'rens', 'hek',
        'tash_murkon', 'agil', 'stacmon', 'oursulaert', 'villore', 'nonni', 'ashab'
      ]);
    } else if (preset === 'all') {
      onSetHubsActive(hubs.map((h) => h.id));
    } else if (preset === 'none') {
      onSetHubsActive(['jita']); // Keep at least Jita anchor
    }
  };

  const handleClearCache = () => {
    EsiService.clearOrderDatabase();
    setCacheStats(EsiService.getOrderDatabaseStats());
  };

  return (
    <div className="bg-[#161821] border border-[#262730] rounded-xl p-5 text-xs text-[#fafafa] space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#262730] pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-[#ff4b4b]" />
          <div>
            <h2 className="text-sm font-bold text-[#fafafa]">Configuration &amp; Paramètres Moteur EVE</h2>
            <p className="text-[11px] text-[#808495]">Ajustement des frais, calculs CCP Excel, gestion des stations et transport</p>
          </div>
        </div>
        {saved && (
          <span className="text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 text-xs animate-in fade-in">
            <ShieldCheck className="w-4 h-4" /> Paramètres appliqués avec succès !
          </span>
        )}
      </div>

      {/* Profil de Trading & Filtres de Risque Avancés */}
      <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-[#808495] text-[11px] mb-1 font-semibold">Profil de Trader :</label>
          <select
            value={form.trader_profile || 'balanced'}
            onChange={(e) => setForm({ ...form, trader_profile: e.target.value as any })}
            className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-1.5 rounded text-xs"
          >
            <option value="balanced">⚖️ Équilibré (Standard)</option>
            <option value="highsec_daytrader">⚡ Day-Trader High-Sec (Rotation)</option>
            <option value="heavy_hauler">🚛 Fret Lourd / Hauler</option>
            <option value="station_trader">🏛️ Station Trader (0 Saut)</option>
          </select>
        </div>

        <div>
          <label className="block text-[#808495] text-[11px] mb-1 font-semibold">Part. Marché Max / Jour (%) :</label>
          <input
            type="number"
            min="5"
            max="100"
            step="5"
            value={Math.round((form.max_market_participation_pct ?? 0.25) * 100)}
            onChange={(e) => setForm({ ...form, max_market_participation_pct: (parseFloat(e.target.value) || 25) / 100 })}
            className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-1.5 rounded font-mono text-xs"
          />
        </div>

        <div className="flex flex-col justify-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.avoid_chokepoints ?? false}
              onChange={(e) => setForm({ ...form, avoid_chokepoints: e.target.checked })}
              className="w-4 h-4 rounded bg-[#262730] text-[#ff4b4b] focus:ring-0 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-[#cfd3dc]">Éviter coupe-gorges (Uedama)</span>
          </label>
          <p className="text-[9px] text-[#808495] mt-0.5 ml-6">Rejette les routes traversant les zones de gank</p>
        </div>

        <div className="flex flex-col justify-center">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.exclude_citadels ?? false}
              onChange={(e) => setForm({ ...form, exclude_citadels: e.target.checked })}
              className="w-4 h-4 rounded bg-[#262730] text-[#ff4b4b] focus:ring-0 cursor-pointer"
            />
            <span className="text-[11px] font-semibold text-[#cfd3dc]">Exclure Citadelles Upwell</span>
          </label>
          <p className="text-[9px] text-[#808495] mt-0.5 ml-6">Stations NPC uniquement (aucun risque d'amarrage)</p>
        </div>
      </div>

      {/* 🏛️ GESTION DE LA TRÉSORERIE & PORTEFEUILLE DE CORPORATION / FLOTTE */}
      <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#262730] pb-2.5">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-[#fafafa] text-xs">
              Trésorerie &amp; Source de Financement des Achats
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#808495]">Capital effectif alloué :</span>
            <span className="px-2.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs">
              {treasuryResolution.effective_capital.toLocaleString()} ISK
            </span>
            <span className="text-[10px] text-[#808495]">({treasuryResolution.label})</span>
          </div>
        </div>

        {/* Sélection du mode de trésorerie */}
        <div>
          <label className="block text-[#808495] text-[11px] mb-2 font-semibold">
            Sélectionnez la source de fonds utilisée par le moteur pour calibrer les achats :
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Mode 1: Corporation */}
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, treasury_source_mode: 'corporation' }))}
              className={`p-3 rounded-lg border text-left transition-all ${
                (form.treasury_source_mode || 'corporation') === 'corporation'
                  ? 'bg-amber-500/15 border-amber-500/60 text-[#fafafa] shadow-md'
                  : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa] hover:border-[#3a3d4d]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5 text-amber-300">
                  <Building2 className="w-3.5 h-3.5" />
                  Portefeuille Corp
                </span>
                {(form.treasury_source_mode || 'corporation') === 'corporation' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <p className="text-[10px] text-[#a0a4b5] leading-tight">
                Utilise une division spécifique du wallet de votre corporation personnelle.
              </p>
            </button>

            {/* Mode 2: Flotte Consolidée */}
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, treasury_source_mode: 'fleet_consolidated' }))}
              className={`p-3 rounded-lg border text-left transition-all ${
                form.treasury_source_mode === 'fleet_consolidated'
                  ? 'bg-cyan-500/15 border-cyan-500/60 text-[#fafafa] shadow-md'
                  : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa] hover:border-[#3a3d4d]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5 text-cyan-300">
                  <Users className="w-3.5 h-3.5" />
                  Flotte Consolidée
                </span>
                {form.treasury_source_mode === 'fleet_consolidated' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                )}
              </div>
              <p className="text-[10px] text-[#a0a4b5] leading-tight">
                Cumul automatique des soldes de tous les personnages connectés.
              </p>
            </button>

            {/* Mode 3: Pilote Actif */}
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, treasury_source_mode: 'active_character' }))}
              className={`p-3 rounded-lg border text-left transition-all ${
                form.treasury_source_mode === 'active_character'
                  ? 'bg-emerald-500/15 border-emerald-500/60 text-[#fafafa] shadow-md'
                  : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa] hover:border-[#3a3d4d]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5 text-emerald-300">
                  <Wallet className="w-3.5 h-3.5" />
                  Wallet Pilote Actif
                </span>
                {form.treasury_source_mode === 'active_character' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </div>
              <p className="text-[10px] text-[#a0a4b5] leading-tight">
                Solde strict du personnage EVE actuellement sélectionné.
              </p>
            </button>

            {/* Mode 4: Budget Manuel */}
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, treasury_source_mode: 'manual_budget' }))}
              className={`p-3 rounded-lg border text-left transition-all ${
                form.treasury_source_mode === 'manual_budget'
                  ? 'bg-purple-500/15 border-purple-500/60 text-[#fafafa] shadow-md'
                  : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa] hover:border-[#3a3d4d]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5 text-purple-300">
                  <Coins className="w-3.5 h-3.5" />
                  Budget Fixe / Manuel
                </span>
                {form.treasury_source_mode === 'manual_budget' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                )}
              </div>
              <p className="text-[10px] text-[#a0a4b5] leading-tight">
                Allocation manuelle personnalisée (indépendante des portefeuilles ESI).
              </p>
            </button>
          </div>
        </div>

        {/* Détail de configuration quand le mode Corporation est actif */}
        {(form.treasury_source_mode || 'corporation') === 'corporation' && (
          <div className="p-3.5 bg-[#161821] rounded-lg border border-[#262730] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                Paramétrage de la Division du Wallet Corporation
              </div>
              <button
                type="button"
                onClick={handleSyncCorpWallets}
                disabled={isSyncingCorp || !characterSession}
                className="px-2.5 py-1 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] rounded text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingCorp ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
                {isSyncingCorp ? 'Lecture ESI...' : 'Synchroniser Divisions via ESI'}
              </button>
            </div>

            {corpSyncStatus && (
              <div
                className={`p-2 rounded text-[11px] flex items-center gap-1.5 ${
                  corpSyncStatus.success
                    ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                    : 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                }`}
              >
                {corpSyncStatus.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                <span>{corpSyncStatus.message}</span>
              </div>
            )}

            {/* Division Picker (Divisions 1 à 7) */}
            <div>
              <span className="text-[11px] text-[#808495] block mb-1 font-semibold">
                Division de Corporation à utiliser pour les achats (1ère division par défaut) :
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((divNum) => {
                  const isSelected = (form.corporation_wallet_division || 1) === divNum;
                  const divInfo = form.corporation_divisions?.find((d) => d.division === divNum);
                  return (
                    <button
                      key={divNum}
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          ...selectCorporationWalletDivision(prev, divNum),
                        }));
                      }}
                      className={`p-2 rounded text-center border transition-all ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                          : 'bg-[#0e1117] border-[#262730] text-[#808495] hover:text-[#fafafa] hover:border-[#3a3d4d]'
                      }`}
                    >
                      <div className="text-[11px]">
                        Div. {divNum} {divNum === 1 ? '★ (1ère)' : ''}
                      </div>
                      <div className="text-[9px] opacity-75 truncate">
                        {divInfo?.name || (divNum === 1 ? 'Master' : `Wallet ${divNum}`)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inputs: Nom Corp & Solde ISK de la Division */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[#808495] text-[11px] mb-1">Nom de la Corporation :</label>
                <input
                  type="text"
                  value={form.corporation_name || ''}
                  placeholder="Ex: Ma Corporation Personnelle"
                  onChange={(e) => setForm({ ...form, corporation_name: e.target.value })}
                  className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-1.5 rounded text-xs"
                />
              </div>

              <div>
                <label className="block text-[#808495] text-[11px] mb-1">
                  Solde disponible Division {form.corporation_wallet_division || 1} (ISK) :
                </label>
                <div className="text-[10px] text-[#808495] mb-1">
                  {form.corporation_wallet_source === 'esi'
                    ? 'Source : solde observé via ESI'
                    : form.corporation_wallet_source === 'manual'
                      ? 'Source : budget corporation manuel'
                      : 'Source : solde corporation ESI indisponible'}
                </div>
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  value={form.corporation_wallet_balance ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      corporation_wallet_balance: parseFloat(e.target.value) || 0,
                      corporation_wallet_source: 'manual',
                    })
                  }
                  className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-1.5 rounded font-mono text-xs"
                />
              </div>
            </div>

            {/* Boutons rapides pour ajuster le solde corporation */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="text-[10px] text-[#808495] mr-1">Raccourcis Solde Corp :</span>
              {[
                { label: '500M', val: 500000000 },
                { label: '1 Mrd', val: 1000000000 },
                { label: '2.5 Mrd', val: 2500000000 },
                { label: '5 Mrd', val: 5000000000 },
                { label: '10 Mrd', val: 10000000000 },
                { label: '25 Mrd', val: 25000000000 },
                { label: '50 Mrd', val: 50000000000 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      corporation_wallet_balance: preset.val,
                      corporation_wallet_source: 'manual',
                    }))
                  }
                  className="px-2 py-0.5 bg-[#0e1117] hover:bg-[#262730] border border-[#262730] rounded text-[10px] font-mono text-[#cfd3dc]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Détail de configuration quand le mode Budget Manuel est actif */}
        {form.treasury_source_mode === 'manual_budget' && (
          <div className="p-3.5 bg-[#161821] rounded-lg border border-[#262730] space-y-3">
            <div>
              <label className="block text-[#808495] text-[11px] mb-1">
                Capital Total Alloué au Trading (ISK) :
              </label>
              <input
                type="number"
                min="0"
                step="1000000"
                value={form.available_capital ?? 1000000000}
                onChange={(e) =>
                  setForm({
                    ...form,
                    available_capital: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-1.5 rounded font-mono text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-[#808495] mr-1">Raccourcis Budget :</span>
              {[
                { label: '100M', val: 100000000 },
                { label: '500M', val: 500000000 },
                { label: '1 Mrd', val: 1000000000 },
                { label: '5 Mrd', val: 5000000000 },
                { label: '10 Mrd', val: 10000000000 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      available_capital: preset.val,
                    }))
                  }
                  className="px-2 py-0.5 bg-[#0e1117] hover:bg-[#262730] border border-[#262730] rounded text-[10px] font-mono text-[#cfd3dc]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. FRAIS DE TRANSPORT / HAULING */}
        <div className="space-y-4 bg-[#0e1117] p-4 rounded-xl border border-[#262730]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#fafafa] flex items-center gap-2 text-xs">
              <Truck className="w-4 h-4 text-purple-400" />
              Frais de Transport &amp; Hauling
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
              form.enable_transport_costs ? 'bg-purple-500/20 text-purple-300' : 'bg-emerald-500/20 text-emerald-300'
            }`}>
              {form.enable_transport_costs ? 'Hauling Activé' : '0 ISK (Transport Personnel)'}
            </span>
          </div>

          {/* Toggle Principal Transport */}
          <div className="p-3 bg-[#161821] rounded-lg border border-[#262730] space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-semibold text-[#cfd3dc]">Inclure les coûts de transport :</span>
              <input
                type="checkbox"
                checked={form.enable_transport_costs}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    enable_transport_costs: checked,
                    transport_cost_per_m3: checked ? (prev.transport_cost_per_m3 || 15) : 0,
                    transport_cost_per_jump: checked ? (prev.transport_cost_per_jump || 200000) : 0,
                  }));
                }}
                className="w-4 h-4 rounded bg-[#262730] text-[#ff4b4b] focus:ring-0 cursor-pointer"
              />
            </label>
            <p className="text-[11px] text-[#808495] leading-normal">
              {form.enable_transport_costs
                ? 'Les frais au m³ et par saut sont déduits du profit net.'
                : '✅ Désactivé : Tous les calculs de transport valent strictement 0.00 ISK (transport par vous-même).'}
            </p>
          </div>

          {/* Presets rapides de transport */}
          <div>
            <span className="text-[11px] text-[#808495] block mb-1.5 font-medium">Préréglages de Transport :</span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyTransportPreset('zero')}
                className={`p-2 rounded text-center border transition-all ${
                  !form.enable_transport_costs || (form.transport_cost_per_m3 === 0 && form.transport_cost_per_jump === 0)
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <div className="text-[11px]">0 ISK</div>
                <div className="text-[9px] opacity-75">Transport perso</div>
              </button>
              <button
                type="button"
                onClick={() => applyTransportPreset('standard')}
                className={`p-2 rounded text-center border transition-all ${
                  form.enable_transport_costs && form.transport_cost_per_m3 === 15
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                    : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <div className="text-[11px]">15 ISK/m³</div>
                <div className="text-[9px] opacity-75">+200k / saut</div>
              </button>
              <button
                type="button"
                onClick={() => applyTransportPreset('redfrog')}
                className={`p-2 rounded text-center border transition-all ${
                  form.enable_transport_costs && form.transport_cost_per_m3 === 45
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 font-bold'
                    : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                <div className="text-[11px]">45 ISK/m³</div>
                <div className="text-[9px] opacity-75">RedFrog / PushX</div>
              </button>
            </div>
          </div>

          {/* Saisie détaillée des paramètres transport */}
          <div className="space-y-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#808495] text-[11px] mb-1">Coût / m³ (ISK)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={!form.enable_transport_costs}
                  value={form.transport_cost_per_m3}
                  onChange={(e) => setForm({ ...form, transport_cost_per_m3: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#161821] border border-[#262730] disabled:opacity-40 text-[#fafafa] p-1.5 rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#808495] text-[11px] mb-1">Coût / Saut (ISK)</label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  disabled={!form.enable_transport_costs}
                  value={form.transport_cost_per_jump}
                  onChange={(e) => setForm({ ...form, transport_cost_per_jump: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[#161821] border border-[#262730] disabled:opacity-40 text-[#fafafa] p-1.5 rounded font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#808495] text-[11px] mb-1">Capacité Cargo (m³)</label>
                <input
                  type="number"
                  min="100"
                  step="1000"
                  value={form.max_cargo_m3}
                  onChange={(e) => setForm({ ...form, max_cargo_m3: parseFloat(e.target.value) || 1000 })}
                  className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-1.5 rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[#808495] text-[11px] mb-1">Frais Collatéral (%)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  disabled={!form.enable_transport_costs}
                  value={((form.collateral_fee_pct || 0) * 100).toFixed(1)}
                  onChange={(e) => setForm({ ...form, collateral_fee_pct: (parseFloat(e.target.value) || 0) / 100 })}
                  className="w-full bg-[#161821] border border-[#262730] disabled:opacity-40 text-[#fafafa] p-1.5 rounded font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. SKILLS EVE & EXACT EXCEL FORMULAS */}
        <div className="space-y-4 bg-[#0e1117] p-4 rounded-xl border border-[#262730]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#fafafa] flex items-center gap-2 text-xs">
              <GraduationCap className="w-4 h-4 text-amber-400" />
              Compétences &amp; Formules CCP Excel
            </h3>
            <span className="text-[10px] text-amber-300 font-mono">
              Taxe {(form.sales_tax * 100).toFixed(2)}% &bull; Court. {(form.broker_fee * 100).toFixed(2)}%
            </span>
          </div>

          <div className="p-3 bg-[#161821] rounded-lg border border-[#262730] space-y-2 text-[11px]">
            {/* Clone Alpha / Omega Toggle */}
            <div className="flex items-center justify-between pb-2 border-b border-[#262730]">
              <span className="text-[#808495]">Type de Clone EVE :</span>
              <div className="flex items-center gap-1.5 font-mono">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, is_alpha_clone: false }))}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    !form.is_alpha_clone
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#262730] text-[#808495] hover:text-[#fafafa]'
                  }`}
                >
                  Clone Omega
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cappedAcc = Math.min(3, form.accounting_level ?? 3);
                    const cappedBr = Math.min(3, form.broker_relations_level ?? 3);
                    updateSkills(cappedAcc, cappedBr, form.faction_standing ?? 0, form.corp_standing ?? 0);
                    setForm((prev) => ({
                      ...prev,
                      is_alpha_clone: true,
                      accounting_level: cappedAcc,
                      broker_relations_level: cappedBr,
                    }));
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    form.is_alpha_clone
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#262730] text-[#808495] hover:text-[#fafafa]'
                  }`}
                >
                  Clone Alpha (Plafonné L3)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#808495]">Accounting (Taxe de vente) :</span>
              <div className="flex items-center gap-1 font-mono">
                {[0, 1, 2, 3, 4, 5].map((lvl) => {
                  const isBlocked = form.is_alpha_clone && lvl > 3;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={isBlocked}
                      title={isBlocked ? 'Bloqué pour les clones Alpha (max lvl 3)' : undefined}
                      onClick={() => updateSkills(lvl, form.broker_relations_level ?? 5, form.faction_standing ?? 0, form.corp_standing ?? 0)}
                      className={`w-5 h-5 rounded text-[10px] font-bold transition-opacity ${
                        (form.accounting_level ?? 5) === lvl
                          ? 'bg-amber-500 text-black'
                          : isBlocked
                          ? 'bg-[#1e2029] text-[#4a4d5a] opacity-40 cursor-not-allowed'
                          : 'bg-[#262730] text-[#808495] hover:text-[#fafafa]'
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#808495]">Broker Relations (Courtage) :</span>
              <div className="flex items-center gap-1 font-mono">
                {[0, 1, 2, 3, 4, 5].map((lvl) => {
                  const isBlocked = form.is_alpha_clone && lvl > 3;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      disabled={isBlocked}
                      title={isBlocked ? 'Bloqué pour les clones Alpha (max lvl 3)' : undefined}
                      onClick={() => updateSkills(form.accounting_level ?? 5, lvl, form.faction_standing ?? 0, form.corp_standing ?? 0)}
                      className={`w-5 h-5 rounded text-[10px] font-bold transition-opacity ${
                        (form.broker_relations_level ?? 5) === lvl
                          ? 'bg-amber-500 text-black'
                          : isBlocked
                          ? 'bg-[#1e2029] text-[#4a4d5a] opacity-40 cursor-not-allowed'
                          : 'bg-[#262730] text-[#808495] hover:text-[#fafafa]'
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#262730]">
              <div>
                <label className="text-[10px] text-[#808495] block mb-0.5">Standing Faction (-10 à 10)</label>
                <input
                  type="number"
                  step="0.5"
                  min="-10"
                  max="10"
                  value={form.faction_standing ?? 0}
                  onChange={(e) => {
                    const f = parseFloat(e.target.value) || 0;
                    updateSkills(form.accounting_level ?? 5, form.broker_relations_level ?? 5, f, form.corp_standing ?? 0);
                  }}
                  className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-1 rounded font-mono text-center"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#808495] block mb-0.5">Standing Corp (-10 à 10)</label>
                <input
                  type="number"
                  step="0.5"
                  min="-10"
                  max="10"
                  value={form.corp_standing ?? 0}
                  onChange={(e) => {
                    const c = parseFloat(e.target.value) || 0;
                    updateSkills(form.accounting_level ?? 5, form.broker_relations_level ?? 5, form.faction_standing ?? 0, c);
                  }}
                  className="w-full bg-[#0e1117] border border-[#262730] text-[#fafafa] p-1 rounded font-mono text-center"
                />
              </div>
            </div>
          </div>

          {/* Saisie manuelle directe pour égaler toute feuille Excel */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[#808495] text-[11px] mb-1">Taux Taxe Vente (%)</label>
              <input
                type="number"
                step="0.01"
                value={(form.sales_tax * 100).toFixed(2)}
                onChange={(e) => setForm({ ...form, sales_tax: (parseFloat(e.target.value) || 0) / 100 })}
                className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-1.5 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-[#808495] text-[11px] mb-1">Taux Courtage (%)</label>
              <input
                type="number"
                step="0.01"
                value={(form.broker_fee * 100).toFixed(2)}
                onChange={(e) => setForm({ ...form, broker_fee: (parseFloat(e.target.value) || 0) / 100 })}
                className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-1.5 rounded font-mono"
              />
            </div>
          </div>

          {/* Info Formules */}
          <div className="p-2.5 rounded bg-[#161821] border border-[#262730] text-[10px] text-[#808495] space-y-1">
            <div className="font-semibold text-[#cfd3dc] flex items-center gap-1">
              <Info className="w-3 h-3 text-blue-400" />
              Formules officielles CCP :
            </div>
            <div>&bull; <span className="text-[#fafafa]">Taxe :</span> 8.0% &times; (1 - 0.11 &times; Accounting)</div>
            <div>&bull; <span className="text-[#fafafa]">Courtage NPC :</span> 3.0% - (0.3% &times; BR) - (0.03% &times; Faction) - (0.02% &times; Corp)</div>
          </div>
        </div>

        {/* 3. HUBS & DATABASE ORDER DEDUPLICATION */}
        <div className="space-y-4 bg-[#0e1117] p-4 rounded-xl border border-[#262730]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#fafafa] flex items-center gap-2 text-xs">
              <MapPin className="w-4 h-4 text-blue-400" />
              Stations &amp; Régions ({hubs.filter((h) => h.active).length}/{hubs.length} Actifs)
            </h3>
          </div>

          {/* Hub presets buttons */}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => handleHubPreset('top5')}
              className="px-2 py-1 bg-[#161821] hover:bg-[#262730] border border-[#262730] rounded text-[10px] font-medium text-[#cfd3dc]"
            >
              Top 5 Majeurs
            </button>
            <button
              type="button"
              onClick={() => handleHubPreset('top12')}
              className="px-2 py-1 bg-[#161821] hover:bg-[#262730] border border-[#262730] rounded text-[10px] font-medium text-[#cfd3dc]"
            >
              Top 12 High-Sec
            </button>
            <button
              type="button"
              onClick={() => handleHubPreset('all')}
              className="px-2 py-1 bg-[#161821] hover:bg-[#262730] border border-[#262730] rounded text-[10px] font-medium text-[#cfd3dc]"
            >
              Tout Activer
            </button>
          </div>

          {/* Liste déroulante des hubs */}
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
            {hubs.map((h) => (
              <label
                key={h.id}
                className="flex items-center justify-between p-1.5 rounded bg-[#161821] border border-[#262730] cursor-pointer hover:border-[#31333f] text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={h.active}
                    onChange={() => onToggleHub(h.id)}
                    className="rounded bg-[#262730] text-[#ff4b4b] focus:ring-0 cursor-pointer"
                  />
                  <span className={`font-semibold ${h.active ? 'text-[#fafafa]' : 'text-[#808495]'}`}>
                    {h.name}
                  </span>
                </div>
                <span className="text-[10px] text-[#808495]">
                  {h.region} ({h.security_status >= 0.5 ? 'High-Sec' : 'Low-Sec'})
                </span>
              </label>
            ))}
          </div>

          {/* Database Order Maintenance & Deduplication Card */}
          <div className="p-3 bg-[#161821] rounded-lg border border-[#262730] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs flex items-center gap-1.5 text-[#fafafa]">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                Maintien Database Ordres ESI
              </span>
              <span className="text-[10px] text-green-400 font-mono">0 doublon garanti</span>
            </div>
            <p className="text-[10px] text-[#808495]">
              Chaque ordre CCP est indexé par son ID unique 64-bit.
              {cacheStats.total_orders_cached > 0 ? ` ${cacheStats.total_orders_cached.toLocaleString()} ordres uniques en cache mémoire.` : ' Cache synchronisé.'}
            </p>
            <button
              type="button"
              onClick={handleClearCache}
              className="w-full py-1.5 px-2.5 bg-[#262730] hover:bg-[#31333f] text-[#cfd3dc] rounded flex items-center justify-center gap-1.5 text-[11px] transition-colors"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
              Purger le cache et forcer le rafraîchissement
            </button>
          </div>
        </div>
      </div>

      {/* Footer Bar with Save */}
      <div className="flex items-center justify-between pt-3 border-t border-[#262730]">
        <div className="text-xs text-[#808495]">
          {form.enable_transport_costs ? 'Transport actif : calculs réels de fret appliqués.' : '🚀 Transport à 0 ISK configuré : aucun coût de transport ne sera comptabilisé.'}
        </div>
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold rounded-lg flex items-center gap-2 shadow-lg transition-colors text-xs"
        >
          <Save className="w-4 h-4" />
          <span>Enregistrer &amp; Recalculer les Marchés</span>
        </button>
      </div>
    </div>
  );
};

