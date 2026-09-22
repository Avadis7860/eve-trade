import { normalizeOrderId } from './orderIdentity';

import {
  OpportunityObservation,
  ExecutionTransactionRef,
  CorrelationMatchLevel,
  CorrelationCriterionResult,
  TransactionCorrelationCandidate,
  TransactionCorrelationResult,
  CorrelationEngineOptions,
} from '../types';

/**
 * Static dictionary of Major Market Hub locations in New Eden.
 * Pure, deterministic mapping to avoid network or runtime dependency.
 */
const STATIC_HUB_LOCATIONS: Readonly<Record<string, { readonly station_id: number; readonly system_id: number; readonly region_id: number }>> = Object.freeze({
  jita: Object.freeze({ station_id: 60003760, system_id: 30000142, region_id: 10000002 }),
  amarr: Object.freeze({ station_id: 60008494, system_id: 30002187, region_id: 10000043 }),
  dodixie: Object.freeze({ station_id: 60011866, system_id: 30002659, region_id: 10000032 }),
  rens: Object.freeze({ station_id: 60004588, system_id: 30002510, region_id: 10000030 }),
  hek: Object.freeze({ station_id: 60005686, system_id: 30002053, region_id: 10000042 }),
});

/**
 * Known station to region mapping for fast pure location resolution.
 */
const KNOWN_STATION_REGIONS: Readonly<Record<number, number>> = Object.freeze({
  60003760: 10000002, // Jita IV-4 (The Forge)
  60003761: 10000002, // Jita IV-5 (The Forge)
  60008494: 10000043, // Amarr VIII (Domain)
  60011866: 10000032, // Dodixie IX-20 (Sinq Laison)
  60004588: 10000030, // Rens VI-8 (Heimatar)
  60005686: 10000042, // Hek VIII-12 (Metropolis)
  60011728: 10000002, // Perimeter (The Forge)
  60001858: 10000032, // Oursulaert III (Sinq Laison)
  60001861: 10000032, // Villore VI (Sinq Laison)
  60009514: 10000032, // Stacmon V (Sinq Laison)
});

const DEFAULT_STRONG_PRICE_TOLERANCE_PCT = 0.02; // 2.0%
const DEFAULT_PROBABLE_PRICE_TOLERANCE_PCT = 0.10; // 10.0%
const DEFAULT_PRE_OBSERVATION_LEEWAY_MS = 600_000; // 10 minutes
const DEFAULT_MAX_BUY_WINDOW_MS = 86_400_000; // 24 hours
const DEFAULT_MAX_SELL_WINDOW_MS = 7 * 86_400_000; // 7 days
const DEFAULT_AMBIGUITY_SCORE_THRESHOLD = 5.0; // Score points

/**
 * Safely parse ISO timestamp to epoch milliseconds.
 * Returns null if invalid or NaN.
 */
function parseTimestampMs(isoString: string): number | null {
  if (!isoString || typeof isoString !== 'string') return null;
  const ms = Date.parse(isoString);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolves station location or region for a given hub identifier.
 */
function resolveHubStationAndRegion(
  hubId: string,
  regionIdFallback?: number
): { station_id?: number; region_id?: number } {
  if (!hubId) return { region_id: regionIdFallback };
  const normalized = hubId.trim().toLowerCase();
  const hub = STATIC_HUB_LOCATIONS[normalized];
  if (hub) {
    return { station_id: hub.station_id, region_id: hub.region_id };
  }
  return { region_id: regionIdFallback };
}

/**
 * Checks if a transaction location matches the expected hub or region.
 */
export function evaluateLocationMatch(
  transactionLocationId: number,
  expectedStationId?: number,
  expectedRegionId?: number,
  locationResolver?: (locId: number) => { region_id?: number; system_id?: number; station_id?: number } | undefined,
  evidenceOrderLocationIds?: readonly number[]
): { matchesExactStation: boolean; matchesRegion: boolean; reason: string } {
  if (!Number.isFinite(transactionLocationId) || transactionLocationId <= 0) {
    return {
      matchesExactStation: false,
      matchesRegion: false,
      reason: `Invalid transaction location ID: ${transactionLocationId}`,
    };
  }

  // 1. Exact Station Match via expected hub station or evidence orders
  if (expectedStationId && transactionLocationId === expectedStationId) {
    return {
      matchesExactStation: true,
      matchesRegion: true,
      reason: `Exact hub station match (location_id: ${transactionLocationId})`,
    };
  }

  if (evidenceOrderLocationIds && evidenceOrderLocationIds.includes(transactionLocationId)) {
    return {
      matchesExactStation: true,
      matchesRegion: true,
      reason: `Exact evidence snapshot order location match (location_id: ${transactionLocationId})`,
    };
  }

  // 2. Region Match via resolver or known static mapping
  let resolvedRegionId: number | undefined;
  if (locationResolver) {
    const res = locationResolver(transactionLocationId);
    resolvedRegionId = res?.region_id;
  }
  if (!resolvedRegionId && KNOWN_STATION_REGIONS[transactionLocationId]) {
    resolvedRegionId = KNOWN_STATION_REGIONS[transactionLocationId];
  }

  if (expectedRegionId && resolvedRegionId && resolvedRegionId === expectedRegionId) {
    return {
      matchesExactStation: false,
      matchesRegion: true,
      reason: `Regional match in region ${expectedRegionId} (station ${transactionLocationId} differs from expected hub ${expectedStationId ?? 'unknown'})`,
    };
  }

  return {
    matchesExactStation: false,
    matchesRegion: false,
    reason: `Location mismatch: location_id ${transactionLocationId} does not match expected station ${expectedStationId ?? 'unknown'} or region ${expectedRegionId ?? 'unknown'}`,
  };
}

/**
 * Evaluates temporal compatibility between a transaction and an observation.
 */
export function evaluateTemporalMatch(
  transactionTimestamp: string,
  observationTimestamp: string,
  isBuy: boolean,
  options?: CorrelationEngineOptions
): { passed: boolean; score: number; deltaMs: number | null; reason: string } {
  const txMs = parseTimestampMs(transactionTimestamp);
  const obsMs = parseTimestampMs(observationTimestamp);

  if (txMs === null || obsMs === null) {
    return {
      passed: false,
      score: 0,
      deltaMs: null,
      reason: `Invalid or unparseable timestamp: tx='${transactionTimestamp}', obs='${observationTimestamp}'`,
    };
  }

  const deltaMs = txMs - obsMs;
  const leewayMs = options?.pre_observation_leeway_ms ?? DEFAULT_PRE_OBSERVATION_LEEWAY_MS;
  const maxWindowMs = isBuy
    ? (options?.max_buy_window_ms ?? DEFAULT_MAX_BUY_WINDOW_MS)
    : (options?.max_sell_window_ms ?? DEFAULT_MAX_SELL_WINDOW_MS);

  // Before window
  if (deltaMs < -leewayMs) {
    return {
      passed: false,
      score: 0,
      deltaMs,
      reason: `Transaction timestamp precedes observation by more than allowable leeway (${Math.round(-deltaMs / 1000)}s > ${Math.round(leewayMs / 1000)}s)`,
    };
  }

  // After window
  if (deltaMs > maxWindowMs) {
    return {
      passed: false,
      score: 0,
      deltaMs,
      reason: `Transaction timestamp exceeds observation window (${(deltaMs / 1000 / 3600).toFixed(1)}h > ${(maxWindowMs / 1000 / 3600).toFixed(1)}h)`,
    };
  }

  // Within window (including boundaries)
  let score = 1.0;
  if (deltaMs >= 0 && deltaMs <= 2 * 3600 * 1000) {
    // Optimal window: 0 to 2 hours after observation
    score = 1.0;
  } else if (deltaMs < 0) {
    // Within acceptable pre-observation leeway (e.g. clock skew)
    score = 0.9;
  } else {
    // Gradual decay towards boundary
    const frac = deltaMs / maxWindowMs;
    score = Math.max(0.5, 1.0 - 0.4 * frac);
  }

  return {
    passed: true,
    score,
    deltaMs,
    reason: `Transaction timestamp within valid execution window (${(deltaMs / 1000 / 60).toFixed(1)} min relative to observation)`,
  };
}

/**
 * Evaluates price deviation between transaction unit price and expected opportunity price.
 */
export function evaluatePriceMatch(
  transactionUnitPrice: number,
  expectedPrice: number,
  options?: CorrelationEngineOptions
): { passed: boolean; score: number; deviationPct: number; reason: string } {
  if (!Number.isFinite(transactionUnitPrice) || transactionUnitPrice <= 0) {
    return {
      passed: false,
      score: 0,
      deviationPct: 0,
      reason: `Non-positive or non-finite transaction unit price: ${transactionUnitPrice}`,
    };
  }

  if (!Number.isFinite(expectedPrice) || expectedPrice <= 0) {
    return {
      passed: false,
      score: 0,
      deviationPct: 0,
      reason: `Non-positive or non-finite expected observation price: ${expectedPrice}`,
    };
  }

  const strongTol = options?.strong_price_tolerance_pct ?? DEFAULT_STRONG_PRICE_TOLERANCE_PCT;
  const probableTol = options?.probable_price_tolerance_pct ?? DEFAULT_PROBABLE_PRICE_TOLERANCE_PCT;

  const deviationPct = Math.abs(transactionUnitPrice - expectedPrice) / expectedPrice;

  if (deviationPct <= strongTol) {
    return {
      passed: true,
      score: 1.0,
      deviationPct,
      reason: `Price within strong tolerance (${(deviationPct * 100).toFixed(2)}% <= ${(strongTol * 100).toFixed(2)}%)`,
    };
  }

  if (deviationPct <= probableTol) {
    // Linear decay between strong and probable tolerance
    const range = probableTol - strongTol;
    const excess = deviationPct - strongTol;
    const factor = range > 0 ? excess / range : 1.0;
    const score = Math.max(0.5, 1.0 - 0.4 * factor);
    return {
      passed: true,
      score,
      deviationPct,
      reason: `Price within probable tolerance (${(deviationPct * 100).toFixed(2)}% <= ${(probableTol * 100).toFixed(2)}%)`,
    };
  }

  return {
    passed: false,
    score: 0,
    deviationPct,
    reason: `Price deviation exceeds tolerance (${(deviationPct * 100).toFixed(2)}% > ${(probableTol * 100).toFixed(2)}%)`,
  };
}

/**
 * Evaluates a single transaction against an observation and calculates all matching criteria.
 */
export function evaluateCandidate(
  transaction: ExecutionTransactionRef,
  observation: OpportunityObservation,
  options?: CorrelationEngineOptions
): TransactionCorrelationCandidate {
  const criteria: CorrelationCriterionResult[] = [];
  const reasons: string[] = [];

  // 1. Direct Link Check
  const explicitMappedObsId = options?.direct_mappings?.[transaction.transaction_id];
  const isDirect =
    (transaction.observation_id && transaction.observation_id === observation.observation_id) ||
    (transaction.opportunity_id && transaction.opportunity_id === observation.opportunity_id) ||
    (explicitMappedObsId && (explicitMappedObsId === observation.observation_id || explicitMappedObsId === observation.opportunity_id));

  if (isDirect) {
    const directCriterion: CorrelationCriterionResult = Object.freeze({
      criterion: 'DIRECT_LINK',
      passed: true,
      score: 1.0,
      weight: 100,
      reason: 'Explicit direct relation between transaction and opportunity/observation',
    });
    reasons.push('Direct match established via verified transaction reference or explicit mapping.');
    return Object.freeze({
      observation_id: observation.observation_id,
      opportunity_id: observation.opportunity_id,
      match_level: 'DIRECT_MATCH',
      total_score: 100,
      criteria: Object.freeze([directCriterion]),
      reasons: Object.freeze(reasons),
    });
  }

  // 2. Identity (Type ID)
  const isTypeMatch = transaction.type_id === observation.type_id;
  const identityReason = isTypeMatch
    ? `Type ID matches exactly (${transaction.type_id})`
    : `Type ID mismatch (transaction=${transaction.type_id}, observation=${observation.type_id})`;
  criteria.push(
    Object.freeze({
      criterion: 'IDENTITY',
      passed: isTypeMatch,
      score: isTypeMatch ? 1.0 : 0,
      weight: 25,
      reason: identityReason,
    })
  );
  if (!isTypeMatch) {
    reasons.push(identityReason);
  }

  // 3. Direction
  // Buy transaction -> Acquisition (Source leg)
  // Sell transaction -> Disposal (Destination leg)
  const isBuy = Boolean(transaction.is_buy);
  const directionReason = isBuy
    ? 'Buy transaction evaluated against source acquisition leg'
    : 'Sell transaction evaluated against destination disposal leg';
  criteria.push(
    Object.freeze({
      criterion: 'DIRECTION',
      passed: true,
      score: 1.0,
      weight: 10,
      reason: directionReason,
    })
  );

  // 4. Location
  const expectedHubId = isBuy ? observation.source_hub_id : observation.dest_hub_id;
  const expectedRegionId = isBuy ? observation.source_region_id : observation.dest_region_id;
  const hubLoc = resolveHubStationAndRegion(expectedHubId, expectedRegionId);

  // Extract evidence order locations if available (extended snapshot or resolved locations)
  const extendedEvidence = observation.evidence as Record<string, any> | undefined;
  const evidenceOrders: any[] | undefined = isBuy
    ? extendedEvidence?.market_data?.source_snapshot?.orders
    : extendedEvidence?.market_data?.dest_snapshot?.orders;

  const resolvedLocId = isBuy
    ? observation.evidence?.source_location_resolution?.location_id
    : observation.evidence?.dest_location_resolution?.location_id;

  const extractedLocations: number[] = evidenceOrders
    ? evidenceOrders
        .map((o: { location_id?: number | string }) => Number(o.location_id))
        .filter((id: number) => !isNaN(id) && id > 0)
    : [];
  if (resolvedLocId && resolvedLocId > 0 && !extractedLocations.includes(resolvedLocId)) {
    extractedLocations.push(resolvedLocId);
  }
  const evidenceLocationIds = extractedLocations.length > 0 ? extractedLocations : undefined;

  const locEval = evaluateLocationMatch(
    transaction.location_id,
    hubLoc.station_id,
    expectedRegionId,
    options?.location_resolver,
    evidenceLocationIds
  );

  const locationScore = locEval.matchesExactStation ? 1.0 : locEval.matchesRegion ? 0.5 : 0;
  criteria.push(
    Object.freeze({
      criterion: 'LOCATION',
      passed: locEval.matchesExactStation || locEval.matchesRegion,
      score: locationScore,
      weight: 25,
      reason: locEval.reason,
    })
  );
  if (!locEval.matchesExactStation && !locEval.matchesRegion) {
    reasons.push(locEval.reason);
  }

  // 5. Temporal
  const tempEval = evaluateTemporalMatch(
    transaction.timestamp,
    observation.timestamp,
    isBuy,
    options
  );
  criteria.push(
    Object.freeze({
      criterion: 'TEMPORAL',
      passed: tempEval.passed,
      score: tempEval.score,
      weight: 15,
      reason: tempEval.reason,
    })
  );
  if (!tempEval.passed) {
    reasons.push(tempEval.reason);
  }

  // 6. Price
  const expectedPrice = isBuy ? observation.buy_price : observation.sell_price;
  const priceEval = evaluatePriceMatch(transaction.unit_price, expectedPrice, options);
  criteria.push(
    Object.freeze({
      criterion: 'PRICE',
      passed: priceEval.passed,
      score: priceEval.score,
      weight: 20,
      reason: priceEval.reason,
    })
  );
  if (!priceEval.passed) {
    reasons.push(priceEval.reason);
  }

  // 7. Quantity Compatibility
  let quantityPassed = true;
  let quantityScore = 1.0;
  let quantityReason = '';
  if (!Number.isFinite(transaction.quantity) || transaction.quantity <= 0) {
    quantityPassed = false;
    quantityScore = 0;
    quantityReason = `Non-positive quantity: ${transaction.quantity}`;
  } else if (transaction.quantity <= observation.quantity) {
    quantityPassed = true;
    quantityScore = 1.0;
    quantityReason = `Quantity compatible: partial or full execution (${transaction.quantity} / ${observation.quantity})`;
  } else if (transaction.quantity <= observation.quantity * 1.25) {
    quantityPassed = true;
    quantityScore = 0.9;
    quantityReason = `Quantity compatible: minor over-execution (${transaction.quantity} vs planned ${observation.quantity})`;
  } else {
    quantityPassed = true;
    quantityScore = 0.5;
    quantityReason = `Quantity exceeds planned trade size significantly (${transaction.quantity} vs planned ${observation.quantity})`;
  }
  criteria.push(
    Object.freeze({
      criterion: 'QUANTITY',
      passed: quantityPassed,
      score: quantityScore,
      weight: 5,
      reason: quantityReason,
    })
  );
  if (!quantityPassed) {
    reasons.push(quantityReason);
  }

  // 8. Order ID Corroboration (Optional evidence)
  const transactionOrderId = normalizeOrderId(transaction.order_id);
  if (transactionOrderId) {
    let orderMatchedInEvidence = false;
    if (evidenceOrders) {
      orderMatchedInEvidence = evidenceOrders.some(
        (o: any) => normalizeOrderId(o?.order_id) === transactionOrderId
      );
    }
    const orderReason = orderMatchedInEvidence
      ? `Transaction order_id ${transaction.order_id} corroborated by observation evidence snapshot.`
      : `Transaction order_id ${transaction.order_id} not in evidence orders (treated as taker counterparty or unverified order).`;
    criteria.push(
      Object.freeze({
        criterion: 'ORDER_REF',
        passed: true,
        score: orderMatchedInEvidence ? 1.0 : 0.5,
        weight: 0, // Informational, does not alter base 100 weight
        reason: orderReason,
      })
    );
  }

  // Compute Total Score
  let totalWeightedScore = 0;
  let totalWeight = 0;
  for (const c of criteria) {
    if (c.weight > 0) {
      totalWeightedScore += c.score * c.weight;
      totalWeight += c.weight;
    }
  }
  const totalScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;

  // Essential criteria check: Identity, Location, Temporal, Price, Quantity must all pass
  const identityPassed = criteria.find((c) => c.criterion === 'IDENTITY')?.passed ?? false;
  const locationPassed = criteria.find((c) => c.criterion === 'LOCATION')?.passed ?? false;
  const temporalPassed = criteria.find((c) => c.criterion === 'TEMPORAL')?.passed ?? false;
  const pricePassed = criteria.find((c) => c.criterion === 'PRICE')?.passed ?? false;

  let matchLevel: CorrelationMatchLevel;
  if (!identityPassed || !locationPassed || !temporalPassed || !pricePassed || !quantityPassed) {
    matchLevel = 'UNMATCHED';
  } else if (totalScore >= 85 && locEval.matchesExactStation && priceEval.score === 1.0) {
    matchLevel = 'STRONG_MATCH';
    reasons.push(`Strong match: type, exact station, direction, price (<${(DEFAULT_STRONG_PRICE_TOLERANCE_PCT * 100).toFixed(0)}%), and temporal window all satisfied (score: ${totalScore.toFixed(1)}).`);
  } else if (totalScore >= 60) {
    matchLevel = 'PROBABLE_MATCH';
    reasons.push(`Probable match: compatible trade criteria with minor variance or regional proximity (score: ${totalScore.toFixed(1)}).`);
  } else {
    matchLevel = 'UNMATCHED';
  }

  return Object.freeze({
    observation_id: observation.observation_id,
    opportunity_id: observation.opportunity_id,
    match_level: matchLevel,
    total_score: Math.round(totalScore * 100) / 100,
    criteria: Object.freeze(criteria),
    reasons: Object.freeze(reasons),
  });
}

/**
 * Pure, deterministic function correlating a transaction against an array of OpportunityObservations.
 *
 * Guarantees:
 * - Determinism: Same inputs produce strictly identical results.
 * - Non-mutation: Inputs are never modified.
 * - Ambiguity preservation: Does NOT pick arbitrarily between equally viable candidates.
 * - No side-effects: No network calls, no Date.now(), no IndexedDB, no global mutable state.
 */
export function correlateTransaction(
  transaction: ExecutionTransactionRef,
  observations: readonly OpportunityObservation[],
  options?: CorrelationEngineOptions
): TransactionCorrelationResult {
  if (!transaction || !observations || observations.length === 0) {
    return Object.freeze({
      transaction_id: transaction?.transaction_id ?? 0,
      candidate_observation_ids: Object.freeze([]),
      selected_observation_id: null,
      match_level: 'UNMATCHED',
      reasons: Object.freeze(['No observations provided for correlation']),
      candidates: Object.freeze([]),
      confidence_score: 0,
    });
  }

  // 1. Evaluate all candidate observations
  const allCandidates: TransactionCorrelationCandidate[] = [];
  for (const obs of observations) {
    if (!obs || !obs.observation_id) continue;
    const candidate = evaluateCandidate(transaction, obs, options);
    allCandidates.push(candidate);
  }

  // 2. Check for DIRECT_MATCH
  const directMatches = allCandidates.filter((c) => c.match_level === 'DIRECT_MATCH');
  if (directMatches.length === 1) {
    const directCandidate = directMatches[0];
    return Object.freeze({
      transaction_id: transaction.transaction_id,
      character_id: transaction.character_id,
      candidate_observation_ids: Object.freeze([directCandidate.observation_id]),
      selected_observation_id: directCandidate.observation_id,
      match_level: 'DIRECT_MATCH',
      reasons: Object.freeze([
        `Direct attribution verified to observation ${directCandidate.observation_id}`,
        ...directCandidate.reasons,
      ]),
      candidates: Object.freeze(allCandidates),
      confidence_score: 1.0,
      direct_matched_by: transaction.opportunity_id
        ? 'TRANSACTION_OPPORTUNITY_REF'
        : transaction.observation_id
        ? 'TRANSACTION_OBSERVATION_REF'
        : 'EXPLICIT_MAPPING',
    });
  }

  if (directMatches.length > 1) {
    // Ambiguity among multiple direct matches (e.g. repeated observations)
    const directIds = directMatches.map((c) => c.observation_id).sort();
    return Object.freeze({
      transaction_id: transaction.transaction_id,
      character_id: transaction.character_id,
      candidate_observation_ids: Object.freeze(directIds),
      selected_observation_id: null,
      match_level: 'AMBIGUOUS',
      reasons: Object.freeze([
        `Ambiguous match: Multiple observations (${directMatches.length}) claim direct linkage. Direct attribution unresolved.`,
      ]),
      candidates: Object.freeze(allCandidates),
      confidence_score: 0.5,
    });
  }

  // 3. Filter candidates qualifying as STRONG_MATCH or PROBABLE_MATCH
  const qualifyingCandidates = allCandidates
    .filter((c) => c.match_level === 'STRONG_MATCH' || c.match_level === 'PROBABLE_MATCH')
    // Deterministic sort: total_score DESCENDING, then observation_id ASCENDING
    .sort((a, b) => {
      if (b.total_score !== a.total_score) {
        return b.total_score - a.total_score;
      }
      return a.observation_id.localeCompare(b.observation_id);
    });

  // 4. Handle 0 Qualifying Candidates
  if (qualifyingCandidates.length === 0) {
    const nonMatchingReasons = allCandidates.flatMap((c) => c.reasons).slice(0, 5);
    return Object.freeze({
      transaction_id: transaction.transaction_id,
      character_id: transaction.character_id,
      candidate_observation_ids: Object.freeze([]),
      selected_observation_id: null,
      match_level: 'UNMATCHED',
      reasons: Object.freeze([
        'No compatible opportunity observations matched transaction criteria.',
        ...nonMatchingReasons,
      ]),
      candidates: Object.freeze(allCandidates),
      confidence_score: 0,
    });
  }

  // 5. Handle exactly 1 Qualifying Candidate
  if (qualifyingCandidates.length === 1) {
    const single = qualifyingCandidates[0];
    return Object.freeze({
      transaction_id: transaction.transaction_id,
      character_id: transaction.character_id,
      candidate_observation_ids: Object.freeze([single.observation_id]),
      selected_observation_id: single.observation_id,
      match_level: single.match_level,
      reasons: Object.freeze([
        `Attributed to observation ${single.observation_id} (${single.match_level}) with score ${single.total_score.toFixed(1)}/100`,
        ...single.reasons,
      ]),
      candidates: Object.freeze(allCandidates),
      confidence_score: single.total_score / 100,
    });
  }

  // 6. Handle Multiple Qualifying Candidates (Arbitration & Ambiguity Detection)
  const top1 = qualifyingCandidates[0];
  const top2 = qualifyingCandidates[1];
  const scoreDiff = top1.total_score - top2.total_score;
  const ambiguityThreshold = options?.ambiguity_score_threshold ?? DEFAULT_AMBIGUITY_SCORE_THRESHOLD;

  const candidateIds = qualifyingCandidates.map((c) => c.observation_id).sort();

  // If top candidate has a clear decisive advantage over second place:
  if (scoreDiff > ambiguityThreshold && top1.match_level === 'STRONG_MATCH') {
    return Object.freeze({
      transaction_id: transaction.transaction_id,
      character_id: transaction.character_id,
      candidate_observation_ids: Object.freeze(candidateIds),
      selected_observation_id: top1.observation_id,
      match_level: 'STRONG_MATCH',
      reasons: Object.freeze([
        `Selected top observation ${top1.observation_id} by decisive score advantage (${top1.total_score.toFixed(1)} vs ${top2.total_score.toFixed(1)}, delta=${scoreDiff.toFixed(1)} > threshold=${ambiguityThreshold})`,
        ...top1.reasons,
      ]),
      candidates: Object.freeze(allCandidates),
      confidence_score: top1.total_score / 100,
    });
  }

  // Otherwise: Ambiguity must be preserved!
  // Section 9: "En cas d'incertitude : AMBIGUOUS doit être préféré à une attribution arbitraire."
  // Do NOT select candidate 1 just because of slight chronological or array-index difference!
  return Object.freeze({
    transaction_id: transaction.transaction_id,
    character_id: transaction.character_id,
    candidate_observation_ids: Object.freeze(candidateIds),
    selected_observation_id: null,
    match_level: 'AMBIGUOUS',
    reasons: Object.freeze([
      `Ambiguous match: ${qualifyingCandidates.length} candidate observations qualify with comparable scores (top scores: ${top1.total_score.toFixed(1)} vs ${top2.total_score.toFixed(1)}, delta=${scoreDiff.toFixed(1)} <= threshold=${ambiguityThreshold}). Attribution suspended to prevent false historical truth.`,
    ]),
    candidates: Object.freeze(allCandidates),
    confidence_score: 0.5,
  });
}

/**
 * Correlates a batch of transactions against a list of observations.
 * Returns an array of correlation results.
 */
export function correlateTransactions(
  transactions: readonly ExecutionTransactionRef[],
  observations: readonly OpportunityObservation[],
  options?: CorrelationEngineOptions
): readonly TransactionCorrelationResult[] {
  if (!transactions || transactions.length === 0) {
    return Object.freeze([]);
  }
  const results = transactions.map((tx) => correlateTransaction(tx, observations, options));
  return Object.freeze(results);
}

/**
 * Pure grouping utility that organizes transactions by matched observation_id,
 * separating buy, sell, ambiguous and unmatched transactions.
 */
export function groupTransactionsByObservation(
  transactions: readonly ExecutionTransactionRef[],
  correlationResults: readonly TransactionCorrelationResult[]
): ReadonlyMap<
  string,
  {
    readonly buy_transactions: readonly ExecutionTransactionRef[];
    readonly sell_transactions: readonly ExecutionTransactionRef[];
  }
> {
  const map = new Map<string, { buy: ExecutionTransactionRef[]; sell: ExecutionTransactionRef[] }>();
  const txMap = new Map<number, ExecutionTransactionRef>();

  for (const tx of transactions) {
    txMap.set(tx.transaction_id, tx);
  }

  for (const res of correlationResults) {
    if (!res.selected_observation_id) continue;
    const tx = txMap.get(res.transaction_id);
    if (!tx) continue;

    let group = map.get(res.selected_observation_id);
    if (!group) {
      group = { buy: [], sell: [] };
      map.set(res.selected_observation_id, group);
    }

    if (tx.is_buy) {
      group.buy.push(tx);
    } else {
      group.sell.push(tx);
    }
  }

  const finalizedMap = new Map<
    string,
    {
      readonly buy_transactions: readonly ExecutionTransactionRef[];
      readonly sell_transactions: readonly ExecutionTransactionRef[];
    }
  >();

  for (const [obsId, group] of map.entries()) {
    finalizedMap.set(
      obsId,
      Object.freeze({
        buy_transactions: Object.freeze([...group.buy]),
        sell_transactions: Object.freeze([...group.sell]),
      })
    );
  }

  return finalizedMap;
}
