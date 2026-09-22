import React from 'react';
import { TradeFleetPlan, TradeFleetStep } from '../types';
import { fmtIsk, fmtPct, fmtNumber } from '../engine/money';
import {
  Users,
  ShoppingBag,
  Truck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  User,
  Wallet,
  Coins,
  Package,
} from 'lucide-react';

interface TradeFleetPlanCardProps {
  plan?: TradeFleetPlan;
  onOpenFleetManager?: () => void;
}

export const TradeFleetPlanCard: React.FC<TradeFleetPlanCardProps> = ({
  plan,
  onOpenFleetManager,
}) => {
  if (!plan) return null;

  const {
    is_fleet_enabled,
    fleet_size,
    buyer_character,
    hauler_character,
    seller_character,
    steps,
    is_cross_character,
    buyer_has_sufficient_capital,
    buyer_capital_deficit,
    hauler_cargo_sufficient,
    hauler_cargo_capacity_m3,
    notes,
  } = plan;

  return (
    <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#262730] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#fafafa]">
                Plan d'Exécution Écosystème &amp; Flotte
              </h3>
              {is_cross_character && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-medium">
                  Multi-Personnages Actif
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#808495]">
              Coordination logistique : Achat local &bull; Récolte &bull; Vente &amp; Repost
            </p>
          </div>
        </div>

        {onOpenFleetManager && (
          <button
            onClick={onOpenFleetManager}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-md transition-colors"
          >
            Configurer la Flotte
          </button>
        )}
      </div>

      {/* Warnings & Alerts */}
      {(!buyer_has_sufficient_capital || !hauler_cargo_sufficient) && (
        <div className="space-y-1.5">
          {!buyer_has_sufficient_capital && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>Trésorerie acheteur insuffisante :</strong> {buyer_character?.character_name} a un déficit de{' '}
                <strong className="font-mono">{fmtIsk(buyer_capital_deficit)} ISK</strong>. Un virement de trésorerie entre alts est recommandé avant achat.
              </span>
            </div>
          )}
          {!hauler_cargo_sufficient && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>Soute insuffisante :</strong> Le volume requis dépasse la capacité de transport ({hauler_cargo_capacity_m3.toLocaleString()} m³). Divisez le lot ou assignez un transporteur lourd (DST / Freighter).
              </span>
            </div>
          )}
        </div>
      )}

      {/* 3 Step Pipeline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((step) => {
          const isBuy = step.phase === 'BUY';
          const isHaul = step.phase === 'HAUL';
          const isSell = step.phase === 'SELL';

          const char = step.assigned_character;
          const roleBadgeColor = isBuy
            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            : isHaul
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

          return (
            <div
              key={step.step_number}
              className="bg-[#0e1117] border border-[#262730] rounded-xl p-3 flex flex-col justify-between space-y-3 relative overflow-hidden"
            >
              {/* Step Top Badge */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#808495] font-bold">
                  ÉTAPE {step.step_number}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${roleBadgeColor}`}>
                  {isBuy ? '1. ACHAT SOURCE' : isHaul ? '2. RÉCOLTE & FRET' : '3. VENTE / REPOST'}
                </span>
              </div>

              {/* Pilot Info */}
              <div className="flex items-center gap-2.5 bg-[#161821] p-2 rounded-lg border border-[#262730]">
                {char ? (
                  <>
                    <img
                      src={char.portrait_url}
                      alt={char.character_name}
                      className="w-9 h-9 rounded-full border border-[#262730] bg-[#0e1117] object-cover flex-shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-[#fafafa] truncate">
                        {char.character_name}
                      </div>
                      <div className="text-[10px] text-[#808495] flex items-center gap-1.5 truncate">
                        <span className="capitalize">{char.fleet_role}</span>
                        {char.assigned_hub_name && <span>&bull; {char.assigned_hub_name}</span>}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[#808495] text-xs">
                    <User className="w-5 h-5 opacity-40" />
                    <span>Pilote standard (Non assigné)</span>
                  </div>
                )}
              </div>

              {/* Action Description */}
              <div className="space-y-1.5 text-xs">
                <div className="text-[#cfd3dc] font-medium leading-snug">
                  {step.action_summary}
                </div>

                {step.fees_summary && (
                  <div className="text-[11px] text-[#808495]">
                    {step.fees_summary}
                  </div>
                )}

                {/* Specific Phase Metrics */}
                {isBuy && step.details.total_isk !== undefined && (
                  <div className="pt-1 border-t border-[#262730] flex justify-between text-[11px]">
                    <span className="text-[#808495]">Capital requis :</span>
                    <span className="font-mono font-bold text-amber-300">
                      {fmtIsk(step.details.total_isk)} ISK
                    </span>
                  </div>
                )}

                {isHaul && step.details.cargo_volume_m3 !== undefined && (
                  <div className="pt-1 border-t border-[#262730] space-y-1 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#808495]">Volume cargo :</span>
                      <span className="font-mono text-[#fafafa]">
                        {fmtNumber(step.details.cargo_volume_m3)} m³
                      </span>
                    </div>
                    {step.details.cargo_capacity_m3 && (
                      <div className="w-full bg-[#161821] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (step.details.cargo_utilization_pct || 0) > 100
                              ? 'bg-red-500'
                              : (step.details.cargo_utilization_pct || 0) > 80
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.min(100, step.details.cargo_utilization_pct || 0)}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {isSell && step.details.total_isk !== undefined && (
                  <div className="pt-1 border-t border-[#262730] flex justify-between text-[11px]">
                    <span className="text-[#808495]">Revenu net visé :</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {fmtIsk(step.details.total_isk)} ISK
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Notes */}
      {notes.length > 0 && (
        <div className="text-[11px] text-[#808495] pt-2 border-t border-[#262730] flex flex-wrap gap-2">
          {notes.map((note, idx) => (
            <span key={idx} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              {note}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
