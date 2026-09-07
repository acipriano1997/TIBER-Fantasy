import { createHash } from 'node:crypto';
import {
  WEEKLY_DECISION_SCHEMA_VERSION,
  evaluateWeeklyDecision,
  type WeeklyDecisionContext,
  type WeeklyDecisionResult,
} from '../../shared/weeklyDecisionContract';

export const WEEKLY_DECISION_LEDGER_VERSION = 'weekly_decision_ledger_entry_v1' as const;
export const WEEKLY_DECISION_CANONICALIZATION = 'json_sorted_keys_v1' as const;

export type WeeklyDecisionLineageReceipt = {
  candidatePlayerId: string;
  owner: string;
  artifactOrEndpoint: string;
  schemaOrModelVersion: string | null;
  runOrContentHash: string | null;
  evidenceWindow: string | null;
  observedAt: string | null;
  inputCutoffAt: string | null;
  generatedAt: string | null;
  retrievedAt: string | null;
  validUntil: string | null;
  publicationState: string | null;
  freshness: string | null;
  coverage: string | null;
};

export type WeeklyDecisionLedgerEntryV1 = {
  ledgerVersion: typeof WEEKLY_DECISION_LEDGER_VERSION;
  evaluatorSchemaVersion: typeof WEEKLY_DECISION_SCHEMA_VERSION;
  recordedAt: string;
  asOf: {
    evidenceCutoffAt: string;
    validUntil: string | null;
  };
  contextSnapshot: WeeklyDecisionContext;
  resultSnapshot: WeeklyDecisionResult;
  lineage: WeeklyDecisionLineageReceipt[];
  immutability: {
    hashAlgorithm: 'sha256';
    canonicalization: typeof WEEKLY_DECISION_CANONICALIZATION;
    replayUsesFrozenContextOnly: true;
    liveDataAllowedOnReplay: false;
    wallClockAllowedOnReplay: false;
  };
  hashes: {
    contextSha256: string;
    resultSha256: string;
    lineageSha256: string;
    entrySha256: string;
  };
};

export type WeeklyDecisionReplayResult = {
  integrity: 'verified' | 'tampered' | 'unsupported_version';
  determinism: 'matched' | 'mismatch' | 'not_run';
  reasons: string[];
  replayedResult: WeeklyDecisionResult | null;
};

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonicalize(value: unknown): string {
  const jsonValue = JSON.parse(JSON.stringify(value)) as unknown;

  function normalize(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  }

  return JSON.stringify(normalize(jsonValue));
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function validIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  try {
    return new Date(parsed).toISOString() === value;
  } catch {
    return false;
  }
}

function collectLineage(context: WeeklyDecisionContext): WeeklyDecisionLineageReceipt[] {
  return [context.candidateA, context.candidateB].flatMap((candidate) =>
    (candidate.tailOutlook?.sourceReceipts ?? []).map((receipt) => ({
      candidatePlayerId: candidate.playerId,
      ...receipt,
    })),
  );
}

function entryHashPayload(entry: Omit<WeeklyDecisionLedgerEntryV1, 'hashes'> & {
  hashes: Omit<WeeklyDecisionLedgerEntryV1['hashes'], 'entrySha256'>;
}): unknown {
  return entry;
}

/**
 * Freeze a weekly decision into a tamper-evident ledger entry.
 *
 * recordedAt is supplied by the caller and is audit metadata only. The decision
 * itself is evaluated entirely from the provided context. Frozen replay never
 * reads live league state, current projections, or the wall clock.
 */
export function createWeeklyDecisionLedgerEntry(
  context: WeeklyDecisionContext,
  recordedAt: string,
): WeeklyDecisionLedgerEntryV1 {
  if (!validIsoTimestamp(recordedAt)) {
    throw new Error('recordedAt must be a canonical ISO-8601 UTC timestamp');
  }

  const frozenContext = jsonClone(context);
  const frozenResult = jsonClone(evaluateWeeklyDecision(frozenContext));
  const lineage = jsonClone(collectLineage(frozenContext));

  const contextSha256 = sha256(frozenContext);
  const resultSha256 = sha256(frozenResult);
  const lineageSha256 = sha256(lineage);

  const base = {
    ledgerVersion: WEEKLY_DECISION_LEDGER_VERSION,
    evaluatorSchemaVersion: WEEKLY_DECISION_SCHEMA_VERSION,
    recordedAt,
    asOf: {
      evidenceCutoffAt: frozenContext.evidenceCutoffAt,
      validUntil: frozenContext.validUntil,
    },
    contextSnapshot: frozenContext,
    resultSnapshot: frozenResult,
    lineage,
    immutability: {
      hashAlgorithm: 'sha256' as const,
      canonicalization: WEEKLY_DECISION_CANONICALIZATION,
      replayUsesFrozenContextOnly: true as const,
      liveDataAllowedOnReplay: false as const,
      wallClockAllowedOnReplay: false as const,
    },
    hashes: {
      contextSha256,
      resultSha256,
      lineageSha256,
    },
  };

  const entrySha256 = sha256(entryHashPayload(base));
  return jsonClone({
    ...base,
    hashes: {
      ...base.hashes,
      entrySha256,
    },
  });
}

/**
 * Verify all frozen hashes before replaying the decision from its snapshot.
 * Any mutation fails closed and prevents replay. A verified entry is then
 * re-evaluated from contextSnapshot only and compared byte-for-byte through
 * canonical SHA-256 hashing to detect evaluator drift or nondeterminism.
 */
export function replayWeeklyDecisionLedgerEntry(
  entry: WeeklyDecisionLedgerEntryV1,
): WeeklyDecisionReplayResult {
  if (
    entry.ledgerVersion !== WEEKLY_DECISION_LEDGER_VERSION
    || entry.evaluatorSchemaVersion !== WEEKLY_DECISION_SCHEMA_VERSION
  ) {
    return {
      integrity: 'unsupported_version',
      determinism: 'not_run',
      reasons: ['The ledger or evaluator schema version is unsupported.'],
      replayedResult: null,
    };
  }

  const reasons: string[] = [];
  if (!validIsoTimestamp(entry.recordedAt)) reasons.push('recorded_at_invalid');
  if (entry.asOf.evidenceCutoffAt !== entry.contextSnapshot.evidenceCutoffAt) {
    reasons.push('as_of_evidence_cutoff_mismatch');
  }
  if (entry.asOf.validUntil !== entry.contextSnapshot.validUntil) {
    reasons.push('as_of_valid_until_mismatch');
  }
  if (entry.resultSnapshot.receipt.evidenceCutoffAt !== entry.contextSnapshot.evidenceCutoffAt) {
    reasons.push('result_receipt_evidence_cutoff_mismatch');
  }
  if (entry.resultSnapshot.receipt.validUntil !== entry.contextSnapshot.validUntil) {
    reasons.push('result_receipt_valid_until_mismatch');
  }
  if (sha256(entry.contextSnapshot) !== entry.hashes.contextSha256) reasons.push('context_hash_mismatch');
  if (sha256(entry.resultSnapshot) !== entry.hashes.resultSha256) reasons.push('result_hash_mismatch');
  if (sha256(entry.lineage) !== entry.hashes.lineageSha256) reasons.push('lineage_hash_mismatch');

  const baseForEntryHash = {
    ledgerVersion: entry.ledgerVersion,
    evaluatorSchemaVersion: entry.evaluatorSchemaVersion,
    recordedAt: entry.recordedAt,
    asOf: entry.asOf,
    contextSnapshot: entry.contextSnapshot,
    resultSnapshot: entry.resultSnapshot,
    lineage: entry.lineage,
    immutability: entry.immutability,
    hashes: {
      contextSha256: entry.hashes.contextSha256,
      resultSha256: entry.hashes.resultSha256,
      lineageSha256: entry.hashes.lineageSha256,
    },
  };
  if (sha256(entryHashPayload(baseForEntryHash)) !== entry.hashes.entrySha256) {
    reasons.push('entry_hash_mismatch');
  }

  if (reasons.length > 0) {
    return {
      integrity: 'tampered',
      determinism: 'not_run',
      reasons,
      replayedResult: null,
    };
  }

  const replayedResult = evaluateWeeklyDecision(jsonClone(entry.contextSnapshot));
  if (sha256(replayedResult) !== entry.hashes.resultSha256) {
    return {
      integrity: 'verified',
      determinism: 'mismatch',
      reasons: ['Frozen replay did not reproduce the recorded result.'],
      replayedResult,
    };
  }

  return {
    integrity: 'verified',
    determinism: 'matched',
    reasons: [],
    replayedResult,
  };
}
