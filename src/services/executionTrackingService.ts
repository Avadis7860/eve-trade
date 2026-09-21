/**
 * EVE Trade - Execution Tracking Service
 *
 * PHASE 2B — CHANTIER 3B-3: Correlation Integration Implementation
 *
 * Orchestrates the real integration between:
 *   PersistedCharacterTransaction
 *         ↓
 *   persistedTransactionToRef()
 *         ↓
 *   correlateTransactions() (Execution Correlation Engine)
 *         ↓
 *   groupTransactionsByObservation()
 *         ↓
 *   calculateExecutionOutcome() (Execution Outcome Engine)
 *         ↓
 *   CharacterExecutionRecord
 *         ↓
 *   character_executions (IndexedDbStore)
 *
 * Architectural Invariants:
 * 1. OpportunityObservation is read-only (immutable T0 market evidence, evidence_hash preserved).
 * 2. CharacterExecutionRecord is character-scoped (explicit character_id and execution_id).
 * 3. Cross-character isolation is absolute (CrossCharacterMappingViolationError).
 * 4. AMBIGUOUS matches are never automatically attributed.
 * 5. UNMATCHED transactions never create execution records.
 * 6. Idempotence & Recomputation: source transactions -> recompute -> single current execution record.
 */

import {
  CharacterExecutionRecord,
  CorrelationEngineOptions,
  CorrelationMatchLevel,
  ExecutionTrackingOptions,
  ExecutionTrackingSummary,
  ExecutionTransactionRef,
  OpportunityObservation,
  PersistedCharacterTransaction,
  TransactionCorrelationResult,
  UnassignedTransactionRecord,
} from '../types';
import { persistedTransactionToRef } from '../engine/characterTransaction';
import { correlateTransactions } from '../engine/executionCorrelation';
import { calculateExecutionOutcome } from '../engine/executionOutcome';
import { IndexedDbStore } from './indexedDbStore';

export const CORRELATION_ENGINE_VERSION = '1.0.0';

/**
 * Thrown when a transaction belonging to Character A is attempted to be mapped or processed
 * under the scope of Character B.
 */
export class CrossCharacterMappingViolationError extends Error {
  readonly transactionCharacterId: number;
  readonly targetCharacterId: number;
  readonly transactionId: number;

  constructor(
    message: string,
    transactionCharacterId: number,
    targetCharacterId: number,
    transactionId: number
  ) {
    super(message);
    this.name = 'CrossCharacterMappingViolationError';
    this.transactionCharacterId = transactionCharacterId;
    this.targetCharacterId = targetCharacterId;
    this.transactionId = transactionId;
    Object.setPrototypeOf(this, CrossCharacterMappingViolationError.prototype);
  }
}

/**
 * Generates the deterministic, canonical execution ID for a character and opportunity observation.
 */
export function buildExecutionId(characterId: number, observationId: string): string {
  return `exec_${characterId}_${observationId}`;
}

export class ExecutionTrackingService {
  /**
   * Main entry point for tracking and correlating character transactions against opportunity observations.
   *
   * @param characterId Character ID owning the execution lifecycle
   * @param options Execution tracking options (injected transactions, observations, mappings, clock)
   * @returns Detailed, auditable ExecutionTrackingSummary
   */
  static async trackCharacterExecutions(
    characterId: number,
    options?: ExecutionTrackingOptions
  ): Promise<ExecutionTrackingSummary> {
    const startedAtMs = Date.now();
    const nowIso = options?.now ? options.now() : new Date(startedAtMs).toISOString();

    // 1. Validate target character ID
    if (!Number.isSafeInteger(characterId) || characterId <= 0) {
      throw new Error(`Invalid characterId for execution tracking: ${characterId}. Must be positive safe integer.`);
    }

    // 2. Retrieve transactions
    let sourceTransactions: readonly PersistedCharacterTransaction[];
    if (options?.transactions) {
      sourceTransactions = options.transactions;
    } else {
      sourceTransactions = await IndexedDbStore.getCharacterTransactions(characterId);
    }

    // Cross-Character Guard on all input transactions
    for (const tx of sourceTransactions) {
      if (tx.character_id !== characterId) {
        throw new CrossCharacterMappingViolationError(
          `Cross-character violation: Transaction ${tx.transaction_id} belongs to character ${tx.character_id}, but was supplied for tracking character ${characterId}.`,
          tx.character_id,
          characterId,
          tx.transaction_id
        );
      }
    }

    // 3. Filter valid transactions for correlation
    const validTransactions = sourceTransactions.filter((tx) => tx.data_state !== 'INVALID');

    // 4. Retrieve candidate observations (read-only reference)
    let allObservations: readonly OpportunityObservation[];
    if (options?.observations) {
      allObservations = options.observations;
    } else {
      allObservations = await IndexedDbStore.getOpportunityObservations(undefined, 1000);
    }

    // 5. Pre-filter candidate observations based on transactions' type_ids and explicit targets
    const relevantTypeIds = new Set<number>();
    const explicitObservationIds = new Set<string>();
    const explicitOpportunityIds = new Set<string>();

    for (const tx of validTransactions) {
      relevantTypeIds.add(tx.type_id);
    }

    if (options?.directMappings) {
      for (const [txIdStr, targetRef] of Object.entries(options.directMappings)) {
        if (targetRef.startsWith('obs_')) {
          explicitObservationIds.add(targetRef);
        } else {
          explicitOpportunityIds.add(targetRef);
        }
      }
    }

    const candidateObservations = allObservations.filter(
      (obs) =>
        relevantTypeIds.has(obs.type_id) ||
        explicitObservationIds.has(obs.observation_id) ||
        explicitOpportunityIds.has(obs.opportunity_id)
    );

    // 6. Convert PersistedCharacterTransaction -> ExecutionTransactionRef
    const transactionRefs: ExecutionTransactionRef[] = validTransactions.map((tx) =>
      persistedTransactionToRef(tx)
    );

    // 7. Execute Correlation Engine
    const correlationOptions: CorrelationEngineOptions = {
      ...options?.correlationOptions,
      direct_mappings: options?.directMappings ?? options?.correlationOptions?.direct_mappings,
    };

    const correlationResults: readonly TransactionCorrelationResult[] = correlateTransactions(
      transactionRefs,
      candidateObservations,
      correlationOptions
    );

    // 8. Analyze and partition correlation results
    let directMatches = 0;
    let strongMatches = 0;
    let probableMatches = 0;
    let ambiguousMatches = 0;
    let unmatchedTransactions = 0;

    const unassignedTransactions: UnassignedTransactionRecord[] = [];
    // Map of observationId -> attributed TransactionRefs
    const attributedGroups = new Map<string, ExecutionTransactionRef[]>();
    const observationMatchLevels = new Map<string, CorrelationMatchLevel[]>();

    for (let i = 0; i < correlationResults.length; i++) {
      const res = correlationResults[i];
      const ref = transactionRefs[i];

      switch (res.match_level) {
        case 'DIRECT_MATCH':
          directMatches++;
          break;
        case 'STRONG_MATCH':
          strongMatches++;
          break;
        case 'PROBABLE_MATCH':
          probableMatches++;
          break;
        case 'AMBIGUOUS':
          ambiguousMatches++;
          unassignedTransactions.push({
            transaction_id: res.transaction_id,
            character_id: characterId,
            reason: res.reasons.join('; '),
            match_level: 'AMBIGUOUS',
            candidate_observation_ids: res.candidate_observation_ids,
          });
          break;
        case 'UNMATCHED':
          unmatchedTransactions++;
          unassignedTransactions.push({
            transaction_id: res.transaction_id,
            character_id: characterId,
            reason: res.reasons.join('; '),
            match_level: 'UNMATCHED',
            candidate_observation_ids: Object.freeze([]),
          });
          break;
      }

      // Only attribute if selected_observation_id is resolutely determined (not null)
      if (res.selected_observation_id !== null) {
        const obsId = res.selected_observation_id;
        if (!attributedGroups.has(obsId)) {
          attributedGroups.set(obsId, []);
          observationMatchLevels.set(obsId, []);
        }
        attributedGroups.get(obsId)!.push(ref);
        observationMatchLevels.get(obsId)!.push(res.match_level);
      }
    }

    // 9. Process each attributed group through Execution Outcome Engine
    const executionRecords: CharacterExecutionRecord[] = [];
    let recordsCreated = 0;
    let recordsUpdated = 0;

    for (const [obsId, refs] of attributedGroups.entries()) {
      // Find the matched observation (immutable read)
      const observation = candidateObservations.find((o) => o.observation_id === obsId);
      if (!observation) {
        // Safety guard: attributed observation missing from candidates
        continue;
      }

      // Strict Cross-Character validation within the execution group
      for (const r of refs) {
        if (r.character_id !== undefined && r.character_id !== characterId) {
          throw new CrossCharacterMappingViolationError(
            `Cross-character contamination: Group for observation ${obsId} contains transaction from character ${r.character_id}, expected ${characterId}`,
            r.character_id,
            characterId,
            r.transaction_id
          );
        }
      }

      // Partition into buys and sells sorted chronologically
      const buyTransactions = refs
        .filter((r) => r.is_buy === true)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const sellTransactions = refs
        .filter((r) => r.is_buy === false)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Determine highest match level among grouped transactions
      const levels = observationMatchLevels.get(obsId) || [];
      let groupMatchLevel: CorrelationMatchLevel = 'PROBABLE_MATCH';
      if (levels.includes('DIRECT_MATCH')) {
        groupMatchLevel = 'DIRECT_MATCH';
      } else if (levels.includes('STRONG_MATCH')) {
        groupMatchLevel = 'STRONG_MATCH';
      }

      // Calculate Execution Outcome through the pure mathematical engine
      const outcome = calculateExecutionOutcome(
        observation.quantity,
        buyTransactions,
        sellTransactions,
        {
          match_level: groupMatchLevel,
          candidate_observation_ids: Object.freeze([obsId]),
        }
      );

      // Check for existing record to preserve first_correlated_at
      const existingRecord = await IndexedDbStore.getCharacterExecutionByObservation(
        characterId,
        obsId
      );

      const executionId = buildExecutionId(characterId, obsId);
      const transactionIds = Object.freeze(refs.map((r) => r.transaction_id).sort((a, b) => a - b));

      const firstCorrelatedAt = existingRecord ? existingRecord.first_correlated_at : nowIso;

      if (existingRecord) {
        recordsUpdated++;
      } else {
        recordsCreated++;
      }

      const hasInconsistency = outcome.has_inventory_inconsistency === true;
      const dataState = hasInconsistency ? 'PARTIAL' : 'VALID';

      const record: CharacterExecutionRecord = Object.freeze({
        execution_id: executionId,
        character_id: characterId,
        observation_id: obsId,
        opportunity_id: observation.opportunity_id,
        execution_outcome: outcome,
        match_level: groupMatchLevel,
        transaction_ids: transactionIds,
        first_correlated_at: firstCorrelatedAt,
        last_updated_at: nowIso,
        correlation_engine_version: CORRELATION_ENGINE_VERSION,
        data_state: dataState,
        validation_errors: outcome.inconsistency_reasons && outcome.inconsistency_reasons.length > 0
          ? Object.freeze([...outcome.inconsistency_reasons])
          : undefined,
      });

      executionRecords.push(record);
    }

    // 10. Persist execution records atomically to IndexedDB
    if (executionRecords.length > 0) {
      await IndexedDbStore.saveCharacterExecutions(executionRecords);
    }

    const completedAtMs = Date.now();
    const durationMs = completedAtMs - startedAtMs;

    return Object.freeze({
      character_id: characterId,
      started_at: new Date(startedAtMs).toISOString(),
      completed_at: new Date(completedAtMs).toISOString(),
      duration_ms: durationMs,
      transactions_considered: validTransactions.length,
      transactions_correlated: validTransactions.length - unassignedTransactions.length,
      direct_matches: directMatches,
      strong_matches: strongMatches,
      probable_matches: probableMatches,
      ambiguous_matches: ambiguousMatches,
      unmatched_transactions: unmatchedTransactions,
      execution_records_created: recordsCreated,
      execution_records_updated: recordsUpdated,
      execution_records: Object.freeze(executionRecords),
      unassigned_transactions: Object.freeze(unassignedTransactions),
      errors: Object.freeze([]),
    });
  }

  /**
   * Recomputes executions from stored transactions idempotently.
   */
  static async recomputeCharacterExecutions(
    characterId: number,
    options?: ExecutionTrackingOptions
  ): Promise<ExecutionTrackingSummary> {
    return this.trackCharacterExecutions(characterId, {
      ...options,
      forceRecompute: true,
    });
  }

  /**
   * Retrieves a single CharacterExecutionRecord for a given character and observation.
   */
  static async getExecutionRecord(
    characterId: number,
    observationId: string
  ): Promise<CharacterExecutionRecord | null> {
    return IndexedDbStore.getCharacterExecutionByObservation(characterId, observationId);
  }

  /**
   * Retrieves all CharacterExecutionRecords for a character.
   */
  static async getCharacterExecutions(
    characterId: number,
    options?: { limit?: number; observationId?: string }
  ): Promise<CharacterExecutionRecord[]> {
    return IndexedDbStore.getCharacterExecutions(characterId, options);
  }
}
