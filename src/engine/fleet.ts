import {
  EveCharacterSession,
  FinancialConfig,
  InterRegionalOpportunity,
  TradeFleetPlan,
  TradeFleetStep,
  FleetCharacterSummary,
  TradingFleetOverview,
  FleetRole,
  MarketHub,
} from '../types';
import { FeeEngine } from './fee';
import { roundIsk } from './money';
import { TreasuryEngine } from './treasury';

/**
 * 🚀 TradingFleetEngine — Pure Mathematical Multi-Character Fleet Engine
 *
 * Implements full EVE Online Multi-Character Ecosystem logic:
 * - Station Trader / Buyer alt at Source Hub (e.g. Jita 4-4)
 * - Hauler / Logistics pilot with cargo capacity (e.g. DST / Freighter)
 * - Station Trader / Seller alt at Destination Hub (e.g. Amarr VIII)
 * - Consolidated Fleet Capital & Escrow accounting
 * - Corporation Wallet Division Treasury integration
 * - Cross-Skill Tax & Fee calculation (Buyer's Broker Relations + Seller's Accounting)
 *
 * ⚠️ INVARIANT: ZERO side-effects, no network, no React hooks, no localStorage.
 */
export class TradingFleetEngine {
  /**
   * Transforms an EveCharacterSession into a normalized FleetCharacterSummary.
   */
  static toFleetSummary(session: EveCharacterSession): FleetCharacterSummary {
    return {
      character_id: session.character_id,
      character_name: session.character_name,
      portrait_url: session.portrait_url || `https://images.evetech.net/characters/${session.character_id}/portrait?size=128`,
      assigned_hub_id: session.assigned_hub_id,
      assigned_hub_name: session.assigned_hub_name,
      assigned_station_id: session.assigned_station_id,
      fleet_role: session.fleet_role || 'all_rounder',
      wallet_balance: typeof session.wallet_balance === 'number' ? session.wallet_balance : undefined,
      accounting_skill: Number.isFinite(session.accounting_skill) ? Number(session.accounting_skill) : 5,
      broker_relations_skill: Number.isFinite(session.broker_relations_skill) ? Number(session.broker_relations_skill) : 5,
      advanced_broker_relations_skill: Number.isFinite(session.advanced_broker_relations_skill) ? Number(session.advanced_broker_relations_skill) : 5,
      ship_cargo_capacity_m3: session.ship_cargo_capacity_m3 || 10000,
      is_active: Boolean(session.is_active),
    };
  }

  /**
   * Computes consolidated fleet overview metrics across all connected characters.
   */
  static computeFleetOverview(
    characters: EveCharacterSession[],
    snapshots: Record<number, any> = {},
    config?: FinancialConfig
  ): TradingFleetOverview {
    if (!characters || characters.length === 0) {
      const cfg = config || { available_capital: 1000000000 };
      const treasury = TreasuryEngine.resolveEffectiveCapital(cfg, []);
      return {
        total_characters: 0,
        active_character_id: null,
        consolidated_wallet_balance: 0,
        total_active_orders_count: 0,
        total_buy_orders_count: 0,
        total_sell_orders_count: 0,
        total_escrow_locked: 0,
        characters: [],
        hub_coverage: {},
        treasury_source_mode: treasury.source_mode,
        effective_trading_capital: treasury.effective_capital,
        corporation_wallet_division: treasury.division,
        corporation_wallet_balance: treasury.is_corporation ? treasury.effective_capital : undefined,
        corporation_name: treasury.corporation_name,
        treasury_label: treasury.label,
      };
    }

    const summaries = characters.map((c) => this.toFleetSummary(c));
    const activeChar = characters.find((c) => c.is_active) || characters[0];

    let consolidatedWallet = 0;
    let totalBuyOrders = 0;
    let totalSellOrders = 0;
    let totalEscrow = 0;
    const hubCoverage: Record<string, FleetCharacterSummary[]> = {};

    for (const char of characters) {
      const balance = typeof char.wallet_balance === 'number' ? char.wallet_balance : 0;
      consolidatedWallet += balance;

      // Extract orders count from session or snapshot
      const snap = snapshots[char.character_id];
      const activeOrders = snap?.active_orders || [];
      if (activeOrders.length > 0) {
        for (const ord of activeOrders) {
          if (ord.is_buy_order) {
            totalBuyOrders++;
            totalEscrow += ord.escrow || (ord.price * ord.volume_remain) || 0;
          } else {
            totalSellOrders++;
          }
        }
      } else if (char.active_orders_count) {
        totalBuyOrders += char.active_orders_count.buy_orders || 0;
        totalSellOrders += char.active_orders_count.sell_orders || 0;
      }

      // Map hub coverage
      if (char.assigned_hub_id) {
        if (!hubCoverage[char.assigned_hub_id]) {
          hubCoverage[char.assigned_hub_id] = [];
        }
        hubCoverage[char.assigned_hub_id].push(this.toFleetSummary(char));
      }
    }

    const cfg = config || { available_capital: consolidatedWallet, fleet_consolidated_capital: consolidatedWallet };
    const treasury = TreasuryEngine.resolveEffectiveCapital(cfg, characters, activeChar?.character_id);

    return {
      total_characters: characters.length,
      active_character_id: activeChar ? activeChar.character_id : null,
      consolidated_wallet_balance: roundIsk(consolidatedWallet),
      total_active_orders_count: totalBuyOrders + totalSellOrders,
      total_buy_orders_count: totalBuyOrders,
      total_sell_orders_count: totalSellOrders,
      total_escrow_locked: roundIsk(totalEscrow),
      characters: summaries,
      hub_coverage: hubCoverage,
      treasury_source_mode: treasury.source_mode,
      effective_trading_capital: treasury.effective_capital,
      corporation_wallet_division: treasury.division,
      corporation_wallet_balance: treasury.is_corporation ? treasury.effective_capital : undefined,
      corporation_name: treasury.corporation_name,
      treasury_label: treasury.label,
    };
  }

  /**
   * Deterministically assigns the best character for a specific fleet trading role.
   */
  static selectBestCharacterForRole(
    role: 'buyer' | 'hauler' | 'seller',
    hubId: string,
    characters: EveCharacterSession[],
    cargoNeededM3 = 0,
    capitalRequired = 0
  ): FleetCharacterSummary | undefined {
    if (!characters || characters.length === 0) return undefined;

    const scored = characters.map((char) => {
      let score = 0;
      const charRole = char.fleet_role || 'all_rounder';
      const isAssignedToHub = char.assigned_hub_id === hubId;

      if (role === 'buyer') {
        if (isAssignedToHub) score += 200;
        if (charRole === 'buyer') score += 100;
        if (charRole === 'all_rounder') score += 40;
        // Reward broker relations skill (0 to 5)
        score += (char.broker_relations_skill || 0) * 10;
        // Reward sufficient wallet balance
        if (typeof char.wallet_balance === 'number' && char.wallet_balance >= capitalRequired) {
          score += 50;
        }
      } else if (role === 'hauler') {
        if (charRole === 'hauler') score += 200;
        if (charRole === 'all_rounder') score += 40;
        const capacity = char.ship_cargo_capacity_m3 || 10000;
        if (cargoNeededM3 > 0 && capacity >= cargoNeededM3) {
          score += 150;
        } else if (capacity > 0) {
          score += (capacity / Math.max(1, cargoNeededM3)) * 50;
        }
      } else if (role === 'seller') {
        if (isAssignedToHub) score += 200;
        if (charRole === 'seller') score += 100;
        if (charRole === 'all_rounder') score += 40;
        // Reward accounting skill (0 to 5)
        score += (char.accounting_skill || 0) * 15;
        // Reward broker relations skill (0 to 5)
        score += (char.broker_relations_skill || 0) * 5;
      }

      if (char.is_active) score += 10;

      return { char, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0] ? this.toFleetSummary(scored[0].char) : undefined;
  }

  /**
   * Generates a complete 3-step Multi-Character Execution Plan:
   * 1. Achat Local (Buyer at source hub)
   * 2. Récolte & Fret (Hauler between hubs)
   * 3. Repost / Vente (Seller at destination hub)
   */
  static resolveFleetPlan(
    opp: Partial<InterRegionalOpportunity>,
    characters: EveCharacterSession[],
    config: FinancialConfig
  ): TradeFleetPlan {
    const buyHub = opp.buy_hub;
    const sellHub = opp.sell_hub;
    const buyHubId = buyHub?.id || 'jita';
    const sellHubId = sellHub?.id || 'amarr';
    const costs = opp.costs;
    const totalCargoVolume = opp.total_cargo_volume || 0;
    const totalAcquisitionCost = costs?.total_acquisition_cost || costs?.purchase_cost || 0;
    const quantity = opp.quantity_tradable || 1;

    const fleetOverview = this.computeFleetOverview(characters, {}, config);
    const hasCharacters = characters && characters.length > 0;

    const buyer = hasCharacters
      ? this.selectBestCharacterForRole('buyer', buyHubId, characters, 0, totalAcquisitionCost)
      : undefined;

    const hauler = hasCharacters
      ? this.selectBestCharacterForRole('hauler', buyHubId, characters, totalCargoVolume, 0)
      : undefined;

    const seller = hasCharacters
      ? this.selectBestCharacterForRole('seller', sellHubId, characters, 0, 0)
      : undefined;

    const isCrossCharacter = Boolean(
      buyer && seller && (buyer.character_id !== seller.character_id || (hauler && hauler.character_id !== buyer.character_id))
    );

    // Resolve treasury source & effective purchasing power
    const treasury = TreasuryEngine.resolveEffectiveCapital(config, characters, buyer?.character_id);

    let effectivePurchasingPower = treasury.effective_capital;
    let buyerHasSufficient = true;
    let buyerDeficit = 0;

    if (treasury.is_corporation) {
      buyerHasSufficient = effectivePurchasingPower >= totalAcquisitionCost;
      buyerDeficit = buyerHasSufficient ? 0 : roundIsk(totalAcquisitionCost - effectivePurchasingPower);
    } else {
      const buyerWallet = buyer?.wallet_balance;
      buyerHasSufficient = typeof buyerWallet === 'number' ? buyerWallet >= totalAcquisitionCost : true;
      buyerDeficit = typeof buyerWallet === 'number' && buyerWallet < totalAcquisitionCost
        ? roundIsk(totalAcquisitionCost - buyerWallet)
        : 0;
    }

    const haulerCapacity = hauler?.ship_cargo_capacity_m3 || config.max_cargo_m3 || 60000;
    const haulerCargoSufficient = totalCargoVolume <= haulerCapacity;
    const cargoUtilization = haulerCapacity > 0 ? Math.min(100, roundIsk((totalCargoVolume / haulerCapacity) * 100)) : 100;

    // Calculate specific cross-fees
    const buyerBrokerFeePct = buyer
      ? roundIsk(FeeEngine.calculateNpcBrokerFeeRate(buyer.broker_relations_skill, 0, 0) * 100)
      : roundIsk((config.broker_fee || 0.015) * 100);

    const sellerSalesTaxPct = seller
      ? roundIsk(FeeEngine.calculateSalesTaxRate(seller.accounting_skill) * 100)
      : roundIsk((config.sales_tax || 0.036) * 100);

    const sellerBrokerFeePct = seller
      ? roundIsk(FeeEngine.calculateNpcBrokerFeeRate(seller.broker_relations_skill, 0, 0) * 100)
      : roundIsk((config.broker_fee || 0.015) * 100);

    const jumps = opp.route?.jumps || 0;
    const routeSecurity = opp.route?.is_highsec_only ? '100% High-Sec' : 'Low-Sec détecté';

    const buyActionSummary = treasury.is_corporation
      ? `Acheter ${quantity.toLocaleString()} unité(s) à ${buyHub?.name || 'Source'} (Financement : ${treasury.label})`
      : `Acheter ${quantity.toLocaleString()} unité(s) à ${buyHub?.name || 'Source'} (${roundIsk(opp.effective_buy_price || 0).toLocaleString()} ISK/u)`;

    const steps: TradeFleetStep[] = [
      {
        step_number: 1,
        phase: 'BUY',
        title: buyer
          ? `Achat Local par ${buyer.character_name}${treasury.is_corporation ? ` [${treasury.corporation_name} Div.${treasury.division}]` : ''}`
          : 'Achat Local au Hub Source',
        assigned_character: buyer,
        location_id: buyHub?.station_id || 0,
        location_name: buyHub?.name || 'Hub Source',
        action_summary: buyActionSummary,
        fees_summary: `Courtage acheteur : ${buyerBrokerFeePct}% (${roundIsk(costs?.buy_broker_fee || 0).toLocaleString()} ISK)`,
        details: {
          quantity,
          unit_price: opp.effective_buy_price,
          total_isk: totalAcquisitionCost,
          fee_rate_pct: buyerBrokerFeePct,
          fee_cost: costs?.buy_broker_fee,
          has_sufficient_wallet: buyerHasSufficient,
          wallet_deficit_isk: buyerDeficit,
        },
      },
      {
        step_number: 2,
        phase: 'HAUL',
        title: hauler ? `Récolte & Fret par ${hauler.character_name}` : 'Récolte & Transport inter-hubs',
        assigned_character: hauler,
        location_id: buyHub?.station_id || 0,
        location_name: `${buyHub?.name || 'Source'} ➔ ${sellHub?.name || 'Destination'}`,
        action_summary: `Transporter ${roundIsk(totalCargoVolume).toLocaleString()} m³ sur ${jumps} sauts (${routeSecurity})`,
        fees_summary: costs?.transport_cost && costs.transport_cost > 0
          ? `Coût de transport estimé : ${roundIsk(costs.transport_cost).toLocaleString()} ISK`
          : 'Transport par flotte propre (0.00 ISK)',
        details: {
          cargo_volume_m3: totalCargoVolume,
          cargo_capacity_m3: haulerCapacity,
          cargo_utilization_pct: cargoUtilization,
          jumps,
          route_security: routeSecurity,
        },
      },
      {
        step_number: 3,
        phase: 'SELL',
        title: seller ? `Mise en Vente / Repost par ${seller.character_name}` : 'Mise en Vente à Destination',
        assigned_character: seller,
        location_id: sellHub?.station_id || 0,
        location_name: sellHub?.name || 'Hub Destination',
        action_summary: opp.strategy === 'relist'
          ? `Poser l'ordre de vente vendeur à ${sellHub?.name || 'Destination'} (${roundIsk(opp.effective_sell_price || 0).toLocaleString()} ISK/u)`
          : `Vente immédiate (Taker) à ${sellHub?.name || 'Destination'} (${roundIsk(opp.effective_sell_price || 0).toLocaleString()} ISK/u)`,
        fees_summary: `Taxe de vente (${sellerSalesTaxPct}%) : ${roundIsk(costs?.sales_tax || 0).toLocaleString()} ISK | Courtage (${sellerBrokerFeePct}%) : ${roundIsk(costs?.sell_broker_fee || 0).toLocaleString()} ISK`,
        details: {
          quantity,
          unit_price: opp.effective_sell_price,
          total_isk: costs?.net_revenue,
          fee_rate_pct: sellerSalesTaxPct + sellerBrokerFeePct,
          fee_cost: (costs?.sales_tax || 0) + (costs?.sell_broker_fee || 0),
        },
      },
    ];

    const notes: string[] = [];
    if (treasury.is_corporation) {
      notes.push(`Trésorerie Corporation active : Financement imputé sur ${treasury.label} (Solde : ${treasury.effective_capital.toLocaleString()} ISK).`);
    }
    if (isCrossCharacter && buyer && seller) {
      notes.push(`Écosystème multi-personnages actif : Achat via ${buyer.character_name} (${buyHub?.name}), Vente via ${seller.character_name} (${sellHub?.name}).`);
    }
    if (!buyerHasSufficient && buyerDeficit > 0) {
      const fundSource = treasury.is_corporation ? `le compte de corporation (${treasury.label})` : `${buyer?.character_name || 'l\'acheteur'}`;
      notes.push(`Trésorerie insuffisante : ${fundSource} présente un déficit de ${buyerDeficit.toLocaleString()} ISK pour cet achat.`);
    }
    if (!haulerCargoSufficient && hauler) {
      notes.push(`Capacité de transport dépassée : Volume requis ${totalCargoVolume.toLocaleString()} m³ > Soute ${hauler.character_name} (${haulerCapacity.toLocaleString()} m³).`);
    }

    return {
      is_fleet_enabled: hasCharacters && characters.length > 1,
      fleet_size: characters.length,
      buyer_character: buyer,
      hauler_character: hauler,
      seller_character: seller,
      steps,
      is_cross_character: isCrossCharacter,
      total_fleet_capital_available: treasury.effective_capital,
      buyer_wallet_balance: treasury.is_corporation ? treasury.effective_capital : buyer?.wallet_balance,
      buyer_has_sufficient_capital: buyerHasSufficient,
      buyer_capital_deficit: buyerDeficit,
      hauler_cargo_capacity_m3: haulerCapacity,
      hauler_cargo_sufficient: haulerCargoSufficient,
      notes,
    };
  }
}
