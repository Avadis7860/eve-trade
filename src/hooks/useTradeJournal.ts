import { useState } from 'react';
import { InterRegionalOpportunity, RecordedTradeExecution } from '../types';

export function useTradeJournal() {
  const [tradeExecutions, setTradeExecutions] = useState<RecordedTradeExecution[]>(() => {
    try {
      const saved = localStorage.getItem('eve_trade_journal');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleExecuteTrade = (opp: InterRegionalOpportunity) => {
    const entry: RecordedTradeExecution = {
      id: `${Date.now()}_${opp.id}`,
      opportunity_id: opp.id,
      timestamp: new Date().toISOString(),
      type_id: opp.type_id,
      type_name: opp.type_name,
      from_hub: opp.buy_hub.name,
      to_hub: opp.sell_hub.name,
      strategy: opp.strategy,
      predicted_buy_price: opp.effective_buy_price,
      predicted_sell_price: opp.effective_sell_price,
      predicted_quantity: opp.quantity_tradable,
      predicted_net_profit: opp.costs.net_profit,
      predicted_days_to_sell: opp.expected_days_to_sell,
      status: 'planned',
    };

    const next = [entry, ...tradeExecutions];
    setTradeExecutions(next);
    try {
      localStorage.setItem('eve_trade_journal', JSON.stringify(next));
    } catch {}
  };

  const handleUpdateExecution = (updated: RecordedTradeExecution) => {
    const next = tradeExecutions.map((x) => (x.id === updated.id ? updated : x));
    setTradeExecutions(next);
    try {
      localStorage.setItem('eve_trade_journal', JSON.stringify(next));
    } catch {}
  };

  return {
    tradeExecutions,
    handleExecuteTrade,
    handleUpdateExecution,
  };
}
