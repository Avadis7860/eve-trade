import React, { useState } from 'react';
import { RecordedTradeExecution } from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import { BookOpen, CheckCircle, Clock, AlertCircle, Edit3 } from 'lucide-react';

interface TradeJournalProps {
  executions: RecordedTradeExecution[];
  onUpdateExecution: (execution: RecordedTradeExecution) => void;
}

export const TradeJournal: React.FC<TradeJournalProps> = ({
  executions,
  onUpdateExecution,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actualProfit, setActualProfit] = useState<number>(0);
  const [actualDays, setActualDays] = useState<number>(1);
  const [status, setStatus] = useState<RecordedTradeExecution['status']>('completed');

  const handleStartEdit = (item: RecordedTradeExecution) => {
    setEditingId(item.id);
    setActualProfit(item.actual_net_profit ?? item.predicted_net_profit);
    setActualDays(item.actual_days_to_sell ?? item.predicted_days_to_sell);
    setStatus(item.status);
  };

  const handleSave = (item: RecordedTradeExecution) => {
    onUpdateExecution({
      ...item,
      actual_net_profit: actualProfit,
      actual_days_to_sell: actualDays,
      status,
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-4 text-xs text-[#fafafa]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#ff4b4b]" />
          Journal d'Exécution &amp; Feedback Loop (Apprentissage)
        </h2>
        <span className="text-[#808495] text-[11px]">
          {executions.length} trades enregistrés
        </span>
      </div>

      <div className="p-3 bg-[#161821] border border-[#262730] rounded-lg text-[#808495] leading-relaxed">
        Ce journal compare les <strong>prédictions du modèle</strong> aux <strong>résultats réels observés</strong> (profit capturé, jours de liquidation). Il alimente la boucle de feedback pour calibrer les scores de capturabilité et éliminer les faux signaux.
      </div>

      {executions.length === 0 ? (
        <div className="p-8 text-center text-[#808495] bg-[#161821] border border-[#262730] rounded-lg">
          Aucun trade dans le journal. Cliquez sur « Enregistrer dans le Journal » depuis une opportunité pour démarrer le suivi.
        </div>
      ) : (
        <div className="bg-[#161821] border border-[#262730] rounded-lg overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#262730] text-[#808495] uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Objet</th>
                <th className="p-3">Route</th>
                <th className="p-3 text-right">Profit Prévu</th>
                <th className="p-3 text-right">Profit Réel</th>
                <th className="p-3 text-right">Écart Profit</th>
                <th className="p-3 text-right">Jours Prévus</th>
                <th className="p-3 text-right">Jours Réels</th>
                <th className="p-3 text-center">Statut</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262730]">
              {executions.map((exec) => {
                const isEditing = editingId === exec.id;
                const hasActual = exec.actual_net_profit !== undefined;
                const profitDiff = hasActual
                  ? (exec.actual_net_profit || 0) - exec.predicted_net_profit
                  : 0;

                return (
                  <tr key={exec.id} className="hover:bg-[#20222c] transition-colors">
                    <td className="p-3 text-[#808495] whitespace-nowrap">
                      {new Date(exec.timestamp).toLocaleDateString('fr-FR', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-semibold text-[#fafafa]">{exec.type_name}</td>
                    <td className="p-3 text-[#808495]">{exec.from_hub} → {exec.to_hub}</td>
                    <td className="p-3 text-right text-[#808495]">
                      {fmtIsk(exec.predicted_net_profit)}
                    </td>

                    {/* Actual Profit */}
                    <td className="p-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={actualProfit}
                          onChange={(e) => setActualProfit(parseFloat(e.target.value) || 0)}
                          className="w-28 bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1 rounded text-right font-mono"
                        />
                      ) : hasActual ? (
                        <span className="font-bold text-green-400">
                          {fmtIsk(exec.actual_net_profit)}
                        </span>
                      ) : (
                        <span className="text-[#808495] italic">En attente</span>
                      )}
                    </td>

                    {/* Diff */}
                    <td className="p-3 text-right font-bold">
                      {hasActual ? (
                        <span className={profitDiff >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {profitDiff >= 0 ? '+' : ''}
                          {fmtIsk(profitDiff)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="p-3 text-right text-[#808495]">
                      {exec.predicted_days_to_sell.toFixed(1)}j
                    </td>

                    {/* Actual Days */}
                    <td className="p-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.5"
                          value={actualDays}
                          onChange={(e) => setActualDays(parseFloat(e.target.value) || 0.5)}
                          className="w-16 bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1 rounded text-right font-mono"
                        />
                      ) : exec.actual_days_to_sell !== undefined ? (
                        <span>{exec.actual_days_to_sell.toFixed(1)}j</span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Status */}
                    <td className="p-3 text-center">
                      {isEditing ? (
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
                          className="bg-[#0e1117] border border-[#31333f] text-[#fafafa] p-1 rounded text-xs"
                        >
                          <option value="planned">Planifié</option>
                          <option value="in_transit">En transit</option>
                          <option value="active_orders">Ordres posés</option>
                          <option value="completed">Complété</option>
                          <option value="cancelled">Annulé</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            exec.status === 'completed'
                              ? 'bg-green-950/60 text-green-300 border border-green-700/50'
                              : exec.status === 'active_orders'
                              ? 'bg-blue-950/60 text-blue-300 border border-blue-700/50'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {exec.status}
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="p-3 text-center">
                      {isEditing ? (
                        <button
                          onClick={() => handleSave(exec)}
                          className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-[11px] font-bold"
                        >
                          Sauvegarder
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(exec)}
                          className="p-1 text-[#808495] hover:text-[#fafafa]"
                          title="Saisir résultat réel"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
