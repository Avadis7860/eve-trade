import {
  FeeBreakdown,
  FinancialConfig,
  MarketLocationFeeProfile,
  FeeRateResolution,
} from '../types';
import { clamp, roundIsk, safeDiv } from './money';

export interface FeeResolutionParams {
  config: Partial<FinancialConfig>;
  locationProfile?: Partial<MarketLocationFeeProfile>;
  isBuy?: boolean;
  isMaker?: boolean;
}

export class FeeEngine {
  /**
   * EVE Online Sales Tax formula:
   * Base tax is 8.0%, reduced by 11% per Accounting skill level.
   * SalesTax% = 8.0% * (1.0 - 0.11 * AccountingLevel)
   * - Level 0: 8.00% (0.0800)
   * - Level 1: 7.12% (0.0712)
   * - Level 2: 6.24% (0.0624)
   * - Level 3: 5.36% (0.0536)
   * - Level 4: 4.48% (0.0448)
   * - Level 5: 3.60% (0.0360)
   */
  static calculateSalesTaxRate(accountingLevel: number = 5): number {
    const lvl = clamp(Math.floor(accountingLevel), 0, 5);
    const rate = 0.08 * (1.0 - 0.11 * lvl);
    return Math.round(rate * 1000000) / 1000000;
  }

  /**
   * EVE Online NPC Broker Fee formula:
   * Base fee is 3.0%, reduced by 0.3% per Broker Relations skill level,
   * 0.03% per Faction standing point, and 0.02% per Corporation standing point.
   * Broker Fee % = 3.0% - (0.3% * BrokerRelations) - (0.03% * FactionStanding) - (0.02% * CorpStanding)
   * Minimum NPC broker fee is 1.0% (clamped). Maximum is 8.0%.
   */
  static calculateNpcBrokerFeeRate(
    brokerRelationsLevel: number = 5,
    factionStanding: number = 0.0,
    corpStanding: number = 0.0
  ): number {
    const br = clamp(Math.floor(brokerRelationsLevel), 0, 5);
    const fs = clamp(factionStanding, -10.0, 10.0);
    const cs = clamp(corpStanding, -10.0, 10.0);
    const rawRate = 0.03 - (0.003 * br) - (0.0003 * fs) - (0.0002 * cs);
    const clampedRate = Math.max(0.01, Math.min(0.08, rawRate));
    return Math.round(clampedRate * 1000000) / 1000000;
  }

  static calculateStructureBrokerFeeRate(
    structureBaseFeeRate: number = 0.01,
    sccSurchargeRate: number = 0.005
  ): number {
    return Math.max(0.005, structureBaseFeeRate + sccSurchargeRate);
  }

  /**
   * EVE Online Player Structure (Citadel / Upwell) Broker Fee formula:
   * Broker Fee = SCC Surcharge + Structure Owner Fee
   * Base SCC Surcharge is 1.5%, reduced by 0.15% per Broker Relations level (min 0.5% or 0.75% at L5).
   * Structure Owner Fee is set by citadel profile (e.g. 0.0% to 5.0%, default 1.0%).
   */
  static calculateUpwellBrokerFeeRate(
    brokerRelationsLevel: number = 5,
    structureOwnerFeeRate: number = 0.01,
    sccSurchargeBaseRate: number = 0.015
  ): { total_rate: number; scc_surcharge_rate: number; structure_owner_rate: number } {
    const br = clamp(Math.floor(brokerRelationsLevel), 0, 5);
    const sccDiscount = 0.0015 * br;
    const sccRate = Math.max(0.005, sccSurchargeBaseRate - sccDiscount);
    const ownerRate = Math.max(0.0, structureOwnerFeeRate);
    const total = Math.max(0.005, sccRate + ownerRate);
    return {
      total_rate: Math.round(total * 1000000) / 1000000,
      scc_surcharge_rate: Math.round(sccRate * 1000000) / 1000000,
      structure_owner_rate: Math.round(ownerRate * 1000000) / 1000000,
    };
  }

  /**
   * Relist Fee (Advanced Broker Relations):
   * Modifying an active order incurs a fee with a 5% discount per skill level.
   * - Level 0: 0% discount (100% of broker fee)
   * - Level 5: 25% discount (75% of broker fee)
   */
  static calculateRelistFeeRate(
    brokerFeeRate: number,
    advancedBrokerRelationsLevel: number = 5
  ): number {
    const advBr = clamp(Math.floor(advancedBrokerRelationsLevel), 0, 5);
    const discount = 0.05 * advBr;
    const rate = Math.max(0.001, brokerFeeRate * (1.0 - discount));
    return Math.round(rate * 1000000) / 1000000;
  }

  /**
   * Resolves effective fee rates distinguishing Game Mechanics from User Overrides.
   */
  static resolveRates(params: FeeResolutionParams): FeeRateResolution {
    const { config, locationProfile } = params;

    // 1. Sales Tax Resolution
    const isAlpha = Boolean(config.is_alpha_clone);
    const accountingLvl = isAlpha ? Math.min(3, config.accounting_level ?? 5) : (config.accounting_level ?? 5);
    const officialSalesTax = FeeEngine.calculateSalesTaxRate(accountingLvl);
    let effectiveSalesTax = officialSalesTax;
    let salesTaxSource: 'skills_game_mechanics' | 'user_override' = 'skills_game_mechanics';

    if (config.use_custom_fees && config.custom_sales_tax_pct !== undefined && config.custom_sales_tax_pct >= 0) {
      effectiveSalesTax = config.custom_sales_tax_pct / 100;
      salesTaxSource = 'user_override';
    } else if (config.sales_tax !== undefined && config.sales_tax >= 0) {
      effectiveSalesTax = config.sales_tax;
      if (Math.abs(effectiveSalesTax - officialSalesTax) > 0.0001) {
        salesTaxSource = 'user_override';
      }
    }

    // 2. Broker Fee Resolution
    const brLvl = isAlpha ? Math.min(3, config.broker_relations_level ?? 5) : (config.broker_relations_level ?? 5);
    const fs = config.faction_standing ?? 0.0;
    const cs = config.corp_standing ?? 0.0;
    const isCitadel = locationProfile?.is_citadel || locationProfile?.is_player_structure || false;

    let officialBrokerFee = 0.015;
    let sccRate: number | undefined;
    let ownerRate: number | undefined;
    let brokerFeeSource: 'skills_standings_mechanics' | 'upwell_mechanics' | 'user_override' = 'skills_standings_mechanics';

    if (isCitadel) {
      const upwell = FeeEngine.calculateUpwellBrokerFeeRate(
        brLvl,
        locationProfile?.base_broker_fee_rate ?? 0.01,
        locationProfile?.scc_surcharge_rate ?? 0.015
      );
      officialBrokerFee = upwell.total_rate;
      sccRate = upwell.scc_surcharge_rate;
      ownerRate = upwell.structure_owner_rate;
      brokerFeeSource = 'upwell_mechanics';
    } else {
      officialBrokerFee = FeeEngine.calculateNpcBrokerFeeRate(brLvl, fs, cs);
      brokerFeeSource = 'skills_standings_mechanics';
    }

    let effectiveBrokerFee = officialBrokerFee;
    if (config.use_custom_fees && config.custom_broker_fee_pct !== undefined && config.custom_broker_fee_pct >= 0) {
      effectiveBrokerFee = config.custom_broker_fee_pct / 100;
      brokerFeeSource = 'user_override';
    } else if (config.broker_fee !== undefined && config.broker_fee >= 0) {
      effectiveBrokerFee = config.broker_fee;
      if (Math.abs(effectiveBrokerFee - officialBrokerFee) > 0.0001) {
        brokerFeeSource = 'user_override';
      }
    }

    // 3. Relist Fee
    const advBrLvl = isAlpha ? 0 : (config.advanced_broker_relations_level ?? 5);
    const relistRate = FeeEngine.calculateRelistFeeRate(effectiveBrokerFee, advBrLvl);

    const desc = `${isCitadel ? 'Upwell Structure' : 'NPC Station'} [Sales Tax: ${(effectiveSalesTax * 100).toFixed(2)}% (${salesTaxSource}), Broker Fee: ${(effectiveBrokerFee * 100).toFixed(2)}% (${brokerFeeSource})]`;

    return {
      sales_tax_rate: effectiveSalesTax,
      sales_tax_source: salesTaxSource,
      sales_tax_official_calculated: officialSalesTax,
      broker_fee_rate: effectiveBrokerFee,
      broker_fee_source: brokerFeeSource,
      broker_fee_official_calculated: officialBrokerFee,
      relist_fee_rate: relistRate,
      scc_surcharge_rate: sccRate,
      structure_owner_fee_rate: ownerRate,
      description: desc,
    };
  }

  /**
   * Transport freight calculation.
   * If enable_transport_costs is false, returns STRICTLY 0.00 ISK.
   * Otherwise sums volumetric freight, jump freight, collateral fee, and fixed logistics fee.
   */
  static calculateTransportCost(
    config: Partial<FinancialConfig>,
    cargoM3: number,
    jumps: number,
    purchaseCost: number = 0
  ): number {
    if (config.enable_transport_costs === false) {
      return 0.0;
    }
    const safeCargo = Math.max(0, cargoM3);
    const safeJumps = Math.max(0, jumps);
    const safePurchase = Math.max(0, purchaseCost);

    const m3Cost = (config.transport_cost_per_m3 || 0) * safeCargo;
    const jumpCost = (config.transport_cost_per_jump || 0) * safeJumps;
    const collateralCost = (config.collateral_fee_pct || 0) * safePurchase;
    const fixedFee = config.transport_fixed_fee || 0;

    const total = m3Cost + jumpCost + collateralCost + fixedFee;
    return roundIsk(Math.max(0, total));
  }

  /**
   * Determines effective broker rate according to role (Taker = 0.0%, Maker = effectiveBrokerRate).
   */
  static getExecutionBrokerRate(isMaker: boolean, resolvedBrokerRate: number): number {
    return isMaker ? Math.max(0, resolvedBrokerRate) : 0.0;
  }

  static brokerCost(amount: number, brokerFeeRate: number): number {
    return roundIsk(Math.max(0, amount * brokerFeeRate));
  }

  static salesTaxCost(grossRevenue: number, salesTaxRate: number): number {
    return roundIsk(Math.max(0, grossRevenue * salesTaxRate));
  }

  static totalCost(
    purchaseCost: number,
    brokerFee: number,
    grossRevenue: number,
    salesTax: number,
    transportCost: number = 0
  ): number {
    return roundIsk(
      purchaseCost +
      FeeEngine.brokerCost(purchaseCost, brokerFee) +
      FeeEngine.salesTaxCost(grossRevenue, salesTax) +
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
    const bc = FeeEngine.brokerCost(purchaseCost, brokerFee);
    const stc = FeeEngine.salesTaxCost(grossRevenue, salesTax);
    return {
      purchase_cost: roundIsk(purchaseCost),
      broker_fee: brokerFee,
      broker_cost: bc,
      gross_revenue: roundIsk(grossRevenue),
      sales_tax: salesTax,
      sales_tax_cost: stc,
      total_cost: roundIsk(purchaseCost + bc + stc + transportCost),
    };
  }
}

/**
 * Backwards compatible alias
 */
export const FeeCalculator = FeeEngine;


