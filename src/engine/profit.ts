import { ProfitResult, DetailedCostBreakdown, FinancialConfig, MarketLocationFeeProfile, TradeStrategy } from '../types';
import { FeeEngine } from './fee';

function safeDiv(num: number, den: number): number {
  return den !== 0 ? num / den : 0.0;
}

export interface ProfitBreakdownParams {
  quantity: number;
  effective_buy_price: number;
  effective_sell_price: number;
  unit_volume: number;
  jumps: number;
  config: Partial<FinancialConfig>;
  strategy: TradeStrategy;
  buy_fee_profile?: Partial<MarketLocationFeeProfile>;
  sell_fee_profile?: Partial<MarketLocationFeeProfile>;
}

export class ProfitEngine {
  /**
   * Comprehensive, standardized profit breakdown aligning with all accounting formulas
   */
  static calculateBreakdown(params: ProfitBreakdownParams): DetailedCostBreakdown {
    const {
      quantity,
      effective_buy_price,
      effective_sell_price,
      unit_volume,
      jumps,
      config,
      strategy,
      buy_fee_profile,
      sell_fee_profile,
    } = params;

    const q = Math.max(0, Math.floor(quantity));
    const grossPurchaseCost = effective_buy_price * q;

    // Buy fees (if maker buy order, broker fee applies. For taker buying from sell order, broker fee = 0)
    const isMakerBuy = false; // Buying from market sell order = taker
    const buyBrokerRate = isMakerBuy
      ? (buy_fee_profile?.effective_broker_fee_rate ?? config.broker_fee ?? 0.015)
      : 0.0;
    const buyBrokerFeeCost = grossPurchaseCost * buyBrokerRate;

    // Transport costs
    const totalCargoVolume = unit_volume * q;
    const transportCost = FeeEngine.calculateTransportCost(
      config as FinancialConfig,
      totalCargoVolume,
      jumps,
      grossPurchaseCost
    );

    const totalAcquisitionCost = grossPurchaseCost + buyBrokerFeeCost + transportCost;

    // Gross revenue
    const grossRevenue = effective_sell_price * q;

    // Sales tax (always applies upon selling)
    const salesTaxRate = config.sales_tax !== undefined
      ? config.sales_tax
      : FeeEngine.calculateSalesTaxRate(config.accounting_level ?? 5);
    const salesTaxCost = grossRevenue * salesTaxRate;

    // Sell broker fee (applies for relist / maker sell order)
    const isMakerSell = strategy === 'relist';
    const sellBrokerRate = isMakerSell
      ? (sell_fee_profile?.effective_broker_fee_rate ?? config.broker_fee ?? 0.015)
      : 0.0;
    const sellBrokerFeeCost = isMakerSell ? grossRevenue * sellBrokerRate : 0.0;

    const totalExitFees = salesTaxCost + sellBrokerFeeCost;
    const netRevenue = grossRevenue - totalExitFees;
    const netProfit = netRevenue - totalAcquisitionCost;

    const profitPerUnit = q > 0 ? netProfit / q : 0;
    const roi = totalAcquisitionCost > 0 ? netProfit / totalAcquisitionCost : 0;
    const margin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

    return {
      gross_purchase_cost: grossPurchaseCost,
      buy_broker_fee_cost: buyBrokerFeeCost,
      transport_cost: transportCost,
      total_acquisition_cost: totalAcquisitionCost,
      gross_revenue: grossRevenue,
      sales_tax_cost: salesTaxCost,
      sell_broker_fee_cost: sellBrokerFeeCost,
      total_exit_fees: totalExitFees,
      net_revenue: netRevenue,
      net_profit: netProfit,
      profit_per_unit: profitPerUnit,
      roi,
      margin,
    };
  }

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

export const ProfitCalculator = ProfitEngine;

