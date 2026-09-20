import { useState, useEffect, useCallback } from 'react';
import { RawMarketOrder, HistoricalStats, MarketHub } from '../types';
import { MarketDataStore } from '../services/marketDataStore';

export function useMarketData(typeId: number, typeName: string, hubs: MarketHub[]) {
  const [orderBooks, setOrderBooks] = useState<Record<number, RawMarketOrder[]>>({});
  const [historyCache, setHistoryCache] = useState<Record<number, HistoricalStats>>({});
  const [isSyncingLiveEsi, setIsSyncingLiveEsi] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Subscribe to MarketDataStore updates to keep Cockpit order books and history in sync
  useEffect(() => {
    const unsub = MarketDataStore.subscribe(() => {
      const books = MarketDataStore.getOrdersForType(typeId, hubs);
      const hist = MarketDataStore.getHistoryForType(typeId);
      setOrderBooks(books);
      setHistoryCache(hist);
    });
    return () => unsub();
  }, [typeId, hubs]);

  // Initial load and background sync on item change
  useEffect(() => {
    const books = MarketDataStore.getOrdersForType(typeId, hubs);
    const hist = MarketDataStore.getHistoryForType(typeId);
    setOrderBooks(books);
    setHistoryCache(hist);

    MarketDataStore.fetchLiveItemData(typeId, hubs, false)
      .then((res) => {
        setOrderBooks(res.orderBooks);
        setHistoryCache(res.history);
      })
      .catch(() => {});
  }, [typeId, hubs]);

  const syncLiveESI = useCallback(async () => {
    setIsSyncingLiveEsi(true);
    setSyncStatusMsg(`Synchronisation CCP ESI pour ${typeName} sur les hubs actifs...`);

    try {
      const res = await MarketDataStore.fetchLiveItemData(typeId, hubs, true);
      setOrderBooks(res.orderBooks);
      setHistoryCache(res.history);
      setSyncStatusMsg(
        res.successCount > 0
          ? `Succès : ${res.successCount} régions synchronisées en temps réel depuis Tranquility.`
          : 'Données ESI temporairement inaccessibles, carnet mis à jour.'
      );
    } catch {
      setSyncStatusMsg('Erreur lors de la synchronisation ESI.');
    } finally {
      setIsSyncingLiveEsi(false);
      setTimeout(() => setSyncStatusMsg(null), 6000);
    }
  }, [typeId, typeName, hubs]);

  return {
    orderBooks,
    historyCache,
    isSyncingLiveEsi,
    syncStatusMsg,
    syncLiveESI,
  };
}
