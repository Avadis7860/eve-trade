import { FeeBreakdown, FinancialConfig } from '../types';

export class FeeCalculator {
  /**
   * EVE Online Sales Tax formula:
   * Base tax is 8.0%, reduced by 11% per Accounting skill level.
   * - Level 0: 8.00%
   * - Level 1: 7.12%
   * - Level 2: 6.24%
   * - Level 3: 5.36%
   * - Level 4: 4.48%
   * - Level 5: 3.60%
   */
  static calculateSalesTaxRate(accountingLevel: number = 5): number {
    const lvl = Math.max(0, Math.min(5, Math.floor(accountingLevel)));
    return Math.max(0.01, 0.08 * (1.0 - 0.11 * lvl));
  }

  /**
   * EVE Online NPC Broker Fee formula:
   * Base fee is 3.0%, reduced by 0.3% per Broker Relations skill level,
   * 0.03% per Faction standing point, and 0.02% per Corporation standing point.
   * Broker Fee % = 3.0% - (0.3% * BrokerRelations) - (0.03% * FactionStanding) - (0.02% * CorpStanding)
   * Minimum NPC broker fee is 1.0% (capped at 1.5% with skills only).
   */
  static calculateNpcBrokerFeeRate(
    brokerRelationsLevel: number = 5,
    factionStanding: number = 0.0,
    corpStanding: number = 0.0
  ): number {
    const br = Math.max(0, Math.min(5, Math.floor(brokerRelationsLevel)));
    const fs = Math.max(-10.0, Math.min(10.0, factionStanding));
    const cs = Math.max(-10.0, Math.min(10.0, corpStanding));
    const rawRate = 0.03 - (0.003 * br) - (0.0003 * fs) - (0.0002 * cs);
    return Math.max(0.01, Math.min(0.08, rawRate));
  }

  /**
   * Transport freight calculation.
   * If enable_transport_costs is false or rates are 0, returns strictly 0 ISK.
   */
  static calculateTransportCost(
    config: FinancialConfig,
    cargoM3: number,
    jumps: number,
    purchaseCost: number = 0
  ): number {
    if (config.enable_transport_costs === false) {
      return 0.0;
    }
    const m3Cost = (config.transport_cost_per_m3 || 0) * Math.max(0, cargoM3);
    const jumpCost = (config.transport_cost_per_jump || 0) * Math.max(0, jumps);
    const collateralCost = (config.collateral_fee_pct || 0) * Math.max(0, purchaseCost);
    return m3Cost + jumpCost + collateralCost;
  }

  static brokerCost(amount: number, brokerFeeRate: number): number {
    return Math.max(0, amount * brokerFeeRate);
  }

  static salesTaxCost(grossRevenue: number, salesTaxRate: number): number {
    return Math.max(0, grossRevenue * salesTaxRate);
  }

  static totalCost(
    purchaseCost: number,
    brokerFee: number,
    grossRevenue: number,
    salesTax: number,
    transportCost: number = 0
  ): number {
    return (
      purchaseCost +
      FeeCalculator.brokerCost(purchaseCost, brokerFee) +
      FeeCalculator.salesTaxCost(grossRevenue, salesTax) +
      transportCost
    );
  }

  static breakdown(
    purchaseCost: number,
    brokerFee: number,
    grossRevenue: number,
    salesTax: number,
    transportCost: number = 0
  ): FeeBreakdown {
    const bc = FeeCalculator.brokerCost(purchaseCost, brokerFee);
    const stc = FeeCalculator.salesTaxCost(grossRevenue, salesTax);
    return {
      purchase_cost: purchaseCost,
      broker_fee: brokerFee,
      broker_cost: bc,
      gross_revenue: grossRevenue,
      sales_tax: salesTax,
      sales_tax_cost: stc,
      total_cost: purchaseCost + bc + stc + transportCost,
    };
  }
}
