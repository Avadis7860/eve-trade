import React, { useState, useMemo, useEffect } from 'react';
import {
  EveCharacterSession,
  EveCharacterOrder,
  EveTypeDetail,
  MarketHub,
} from '../types';
import { fmtIsk, fmtNumber } from '../engine/money';
import {
  Shield,
  Coins,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  TrendingDown,
  ShoppingBag,
  Tag,
  Search,
  Copy,
  Check,
  Zap,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';

interface MyOrdersViewProps {
  session: EveCharacterSession | null;
  orders: EveCharacterOrder[];
  isLoadingOrders: boolean;
  onRefreshOrders: () => void;
  onConnectSSO: (customRedirectUri?: string) => void;
  onExchangeCode: (code: string, redirectUri?: string) => Promise<void>;
  onDirectTokenInput: (token: string, characterId: number, characterName: string) => void;
  onLogout: () => void;
  onSelectTypeForArbitrage: (typeId: number) => void;
  hubs: MarketHub[];
}

export const MyOrdersView: React.FC<MyOrdersViewProps> = ({
  session,
  orders,
  isLoadingOrders,
  onRefreshOrders,
  onConnectSSO,
  onExchangeCode,
  onDirectTokenInput,
  onLogout,
  onSelectTypeForArbitrage,
  hubs,
}) => {
  const [filterTab, setFilterTab] = useState<'all' | 'buy' | 'sell' | 'outbid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Manual code/token accordion
  const [manualCode, setManualCode] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualCharId, setManualCharId] = useState('');
  const [manualCharName, setManualCharName] = useState('');
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [selectedRedirectMode, setSelectedRedirectMode] = useState<string>('localhost8000');
  const [customRedirectUri, setCustomRedirectUri] = useState<string>('');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const cloudRunCallback = `${currentOrigin}/auth/callback`;
  const localhost8000Callback = 'http://localhost:8000/callback';
  const localhost3000Callback = 'http://localhost:3000/auth/callback';

  const activeRedirectUri =
    selectedRedirectMode === 'localhost8000'
      ? localhost8000Callback
      : selectedRedirectMode === 'cloudrun'
      ? cloudRunCallback
      : selectedRedirectMode === 'localhost3000'
      ? localhost3000Callback
      : customRedirectUri.trim() || localhost8000Callback;

  const [manualRedirectUri, setManualRedirectUri] = useState(activeRedirectUri);

  useEffect(() => {
    setManualRedirectUri(activeRedirectUri);
  }, [activeRedirectUri]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(text);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  // Stats calculation
  const stats = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let escrowTotal = 0;
    let sellTotal = 0;
    let outbidCount = 0;

    for (const o of orders) {
      if (o.is_buy_order) {
        buyCount++;
        escrowTotal += (o.escrow || 0) || (o.price * o.volume_remain);
      } else {
        sellCount++;
        sellTotal += o.price * o.volume_remain;
      }
      if (o.market_competition?.is_outbid) {
        outbidCount++;
      }
    }

    return {
      total: orders.length,
      buyCount,
      sellCount,
      escrowTotal,
      sellTotal,
      outbidCount,
    };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterTab === 'buy' && !o.is_buy_order) return false;
      if (filterTab === 'sell' && o.is_buy_order) return false;
      if (filterTab === 'outbid' && !o.market_competition?.is_outbid) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (o.type_name || `Type #${o.type_id}`).toLowerCase().includes(q);
        const matchesLoc = (o.location_name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesLoc) return false;
      }

      return true;
    });
  }, [orders, filterTab, searchQuery]);

  const handleManualCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let codeToUse = manualCode.trim();
    let redirectUriToUse = manualRedirectUri.trim();

    if (!codeToUse) return;

    // Auto-detect and parse if user pasted a full URL or query string
    if (codeToUse.includes('code=') || codeToUse.startsWith('http')) {
      try {
        const urlObj = new URL(codeToUse);
        const extracted = urlObj.searchParams.get('code');
        if (extracted) {
          codeToUse = extracted;
          redirectUriToUse = `${urlObj.origin}${urlObj.pathname}`;
          setManualRedirectUri(redirectUriToUse);
        }
      } catch {
        const match = codeToUse.match(/code=([^&]+)/);
        if (match) codeToUse = decodeURIComponent(match[1]);
      }
    }

    setIsSubmittingCode(true);
    setManualError(null);
    try {
      await onExchangeCode(codeToUse, redirectUriToUse);
      setManualCode('');
    } catch (err: unknown) {
      setManualError(String(err));
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const handleDirectTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim() || !manualCharId.trim()) return;
    onDirectTokenInput(
      manualToken.trim(),
      Number(manualCharId.trim()),
      manualCharName.trim() || `Pilote #${manualCharId.trim()}`
    );
  };

  // 1. Not connected view
  if (!session) {
    return (
      <div className="flex-1 overflow-y-auto p-6 bg-[#0e1117] text-[#fafafa]">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Main Auth Card */}
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-8 relative overflow-hidden shadow-2xl">
            <div className="absolute -right-12 -top-12 w-64 h-64 bg-[#ff4b4b]/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-[#262730]">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#ff4b4b]/15 text-[#ff4b4b] border border-[#ff4b4b]/30 text-xs font-semibold">
                  <Shield className="w-3.5 h-3.5" />
                  EVE Online Single Sign-On v2
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-[#fafafa]">
                  Visualisez &amp; Gérez vos Ordres Réels en Direct
                </h2>
                <p className="text-sm text-[#808495] max-w-2xl leading-relaxed">
                  Connectez votre compte EVE Online pour synchroniser vos ordres de vente et d'achat actifs,
                  suivre votre solde de portefeuille en temps réel, et détecter instantanément si vos prix sont
                  dépassés (outbid) sur les hubs commerciaux majeurs de New Eden.
                </p>
              </div>

              <div className="flex-shrink-0 w-full md:w-auto">
                <button
                  onClick={() => onConnectSSO(activeRedirectUri)}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#ff4b4b] hover:bg-[#ff3333] text-white font-bold px-6 py-3.5 rounded-lg shadow-lg hover:shadow-[#ff4b4b]/20 transition-all text-sm"
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>Se connecter avec EVE SSO</span>
                </button>
              </div>
            </div>

            {/* Application Configuration Info */}
            <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730] space-y-3">
                <div className="flex items-center justify-between text-xs text-[#808495]">
                  <span className="font-semibold uppercase tracking-wider">Identifiants OAuth Configurés</span>
                  <span className="text-green-400 flex items-center gap-1 font-mono">
                    <Check className="w-3 h-3" /> Client Prêt
                  </span>
                </div>
                <div className="text-xs space-y-1 font-mono text-[#808495]">
                  <div className="flex justify-between">
                    <span>Client ID :</span>
                    <span className="text-[#fafafa]">790ee291...3b538</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scopes :</span>
                    <span className="text-[#fafafa]">esi-markets.read_character_orders.v1</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Protection :</span>
                    <span className="text-green-400">Secret sécurisé côté serveur</span>
                  </div>
                </div>
              </div>

              {/* Callback URL Selector & Copier */}
              <div className="bg-[#0e1117] p-4 rounded-lg border border-[#262730] space-y-3">
                <div className="flex items-center justify-between text-xs text-[#808495]">
                  <span className="font-semibold uppercase tracking-wider">URL de Callback (Redirection EVE SSO)</span>
                  <span className="text-amber-400 text-[11px] font-mono">developers.eveonline.com</span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer bg-[#161821] p-2 rounded border border-[#262730] hover:border-[#31333f]">
                      <input
                        type="radio"
                        name="redirectMode"
                        checked={selectedRedirectMode === 'localhost8000'}
                        onChange={() => setSelectedRedirectMode('localhost8000')}
                        className="text-[#ff4b4b]"
                      />
                      <span className={selectedRedirectMode === 'localhost8000' ? 'text-[#fafafa] font-semibold' : 'text-[#808495]'}>
                        Localhost (8000)
                      </span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-[#161821] p-2 rounded border border-[#262730] hover:border-[#31333f]">
                      <input
                        type="radio"
                        name="redirectMode"
                        checked={selectedRedirectMode === 'localhost3000'}
                        onChange={() => setSelectedRedirectMode('localhost3000')}
                        className="text-[#ff4b4b]"
                      />
                      <span className={selectedRedirectMode === 'localhost3000' ? 'text-[#fafafa] font-semibold' : 'text-[#808495]'}>
                        Localhost (3000)
                      </span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-[#161821] p-2 rounded border border-[#262730] hover:border-[#31333f]">
                      <input
                        type="radio"
                        name="redirectMode"
                        checked={selectedRedirectMode === 'cloudrun'}
                        onChange={() => setSelectedRedirectMode('cloudrun')}
                        className="text-[#ff4b4b]"
                      />
                      <span className={selectedRedirectMode === 'cloudrun' ? 'text-[#fafafa] font-semibold' : 'text-[#808495]'}>
                        Cloud Run Preview
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 bg-[#161821] p-2 rounded border border-[#31333f]">
                    <code className="text-[11px] text-[#00ff88] truncate flex-1 font-mono">
                      {activeRedirectUri}
                    </code>
                    <button
                      onClick={() => copyToClipboard(activeRedirectUri)}
                      className="flex items-center gap-1 text-[11px] bg-[#262730] hover:bg-[#31333f] px-2 py-1 rounded text-[#fafafa] transition-colors flex-shrink-0"
                      title="Copier l'URL de callback"
                    >
                      {copiedUrl === activeRedirectUri ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>Copier</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Comprehensive Diagnostics for "The redirect URL does not match any of the configured values for this client." */}
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Résolution de l'erreur CCP : « The redirect URL does not match any of the configured values »</span>
              </div>
              <p className="text-[#808495] leading-relaxed">
                Le serveur EVE SSO v2 compare le paramètre <code className="text-[#fafafa]">redirect_uri</code> avec la liste exacte des <em>Callback URLs</em> enregistrées sur votre application CCP. Si vous obtenez cette erreur :
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="bg-[#0e1117] p-3 rounded border border-amber-500/20 text-[#808495] space-y-1">
                  <span className="font-semibold text-amber-200">Cas 1 : Vos identifiants ont http://localhost:8000/callback</span>
                  <p className="text-[11px]">
                    Sélectionnez simplement l'option <strong>« Localhost (8000) »</strong> ci-dessus, puis cliquez sur <em>« Se connecter avec EVE SSO »</em>. CCP reconnaîtra immédiatement l'URL et affichera la mire d'authentification !
                  </p>
                </div>
                <div className="bg-[#0e1117] p-3 rounded border border-amber-500/20 text-[#808495] space-y-1">
                  <span className="font-semibold text-amber-200">Cas 2 : En Cloud Run Preview (URL dynamique) vs Sur Votre PC</span>
                  <p className="text-[11px]">
                    Sur votre PC local, la redirection automatique fonctionnera nativement. En attendant en Cloud Run Preview, utilisez la boîte ci-dessous : <strong>copiez l'URL de votre barre d'adresse</strong> après connexion CCP et collez-la pour une connexion instantanée.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Saisie Manuelle de Code / URL Complète (Alternative & Résilience Totale 100% Fonctionnelle) */}
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-green-400" />
                <h3 className="font-bold text-sm text-[#fafafa]">
                  Connexion Instantanée par URL ou Code (Méthode 100% Garantie)
                </h3>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 font-mono">
                Recommandé si port 8000 non ouvert
              </span>
            </div>

            <div className="bg-[#0e1117] p-3 rounded-lg border border-[#262730] text-xs text-[#808495] space-y-1.5">
              <div className="font-semibold text-[#fafafa]">Procédure express en 3 étapes :</div>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>Cliquez sur le bouton rouge <strong>« Se connecter avec EVE SSO »</strong> plus haut (avec <em>Localhost 8000</em> sélectionné).</li>
                <li>Connectez votre personnage sur le portail sécurisé CCP Games et autorisez l'accès.</li>
                <li>Votre navigateur sera redirigé vers <code className="text-amber-300">http://localhost:8000/callback?code=...</code> (même si votre navigateur affiche « Page inaccessible », l'URL dans la barre d'adresse contient votre jeton). <strong>Copiez simplement cette adresse complète et collez-la ci-dessous</strong>.</li>
              </ol>
            </div>

            <form onSubmit={handleManualCodeSubmit} className="space-y-3">
              <div className="space-y-2">
                <label className="block text-[11px] text-[#808495] uppercase font-semibold">
                  Collez l'URL complète de redirection ou le code d'autorisation :
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Collez ici http://localhost:8000/callback?code=... ou directement le code"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="flex-1 bg-[#0e1117] border border-[#31333f] text-[#fafafa] rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ff4b4b]"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingCode || !manualCode.trim()}
                    className="flex items-center gap-1.5 bg-[#ff4b4b] hover:bg-[#ff3333] text-white text-xs font-bold px-5 py-2 rounded transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSubmittingCode ? 'animate-spin' : ''}`} />
                    <span>Valider &amp; Synchroniser</span>
                  </button>
                </div>
              </div>

              {manualError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded">
                  <div className="font-semibold">Échec de validation :</div>
                  <div className="font-mono mt-1 text-[11px]">{manualError}</div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 2. Connected Character Dashboard
  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0e1117] text-[#fafafa] space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Character Header Banner */}
        <div className="bg-[#161821] border border-[#262730] rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={session.portrait_url}
                alt={session.character_name}
                className="w-16 h-16 rounded-xl border-2 border-[#ff4b4b]/40 shadow-lg object-cover bg-[#0e1117]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.evetech.net/characters/1/portrait?size=128';
                }}
              />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#161821] rounded-full" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#fafafa] tracking-tight">
                  {session.character_name}
                </h2>
                <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-mono font-medium">
                  Connecté ESI
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#808495]">
                <span>ID Pilote : <strong className="text-[#fafafa]">{session.character_id}</strong></span>
                {session.accounting_skill !== undefined && (
                  <span>Accounting : <strong className="text-amber-400">Niv {session.accounting_skill}</strong></span>
                )}
                {session.broker_relations_skill !== undefined && (
                  <span>Broker Relations : <strong className="text-blue-400">Niv {session.broker_relations_skill}</strong></span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={onRefreshOrders}
              disabled={isLoadingOrders}
              className="flex items-center gap-1.5 bg-[#262730] hover:bg-[#31333f] text-[#fafafa] text-xs font-semibold px-3.5 py-2 rounded-lg border border-[#31333f] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
              <span>{isLoadingOrders ? 'Actualisation...' : 'Actualiser'}</span>
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold px-3 py-2 rounded-lg border border-red-500/20 transition-colors"
              title="Déconnecter la session ESI"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Solde Portefeuille */}
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Solde Portefeuille ISK</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {session.wallet_balance !== undefined ? fmtIsk(session.wallet_balance) : '---'}
            </div>
            <div className="text-[11px] text-[#808495]">Liquidités directes disponibles</div>
          </div>

          {/* Capital Immobilisé en Achats (Escrow) */}
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Fonds en Séquestre (Escrow)</span>
              <ShoppingBag className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold font-mono text-blue-400">
              {fmtIsk(stats.escrowTotal)}
            </div>
            <div className="text-[11px] text-[#808495]">
              {stats.buyCount} ordres d'achat actifs
            </div>
          </div>

          {/* Valeur des Ventes en Cours */}
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Marchandises en Vente</span>
              <Tag className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-xl font-bold font-mono text-green-400">
              {fmtIsk(stats.sellTotal)}
            </div>
            <div className="text-[11px] text-[#808495]">
              {stats.sellCount} ordres de vente actifs
            </div>
          </div>

          {/* Concurrence & Outbid */}
          <div className="bg-[#161821] border border-[#262730] rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between text-xs text-[#808495]">
              <span>Ordres Dépassés (Outbid)</span>
              <TrendingDown className={`w-4 h-4 ${stats.outbidCount > 0 ? 'text-[#ff4b4b]' : 'text-green-400'}`} />
            </div>
            <div className={`text-xl font-bold font-mono ${stats.outbidCount > 0 ? 'text-[#ff4b4b]' : 'text-green-400'}`}>
              {stats.outbidCount} / {stats.total}
            </div>
            <div className="text-[11px] text-[#808495]">
              {stats.outbidCount > 0 ? 'Nécessite mise à jour 0.01 ISK' : 'Tous vos ordres sont au top !'}
            </div>
          </div>
        </div>

        {/* Orders Table Container */}
        <div className="bg-[#161821] border border-[#262730] rounded-xl overflow-hidden shadow-xl">
          {/* Table Controls Header */}
          <div className="p-4 border-b border-[#262730] flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex items-center bg-[#0e1117] p-1 rounded-lg border border-[#262730] text-xs">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'all'
                    ? 'bg-[#262730] text-[#fafafa]'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                Tous ({orders.length})
              </button>
              <button
                onClick={() => setFilterTab('buy')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'buy'
                    ? 'bg-[#262730] text-blue-400'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                Achats ({stats.buyCount})
              </button>
              <button
                onClick={() => setFilterTab('sell')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'sell'
                    ? 'bg-[#262730] text-green-400'
                    : 'text-[#808495] hover:text-[#fafafa]'
                }`}
              >
                Ventes ({stats.sellCount})
              </button>
              <button
                onClick={() => setFilterTab('outbid')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  filterTab === 'outbid'
                    ? 'bg-[#ff4b4b]/20 text-[#ff4b4b]'
                    : 'text-[#808495] hover:text-[#ff4b4b]'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                <span>Dépassés ({stats.outbidCount})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#808495]" />
              <input
                type="text"
                placeholder="Filtrer par objet ou station..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] rounded-lg px-3 py-1.5 pl-8 text-xs focus:outline-none focus:border-[#ff4b4b]"
              />
            </div>
          </div>

          {/* Orders Table */}
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-[#808495] space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto opacity-40 text-[#808495]" />
              <p className="text-sm font-medium">Aucun ordre ne correspond aux critères.</p>
              <p className="text-xs">
                {orders.length === 0
                  ? "Vous n'avez aucun ordre actif sur Tranquility pour le moment."
                  : 'Essayez de réinitialiser vos filtres ou termes de recherche.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0e1117] text-[#808495] uppercase font-semibold text-[10px] tracking-wider border-b border-[#262730]">
                  <tr>
                    <th className="py-3 px-4">Objet</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Prix Unitaire</th>
                    <th className="py-3 px-3">Statut Concurrence</th>
                    <th className="py-3 px-3">Volume Restant</th>
                    <th className="py-3 px-3">Valeur Totale</th>
                    <th className="py-3 px-3">Emplacement</th>
                    <th className="py-3 px-4 text-right">Action Arbitrage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262730]">
                  {filteredOrders.map((order) => {
                    const isBuy = order.is_buy_order;
                    const comp = order.market_competition;
                    const totalVal = order.price * order.volume_remain;
                    const volPct = Math.round((order.volume_remain / Math.max(1, order.volume_total)) * 100);

                    return (
                      <tr key={order.order_id} className="hover:bg-[#1a1d27] transition-colors">
                        {/* Type Icon & Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={`https://images.evetech.net/types/${order.type_id}/icon?size=32`}
                              alt=""
                              className="w-7 h-7 rounded bg-[#0e1117] border border-[#31333f] flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <div>
                              <div className="font-bold text-[#fafafa]">
                                {order.type_name || `Type #${order.type_id}`}
                              </div>
                              <div className="text-[10px] text-[#808495] font-mono">
                                ID: {order.type_id}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Order Type Badge */}
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              isBuy
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : 'bg-green-500/15 text-green-400 border border-green-500/30'
                            }`}
                          >
                            {isBuy ? 'ACHAT' : 'VENTE'}
                          </span>
                        </td>

                        {/* Order Price */}
                        <td className="py-3 px-3 font-mono font-bold text-[#fafafa]">
                          {fmtIsk(order.price)}
                        </td>

                        {/* Competition Status */}
                        <td className="py-3 px-3">
                          {comp ? (
                            comp.is_outbid ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#ff4b4b]">
                                  <AlertCircle className="w-3 h-3" />
                                  Dépassé ({comp.price_diff_percent > 0 ? `+${comp.price_diff_percent.toFixed(1)}%` : `${comp.price_diff_percent.toFixed(1)}%`})
                                </span>
                                <div className="text-[10px] text-[#808495] font-mono">
                                  Top hub : {isBuy ? fmtIsk(comp.highest_buy || 0) : fmtIsk(comp.lowest_sell || 0)}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-400">
                                <CheckCircle2 className="w-3 h-3" />
                                Meilleur Prix (#1)
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-[#808495]">Synchronisation...</span>
                          )}
                        </td>

                        {/* Volume Remaining Progress */}
                        <td className="py-3 px-3">
                          <div className="space-y-1 w-28">
                            <div className="flex justify-between text-[10px] font-mono text-[#808495]">
                              <span className="text-[#fafafa] font-bold">{fmtNumber(order.volume_remain)}</span>
                              <span>/ {fmtNumber(order.volume_total)}</span>
                            </div>
                            <div className="w-full bg-[#0e1117] h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${isBuy ? 'bg-blue-400' : 'bg-green-400'}`}
                                style={{ width: `${volPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Total ISK Value */}
                        <td className="py-3 px-3 font-mono text-[#fafafa]">
                          {fmtIsk(totalVal)}
                        </td>

                        {/* Location */}
                        <td className="py-3 px-3 text-[#808495] max-w-xs truncate text-[11px]">
                          {order.location_name || `Location #${order.location_id}`}
                        </td>

                        {/* Scan Arbitrage for this item */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => onSelectTypeForArbitrage(order.type_id)}
                            className="inline-flex items-center gap-1 bg-[#262730] hover:bg-[#ff4b4b] hover:text-white text-[#fafafa] px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors"
                            title="Lancer le scanner d'arbitrage inter-régional sur cet objet"
                          >
                            <span>Arbitrage</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
