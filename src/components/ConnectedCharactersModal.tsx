import React, { useState, useEffect } from 'react';
import { AuthService } from '../services/authService';
import { EveCharacterSession, MarketHub } from '../types';
import { SsoConnectCard } from './SsoConnectCard';
import { fmtIsk } from '../engine/money';
import { MAJOR_MARKET_HUBS } from '../data/universe';
import {
  Users,
  UserCheck,
  RefreshCw,
  Trash2,
  Clock,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  Shield,
  MapPin,
} from 'lucide-react';

interface ConnectedCharactersModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCharacter: EveCharacterSession | null;
  onSelectCharacter: (session: EveCharacterSession) => void;
  onConnectSSO: (customRedirectUri?: string) => void;
  onRefreshCharacter: (session: EveCharacterSession) => Promise<void>;
}

export const ConnectedCharactersModal: React.FC<ConnectedCharactersModalProps> = ({
  isOpen,
  onClose,
  activeCharacter,
  onSelectCharacter,
  onConnectSSO,
  onRefreshCharacter,
}) => {
  const [characters, setCharacters] = useState<EveCharacterSession[]>([]);
  const [activeTab, setActiveTab] = useState<'characters' | 'connect'>('characters');
  const [isRefreshingId, setIsRefreshingId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<
    { text: string; type: 'success' | 'error' | 'info' } | null
  >(null);
  const [timeNow, setTimeNow] = useState(Date.now());

  const reloadData = () => {
    setCharacters(AuthService.getLinkedCharacters());
  };

  useEffect(() => {
    if (!isOpen) return;

    const syncCharacters = () => {
      setCharacters(AuthService.getLinkedCharacters());
      // OAuth callbacks update AuthService outside this modal. Keep the modal
      // synchronized with the authoritative character registry and return to
      // the character list once a new session is committed.
      setActiveTab('characters');
    };

    syncCharacters();
    return AuthService.subscribe(() => syncCharacters());
  }, [isOpen]);

  useEffect(() => {
    const timer = setInterval(() => setTimeNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  const handleSwitchActive = (char: EveCharacterSession) => {
    const updated = AuthService.setActiveCharacter(char.character_id);
    if (updated) {
      reloadData();
      onSelectCharacter(updated);
      setStatusMessage({
        text: `${char.character_name} est maintenant le personnage actif.`,
        type: 'success',
      });
    }
  };

  const handleRefresh = async (char: EveCharacterSession) => {
    setIsRefreshingId(char.character_id);
    try {
      const freshSession = await AuthService.refreshCharacterToken(char);
      await onRefreshCharacter(freshSession);
      reloadData();
      setStatusMessage({
        text: `Session de ${char.character_name} rafraîchie et validée auprès de l'ESI.`,
        type: 'success',
      });
    } catch (err) {
      setStatusMessage({
        text: `Erreur de rafraîchissement : ${String(err)}`,
        type: 'error',
      });
    } finally {
      setIsRefreshingId(null);
    }
  };

  const handleRemove = (charId: number, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir retirer le personnage ${name} ?`)) return;

    const remaining = AuthService.removeCharacter(charId);
    setCharacters(remaining);
    const newActive = AuthService.getActiveCharacter();
    if (newActive) onSelectCharacter(newActive);
    setStatusMessage({ text: `Personnage ${name} retiré.`, type: 'info' });
  };

  const handleSessionReady = async (session: EveCharacterSession) => {
    await onRefreshCharacter(session);
    reloadData();
    onSelectCharacter(session);
    setActiveTab('characters');
    setStatusMessage({
      text: `Personnage ${session.character_name} connecté avec succès !`,
      type: 'success',
    });
  };

  const handleUpdateHubSettings = (
    charId: number,
    settings: {
      assigned_hub_id?: string;
      assigned_hub_name?: string;
      assigned_station_id?: number;
    },
  ) => {
    AuthService.updateCharacterHubSettings(charId, settings);
    reloadData();
    setStatusMessage({ text: 'Hub d’opération mis à jour.', type: 'success' });
  };

  const formatExpiresIn = (expiresAt?: number) => {
    if (!expiresAt) return { text: 'Session active', color: 'text-emerald-400' };
    const diffMs = expiresAt - timeNow;
    if (diffMs <= 0) {
      return { text: 'Jeton expiré (Renouvellement auto)', color: 'text-amber-400' };
    }
    const mins = Math.floor(diffMs / 60_000);
    const secs = Math.floor((diffMs % 60_000) / 1_000);
    if (mins < 3) {
      return { text: `Expire dans ${mins}m ${secs}s`, color: 'text-amber-400' };
    }
    return { text: `Valide (${mins} min restant)`, color: 'text-emerald-400' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#161821] border border-[#262730] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#fafafa] flex items-center gap-2">
                Personnages &amp; Hubs
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
                  {characters.length} pilote{characters.length > 1 ? 's' : ''}
                </span>
              </h2>
              <p className="text-xs text-[#808495]">
                Un personnage peut être affecté à un hub pour gérer localement ses ordres ; la
                corporation reste la vue générale des ordres d’entreprise.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#808495] hover:text-[#fafafa] p-1.5 rounded-lg hover:bg-[#262730] transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-0 bg-[#0e1117] border-b border-[#262730] flex items-center gap-4">
          <button
            onClick={() => setActiveTab('characters')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'characters'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Personnages ({characters.length})
          </button>
          <button
            onClick={() => setActiveTab('connect')}
            className={`pb-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'connect'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Ajouter un pilote
          </button>
        </div>

        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs flex items-center justify-between border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {statusMessage.type === 'info' && <Info className="w-4 h-4 flex-shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="opacity-70 hover:opacity-100 font-bold ml-2"
            >
              &times;
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {activeTab === 'characters' ? (
            characters.length === 0 ? (
              <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-[#262730] space-y-3">
                <Users className="w-10 h-10 text-[#808495] mx-auto opacity-40" />
                <div className="text-sm font-bold text-[#fafafa]">Aucun personnage connecté</div>
                <p className="text-xs text-[#808495] max-w-md mx-auto">
                  Connectez vos personnages via le SSO, puis affectez-les aux hubs où vous gérez
                  vos ordres.
                </p>
                <button
                  onClick={() => setActiveTab('connect')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs transition-colors"
                >
                  Connecter un pilote
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-[#fafafa]">Personnages connectés</h3>
                    <p className="text-[10px] text-[#808495] mt-0.5">
                      Utilisez l’affectation de hub comme repère opérationnel pour vos ordres
                      dispersés.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('connect')}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    + Ajouter un pilote
                  </button>
                </div>

                <div className="space-y-3">
                  {characters.map((char) => {
                    const isActive = activeCharacter?.character_id === char.character_id;
                    const expInfo = formatExpiresIn(char.expires_at);
                    return (
                      <div
                        key={char.character_id}
                        className={`p-4 rounded-xl border transition-all ${
                          isActive
                            ? 'bg-indigo-500/10 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/30'
                            : 'bg-[#0e1117] border-[#262730] hover:border-[#3a3d4d]'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-[240px]">
                            <img
                              src={
                                char.portrait_url ||
                                `https://images.evetech.net/characters/${char.character_id}/portrait?size=128`
                              }
                              alt={char.character_name}
                              className="w-12 h-12 rounded-full border-2 border-[#262730] bg-[#161821] object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-[#fafafa]">
                                  {char.character_name}
                                </span>
                                {isActive && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500 text-white font-bold">
                                    Actif
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#808495]">
                                <span className="font-mono text-amber-300 font-semibold">
                                  {char.wallet_balance !== undefined
                                    ? `${fmtIsk(char.wallet_balance)} ISK`
                                    : 'Solde en attente'}
                                </span>
                                <span className="mx-1.5">&bull;</span>
                                Acc: {char.accounting_skill ?? 5} / BR: {char.broker_relations_skill ?? 5}
                              </div>
                              <div className={`flex items-center gap-1.5 text-[10px] ${expInfo.color}`}>
                                <Clock className="w-3 h-3" />
                                <span>{expInfo.text}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 max-w-sm bg-[#161821] p-3 rounded-lg border border-[#262730]">
                            <label className="text-[10px] text-[#808495] block font-semibold mb-1.5">
                              Hub d’opération
                            </label>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                              <select
                                value={char.assigned_hub_id || ''}
                                onChange={(e) => {
                                  const hub = MAJOR_MARKET_HUBS.find(
                                    (entry: MarketHub) => entry.id === e.target.value,
                                  );
                                  handleUpdateHubSettings(char.character_id, {
                                    assigned_hub_id: e.target.value || undefined,
                                    assigned_hub_name: hub?.name,
                                    assigned_station_id: hub?.station_id,
                                  });
                                }}
                                className="w-full bg-[#0e1117] border border-[#262730] rounded-md px-2 py-1.5 text-xs text-[#fafafa] focus:border-indigo-500 outline-none"
                              >
                                <option value="">Nomade / Non assigné</option>
                                {MAJOR_MARKET_HUBS.map((hub: MarketHub) => (
                                  <option key={hub.id} value={hub.id}>
                                    {hub.name} ({hub.region})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end lg:self-center">
                            {!isActive && (
                              <button
                                onClick={() => handleSwitchActive(char)}
                                className="px-3 py-1.5 bg-[#262730] hover:bg-indigo-600 text-[#cfd3dc] hover:text-white rounded-lg font-medium transition-colors"
                              >
                                Activer
                              </button>
                            )}
                            <button
                              onClick={() => handleRefresh(char)}
                              disabled={isRefreshingId === char.character_id}
                              className="p-2 bg-[#161821] hover:bg-[#262730] border border-[#262730] rounded-lg text-[#cfd3dc] hover:text-[#fafafa] transition-colors"
                              title="Rafraîchir le jeton et synchroniser les données ESI"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  isRefreshingId === char.character_id
                                    ? 'animate-spin text-indigo-400'
                                    : ''
                                }`}
                              />
                            </button>
                            <button
                              onClick={() => handleRemove(char.character_id, char.character_name)}
                              className="p-2 bg-[#161821] hover:bg-red-500/20 border border-[#262730] hover:border-red-500/40 rounded-lg text-[#808495] hover:text-red-300 transition-colors"
                              title="Retirer ce personnage"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <SsoConnectCard
              onSessionReady={handleSessionReady}
              onConnectSSO={onConnectSSO}
              title={characters.length === 0 ? 'Connexion EVE Online SSO v2' : 'Ajouter un autre pilote'}
              subtitle={
                characters.length === 0
                  ? 'Connectez votre personnage principal ou vos alts pour synchroniser vos données ESI.'
                  : 'Associez vos personnages aux hubs où vous gérez vos ordres.'
              }
            />
          )}
        </div>

        <div className="p-4 border-t border-[#262730] bg-[#0e1117] flex items-center justify-between">
          <div className="text-[11px] text-[#808495] flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <span>Les personnages restent des principaux distincts ; la corporation porte la vue globale de ses ordres.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] rounded-lg font-bold text-xs transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
