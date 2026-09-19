import { ProfitResult } from '../types';

function safeDiv(num: number, den: number): number {
  return den !== 0 ? num / den : 0.0;
}

export class ProfitCalculator {
  /**
   * Section 9 finance engine. Takes primitives, returns a deterministic result.
   */
  static compute(
    purchasePrice: number,
    sellPrice: number,
    quantity: number,
    brokerFee: number,
    salesTax: number
  ): ProfitResult {
    const q = Math.max(0, Math.floor(quantity));
    const purchaseCost = purchasePrice * q;
    const brokerCost = purchaseCost * brokerFee;
    const grossRevenue = sellPrice * q;
    const salesTaxCost = grossRevenue * salesTax;
    const totalCost = purchaseCost + brokerCost + salesTaxCost;
    const netProfit = grossRevenue - totalCost;

    return {
      quantity: q,
      purchase_cost: purchaseCost,
      broker_cost: brokerCost,
      gross_revenue: grossRevenue,
      sales_tax_cost: salesTaxCost,
      total_cost: totalCost,
      net_profit: netProfit,
      profit_per_unit: safeDiv(netProfit, q),
      roi: safeDiv(netProfit, totalCost),
      margin: safeDiv(netProfit, grossRevenue),
      is_profitable: netProfit > 0,
    };
  }
}
