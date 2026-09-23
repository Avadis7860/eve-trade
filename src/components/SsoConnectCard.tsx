import React, { useState, useEffect } from 'react';
import { AuthService } from '../services/authService';
import { EveCharacterSession } from '../types';
import {
  Shield,
  Zap,
  Key,
  Check,
  Copy,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface SsoConnectCardProps {
  onSessionReady?: (session: EveCharacterSession) => void | Promise<void>;
  onConnectSSO?: (redirectUri: string) => void;
  compact?: boolean;
  title?: string;
  subtitle?: string;
}

export const SsoConnectCard: React.FC<SsoConnectCardProps> = ({
  onSessionReady,
  onConnectSSO,
  compact = false,
  title = 'Connexion Sécurisée EVE Online SSO v2',
  subtitle = 'Connectez votre personnage (Trader, Hauler, Alt) pour synchroniser votre portefeuille, compétences et ordres de marché.',
}) => {
  const suggestedUris = AuthService.getSuggestedRedirectUris();
  const [selectedMode, setSelectedMode] = useState<string>(() => {
    const preferred = AuthService.getPreferredRedirectUri();
    const match = suggestedUris.find((u) => u.uri === preferred);
    return match ? match.id : (suggestedUris[0]?.id || 'app');
  });
  const [customUri, setCustomUri] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'sso' | 'manual_code' | 'manual_token'>('sso');
  const [manualCode, setManualCode] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualCharId, setManualCharId] = useState('');
  const [manualCharName, setManualCharName] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeRedirectUri =
    selectedMode === 'custom'
      ? customUri.trim() || suggestedUris[0]?.uri || 'http://localhost:3000/auth/callback'
      : suggestedUris.find((u) => u.id === selectedMode)?.uri ||
        suggestedUris[0]?.uri ||
        'http://localhost:3000/auth/callback';

  useEffect(() => {
    AuthService.setPreferredRedirectUri(activeRedirectUri);
  }, [activeRedirectUri]);

  const copyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedUrl(val);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleLaunchSSO = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (onConnectSSO) {
      onConnectSSO(activeRedirectUri);
      return;
    }

    try {
      setIsLoading(true);
      const urlParam = `?redirect_uri=${encodeURIComponent(activeRedirectUri)}`;
      const res = await fetch(`/api/auth/url${urlParam}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Impossible de générer l\'URL d\'authentification CCP SSO');
      }
      const data = await res.json();
      const authUrl = data.url;

      const width = 600;
      const height = 750;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        authUrl,
        'eve_sso_login',
        `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
      );

      if (!popup) {
        window.location.href = authUrl;
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (!/[?&]state=[^&#]+/.test(manualCode.trim())) {
        throw new Error("Collez l'URL complète du callback EVE SSO contenant le paramètre state.");
      }
      const session = await AuthService.exchangeCodeForSession(
        manualCode.trim(),
        undefined
      );
      setSuccessMessage(`Personnage ${session.character_name} authentifié avec succès !`);
      setManualCode('');
      if (onSessionReady) {
        await onSessionReady(session);
      }
    } catch (err: unknown) {
      setErrorMessage(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

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
      setSuccessMessage(`Jeton enregistré pour ${session.character_name}.`);
      setManualToken('');
      if (onSessionReady) {
        await onSessionReady(session);
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#161821] border border-[#262730] rounded-xl p-5 md:p-6 relative overflow-hidden shadow-2xl space-y-5 text-xs text-[#fafafa]">
      <div className="absolute -right-12 -top-12 w-64 h-64 bg-[#ff4b4b]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-[#262730]">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#ff4b4b]/15 text-[#ff4b4b] border border-[#ff4b4b]/30 text-[11px] font-semibold">
            <Shield className="w-3.5 h-3.5" />
            EVE Online Single Sign-On v2 (Unique Subsystem)
          </div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#fafafa]">
            {title}
          </h2>
          <p className="text-xs text-[#808495] max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Top Fast SSO Action */}
        <button
          onClick={handleLaunchSSO}
          disabled={isLoading}
          className="flex-shrink-0 flex items-center justify-center gap-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold px-5 py-2.5 rounded-lg shadow-lg hover:shadow-[#ff4b4b]/20 transition-all text-xs"
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>Se connecter avec EVE SSO</span>
        </button>
      </div>

      {/* Status Notifications */}
      {errorMessage && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5 flex-1">
            <div className="font-semibold">Erreur d'authentification :</div>
            <div className="font-mono text-[11px]">{errorMessage}</div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {/* SSO Configuration: Redirect URI Selector */}
      <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-[#cfd3dc] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            URL de Callback EVE SSO (Redirection Enregistrée CCP)
          </span>
          <a
            href="https://developers.eveonline.com"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono"
          >
            <span>developers.eveonline.com</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {suggestedUris.map((u) => (
            <label
              key={u.id}
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                selectedMode === u.id
                  ? 'bg-[#1c1e28] border-blue-500/50 text-[#fafafa] shadow-xs'
                  : 'bg-[#161821] border-[#262730] text-[#808495] hover:border-[#3a3d4d]'
              }`}
            >
              <input
                type="radio"
                name="sso_redirect_mode"
                checked={selectedMode === u.id}
                onChange={() => setSelectedMode(u.id)}
                className="text-[#ff4b4b] focus:ring-0"
              />
              <span className="truncate font-medium">{u.label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 bg-[#161821] p-2 rounded-lg border border-[#262730]">
          <code className="text-[11px] text-emerald-400 font-mono truncate flex-1">
            {activeRedirectUri}
          </code>
          <button
            type="button"
            onClick={() => copyToClipboard(activeRedirectUri)}
            className="px-2.5 py-1 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] rounded text-[11px] flex items-center gap-1 flex-shrink-0 transition-colors"
          >
            {copiedUrl === activeRedirectUri ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-[#808495]" />
                <span>Copier URL</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs for SSO Modes */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 bg-[#0e1117] p-1 rounded-lg border border-[#262730] w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('sso')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'sso' ? 'bg-[#262730] text-[#fafafa] shadow' : 'text-[#808495] hover:text-[#cfd3dc]'
            }`}
          >
            ⚡ Fenêtre EVE SSO Popup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual_code')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'manual_code' ? 'bg-[#262730] text-[#fafafa] shadow' : 'text-[#808495] hover:text-[#cfd3dc]'
            }`}
          >
            🔑 Code Manuel / URL de Redirection
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual_token')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'manual_token' ? 'bg-[#262730] text-[#fafafa] shadow' : 'text-[#808495] hover:text-[#cfd3dc]'
            }`}
          >
            🛡️ Jeton Direct (Développeur)
          </button>
        </div>

        {activeTab === 'sso' && (
          <div className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
            <p className="text-[#808495] text-xs leading-relaxed">
              Cliquez pour ouvrir la mire d'authentification officielle <strong>CCP Games EVE SSO</strong> dans une fenêtre sécurisée.
              Les permissions demandées sont en lecture seule (ordres de marché, wallet et compétences).
            </p>
            <button
              type="button"
              onClick={handleLaunchSSO}
              disabled={isLoading}
              className="w-full py-3 bg-[#ff4b4b] hover:bg-[#ff3333] disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all text-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Ouvrir la Fenêtre Officielle EVE SSO</span>
            </button>
          </div>
        )}

        {activeTab === 'manual_code' && (
          <form onSubmit={handleManualCodeSubmit} className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
            <p className="text-[#808495] text-xs leading-relaxed">
              Si la fenêtre popup est bloquée par votre navigateur, utilisez l'URL complète du callback retournée par EVE SSO avec les paramètres <code className="text-emerald-400">code</code> et <code className="text-emerald-400">state</code>. Le code brut seul n'est pas accepté.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`${activeRedirectUri}?code=...`}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 bg-[#161821] border border-[#262730] text-[#fafafa] p-2.5 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !manualCode.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg flex items-center gap-1.5 transition-colors flex-shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Valider et Échanger</span>
              </button>
            </div>
          </form>
        )}

        {activeTab === 'manual_token' && (
          <form onSubmit={handleManualTokenSubmit} className="bg-[#0e1117] p-4 rounded-xl border border-[#262730] space-y-3">
            <p className="text-[#808495] text-xs">
              Saisie directe d'un jeton Bearer (JWT ESI). Permet d'injecter une session pour tests ou environnements isolés :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Character ID (ex: 2112345678)"
                value={manualCharId}
                onChange={(e) => setManualCharId(e.target.value)}
                className="bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg font-mono text-xs focus:border-blue-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nom du Personnage"
                value={manualCharName}
                onChange={(e) => setManualCharName(e.target.value)}
                className="bg-[#161821] border border-[#262730] text-[#fafafa] p-2 rounded-lg text-xs focus:border-blue-500 focus:outline-none"
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
              disabled={isLoading || !manualToken.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Enregistrer la Session Directe</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
