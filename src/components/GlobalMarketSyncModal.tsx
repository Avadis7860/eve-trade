import React, { useState, useEffect, useMemo } from 'react';
import { GlobalMarketSyncService, GlobalSyncOptions } from '../services/globalMarketSync';
import { EsiService } from '../services/esi';
import { MarketGroupRepository } from '../domain/catalog/MarketGroupRepository';
import {
  MarketHub,
  FinancialConfig,
  TradeStrategy,
  GlobalSyncProgress,
  UniverseWideOpportunity,
  EveTypeDetail,
} from '../types';
import {
  Globe,
  RefreshCw,
  Play,
  Pause,
  Square,
  CheckCircle2,
  AlertTriangle,
  Database,
  Layers,
  Sparkles,
  Zap,
  Clock,
  ArrowRight,
  TrendingUp,
  X,
  Boxes,
} from 'lucide-react';

interface GlobalMarketSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  hubs: MarketHub[];
  config: FinancialConfig;
  strategy: TradeStrategy;
  customItems: EveTypeDetail[];
  onOpenOpportunity: (opp: UniverseWideOpportunity) => void;
  onGoToGlobalScanner?: () => void;
}

export const GlobalMarketSyncModal: React.FC<GlobalMarketSyncModalProps> = ({
  isOpen,
  onClose,
  hubs,
  config,
  strategy,
  customItems,
  onOpenOpportunity,
  onGoToGlobalScanner,
}) => {
  const [progress, setProgress] = useState<GlobalSyncProgress>(GlobalMarketSyncService.getProgress());
  const [recentDiscoveries, setRecentDiscoveries] = useState<UniverseWideOpportunity[]>(
    GlobalMarketSyncService.getUniverseOpportunities()
  );
  const [categoryFilter, setCategoryFilter] = useState<GlobalSyncOptions['category_filter']>('all');
  const [scopePreset, setScopePreset] = useState<'quick' | 'standard' | 'extended' | 'universe'>('standard');
  const [fetchHistory, setFetchHistory] = useState<boolean>(true);
  const [concurrency, setConcurrency] = useState<number>(4);

  const marketGroupRepo = useMemo(() => MarketGroupRepository.getInstance(), []);
  const rootGroups = useMemo(() => marketGroupRepo.getRootGroups(), [marketGroupRepo]);
  const [selectedMarketGroupId, setSelectedMarketGroupId] = useState<number>(0);

  useEffect(() => {
    const unsubProgress = GlobalMarketSyncService.subscribe((p) => setProgress(p));
    const unsubOpps = GlobalMarketSyncService.subscribeOpportunities((opps) => setRecentDiscoveries(opps));
    return () => {
      unsubProgress();
      unsubOpps();
    };
  }, []);

  if (!isOpen) return null;

  const handleStartSync = () => {
    let itemLimit = 250;
    if (scopePreset === 'quick') itemLimit = 50;
    if (scopePreset === 'standard') itemLimit = 250;
    if (scopePreset === 'extended') itemLimit = 1000;
    if (scopePreset === 'universe') itemLimit = 0; // 0 = All items in universe

    GlobalMarketSyncService.startGlobalSync(
      hubs,
      config,
      strategy,
      {
        category_filter: selectedMarketGroupId === 0 ? categoryFilter : undefined,
        market_group_id: selectedMarketGroupId > 0 ? selectedMarketGroupId : undefined,
        item_limit: itemLimit,
        fetch_history: fetchHistory,
        concurrency: concurrency,
      },
      customItems
    );
  };

  const handlePause = () => GlobalMarketSyncService.pause();
  const handleResume = () => GlobalMarketSyncService.resume();
  const handleStop = () => GlobalMarketSyncService.stop();

  const activeHubsCount = hubs.filter((h) => h.active).length;
  const dbStats = EsiService.getOrderDatabaseStats();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#161821] border border-[#262730] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#fafafa] flex items-center gap-2">
                Synchronisation Globale du Marché EVE
                {progress.is_running && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 animate-pulse font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    En cours ({progress.percent}%)
                  </span>
                )}
              </h2>
              <p className="text-xs text-[#808495]">
                Indexation en masse et calcul d'opportunités d'arbitrage inter-régionales sans requête répétée
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

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* 1. Sync Configuration Bar (when not running) */}
          {!progress.is_running ? (
            <div className="space-y-4 bg-[#0e1117] p-4 rounded-xl border border-[#262730]">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#cfd3dc] flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-purple-400" />
                  Portée de l'Indexation Globale
                </span>
                <span className="text-[11px] text-[#808495]">
                  {activeHubsCount} régions actives &bull; {dbStats.total_orders_cached} ordres déjà en cache
                </span>
              </div>

              {/* Preset Scopes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setScopePreset('quick')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    scopePreset === 'quick'
                      ? 'bg-purple-500/10 border-purple-500 text-purple-300 font-bold'
                      : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  <div className="text-xs font-bold text-[#fafafa]">Top 50 Rapide</div>
                  <div className="text-[10px] text-[#808495] mt-0.5">Plex, Injecteurs, Ores majeurs (~15 sec)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setScopePreset('standard')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    scopePreset === 'standard'
                      ? 'bg-purple-500/10 border-purple-500 text-purple-300 font-bold'
                      : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  <div className="text-xs font-bold text-[#fafafa]">Standard (250)</div>
                  <div className="text-[10px] text-[#808495] mt-0.5">Modules T2, hulls & munitions (~45 sec)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setScopePreset('extended')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    scopePreset === 'extended'
                      ? 'bg-purple-500/10 border-purple-500 text-purple-300 font-bold'
                      : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  <div className="text-xs font-bold text-[#fafafa]">Écosystème (1000)</div>
                  <div className="text-[10px] text-[#808495] mt-0.5">Couverture approfondie (~2 min)</div>
                </button>

                <button
                  type="button"
                  onClick={() => setScopePreset('universe')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    scopePreset === 'universe'
                      ? 'bg-purple-500/10 border-purple-500 text-purple-300 font-bold ring-1 ring-purple-400/50'
                      : 'bg-[#161821] border-[#262730] text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  <div className="text-xs font-bold text-[#fafafa] flex items-center gap-1">
                    <span>Univers Complet</span>
                    <span className="text-[9px] bg-purple-500/30 text-purple-200 px-1 rounded">20k+</span>
                  </div>
                  <div className="text-[10px] text-[#808495] mt-0.5">Tous les 20 526 types de marché EVE</div>
                </button>
              </div>

              {/* Category & Concurrency */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[#808495] mb-1">Groupe / Catégorie de Marché :</label>
                  <select
                    value={selectedMarketGroupId > 0 ? `mg_${selectedMarketGroupId}` : categoryFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('mg_')) {
                        setSelectedMarketGroupId(Number(val.replace('mg_', '')));
                        setCategoryFilter('all');
                      } else {
                        setSelectedMarketGroupId(0);
                        setCategoryFilter(val as any);
                      }
                    }}
                    className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg font-medium"
                  >
                    <option value="all">🌐 Tout l'Univers EVE (20 526 types de marché)</option>
                    <optgroup label="Groupes Principaux EVE (Hiérarchie Officielle CCP)">
                      {rootGroups.map((rg) => {
                        const count = marketGroupRepo.getAllTypesForGroup(rg.market_group_id).length;
                        return (
                          <option key={rg.market_group_id} value={`mg_${rg.market_group_id}`}>
                            {rg.icon || '📁'} {rg.name} ({count.toLocaleString()} types)
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Filtres Rapides par Domaine">
                      <option value="ships">🚀 Vaisseaux spatiaux (Frégates, Croiseurs, Cuirassés, Freighters)</option>
                      <option value="modules">⚙️ Modules &amp; Équipements T2 / Faction / Deadspace</option>
                      <option value="minerals_materials">💎 Minerais, Minéraux &amp; Matériaux de Production</option>
                      <option value="planetary_industry">🪐 Industrie Planétaire (PI P1-P4)</option>
                      <option value="blueprints_reactions">📜 Blueprints, Copies &amp; Formules de Réaction</option>
                      <option value="skills">🧠 Livres de Compétences &amp; Injecteurs de Skillpoints</option>
                      <option value="implants_boosters">💉 Implants Cybernétiques &amp; Boosters de Combat</option>
                      <option value="ammunition_charges">💣 Munitions, Missiles, Charges &amp; Munitions Exotiques</option>
                      <option value="drones_fighters">🤖 Drones de Combat, Logistiques &amp; Chasseurs Porteurs</option>
                      <option value="trade_goods_plex">🪙 Biens Commerciaux, PLEX &amp; Jetons EVE</option>
                      <option value="structures_citadels">🏛️ Structures Upwell, Citadelles &amp; Modules de Station</option>
                      <option value="subsystems_rigs">🔧 Sous-systèmes T3 &amp; Optimisations Rigs</option>
                      <option value="deployables">📡 Déployables Mobiles, Siphons &amp; Balises</option>
                      <option value="relics_exploration">🧭 Reliques, Données Archéologiques &amp; Sites Secrets</option>
                      <option value="apparel">👔 Vêtements, Cosmétiques &amp; Skins de Pilote</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="block text-[#808495] mb-1">Parallélisme (Requêtes concurrentes) :</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={2}
                      max={8}
                      value={concurrency}
                      onChange={(e) => setConcurrency(Number(e.target.value))}
                      className="w-full accent-purple-500"
                    />
                    <span className="font-mono font-bold text-purple-400 w-8">{concurrency}x</span>
                  </div>
                </div>
              </div>

              {/* Launch Button */}
              <button
                onClick={handleStartSync}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 transition-all text-sm"
              >
                <Play className="w-4 h-4 fill-white" />
                Lancer la Synchronisation Universelle ESI
              </button>
            </div>
          ) : (
            /* 2. Active Sync Progress Box */
            <div className="bg-[#0e1117] p-5 rounded-xl border border-purple-500/40 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#fafafa] text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
                    Synchronisation active en arrière-plan
                  </div>
                  <div className="text-[#808495] text-[11px] mt-0.5">
                    Traitement de : <span className="text-purple-300 font-mono font-semibold">{progress.current_item_name || 'Initialisation...'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {progress.is_paused ? (
                    <button
                      onClick={handleResume}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      Reprendre
                    </button>
                  ) : (
                    <button
                      onClick={handlePause}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </button>
                  )}
                  <button
                    onClick={handleStop}
                    className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg font-bold flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    Arrêter
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[#cfd3dc]">
                    {progress.completed_items} / {progress.total_items} items traités ({progress.percent}%)
                  </span>
                  <span className="text-purple-400">
                    Temps restant estimé : ~{progress.estimated_remaining_seconds}s
                  </span>
                </div>
                <div className="w-full bg-[#161821] h-3 rounded-full overflow-hidden border border-[#262730]">
                  <div
                    className="bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>

              {/* Metric Counters */}
              <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                <div className="p-2 bg-[#161821] rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Ordres Récupérés</div>
                  <div className="text-sm font-bold font-mono text-emerald-400">
                    {progress.total_orders_fetched.toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="p-2 bg-[#161821] rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Opportunités Arbitrage</div>
                  <div className="text-sm font-bold font-mono text-purple-400">
                    {progress.total_opportunities_found}
                  </div>
                </div>
                <div className="p-2 bg-[#161821] rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Succès / Échecs</div>
                  <div className="text-sm font-bold font-mono text-[#cfd3dc]">
                    {progress.successful_items} / <span className="text-red-400">{progress.failed_items}</span>
                  </div>
                </div>
                <div className="p-2 bg-[#161821] rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Temps Écoulé</div>
                  <div className="text-sm font-bold font-mono text-blue-400">
                    {progress.elapsed_seconds}s
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Discovered Opportunities Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#fafafa] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Meilleures Opportunités Détectées ({recentDiscoveries.length})
              </h3>
              {onGoToGlobalScanner && recentDiscoveries.length > 0 && (
                <button
                  onClick={() => {
                    onClose();
                    onGoToGlobalScanner();
                  }}
                  className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 hover:underline"
                >
                  Voir dans la Vue Découverte Complète
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {recentDiscoveries.length === 0 ? (
              <div className="p-6 text-center bg-[#0e1117] rounded-xl border border-[#262730] text-[#808495]">
                <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Aucune opportunité globale en mémoire. Lancez la synchronisation ci-dessus pour scanner l'univers.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {recentDiscoveries.slice(0, 15).map((opp) => (
                  <div
                    key={opp.id}
                    className="p-3 bg-[#0e1117] hover:bg-[#161821] border border-[#262730] hover:border-purple-500/50 rounded-xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#161821] border border-[#262730] flex items-center justify-center font-bold text-purple-400 font-mono text-xs">
                        {opp.scores.overall_score}
                      </div>
                      <div>
                        <div className="font-bold text-[#fafafa] text-xs flex items-center gap-2">
                          {opp.item_name}
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#262730] text-[#808495]">
                            {opp.category_name}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#808495] flex items-center gap-2 mt-0.5">
                          <span className="text-emerald-400">{opp.buy_hub.name}</span>
                          <span>&rarr;</span>
                          <span className="text-blue-400">{opp.sell_hub.name}</span>
                          <span>&bull;</span>
                          <span>{opp.route.jumps} sauts</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="font-mono font-bold text-emerald-400 text-xs">
                          +{opp.costs.net_profit.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ISK
                        </div>
                        <div className="text-[10px] font-mono text-purple-300">
                          ROI : +{(opp.costs.roi * 100).toFixed(1)}% &bull; {opp.quantity_tradable} unités
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          onOpenOpportunity(opp);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-[11px] transition-colors"
                      >
                        Inspecter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#262730] bg-[#0e1117] flex justify-between items-center">
          <div className="text-[11px] text-[#808495] flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cache dédupliqué CCP actif (0 doublon garanti)</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] rounded-lg font-bold transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
