import React from 'react';
import { OrderAdvisorRecommendation } from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import {
  Sparkles,
  TrendingDown,
  Truck,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  X,
  Compass,
  Coins,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface OrderAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: OrderAdvisorRecommendation | null;
  onSelectTypeForArbitrage?: (typeId: number) => void;
}

export const OrderAdvisorModal: React.FC<OrderAdvisorModalProps> = ({
  isOpen,
  onClose,
  recommendation,
  onSelectTypeForArbitrage,
}) => {
  const [copiedText, setCopiedText] = React.useState<string | null>(null);

  if (!isOpen || !recommendation) return null;

  const copyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedText(val);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getActionBadge = () => {
    switch (recommendation.action) {
      case 'lower_price':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            Ajuster le Prix (-0.01 ISK)
          </span>
        );
      case 'relocate':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-purple-400" />
            Déplacer vers un Marché Prometteur
          </span>
        );
      case 'cancel':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-red-400" />
            Annuler l'Ordre Immédiatement
          </span>
        );
      case 'keep':
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Position Optimale (Conserver)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#161821] border border-[#262730] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div className="flex items-center gap-3">
            <img
              src={`https://images.evetech.net/types/${recommendation.type_id}/icon?size=64`}
              alt=""
              className="w-11 h-11 rounded-xl bg-[#161821] border border-[#31333f]"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#fafafa]">
                  {recommendation.type_name}
                </h2>
                {getActionBadge()}
              </div>
              <p className="text-xs text-[#808495] mt-0.5">
                {recommendation.location_name} &bull; {recommendation.region_name}
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Executive Strategic Summary Card */}
          <div className="bg-[#0e1117] border border-[#262730] rounded-xl p-4 space-y-2">
            <div className="text-sm font-bold text-[#fafafa] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              {recommendation.headline}
            </div>
            <p className="text-xs text-[#cfd3dc] leading-relaxed">
              {recommendation.summary}
            </p>
            <div className="p-3 bg-[#161821] rounded-lg border border-[#262730] text-[11px] text-[#808495] leading-normal">
              <strong>Analyse tactique :</strong> {recommendation.reasoning}
            </div>
          </div>

          {/* Detailed Path Breakdown according to action */}
          {recommendation.action === 'lower_price' && recommendation.suggested_new_price && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-amber-400" />
                  Calcul d'Ajustement de Prix &amp; Marge Préservée
                </span>
                <button
                  onClick={() => copyToClipboard(recommendation.suggested_new_price!.toFixed(2))}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[11px] font-bold rounded flex items-center gap-1 transition-colors"
                >
                  {copiedText === recommendation.suggested_new_price.toFixed(2) ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copié
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copier Nouveau Prix
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Prix Actuel</div>
                  <div className="font-mono font-bold text-[#fafafa] mt-0.5">
                    {fmtIsk(recommendation.order_price)}
                  </div>
                </div>

                <div className="bg-[#161821] p-2.5 rounded-lg border border-amber-500/40">
                  <div className="text-[10px] text-amber-300">Prix Cible Recommandé</div>
                  <div className="font-mono font-bold text-amber-400 mt-0.5">
                    {fmtIsk(recommendation.suggested_new_price)}
                  </div>
                </div>

                <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Bénéfice Net Préservé</div>
                  <div className="font-mono font-bold text-emerald-400 mt-0.5">
                    +{fmtIsk(recommendation.estimated_profit_if_lowered || 0)}
                  </div>
                </div>

                <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Délai Estimé Vente</div>
                  <div className="font-mono font-bold text-blue-400 mt-0.5">
                    ~{recommendation.estimated_days_to_sell_after_cut || 1} jours
                  </div>
                </div>
              </div>
            </div>
          )}

          {recommendation.action === 'relocate' && recommendation.suggested_relocate_hub && (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-300 text-xs flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-purple-400" />
                  Opportunité de Relocalisation Commerciale
                </span>
                <span className="text-[11px] font-mono text-purple-400">
                  {recommendation.suggested_relocate_hub.jumps} sauts High-Sec
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="bg-[#161821] p-2.5 rounded-lg border border-[#262730]">
                  <div className="text-[10px] text-[#808495]">Marché Cible Plus Lucratif</div>
                  <div className="font-bold text-[#fafafa] mt-0.5">
                    {recommendation.suggested_relocate_hub.hub_name} ({recommendation.suggested_relocate_hub.region_name})
                  </div>
                  <div className="text-[10px] text-[#808495] truncate">
                    {recommendation.suggested_relocate_hub.station_name}
                  </div>
                </div>

                <div className="bg-[#161821] p-2.5 rounded-lg border border-purple-500/40">
                  <div className="text-[10px] text-purple-300">Prix de Vente Local Cible</div>
                  <div className="font-mono font-bold text-purple-300 mt-0.5">
                    {fmtIsk(recommendation.suggested_relocate_hub.current_best_sell_price)}
                  </div>
                  <div className="text-[10px] text-[#808495]">
                    ~{recommendation.suggested_relocate_hub.daily_volume.toFixed(0)} ventes/jour
                  </div>
                </div>

                <div className="bg-[#161821] p-2.5 rounded-lg border border-emerald-500/30">
                  <div className="text-[10px] text-emerald-400">Gain Net Additionnel</div>
                  <div className="font-mono font-bold text-emerald-400 mt-0.5">
                    +{fmtIsk(recommendation.suggested_relocate_hub.estimated_extra_profit_isk)}
                  </div>
                  <div className="text-[10px] text-[#808495]">
                    ROI: +{recommendation.suggested_relocate_hub.estimated_roi.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {recommendation.action === 'cancel' && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2">
              <div className="font-bold text-red-400 text-xs flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-400" />
                Raison de l'Annulation Immédiate
              </div>
              <p className="text-xs text-[#cfd3dc]">
                Cet ordre immobilise <strong>{fmtIsk(recommendation.capital_locked)}</strong> dans un marché sans liquidité ou avec un écrasement de marge irrécupérable.
              </p>
              {recommendation.opportunity_cost_per_day && (
                <div className="text-[11px] text-red-300 font-mono">
                  Coût d'opportunité estimé : ~{fmtIsk(recommendation.opportunity_cost_per_day)} ISK perdus par jour d'immobilisation.
                </div>
              )}
            </div>
          )}

          {/* Market Snapshot & Position Rank */}
          {recommendation.market_snapshot && (
            <div className="bg-[#0e1117] p-3 rounded-xl border border-[#262730] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <span className="text-[#808495] block">Rang de Prix :</span>
                <span className="font-mono font-bold text-[#fafafa]">
                  #{recommendation.market_snapshot.my_price_rank} sur le marché
                </span>
              </div>
              <div>
                <span className="text-[#808495] block">Ordres Devant :</span>
                <span className="font-mono font-bold text-amber-400">
                  {recommendation.market_snapshot.orders_ahead} ({fmtNumber(recommendation.market_snapshot.volume_ahead)} unités)
                </span>
              </div>
              <div>
                <span className="text-[#808495] block">1er Vendeur Local :</span>
                <span className="font-mono font-bold text-emerald-400">
                  {fmtIsk(recommendation.market_snapshot.current_lowest_sell)}
                </span>
              </div>
              <div>
                <span className="text-[#808495] block">Volume Quotidien :</span>
                <span className="font-mono font-bold text-blue-400">
                  ~{recommendation.market_snapshot.daily_velocity.toFixed(0)} u/jour
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#262730] flex items-center justify-between bg-[#0e1117]">
          {onSelectTypeForArbitrage && (
            <button
              onClick={() => {
                onClose();
                onSelectTypeForArbitrage(recommendation.type_id);
              }}
              className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              Scanner cet Item dans l'Arbitrage Universel
            </button>
          )}
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
