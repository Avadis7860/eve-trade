/**
 * EVE Trade — Phase 2B: Execution Correlation Engine Tests (Chantier 2)
 *
 * Validates deterministic attribution between transactions and OpportunityObservations:
 * - Direct matches (DIRECT_MATCH)
 * - Strong multi-criteria matches (STRONG_MATCH)
 * - Probable matches (PROBABLE_MATCH)
 * - Strict ambiguity preservation (AMBIGUOUS with selected_observation_id = null)
 * - Complete non-matches (UNMATCHED)
 * - Partial execution tolerance
 * - Price tolerance boundaries
 * - Temporal boundaries (before, on boundary, after)
 * - Location and type mismatches
 * - Direction compatibility (buy vs sell)
 * - Semantic limits of order_id
 * - Strict determinism and immutability (Object.freeze)
 * - Batch correlation & grouping
 */

import {
  correlateTransaction,
  correlateTransactions,
  groupTransactionsByObservation,
  evaluatePriceMatch,
  evaluateTemporalMatch,
  evaluateLocationMatch,
} from '../executionCorrelation';
import {
  OpportunityObservation,
  ExecutionTransactionRef,
  CorrelationEngineOptions,
} from '../../types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

function runAllExecutionCorrelationTests() {
  console.log('=== RUNNING PHASE 2B: EXECUTION CORRELATION ENGINE TESTS ===');

  // Helper factory for test observations
  const createObservation = (overrides?: Partial<OpportunityObservation>): OpportunityObservation => ({
    observation_id: 'obs-001',
    opportunity_id: 'opp-001',
    timestamp: '2026-09-20T12:00:00.000Z',
    type_id: 34, // Tritanium
    type_name: 'Tritanium',
    source_region_id: 10000002, // The Forge
    dest_region_id: 10000043, // Domain
    source_hub_id: 'jita',
    dest_hub_id: 'amarr',
    strategy: 'immediate',
    buy_price: 5.0,
    sell_price: 6.5,
    quantity: 10000,
    net_profit: 10000,
    roi: 0.2,
    expected_days_to_sell: 2,
    capturable_profit: 10000,
    profit_per_day: 5000,
    overall_score: 85,
    liquidity_score: 90,
    stability_score: 80,
    data_confidence: 0.95,
    is_anomalous: false,
    bottleneck: 'capital',
    ...overrides,
  });

  // Helper factory for test transactions
  const createTx = (overrides?: Partial<ExecutionTransactionRef>): ExecutionTransactionRef => ({
    transaction_id: 1001,
    character_id: 99991234,
    type_id: 34,
    location_id: 60003760, // Jita IV-4
    is_buy: true,
    quantity: 5000,
    unit_price: 5.02, // within 2% of 5.0
    timestamp: '2026-09-20T12:30:00.000Z', // 30 min after observation
    ...overrides,
  });

  // -------------------------------------------------------------
  // Test 1: DIRECT_MATCH
  // -------------------------------------------------------------
  console.log('--- Test 1: DIRECT_MATCH ---');
  {
    const obs = createObservation();

    // 1a: via opportunity_id
    const txWithOpp = createTx({ opportunity_id: 'opp-001' });
    const res1 = correlateTransaction(txWithOpp, [obs]);
    assert(res1.match_level === 'DIRECT_MATCH', '1a: Match level must be DIRECT_MATCH');
    assert(res1.selected_observation_id === 'obs-001', '1a: Selected observation ID must match');
    assert(res1.confidence_score === 1.0, '1a: Confidence score must be 1.0');
    assert(res1.direct_matched_by === 'TRANSACTION_OPPORTUNITY_REF', '1a: direct_matched_by verified');

    // 1b: via observation_id
    const txWithObs = createTx({ observation_id: 'obs-001' });
    const res2 = correlateTransaction(txWithObs, [obs]);
    assert(res2.match_level === 'DIRECT_MATCH', '1b: Match level must be DIRECT_MATCH');
    assert(res2.selected_observation_id === 'obs-001', '1b: Selected observation ID must match');
    assert(res2.direct_matched_by === 'TRANSACTION_OBSERVATION_REF', '1b: direct_matched_by verified');

    // 1c: via options.direct_mappings
    const txPlain = createTx({ transaction_id: 9999 });
    const options: CorrelationEngineOptions = {
      direct_mappings: { 9999: 'obs-001' },
    };
    const res3 = correlateTransaction(txPlain, [obs], options);
    assert(res3.match_level === 'DIRECT_MATCH', '1c: Explicit mapping must produce DIRECT_MATCH');
    assert(res3.selected_observation_id === 'obs-001', '1c: Explicit mapping selects observation');
    console.log('  [PASS] DIRECT_MATCH verified across all direct reference mechanisms');
  }

  // -------------------------------------------------------------
  // Test 2: STRONG_MATCH
  // -------------------------------------------------------------
  console.log('--- Test 2: STRONG_MATCH ---');
  {
    const obs = createObservation();
    const tx = createTx({
      type_id: 34,
      location_id: 60003760, // Jita IV-4 exact station
      is_buy: true,
      unit_price: 5.05, // 1% deviation (<= 2% strong tolerance)
      timestamp: '2026-09-20T12:15:00.000Z', // 15 min after obs
      quantity: 5000,
    });

    const res = correlateTransaction(tx, [obs]);
    assert(res.match_level === 'STRONG_MATCH', `Expected STRONG_MATCH, got ${res.match_level}`);
    assert(res.selected_observation_id === 'obs-001', 'Selected observation must be obs-001');
    assert(res.candidate_observation_ids.length === 1, 'Exactly one candidate');
    assert(res.confidence_score >= 0.85, 'Confidence score >= 0.85');
    console.log('  [PASS] STRONG_MATCH verified with multiple concordant independent criteria');
  }

  // -------------------------------------------------------------
  // Test 3: PROBABLE_MATCH
  // -------------------------------------------------------------
  console.log('--- Test 3: PROBABLE_MATCH ---');
  {
    const obs = createObservation();
    // Price deviation is 5.0% (> 2% strong, <= 10% probable)
    const txPriceProbable = createTx({
      unit_price: 5.25, // 5.0% above 5.0
    });
    const res1 = correlateTransaction(txPriceProbable, [obs]);
    assert(res1.match_level === 'PROBABLE_MATCH', `Expected PROBABLE_MATCH on 5% price diff, got ${res1.match_level}`);
    assert(res1.selected_observation_id === 'obs-001', 'Selected obs-001 on single probable candidate');

    // Regional match instead of exact station (e.g. Perimeter station 60011728 in region 10000002)
    const txRegionProbable = createTx({
      location_id: 60011728, // Perimeter station in The Forge (10000002)
      unit_price: 5.0,
    });
    const res2 = correlateTransaction(txRegionProbable, [obs]);
    assert(res2.match_level === 'PROBABLE_MATCH', `Expected PROBABLE_MATCH on regional station, got ${res2.match_level}`);
    assert(res2.selected_observation_id === 'obs-001', 'Selected obs-001 on regional candidate');
    console.log('  [PASS] PROBABLE_MATCH verified on acceptable variances');
  }

  // -------------------------------------------------------------
  // Test 4: AMBIGUOUS (Section 9 Mandatory Scenario)
  // -------------------------------------------------------------
  console.log('--- Test 4: AMBIGUOUS (Section 9 Mandatory Scenario) ---');
  {
    const obsA = createObservation({
      observation_id: 'obs-A',
      opportunity_id: 'opp-A',
      timestamp: '2026-09-20T12:00:00.000Z',
      type_id: 34,
      source_hub_id: 'jita',
      buy_price: 5.0,
    });

    const obsB = createObservation({
      observation_id: 'obs-B',
      opportunity_id: 'opp-B',
      timestamp: '2026-09-20T12:00:05.000Z', // 5 seconds later
      type_id: 34,
      source_hub_id: 'jita',
      buy_price: 5.0,
    });

    const tx = createTx({
      type_id: 34,
      location_id: 60003760,
      unit_price: 5.0,
      timestamp: '2026-09-20T12:05:00.000Z',
    });

    const res = correlateTransaction(tx, [obsA, obsB]);
    assert(res.match_level === 'AMBIGUOUS', `Match level must be AMBIGUOUS, got ${res.match_level}`);
    assert(res.selected_observation_id === null, 'CRITICAL: selected_observation_id must be null for ambiguity!');
    assert(res.candidate_observation_ids.length === 2, 'Both candidate observations must be preserved');
    assert(
      res.candidate_observation_ids[0] === 'obs-A' && res.candidate_observation_ids[1] === 'obs-B',
      'Candidate observation IDs must be deterministically sorted'
    );
    console.log('  [PASS] AMBIGUOUS scenario verified: neither candidate arbitrarily picked');
  }

  // -------------------------------------------------------------
  // Test 5: UNMATCHED
  // -------------------------------------------------------------
  console.log('--- Test 5: UNMATCHED ---');
  {
    const obs = createObservation();
    const txUnrelated = createTx({
      type_id: 999999, // completely unrelated type
    });
    const res = correlateTransaction(txUnrelated, [obs]);
    assert(res.match_level === 'UNMATCHED', 'Match level must be UNMATCHED');
    assert(res.selected_observation_id === null, 'selected_observation_id must be null');
    assert(res.candidate_observation_ids.length === 0, 'candidate_observation_ids must be empty');
    assert(res.confidence_score === 0, 'confidence_score must be 0');
    console.log('  [PASS] UNMATCHED correctly returned on incompatible transaction');
  }

  // -------------------------------------------------------------
  // Test 6: Partial execution compatibility
  // -------------------------------------------------------------
  console.log('--- Test 6: Partial execution compatibility ---');
  {
    const obs = createObservation({ quantity: 100000 });
    // Trader executed a small partial fill of 250 units
    const txSmallPartial = createTx({ quantity: 250 });
    const res = correlateTransaction(txSmallPartial, [obs]);
    assert(res.match_level === 'STRONG_MATCH', 'Partial execution must NOT be penalized or rejected');
    assert(res.selected_observation_id === 'obs-001', 'Partial fill correctly attributed');
    console.log('  [PASS] Partial execution compatibility verified');
  }

  // -------------------------------------------------------------
  // Test 7: Price tolerance
  // -------------------------------------------------------------
  console.log('--- Test 7: Price tolerance ---');
  {
    // Test helper directly
    const pStrong = evaluatePriceMatch(101.9, 100.0); // 1.9% deviation
    assert(pStrong.passed === true, '1.9% must pass price match');
    assert(pStrong.score === 1.0, '1.9% must receive score 1.0 (strong tolerance)');

    const pProbable = evaluatePriceMatch(105.0, 100.0); // 5.0% deviation
    assert(pProbable.passed === true, '5.0% must pass price match');
    assert(pProbable.score > 0.5 && pProbable.score < 1.0, '5.0% must receive decayed probable score');

    const pFail = evaluatePriceMatch(111.0, 100.0); // 11.0% deviation
    assert(pFail.passed === false, '11.0% must fail price match (> 10% tolerance)');
    assert(pFail.score === 0, 'Failed price match score must be 0');

    // Test through full correlateTransaction
    const obs = createObservation({ buy_price: 100.0 });
    const txExceeds = createTx({ unit_price: 111.0 });
    const res = correlateTransaction(txExceeds, [obs]);
    assert(res.match_level === 'UNMATCHED', 'Excessive price deviation must result in UNMATCHED');
    console.log('  [PASS] Price tolerance boundaries verified (strong, probable, failed)');
  }

  // -------------------------------------------------------------
  // Test 8: Temporal boundary
  // -------------------------------------------------------------
  console.log('--- Test 8: Temporal boundary ---');
  {
    const obsTime = '2026-09-20T12:00:00.000Z';
    const obsMs = Date.parse(obsTime);

    // Default leeway: 600,000 ms (10 min). Default buy window: 86,400,000 ms (24h).
    // 8a: Before window (15m before obs -> delta = -900,000 ms < -600,000 ms)
    const txBefore = new Date(obsMs - 900_000).toISOString();
    const tBefore = evaluateTemporalMatch(txBefore, obsTime, true);
    assert(tBefore.passed === false, '15 min before obs must fail leeway');

    // 8b: Exactly on lower boundary (-10 min -> delta = -600,000 ms)
    const txLowerBound = new Date(obsMs - 600_000).toISOString();
    const tLower = evaluateTemporalMatch(txLowerBound, obsTime, true);
    assert(tLower.passed === true, 'Exactly on lower leeway boundary must pass');

    // 8c: Exactly on upper boundary (+24 hours -> delta = +86,400,000 ms)
    const txUpperBound = new Date(obsMs + 86_400_000).toISOString();
    const tUpper = evaluateTemporalMatch(txUpperBound, obsTime, true);
    assert(tUpper.passed === true, 'Exactly on upper window boundary must pass');

    // 8d: After upper boundary (+24h 15m)
    const txAfter = new Date(obsMs + 86_400_000 + 900_000).toISOString();
    const tAfter = evaluateTemporalMatch(txAfter, obsTime, true);
    assert(tAfter.passed === false, 'After upper window boundary must fail');

    // Full engine integration test
    const obs = createObservation({ timestamp: obsTime });
    const resBefore = correlateTransaction(createTx({ timestamp: txBefore }), [obs]);
    assert(resBefore.match_level === 'UNMATCHED', 'Transaction before window must be UNMATCHED');

    const resAfter = correlateTransaction(createTx({ timestamp: txAfter }), [obs]);
    assert(resAfter.match_level === 'UNMATCHED', 'Transaction after window must be UNMATCHED');
    console.log('  [PASS] Temporal boundaries (before, on lower, on upper, after) verified');
  }

  // -------------------------------------------------------------
  // Test 9: Location mismatch
  // -------------------------------------------------------------
  console.log('--- Test 9: Location mismatch ---');
  {
    const obs = createObservation({
      source_hub_id: 'jita', // Station 60003760 (The Forge)
      source_region_id: 10000002,
    });

    // Transaction took place in Amarr VIII (Station 60008494, Region 10000043)
    const txWrongLocation = createTx({
      location_id: 60008494,
    });

    const res = correlateTransaction(txWrongLocation, [obs]);
    assert(res.match_level === 'UNMATCHED', 'Location mismatch must yield UNMATCHED');
    assert(res.selected_observation_id === null, 'No observation selected on location mismatch');
    console.log('  [PASS] Location mismatch verified');
  }

  // -------------------------------------------------------------
  // Test 10: Type mismatch
  // -------------------------------------------------------------
  console.log('--- Test 10: Type mismatch ---');
  {
    const obs = createObservation({ type_id: 34 }); // Tritanium
    const txWrongType = createTx({ type_id: 35 }); // Pyerite
    const res = correlateTransaction(txWrongType, [obs]);
    assert(res.match_level === 'UNMATCHED', 'Type mismatch must yield UNMATCHED');
    assert(res.selected_observation_id === null, 'No observation selected on type mismatch');
    console.log('  [PASS] Type mismatch verified');
  }

  // -------------------------------------------------------------
  // Test 11: Direction mismatch
  // -------------------------------------------------------------
  console.log('--- Test 11: Direction mismatch ---');
  {
    // A BUY transaction must match the source leg (Jita, buy_price: 5.0)
    // A SELL transaction must match the destination leg (Amarr, sell_price: 6.5)
    const obs = createObservation({
      source_hub_id: 'jita',
      dest_hub_id: 'amarr',
      buy_price: 5.0,
      sell_price: 6.5,
    });

    // Valid BUY at Jita
    const txBuy = createTx({
      is_buy: true,
      location_id: 60003760, // Jita
      unit_price: 5.02,
    });
    const resBuy = correlateTransaction(txBuy, [obs]);
    assert(resBuy.match_level === 'STRONG_MATCH', 'Valid BUY at source hub must be STRONG_MATCH');

    // Valid SELL at Amarr
    const txSell = createTx({
      is_buy: false,
      location_id: 60008494, // Amarr
      unit_price: 6.51,
    });
    const resSell = correlateTransaction(txSell, [obs]);
    assert(resSell.match_level === 'STRONG_MATCH', 'Valid SELL at dest hub must be STRONG_MATCH');

    // Inverted: SELL executed at Jita at 5.0 ISK (trying to match destination with source leg data)
    const txInverted = createTx({
      is_buy: false,
      location_id: 60003760, // Jita (wrong for sell leg!)
      unit_price: 5.0, // wrong price for sell leg (6.5)!
    });
    const resInverted = correlateTransaction(txInverted, [obs]);
    assert(resInverted.match_level === 'UNMATCHED', 'Inverted direction/location must be UNMATCHED');
    console.log('  [PASS] Direction mismatch verified (source acquisition vs dest disposal)');
  }

  // -------------------------------------------------------------
  // Test 12: order_id semantics
  // -------------------------------------------------------------
  console.log('--- Test 12: order_id semantics ---');
  {
    const obs = createObservation({ type_id: 34 });

    // 12a: An order_id alone CANNOT override a type mismatch
    const txWithOrderIdWrongType = createTx({
      order_id: 888888,
      type_id: 35, // wrong type
    });
    const res1 = correlateTransaction(txWithOrderIdWrongType, [obs]);
    assert(res1.match_level === 'UNMATCHED', 'order_id must not bypass type mismatch');

    // 12b: An unverified taker order_id does NOT create a DIRECT_MATCH
    const txWithTakerOrder = createTx({
      order_id: 777777, // arbitrary taker order_id
      type_id: 34,
      location_id: 60003760,
      unit_price: 5.02,
    });
    const res2 = correlateTransaction(txWithTakerOrder, [obs]);
    assert(res2.match_level !== 'DIRECT_MATCH', 'Unverified order_id must NOT produce DIRECT_MATCH');
    assert(res2.match_level === 'STRONG_MATCH', 'Evaluated based on valid attributes instead');
    console.log('  [PASS] order_id semantics verified: no false certainty created');
  }

  // -------------------------------------------------------------
  // Test 13: Determinism
  // -------------------------------------------------------------
  console.log('--- Test 13: Determinism ---');
  {
    const obsA = createObservation({ observation_id: 'obs-1' });
    const obsB = createObservation({ observation_id: 'obs-2', buy_price: 5.2 });
    const tx = createTx();

    const runs: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = correlateTransaction(tx, [obsA, obsB]);
      runs.push(JSON.stringify(res));
    }

    const firstRun = runs[0];
    for (let i = 1; i < runs.length; i++) {
      assert(runs[i] === firstRun, `Run ${i} differs from run 0! Determinism violated.`);
    }
    console.log('  [PASS] 10/10 runs produced bitwise identical results');
  }

  // -------------------------------------------------------------
  // Test 14: No mutation (Object.freeze)
  // -------------------------------------------------------------
  console.log('--- Test 14: No mutation (Object.freeze) ---');
  {
    const obs = deepFreeze(createObservation());
    const tx = deepFreeze(createTx());
    const options = deepFreeze<CorrelationEngineOptions>({
      strong_price_tolerance_pct: 0.02,
      probable_price_tolerance_pct: 0.1,
    });

    let didThrow = false;
    try {
      const res = correlateTransaction(tx, [obs], options);
      assert(res.match_level === 'STRONG_MATCH', 'Correlation executed with frozen inputs');
      // Verify returned result is frozen
      assert(Object.isFrozen(res), 'Result must be frozen');
      assert(Object.isFrozen(res.candidate_observation_ids), 'candidate_observation_ids must be frozen');
      assert(Object.isFrozen(res.reasons), 'reasons must be frozen');
    } catch {
      didThrow = true;
    }
    assert(!didThrow, 'Engine must never throw mutation error on frozen inputs');
    console.log('  [PASS] Strict input and output immutability verified');
  }

  // -------------------------------------------------------------
  // Test 15: Multiple candidates
  // -------------------------------------------------------------
  console.log('--- Test 15: Multiple candidates ---');
  {
    const obs1 = createObservation({ observation_id: 'obs-101', buy_price: 5.0 });
    const obs2 = createObservation({ observation_id: 'obs-102', buy_price: 5.01 });
    const obs3 = createObservation({ observation_id: 'obs-103', type_id: 35 }); // incompatible

    const tx = createTx({ type_id: 34, unit_price: 5.0 });
    const res = correlateTransaction(tx, [obs1, obs2, obs3]);

    assert(res.match_level === 'AMBIGUOUS', 'Multiple compatible candidates must yield AMBIGUOUS');
    assert(res.selected_observation_id === null, 'No candidate arbitrarily selected');
    assert(res.candidate_observation_ids.length === 2, 'Exactly 2 compatible observations preserved');
    assert(res.candidate_observation_ids.includes('obs-101'), 'obs-101 preserved');
    assert(res.candidate_observation_ids.includes('obs-102'), 'obs-102 preserved');
    assert(!res.candidate_observation_ids.includes('obs-103'), 'Incompatible obs-103 excluded');
    console.log('  [PASS] Multiple candidates correctly detected and preserved');
  }

  // -------------------------------------------------------------
  // Test 16: Decisive Dominance between Multiple Candidates
  // -------------------------------------------------------------
  console.log('--- Test 16: Decisive Dominance between Multiple Candidates ---');
  {
    // Candidate 1: Exact station, exact price, recent timestamp -> Score ~98 (STRONG_MATCH)
    const obsStrong = createObservation({
      observation_id: 'obs-dominant',
      source_hub_id: 'jita',
      buy_price: 5.0,
      timestamp: '2026-09-20T12:00:00.000Z',
    });

    // Candidate 2: Regional station only (Perimeter 60011728) -> Score ~73 (PROBABLE_MATCH)
    const obsWeaker = createObservation({
      observation_id: 'obs-weaker',
      source_hub_id: 'amarr', // different hub
      source_region_id: 10000002, // same region
      buy_price: 5.0,
      timestamp: '2026-09-20T12:00:00.000Z',
    });

    const tx = createTx({
      location_id: 60003760, // exact Jita station
      unit_price: 5.0,
      timestamp: '2026-09-20T12:10:00.000Z',
    });

    const res = correlateTransaction(tx, [obsStrong, obsWeaker]);
    assert(res.match_level === 'STRONG_MATCH', 'Dominant candidate should be STRONG_MATCH');
    assert(res.selected_observation_id === 'obs-dominant', 'Dominant candidate selected');
    console.log('  [PASS] Decisive score dominance properly resolves candidate');
  }

  // -------------------------------------------------------------
  // Test 17: Batch Correlation & Grouping
  // -------------------------------------------------------------
  console.log('--- Test 17: Batch Correlation & Grouping ---');
  {
    const obs = createObservation({ observation_id: 'obs-batch' });
    const txBuy = createTx({ transaction_id: 201, is_buy: true, location_id: 60003760, unit_price: 5.0 });
    const txSell = createTx({ transaction_id: 202, is_buy: false, location_id: 60008494, unit_price: 6.5 });
    const txUnmatched = createTx({ transaction_id: 203, type_id: 99999 });

    const results = correlateTransactions([txBuy, txSell, txUnmatched], [obs]);
    assert(results.length === 3, 'Batch returns 3 results');
    assert(results[0].selected_observation_id === 'obs-batch', 'txBuy matched');
    assert(results[1].selected_observation_id === 'obs-batch', 'txSell matched');
    assert(results[2].match_level === 'UNMATCHED', 'txUnmatched is UNMATCHED');

    const grouped = groupTransactionsByObservation([txBuy, txSell, txUnmatched], results);
    const obsGroup = grouped.get('obs-batch');
    assert(Boolean(obsGroup), 'obs-batch group exists');
    assert(obsGroup!.buy_transactions.length === 1, '1 buy transaction grouped');
    assert(obsGroup!.buy_transactions[0].transaction_id === 201, 'Buy transaction 201 grouped');
    assert(obsGroup!.sell_transactions.length === 1, '1 sell transaction grouped');
    assert(obsGroup!.sell_transactions[0].transaction_id === 202, 'Sell transaction 202 grouped');
    console.log('  [PASS] Batch correlation and transaction grouping verified');
  }

  console.log('🎉 ALL PHASE 2B EXECUTION CORRELATION TESTS PASSED WITH 100% SUCCESS!');
}

runAllExecutionCorrelationTests();
