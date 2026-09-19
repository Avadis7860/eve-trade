import { QuantityResult } from '../types';

export interface TradableQuantityParams {
  capital_limit: number;
  cargo_limit_m3: number;
  unit_volume_m3: number;
  source_available_units: number;
  dest_available_units: number;
  estimated_unit_buy_price: number;
}

export interface TradableQuantityResult {
  tradable_quantity: number;
  bottleneck: 'capital' | 'cargo' | 'source_volume' | 'dest_volume' | 'none';
  capital_limited_units: number;
  cargo_limited_units: number;
  source_available_units: number;
  dest_available_units: number;
}

export class TradableQuantityEngine {
  /**
   * ISK spent per unit acquired (price + broker fee).
   */
  static unitAcquisitionCost(buyPrice: number, brokerFee: number = 0): number {
    return buyPrice * (1.0 + brokerFee);
  }

  static maxAffordableQuantity(
    buyPrice: number,
    brokerFee: number,
    availableCapital: number
  ): number {
    if (availableCapital <= 0) return 0;
    const unit = TradableQuantityEngine.unitAcquisitionCost(buyPrice, brokerFee);
    if (unit <= 0) return -1; // Sentinel: unlimited
    return Math.floor(availableCapital / unit);
  }

  /**
   * Multi-constraint calculation:
   * quantity = min(capital_limit, cargo_limit, source_accessible_volume, destination_accessible_volume)
   */
  static calculateTradableQuantity(params: TradableQuantityParams): TradableQuantityResult {
    const {
      capital_limit,
      cargo_limit_m3,
      unit_volume_m3,
      source_available_units,
      dest_available_units,
      estimated_unit_buy_price,
    } = params;

    const capitalLimited = estimated_unit_buy_price > 0 && capital_limit > 0
      ? Math.floor(capital_limit / estimated_unit_buy_price)
      : (capital_limit <= 0 ? 0 : 999999999);

    const cargoLimited = unit_volume_m3 > 0 && cargo_limit_m3 > 0
      ? Math.floor(cargo_limit_m3 / unit_volume_m3)
      : (cargo_limit_m3 <= 0 ? 0 : 999999999);

    const sourceAvailable = Math.max(0, Math.floor(source_available_units));
    const destAvailable = Math.max(0, Math.floor(dest_available_units));

    const minQty = Math.max(
      0,
      Math.min(capitalLimited, cargoLimited, sourceAvailable, destAvailable)
    );

    let bottleneck: 'capital' | 'cargo' | 'source_volume' | 'dest_volume' | 'none' = 'none';
    if (minQty === 0) {
      if (sourceAvailable === 0) bottleneck = 'source_volume';
      else if (destAvailable === 0) bottleneck = 'dest_volume';
      else if (capitalLimited === 0) bottleneck = 'capital';
      else if (cargoLimited === 0) bottleneck = 'cargo';
    } else {
      if (minQty === capitalLimited) bottleneck = 'capital';
      else if (minQty === cargoLimited) bottleneck = 'cargo';
      else if (minQty === sourceAvailable) bottleneck = 'source_volume';
      else if (minQty === destAvailable) bottleneck = 'dest_volume';
    }

    return {
      tradable_quantity: minQty,
      bottleneck,
      capital_limited_units: capitalLimited,
      cargo_limited_units: cargoLimited,
      source_available_units: sourceAvailable,
      dest_available_units: destAvailable,
    };
  }

  static compute(
    buyPrice: number,
    availableMarketVolume: number,
    availableCapital: number,
    brokerFee: number
  ): QuantityResult {
    const marketVol = Math.max(0, Math.floor(availableMarketVolume));
    if (marketVol === 0) {
      return {
        max_affordable_quantity: 0,
        market_available_volume: 0,
        max_trade_quantity: 0,
        capital_required: 0.0,
      };
    }

    const unit = TradableQuantityEngine.unitAcquisitionCost(buyPrice, brokerFee);
    let maxAfford: number;

    if (unit <= 0) {
      maxAfford = marketVol;
    } else if (availableCapital <= 0) {
      maxAfford = 0;
    } else {
      maxAfford = Math.floor(availableCapital / unit);
    }

    const maxTrade = Math.min(marketVol, maxAfford);
    const capitalRequired = maxTrade * unit;

    return {
      max_affordable_quantity: maxAfford,
      market_available_volume: marketVol,
      max_trade_quantity: maxTrade,
      capital_required: capitalRequired,
    };
  }
}

export const QuantityCalculator = TradableQuantityEngine;

