import { QuantityResult } from '../types';

export class QuantityCalculator {
  /**
   * ISK spent per unit acquired (price + broker fee).
   */
  static unitAcquisitionCost(buyPrice: number, brokerFee: number): number {
    return buyPrice * (1.0 + brokerFee);
  }

  static maxAffordableQuantity(
    buyPrice: number,
    brokerFee: number,
    availableCapital: number
  ): number {
    if (availableCapital <= 0) return 0;
    const unit = QuantityCalculator.unitAcquisitionCost(buyPrice, brokerFee);
    if (unit <= 0) return -1; // Sentinel: unlimited
    return Math.floor(availableCapital / unit);
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

    const unit = QuantityCalculator.unitAcquisitionCost(buyPrice, brokerFee);
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
