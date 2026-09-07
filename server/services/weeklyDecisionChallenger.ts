import {
  replayWeeklyDecisionLedgerEntry,
  type WeeklyDecisionLedgerEntryV1,
} from './weeklyDecisionLedger';

export const WEEKLY_DECISION_CHALLENGER_VERSION = 'weekly_decision_challenger_audit_v1' as const;

export type WeeklyDecisionChallengerState =
  | 'comparison_available'
  | 'structural_tie'
  | 'insufficient_evidence'
  | 'unsupported_domain'
  | 'champion_unverifiable';

export type WeeklyDecisionChallengerPointEvidence = {
  playerId: string;
  status: 'ready' | 'stale' | 'unavailable' | 'unsupported';
  scoringProfileRef: string | null;
  projectedPoints: number | null;
  sourceFamily: 'platform_projection' | 'external_consensus';
  producer: string | null;
  methodology: 'independent_point_projection';
  modelVersion: string | null;
  sourceHash: string | null;
  inputCutoffAt: string | null;
  generatedAt: string | null;
  retrievedAt: string | null;
};

export type WeeklyDecisionChallengerEvidencePacket = {
  candidateA: WeeklyDecisionChallengerPointEvidence;
  candidateB: WeeklyDecisionChallengerPointEvidence;
};

export type WeeklyDecisionChallengerAudit = {
  schemaVersion: typeof WEEKLY_DECISION_CHALLENGER_VERSION;
  purpose: 'verification_only';
  decisionAuthority: 'none';
  finalActionAuthority: 'human';
  state: WeeklyDecisionChallengerState;
  preferredPlayerId: string | null;
  comparisonMetric: 'projected_points' | null;
  pointDelta: number | null;
  championComparison: 'agree' | 'disagree' | 'not_comparable';
  confidenceEffect: 'none';
  independence: {
    method: 'single_point_projection';
    usesChampionTailQuantiles: false;
    usesChampionOperatorPosture: false;
    usesChampionPreferredPlayerAsInput: false;
    requiresDistinctProducerFromChampionLineage: true;
    requiresDistinctSourceHashFromChampionLineage: true;
  };
  blockers: string[];
  missingInputs: string[];
  receipt: {
    championEntrySha256: string | null;
    championDecisionId: string | null;
    championDecisionState: string | null;
    championPreferredPlayerId: string | null;
    candidatePlayerIds: [string | null, string | null];
    challengerProducers: [string | null, string | null];
    challengerSourceHashes: [string | null, string | null];
  };
};

function validIso(value: string | null | undefined): value is string {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  try {
    return new Date(parsed).toISOString() === value;
  } catch {
    return false;
  }
}

function finiteProjection(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function baseAudit(entry: WeeklyDecisionLedgerEntryV1 | null): WeeklyDecisionChallengerAudit {
  return {
    schemaVersion: WEEKLY_DECISION_CHALLENGER_VERSION,
    purpose: 'verification_only',
    decisionAuthority: 'none',
    finalActionAuthority: 'human',
    state: 'insufficient_evidence',
    preferredPlayerId: null,
    comparisonMetric: null,
    pointDelta: null,
    championComparison: 'not_comparable',
    confidenceEffect: 'none',
    independence: {
      method: 'single_point_projection',
      usesChampionTailQuantiles: false,
      usesChampionOperatorPosture: false,
      usesChampionPreferredPlayerAsInput: false,
      requiresDistinctProducerFromChampionLineage: true,
      requiresDistinctSourceHashFromChampionLineage: true,
    },
    blockers: [],
    missingInputs: [],
    receipt: {
      championEntrySha256: entry?.hashes.entrySha256 ?? null,
      championDecisionId: entry?.resultSnapshot.receipt.decisionId ?? null,
      championDecisionState: entry?.resultSnapshot.decisionState ?? null,
      championPreferredPlayerId: entry?.resultSnapshot.preferredPlayerId ?? null,
      candidatePlayerIds: [
        entry?.contextSnapshot.candidateA.playerId ?? null,
        entry?.contextSnapshot.candidateB.playerId ?? null,
      ],
      challengerProducers: [null, null],
      challengerSourceHashes: [null, null],
    },
  };
}

function withEvidenceReceipt(
  audit: WeeklyDecisionChallengerAudit,
  evidence: WeeklyDecisionChallengerEvidencePacket,
): WeeklyDecisionChallengerAudit {
  return {
    ...audit,
    receipt: {
      ...audit.receipt,
      challengerProducers: [evidence.candidateA.producer, evidence.candidateB.producer],
      challengerSourceHashes: [evidence.candidateA.sourceHash, evidence.candidateB.sourceHash],
    },
  };
}

function championComparison(
  entry: WeeklyDecisionLedgerEntryV1,
  challengerPreferredPlayerId: string | null,
): WeeklyDecisionChallengerAudit['championComparison'] {
  const champion = entry.resultSnapshot;
  if (
    champion.decisionState !== 'comparison_available'
    || !champion.preferredPlayerId
    || !challengerPreferredPlayerId
  ) return 'not_comparable';
  return champion.preferredPlayerId === challengerPreferredPlayerId ? 'agree' : 'disagree';
}

function inspectPointEvidence(
  label: 'candidateA' | 'candidateB',
  evidence: WeeklyDecisionChallengerPointEvidence,
  expectedPlayerId: string,
  scoringProfileRef: string,
  championEvidenceCutoffMs: number,
  championRecordedAtMs: number,
  championProducers: ReadonlySet<string>,
  championSourceHashes: ReadonlySet<string>,
): string[] {
  const gaps: string[] = [];
  const prefix = `${label}:${expectedPlayerId}`;

  if (evidence.playerId !== expectedPlayerId) gaps.push(`${prefix}:player_identity_mismatch`);
  if (evidence.status !== 'ready') gaps.push(`${prefix}:status_${evidence.status}`);
  if (evidence.scoringProfileRef !== scoringProfileRef) gaps.push(`${prefix}:scoring_profile_mismatch`);
  if (!finiteProjection(evidence.projectedPoints)) gaps.push(`${prefix}:projected_points_missing_or_invalid`);
  if (evidence.methodology !== 'independent_point_projection') gaps.push(`${prefix}:methodology_not_independent_point_projection`);
  if (evidence.sourceFamily !== 'platform_projection' && evidence.sourceFamily !== 'external_consensus') {
    gaps.push(`${prefix}:source_family_unsupported`);
  }
  if (!evidence.producer) gaps.push(`${prefix}:producer_missing`);
  if (!evidence.modelVersion) gaps.push(`${prefix}:model_version_missing`);
  if (!evidence.sourceHash) gaps.push(`${prefix}:source_hash_missing`);

  if (evidence.producer && championProducers.has(evidence.producer)) {
    gaps.push(`${prefix}:producer_overlaps_champion_lineage`);
  }
  if (evidence.sourceHash && championSourceHashes.has(evidence.sourceHash)) {
    gaps.push(`${prefix}:source_hash_overlaps_champion_lineage`);
  }

  for (const [field, value] of [
    ['input_cutoff_at', evidence.inputCutoffAt],
    ['generated_at', evidence.generatedAt],
    ['retrieved_at', evidence.retrievedAt],
  ] as const) {
    if (!validIso(value)) gaps.push(`${prefix}:${field}_missing_or_invalid`);
  }

  if (
    validIso(evidence.inputCutoffAt)
    && Date.parse(evidence.inputCutoffAt) > championEvidenceCutoffMs
  ) gaps.push(`${prefix}:input_cutoff_after_champion_cutoff`);
  if (
    validIso(evidence.generatedAt)
    && Date.parse(evidence.generatedAt) > championRecordedAtMs
  ) gaps.push(`${prefix}:generated_after_champion_recorded_at`);
  if (
    validIso(evidence.retrievedAt)
    && Date.parse(evidence.retrievedAt) > championRecordedAtMs
  ) gaps.push(`${prefix}:retrieved_after_champion_recorded_at`);
  if (
    validIso(evidence.inputCutoffAt)
    && validIso(evidence.generatedAt)
    && Date.parse(evidence.generatedAt) < Date.parse(evidence.inputCutoffAt)
  ) gaps.push(`${prefix}:generated_before_input_cutoff`);
  if (
    validIso(evidence.generatedAt)
    && validIso(evidence.retrievedAt)
    && Date.parse(evidence.retrievedAt) < Date.parse(evidence.generatedAt)
  ) gaps.push(`${prefix}:retrieved_before_generated`);

  return gaps;
}

/**
 * Run a deliberately simpler and methodologically different audit challenger
 * against a verified frozen Weekly Decision ledger entry.
 *
 * The challenger sees only two independent single-point projections plus the
 * frozen identity/scoring/as-of boundary. It never sees champion quantiles,
 * operator posture, or the champion preferred player as an input to its own
 * comparison. Agreement is diagnostic only and can never increase confidence.
 */
export function auditWeeklyDecisionWithIndependentChallenger(
  rawEntry: unknown,
  evidence: WeeklyDecisionChallengerEvidencePacket,
): WeeklyDecisionChallengerAudit {
  const replay = replayWeeklyDecisionLedgerEntry(rawEntry);
  if (replay.integrity !== 'verified' || replay.determinism !== 'matched') {
    return {
      ...baseAudit(null),
      state: 'champion_unverifiable',
      blockers: [`Champion ledger replay failed: ${replay.integrity}/${replay.determinism}.`],
    };
  }

  const entry = rawEntry as WeeklyDecisionLedgerEntryV1;
  let audit = withEvidenceReceipt(baseAudit(entry), evidence);
  const evidenceCutoffMs = Date.parse(entry.asOf.evidenceCutoffAt);
  const recordedAtMs = Date.parse(entry.recordedAt);
  if (!Number.isFinite(evidenceCutoffMs) || !Number.isFinite(recordedAtMs)) {
    return {
      ...audit,
      state: 'champion_unverifiable',
      blockers: ['Champion as-of timestamps are not replay-safe.'],
    };
  }

  const championProducers = new Set(entry.lineage.map((receipt) => receipt.owner).filter(Boolean));
  const championSourceHashes = new Set(
    entry.lineage.map((receipt) => receipt.runOrContentHash).filter((value): value is string => Boolean(value)),
  );

  const gaps = [
    ...inspectPointEvidence(
      'candidateA',
      evidence.candidateA,
      entry.contextSnapshot.candidateA.playerId,
      entry.contextSnapshot.scoringProfileRef,
      evidenceCutoffMs,
      recordedAtMs,
      championProducers,
      championSourceHashes,
    ),
    ...inspectPointEvidence(
      'candidateB',
      evidence.candidateB,
      entry.contextSnapshot.candidateB.playerId,
      entry.contextSnapshot.scoringProfileRef,
      evidenceCutoffMs,
      recordedAtMs,
      championProducers,
      championSourceHashes,
    ),
  ];

  if (gaps.length > 0) {
    return {
      ...audit,
      state: 'insufficient_evidence',
      blockers: [
        'Independent challenger evidence is incomplete, future-leaking, scoring-incompatible, or overlaps champion lineage.',
      ],
      missingInputs: gaps,
    };
  }

  const left = evidence.candidateA.projectedPoints!;
  const right = evidence.candidateB.projectedPoints!;
  if (left === right) {
    return {
      ...audit,
      state: 'structural_tie',
      comparisonMetric: 'projected_points',
      pointDelta: 0,
    };
  }

  const preferredPlayerId = left > right
    ? entry.contextSnapshot.candidateA.playerId
    : entry.contextSnapshot.candidateB.playerId;
  audit = {
    ...audit,
    state: 'comparison_available',
    preferredPlayerId,
    comparisonMetric: 'projected_points',
    pointDelta: Math.abs(left - right),
  };

  return {
    ...audit,
    championComparison: championComparison(entry, preferredPlayerId),
  };
}
