import { FeeBreakdown } from '../types';

export class FeeCalculator {
  static brokerCost(purchaseCost: number, brokerFee: number): number {
    return purchaseCost * brokerFee;
  }

  static salesTaxCost(grossRevenue: number, salesTax: number): number {
    return grossRevenue * salesTax;
  }

  static totalCost(
    purchaseCost: number,
    brokerFee: number,
    grossRevenue: number,
    salesTax: number
  ): number {
    return (
      purchaseCost +
      FeeCalculator.brokerCost(purchaseCost, brokerFee) +
      FeeCalculator.salesTaxCost(grossRevenue, salesTax)
    );
  }

  static breakdown(
    purchaseCost: number,
    brokerFee: number,
    grossRevenue: number,
    salesTax: number
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
      total_cost: purchaseCost + bc + stc,
    };
  }
}
