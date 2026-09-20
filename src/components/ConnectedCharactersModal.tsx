import React, { useState, useEffect } from 'react';
import { AuthService } from '../services/authService';
import { EsiService } from '../services/esi';
import { EveCharacterSession } from '../types';
import {
  Users,
  UserCheck,
  UserPlus,
  RefreshCw,
  Trash2,
  Key,
  ShieldCheck,
  Clock,
  Coins,
  GraduationCap,
  ExternalLink,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface ConnectedCharactersModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCharacter: EveCharacterSession | null;
  onSelectCharacter: (session: EveCharacterSession) => void;
  onConnectSSO: () => void;
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
  const [isRefreshingId, setIsRefreshingId] = useState<number | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualCharId, setManualCharId] = useState('');
  const [manualCharName, setManualCharName] = useState('');
  const [manualTab, setManualTab] = useState<'sso' | 'manual_code' | 'manual_token'>('sso');
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [timeNow, setTimeNow] = useState(Date.now());

  // Reload character list whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCharacters(AuthService.getLinkedCharacters());
    }
  }, [isOpen, activeCharacter]);

  // Periodic ticker for token expiration countdown
  useEffect(() => {
    const timer = setInterval(() => setTimeNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  const handleSwitchActive = (char: EveCharacterSession) => {
    const updated = AuthService.setActiveCharacter(char.character_id);
    if (updated) {
      setCharacters(AuthService.getLinkedCharacters());
      onSelectCharacter(updated);
      setStatusMessage({ text: `${char.character_name} est maintenant le personnage actif.`, type: 'success' });
    }
  };

  const handleRefresh = async (char: EveCharacterSession) => {
    setIsRefreshingId(char.character_id);
    try {
      // 1. Ensure token is renewed
      const freshSession = await AuthService.refreshCharacterToken(char);
      // 2. Fetch fresh wallet and skills
      await onRefreshCharacter(freshSession);
      setCharacters(AuthService.getLinkedCharacters());
      setStatusMessage({ text: `Session de ${char.character_name} rafraîchie et validée auprès de l'ESI.`, type: 'success' });
    } catch (err) {
      setStatusMessage({ text: `Erreur de rafraîchissement : ${String(err)}`, type: 'error' });
    } finally {
      setIsRefreshingId(null);
    }
  };

  const handleRemove = (charId: number, name: string) => {
    if (confirm(`Êtes-vous sûr de vouloir retirer le personnage ${name} ?`)) {
      const remaining = AuthService.removeCharacter(charId);
      setCharacters(remaining);
      const newActive = AuthService.getActiveCharacter();
      if (newActive) {
        onSelectCharacter(newActive);
      }
      setStatusMessage({ text: `Personnage ${name} retiré.`, type: 'info' });
    }
  };

  const handleExchangeManualCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    try {
      let code = manualCode.trim();
      let state: string | undefined = undefined;
      let redirectUri: string | undefined = undefined;

      if (code.includes('code=') || code.startsWith('http')) {
        try {
          const urlObj = new URL(code);
          const c = urlObj.searchParams.get('code');
          const s = urlObj.searchParams.get('state');
          if (c) code = c;
          if (s) state = s;
          redirectUri = `${urlObj.origin}${urlObj.pathname}`;
        } catch {}
      }

      const session = await AuthService.exchangeCodeForSession(code, redirectUri, state);
      await onRefreshCharacter(session);
      setCharacters(AuthService.getLinkedCharacters());
      onSelectCharacter(session);
      setManualCode('');
      setManualTab('sso');
      setStatusMessage({ text: `Personnage ${session.character_name} connecté avec succès !`, type: 'success' });
    } catch (err) {
      setStatusMessage({ text: `Erreur d'échange de code : ${String(err)}`, type: 'error' });
    }
  };

  const handleDirectTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    try {
      const charId = Number(manualCharId) || 0;
      const charName = manualCharName.trim() || `Character #${charId}`;
      const tokenStr = manualToken.trim();
      const claims = AuthService.parseJwtClaims(tokenStr);
      const realExpiresAt = claims?.exp ? claims.exp * 1000 : 0;

      const session: EveCharacterSession = {
        character_id: charId || (claims?.sub ? Number(claims.sub.split(':').pop()) || 0 : 0),
        character_name: charName || claims?.name || `Character #${charId}`,
        portrait_url: charId ? `https://images.evetech.net/characters/${charId}/portrait?size=128` : '',
        access_token: tokenStr,
        expires_at: realExpiresAt,
        last_sync: new Date().toISOString(),
        is_active: true,
        session_version: 2,
        auth_status: realExpiresAt && realExpiresAt > Date.now() ? 'SESSION_VALID' : 'SESSION_EXPIRED',
        last_validated_at: new Date().toISOString(),
      };

      AuthService.saveCharacter(session, true);
      await onRefreshCharacter(session);
      setCharacters(AuthService.getLinkedCharacters());
      onSelectCharacter(session);
      setManualToken('');
      setManualTab('sso');
      setStatusMessage({ text: `Jeton enregistré pour ${charName}.`, type: 'success' });
    } catch (err) {
      setStatusMessage({ text: `Erreur : ${String(err)}`, type: 'error' });
    }
  };

  const formatExpiresIn = (expiresAt?: number) => {
    if (!expiresAt) return { text: 'Session active', color: 'text-emerald-400' };
    const diffMs = expiresAt - timeNow;
    if (diffMs <= 0) return { text: 'Jeton expiré (Renouvellement auto)', color: 'text-amber-400' };
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    if (mins < 3) return { text: `Expire dans ${mins}m ${secs}s`, color: 'text-amber-400' };
    return { text: `Valide (${mins} min restant)`, color: 'text-emerald-400' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#161821] border border-[#262730] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-[#262730] flex items-center justify-between bg-[#0e1117]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#fafafa] flex items-center gap-2">
                Gestion des Personnages &amp; Sessions EVE
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                  {characters.length} connecté{characters.length > 1 ? 's' : ''}
                </span>
              </h2>
              <p className="text-xs text-[#808495]">
                Comptes liés, persistance multi-personnages (Traders, Haulers, Alts) et renouvellement SSO
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#808495] hover:text-[#fafafa] p-1.5 rounded-lg hover:bg-[#262730] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMessage && (
          <div
            className={`px-5 py-2.5 text-xs flex items-center justify-between border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {statusMessage.type === 'info' && <Info className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="opacity-70 hover:opacity-100 font-bold"
            >
              &times;
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* 1. Character Cards List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[#fafafa] flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                Personnages Enregistrés
              </h3>
              <span className="text-[11px] text-[#808495]">
                Cliquez pour basculer le cockpit sur un autre pilote
              </span>
            </div>

            {characters.length === 0 ? (
              <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-dashed border-[#262730] space-y-3">
                <Users className="w-10 h-10 mx-auto text-[#808495] opacity-50" />
                <p className="text-sm text-[#cfd3dc] font-medium">Aucun personnage EVE Online n'est actuellement connecté</p>
                <p className="text-xs text-[#808495] max-w-md mx-auto">
                  Connectez votre compte principal ou vos alts (Jita Station Trader, Hauler, Regional Buyer) pour synchroniser votre portefeuille réel, vos compétences et vos ordres de marché.
                </p>
                <button
                  onClick={onConnectSSO}
                  className="px-5 py-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold rounded-lg inline-flex items-center gap-2 shadow-lg transition-colors text-xs"
                >
                  <UserPlus className="w-4 h-4" />
                  Connecter un Personnage via CCP SSO
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {characters.map((char) => {
                  const isActive = activeCharacter?.character_id === char.character_id;
                  const expInfo = formatExpiresIn(char.expires_at);

                  return (
                    <div
                      key={char.character_id}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-blue-500/10 border-blue-500/50 shadow-md ring-1 ring-blue-500/30'
                          : 'bg-[#0e1117] border-[#262730] hover:border-[#3a3d4d]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Left: Avatar & Info */}
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <img
                              src={char.portrait_url || `https://images.evetech.net/characters/${char.character_id}/portrait?size=128`}
                              alt={char.character_name}
                              className="w-12 h-12 rounded-full border-2 border-[#262730] bg-[#161821] object-cover"
                              referrerPolicy="no-referrer"
                            />
                            {isActive && (
                              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#161821] flex items-center justify-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              </span>
                            )}
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-[#fafafa]">{char.character_name}</span>
                              {isActive ? (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500 text-white font-bold">
                                  Actif
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-[#808495]">
                              <span className="flex items-center gap-1 font-mono text-amber-300 font-semibold">
                                <Coins className="w-3 h-3 text-amber-400" />
                                {char.wallet_balance !== undefined
                                  ? `${char.wallet_balance.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ISK`
                                  : 'Solde en attente'}
                              </span>
                              <span>&bull;</span>
                              <span className="flex items-center gap-1">
                                <GraduationCap className="w-3 h-3 text-blue-400" />
                                Acc: {char.accounting_skill ?? 5} &bull; BR: {char.broker_relations_skill ?? 5}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <Clock className="w-3 h-3 text-[#808495]" />
                              <span className={expInfo.color}>{expInfo.text}</span>
                              {char.refresh_token && (
                                <span className="text-emerald-400/80 font-mono">(Auto-Refresh actif)</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2">
                          {!isActive && (
                            <button
                              onClick={() => handleSwitchActive(char)}
                              className="px-3 py-1.5 bg-[#262730] hover:bg-blue-600 text-[#cfd3dc] hover:text-white rounded-lg font-medium transition-colors"
                            >
                              Sélectionner
                            </button>
                          )}
                          <button
                            onClick={() => handleRefresh(char)}
                            disabled={isRefreshingId === char.character_id}
                            className="p-2 bg-[#161821] hover:bg-[#262730] border border-[#262730] rounded-lg text-[#cfd3dc] hover:text-[#fafafa] transition-colors"
                            title="Rafraîchir le jeton et synchroniser les données"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isRefreshingId === char.character_id ? 'animate-spin text-blue-400' : ''}`}
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
            )}
          </div>

          {/* 2. Add Another Character / SSO Methods */}
          <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-4">
            <div className="flex items-center justify-between border-b border-[#262730] pb-2">
              <h3 className="font-bold text-[#fafafa] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" />
                Ajouter / Connecter un Autre Personnage
              </h3>
              <div className="flex items-center gap-1 bg-[#161821] p-0.5 rounded-lg border border-[#262730]">
                <button
                  type="button"
                  onClick={() => setManualTab('sso')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    manualTab === 'sso' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  EVE SSO Popup
                </button>
                <button
                  type="button"
                  onClick={() => setManualTab('manual_code')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    manualTab === 'manual_code' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  Code Manuel / URL
                </button>
                <button
                  type="button"
                  onClick={() => setManualTab('manual_token')}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    manualTab === 'manual_token' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#cfd3dc]'
                  }`}
                >
                  Jeton Direct
                </button>
              </div>
            </div>

            {manualTab === 'sso' && (
              <div className="space-y-3">
                <p className="text-[#808495] text-[11px] leading-relaxed">
                  Ouvre la fenêtre officielle sécurisée de <strong>CCP EVE Online SSO v2</strong>. Vous pouvez vous connecter avec n'importe quel compte ou personnage. Les clés et le jeton de renouvellement (refresh token) sont stockés pour une persistance permanente.
                </p>
                <button
                  onClick={onConnectSSO}
                  className="w-full py-2.5 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Ouvrir la Connexion EVE Online SSO (Popup)</span>
                </button>
              </div>
            )}

            {manualTab === 'manual_code' && (
              <form onSubmit={handleExchangeManualCode} className="space-y-3">
                <p className="text-[#808495] text-[11px]">
                  Si le navigateur bloque la fenêtre popup ou si vous utilisez un lien de callback externe (ex. <code className="text-emerald-400">http://localhost:8000/callback?code=...</code>), collez le code ou l'URL complète ici :
                </p>
                <input
                  type="text"
                  placeholder="Collez ici votre code ou l'URL complète reçue..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Key className="w-4 h-4" />
                  Valider et Échanger le Code
                </button>
              </form>
            )}

            {manualTab === 'manual_token' && (
              <form onSubmit={handleDirectTokenSubmit} className="space-y-3">
                <p className="text-[#808495] text-[11px]">
                  Saisie directe d'un jeton ESI Bearer pré-généré (idéal pour le développement ou les tests automatisés) :
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Character ID (ex: 2112345678)"
                    value={manualCharId}
                    onChange={(e) => setManualCharId(e.target.value)}
                    className="bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg font-mono text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Nom du Personnage"
                    value={manualCharName}
                    onChange={(e) => setManualCharName(e.target.value)}
                    className="bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg text-xs"
                  />
                </div>
                <textarea
                  placeholder="Bearer Token (JWT)..."
                  rows={2}
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!manualToken.trim()}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Enregistrer la Session Directe
                </button>
              </form>
            )}
          </div>

          {/* 3. Why session persistence info */}
          <div className="p-3.5 rounded-xl bg-[#161821] border border-[#262730] space-y-1.5 text-[11px] text-[#808495]">
            <div className="font-bold text-[#cfd3dc] flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              Pourquoi les sessions EVE s'expiraient-elles ?
            </div>
            <p>
              Les jetons d'accès EVE Online SSO ont une durée de vie imposée par CCP de <strong>20 minutes</strong>. Grâce à notre nouveau gestionnaire de sessions, le <code>refresh_token</code> est désormais automatiquement sauvegardé et renouvelé en tâche de fond avant chaque expiration sans vous déconnecter.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#262730] bg-[#0e1117] flex justify-end">
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
