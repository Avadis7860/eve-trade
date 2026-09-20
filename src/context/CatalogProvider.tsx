import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { EveTypeDetail, TypeCatalogMetadata } from '../types';
import { CatalogRepository } from '../domain/catalog/CatalogRepository';

interface CatalogContextType {
  selectedType: EveTypeDetail;
  setSelectedType: (type: EveTypeDetail) => void;
  favorites: number[];
  toggleFavorite: (typeId: number) => void;
  recentTypeIds: number[];
  catalogMetadata: TypeCatalogMetadata;
  allMarketTypes: EveTypeDetail[];
  selectTypeById: (typeId: number) => void;
}

const CatalogContext = createContext<CatalogContextType | undefined>(undefined);

export const CatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const repo = CatalogRepository.getInstance();

  const [selectedType, setSelectedTypeState] = useState<EveTypeDetail>(() => {
    return repo.getTypeById(34) || repo.getAllTypes()[0];
  });

  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('eve_trade_favs');
      return saved ? JSON.parse(saved) : [34, 37, 40519, 44992];
    } catch {
      return [34, 37, 40519, 44992];
    }
  });

  const [recentTypeIds, setRecentTypeIds] = useState<number[]>([34, 37, 40519]);
  const [catalogMetadata, setCatalogMetadata] = useState<TypeCatalogMetadata>(repo.getMetadata());
  const [allMarketTypes, setAllMarketTypes] = useState<EveTypeDetail[]>(repo.getAllTypes());

  useEffect(() => {
    // Refresh catalog metadata and types after repository load
    setCatalogMetadata(repo.getMetadata());
    setAllMarketTypes(repo.getAllTypes());
  }, [repo]);

  const setSelectedType = useCallback((type: EveTypeDetail) => {
    setSelectedTypeState(type);
    setRecentTypeIds((prev) => {
      const filtered = prev.filter((id) => id !== type.type_id);
      return [type.type_id, ...filtered].slice(0, 10);
    });
  }, []);

  const selectTypeById = useCallback((typeId: number) => {
    const item = repo.getTypeById(typeId);
    if (item) {
      setSelectedType(item);
    }
  }, [repo, setSelectedType]);

  const toggleFavorite = useCallback((typeId: number) => {
    setFavorites((prev) => {
      const next = prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId];
      try {
        localStorage.setItem('eve_trade_favs', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const value = {
    selectedType,
    setSelectedType,
    favorites,
    toggleFavorite,
    recentTypeIds,
    catalogMetadata,
    allMarketTypes,
    selectTypeById,
  };

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
};

export const useCatalog = (): CatalogContextType => {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('useCatalog must be used within a CatalogProvider');
  }
  return context;
};
