export const WEEKLY_DECISION_SCHEMA_VERSION = 'weekly_lineup_decision_packet_v1' as const;

export type WeeklyDecisionState =
  | 'comparison_available'
  | 'structural_tie'
  | 'operator_tiebreak_required'
  | 'insufficient_evidence'
  | 'unsupported_domain';

export type WeeklyDecisionPosture =
  | 'unset'
  | 'protect_downside'
  | 'balanced'
  | 'chase_spike';

export type WeeklyDecisionReadiness =
  | 'ready'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'not_activated'
  | 'verify';

export type WeeklyTailOutlook = {
  status: WeeklyDecisionReadiness;
  scoringProfileRef: string | null;
  evidenceCutoffAt: string | null;
  generatedAt: string | null;
  modelVersion: string | null;
  calibrationVersion: string | null;
  supportedPopulation: string | null;
  quantiles: {
    p10: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p90: number | null;
    p95: number | null;
  };
  rightTail?: {
    pPointsGe25?: number | null;
    pPointsGe30?: number | null;
    pPointsGe40?: number | null;
    pTop1PctPositionWeek?: number | null;
  } | null;
  leftTail?: {
    thresholdDefinition?: string | null;
    pBust?: number | null;
    pBelowReplacement?: number | null;
    pFailTargetPositionFinish?: number | null;
  } | null;
  pathways?: {
    ceilingDrivers?: string[];
    bustDrivers?: string[];
    floorStabilizers?: string[];
  } | null;
  sourceReceipts: Array<{
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
  }>;
};

export type WeeklyDecisionCandidate = {
  playerId: string;
  playerName: string;
  position: 'QB' | 'RB' | 'WR' | 'TE';
  identityStatus: 'canonical' | 'resolved' | 'unresolved';
  observedStarter: boolean;
  tailOutlook: WeeklyTailOutlook | null;
};

export type WeeklyDecisionContext = {
  decisionId: string;
  season: number;
  week: number;
  evidenceCutoffAt: string;
  validUntil: string | null;
  leagueRef: string;
  teamRef: string;
  scoringProfileRef: string;
  scoringProfileHash: string;
  rosterSnapshotRef: string;
  rosterSnapshotHash: string;
  lineupAHash: string;
  lineupBHash: string;
  samePositionLegalSwap: boolean;
  locked: boolean;
  operatorPosture: WeeklyDecisionPosture;
  candidateA: WeeklyDecisionCandidate;
  candidateB: WeeklyDecisionCandidate;
};

export type WeeklyDecisionComparisonMetric =
  | 'p25'
  | 'p50'
  | 'p90'
  | 'distribution_dominance'
  | null;

export type WeeklyDecisionResult = {
  schemaVersion: typeof WEEKLY_DECISION_SCHEMA_VERSION;
  decisionState: WeeklyDecisionState;
  finalActionAuthority: 'human';
  preferredPlayerId: string | null;
  comparisonMetric: WeeklyDecisionComparisonMetric;
  metricDelta: number | null;
  reasons: string[];
  blockers: string[];
  missingInputs: string[];
  tailEvidenceUsed: boolean;
  correlationSensitiveWinProbability: null;
  receipt: {
    decisionId: string;
    leagueRef: string;
    teamRef: string;
    season: number;
    week: number;
    scoringProfileRef: string;
    scoringProfileHash: string;
    rosterSnapshotRef: string;
    rosterSnapshotHash: string;
    lineupAHash: string;
    lineupBHash: string;
    evidenceCutoffAt: string;
    validUntil: string | null;
    operatorPosture: WeeklyDecisionPosture;
    candidatePlayerIds: [string, string];
    tailModelVersions: [string | null, string | null];
    calibrationVersions: [string | null, string | null];
  };
};

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const REQUIRED_QUANTILES = ['p10', 'p25', 'p50', 'p75', 'p90', 'p95'] as const;
const AUTHORITATIVE_WEEKLY_TAIL_OWNER = 'TIBER-Forecast';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validIsoTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  try {
    return new Date(parsed).toISOString() === value;
  } catch {
    return false;
  }
}

function inspectTail(candidate: WeeklyDecisionCandidate, context: WeeklyDecisionContext): string[] {
  const gaps: string[] = [];
  const tail = candidate.tailOutlook;
  if (!tail) return [`${candidate.playerId}:tail_outlook_missing`];
  if (tail.status !== 'ready') gaps.push(`${candidate.playerId}:tail_status_${tail.status}`);
  if (!tail.scoringProfileRef || tail.scoringProfileRef !== context.scoringProfileRef) {
    gaps.push(`${candidate.playerId}:scoring_profile_mismatch`);
  }
  if (!validIsoTimestamp(tail.evidenceCutoffAt)) gaps.push(`${candidate.playerId}:evidence_cutoff_missing_or_invalid`);
  if (tail.evidenceCutoffAt !== context.evidenceCutoffAt) gaps.push(`${candidate.playerId}:evidence_cutoff_mismatch`);
  if (!validIsoTimestamp(tail.generatedAt)) gaps.push(`${candidate.playerId}:generated_at_missing_or_invalid`);
  if (!tail.modelVersion) gaps.push(`${candidate.playerId}:model_version_missing`);
  if (!tail.calibrationVersion) gaps.push(`${candidate.playerId}:calibration_version_missing`);
  if (!tail.supportedPopulation) gaps.push(`${candidate.playerId}:supported_population_missing`);

  if (!tail.sourceReceipts.length) {
    gaps.push(`${candidate.playerId}:source_receipts_missing`);
  } else {
    const authoritativeReceipts = tail.sourceReceipts.filter(
      (receipt) => receipt.owner === AUTHORITATIVE_WEEKLY_TAIL_OWNER,
    );
    if (!authoritativeReceipts.length) {
      gaps.push(`${candidate.playerId}:authoritative_forecast_receipt_missing`);
    } else {
      const validAuthoritativeReceipt = authoritativeReceipts.some((receipt) => {
        if (!receipt.artifactOrEndpoint || !receipt.runOrContentHash) return false;
        if (!tail.modelVersion || receipt.schemaOrModelVersion !== tail.modelVersion) return false;
        if (receipt.inputCutoffAt !== tail.evidenceCutoffAt) return false;
        if (receipt.generatedAt !== tail.generatedAt) return false;
        if (!validIsoTimestamp(receipt.observedAt)) return false;
        if (!validIsoTimestamp(receipt.retrievedAt)) return false;
        if (!validIsoTimestamp(receipt.validUntil)) return false;
        if (receipt.publicationState !== 'promoted') return false;
        if (receipt.freshness !== 'fresh') return false;
        if (receipt.coverage !== 'supported') return false;
        if (
          context.validUntil
          && new Date(receipt.validUntil!).getTime() < new Date(context.validUntil).getTime()
        ) return false;
        return true;
      });
      if (!validAuthoritativeReceipt) {
        gaps.push(`${candidate.playerId}:authoritative_forecast_receipt_invalid`);
      }
    }
  }

  for (const quantile of REQUIRED_QUANTILES) {
    if (!finite(tail.quantiles[quantile])) gaps.push(`${candidate.playerId}:${quantile}_missing`);
  }
  return gaps;
}

function buildReceipt(context: WeeklyDecisionContext): WeeklyDecisionResult['receipt'] {
  return {
    decisionId: context.decisionId,
    leagueRef: context.leagueRef,
    teamRef: context.teamRef,
    season: context.season,
    week: context.week,
    scoringProfileRef: context.scoringProfileRef,
    scoringProfileHash: context.scoringProfileHash,
    rosterSnapshotRef: context.rosterSnapshotRef,
    rosterSnapshotHash: context.rosterSnapshotHash,
    lineupAHash: context.lineupAHash,
    lineupBHash: context.lineupBHash,
    evidenceCutoffAt: context.evidenceCutoffAt,
    validUntil: context.validUntil,
    operatorPosture: context.operatorPosture,
    candidatePlayerIds: [context.candidateA.playerId, context.candidateB.playerId],
    tailModelVersions: [context.candidateA.tailOutlook?.modelVersion ?? null, context.candidateB.tailOutlook?.modelVersion ?? null],
    calibrationVersions: [context.candidateA.tailOutlook?.calibrationVersion ?? null, context.candidateB.tailOutlook?.calibrationVersion ?? null],
  };
}

function result(
  context: WeeklyDecisionContext,
  decisionState: WeeklyDecisionState,
  options: Partial<Omit<WeeklyDecisionResult, 'schemaVersion' | 'decisionState' | 'finalActionAuthority' | 'correlationSensitiveWinProbability' | 'receipt'>> = {},
): WeeklyDecisionResult {
  return {
    schemaVersion: WEEKLY_DECISION_SCHEMA_VERSION,
    decisionState,
    finalActionAuthority: 'human',
    preferredPlayerId: options.preferredPlayerId ?? null,
    comparisonMetric: options.comparisonMetric ?? null,
    metricDelta: options.metricDelta ?? null,
    reasons: options.reasons ?? [],
    blockers: options.blockers ?? [],
    missingInputs: options.missingInputs ?? [],
    tailEvidenceUsed: options.tailEvidenceUsed ?? false,
    correlationSensitiveWinProbability: null,
    receipt: buildReceipt(context),
  };
}

function compareMetric(
  context: WeeklyDecisionContext,
  metric: 'p25' | 'p50' | 'p90',
): WeeklyDecisionResult {
  const left = context.candidateA.tailOutlook!.quantiles[metric]!;
  const right = context.candidateB.tailOutlook!.quantiles[metric]!;
  const delta = left - right;
  if (delta === 0) {
    return result(context, 'structural_tie', {
      comparisonMetric: metric,
      metricDelta: 0,
      reasons: [`${metric} is identical for both complete legal lineup variants.`],
      tailEvidenceUsed: true,
    });
  }
  return result(context, 'comparison_available', {
    preferredPlayerId: delta > 0 ? context.candidateA.playerId : context.candidateB.playerId,
    comparisonMetric: metric,
    metricDelta: Math.abs(delta),
    reasons: [
      `${context.operatorPosture} posture compares the same governed weekly distribution at ${metric}.`,
      'The operator retains the final lineup action.',
    ],
    tailEvidenceUsed: true,
  });
}

function dominates(left: WeeklyTailOutlook, right: WeeklyTailOutlook): boolean {
  return REQUIRED_QUANTILES.every((quantile) => left.quantiles[quantile]! >= right.quantiles[quantile]!)
    && REQUIRED_QUANTILES.some((quantile) => left.quantiles[quantile]! > right.quantiles[quantile]!);
}

/**
 * Evaluate one controlled same-position swap between two complete legal lineup
 * states. This is intentionally narrower than a generic player-vs-player tool:
 * the caller must bind exact league/scoring/roster/lineup hashes and prove the
 * replacement is legal. Unsupported geometry and missing calibrated tail
 * evidence fail closed rather than falling back to rankings, FORGE, ADP, or a
 * hand-weighted start/sit heuristic.
 */
export function evaluateWeeklyDecision(context: WeeklyDecisionContext): WeeklyDecisionResult {
  const missingInputs: string[] = [];

  if (!context.decisionId) missingInputs.push('decision_id');
  if (!Number.isInteger(context.season) || context.season < 2000) missingInputs.push('season');
  if (!Number.isInteger(context.week) || context.week < 1 || context.week > 25) missingInputs.push('week');
  if (!validIsoTimestamp(context.evidenceCutoffAt)) missingInputs.push('evidence_cutoff_at');
  if (context.validUntil !== null && !validIsoTimestamp(context.validUntil)) missingInputs.push('valid_until');
  if (!context.leagueRef) missingInputs.push('league_ref');
  if (!context.teamRef) missingInputs.push('team_ref');
  if (!context.scoringProfileRef) missingInputs.push('scoring_profile_ref');
  if (!context.scoringProfileHash) missingInputs.push('scoring_profile_hash');
  if (!context.rosterSnapshotRef) missingInputs.push('roster_snapshot_ref');
  if (!context.rosterSnapshotHash) missingInputs.push('roster_snapshot_hash');
  if (!context.lineupAHash) missingInputs.push('lineup_a_hash');
  if (!context.lineupBHash) missingInputs.push('lineup_b_hash');

  if (missingInputs.length) {
    return result(context, 'insufficient_evidence', {
      blockers: ['The exact decision context is incomplete.'],
      missingInputs,
    });
  }

  const a = context.candidateA;
  const b = context.candidateB;
  if (!SUPPORTED_POSITIONS.has(a.position) || !SUPPORTED_POSITIONS.has(b.position)) {
    return result(context, 'unsupported_domain', {
      blockers: ['Weekly Decision v1 supports QB/RB/WR/TE only.'],
    });
  }
  if (a.playerId === b.playerId) {
    return result(context, 'unsupported_domain', {
      blockers: ['A lineup decision requires two distinct players.'],
    });
  }
  if (a.position !== b.position || !context.samePositionLegalSwap) {
    return result(context, 'unsupported_domain', {
      blockers: ['v1 only admits a proven legal same-position starter/bench swap; flex and induced multi-slot cascades remain withheld.'],
    });
  }
  if (context.locked) {
    return result(context, 'unsupported_domain', {
      blockers: ['The controlled lineup slot is locked.'],
    });
  }
  if (!a.observedStarter || b.observedStarter) {
    return result(context, 'unsupported_domain', {
      blockers: ['Variant A must preserve an observed current starter and Variant B must introduce an observed bench player.'],
    });
  }
  if (a.identityStatus === 'unresolved' || b.identityStatus === 'unresolved') {
    return result(context, 'insufficient_evidence', {
      blockers: ['Canonical player identity is unresolved.'],
      missingInputs: [
        ...(a.identityStatus === 'unresolved' ? [`${a.playerId}:canonical_identity`] : []),
        ...(b.identityStatus === 'unresolved' ? [`${b.playerId}:canonical_identity`] : []),
      ],
    });
  }

  const tailGaps = [...inspectTail(a, context), ...inspectTail(b, context)];
  if (tailGaps.length) {
    return result(context, 'insufficient_evidence', {
      blockers: [
        'Calibrated weekly tail evidence is not complete and compatible for both lineup variants.',
        'Rankings, FORGE, ADP, generic defaults, stale artifacts, and unverified source lineage are not permitted substitutes.',
      ],
      missingInputs: tailGaps,
    });
  }

  const tailA = a.tailOutlook!;
  const tailB = b.tailOutlook!;
  if (dominates(tailA, tailB)) {
    return result(context, 'comparison_available', {
      preferredPlayerId: a.playerId,
      comparisonMetric: 'distribution_dominance',
      reasons: ['Candidate A weakly dominates Candidate B across every admitted weekly quantile, with at least one strict advantage.'],
      tailEvidenceUsed: true,
    });
  }
  if (dominates(tailB, tailA)) {
    return result(context, 'comparison_available', {
      preferredPlayerId: b.playerId,
      comparisonMetric: 'distribution_dominance',
      reasons: ['Candidate B weakly dominates Candidate A across every admitted weekly quantile, with at least one strict advantage.'],
      tailEvidenceUsed: true,
    });
  }

  const identical = REQUIRED_QUANTILES.every((quantile) => tailA.quantiles[quantile] === tailB.quantiles[quantile]);
  if (identical) {
    return result(context, 'structural_tie', {
      comparisonMetric: 'distribution_dominance',
      reasons: ['The admitted weekly quantile distributions are identical for the controlled swap.'],
      tailEvidenceUsed: true,
    });
  }

  if (context.operatorPosture === 'unset') {
    return result(context, 'operator_tiebreak_required', {
      blockers: ['The distributions cross and no operator posture was supplied.'],
      reasons: ['Protect-downside, balanced, and chase-spike are explicit transforms over the same distribution; the product must not infer one silently.'],
      tailEvidenceUsed: true,
    });
  }

  if (context.operatorPosture === 'protect_downside') return compareMetric(context, 'p25');
  if (context.operatorPosture === 'chase_spike') return compareMetric(context, 'p90');
  return compareMetric(context, 'p50');
}
