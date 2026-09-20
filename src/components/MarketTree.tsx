import React, { useState, useMemo, useEffect } from 'react';
import {
  EVE_CATEGORIES,
  EVE_GROUPS,
} from '../data/universe';
import { EveTypeDetail, TypeCatalogMetadata } from '../types';
import { EsiService } from '../services/esi';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';
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
  Plus,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<number, boolean>>({
    4: true, // Default open Materials & Minerals
  });
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({
    18: true, // Default open Minerals
  });
  const [groupItemLimits, setGroupItemLimits] = useState<Record<number, number>>({});
  const [activeTab, setActiveTab] = useState<'tree' | 'favs' | 'recents'>('tree');
  const [isSearchingEsi, setIsSearchingEsi] = useState(false);
  const [esiSearchResults, setEsiSearchResults] = useState<EveTypeDetail[]>([]);
  const [catalogMeta, setCatalogMeta] = useState<TypeCatalogMetadata>(CatalogRepository.getInstance().getMetadata());
  const [allAvailableTypes, setAllAvailableTypes] = useState<EveTypeDetail[]>(CatalogRepository.getInstance().getAllTypes());
  const [isLoadingAllTypes, setIsLoadingAllTypes] = useState(false);

  // Subscribe to central CatalogRepository SSOT
  useEffect(() => {
    const catalogRepo = CatalogRepository.getInstance();
    
    // Initial sync
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
  }, []);

  // Register custom user types if supplied
  useEffect(() => {
    if (customTypes && customTypes.length > 0) {
      const catalogRepo = CatalogRepository.getInstance();
      for (const t of customTypes) {
        try {
          catalogRepo.registerCustomType(t);
        } catch {}
      }
    }
  }, [customTypes]);

  // Fast text search filter across verified types, groups, and categories
  const filteredTypes = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    const isNum = /^\d+$/.test(term);

    if (isNum) {
      const num = Number(term);
      const exact = CatalogRepository.getInstance().getTypeById(num);
      const rest = allAvailableTypes.filter(
        (t) => t.type_id !== num && (t.type_id.toString().includes(term) || t.name.toLowerCase().includes(term))
      );
      return exact ? [exact, ...rest] : rest;
    }

    return allAvailableTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.type_id.toString().includes(term) ||
        EVE_GROUPS.find((g) => g.group_id === t.group_id)?.name.toLowerCase().includes(term) ||
        EVE_CATEGORIES.find((c) => c.category_id === t.category_id)?.name.toLowerCase().includes(term)
    );
  }, [searchTerm, allAvailableTypes]);

  // Virtual slice to render up to 150 items smoothly
  const displayedFilteredTypes = useMemo(() => {
    if (!filteredTypes) return null;
    return filteredTypes.slice(0, 150);
  }, [filteredTypes]);

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
          CatalogRepository.getInstance().registerCustomType(detail);
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

  const toggleCategory = (catId: number) => {
    setOpenCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const toggleGroup = (groupId: number) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <div className="flex flex-col h-full bg-[#161821] border-r border-[#262730] text-[#fafafa] select-none text-xs">
      {/* Header & Tabs */}
      <div className="p-3 border-b border-[#262730] space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm tracking-wide flex items-center gap-1.5">
            <Package className="w-4 h-4 text-[#ff4b4b]" />
            Catalogue Marché
          </span>
          <div className="flex items-center gap-1.5">
            {catalogMeta.status === 'CATALOG_FALLBACK_CORE' && (
              <span className="text-[10px] bg-amber-950/80 text-amber-300 border border-amber-600/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1" title="Mode secours actif : catalogue de base vérifié">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                Secours ({allAvailableTypes.length})
              </span>
            )}
            {catalogMeta.status === 'CATALOG_LOADED' && (
              <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-600/40 px-1.5 py-0.5 rounded font-mono flex items-center gap-1" title="Catalogue complet vérifié">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                {allAvailableTypes.length.toLocaleString()} vérifiés
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
            placeholder={`Rechercher parmi ${allAvailableTypes.length.toLocaleString()} types (ex: 34 ou Machariel)...`}
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

        {/* Navigation Mode Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-[#0e1117] p-0.5 rounded border border-[#262730]">
          <button
            onClick={() => setActiveTab('tree')}
            className={`py-1 px-1.5 rounded text-[11px] font-medium transition-colors ${
              activeTab === 'tree' ? 'bg-[#262730] text-[#fafafa]' : 'text-[#808495] hover:text-[#fafafa]'
            }`}
          >
            Arbre
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
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Search Results Override */}
        {filteredTypes !== null && displayedFilteredTypes !== null ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] uppercase text-[#808495] px-2 py-1 font-semibold">
              <span>Résultats ({filteredTypes.length})</span>
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

            {filteredTypes.length > 150 && (
              <div className="text-[10px] text-[#808495] px-2 py-1 bg-[#0e1117] rounded border border-[#262730]">
                150 premiers résultats sur {filteredTypes.length.toLocaleString()} (affinez si besoin)
              </div>
            )}

            {filteredTypes.length === 0 && (
              <div className="p-3 text-center text-[#808495] space-y-2">
                <p>Aucun type trouvé dans les 15 801 types de marché.</p>
                <button
                  onClick={handleEsiSearch}
                  disabled={isSearchingEsi}
                  className="inline-flex items-center gap-1.5 bg-[#262730] hover:bg-[#ff4b4b] text-[#fafafa] px-3 py-1.5 rounded text-xs transition-colors"
                >
                  {isSearchingEsi ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Globe className="w-3.5 h-3.5" />
                  )}
                  <span>Rechercher sur tout EVE via ESI</span>
                </button>
              </div>
            )}

            {displayedFilteredTypes.map((type) => {
              const isSelected = type.type_id === selectedTypeId;
              const isFav = favorites.includes(type.type_id);
              return (
                <div
                  key={type.type_id}
                  onClick={() => onSelectType(type)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#ff4b4b]/20 text-[#ff4b4b] font-semibold border border-[#ff4b4b]/40'
                      : 'hover:bg-[#20222c] text-[#fafafa]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <img
                      src={`https://images.evetech.net/types/${type.type_id}/icon?size=32`}
                      alt=""
                      className="w-4 h-4 rounded bg-[#0e1117] flex-shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="text-[#808495] text-[10px] font-mono flex-shrink-0">#{type.type_id}</span>
                    <span className="truncate text-xs">{type.name}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {type.average_price !== undefined && type.average_price > 0 && (
                      <span className="text-[10px] font-mono text-[#00ff88]" title="Prix moyen Tranquility">
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
                const item = allAvailableTypes.find((t) => t.type_id === typeId);
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
                const item = allAvailableTypes.find((t) => t.type_id === typeId);
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
          /* Market Hierarchy Tree: Category -> Group -> Type */
          <div className="space-y-1">
            {EVE_CATEGORIES.map((cat) => {
              const isOpen = !!openCategories[cat.category_id];
              const groupsInCat = EVE_GROUPS.filter((g) => g.category_id === cat.category_id);

              return (
                <div key={cat.category_id} className="rounded">
                  {/* Category level */}
                  <button
                    onClick={() => toggleCategory(cat.category_id)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-[#20222c] text-left font-semibold text-[#fafafa] transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#808495]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#808495]" />
                    )}
                    <span className="text-sm">{cat.icon}</span>
                    <span className="truncate flex-1">{cat.name}</span>
                    <span className="text-[10px] text-[#808495] font-normal">
                      {groupsInCat.length}
                    </span>
                  </button>

                  {/* Groups level */}
                  {isOpen && (
                    <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-[#262730] ml-3">
                      {groupsInCat.map((grp) => {
                        const isGrpOpen = !!openGroups[grp.group_id];
                        const typesInGrp = allAvailableTypes.filter(
                          (t) => t.group_id === grp.group_id
                        );

                        return (
                          <div key={grp.group_id}>
                            <button
                              onClick={() => toggleGroup(grp.group_id)}
                              className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[#20222c] text-left text-[#cfd3dc] transition-colors"
                            >
                              {isGrpOpen ? (
                                <ChevronDown className="w-3 h-3 text-[#808495]" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-[#808495]" />
                              )}
                              <Folder className="w-3 h-3 text-[#808495]" />
                              <span className="truncate flex-1 text-xs">{grp.name}</span>
                              <span className="text-[10px] text-[#808495]">
                                {typesInGrp.length}
                              </span>
                            </button>

                            {/* Type items level */}
                            {isGrpOpen && (
                              <div className="pl-4 py-0.5 space-y-0.5 border-l border-[#262730] ml-3">
                                {typesInGrp.slice(0, groupItemLimits[grp.group_id] || 40).map((type) => {
                                  const isSelected = type.type_id === selectedTypeId;
                                  const isFav = favorites.includes(type.type_id);

                                  return (
                                    <div
                                      key={type.type_id}
                                      onClick={() => onSelectType(type)}
                                      className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                                        isSelected
                                          ? 'bg-[#ff4b4b]/25 text-[#ff4b4b] font-bold border border-[#ff4b4b]/40'
                                          : 'hover:bg-[#20222c] text-[#fafafa]'
                                      }`}
                                    >
                                      <span className="truncate">{type.name}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onToggleFavorite(type.type_id);
                                        }}
                                        className="text-[#808495] hover:text-amber-400 p-0.5"
                                      >
                                        <Star
                                          className={`w-3 h-3 ${
                                            isFav ? 'text-amber-400 fill-amber-400' : ''
                                          }`}
                                        />
                                      </button>
                                    </div>
                                  );
                                })}

                                {typesInGrp.length > (groupItemLimits[grp.group_id] || 40) && (
                                  <button
                                    onClick={() =>
                                      setGroupItemLimits((prev) => ({
                                        ...prev,
                                        [grp.group_id]: (prev[grp.group_id] || 40) + 60,
                                      }))
                                    }
                                    className="w-full text-center py-1 text-[10px] text-[#ff4b4b] hover:underline font-medium"
                                  >
                                    Afficher + ({typesInGrp.length - (groupItemLimits[grp.group_id] || 40)} restants)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
