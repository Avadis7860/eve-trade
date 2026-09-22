import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useTradingConfig } from '../context/TradingConfigProvider';
import { syncCorporationTreasury } from '../services/corporationTreasurySync';

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

    const credentialGeneration =
      activeCharacter.last_validated_at ||
      activeCharacter.expires_at ||
      activeCharacter.session_version ||
      'unknown';
    const syncKey = `${activeCharacter.character_id}:${division}:${credentialGeneration}`;

    if (corporationWalletSource === 'manual') {
      lastSyncedKeyRef.current = null;
      return;
    }

    if (corporationWalletSource === 'unavailable') {
      lastSyncedKeyRef.current = null;
    }

    if (lastSyncedKeyRef.current === syncKey) return;

    lastSyncedKeyRef.current = syncKey;
    let cancelled = false;

    const sync = async () => {
      const result = await syncCorporationTreasury({
        characterId: activeCharacter.character_id,
        accessToken: activeCharacter.access_token,
        division,
      });

      if (cancelled) return;

      if (result.ok) {
        setConfig((prev) => ({
          ...prev,
          corporation_id: result.corporation.corporation_id,
          corporation_name: result.corporation.corporation_name,
          corporation_wallet_balance: result.selectedWallet.balance,
          corporation_divisions: result.wallets,
          corporation_wallet_source: 'esi',
        }));
        return;
      }

      setConfig((prev) => ({
        ...prev,
        ...(result.corporation
          ? {
              corporation_id: result.corporation.corporation_id,
              corporation_name: result.corporation.corporation_name,
            }
          : {}),
        corporation_wallet_source: 'unavailable',
      }));
    };

    void sync().catch((error) => {
      if (cancelled) return;
      console.warn('[useCorporationTreasurySync] corporation treasury sync failed:', error);
      setConfig((prev) => ({
        ...prev,
        corporation_wallet_source: 'unavailable',
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [
    characterSession?.character_id,
    characterSession?.access_token,
    characterSession?.last_validated_at,
    characterSession?.expires_at,
    characterSession?.session_version,
    treasurySourceMode,
    corporationWalletSource,
    division,
    setConfig,
  ]);
}
