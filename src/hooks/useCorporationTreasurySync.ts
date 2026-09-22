import { useEffect, useRef } from 'react';
import { EsiService } from '../services/esi';
import { useAuth } from '../context/AuthProvider';
import { useTradingConfig } from '../context/TradingConfigProvider';

export function useCorporationTreasurySync(): void {
  const { characterSession } = useAuth();
  const { config: tradingConfig, setConfig } = useTradingConfig();

  const treasurySourceMode = tradingConfig.treasury_source_mode ?? 'corporation';
  const corporationWalletSource = tradingConfig.corporation_wallet_source ?? 'unavailable';
  const division = tradingConfig.corporation_wallet_division || 1;
  const lastSyncedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const activeCharacter = characterSession;
    if (!activeCharacter || treasurySourceMode !== 'corporation') {
      lastSyncedKeyRef.current = null;
      return;
    }

    const syncKey = `${activeCharacter.character_id}:${division}`;

    if (corporationWalletSource === 'manual') {
      lastSyncedKeyRef.current = null;
      return;
    }

    if (lastSyncedKeyRef.current === syncKey) return;

    lastSyncedKeyRef.current = syncKey;
    let cancelled = false;

    const syncCorporationTreasury = async () => {
      try {
        const corpInfo = await EsiService.fetchCorporationInfo(
          activeCharacter.character_id,
          activeCharacter.access_token,
        );

        if (cancelled) return;

        if (!corpInfo.ok || !corpInfo.data) {
          setConfig((prev) => ({
            ...prev,
            corporation_wallet_source: 'unavailable',
          }));
          return;
        }

        const corpWallets = await EsiService.fetchCorporationWallets(
          activeCharacter.character_id,
          activeCharacter.access_token,
        );

        if (cancelled) return;

        if (!corpWallets.ok || !corpWallets.data?.wallets) {
          setConfig((prev) => ({
            ...prev,
            corporation_id: corpInfo.data!.corporation_id,
            corporation_name: corpInfo.data!.corporation_name,
            corporation_wallet_source: 'unavailable',
          }));
          return;
        }

        const selected =
          corpWallets.data.wallets.find((wallet) => wallet.division === division)
          || corpWallets.data.wallets[0];

        setConfig((prev) => ({
          ...prev,
          corporation_id: corpInfo.data!.corporation_id,
          corporation_name: corpInfo.data!.corporation_name,
          corporation_wallet_balance: selected?.balance,
          corporation_divisions: corpWallets.data!.wallets,
          corporation_wallet_source: 'esi',
        }));
      } catch (error) {
        if (cancelled) return;
        console.warn('[useCorporationTreasurySync] corporation treasury sync failed:', error);
        setConfig((prev) => ({
          ...prev,
          corporation_wallet_source: 'unavailable',
        }));
      }
    };

    syncCorporationTreasury();

    return () => {
      cancelled = true;
    };
  }, [
    characterSession?.character_id,
    characterSession?.access_token,
    treasurySourceMode,
    corporationWalletSource,
    division,
    setConfig,
  ]);
}
