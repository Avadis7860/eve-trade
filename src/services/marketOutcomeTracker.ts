import {
  OpportunityObservation,
  OpportunityOutcomeSnapshot,
  OutcomeHorizon,
  OUTCOME_HORIZONS,
  OUTCOME_HORIZON_DURATIONS_MS,
  RawMarketOrder,
  MarketDataQuality,
  MarketOutcomeProcessReport,
  OutcomeCollectionResult,
  DataHealthStatus,
} from '../types';
import { OpportunityEvidenceEngine } from '../engine/evidence';
import { IndexedDbStore } from './indexedDbStore';
import { MarketDataStore } from './marketDataStore';
import { EsiService } from './esi';
import { FailureSemantics } from '../engine/failureSemantics';

export interface OutcomeEvaluationResult {
  isValid: boolean;
  outcome?: OpportunityOutcomeSnapshot;
  error?: string;
  dataHealth?: DataHealthStatus;
}

export interface OutcomeTrackerStatus {
  isRunning: boolean;
  intervalMs: number;
  lastRunTimestamp: number | null;
  totalRunsCount: number;
  totalOutcomesRecorded: number;
}

/**
 * Phase 2A — Market Outcome Tracker & Scheduler.
 *
 * Tracks empirical evolution of detected opportunities across defined horizons:
 * '1h' | '6h' | '24h' | '3d' | '7d'.
 *
 * Guarantees:
 * 1. T0 Immutability: The original prediction, evidence, parameters, and evidence_hash remain strictly untouched.
 * 2. Idempotence: Outcomes are never recorded twice for the same horizon on a given observation.
 * 3. Temporal Accuracy: Outcome snapshots are recorded with their real measurement timestamp.
 * 4. Data Quality Preservation: Outcomes are only recorded when market data passes failure semantics validation.
 */
export class MarketOutcomeTracker {
  private static schedulerIntervalId: any = null;
  private static isProcessing = false;
  private static lastRunTimestamp: number | null = null;
  private static totalRunsCount = 0;
  private static totalOutcomesRecorded = 0;
  private static schedulerIntervalMs = 60000; // 1 minute default interval

  /**
   * Identifies all pending (due and unrecorded) horizons for a given observation.
   *
   * @param observation The T0 OpportunityObservation record
   * @param referenceTime Timestamp to compare against (defaults to now)
   * @returns Array of due OutcomeHorizon values in chronological order
   */
  static getPendingHorizons(
    observation: OpportunityObservation,
    referenceTime: number = Date.now()
  ): OutcomeHorizon[] {
    const obsTime = new Date(observation.timestamp).getTime();
    if (isNaN(obsTime) || obsTime <= 0) return [];

    const elapsedMs = referenceTime - obsTime;
    const recordedOutcomes = observation.outcomes || {};

    const pending: OutcomeHorizon[] = [];
    for (const horizon of OUTCOME_HORIZONS) {
      const requiredDuration = OUTCOME_HORIZON_DURATIONS_MS[horizon];
      // Due if required duration has elapsed AND outcome is not already recorded
      if (elapsedMs >= requiredDuration && !recordedOutcomes[horizon]) {
        pending.push(horizon);
      }
    }

    return pending;
  }

  /**
   * Checks if a specific horizon is due for a given observation.
   */
  static isHorizonDue(
    observation: OpportunityObservation,
    horizon: OutcomeHorizon,
    referenceTime: number = Date.now()
  ): boolean {
    const obsTime = new Date(observation.timestamp).getTime();
    if (isNaN(obsTime) || obsTime <= 0) return false;

    const elapsedMs = referenceTime - obsTime;
    const isAlreadyRecorded = Boolean(observation.outcomes && observation.outcomes[horizon]);
    if (isAlreadyRecorded) return false;

    return elapsedMs >= OUTCOME_HORIZON_DURATIONS_MS[horizon];
  }

  /**
   * Returns milliseconds remaining until a horizon is due.
   * Returns 0 if already due or overdue.
   */
  static getHorizonTimeRemaining(
    observation: OpportunityObservation,
    horizon: OutcomeHorizon,
    referenceTime: number = Date.now()
  ): number {
    const obsTime = new Date(observation.timestamp).getTime();
    if (isNaN(obsTime) || obsTime <= 0) return 0;

    const elapsedMs = referenceTime - obsTime;
    const requiredDuration = OUTCOME_HORIZON_DURATIONS_MS[horizon];
    const remaining = requiredDuration - elapsedMs;

    return remaining > 0 ? remaining : 0;
  }

  /**
   * Evaluates an empirical market outcome snapshot using current order books and quality metadata.
   * Rejects invalid or corrupted data states (ERROR, UNKNOWN).
   */
  static evaluateOutcome(
    observation: OpportunityObservation,
    horizon: OutcomeHorizon,
    currentSourceOrders: RawMarketOrder[] = [],
    currentDestOrders: RawMarketOrder[] = [],
    sourceQuality?: MarketDataQuality,
    destQuality?: MarketDataQuality
  ): OutcomeEvaluationResult {
    // 1. Data quality check via failure semantics
    if (sourceQuality) {
      const sourceHealth = sourceQuality.health_status || FailureSemantics.evaluateHealth(sourceQuality);
      if (sourceHealth === 'ERROR') {
        return {
          isValid: false,
          error: `Source market data failed quality validation (${sourceHealth}): ${sourceQuality.last_error || 'Unknown error'}`,
          dataHealth: sourceHealth,
        };
      }
    }

    if (destQuality) {
      const destHealth = destQuality.health_status || FailureSemantics.evaluateHealth(destQuality);
      if (destHealth === 'ERROR') {
        return {
          isValid: false,
          error: `Destination market data failed quality validation (${destHealth}): ${destQuality.last_error || 'Unknown error'}`,
          dataHealth: destHealth,
        };
      }
    }

    // 2. Delegate deterministic calculation to OpportunityEvidenceEngine
    const outcome = OpportunityEvidenceEngine.createOutcomeSnapshot(
      observation,
      currentSourceOrders,
      currentDestOrders,
      horizon,
      sourceQuality,
      destQuality
    );

    // 3. Mathematical validation of the outcome snapshot
    if (isNaN(outcome.current_spread_pct) || isNaN(outcome.spread_decay_pct)) {
      return {
        isValid: false,
        error: 'Calculated outcome contains non-finite mathematical values (NaN)',
      };
    }

    return {
      isValid: true,
      outcome,
    };
  }

  /**
   * Collects current market data and records the outcome snapshot for a specific observation and horizon.
   * Ensures idempotence: if outcome already exists, skips gracefully.
   */
  static async collectAndRecordForObservation(
    observation: OpportunityObservation,
    horizon: OutcomeHorizon,
    options?: {
      sourceOrders?: RawMarketOrder[];
      destOrders?: RawMarketOrder[];
      sourceQuality?: MarketDataQuality;
      destQuality?: MarketDataQuality;
      forceLive?: boolean;
    }
  ): Promise<OutcomeCollectionResult> {
    // Idempotence check: if already recorded on memory/object, skip
    if (observation.outcomes && observation.outcomes[horizon]) {
      return {
        recorded: false,
        skippedAlreadyRecorded: true,
        outcome: observation.outcomes[horizon],
      };
    }

    let sourceOrders = options?.sourceOrders;
    let destOrders = options?.destOrders;
    let sourceQuality = options?.sourceQuality;
    let destQuality = options?.destQuality;

    // If orders were not explicitly injected, fetch/retrieve from MarketDataStore / ESI
    if (!sourceOrders || !destOrders) {
      try {
        const typeId = observation.type_id;
        const sourceRegionId = observation.source_region_id;
        const destRegionId = observation.dest_region_id;

        if (options?.forceLive) {
          const [sourceRes, destRes] = await Promise.all([
            EsiService.fetchLiveOrdersDetailed(sourceRegionId, typeId),
            EsiService.fetchLiveOrdersDetailed(destRegionId, typeId),
          ]);
          sourceOrders = sourceRes.orders;
          sourceQuality = sourceRes.quality;
          destOrders = destRes.orders;
          destQuality = destRes.quality;
        } else {
          let sourceOrdersFromStore = MarketDataStore.getOrders(typeId, sourceRegionId);
          let sourceQualityFromStore = MarketDataStore.getQuality(typeId, sourceRegionId) || undefined;
          let destOrdersFromStore = MarketDataStore.getOrders(typeId, destRegionId);
          let destQualityFromStore = MarketDataStore.getQuality(typeId, destRegionId) || undefined;

          const maxAllowedAgeMs = 10 * 60 * 1000; // 10 minutes maximum age for outcome evaluation
          const obsTimestampMs = new Date(observation.timestamp).getTime();

          const isStoreValid = (orders: RawMarketOrder[] | null, quality: MarketDataQuality | undefined): boolean => {
            if (!orders || orders.length === 0 || !quality || !quality.fetched_at) return false;
            const fetchedAtMs = new Date(quality.fetched_at).getTime();
            if (isNaN(fetchedAtMs)) return false;
            const ageMs = Date.now() - fetchedAtMs;
            // Freshness Rule:
            // 1. Data must have been captured strictly AFTER the T0 observation timestamp
            // 2. Data must be fresh (age <= 10 minutes)
            // 3. Health status must not be ERROR
            return (
              fetchedAtMs > obsTimestampMs &&
              ageMs <= maxAllowedAgeMs &&
              quality.health_status !== 'ERROR' &&
              quality.freshness !== 'expired'
            );
          };

          const sourceFresh = isStoreValid(sourceOrdersFromStore, sourceQualityFromStore);
          const destFresh = isStoreValid(destOrdersFromStore, destQualityFromStore);

          if (sourceFresh && destFresh && sourceOrdersFromStore && destOrdersFromStore) {
            sourceOrders = sourceOrdersFromStore;
            sourceQuality = sourceQualityFromStore;
            destOrders = destOrdersFromStore;
            destQuality = destQualityFromStore;
          } else {
            // Live ESI fetch required to guarantee fresh empirical observation
            const [sourceRes, destRes] = await Promise.all([
              EsiService.fetchLiveOrdersDetailed(sourceRegionId, typeId),
              EsiService.fetchLiveOrdersDetailed(destRegionId, typeId),
            ]);
            sourceOrders = sourceRes.orders;
            sourceQuality = sourceRes.quality;
            destOrders = destRes.orders;
            destQuality = destRes.quality;
          }
        }
      } catch (err: any) {
        return {
          recorded: false,
          error: `Failed to fetch market data for outcome evaluation: ${err?.message || String(err)}`,
        };
      }
    }

    // Evaluate outcome snapshot
    const evaluation = this.evaluateOutcome(
      observation,
      horizon,
      sourceOrders,
      destOrders,
      sourceQuality,
      destQuality
    );

    if (!evaluation.isValid || !evaluation.outcome) {
      return {
        recorded: false,
        error: evaluation.error || 'Invalid outcome evaluation',
      };
    }

    // Persist outcome non-destructively to IndexedDbStore
    const saved = await IndexedDbStore.recordOpportunityOutcome(
      observation.observation_id,
      evaluation.outcome
    );

    if (saved) {
      if (!observation.outcomes) observation.outcomes = {};
      observation.outcomes[horizon] = evaluation.outcome;
      this.totalOutcomesRecorded++;
      return {
        recorded: true,
        outcome: evaluation.outcome,
      };
    } else {
      return {
        recorded: false,
        error: `Failed to persist outcome snapshot to IndexedDb for observation ${observation.observation_id}`,
      };
    }
  }

  /**
   * Queries stored observations and returns those that have at least one due, unrecorded horizon.
   */
  static async getDueObservations(
    referenceTime: number = Date.now(),
    limit: number = 200
  ): Promise<Array<{ observation: OpportunityObservation; pendingHorizons: OutcomeHorizon[] }>> {
    const allObservations = await IndexedDbStore.getOpportunityObservations(undefined, limit);
    const dueList: Array<{ observation: OpportunityObservation; pendingHorizons: OutcomeHorizon[] }> = [];

    for (const obs of allObservations) {
      const pending = this.getPendingHorizons(obs, referenceTime);
      if (pending.length > 0) {
        dueList.push({
          observation: obs,
          pendingHorizons: pending,
        });
      }
    }

    return dueList;
  }

  /**
   * Core scheduler worker execution: scans all due observations and records outcome snapshots.
   */
  static async processPendingOutcomes(
    referenceTime: number = Date.now(),
    options?: {
      maxObservations?: number;
      forceLive?: boolean;
    }
  ): Promise<MarketOutcomeProcessReport> {
    if (this.isProcessing) {
      return {
        totalObservationsChecked: 0,
        dueObservationsCount: 0,
        outcomesRecordedCount: 0,
        skippedAlreadyRecordedCount: 0,
        failedCount: 0,
        errors: [{ observationId: 'SYSTEM', horizon: '1h', error: 'Scheduler run already in progress' }],
        recordedSnapshots: [],
      };
    }

    this.isProcessing = true;
    this.totalRunsCount++;
    this.lastRunTimestamp = Date.now();

    const report: MarketOutcomeProcessReport = {
      totalObservationsChecked: 0,
      dueObservationsCount: 0,
      outcomesRecordedCount: 0,
      skippedAlreadyRecordedCount: 0,
      failedCount: 0,
      errors: [],
      recordedSnapshots: [],
    };

    try {
      const maxObs = options?.maxObservations ?? 100;
      const dueItems = await this.getDueObservations(referenceTime, maxObs);
      report.totalObservationsChecked = dueItems.length;
      report.dueObservationsCount = dueItems.length;

      for (const item of dueItems) {
        for (const horizon of item.pendingHorizons) {
          const res = await this.collectAndRecordForObservation(item.observation, horizon, {
            forceLive: options?.forceLive,
          });

          if (res.recorded && res.outcome) {
            report.outcomesRecordedCount++;
            report.recordedSnapshots.push({
              observationId: item.observation.observation_id,
              horizon,
              snapshot: res.outcome,
            });
          } else if (res.skippedAlreadyRecorded) {
            report.skippedAlreadyRecordedCount++;
          } else {
            report.failedCount++;
            report.errors.push({
              observationId: item.observation.observation_id,
              horizon,
              error: res.error || 'Unknown outcome collection error',
            });
          }
        }
      }
    } catch (err: any) {
      report.errors.push({
        observationId: 'SYSTEM',
        horizon: '1h',
        error: `Unexpected error during processPendingOutcomes: ${err?.message || String(err)}`,
      });
    } finally {
      this.isProcessing = false;
    }

    return report;
  }

  /**
   * Starts background recurring scheduler timer.
   */
  static startScheduler(intervalMs: number = 60000): void {
    if (this.schedulerIntervalId) return;
    this.schedulerIntervalMs = intervalMs;
    this.schedulerIntervalId = setInterval(() => {
      this.processPendingOutcomes().catch((err) => {
        console.warn('[MarketOutcomeTracker] Periodic scheduler error:', err);
      });
    }, intervalMs);
  }

  /**
   * Stops background recurring scheduler timer.
   */
  static stopScheduler(): void {
    if (this.schedulerIntervalId) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }
  }

  /**
   * Returns current scheduler execution status.
   */
  static getStatus(): OutcomeTrackerStatus {
    return {
      isRunning: this.schedulerIntervalId !== null,
      intervalMs: this.schedulerIntervalMs,
      lastRunTimestamp: this.lastRunTimestamp,
      totalRunsCount: this.totalRunsCount,
      totalOutcomesRecorded: this.totalOutcomesRecorded,
    };
  }

  /**
   * Resets scheduler in-memory statistics (useful for test isolation).
   */
  static resetForTesting(): void {
    this.stopScheduler();
    this.isProcessing = false;
    this.lastRunTimestamp = null;
    this.totalRunsCount = 0;
    this.totalOutcomesRecorded = 0;
  }
}
