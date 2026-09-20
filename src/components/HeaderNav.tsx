import React from 'react';
import {
  TrendingUp,
  Sliders,
  PieChart,
  BookOpen,
  ShoppingBag,
  Users,
  Sparkles,
  Globe,
  Menu,
} from 'lucide-react';
import { EveTypeDetail, EveCharacterSession, GlobalSyncProgress } from '../types';
import { fmtIsk } from '../engine/money';

interface HeaderNavProps {
  currentView: 'cockpit' | 'global' | 'orders' | 'portfolio' | 'journal' | 'config';
  onViewChange: (view: 'cockpit' | 'global' | 'orders' | 'portfolio' | 'journal' | 'config') => void;
  selectedType: EveTypeDetail;
  characterSession: EveCharacterSession | null;
  characterOrdersCount: number;
  portfolioPositionsCount: number;
  tradeExecutionsCount: number;
  globalSyncProgress: GlobalSyncProgress;
  onOpenGlobalSync: () => void;
  onOpenCharactersModal: () => void;
  onToggleCatalogDrawer?: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  currentView,
  onViewChange,
  selectedType,
  characterSession,
  characterOrdersCount,
  portfolioPositionsCount,
  tradeExecutionsCount,
  globalSyncProgress,
  onOpenGlobalSync,
  onOpenCharactersModal,
  onToggleCatalogDrawer,
}) => {
  return (
    <header className="bg-[#161821] border-b border-[#262730] px-3 sm:px-5 py-2.5 flex items-center justify-between flex-shrink-0 gap-2">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Catalog Trigger Button (< lg) */}
        {onToggleCatalogDrawer && (
          <button
            onClick={onToggleCatalogDrawer}
            className="lg:hidden p-1.5 rounded-lg bg-[#0e1117] hover:bg-[#1f2330] border border-[#262730] text-[#fafafa] flex-shrink-0"
            title="Ouvrir le catalogue d'objets"
            aria-label="Catalogue d'objets"
          >
            <Menu className="w-4 h-4 text-[#808495]" />
          </button>
        )}

        <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#fafafa] flex items-center gap-1.5 truncate">
          <span className="text-lg sm:text-xl flex-shrink-0">🚀</span>
          <span className="truncate">EVE Trade</span>
        </h1>

        <div className="hidden xl:flex items-center gap-1.5 text-xs bg-[#0e1117] px-2.5 py-1 rounded-lg border border-[#262730] min-w-0">
          <span className="text-[#808495] flex-shrink-0">Objet actif :</span>
          <span className="font-bold text-[#fafafa] truncate">{selectedType.name}</span>
          <span className="text-[10px] text-[#808495] font-mono tabular-nums flex-shrink-0">({selectedType.volume} m³)</span>
        </div>
      </div>

      {/* View Switcher Tabs & Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
        <nav className="flex items-center bg-[#0e1117] p-1 rounded-lg border border-[#262730] text-xs flex-shrink-0">
          <button
            onClick={() => onViewChange('cockpit')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors ${
              currentView === 'cockpit'
                ? 'bg-[#262730] text-[#fafafa] shadow'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#ff4b4b] flex-shrink-0" />
            <span className="hidden sm:inline">Cockpit</span>
          </button>

          <button
            onClick={() => onViewChange('global')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors ${
              currentView === 'global'
                ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40 shadow'
                : 'text-[#808495] hover:text-purple-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span className="hidden md:inline">Découverte Globale</span>
            <span className="md:hidden">Global</span>
          </button>

          <button
            onClick={() => onViewChange('orders')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors ${
              currentView === 'orders'
                ? 'bg-[#262730] text-[#fafafa] shadow'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <ShoppingBag className={`w-3.5 h-3.5 flex-shrink-0 ${characterSession ? 'text-[#ff4b4b]' : 'text-[#808495]'}`} />
            <span className="hidden sm:inline">Ordres</span>
            {characterSession ? (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums bg-green-500/20 text-green-400 font-bold">
                {characterOrdersCount}
              </span>
            ) : (
              <span className="ml-0.5 text-[10px] text-amber-400 font-mono">SSO</span>
            )}
          </button>

          <button
            onClick={() => onViewChange('portfolio')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors ${
              currentView === 'portfolio'
                ? 'bg-[#262730] text-[#fafafa] shadow'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <PieChart className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="hidden md:inline">Portefeuille</span>
            <span className="tabular-nums text-[11px] text-[#808495]">({portfolioPositionsCount})</span>
          </button>

          <button
            onClick={() => onViewChange('journal')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors ${
              currentView === 'journal'
                ? 'bg-[#262730] text-[#fafafa] shadow'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
            <span className="hidden md:inline">Journal</span>
            <span className="tabular-nums text-[11px] text-[#808495]">({tradeExecutionsCount})</span>
          </button>

          <button
            onClick={() => onViewChange('config')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-medium transition-colors ${
              currentView === 'config'
                ? 'bg-[#262730] text-[#fafafa] shadow'
                : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="hidden lg:inline">Paramètres</span>
          </button>
        </nav>

        {/* Global Market Sync Button with Progress Badge */}
        <button
          onClick={onOpenGlobalSync}
          className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600/30 to-blue-600/30 hover:from-purple-600/40 hover:to-blue-600/40 text-purple-200 border border-purple-500/40 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm flex-shrink-0"
          title="Lancer une synchronisation globale du catalogue complet"
        >
          <Globe className={`w-3.5 h-3.5 flex-shrink-0 ${globalSyncProgress.is_running ? 'animate-spin text-purple-300' : 'text-purple-400'}`} />
          <span className="hidden sm:inline">
            {globalSyncProgress.is_running
              ? `Sync Globale (${globalSyncProgress.percent}%)`
              : 'Sync Globale ESI'}
          </span>
          <span className="sm:hidden tabular-nums">
            {globalSyncProgress.is_running ? `${globalSyncProgress.percent}%` : 'Sync'}
          </span>
        </button>

        {/* Character & Multi-account pill */}
        <button
          onClick={onOpenCharactersModal}
          className="flex items-center gap-1.5 sm:gap-2 bg-[#0e1117] hover:bg-[#1f2330] border border-[#262730] px-2 sm:px-2.5 py-1 rounded-lg transition-colors text-left flex-shrink-0"
          title="Gérer vos personnages et comptes EVE liés"
        >
          {characterSession ? (
            <>
              <img
                src={characterSession.portrait_url}
                alt={characterSession.character_name}
                className="w-5 h-5 rounded-full border border-green-500/50 bg-[#161821] object-cover flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.evetech.net/characters/1/portrait?size=64';
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-bold text-[#fafafa] leading-tight truncate max-w-[70px] sm:max-w-[90px]">
                  {characterSession.character_name}
                </span>
                {characterSession.wallet_balance !== undefined && (
                  <span className="text-[10px] font-mono text-amber-400 leading-tight tabular-nums truncate max-w-[70px] sm:max-w-[90px]">
                    {fmtIsk(characterSession.wallet_balance)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-[#808495] hover:text-[#fafafa]">
              <Users className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="hidden sm:inline">Comptes SSO</span>
              <span className="sm:hidden">SSO</span>
            </div>
          )}
        </button>
      </div>
    </header>
  );
};
