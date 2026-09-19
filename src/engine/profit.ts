import {
  ProfitResult,
  DetailedCostBreakdown,
  FinancialConfig,
  MarketLocationFeeProfile,
  TradeStrategy,
  ExecutionScenario,
  ScenarioFinancialResult,
} from '../types';
import { FeeEngine } from './fee';
import { safeDiv, roundIsk, clamp } from './money';

export interface ScenarioCalculationParams {
  scenario: ExecutionScenario;
  quantity: number;
  effective_buy_price: number;
  effective_sell_price: number;
  unit_volume?: number;
  jumps?: number;
  config: Partial<FinancialConfig>;
  buy_fee_profile?: Partial<MarketLocationFeeProfile>;
  sell_fee_profile?: Partial<MarketLocationFeeProfile>;
  relist_price_delta?: number;
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
   * Deterministic scenario execution calculator:
   *
   * SCENARIO A: 'taker_taker'
   *   - Buy: Taker (0.0% broker fee)
   *   - Sell: Taker (0.0% broker fee, Sales Tax applies)
   *
   * SCENARIO B: 'taker_maker' (relist / market haul sell order)
   *   - Buy: Taker (0.0% broker fee)
   *   - Sell: Maker (Sell Broker Fee applies, Sales Tax applies, Relist Fee if modified)
   *
   * SCENARIO C: 'maker_taker' (station buy order -> haul & dump)
   *   - Buy: Maker (Buy Broker Fee applies)
   *   - Sell: Taker (0.0% broker fee, Sales Tax applies)
   *
   * SCENARIO D: 'maker_maker' (station trading / buy order to sell order)
   *   - Buy: Maker (Buy Broker Fee applies)
   *   - Sell: Maker (Sell Broker Fee applies, Sales Tax applies)
   */
  static calculateScenario(params: ScenarioCalculationParams): ScenarioFinancialResult {
    const {
      scenario,
      quantity,
      effective_buy_price,
      effective_sell_price,
      unit_volume = 0.0,
      jumps = 0,
      config,
      buy_fee_profile,
      sell_fee_profile,
      relist_price_delta = 0,
    } = params;

    const q = Math.max(0, Math.floor(quantity));
    const buyPrice = Math.max(0, effective_buy_price);
    const sellPrice = Math.max(0, effective_sell_price);

    // If quantity is 0 or prices are 0, return clean zeroed breakdown
    if (q === 0 || buyPrice <= 0 || sellPrice <= 0) {
      return {
        scenario,
        quantity: q,
        effective_buy_price: buyPrice,
        effective_sell_price: sellPrice,
        gross_purchase_cost: 0.0,
        buy_broker_fee_cost: 0.0,
        transport_cost: 0.0,
        total_acquisition_cost: 0.0,
        gross_revenue: 0.0,
        sales_tax_cost: 0.0,
        sell_broker_fee_cost: 0.0,
        relist_fee_cost: 0.0,
        total_exit_fees: 0.0,
        net_revenue: 0.0,
        net_profit: 0.0,
        profit_per_unit: 0.0,
        roi: 0.0,
        margin: 0.0,
        capital_locked: 0.0,
        is_profitable: false,
      };
    }

    // Resolve rates
    const buyFeeRes = FeeEngine.resolveRates({ config, locationProfile: buy_fee_profile, isBuy: true });
    const sellFeeRes = FeeEngine.resolveRates({ config, locationProfile: sell_fee_profile, isBuy: false });

    const isBuyMaker = scenario === 'maker_taker' || scenario === 'maker_maker';
    const isSellMaker = scenario === 'taker_maker' || scenario === 'maker_maker';

    // 1. PURCHASE PHASE (Acquisition)
    const grossPurchaseCost = roundIsk(buyPrice * q);
    const buyBrokerRate = FeeEngine.getExecutionBrokerRate(isBuyMaker, buyFeeRes.broker_fee_rate);
    const buyBrokerFeeCost = FeeEngine.brokerCost(grossPurchaseCost, buyBrokerRate);

    // Transport logistics (strictly 0.00 if disabled)
    const totalCargoVolume = Math.max(0, unit_volume * q);
    const transportCost = FeeEngine.calculateTransportCost(
      config,
      totalCargoVolume,
      jumps,
      grossPurchaseCost
    );

    const totalAcquisitionCost = roundIsk(grossPurchaseCost + buyBrokerFeeCost + transportCost);

    // 2. EXIT & REVENUE PHASE
    const grossRevenue = roundIsk(sellPrice * q);
    const salesTaxRate = sellFeeRes.sales_tax_rate;
    const salesTaxCost = FeeEngine.salesTaxCost(grossRevenue, salesTaxRate);

    const sellBrokerRate = FeeEngine.getExecutionBrokerRate(isSellMaker, sellFeeRes.broker_fee_rate);
    const sellBrokerFeeCost = FeeEngine.brokerCost(grossRevenue, sellBrokerRate);

    // Relist fee (if applicable when updating maker order price)
    let relistFeeCost = 0.0;
    if (isSellMaker && relist_price_delta > 0) {
      const deltaValue = relist_price_delta * q;
      relistFeeCost = FeeEngine.brokerCost(deltaValue, sellFeeRes.relist_fee_rate);
    }

    const totalExitFees = roundIsk(salesTaxCost + sellBrokerFeeCost + relistFeeCost);
    const netRevenue = roundIsk(grossRevenue - totalExitFees);
    const netProfit = roundIsk(netRevenue - totalAcquisitionCost);

    const profitPerUnit = q > 0 ? safeDiv(netProfit, q) : 0.0;
    const roi = totalAcquisitionCost > 0 ? safeDiv(netProfit, totalAcquisitionCost) : 0.0;
    const margin = grossRevenue > 0 ? safeDiv(netProfit, grossRevenue) : 0.0;

    return {
      scenario,
      quantity: q,
      effective_buy_price: buyPrice,
      effective_sell_price: sellPrice,
      gross_purchase_cost: grossPurchaseCost,
      buy_broker_fee_cost: buyBrokerFeeCost,
      transport_cost: transportCost,
      total_acquisition_cost: totalAcquisitionCost,
      gross_revenue: grossRevenue,
      sales_tax_cost: salesTaxCost,
      sell_broker_fee_cost: sellBrokerFeeCost,
      relist_fee_cost: relistFeeCost,
      total_exit_fees: totalExitFees,
      net_revenue: netRevenue,
      net_profit: netProfit,
      profit_per_unit: roundIsk(profitPerUnit),
      roi,
      margin,
      capital_locked: totalAcquisitionCost,
      is_profitable: netProfit > 0,
      fee_resolution: sellFeeRes,
    };
  }

  /**
   * Standardized detailed profit breakdown (mapped to strategy 'immediate' or 'relist')
   */
  static calculateBreakdown(params: ProfitBreakdownParams): DetailedCostBreakdown {
    const scenario: ExecutionScenario = params.strategy === 'relist' ? 'taker_maker' : 'taker_taker';
    const res = ProfitEngine.calculateScenario({
      scenario,
      quantity: params.quantity,
      effective_buy_price: params.effective_buy_price,
      effective_sell_price: params.effective_sell_price,
      unit_volume: params.unit_volume,
      jumps: params.jumps,
      config: params.config,
      buy_fee_profile: params.buy_fee_profile,
      sell_fee_profile: params.sell_fee_profile,
    });

    return {
      gross_purchase_cost: res.gross_purchase_cost,
      buy_broker_fee_cost: res.buy_broker_fee_cost,
      transport_cost: res.transport_cost,
      total_acquisition_cost: res.total_acquisition_cost,
      gross_revenue: res.gross_revenue,
      sales_tax_cost: res.sales_tax_cost,
      sell_broker_fee_cost: res.sell_broker_fee_cost,
      total_exit_fees: res.total_exit_fees,
      net_revenue: res.net_revenue,
      net_profit: res.net_profit,
      profit_per_unit: res.profit_per_unit,
      roi: res.roi,
      margin: res.margin,
    };
  }

  /**
   * Deterministic primitive calculator.
   */
  static compute(
    purchasePrice: number,
    sellPrice: number,
    quantity: number,
    brokerFee: number,
    salesTax: number
  ): ProfitResult {
    const q = Math.max(0, Math.floor(quantity));
    const pBuy = Math.max(0, purchasePrice);
    const pSell = Math.max(0, sellPrice);

    if (q === 0) {
      return {
        quantity: 0,
        purchase_cost: 0.0,
        broker_cost: 0.0,
        gross_revenue: 0.0,
        sales_tax_cost: 0.0,
        total_cost: 0.0,
        net_profit: 0.0,
        profit_per_unit: 0.0,
        roi: 0.0,
        margin: 0.0,
        is_profitable: false,
      };
    }

    const purchaseCost = roundIsk(pBuy * q);
    const brokerCost = FeeEngine.brokerCost(purchaseCost, brokerFee);
    const grossRevenue = roundIsk(pSell * q);
    const salesTaxCost = FeeEngine.salesTaxCost(grossRevenue, salesTax);
    const totalCost = roundIsk(purchaseCost + brokerCost + salesTaxCost);
    const netProfit = roundIsk(grossRevenue - totalCost);

    return {
      quantity: q,
      purchase_cost: purchaseCost,
      broker_cost: brokerCost,
      gross_revenue: grossRevenue,
      sales_tax_cost: salesTaxCost,
      total_cost: totalCost,
      net_profit: netProfit,
      profit_per_unit: roundIsk(safeDiv(netProfit, q)),
      roi: safeDiv(netProfit, totalCost),
      margin: safeDiv(netProfit, grossRevenue),
      is_profitable: netProfit > 0,
    };
  }
}

export const ProfitCalculator = ProfitEngine;


