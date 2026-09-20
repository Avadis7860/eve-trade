import React from 'react';
import { InterRegionalOpportunity } from '../types';
import { fmtIsk, fmtPct, fmtNumber } from '../engine/money';
import {
  X,
  ArrowRight,
  TrendingUp,
  Coins,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  BarChart2,
  Zap,
  ShieldCheck,
  Award,
  Sparkles,
} from 'lucide-react';

interface OpportunityModalProps {
  opportunity: InterRegionalOpportunity | null;
  onClose: () => void;
  onExecuteTrade: (opportunity: InterRegionalOpportunity) => void;
}

export const OpportunityModal: React.FC<OpportunityModalProps> = ({
  opportunity,
  onClose,
  onExecuteTrade,
}) => {
  if (!opportunity) return null;

  const {
    type_name,
    category_name,
    group_name,
    buy_hub,
    sell_hub,
    route,
    strategy,
    costs,
    scores,
    liquidity,
    capturable_profit,
    profit_per_day,
    expected_days_to_sell,
    bottleneck,
    is_anomalous,
    anomaly_reasons,
    is_viable,
    rejection_reasons,
    jita_price_benchmark,
  } = opportunity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#161821] border border-[#262730] rounded-xl max-w-3xl w-full text-[#fafafa] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#fafafa]">{type_name}</h2>
              <span className="text-xs bg-[#262730] text-[#808495] px-2 py-0.5 rounded">
                {category_name} &bull; {group_name}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono uppercase font-bold ${
                  strategy === 'relist' ? 'bg-amber-500/20 text-amber-300' : 'bg-green-500/20 text-green-300'
                }`}
              >
                Stratégie : {strategy === 'relist' ? 'Relist Vendeur' : 'Vente Immédiate'}
              </span>
            </div>
            <div className="text-xs text-[#808495] mt-1 flex items-center gap-2 flex-wrap">
              <span>{buy_hub.name}</span>
              <ArrowRight className="w-3 h-3 text-[#ff4b4b]" />
              <span>{sell_hub.name}</span>
              <span>&bull;</span>
              <span className="text-[#cfd3dc]">{route.jumps} sauts ({route.is_highsec_only ? '100% High-Sec' : 'Low-Sec détecté'})</span>
              {route.chokepoints && route.chokepoints.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-bold flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-red-400" />
                  Coupe-Gorge : {route.chokepoints.join(', ')} (Risque de gank élevé)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#808495] hover:text-[#fafafa] p-1.5 hover:bg-[#262730] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs">
          {/* Jita Reliability Banner */}
          {jita_price_benchmark && (
            <div className="p-3.5 rounded-lg bg-[#0e1117] border border-[#2a2d3d] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#fafafa] flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  Hub de Fiabilité Jita (The Forge) &bull; Source de Vérité
                </span>
                {jita_price_benchmark.is_jita_verified && (
                  <span className="flex items-center gap-1 text-[11px] text-green-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
                    Cours validé
                  </span>
                )}
              </div>
              <p className="text-[#cfd3dc] text-[11px] leading-relaxed">
                {jita_price_benchmark.reliability_assessment}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-[#1c1e28] text-[11px] font-mono">
                <div>
                  <span className="text-[#808495] block text-[10px]">Spot Vendeur Jita :</span>
                  <span className="text-[#fafafa] font-bold">{fmtIsk(jita_price_benchmark.jita_sell_price)}</span>
                </div>
                <div>
                  <span className="text-[#808495] block text-[10px]">Spot Acheteur Jita :</span>
                  <span className="text-[#fafafa] font-bold">{fmtIsk(jita_price_benchmark.jita_buy_price)}</span>
                </div>
                <div>
                  <span className="text-[#808495] block text-[10px]">Écart Achat vs Jita :</span>
                  <span className={`font-bold ${jita_price_benchmark.buy_vs_jita_pct <= 0 ? 'text-green-400' : 'text-amber-400'}`}>
                    {jita_price_benchmark.buy_vs_jita_pct > 0 ? '+' : ''}{jita_price_benchmark.buy_vs_jita_pct.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-[#808495] block text-[10px]">Écart Vente vs Jita :</span>
                  <span className={`font-bold ${jita_price_benchmark.sell_vs_jita_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {jita_price_benchmark.sell_vs_jita_pct > 0 ? '+' : ''}{jita_price_benchmark.sell_vs_jita_pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Phase 2C: 4-Pillars Opportunity Certification (MarketData + Catalog + Universe + Financial Engine) */}
          {opportunity.certification && (
            <div className={`p-3.5 rounded-lg border space-y-2.5 ${
              opportunity.certification.status === 'CERTIFIED'
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
                : opportunity.certification.status === 'DEGRADED'
                ? 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                : 'bg-red-950/30 border-red-500/40 text-red-100'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className={`w-4 h-4 ${
                    opportunity.certification.status === 'CERTIFIED'
                      ? 'text-emerald-400'
                      : opportunity.certification.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`} />
                  <span className="font-bold text-xs uppercase tracking-wider">
                    Chaîne de Preuve 4 Piliers :
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase font-mono ${
                    opportunity.certification.status === 'CERTIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : opportunity.certification.status === 'DEGRADED'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}>
                    {opportunity.certification.status === 'CERTIFIED' ? 'CERTIFIÉ (Actionnable)' : opportunity.certification.status === 'DEGRADED' ? 'DÉGRADÉ (Prudence)' : 'REJETÉ (Non Actionnable)'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0e1117] border border-[#262730] text-[#cfd3dc]">
                    {opportunity.certification.certification_version || '4-pillars-v1'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[#808495] font-mono">
                  <span>
                    Confiance : {(opportunity.certification.confidence * 100).toFixed(0)}%
                  </span>
                  {opportunity.certification.certified_at && (
                    <span>
                      T : {new Date(opportunity.certification.certified_at).toLocaleTimeString('fr-FR')}
                    </span>
                  )}
                </div>
              </div>

              {/* Cryptographic SHA-256 Evidence Hash Banner */}
              {opportunity.certification.evidence_hash && (
                <div className="flex items-center justify-between text-[10px] font-mono bg-[#0e1117]/90 px-2.5 py-1.5 rounded border border-[#262730]">
                  <span className="text-[#808495] flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    Preuve Cryptographique (SHA-256) :
                  </span>
                  <span className="text-emerald-400 select-all" title={opportunity.certification.evidence_hash}>
                    {opportunity.certification.evidence_hash}
                  </span>
                </div>
              )}

              {/* 4 Pillars Status Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[10px] font-mono">
                {/* Pillar 1: MarketData */}
                <div className="bg-[#0e1117]/80 p-2 rounded border border-[#262730]">
                  <span className="text-[#808495] block text-[9px] uppercase">1. MarketData</span>
                  <span className={`font-bold uppercase ${
                    opportunity.certification.pillar_evaluations?.market_data.status === 'PASS'
                      ? 'text-emerald-400'
                      : opportunity.certification.pillar_evaluations?.market_data.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}>
                    {opportunity.certification.pillar_evaluations?.market_data.status || 'PASS'}
                  </span>
                  <div className="text-[9px] text-[#808495] truncate mt-0.5">
                    Src: {opportunity.certification.health_state_source || 'LIVE'} / Dst: {opportunity.certification.health_state_dest || 'LIVE'}
                  </div>
                </div>

                {/* Pillar 2: Catalog */}
                <div className="bg-[#0e1117]/80 p-2 rounded border border-[#262730]">
                  <span className="text-[#808495] block text-[9px] uppercase">2. Catalog</span>
                  <span className={`font-bold uppercase ${
                    opportunity.certification.pillar_evaluations?.catalog.status === 'PASS'
                      ? 'text-emerald-400'
                      : opportunity.certification.pillar_evaluations?.catalog.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}>
                    {opportunity.certification.pillar_evaluations?.catalog.status || 'PASS'}
                  </span>
                  <div className="text-[9px] text-[#808495] truncate mt-0.5">
                    {opportunity.certification.catalog_status || 'RESOLVED_CATALOG'}
                  </div>
                </div>

                {/* Pillar 3: Universe */}
                <div className="bg-[#0e1117]/80 p-2 rounded border border-[#262730]">
                  <span className="text-[#808495] block text-[9px] uppercase">3. Universe</span>
                  <span className={`font-bold uppercase ${
                    opportunity.certification.pillar_evaluations?.universe.status === 'PASS'
                      ? 'text-emerald-400'
                      : opportunity.certification.pillar_evaluations?.universe.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}>
                    {opportunity.certification.pillar_evaluations?.universe.status || 'PASS'}
                  </span>
                  <div className="text-[9px] text-[#808495] truncate mt-0.5">
                    {route.jumps} sauts {route.is_highsec_only ? '(Highsec)' : '(Risque)'}
                  </div>
                </div>

                {/* Pillar 4: Financial Engine */}
                <div className="bg-[#0e1117]/80 p-2 rounded border border-[#262730]">
                  <span className="text-[#808495] block text-[9px] uppercase">4. Financial</span>
                  <span className={`font-bold uppercase ${
                    opportunity.certification.pillar_evaluations?.financial_engine.status === 'PASS'
                      ? 'text-emerald-400'
                      : opportunity.certification.pillar_evaluations?.financial_engine.status === 'DEGRADED'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}>
                    {opportunity.certification.pillar_evaluations?.financial_engine.status || 'PASS'}
                  </span>
                  <div className="text-[9px] text-[#808495] truncate mt-0.5">
                    ROI: {(costs.roi * 100).toFixed(1)}% | Marge: {(costs.margin * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              {opportunity.certification.warnings && opportunity.certification.warnings.length > 0 && (
                <div className="text-[10px] text-amber-300/90 pt-1 border-t border-[#262730]/50">
                  <span className="font-semibold text-amber-400">Avertissements : </span>
                  {opportunity.certification.warnings.join(' • ')}
                </div>
              )}
              {opportunity.certification.blocking_reasons && opportunity.certification.blocking_reasons.length > 0 && (
                <div className="text-[10px] text-red-300/90 pt-1 border-t border-[#262730]/50">
                  <span className="font-semibold text-red-400">Raisons de blocage : </span>
                  {opportunity.certification.blocking_reasons.join(' • ')}
                </div>
              )}
            </div>
          )}

          {/* Anomaly / Warning Badges */}
          {is_anomalous && (
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/50 text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Signalement Anomalie Marché</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px]">
                  {anomaly_reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!is_viable && (
            <div className="p-3 rounded-lg bg-red-950/40 border border-red-600/50 text-red-200 flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Critères de Rejet (Non Viable)</strong>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[11px]">
                  {rejection_reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Key KPI Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0e1117] p-3 rounded-lg border border-[#262730]">
              <div className="text-[#808495] mb-1">Profit Net Réel</div>
              <div className={`text-xl font-bold font-mono ${costs.net_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtIsk(costs.net_profit)}
              </div>
              <div className="text-[10px] text-[#808495] mt-1">
                Capturable : <span className="text-[#fafafa]">{fmtIsk(capturable_profit)}</span>
              </div>
            </div>

            <div className="bg-[#0e1117] p-3 rounded-lg border border-[#262730]">
              <div className="text-[#808495] mb-1">Retour sur Investissement</div>
              <div className={`text-xl font-bold font-mono ${costs.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmtPct(costs.roi)}
              </div>
              <div className="text-[10px] text-[#808495] mt-1">
                Marge nette : <span className="text-[#fafafa]">{fmtPct(costs.margin)}</span>
              </div>
            </div>

            <div className="bg-[#0e1117] p-3 rounded-lg border border-[#262730]">
              <div className="text-[#808495] mb-1">Profit / Jour (Rotation)</div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {fmtIsk(profit_per_day)}
              </div>
              <div className="text-[10px] text-[#808495] mt-1">
                Vente estimée : <span className="text-[#fafafa]">{expected_days_to_sell.toFixed(1)} j</span>
              </div>
            </div>

            <div className="bg-[#0e1117] p-3 rounded-lg border border-[#262730]">
              <div className="text-[#808495] mb-1">Score Global</div>
              <div className="text-xl font-bold font-mono text-[#ff4b4b]">
                {scores.overall_score} / 100
              </div>
              <div className="text-[10px] text-[#808495] mt-1">
                Capturabilité : <span className="text-[#fafafa]">{scores.capturability_score}%</span>
              </div>
            </div>
          </div>

          {/* Pricing & Execution Depth Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730] space-y-2">
              <h3 className="font-bold text-[#fafafa] text-sm flex items-center gap-1.5 border-b border-[#262730] pb-2">
                <Coins className="w-4 h-4 text-[#ff4b4b]" />
                1. Achat sur {buy_hub.name}
              </h3>
              <div className="flex justify-between py-1 border-b border-[#1c1e28]">
                <span className="text-[#808495]">Prix spot meilleur vendeur</span>
                <span className="font-mono text-[#fafafa]">{fmtIsk(opportunity.best_buy_order_price)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c1e28]">
                <span className="text-[#808495]">Prix effectif pondéré (fill)</span>
                <span className="font-mono text-[#fafafa]">{fmtIsk(opportunity.effective_buy_price)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c1e28]">
                <span className="text-[#808495]">Quantité achetable</span>
                <span className="font-mono font-bold text-[#fafafa]">{fmtNumber(opportunity.quantity_tradable)} unités</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#808495]">Facteur limitant (bottleneck)</span>
                <span className="font-mono uppercase text-[#ff4b4b] font-semibold">{bottleneck}</span>
              </div>
            </div>

            <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730] space-y-2">
              <h3 className="font-bold text-[#fafafa] text-sm flex items-center gap-1.5 border-b border-[#262730] pb-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                2. Revente sur {sell_hub.name}
              </h3>
              <div className="flex justify-between py-1 border-b border-[#1c1e28]">
                <span className="text-[#808495]">Prix cible de sortie</span>
                <span className="font-mono text-[#fafafa]">{fmtIsk(opportunity.best_sell_order_price)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c1e28]">
                <span className="text-[#808495]">Prix effectif pondéré (fill)</span>
                <span className="font-mono text-[#fafafa]">{fmtIsk(opportunity.effective_sell_price)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#1c1e28]">
                <span className="text-[#808495]">Volume quotidien estimé</span>
                <span className="font-mono text-[#fafafa]">{fmtNumber(liquidity.daily_volume_dest)} unités / j</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#808495]">Temps d’écoulement estimé</span>
                <span className="font-mono text-[#fafafa]">{expected_days_to_sell.toFixed(1)} jours</span>
              </div>
            </div>
          </div>

          {/* Full Cost & Fees Breakdown */}
          <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730]">
            <h3 className="font-bold text-[#fafafa] text-sm mb-3 flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-[#808495]" />
              Décomposition Exhaustive des Frais &amp; Rentabilité
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Coût d'achat brut</div>
                <div className="text-[#fafafa] font-bold">{fmtIsk(costs.purchase_cost)}</div>
              </div>
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Courtage achat (Taker: 0)</div>
                <div className="text-[#fafafa] font-bold">{fmtIsk(costs.buy_broker_fee)}</div>
              </div>
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Frais de transport</div>
                <div className="text-[#fafafa] font-bold">{fmtIsk(costs.transport_cost)}</div>
              </div>
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Capital total engagé</div>
                <div className="text-amber-400 font-bold">{fmtIsk(costs.total_acquisition_cost)}</div>
              </div>

              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Revenu brut</div>
                <div className="text-[#fafafa] font-bold">{fmtIsk(costs.gross_revenue)}</div>
              </div>
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Taxe de vente (CCP)</div>
                <div className="text-[#fafafa] font-bold">{fmtIsk(costs.sales_tax)}</div>
              </div>
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Courtage vente (relist)</div>
                <div className="text-[#fafafa] font-bold">{fmtIsk(costs.sell_broker_fee)}</div>
              </div>
              <div className="p-2 bg-[#161821] rounded">
                <div className="text-[#808495]">Revenu net en caisse</div>
                <div className="text-green-400 font-bold">{fmtIsk(costs.net_revenue)}</div>
              </div>
            </div>
          </div>

          {/* Transparent Multi-Factor Score Decomposition */}
          <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730]">
            <h3 className="font-bold text-[#fafafa] text-sm mb-3 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Décomposition des Facteurs de Scoring (0 à 100)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Profit</span>
                  <span>{scores.profit_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-green-400 h-full" style={{ width: `${scores.profit_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>ROI</span>
                  <span>{scores.roi_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-400 h-full" style={{ width: `${scores.roi_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Liquidité</span>
                  <span>{scores.liquidity_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-amber-400 h-full" style={{ width: `${scores.liquidity_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Rotation</span>
                  <span>{scores.turnover_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-400 h-full" style={{ width: `${scores.turnover_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Capturabilité</span>
                  <span>{scores.capturability_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-purple-400 h-full" style={{ width: `${scores.capturability_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Transport</span>
                  <span>{scores.transport_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-teal-400 h-full" style={{ width: `${scores.transport_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Stabilité</span>
                  <span>{scores.stability_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${scores.stability_score}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#808495] mb-1">
                  <span>Concurrence</span>
                  <span>{scores.competition_score}</span>
                </div>
                <div className="w-full bg-[#262730] h-1.5 rounded-full overflow-hidden">
                  <div className="bg-rose-400 h-full" style={{ width: `${scores.competition_score}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Predictive Machine Learning & Market Dynamics */}
          {opportunity.prediction && (
            <div className="bg-[#0e1117] p-4 rounded-lg border border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-[#fafafa] text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Modélisation Prédictive &amp; Dynamique de Marché
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                      opportunity.prediction.risk_level === 'low'
                        ? 'bg-green-500/20 text-green-300'
                        : opportunity.prediction.risk_level === 'moderate'
                        ? 'bg-blue-500/20 text-blue-300'
                        : opportunity.prediction.risk_level === 'elevated'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    Risque : {opportunity.prediction.risk_level}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                    Confiance : {(opportunity.prediction.prediction_confidence > 1 ? opportunity.prediction.prediction_confidence : opportunity.prediction.prediction_confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3 font-mono">
                <div className="p-2.5 bg-[#161821] rounded border border-[#262730]">
                  <div className="text-[#808495] text-[10px]">Survie du Spread</div>
                  <div className="text-base font-bold text-emerald-400">
                    {(opportunity.prediction.survival_probability > 1 ? opportunity.prediction.survival_probability : opportunity.prediction.survival_probability * 100).toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-[#808495]">Maintien de rentabilité</div>
                </div>

                <div className="p-2.5 bg-[#161821] rounded border border-[#262730]">
                  <div className="text-[#808495] text-[10px]">Réalisation du Profit</div>
                  <div className="text-base font-bold text-purple-300">
                    {(opportunity.prediction.profit_realization_probability > 1 ? opportunity.prediction.profit_realization_probability : opportunity.prediction.profit_realization_probability * 100).toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-[#808495]">{fmtIsk(opportunity.prediction.expected_realized_profit)} espéré</div>
                </div>

                <div className="p-2.5 bg-[#161821] rounded border border-[#262730]">
                  <div className="text-[#808495] text-[10px]">Momentum Spread (1h)</div>
                  <div
                    className={`text-base font-bold ${
                      (opportunity.features?.spread_momentum_1h ?? 0) >= 0 ? 'text-green-400' : 'text-rose-400'
                    }`}
                  >
                    {(opportunity.features?.spread_momentum_1h ?? 0) >= 0 ? '+' : ''}
                    {(opportunity.features?.spread_momentum_1h ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-[9px] text-[#808495]">Dynamique court terme</div>
                </div>

                <div className="p-2.5 bg-[#161821] rounded border border-[#262730]">
                  <div className="text-[#808495] text-[10px]">Vitesse Concurrence</div>
                  <div className="text-base font-bold text-amber-300">
                    {(opportunity.features?.competition_velocity_orders ?? 0).toFixed(1)}
                  </div>
                  <div className="text-[9px] text-[#808495]">Nouveaux ordres / h</div>
                </div>
              </div>

              {((opportunity.prediction.key_drivers && opportunity.prediction.key_drivers.length > 0) ||
                (opportunity.prediction.limiting_factors && opportunity.prediction.limiting_factors.length > 0)) && (
                <div className="space-y-1.5 text-[11px] bg-[#161821] p-2.5 rounded border border-[#262730]">
                  {opportunity.prediction.key_drivers && opportunity.prediction.key_drivers.length > 0 && (
                    <div>
                      <span className="text-[10px] text-green-400 font-bold block mb-1">Moteurs favorables :</span>
                      {opportunity.prediction.key_drivers.map((driver: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-[#d1d5db]">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          <span>{driver}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {opportunity.prediction.limiting_factors && opportunity.prediction.limiting_factors.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[10px] text-amber-400 font-bold block mb-1">Facteurs de vigilance :</span>
                      {opportunity.prediction.limiting_factors.map((factor: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-[#d1d5db]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                          <span>{factor}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Data Quality & Provenance Traceability */}
          {opportunity.data_quality && (
            <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730]">
              <h3 className="font-bold text-[#fafafa] text-sm mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Provenance &amp; Traçabilité des Données de Marché ESI
                </span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                  opportunity.data_quality.confidence_score >= 0.8
                    ? 'bg-green-500/20 text-green-300'
                    : opportunity.data_quality.confidence_score >= 0.5
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-red-500/20 text-red-300'
                }`}>
                  Indice de Confiance : {(opportunity.data_quality.confidence_score * 100).toFixed(0)}%
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
                <div className="p-2 bg-[#161821] rounded">
                  <span className="text-[#808495] block text-[10px]">Source Buy Hub ({buy_hub.name}) :</span>
                  <span className="text-[#fafafa] font-bold uppercase">{opportunity.data_quality.buy_hub_quality?.source || 'ESI'}</span>
                  <span className="block text-[10px] text-[#808495]">
                    {opportunity.data_quality.buy_hub_quality?.orders_valid ?? 0} ordres validés
                  </span>
                </div>
                <div className="p-2 bg-[#161821] rounded">
                  <span className="text-[#808495] block text-[10px]">Source Sell Hub ({sell_hub.name}) :</span>
                  <span className="text-[#fafafa] font-bold uppercase">{opportunity.data_quality.sell_hub_quality?.source || 'ESI'}</span>
                  <span className="block text-[10px] text-[#808495]">
                    {opportunity.data_quality.sell_hub_quality?.orders_valid ?? 0} ordres validés
                  </span>
                </div>
                <div className="p-2 bg-[#161821] rounded">
                  <span className="text-[#808495] block text-[10px]">Fraîcheur Temporelle :</span>
                  <span className={`font-bold uppercase ${
                    opportunity.data_quality.overall_freshness === 'fresh'
                      ? 'text-green-400'
                      : opportunity.data_quality.overall_freshness === 'recent'
                      ? 'text-blue-400'
                      : 'text-amber-400'
                  }`}>
                    {opportunity.data_quality.overall_freshness}
                  </span>
                  <span className="block text-[10px] text-[#808495]">
                    Âge max : {Math.max(opportunity.data_quality.buy_hub_quality?.age_seconds ?? 0, opportunity.data_quality.sell_hub_quality?.age_seconds ?? 0)}s
                  </span>
                </div>
                <div className="p-2 bg-[#161821] rounded">
                  <span className="text-[#808495] block text-[10px]">Exhaustivité des Pages :</span>
                  <span className="text-[#fafafa] font-bold uppercase">
                    {opportunity.data_quality.overall_completeness}
                  </span>
                  <span className="block text-[10px] text-[#808495]">
                    {(opportunity.data_quality.buy_hub_quality?.pages_fetched ?? 1) + (opportunity.data_quality.sell_hub_quality?.pages_fetched ?? 1)} pages lues
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#262730] bg-[#161821] flex items-center justify-between">
          <div className="text-xs text-[#808495]">
            Volume Cargo : <strong className="text-[#fafafa]">{fmtNumber(opportunity.total_cargo_volume)} m³</strong>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] rounded-md font-medium transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={() => {
                onExecuteTrade(opportunity);
                onClose();
              }}
              className="px-5 py-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white rounded-md font-bold flex items-center gap-2 shadow-lg transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Enregistrer dans le Journal de Trades</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
