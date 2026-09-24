import React from 'react';
import { ProposedAllocationSnapshot, RealPortfolioSnapshot, PortfolioPosition } from '../types';
import { fmtIsk, fmtPct, fmtNumber } from '../engine/money';
import { DollarSign, Layers, ShieldCheck, AlertTriangle, Database, Lock, Boxes } from 'lucide-react';

interface PortfolioViewProps {
  proposedAllocation: ProposedAllocationSnapshot;
  realPortfolio: RealPortfolioSnapshot;
  onSelectOpportunity: (oppId: string) => void;
}

function displayIsk(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? fmtIsk(value) : 'UNKNOWN';
}

function statusClass(status: string): string {
  if (status === 'LIVE') return 'text-green-300';
  if (status === 'CACHE') return 'text-blue-300';
  if (status === 'STALE') return 'text-amber-300';
  if (status === 'PARTIAL') return 'text-amber-300';
  if (status === 'ERROR') return 'text-red-300';
  return 'text-[#808495]';
}

function HealthBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border border-[#343744] bg-[#11131a] px-2 py-1 text-[10px] font-mono ${statusClass(status)}`}>
      {status}
    </span>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: string;
  caption?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
      <div className="text-[#808495] flex items-center gap-1.5 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold font-mono text-[#fafafa]">{value}</div>
      {caption ? <div className="text-[11px] text-[#808495] mt-1">{caption}</div> : null}
    </div>
  );
}

function renderPositionEvidence(pos: PortfolioPosition): string {
  const opp = pos.opportunity;
  const concentration = pos.concentration_contribution;

  return [
    `category: ${opp.category_name || `Category ${opp.category_id}`}`,
    pos.capital_provenance
      ? `capital: ${pos.capital_provenance.source_kind} / ${pos.capital_provenance.source_id} / ${pos.capital_provenance.principal_scope}`
      : 'capital provenance: UNKNOWN',
    `liquidity: days=${Number.isFinite(pos.expected_days_to_sell) ? pos.expected_days_to_sell!.toFixed(2) : 'UNKNOWN'}`,
    `capturability score: ${Number.isFinite(opp.scores.capturability_score) ? opp.scores.capturability_score : 'UNKNOWN'}`,
    pos.expected_realized_profit !== undefined ? `expected realized: ${fmtIsk(pos.expected_realized_profit)}` : null,
    pos.profit_realization_probability !== null && pos.profit_realization_probability !== undefined
      ? `realization probability: ${pos.profit_realization_probability.toFixed(0)}%`
      : null,
    pos.data_confidence !== null && pos.data_confidence !== undefined ? `data confidence: ${pos.data_confidence.toFixed(0)}%` : null,
    pos.prediction_confidence !== null && pos.prediction_confidence !== undefined ? `prediction confidence: ${pos.prediction_confidence.toFixed(0)}%` : null,
    concentration
      ? `concentration type=${(concentration.type_share * 100).toFixed(1)}% group=${(concentration.group_share * 100).toFixed(1)}% category=${(concentration.category_share * 100).toFixed(1)}% route=${(concentration.route_share * 100).toFixed(1)}%`
      : null,
  ].filter(Boolean).join(' · ');
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  proposedAllocation,
  realPortfolio,
  onSelectOpportunity,
}) => {
  const projectedNetProfit = proposedAllocation.proposal_blocked
    ? null
    : proposedAllocation.simulation.positions.reduce(
        (sum, position) => sum + (position.projected_net_profit ?? position.opportunity.costs.net_profit),
        0,
      );
  const deployed = proposedAllocation.proposal_blocked
    ? null
    : proposedAllocation.simulation.total_capital_invested;
  const projectedRoi =
    deployed !== null && deployed > 0 && projectedNetProfit !== null
      ? projectedNetProfit / deployed
      : null;

  return (
    <div className="space-y-6 text-[#fafafa] text-xs">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-bold">Real Portfolio</div>
            <div className="text-[11px] text-[#808495]">
              Réalité observée/reconstruite · pas de valorisation inventée
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <HealthBadge status={realPortfolio.data_health} />
            <span className="text-[10px] font-mono text-[#808495]">
              {realPortfolio.treasury.label}
            </span>
            <span className="text-[10px] font-mono text-[#808495]">
              {realPortfolio.treasury.source_kind}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Cash liquide"
            value={displayIsk(realPortfolio.treasury.treasury_cash)}
            caption={realPortfolio.treasury.principal_scope}
            icon={<DollarSign className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Buy escrow"
            value={displayIsk(realPortfolio.orders.buy_escrow)}
            caption="Réservé aux buy orders"
            icon={<Lock className="w-3.5 h-3.5 text-amber-300" />}
          />
          <MetricCard
            label="Buy obligation"
            value={displayIsk(realPortfolio.orders.buy_obligation)}
            caption="Notional restant"
            icon={<Layers className="w-3.5 h-3.5 text-blue-300" />}
          />
          <MetricCard
            label="Obligation non couverte"
            value={displayIsk(realPortfolio.orders.uncovered_buy_obligation)}
            caption="Diagnostic contingent"
            icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-300" />}
          />
          <MetricCard
            label="Sell exposure"
            value={displayIsk(realPortfolio.orders.sell_exposure)}
            caption="Exposition, pas du cash"
            icon={<Boxes className="w-3.5 h-3.5 text-blue-300" />}
          />
          <MetricCard
            label="Inventaire"
            value={realPortfolio.inventory.coverage}
            caption="Character Assets non intégré"
            icon={<Database className="w-3.5 h-3.5 text-red-300" />}
          />
        </div>

        {realPortfolio.orders.unresolved_corporation_order_count > 0 ? (
          <div className="bg-[#161821] border border-orange-900/60 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-orange-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-orange-200">Ordres corporation non attribués à la division</div>
              <div className="text-[11px] text-[#b9bac5] mt-1">
                {realPortfolio.orders.unresolved_corporation_order_count} ordre(s) corporation sont observés mais leur division de portefeuille n'est pas connue. Les totaux d'escrow, d'obligation et d'exposition restent UNKNOWN plutôt que d'être présentés comme nuls.
              </div>
              <div className="text-[10px] text-orange-300/80 font-mono mt-1">
                Périmètre : {realPortfolio.treasury.source_id} · Notional non attribué : {displayIsk(realPortfolio.orders.unresolved_corporation_order_notional)}
              </div>
            </div>
          </div>
        ) : null}

        <div className="bg-[#161821] border border-amber-900/50 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-200">Inventaire non autoritaire</div>
            <div className="text-[11px] text-[#b9bac5] mt-1">
              Quantité, localisation et valeur complète du stock restent UNKNOWN tant que Character Assets n'est pas intégré.
              Aucun total de net worth exact n'est présenté.
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-bold">Proposed Allocation</div>
            <div className="text-[11px] text-[#808495]">
              Projection décisionnelle · univers cross-item · selected item = navigation uniquement
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <HealthBadge status={proposedAllocation.data_health} />
            <HealthBadge status={proposedAllocation.freshness} />
            <span className="text-[10px] font-mono text-[#808495]">
              Scope {proposedAllocation.treasury.source_id} · {proposedAllocation.treasury.principal_scope}
            </span>
            <span className="text-[10px] font-mono text-[#808495]">
              Couverture {proposedAllocation.candidate_universe.coverage}
            </span>
            <span className="text-[10px] font-mono text-[#808495]">
              {proposedAllocation.candidate_universe.candidate_count} candidats
            </span>
          </div>
        </div>

        {proposedAllocation.proposal_blocked ? (
          <div className="bg-[#161821] border border-red-900/60 rounded-lg p-4 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-red-200">Nouvelle proposition bloquée</div>
              <div className="text-[11px] text-[#b9bac5] mt-1">
                Les données indispensables ne permettent pas une allocation fraîche et fiable.
                Le snapshot précédent, lorsqu'il existe, reste visible avec son état de fraîcheur.
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Budget d'allocation"
            value={displayIsk(proposedAllocation.treasury.allocation_budget)}
            caption={proposedAllocation.treasury.is_simulation ? 'MANUAL / SIMULATION' : proposedAllocation.treasury.source_kind}
            icon={<DollarSign className="w-3.5 h-3.5" />}
          />
          <MetricCard
            label="Capital déployé"
            value={displayIsk(deployed)}
            caption={
              proposedAllocation.proposal_blocked
                ? 'Proposition fraîche bloquée'
                : `${proposedAllocation.simulation.positions.length} positions`
            }
            icon={<Layers className="w-3.5 h-3.5 text-green-300" />}
          />
          <MetricCard
            label="Capital non alloué"
            value={displayIsk(proposedAllocation.unallocated_capital)}
            caption={proposedAllocation.reserve_locked > 0 ? `Réserve: ${fmtIsk(proposedAllocation.reserve_locked)}` : 'Selon contraintes'}
            icon={<Lock className="w-3.5 h-3.5 text-amber-300" />}
          />
          <MetricCard
            label="ROI projeté"
            value={projectedRoi === null ? 'UNKNOWN' : fmtPct(projectedRoi)}
            caption="net profit projeté / capital déployé"
            icon={<ShieldCheck className="w-3.5 h-3.5 text-blue-300" />}
          />
        </div>

        {proposedAllocation.treasury.reserve_configured === false ? (
          <div className="text-[10px] text-[#808495]">
            Réserve de trésorerie : aucune policy explicite configurée (0 ISK appliqué, non caché).
          </div>
        ) : null}

        {proposedAllocation.unallocated_reasons.length > 0 ? (
          <div className="bg-[#161821] border border-[#262730] rounded-lg p-4">
            <div className="font-bold text-sm mb-3">Capital non alloué — raisons explicites</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {proposedAllocation.unallocated_reasons.map((reason, index) => (
                <div key={`${reason.code}-${index}`} className="rounded border border-[#2b2d37] px-3 py-2">
                  <div className="font-mono text-[10px] text-amber-300">{reason.code}</div>
                  <div className="text-[11px] text-[#b9bac5] mt-1">{reason.detail}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="bg-[#161821] border border-[#262730] rounded-lg overflow-hidden">
          <div className="p-3 bg-[#262730] font-bold text-xs flex justify-between items-center gap-3">
            <span>
              Allocations proposées ({proposedAllocation.simulation.positions.length})
            </span>
            <span className="text-[#808495] text-[10px]">
              {proposedAllocation.candidate_universe.state} · {proposedAllocation.candidate_universe.coverage} · {proposedAllocation.simulation.total_expected_daily_profit > 0 ? fmtIsk(proposedAllocation.simulation.total_expected_daily_profit) : 'UNKNOWN'} / j
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-[#1c1e28] text-[#808495] text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-3">Objet</th>
                  <th className="p-3">Route</th>
                  <th className="p-3 text-right">Capital</th>
                  <th className="p-3 text-right">Part déployée</th>
                  <th className="p-3 text-right">Qté</th>
                  <th className="p-3 text-right">Net projeté</th>
                  <th className="p-3 text-right">Capturable</th>
                  <th className="p-3 text-right">ROI</th>
                  <th className="p-3 text-right">Profit/j</th>
                  <th className="p-3 text-right">Days to sell</th>
                  <th className="p-3">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262730]">
                {proposedAllocation.simulation.positions.map((pos, idx) => {
                  const part = deployed !== null && deployed > 0 ? pos.allocated_capital / deployed : 0;
                  return (
                    <tr
                      key={`${pos.opportunity.id}-${idx}`}
                      onClick={() => onSelectOpportunity(pos.opportunity.id)}
                      className="hover:bg-[#20222c] cursor-pointer transition-colors"
                    >
                      <td className="p-3 text-[#fafafa] font-semibold">
                        <div>{pos.opportunity.type_name}</div>
                        <div className="text-[10px] text-[#808495]">{pos.opportunity.group_name}</div>
                      </td>
                      <td className="p-3 text-[#808495]">
                        {pos.opportunity.buy_hub.name} → {pos.opportunity.sell_hub.name}
                      </td>
                      <td className="p-3 text-right text-amber-300 font-bold">
                        {fmtIsk(pos.allocated_capital)}
                      </td>
                      <td className="p-3 text-right text-[#b9bac5]">
                        {(part * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-right text-[#fafafa]">
                        {fmtNumber(pos.allocated_quantity)}
                      </td>
                      <td className="p-3 text-right text-[#fafafa]">
                        {displayIsk(pos.projected_net_profit)}
                      </td>
                      <td className="p-3 text-right text-green-300">
                        {displayIsk(pos.capturable_profit)}
                      </td>
                      <td className="p-3 text-right text-amber-300">
                        {pos.projected_roi === undefined ? 'UNKNOWN' : fmtPct(pos.projected_roi)}
                      </td>
                      <td className="p-3 text-right text-blue-300">
                        {displayIsk(pos.profit_per_day)}
                      </td>
                      <td className="p-3 text-right text-[#b9bac5]">
                        {pos.expected_days_to_sell === undefined ? 'UNKNOWN' : pos.expected_days_to_sell.toFixed(2)}
                      </td>
                      <td className="p-3 min-w-[320px]">
                        <div className="text-[10px] text-[#b9bac5]">
                          {renderPositionEvidence(pos)}
                        </div>
                        <div className="text-[10px] text-[#808495] mt-1">
                          {pos.rationale?.rationale?.slice(0, 2).join(' · ') || 'Rationale indisponible'}
                        </div>
                        <div className="text-[10px] text-[#666a7a] mt-1 truncate">
                          {(pos.risk_fronts ?? []).join(' · ')}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[10px] text-[#666a7a]">
          Aucun métrique ci-dessus ne constitue un résultat réalisé. Le résultat réalisé reste le domaine Financial Truth / Performance.
        </div>
      </section>
    </div>
  );
};
