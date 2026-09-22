import React, { createContext, useContext, useState, useEffect } from 'react';
import { FinancialConfig, TradeStrategy, MarketHub } from '../types';
import { UniverseRepository } from '../domain/universe/UniverseRepository';
import { loadPersistedFinancialConfig } from '../engine/financialConfig';

interface TradingConfigContextType {
  config: FinancialConfig;
  setConfig: React.Dispatch<React.SetStateAction<FinancialConfig>>;
  strategy: TradeStrategy;
  setStrategy: React.Dispatch<React.SetStateAction<TradeStrategy>>;
  hubs: MarketHub[];
  setHubs: React.Dispatch<React.SetStateAction<MarketHub[]>>;
  sortBy: 'score' | 'profit' | 'roi' | 'profit_day' | 'turnover';
  setSortBy: React.Dispatch<React.SetStateAction<'score' | 'profit' | 'roi' | 'profit_day' | 'turnover'>>;
  filterRoute: string;
  setFilterRoute: React.Dispatch<React.SetStateAction<string>>;
  highSecOnly: boolean;
  setHighSecOnly: React.Dispatch<React.SetStateAction<boolean>>;
}

const DEFAULT_CONFIG: FinancialConfig = {
  available_capital: 1000000000.0, // 1 Billion ISK
  treasury_source_mode: 'corporation', // Corporation / Fleet / Personal treasury mode
  corporation_wallet_division: 1,      // Division 1 (Master / 1ère division)
  corporation_wallet_source: 'unavailable',
  corporation_name: 'Corporation Personnelle',
  enable_transport_costs: false,   // Disabled by default -> 0 ISK transport cost
  broker_fee: 0.0145,              // 1.45%
  sales_tax: 0.035,               // 3.5%
  transport_cost_per_m3: 0,        // 0 ISK / m³
  transport_cost_per_jump: 0,      // 0 ISK / jump
  collateral_fee_pct: 0,           // 0%
  max_cargo_m3: 35000.0,           // 35,000 m³ (Deep Space Transport / Hauler)
  min_roi: 0.02,                   // Min 2% ROI
  min_net_profit: 200000.0,        // Min 200k ISK profit
  max_days_to_sell: 10.0,          // Max 10 days turnover
  max_capital_per_trade: 400000000.0, // 400M ISK max per position
  max_portfolio_concentration_type: 0.35,
  max_portfolio_concentration_group: 0.50,
  accounting_level: 5,
  broker_relations_level: 5,
  corp_standing: 0,
  faction_standing: 0,
};

const TradingConfigContext = createContext<TradingConfigContextType | undefined>(undefined);

export const TradingConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<FinancialConfig>(() => {
    const saved = localStorage.getItem('eve_trade_config');
    return loadPersistedFinancialConfig(saved, DEFAULT_CONFIG);
  });

  const [strategy, setStrategy] = useState<TradeStrategy>('relist');
  const [hubs, setHubs] = useState<MarketHub[]>(() => UniverseRepository.getInstance().getHubs());
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'roi' | 'profit_day' | 'turnover'>('score');
  const [filterRoute, setFilterRoute] = useState<string>('all');
  const [highSecOnly, setHighSecOnly] = useState<boolean>(true);

  // Persist configuration changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('eve_trade_config', JSON.stringify(config));
    } catch {}
  }, [config]);

  const value = {
    config,
    setConfig,
    strategy,
    setStrategy,
    hubs,
    setHubs,
    sortBy,
    setSortBy,
    filterRoute,
    setFilterRoute,
    highSecOnly,
    setHighSecOnly,
  };

  return <TradingConfigContext.Provider value={value}>{children}</TradingConfigContext.Provider>;
};

export const useTradingConfig = (): TradingConfigContextType => {
  const context = useContext(TradingConfigContext);
  if (!context) {
    throw new Error('useTradingConfig must be used within a TradingConfigProvider');
  }
  return context;
};
