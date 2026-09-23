import React from 'react';
import { AlertCircle, CalendarClock, Clock, ExternalLink, MapPin, ShieldCheck, X } from 'lucide-react';
import type {
  DataHealthStatus,
  EveCharacterOrder,
  HistoricalStats,
  MarketDataQuality,
  OrderAdvisorRecommendation,
  RawMarketOrder,
} from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import { getOrderLockedValue, getOrderMarketDistance, getOrderTiming } from '../engine/orderOperations';
import { FailureSemantics } from '../engine/failureSemantics';

interface OrderOperationsDetailProps {
  order: EveCharacterOrder;
  recommendation?: OrderAdvisorRecommendation;
  quality: MarketDataQuality | null;
  marketOrders: RawMarketOrder[];
  history: HistoricalStats | null;
  onClose: () => void;
  onSelectTypeForArbitrage?: (typeId: number) => void;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 3600) return Math.max(1, Math.floor(seconds / 60)) + 'm';
  if (seconds < 86_400) return Math.floor(seconds / 3600) + 'h';
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  return hours ? days + 'j ' + hours + 'h' : days + 'j';
}

function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  if (seconds < 86_400) return Math.round(seconds / 3600) + 'h';
  return Math.round(seconds / 86_400) + 'j';
}

function healthTone(health: DataHealthStatus): string {
  switch (health) {
    case 'LIVE': return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    case 'CACHE': return 'text-blue-300 bg-blue-500/10 border-blue-500/30';
    case 'STALE': return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    case 'PARTIAL': return 'text-orange-300 bg-orange-500/10 border-orange-500/30';
    case 'ERROR': return 'text-red-300 bg-red-500/10 border-red-500/30';
    default: return 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30';
  }
}

export const OrderOperationsDetail: React.FC<OrderOperationsDetailProps> = ({
  order,
  recommendation,
  quality,
  marketOrders,
  history,
  onClose,
  onSelectTypeForArbitrage,
}) => {
  const timing = getOrderTiming(order);
  const health: DataHealthStatus = quality?.health_status ?? 'UNKNOWN';
  const distance = getOrderMarketDistance(order, marketOrders);
  const sameType = marketOrders.filter(
    (entry) => entry.type_id === order.type_id && entry.order_id !== order.order_id,
  );
  const buyOrders = sameType.filter((entry) => entry.is_buy_order);
  const sellOrders = sameType.filter((entry) => !entry.is_buy_order);
  const bestBuy = buyOrders.length > 0 ? Math.max(...buyOrders.map((entry) => entry.price)) : undefined;
  const bestSell = sellOrders.length > 0 ? Math.min(...sellOrders.map((entry) => entry.price)) : undefined;
  const ownerType = order.ownership?.owner_type;
  const ownerName =
    order.ownership?.owner_name ||
    order.character_name ||
    (ownerType === 'corporation' ? 'Corporation inconnue' : 'Propriétaire inconnu');
  const projectedSellValue = !order.is_buy_order
    ? order.price * order.volume_remain
    : undefined;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Détail opérationnel de l’ordre"
    >
      <div className="w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto bg-[#0e1117] border border-[#31333f] rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-5 bg-[#161821] border-b border-[#262730]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${order.is_buy_order ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
                {order.is_buy_order ? 'ACHAT' : 'VENTE'}
              </span>
              <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold ${healthTone(health)}`}>{health}</span>
              {timing.isAgeingRisk && <span className="inline-flex px-2 py-0.5 rounded border text-[10px] font-bold text-red-300 bg-red-500/10 border-red-500/30">Âge critique</span>}
            </div>
            <h3 className="text-lg font-bold text-[#fafafa] mt-2 truncate">
              {order.type_name || `Objet #${order.type_id}`}
            </h3>
            <div className="text-[11px] text-[#808495] flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="font-mono">Order {order.order_id}</span>
              <span>{order.location_name || 'Lieu inconnu'}</span>
              <span>{order.region_name || 'Région inconnue'}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer le détail" className="p-2 rounded-lg hover:bg-[#262730] text-[#808495] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#161821] border border-[#262730] rounded-xl p-3">
              <div className="text-[10px] uppercase text-[#808495]">État</div>
              <div className="font-semibold text-[#fafafa] mt-1">{timing.remainingMs > 0 ? 'ACTIF' : 'EXPIRÉ'}</div>
              <div className="text-[10px] text-[#808495] mt-1">{formatDuration(timing.remainingMs)} restant</div>
            </div>
            <div className="bg-[#161821] border border-[#262730] rounded-xl p-3">
              <div className="text-[10px] uppercase text-[#808495]">Fill ratio</div>
              <div className="font-mono font-semibold text-emerald-300 mt-1">{(timing.fillRatio * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-[#808495] mt-1">{fmtNumber(order.volume_remain)} restant</div>
            </div>
            <div className="bg-[#161821] border border-[#262730] rounded-xl p-3">
              <div className="text-[10px] uppercase text-[#808495]">Immobilisé</div>
              <div className="font-mono font-semibold text-purple-200 mt-1">{fmtIsk(getOrderLockedValue(order))}</div>
              <div className="text-[10px] text-[#808495] mt-1">{order.is_buy_order ? 'escrow' : 'exposition vente'}</div>
            </div>
            <div className="bg-[#161821] border border-[#262730] rounded-xl p-3">
              <div className="text-[10px] uppercase text-[#808495]">Âge</div>
              <div className="font-semibold text-[#cfd3dc] mt-1">{formatDuration(timing.ageMs)}</div>
              <div className="text-[10px] text-[#808495] mt-1">émis le {new Date(timing.issuedAtMs).toLocaleString()}</div>
            </div>
          </div>

          <section className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-300" />
              <h4 className="text-sm font-semibold text-[#fafafa]">Provenance / ownership</h4>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div><span className="text-[#808495]">Propriétaire économique</span><div className="font-semibold text-[#fafafa] mt-1">{ownerName} · {ownerType === 'corporation' ? 'corporation' : 'personnage'}</div></div>
              <div><span className="text-[#808495]">Owner ID</span><div className="font-mono text-[#cfd3dc] mt-1">{order.ownership?.owner_id ?? order.character_id ?? '—'}</div></div>
              <div><span className="text-[#808495]">Principal observateur</span><div className="font-mono text-[#cfd3dc] mt-1">{order.ownership?.principal_character_id ?? order.character_id ?? '—'}</div></div>
              <div><span className="text-[#808495]">Observé par</span><div className="font-mono text-[#cfd3dc] mt-1">{order.ownership?.observed_by_character_ids?.join(', ') || '—'}</div></div>
            </div>
          </section>

          <section className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-300" />
              <h4 className="text-sm font-semibold text-[#fafafa]">Dernière observation marché</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-[#808495]">État</div><div className={`font-semibold mt-1 ${health === 'ERROR' ? 'text-red-300' : 'text-[#fafafa]'}`}>{health}</div></div>
              <div><div className="text-[#808495]">Âge des données</div><div className="font-mono text-[#cfd3dc] mt-1">{quality ? formatAge(quality.age_seconds) : '—'}</div></div>
              <div><div className="text-[#808495]">Pages</div><div className="font-mono text-[#cfd3dc] mt-1">{quality ? `${quality.pages_fetched}/${quality.expected_pages}` : '—'}</div></div>
              <div><div className="text-[#808495]">Observation</div><div className="font-mono text-[#cfd3dc] mt-1">{quality?.fetched_at ? new Date(quality.fetched_at).toLocaleString() : '—'}</div></div>
            </div>
            {quality?.last_error && (
              <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertCircle className="inline w-3.5 h-3.5 mr-1" />{quality.last_error}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><div className="text-[#808495]">Meilleur achat</div><div className="font-mono mt-1">{bestBuy !== undefined ? fmtIsk(bestBuy) : '—'}</div></div>
              <div><div className="text-[#808495]">Meilleure vente</div><div className="font-mono mt-1">{bestSell !== undefined ? fmtIsk(bestSell) : '—'}</div></div>
              <div><div className="text-[#808495]">Distance au marché</div><div className="font-mono mt-1">{distance?.distancePct === undefined ? '—' : ((distance.distancePct >= 0 ? '+' : '') + distance.distancePct.toFixed(2) + '%')}</div></div>
              <div><div className="text-[#808495]">Volume local médian 7j</div><div className="font-mono mt-1">{history?.daily_volume_7d_median !== undefined ? fmtNumber(history.daily_volume_7d_median) : '—'}</div></div>
            </div>
          </section>

          <section className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-300" /><h4 className="text-sm font-semibold text-[#fafafa]">Résultat attendu restant</h4></div>
            {order.is_buy_order ? (
              <div className="text-sm text-[#cfd3dc]">
                Capital de l’offre restant : <strong className="font-mono">{fmtIsk(getOrderLockedValue(order))}</strong>.
                Aucun bénéfice réalisé n’est affirmé par cette vue.
              </div>
            ) : (
              <div className="text-sm text-[#cfd3dc]">
                Recette brute projetée si le reliquat est exécuté au prix de l’ordre :
                <strong className="font-mono"> {fmtIsk(projectedSellValue || 0)}</strong>.
                Cette valeur est une projection nominale, pas un résultat réalisé.
              </div>
            )}
          </section>

          <section className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-orange-300" /><h4 className="text-sm font-semibold text-[#fafafa]">Décision Operations</h4></div>
            {recommendation ? (
              <div className="space-y-2">
                <div className="text-sm font-bold text-[#fafafa]">{recommendation.headline}</div>
                <div className="text-xs text-[#cfd3dc]">{recommendation.summary}</div>
                <div className="text-xs text-[#a0a4b5] leading-relaxed">{recommendation.reasoning}</div>
              </div>
            ) : (
              <div className="text-xs text-[#a0a4b5]">
                {!FailureSemantics.isActionable(health)
                  ? 'Aucune recommandation fiable n’est produite tant que les données marché ne permettent pas d’établir un contexte suffisamment sûr.'
                  : 'Aucune recommandation supplémentaire n’est disponible pour cet ordre.'}
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-[10px] text-[#808495] font-mono">
              Order #{order.order_id} · durée EVE {order.duration}j · reliquat {fmtNumber(order.volume_remain)}
            </div>
            {onSelectTypeForArbitrage && (
              <button
                type="button"
                onClick={() => onSelectTypeForArbitrage(order.type_id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#262730] hover:bg-[#31333f] text-xs font-semibold text-[#fafafa]"
              >
                Contexte marché détaillé <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
