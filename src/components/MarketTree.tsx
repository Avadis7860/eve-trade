import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { EveTypeDetail, TypeCatalogMetadata } from '../types';
import { EsiService } from '../services/esi';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
import { MarketGroupRepository, MarketGroupNode } from '../domain/catalog/MarketGroupRepository';
import { fmtIsk } from '../engine/money';
import {
  ChevronRight,
  ChevronDown,
  Search,
  Star,
  Clock,
  Package,
  Folder,
  Globe,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  FolderOpen,
  Layers,
} from 'lucide-react';

interface MarketGroupItemProps {
  groupId: number;
  level?: number;
  repo: MarketGroupRepository;
  catalogRepo: CatalogRepository;
  openGroups: Record<number, boolean>;
  onToggleGroup: (groupId: number) => void;
  selectedTypeId: number;
  onSelectType: (type: EveTypeDetail) => void;
  favorites: number[];
  onToggleFavorite: (typeId: number) => void;
  groupItemLimits: Record<number, number>;
  onLoadMore: (groupId: number) => void;
}

const MarketGroupItem: React.FC<MarketGroupItemProps> = ({
  groupId,
  level = 0,
  repo,
  catalogRepo,
  openGroups,
  onToggleGroup,
  selectedTypeId,
  onSelectType,
  favorites,
  onToggleFavorite,
  groupItemLimits,
  onLoadMore,
}) => {
  const group = repo.getGroup(groupId);
  if (!group) return null;

  const children = repo.getChildGroups(groupId);
  const hasChildren = children.length > 0;
  const isOpen = Boolean(openGroups[groupId]);
  const directTypeIds = group.types || [];
  const totalSubtypeCount = useMemo(() => repo.getAllTypesForGroup(groupId).length, [repo, groupId]);

  const displayedLimit = groupItemLimits[groupId] || 40;
  const visibleTypeIds = directTypeIds.slice(0, displayedLimit);
  const remainingCount = directTypeIds.length - displayedLimit;

  const paddingLeftClass = level === 0 ? 'pl-2' : level === 1 ? 'pl-3' : level === 2 ? 'pl-4' : 'pl-5';

  return (
    <div className="rounded select-none">
      {/* Group Header Row */}
      <button
        type="button"
        onClick={() => onToggleGroup(groupId)}
        className={`w-full flex items-center gap-1.5 py-1.5 pr-2 rounded text-left transition-colors ${paddingLeftClass} ${
          level === 0
            ? 'font-bold text-[#fafafa] hover:bg-[#20222c] bg-[#161821]/60'
            : level === 1
            ? 'font-medium text-[#e1e4ea] hover:bg-[#20222c]'
            : 'text-xs text-[#cfd3dc] hover:bg-[#20222c]'
        }`}
      >
        {/* Chevron icon */}
        <span className="text-[#808495] flex-shrink-0">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>

        {/* Group Icon */}
        <span className="flex-shrink-0 text-sm">
          {group.icon ? group.icon : isOpen ? <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> : <Folder className="w-3.5 h-3.5 text-[#808495]" />}
        </span>

        {/* Group Name */}
        <span className="truncate flex-1 text-xs" title={group.name}>
          {group.name}
        </span>

        {/* Total Types Count Badge */}
        <span className="text-[10px] text-[#808495] font-mono font-normal flex-shrink-0 bg-[#0e1117] px-1.5 py-0.5 rounded border border-[#262730]">
          {totalSubtypeCount.toLocaleString()}
        </span>
      </button>

      {/* Expanded Subtree */}
      {isOpen && (
        <div className={`space-y-0.5 border-l border-[#262730] ml-3.5 my-0.5 ${level > 0 ? 'pl-1' : 'pl-1.5'}`}>
          {/* 1. Sub-groups if any */}
          {hasChildren &&
            children.map((child) => (
              <MarketGroupItem
                key={child.market_group_id}
                groupId={child.market_group_id}
                level={level + 1}
                repo={repo}
                catalogRepo={catalogRepo}
                openGroups={openGroups}
                onToggleGroup={onToggleGroup}
                selectedTypeId={selectedTypeId}
                onSelectType={onSelectType}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                groupItemLimits={groupItemLimits}
                onLoadMore={onLoadMore}
              />
            ))}

          {/* 2. Direct Leaf Type Items */}
          {directTypeIds.length > 0 && (
            <div className="space-y-0.5 pt-0.5">
              {visibleTypeIds.map((tid) => {
                const item = catalogRepo.getTypeById(tid) || {
                  type_id: tid,
                  name: `Type #${tid}`,
                  volume: 0.01,
                  category_id: 0,
                  group_id: 0,
                };
                const isSelected = tid === selectedTypeId;
                const isFav = favorites.includes(tid);

                return (
                  <div
                    key={tid}
                    onClick={() => onSelectType(item)}
                    title={`${item.name} (#${tid})${item.average_price ? ` - Prix moyen: ${fmtIsk(item.average_price)}` : ''}`}
                    className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#ff4b4b]/25 text-[#ff4b4b] font-bold border border-[#ff4b4b]/40 shadow-sm'
                        : 'hover:bg-[#20222c] text-[#fafafa]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                      <img
                        src={`https://images.evetech.net/types/${tid}/icon?size=32`}
                        alt=""
                        className="w-4 h-4 rounded bg-[#0e1117] flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <span className="hidden text-[#808495] text-[10px] font-mono flex-shrink-0">#{tid}</span>
                      <span className="truncate text-xs">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {item.average_price !== undefined && item.average_price > 0 && (
                        <span className="hidden text-[10px] font-mono text-[#00ff88]" title="Prix moyen Tranquility">
                          {fmtIsk(item.average_price)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(tid);
                        }}
                        className="text-[#808495] hover:text-amber-400 p-0.5"
                      >
                        <Star className={`w-3 h-3 ${isFav ? 'text-amber-400 fill-amber-400' : ''}`} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {remainingCount > 0 && (
                <button
                  type="button"
                  onClick={() => onLoadMore(groupId)}
                  className="w-full text-center py-1 text-[10px] text-[#ff4b4b] hover:underline font-medium hover:bg-[#20222c] rounded"
                >
                  Afficher + ({remainingCount.toLocaleString()} restants)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface MarketTreeProps {
  selectedTypeId: number;
  onSelectType: (type: EveTypeDetail) => void;
  favorites: number[];
  onToggleFavorite: (typeId: number) => void;
  recentTypeIds: number[];
  customTypes?: EveTypeDetail[];
  onAddCustomType?: (type: EveTypeDetail) => void;
}

export const MarketTree: React.FC<MarketTreeProps> = ({
  selectedTypeId,
  onSelectType,
  favorites,
  onToggleFavorite,
  recentTypeIds,
  customTypes = [],
  onAddCustomType,
}) => {
  const marketGroupRepo = useMemo(() => MarketGroupRepository.getInstance(), []);
  const catalogRepo = useMemo(() => CatalogRepository.getInstance(), []);

  const [searchTerm, setSearchTerm] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({
    475: true, // Default open Manufacture & Research
    18: true,  // Default open Minerals
  });
  const [groupItemLimits, setGroupItemLimits] = useState<Record<number, number>>({});
  const [activeTab, setActiveTab] = useState<'tree' | 'favs' | 'recents'>('tree');
  const [isSearchingEsi, setIsSearchingEsi] = useState(false);
  const [esiSearchResults, setEsiSearchResults] = useState<EveTypeDetail[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<TypeCatalogMetadata>(catalogRepo.getMetadata());
  const [allAvailableTypes, setAllAvailableTypes] = useState<EveTypeDetail[]>(catalogRepo.getAllTypes());
  const [isLoadingAllTypes, setIsLoadingAllTypes] = useState(false);

  const rootGroups = useMemo(() => marketGroupRepo.getRootGroups(), [marketGroupRepo]);

  // Subscribe to central CatalogRepository SSOT
  useEffect(() => {
    setCatalogMeta(catalogRepo.getMetadata());
    setAllAvailableTypes(catalogRepo.getAllTypes());

    const unsubscribe = catalogRepo.subscribe((meta) => {
      setCatalogMeta(meta);
      setAllAvailableTypes(catalogRepo.getAllTypes());
      setIsLoadingAllTypes(meta.status === 'CATALOG_LOADING');
    });

    setIsLoadingAllTypes(true);
    catalogRepo.init().finally(() => {
      setIsLoadingAllTypes(false);
      setCatalogMeta(catalogRepo.getMetadata());
      setAllAvailableTypes(catalogRepo.getAllTypes());
    });

    return () => {
      unsubscribe();
    };
  }, [catalogRepo]);

  // Register custom user types if supplied
  useEffect(() => {
    if (customTypes && customTypes.length > 0) {
      for (const t of customTypes) {
        try {
          catalogRepo.registerCustomType(t);
        } catch {}
      }
    }
  }, [customTypes, catalogRepo]);

  // Fast text search filter across all 20,526 types and market groups
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase().trim();
    const isNum = /^\d+$/.test(term);

    if (isNum) {
      const num = Number(term);
      const exact = catalogRepo.getTypeById(num);
      const rest = allAvailableTypes.filter(
        (t) => t.type_id !== num && (t.type_id.toString().includes(term) || t.name.toLowerCase().includes(term))
      );
      return {
        matchedGroups: marketGroupRepo.searchGroups(term),
        matchedTypes: exact ? [exact, ...rest] : rest,
      };
    }

    const matchedGroups = marketGroupRepo.searchGroups(term);
    const matchedTypes = allAvailableTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.type_id.toString().includes(term) ||
        (t.market_group_id ? marketGroupRepo.getGroup(t.market_group_id)?.name.toLowerCase().includes(term) : false)
    );

    return {
      matchedGroups,
      matchedTypes,
    };
  }, [searchTerm, allAvailableTypes, catalogRepo, marketGroupRepo]);

  const displayedFilteredTypes = useMemo(() => {
    if (!searchResults) return null;
    return searchResults.matchedTypes.slice(0, 150);
  }, [searchResults]);

  const handleEsiSearch = async () => {
    if (!searchTerm.trim() || isSearchingEsi) return;
    setIsSearchingEsi(true);
    setEsiSearchResults([]);
    try {
      const isNumeric = /^\d+$/.test(searchTerm.trim());
      if (isNumeric) {
        const item = await EsiService.lookupTypeById(Number(searchTerm.trim()));
        if (item) {
          const detail: EveTypeDetail = {
            ...item,
            category_id: 0,
          };
          setEsiSearchResults([detail]);
          catalogRepo.registerCustomType(detail);
          if (onAddCustomType) onAddCustomType(detail);
        }
      } else {
        const results = await EsiService.searchTypesByName(searchTerm.trim());
        const mapped: EveTypeDetail[] = results.map((r) => ({
          ...r,
          category_id: 0,
        }));
        setEsiSearchResults(mapped);
      }
    } catch {
      // ignore
    } finally {
      setIsSearchingEsi(false);
    }
  };

  const toggleGroup = useCallback((groupId: number) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleLoadMore = useCallback((groupId: number) => {
    setGroupItemLimits((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] || 40) + 60,
    }));
  }, []);

  const expandAllRoots = () => {
    const updated: Record<number, boolean> = {};
    for (const g of rootGroups) {
      updated[g.market_group_id] = true;
    }
    setOpenGroups(updated);
  };

  const collapseAll = () => {
    setOpenGroups({});
  };

  return (
    <div className="flex flex-col h-full bg-[#161821] border-r border-[#262730] text-[#fafafa] select-none text-xs">
      {/* Header & Tabs */}
      <div className="p-3 border-b border-[#262730] space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm tracking-wide flex items-center gap-1.5">
            <Package className="w-4 h-4 text-[#ff4b4b]" />
            Catalogue Marché EVE
          </span>
          <div className="flex items-center gap-1.5">
            {catalogMeta.status === 'CATALOG_READY' && (
              <span
                className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
                title="Catalogue universel officiel CCP vérifié et intègre"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                {allAvailableTypes.length.toLocaleString()} types
              </span>
            )}
            {catalogMeta.status === 'CATALOG_FALLBACK_CORE' && (
              <span
                className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-600/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
                title="Mode secours : catalogue noyau"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Noyau ({allAvailableTypes.length})
              </span>
            )}
            {catalogMeta.status === 'CATALOG_DEGRADED' && (
              <span
                className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-600/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1"
                title="Catalogue en mode dégradé"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Dégradé ({allAvailableTypes.length})
              </span>
            )}
            {isLoadingAllTypes && (
              <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                <Loader2 className="w-3 h-3 animate-spin" />
                Actualisation...
              </span>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#808495]" />
          <input
            type="text"
            placeholder={`Rechercher parmi ${allAvailableTypes.length.toLocaleString()} types ou groupes...`}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setEsiSearchResults([]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEsiSearch();
            }}
            className="w-full bg-[#0e1117] border border-[#31333f] text-[#fafafa] rounded px-2.5 py-1.5 pl-8 pr-7 text-xs focus:outline-none focus:border-[#ff4b4b]"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setEsiSearchResults([]);
              }}
              className="absolute right-2 top-2 text-[#808495] hover:text-[#fafafa]"
            >
              ×
            </button>
          )}
        </div>

        {/* Navigation Mode Tabs & Group Actions */}
        <div className="flex items-center justify-between gap-1">
          <div className="grid grid-cols-3 gap-1 bg-[#0e1117] p-0.5 rounded border border-[#262730] flex-1">
            <button
              onClick={() => setActiveTab('tree')}
              className={`py-1 px-1.5 rounded text-[11px] font-medium transition-colors ${
                activeTab === 'tree' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#fafafa]'
              }`}
            >
              Arbre ({rootGroups.length})
            </button>
            <button
              onClick={() => setActiveTab('favs')}
              className={`py-1 px-1.5 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors ${
                activeTab === 'favs' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#fafafa]'
              }`}
            >
              <Star className="w-3 h-3 text-amber-400" />
              <span>({favorites.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('recents')}
              className={`py-1 px-1.5 rounded text-[11px] font-medium flex items-center justify-center gap-1 transition-colors ${
                activeTab === 'recents' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#fafafa]'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Récents</span>
            </button>
          </div>

          {activeTab === 'tree' && (
            <div className="flex items-center gap-1">
              <button
                onClick={expandAllRoots}
                title="Développer tous les groupes racines"
                className="p-1 rounded bg-[#0e1117] border border-[#262730] text-[#808495] hover:text-[#fafafa] text-[10px]"
              >
                +
              </button>
              <button
                onClick={collapseAll}
                title="Tout réduire"
                className="p-1 rounded bg-[#0e1117] border border-[#262730] text-[#808495] hover:text-[#fafafa] text-[10px]"
              >
                -
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Search Results Override */}
        {searchResults !== null && displayedFilteredTypes !== null ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase text-[#808495] px-2 py-1 font-semibold">
              <span>Résultats ({searchResults.matchedTypes.length} types, {searchResults.matchedGroups.length} groupes)</span>
              {searchTerm && (
                <button
                  onClick={handleEsiSearch}
                  disabled={isSearchingEsi}
                  className="flex items-center gap-1 text-[#ff4b4b] hover:text-[#ff6666] lowercase"
                >
                  {isSearchingEsi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />}
                  <span>interroger esi</span>
                </button>
              )}
            </div>

            {/* Matching Groups Header Cards */}
            {searchResults.matchedGroups.length > 0 && (
              <div className="space-y-1 bg-[#0e1117] p-2 rounded-lg border border-[#262730]">
                <div className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
                  <Folder className="w-3 h-3" />
                  <span>Groupes de marché correspondants</span>
                </div>
                <div className="space-y-1">
                  {searchResults.matchedGroups.slice(0, 5).map((mg) => (
                    <button
                      key={mg.market_group_id}
                      onClick={() => {
                        setOpenGroups((prev) => ({ ...prev, [mg.market_group_id]: true }));
                        setActiveTab('tree');
                        setSearchTerm('');
                      }}
                      className="w-full flex items-center justify-between p-1.5 rounded bg-[#161821] hover:bg-[#20222c] text-left"
                    >
                      <span className="text-xs text-[#fafafa] font-medium flex items-center gap-1.5">
                        {mg.icon || '📁'} {mg.name}
                      </span>
                      <span className="text-[10px] text-[#808495] font-mono">
                        {marketGroupRepo.getAllTypesForGroup(mg.market_group_id).length} types
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchResults.matchedTypes.length > 150 && (
              <div className="text-[10px] text-[#808495] px-2 py-1 bg-[#0e1117] rounded border border-[#262730]">
                150 premiers résultats sur {searchResults.matchedTypes.length.toLocaleString()} (affinez la recherche)
              </div>
            )}

            {searchResults.matchedTypes.length === 0 && searchResults.matchedGroups.length === 0 && (
              <div className="p-3 text-center text-[#808495] space-y-2">
                <p>Aucun résultat trouvé dans les 20 526 types de marché.</p>
                <button
                  onClick={handleEsiSearch}
                  disabled={isSearchingEsi}
                  className="inline-flex items-center gap-1.5 bg-[#262730] hover:bg-[#ff4b4b] text-[#fafafa] px-3 py-1.5 rounded text-xs transition-colors"
                >
                  {isSearchingEsi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  <span>Rechercher sur tout EVE via ESI</span>
                </button>
              </div>
            )}

            {displayedFilteredTypes.map((type) => {
              const isSelected = type.type_id === selectedTypeId;
              const isFav = favorites.includes(type.type_id);
              const crumbs = marketGroupRepo.getItemBreadcrumbs(type.type_id);

              return (
                <div
                  key={type.type_id}
                  onClick={() => onSelectType(type)}
                  className={`flex flex-col p-2 rounded cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#ff4b4b]/20 text-[#ff4b4b] font-semibold border border-[#ff4b4b]/40'
                      : 'hover:bg-[#20222c] text-[#fafafa]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate flex-1 min-w-0" title={`${type.name} (#${type.type_id})${type.average_price ? ` - Prix moyen: ${fmtIsk(type.average_price)}` : ''}`}>
                      <img
                        src={`https://images.evetech.net/types/${type.type_id}/icon?size=32`}
                        alt=""
                        className="w-4 h-4 rounded bg-[#0e1117] flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <span className="hidden text-[#808495] text-[10px] font-mono flex-shrink-0">#{type.type_id}</span>
                      <span className="truncate text-xs font-medium">{type.name}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {type.average_price !== undefined && type.average_price > 0 && (
                        <span className="hidden text-[10px] font-mono text-[#00ff88]" title="Prix moyen Tranquility">
                          {fmtIsk(type.average_price)}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(type.type_id);
                        }}
                        className="text-[#808495] hover:text-amber-400 p-0.5"
                      >
                        <Star className={`w-3.5 h-3.5 ${isFav ? 'text-amber-400 fill-amber-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Breadcrumbs Path */}
                  {crumbs.length > 0 && (
                    <div className="text-[9px] text-[#808495] truncate mt-1 flex items-center gap-1">
                      <Layers className="w-2.5 h-2.5 flex-shrink-0 text-amber-500/70" />
                      <span className="truncate">
                        {crumbs.map((c) => c.name).join(' › ')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Dynamic ESI results if requested */}
            {esiSearchResults.length > 0 && (
              <div className="pt-2 border-t border-[#262730] space-y-1">
                <div className="text-[10px] uppercase text-green-400 px-2 py-1 font-semibold flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span>Résultats ESI Tranquility ({esiSearchResults.length})</span>
                </div>
                {esiSearchResults.map((type) => (
                  <div
                    key={`esi-${type.type_id}`}
                    onClick={() => {
                      if (onAddCustomType) onAddCustomType(type);
                      onSelectType(type);
                    }}
                    className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer bg-green-500/10 hover:bg-green-500/20 text-[#fafafa] border border-green-500/20"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-green-400 text-[10px] font-mono">#{type.type_id}</span>
                      <span className="truncate font-semibold">{type.name}</span>
                    </div>
                    <span className="text-[10px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded font-mono">
                      Importer
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'favs' ? (
          /* Favorites Tab */
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-[#808495] px-2 py-1 font-semibold">
              Favoris enregistrés ({favorites.length})
            </div>
            {favorites.length === 0 ? (
              <div className="p-4 text-center text-[#808495]">
                Cliquez sur l’étoile pour ajouter un type à vos favoris.
              </div>
            ) : (
              favorites.map((typeId) => {
                const item = allAvailableTypes.find((t) => t.type_id === typeId) || catalogRepo.getTypeById(typeId);
                if (!item) return null;
                const isSelected = item.type_id === selectedTypeId;
                return (
                  <div
                    key={item.type_id}
                    onClick={() => onSelectType(item)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#ff4b4b]/20 text-[#ff4b4b] font-semibold border border-[#ff4b4b]/40'
                        : 'hover:bg-[#20222c] text-[#fafafa]'
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(item.type_id);
                      }}
                      className="text-amber-400 p-0.5"
                    >
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === 'recents' ? (
          /* Recents Tab */
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-[#808495] px-2 py-1 font-semibold">
              Consultés récemment
            </div>
            {recentTypeIds.length === 0 ? (
              <div className="p-4 text-center text-[#808495]">Aucun historique récent.</div>
            ) : (
              recentTypeIds.map((typeId) => {
                const item = allAvailableTypes.find((t) => t.type_id === typeId) || catalogRepo.getTypeById(typeId);
                if (!item) return null;
                const isSelected = item.type_id === selectedTypeId;
                return (
                  <div
                    key={item.type_id}
                    onClick={() => onSelectType(item)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#ff4b4b]/20 text-[#ff4b4b] font-semibold border border-[#ff4b4b]/40'
                        : 'hover:bg-[#20222c] text-[#fafafa]'
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="text-[10px] text-[#808495]">#{item.type_id}</span>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Official EVE Online Market Groups Hierarchy Tree (evemarketbrowser style) */
          <div className="space-y-0.5">
            {rootGroups.map((rootGroup) => (
              <MarketGroupItem
                key={rootGroup.market_group_id}
                groupId={rootGroup.market_group_id}
                level={0}
                repo={marketGroupRepo}
                catalogRepo={catalogRepo}
                openGroups={openGroups}
                onToggleGroup={toggleGroup}
                selectedTypeId={selectedTypeId}
                onSelectType={onSelectType}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                groupItemLimits={groupItemLimits}
                onLoadMore={handleLoadMore}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
