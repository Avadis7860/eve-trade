import {
  OpportunityEvidence,
  MarketSnapshotReference,
  FinancialInputsEvidence,
  FinancialOutputsEvidence,
  TypeResolutionResult,
  LocationResolutionResult,
  JumpRoute,
  TradeStrategy,
  DataHealthStatus,
  DataState,
  TypeResolutionStatus,
  RawMarketOrder,
  DataProvenance,
  OpportunityObservation,
  OpportunityOutcomeSnapshot,
  OutcomeHorizon,
  MarketDataQuality,
  InterRegionalOpportunity,
} from '../types';
import { normalizeOrderId, compareOrderIds } from './orderIdentity';
import { Sha256 } from '../domain/catalog/CatalogHashing';

export const CURRENT_CERTIFICATION_VERSION = '4-pillars-v1';

export interface EvidenceVerificationResult {
  is_valid: boolean;
  computed_hash: string;
  expected_hash: string;
  errors: string[];
  discrepancies: string[];
  pillar_checks: {
    market_data: boolean;
    catalog: boolean;
    universe: boolean;
    financial_engine: boolean;
  };
  pillar_status_checks: {
    market_data: boolean;
    catalog: boolean;
    universe: boolean;
    financial_engine: boolean;
  };
}

/**
 * Phase 2C — Pure Opportunity Evidence & Cryptographic Verification Engine.
 * Constructs, canonically serializes, hashes, and audits 4-pillar evidence snapshots.
 * Guarantees zero side-effects, deterministic hashing, and tamper-evident verification.
 */
export class OpportunityEvidenceEngine {
  /**
   * Computes a deterministic SHA-256 hash for a collection of raw market orders.
   * Orders are sorted strictly by `order_id` ascending to ensure order-independence.
   */
  static computeMarketSnapshotHash(orders: RawMarketOrder[]): string {
    if (!orders || orders.length === 0) {
      return Sha256.hash('EMPTY_SNAPSHOT');
    }

    const canonicalOrders = [...orders]
      .map((o) => ({ order: o, orderId: normalizeOrderId(o?.order_id) }))
      .filter((entry): entry is { order: RawMarketOrder; orderId: string } => Boolean(entry.orderId))
      .sort((a, b) => compareOrderIds(a.orderId, b.orderId))
      .map(({ order: o, orderId }) => ({
        duration: Number(o.duration || 0),
        is_buy_order: Boolean(o.is_buy_order),
        issued: String(o.issued || ''),
        location_id: Number(o.location_id || 0),
        min_volume: Number(o.min_volume || 1),
        order_id: orderId,
        order_range: String(o.order_range || 'region'),
        price: Math.round(Number(o.price || 0) * 100) / 100,
        region_id: Number(o.region_id || 0),
        system_id: Number(o.system_id || 0),
        type_id: Number(o.type_id || 0),
        volume_remain: Math.round(Number(o.volume_remain || 0)),
        volume_total: Math.round(Number(o.volume_total || 0)),
      }));

    return Sha256.hash(JSON.stringify(canonicalOrders));
  }

  /**
   * Canonicalizes an object tree recursively for deterministic serialization.
   * - Sorted object keys.
   * - Deterministic sorting for non-positional string arrays (e.g. warnings, blocking_reasons).
   * - Float precision normalization to 6 decimal places.
   * - Excludes undefined values and self-referential `evidence_hash`.
   */
  static canonicalize(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 0;
      // Normalize -0 to 0 and precision to 6 decimals
      const rounded = Math.round(value * 1e6) / 1e6;
      return Object.is(rounded, -0) ? 0 : rounded;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      // Check if this is an array of primitive strings where order has no semantic ranking
      const isStringArray = value.length > 0 && value.every((x) => typeof x === 'string');
      if (isStringArray) {
        return [...value].map((s) => String(s).trim()).sort();
      }
      return value.map((item) => this.canonicalize(item));
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const sortedKeys = Object.keys(obj)
        .filter((k) => k !== 'evidence_hash' && obj[k] !== undefined)
        .sort();

      const normalizedObj: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        normalizedObj[key] = this.canonicalize(obj[key]);
      }
      return normalizedObj;
    }

    return String(value);
  }

  /**
   * Produces a deterministic, whitespace-free canonical JSON string representation.
   */
  static serializeCanonical(evidence: Omit<OpportunityEvidence, 'evidence_hash'> | OpportunityEvidence): string {
    const canonical = this.canonicalize(evidence);
    return JSON.stringify(canonical);
  }

  /**
   * Computes the deterministic SHA-256 checksum of an OpportunityEvidence object.
   */
  static computeEvidenceHash(evidence: Omit<OpportunityEvidence, 'evidence_hash'> | OpportunityEvidence): string {
    const serialized = this.serializeCanonical(evidence);
    return Sha256.hash(serialized);
  }

  /**
   * Builds an immutable, signed OpportunityEvidence instance.
   */
  static buildEvidence(params: {
    opportunity_id: string;
    detected_at: string;
    certification_version?: string;
    certification_status: 'CERTIFIED' | 'DEGRADED' | 'REJECTED';
    is_actionable: boolean;
    type_id: number;
    source_market: MarketSnapshotReference;
    dest_market: MarketSnapshotReference;
    source_market_provenance?: DataProvenance;
    dest_market_provenance?: DataProvenance;
    source_market_hash?: string;
    dest_market_hash?: string;
    source_observation_id?: string;
    dest_observation_id?: string;
    catalog_version: string;
    catalog_checksum: string;
    type_resolution: TypeResolutionResult;
    source_location_resolution: LocationResolutionResult;
    dest_location_resolution: LocationResolutionResult;
    route_resolution: JumpRoute;
    financial_inputs: FinancialInputsEvidence;
    financial_outputs: FinancialOutputsEvidence;
    strategy: TradeStrategy;
    confidence: number;
    warnings: string[];
    blocking_reasons: string[];
    pillar_evaluations: {
      market_data: {
        status: 'PASS' | 'DEGRADED' | 'FAIL';
        health_source: DataHealthStatus;
        health_dest: DataHealthStatus;
        detail: string;
      };
      catalog: {
        status: 'PASS' | 'DEGRADED' | 'FAIL';
        type_id: number;
        status_code: TypeResolutionStatus;
        detail: string;
      };
      universe: {
        status: 'PASS' | 'DEGRADED' | 'FAIL';
        source_station_id: number;
        dest_station_id: number;
        detail: string;
      };
      financial_engine: {
        status: 'PASS' | 'DEGRADED' | 'FAIL';
        net_profit: number;
        roi: number;
        detail: string;
      };
    };
  }): OpportunityEvidence {
    const version = params.certification_version || CURRENT_CERTIFICATION_VERSION;

    const baseEvidence: Omit<OpportunityEvidence, 'evidence_hash'> = {
      opportunity_id: params.opportunity_id,
      detected_at: params.detected_at,
      certification_version: version,
      certification_status: params.certification_status,
      is_actionable: params.is_actionable,
      type_id: params.type_id,
      source_market: params.source_market,
      dest_market: params.dest_market,
      source_market_provenance: params.source_market_provenance,
      dest_market_provenance: params.dest_market_provenance,
      source_market_hash: params.source_market_hash,
      dest_market_hash: params.dest_market_hash,
      source_observation_id: params.source_observation_id,
      dest_observation_id: params.dest_observation_id,
      catalog_version: params.catalog_version,
      catalog_checksum: params.catalog_checksum,
      type_resolution: params.type_resolution,
      source_location_resolution: params.source_location_resolution,
      dest_location_resolution: params.dest_location_resolution,
      route_resolution: params.route_resolution,
      financial_inputs: params.financial_inputs,
      financial_outputs: params.financial_outputs,
      strategy: params.strategy,
      confidence: params.confidence,
      warnings: [...params.warnings],
      blocking_reasons: [...params.blocking_reasons],
      pillar_evaluations: {
        market_data: { ...params.pillar_evaluations.market_data },
        catalog: { ...params.pillar_evaluations.catalog },
        universe: { ...params.pillar_evaluations.universe },
        financial_engine: { ...params.pillar_evaluations.financial_engine },
      },
    };

    const evidence_hash = this.computeEvidenceHash(baseEvidence);

    return {
      ...baseEvidence,
      evidence_hash,
    };
  }

  /**
   * Verifies the cryptographic and logical integrity of an OpportunityEvidence object.
   * Performs deep auditing of the 4 pillars and ensures zero tampering occurred.
   */
  static verifyEvidence(evidence: OpportunityEvidence): EvidenceVerificationResult {
    const errors: string[] = [];
    const pillarChecks = {
      market_data: true,
      catalog: true,
      universe: true,
      financial_engine: true,
    };

    if (!evidence) {
      return {
        is_valid: false,
        computed_hash: '',
        expected_hash: '',
        errors: ['Evidence object is null or undefined'],
        discrepancies: ['Evidence object is null or undefined'],
        pillar_checks: { market_data: false, catalog: false, universe: false, financial_engine: false },
        pillar_status_checks: { market_data: false, catalog: false, universe: false, financial_engine: false },
      };
    }

    // 1. Cryptographic Hash Verification
    const computedHash = this.computeEvidenceHash(evidence);
    const expectedHash = evidence.evidence_hash;

    if (!expectedHash) {
      errors.push('Missing evidence_hash on evidence object');
    } else if (computedHash !== expectedHash) {
      errors.push(`Evidence Hash mismatch: expected ${expectedHash}, computed ${computedHash}`);
    }

    // 2. Certification Version Verification
    if (!evidence.certification_version) {
      errors.push('Missing certification_version');
    }

    // 3. Pillar 1: MarketData Invariants
    const mdPillar = evidence.pillar_evaluations?.market_data;
    if (!mdPillar) {
      errors.push('Missing market_data pillar evaluation');
      pillarChecks.market_data = false;
    } else {
      const srcHealth = evidence.source_market?.health_status;
      const dstHealth = evidence.dest_market?.health_status;

      if (srcHealth === 'ERROR' || dstHealth === 'ERROR') {
        if (mdPillar.status !== 'FAIL') {
          errors.push(`MarketData pillar status should be FAIL for ERROR health (source=${srcHealth}, dest=${dstHealth})`);
          pillarChecks.market_data = false;
        }
      } else if (srcHealth === 'STALE' || dstHealth === 'STALE' || srcHealth === 'PARTIAL' || dstHealth === 'PARTIAL') {
        if (mdPillar.status === 'PASS') {
          errors.push(`MarketData pillar status should be DEGRADED/FAIL for STALE or PARTIAL data`);
          pillarChecks.market_data = false;
        }
      }

      if (evidence.source_market?.type_id !== evidence.type_id || evidence.dest_market?.type_id !== evidence.type_id) {
        errors.push(`Market snapshots type_id mismatch with evidence type_id (${evidence.type_id})`);
        pillarChecks.market_data = false;
      }
    }

    // 4. Pillar 2: Catalog Invariants
    const catPillar = evidence.pillar_evaluations?.catalog;
    if (!catPillar) {
      errors.push('Missing catalog pillar evaluation');
      pillarChecks.catalog = false;
    } else {
      if (evidence.type_resolution?.type_id !== evidence.type_id) {
        errors.push(`Catalog type_resolution type_id (${evidence.type_resolution?.type_id}) does not match evidence type_id (${evidence.type_id})`);
        pillarChecks.catalog = false;
      }

      if (evidence.type_resolution?.status === 'TYPE_UNKNOWN' && catPillar.status !== 'FAIL') {
        errors.push('Catalog pillar must be FAIL when type is TYPE_UNKNOWN');
        pillarChecks.catalog = false;
      }

      if (evidence.catalog_checksum && evidence.type_resolution?.catalog_checksum) {
        if (evidence.catalog_checksum !== evidence.type_resolution.catalog_checksum) {
          errors.push('Catalog checksum mismatch between root evidence and type_resolution');
          pillarChecks.catalog = false;
        }
      }
    }

    // 5. Pillar 3: Universe Invariants
    const uniPillar = evidence.pillar_evaluations?.universe;
    if (!uniPillar) {
      errors.push('Missing universe pillar evaluation');
      pillarChecks.universe = false;
    } else {
      const srcLoc = evidence.source_location_resolution;
      const dstLoc = evidence.dest_location_resolution;
      const route = evidence.route_resolution;

      if (!srcLoc || !dstLoc || !route) {
        errors.push('Missing source/dest location resolution or route resolution');
        pillarChecks.universe = false;
      } else {
        if (srcLoc.status === 'LOCATION_UNKNOWN' || dstLoc.status === 'LOCATION_UNKNOWN') {
          if (uniPillar.status !== 'FAIL') {
            errors.push('Universe pillar must be FAIL when location is LOCATION_UNKNOWN');
            pillarChecks.universe = false;
          }
        }
        const routeStart = route.from_system_id;
        const routeEnd = route.to_system_id;
        if (routeStart && routeEnd && (routeStart !== srcLoc.system_id || routeEnd !== dstLoc.system_id)) {
          errors.push(`Route endpoints (${routeStart} -> ${routeEnd}) do not match location systems (${srcLoc.system_id} -> ${dstLoc.system_id})`);
          pillarChecks.universe = false;
        }
      }
    }

    // 6. Pillar 4: Financial Engine Invariants
    const finPillar = evidence.pillar_evaluations?.financial_engine;
    if (!finPillar) {
      errors.push('Missing financial_engine pillar evaluation');
      pillarChecks.financial_engine = false;
    } else {
      const finIn = evidence.financial_inputs;
      const finOut = evidence.financial_outputs;

      if (!finIn || !finOut) {
        errors.push('Missing financial inputs or outputs evidence');
        pillarChecks.financial_engine = false;
      } else {
        // Invariant: Non-negative tradable quantity
        if (finOut.quantity < 0) {
          errors.push('Tradable quantity cannot be negative');
          pillarChecks.financial_engine = false;
        }

        // Invariant: If transport costs disabled, transport_cost MUST be strictly 0.00 ISK
        if (!finIn.enable_transport_costs && finOut.transport_cost !== 0) {
          errors.push(`Transport cost must be 0.00 when enable_transport_costs is false, got ${finOut.transport_cost}`);
          pillarChecks.financial_engine = false;
        }

        // Invariant: Viability consistency
        if (!finOut.is_viable && finPillar.status === 'PASS' && finOut.net_profit <= 0) {
          errors.push('Financial engine pillar cannot be PASS when opportunity is unviable with net_profit <= 0');
          pillarChecks.financial_engine = false;
        }
      }
    }

    // 7. Overall Certification Consistency
    const hasFail =
      mdPillar?.status === 'FAIL' ||
      catPillar?.status === 'FAIL' ||
      uniPillar?.status === 'FAIL' ||
      finPillar?.status === 'FAIL';

    const hasDegraded =
      mdPillar?.status === 'DEGRADED' ||
      catPillar?.status === 'DEGRADED' ||
      uniPillar?.status === 'DEGRADED' ||
      finPillar?.status === 'DEGRADED';

    if (hasFail && evidence.certification_status === 'CERTIFIED') {
      errors.push('Certification status cannot be CERTIFIED when one or more pillars have FAIL status');
    }

    if (hasDegraded && !hasFail && evidence.certification_status === 'CERTIFIED') {
      errors.push('Certification status cannot be CERTIFIED when one or more pillars are DEGRADED (should be DEGRADED)');
    }

    const isValid = errors.length === 0;

    return {
      is_valid: isValid,
      computed_hash: computedHash,
      expected_hash: expectedHash || '',
      errors,
      discrepancies: errors,
      pillar_checks: pillarChecks,
      pillar_status_checks: pillarChecks,
    };
  }

  /**
   * Converts an evaluated InterRegionalOpportunity into an immutable, verifiable OpportunityObservation.
   * Links cryptographic evidence, market snapshots, provenance, and historical audit keys.
   */
  static createOpportunityObservation(
    opportunity: InterRegionalOpportunity,
    options?: {
      sourceObservationId?: string;
      destObservationId?: string;
      customTimestamp?: string;
    }
  ): OpportunityObservation {
    const timestamp = options?.customTimestamp || opportunity.detected_at || new Date().toISOString();
    const randSuffix = Math.random().toString(36).slice(2, 7);
    const obsId = `obs_opp_${opportunity.type_id}_${opportunity.buy_hub.id}_${opportunity.sell_hub.id}_${opportunity.strategy}_${Date.now()}_${randSuffix}`;

    const evidenceHash =
      opportunity.evidence?.evidence_hash ||
      opportunity.certification?.evidence_hash ||
      (opportunity.evidence ? this.computeEvidenceHash(opportunity.evidence) : undefined);

    const certVersion =
      opportunity.certification?.certification_version ||
      opportunity.evidence?.certification_version ||
      CURRENT_CERTIFICATION_VERSION;

    return {
      observation_id: obsId,
      opportunity_id: opportunity.id,
      timestamp,
      type_id: opportunity.type_id,
      type_name: opportunity.type_name,
      source_region_id: opportunity.buy_hub.region_id,
      dest_region_id: opportunity.sell_hub.region_id,
      source_hub_id: opportunity.buy_hub.id,
      dest_hub_id: opportunity.sell_hub.id,
      strategy: opportunity.strategy,
      buy_price: opportunity.effective_buy_price,
      sell_price: opportunity.effective_sell_price,
      quantity: opportunity.quantity_tradable,
      net_profit: opportunity.costs?.net_profit ?? 0,
      roi: opportunity.costs?.roi ?? 0,
      expected_days_to_sell: opportunity.expected_days_to_sell,
      capturable_profit: opportunity.capturable_profit,
      profit_per_day: opportunity.profit_per_day,
      overall_score: opportunity.scores?.overall_score ?? 0,
      liquidity_score: opportunity.scores?.liquidity_score ?? 0,
      stability_score: opportunity.scores?.stability_score ?? 0,
      data_confidence: opportunity.data_quality?.overall_confidence ?? 1.0,
      is_anomalous: Boolean(opportunity.is_anomalous),
      anomaly_reasons: opportunity.anomaly_reasons ? [...opportunity.anomaly_reasons] : [],
      bottleneck: opportunity.bottleneck || 'capital',
      
      certification: opportunity.certification,
      evidence: opportunity.evidence,
      evidence_hash: evidenceHash,
      certification_version: certVersion,

      source_market_hash: opportunity.evidence?.source_market_hash,
      dest_market_hash: opportunity.evidence?.dest_market_hash,
      source_observation_id: options?.sourceObservationId || opportunity.evidence?.source_observation_id,
      dest_observation_id: options?.destObservationId || opportunity.evidence?.dest_observation_id,
      catalog_version: opportunity.provenance?.catalog_version || opportunity.evidence?.catalog_version,
      catalog_checksum: opportunity.provenance?.catalog_checksum || opportunity.evidence?.catalog_checksum,
      route_jumps: opportunity.route?.jumps,
      route_is_highsec: opportunity.route?.is_highsec_only,
    };
  }

  /**
   * Verifies the cryptographic integrity and four-pillar consistency of an OpportunityObservation.
   */
  static verifyObservationIntegrity(observation: OpportunityObservation): EvidenceVerificationResult {
    if (!observation) {
      return {
        is_valid: false,
        computed_hash: '',
        expected_hash: '',
        errors: ['Observation object is null or undefined'],
        discrepancies: ['Observation object is null or undefined'],
        pillar_checks: { market_data: false, catalog: false, universe: false, financial_engine: false },
        pillar_status_checks: { market_data: false, catalog: false, universe: false, financial_engine: false },
      };
    }

    if (!observation.evidence) {
      return {
        is_valid: false,
        computed_hash: '',
        expected_hash: observation.evidence_hash || '',
        errors: ['Observation is missing embedded OpportunityEvidence'],
        discrepancies: ['Missing OpportunityEvidence'],
        pillar_checks: { market_data: false, catalog: false, universe: false, financial_engine: false },
        pillar_status_checks: { market_data: false, catalog: false, universe: false, financial_engine: false },
      };
    }

    const verification = this.verifyEvidence(observation.evidence);

    if (observation.evidence_hash && observation.evidence.evidence_hash !== observation.evidence_hash) {
      verification.is_valid = false;
      verification.errors.push(
        `Root observation evidence_hash (${observation.evidence_hash}) does not match embedded evidence hash (${observation.evidence.evidence_hash})`
      );
    }

    return verification;
  }

  /**
   * Evaluates the empirical outcome of an observation against updated market conditions.
   */
  static createOutcomeSnapshot(
    observation: OpportunityObservation,
    currentSourceOrders: RawMarketOrder[] = [],
    currentDestOrders: RawMarketOrder[] = [],
    horizon: OutcomeHorizon = '1h',
    sourceQuality?: MarketDataQuality,
    destQuality?: MarketDataQuality
  ): OpportunityOutcomeSnapshot {
    const recorded_at = new Date().toISOString();

    const isImmediate = observation.strategy === 'immediate';
    const currentSourceSellOrders = currentSourceOrders.filter((o) => !o.is_buy_order); // sell orders at source (where we buy)
    const currentDestExecutableOrders = isImmediate
      ? currentDestOrders.filter((o) => o.is_buy_order) // buy orders at dest to dump into
      : currentDestOrders.filter((o) => !o.is_buy_order); // sell orders at dest (our competition)

    const currentBuyPrice = currentSourceSellOrders.length > 0 ? Math.min(...currentSourceSellOrders.map((o) => o.price)) : 0;
    const currentSellPrice = currentDestExecutableOrders.length > 0
      ? (isImmediate
          ? Math.max(...currentDestExecutableOrders.map((o) => o.price))
          : Math.min(...currentDestExecutableOrders.map((o) => o.price)))
      : 0;

    const currentSpreadPct =
      currentBuyPrice > 0 && currentSellPrice > currentBuyPrice
        ? ((currentSellPrice - currentBuyPrice) / currentBuyPrice) * 100
        : 0;

    const initialSpreadPct =
      observation.buy_price > 0 && observation.sell_price > observation.buy_price
        ? ((observation.sell_price - observation.buy_price) / observation.buy_price) * 100
        : 0;

    const spreadDecayPct = initialSpreadPct > 0 ? ((initialSpreadPct - currentSpreadPct) / initialSpreadPct) * 100 : 0;

    const priceChangeSourcePct =
      currentBuyPrice > 0 && observation.buy_price > 0 ? ((currentBuyPrice - observation.buy_price) / observation.buy_price) * 100 : 0;
    const priceChangeDestPct =
      currentSellPrice > 0 && observation.sell_price > 0 ? ((currentSellPrice - observation.sell_price) / observation.sell_price) * 100 : 0;

    const stillActive = currentSpreadPct > 0 && currentSellPrice > currentBuyPrice;

    return {
      horizon,
      recorded_at,
      still_active: stillActive,
      current_spread_pct: Math.round(currentSpreadPct * 100) / 100,
      spread_decay_pct: Math.round(spreadDecayPct * 100) / 100,
      current_buy_price: currentBuyPrice,
      current_sell_price: currentSellPrice,
      price_change_source_pct: Math.round(priceChangeSourcePct * 100) / 100,
      price_change_dest_pct: Math.round(priceChangeDestPct * 100) / 100,
      source_quality: sourceQuality,
      dest_quality: destQuality,
      source_orders_count: currentSourceOrders.length,
      dest_orders_count: currentDestOrders.length,
    };
  }
}
