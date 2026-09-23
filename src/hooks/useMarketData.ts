import { useState, useEffect, useCallback } from 'react';
import { RawMarketOrder, HistoricalStats, MarketDataQuality, MarketHub } from '../types';
import { MarketDataStore } from '../services/marketDataStore';

export function useMarketData(typeId:number,typeName:string,hubs:MarketHub[]){
  const [orderBooks,setOrderBooks]=useState<Record<number,RawMarketOrder[]>>({});
  const [historyCache,setHistoryCache]=useState<Record<number,HistoricalStats>>({});
  const [qualities,setQualities]=useState<Record<number,MarketDataQuality>>({});
  const [isSyncingLiveEsi,setIsSyncingLiveEsi]=useState(false);
  const [syncStatusMsg,setSyncStatusMsg]=useState<string|null>(null);
  const hydrate=useCallback(()=>{setOrderBooks(MarketDataStore.getOrdersForType(typeId,hubs));setHistoryCache(MarketDataStore.getHistoryForType(typeId));setQualities(MarketDataStore.getQualitiesForType(typeId,hubs));},[typeId,hubs]);
  useEffect(()=>{const unsub=MarketDataStore.subscribe(hydrate);return()=>unsub();},[hydrate]);
  useEffect(()=>{hydrate();MarketDataStore.fetchLiveItemData(typeId,hubs,false).then(res=>{setOrderBooks(res.orderBooks);setHistoryCache(res.history);setQualities(res.qualities);}).catch(e=>setSyncStatusMsg('Impossible de synchroniser '+typeName+' : '+String(e)));},[typeId,typeName,hubs,hydrate]);
  const syncLiveESI=useCallback(async()=>{setIsSyncingLiveEsi(true);setSyncStatusMsg('Synchronisation CCP ESI pour '+typeName+' sur les hubs actifs...');try{const res=await MarketDataStore.fetchLiveItemData(typeId,hubs,true);setOrderBooks(res.orderBooks);setHistoryCache(res.history);setQualities(res.qualities);setSyncStatusMsg(res.successCount>0?'Succès : '+res.successCount+' régions synchronisées en temps réel depuis Tranquility.':'ESI n’a pas fourni un jeu complet. Les états de santé des hubs indiquent la situation réelle.');}catch(e){setSyncStatusMsg('Erreur lors de la synchronisation ESI : '+String(e));}finally{setIsSyncingLiveEsi(false);setTimeout(()=>setSyncStatusMsg(null),7000);}},[typeId,typeName,hubs]);
  return {orderBooks,historyCache,qualities,isSyncingLiveEsi,syncStatusMsg,syncLiveESI};
}
