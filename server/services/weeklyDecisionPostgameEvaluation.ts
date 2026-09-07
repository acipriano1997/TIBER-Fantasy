import type { WeeklyDecisionState, WeeklyTailOutlook } from '../../shared/weeklyDecisionContract';
import {
  replayWeeklyDecisionLedgerEntry,
  type WeeklyDecisionLedgerEntryV1,
} from './weeklyDecisionLedger';

export const WEEKLY_DECISION_POSTGAME_EVALUATION_VERSION =
  'weekly_decision_postgame_evaluation_v1' as const;
export const WEEKLY_DECISION_CALIBRATION_SUMMARY_VERSION =
  'weekly_decision_calibration_summary_v1' as const;

export type WeeklyDecisionRealizedOutcome = {
  season: number;
  week: number;
  leagueRef: string;
  teamRef: string;
  scoringProfileRef: string;
  scoringProfileHash: string;
  finalizedAt: string;
  source: {
    owner: string;
    artifactOrEndpoint: string;
    contentHash: string;
    publicationState: 'final';
  };
  playerPoints: Array<{
    playerId: string;
    fantasyPoints: number;
  }>;
};

export type WeeklyQuantileBucket =
  | 'below_p10'
  | 'p10_to_p25'
  | 'p25_to_p50'
  | 'p50_to_p75'
  | 'p75_to_p90'
  | 'p90_to_p95'
  | 'above_p95';

export type WeeklyPlayerPostgameDiagnostic = {
  playerId: string;
  realizedFantasyPoints: number;
  quantileBucket: WeeklyQuantileBucket | null;
  central50Hit: boolean | null;
  central80Hit: boolean | null;
  medianAbsoluteError: number | null;
  modelVersion: string | null;
  calibrationVersion: string | null;
};

export type WeeklyDecisionSelectionOutcome =
  | 'preferred_outscored_alternative'
  | 'preferred_tied_alternative'
  | 'preferred_underperformed_alternative'
  | null;

export type WeeklyDecisionPostgameEvaluation = {
  evaluationVersion: typeof WEEKLY_DECISION_POSTGAME_EVALUATION_VERSION;
  status: 'evaluated' | 'invalid_pregame_receipt' | 'invalid_realized_outcome';
  processAssessment:
    | 'pregame_preference_process_verified'
    | 'pregame_nonpreference_process_verified'
    | 'not_evaluable';
  pregameDecisionState: WeeklyDecisionState | null;
  pregamePreferredPlayerId: string | null;
  selectionOutcome: WeeklyDecisionSelectionOutcome;
  outcomeCanRewritePregameReceipt: false;
  outcomeCanRetroactivelyValidateProcess: false;
  calibrationInterpretation: 'single_case_diagnostic_only' | 'not_available';
  diagnostics: WeeklyPlayerPostgameDiagnostic[];
  blockers: string[];
  receipt: {
    ledgerEntrySha256: string | null;
    decisionId: string | null;
    evidenceCutoffAt: string | null;
    realizedOutcomeContentHash: string | null;
    finalizedAt: string | null;
  };
};

export type WeeklyDecisionCalibrationSummary = {
  summaryVersion: typeof WEEKLY_DECISION_CALIBRATION_SUMMARY_VERSION;
  status: 'reportable' | 'insufficient_sample';
  playerOutcomeCount: number;
  minimumPlayerOutcomes: number;
  central50: {
    expectedCoverage: 0.5;
    empiricalCoverage: number | null;
    absoluteDeviation: number | null;
  };
  central80: {
    expectedCoverage: 0.8;
    empiricalCoverage: number | null;
    absoluteDeviation: number | null;
  };
  interpretation: 'cohort_coverage_diagnostic_not_model_grade';
};

function canonicalIso(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  try {
    return new Date(parsed).toISOString() === value;
  } catch {
    return false;
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function quantileDiagnostic(
  playerId: string,
  realizedFantasyPoints: number,
  tail: WeeklyTailOutlook | null,
): WeeklyPlayerPostgameDiagnostic {
  const q = tail?.quantiles;
  if (
    !q
    || !finite(q.p10)
    || !finite(q.p25)
    || !finite(q.p50)
    || !finite(q.p75)
    || !finite(q.p90)
    || !finite(q.p95)
  ) {
    return {
      playerId,
      realizedFantasyPoints,
      quantileBucket: null,
      central50Hit: null,
      central80Hit: null,
      medianAbsoluteError: null,
      modelVersion: tail?.modelVersion ?? null,
      calibrationVersion: tail?.calibrationVersion ?? null,
    };
  }

  let quantileBucket: WeeklyQuantileBucket;
  if (realizedFantasyPoints < q.p10) quantileBucket = 'below_p10';
  else if (realizedFantasyPoints < q.p25) quantileBucket = 'p10_to_p25';
  else if (realizedFantasyPoints < q.p50) quantileBucket = 'p25_to_p50';
  else if (realizedFantasyPoints < q.p75) quantileBucket = 'p50_to_p75';
  else if (realizedFantasyPoints < q.p90) quantileBucket = 'p75_to_p90';
  else if (realizedFantasyPoints < q.p95) quantileBucket = 'p90_to_p95';
  else quantileBucket = 'above_p95';

  return {
    playerId,
    realizedFantasyPoints,
    quantileBucket,
    central50Hit: realizedFantasyPoints >= q.p25 && realizedFantasyPoints <= q.p75,
    central80Hit: realizedFantasyPoints >= q.p10 && realizedFantasyPoints <= q.p90,
    medianAbsoluteError: Math.abs(realizedFantasyPoints - q.p50),
    modelVersion: tail?.modelVersion ?? null,
    calibrationVersion: tail?.calibrationVersion ?? null,
  };
}

function invalidEvaluation(
  status: 'invalid_pregame_receipt' | 'invalid_realized_outcome',
  blockers: string[],
  entry?: WeeklyDecisionLedgerEntryV1,
  outcome?: WeeklyDecisionRealizedOutcome,
): WeeklyDecisionPostgameEvaluation {
  return {
    evaluationVersion: WEEKLY_DECISION_POSTGAME_EVALUATION_VERSION,
    status,
    processAssessment: 'not_evaluable',
    pregameDecisionState: null,
    pregamePreferredPlayerId: null,
    selectionOutcome: null,
    outcomeCanRewritePregameReceipt: false,
    outcomeCanRetroactivelyValidateProcess: false,
    calibrationInterpretation: 'not_available',
    diagnostics: [],
    blockers,
    receipt: {
      ledgerEntrySha256: entry?.hashes?.entrySha256 ?? null,
      decisionId: entry?.contextSnapshot?.decisionId ?? null,
      evidenceCutoffAt: entry?.asOf?.evidenceCutoffAt ?? null,
      realizedOutcomeContentHash: outcome?.source?.contentHash ?? null,
      finalizedAt: outcome?.finalizedAt ?? null,
    },
  };
}

function validateOutcome(
  entry: WeeklyDecisionLedgerEntryV1,
  outcome: WeeklyDecisionRealizedOutcome,
): string[] {
  const blockers: string[] = [];
  const context = entry.contextSnapshot;
  if (!Number.isInteger(outcome.season) || outcome.season !== context.season) blockers.push('season_mismatch');
  if (!Number.isInteger(outcome.week) || outcome.week !== context.week) blockers.push('week_mismatch');
  if (outcome.leagueRef !== context.leagueRef) blockers.push('league_mismatch');
  if (outcome.teamRef !== context.teamRef) blockers.push('team_mismatch');
  if (outcome.scoringProfileRef !== context.scoringProfileRef) blockers.push('scoring_profile_ref_mismatch');
  if (outcome.scoringProfileHash !== context.scoringProfileHash) blockers.push('scoring_profile_hash_mismatch');
  if (!canonicalIso(outcome.finalizedAt)) blockers.push('finalized_at_invalid');
  else if (new Date(outcome.finalizedAt).getTime() <= new Date(context.evidenceCutoffAt).getTime()) {
    blockers.push('finalized_at_not_after_evidence_cutoff');
  }
  if (!outcome.source.owner) blockers.push('outcome_source_owner_missing');
  if (!outcome.source.artifactOrEndpoint) blockers.push('outcome_source_endpoint_missing');
  if (!outcome.source.contentHash) blockers.push('outcome_content_hash_missing');
  if (outcome.source.publicationState !== 'final') blockers.push('outcome_not_final');

  const pointsByPlayer = new Map<string, number>();
  for (const row of outcome.playerPoints) {
    if (!row.playerId || !finite(row.fantasyPoints)) {
      blockers.push('malformed_player_outcome');
      continue;
    }
    if (pointsByPlayer.has(row.playerId)) blockers.push(`duplicate_player_outcome:${row.playerId}`);
    pointsByPlayer.set(row.playerId, row.fantasyPoints);
  }

  for (const playerId of [context.candidateA.playerId, context.candidateB.playerId]) {
    if (!pointsByPlayer.has(playerId)) blockers.push(`missing_player_outcome:${playerId}`);
  }
  return blockers;
}

/**
 * Evaluate the process after games are final without contaminating the original
 * decision. Receipt integrity/determinism is checked first. Realized outcomes
 * are then bound to the same league/team/scoring identity, and only diagnostics
 * are produced. Winning or losing the realized comparison never changes the
 * pregame process assessment.
 */
export function evaluateWeeklyDecisionPostgame(
  entry: WeeklyDecisionLedgerEntryV1,
  outcome: WeeklyDecisionRealizedOutcome,
): WeeklyDecisionPostgameEvaluation {
  const replay = replayWeeklyDecisionLedgerEntry(entry);
  if (replay.integrity !== 'verified' || replay.determinism !== 'matched' || !replay.replayedResult) {
    return invalidEvaluation(
      'invalid_pregame_receipt',
      [`pregame_replay_${replay.integrity}_${replay.determinism}`, ...replay.reasons],
      entry,
      outcome,
    );
  }

  const outcomeBlockers = validateOutcome(entry, outcome);
  if (outcomeBlockers.length) {
    return invalidEvaluation('invalid_realized_outcome', outcomeBlockers, entry, outcome);
  }

  const context = entry.contextSnapshot;
  const result = replay.replayedResult;
  const pointsByPlayer = new Map(outcome.playerPoints.map((row) => [row.playerId, row.fantasyPoints]));
  const candidateRows = [context.candidateA, context.candidateB];
  const diagnostics = candidateRows.map((candidate) =>
    quantileDiagnostic(
      candidate.playerId,
      pointsByPlayer.get(candidate.playerId)!,
      candidate.tailOutlook,
    ),
  );

  let selectionOutcome: WeeklyDecisionSelectionOutcome = null;
  if (result.preferredPlayerId) {
    const alternative = candidateRows.find((candidate) => candidate.playerId !== result.preferredPlayerId)!;
    const preferredPoints = pointsByPlayer.get(result.preferredPlayerId)!;
    const alternativePoints = pointsByPlayer.get(alternative.playerId)!;
    selectionOutcome = preferredPoints > alternativePoints
      ? 'preferred_outscored_alternative'
      : preferredPoints === alternativePoints
        ? 'preferred_tied_alternative'
        : 'preferred_underperformed_alternative';
  }

  return {
    evaluationVersion: WEEKLY_DECISION_POSTGAME_EVALUATION_VERSION,
    status: 'evaluated',
    processAssessment: result.preferredPlayerId
      ? 'pregame_preference_process_verified'
      : 'pregame_nonpreference_process_verified',
    pregameDecisionState: result.decisionState,
    pregamePreferredPlayerId: result.preferredPlayerId,
    selectionOutcome,
    outcomeCanRewritePregameReceipt: false,
    outcomeCanRetroactivelyValidateProcess: false,
    calibrationInterpretation: diagnostics.some((row) => row.quantileBucket !== null)
      ? 'single_case_diagnostic_only'
      : 'not_available',
    diagnostics,
    blockers: [],
    receipt: {
      ledgerEntrySha256: entry.hashes.entrySha256,
      decisionId: context.decisionId,
      evidenceCutoffAt: context.evidenceCutoffAt,
      realizedOutcomeContentHash: outcome.source.contentHash,
      finalizedAt: outcome.finalizedAt,
    },
  };
}

/**
 * Aggregate interval coverage across finalized player outcomes. The summary is
 * deliberately descriptive: it reports empirical coverage and deviation from
 * nominal intervals, but never converts those into a universal model grade.
 * A minimum sample prevents a tiny set of games from masquerading as
 * calibration evidence.
 */
export function summarizeWeeklyDecisionPostgameCalibration(
  evaluations: readonly WeeklyDecisionPostgameEvaluation[],
  minimumPlayerOutcomes = 20,
): WeeklyDecisionCalibrationSummary {
  const eligible = evaluations
    .filter((evaluation) => evaluation.status === 'evaluated')
    .flatMap((evaluation) => evaluation.diagnostics)
    .filter((row) => row.central50Hit !== null && row.central80Hit !== null);

  const playerOutcomeCount = eligible.length;
  const empirical50 = playerOutcomeCount
    ? eligible.filter((row) => row.central50Hit === true).length / playerOutcomeCount
    : null;
  const empirical80 = playerOutcomeCount
    ? eligible.filter((row) => row.central80Hit === true).length / playerOutcomeCount
    : null;

  return {
    summaryVersion: WEEKLY_DECISION_CALIBRATION_SUMMARY_VERSION,
    status: playerOutcomeCount >= minimumPlayerOutcomes ? 'reportable' : 'insufficient_sample',
    playerOutcomeCount,
    minimumPlayerOutcomes,
    central50: {
      expectedCoverage: 0.5,
      empiricalCoverage: empirical50,
      absoluteDeviation: empirical50 === null ? null : Math.abs(empirical50 - 0.5),
    },
    central80: {
      expectedCoverage: 0.8,
      empiricalCoverage: empirical80,
      absoluteDeviation: empirical80 === null ? null : Math.abs(empirical80 - 0.8),
    },
    interpretation: 'cohort_coverage_diagnostic_not_model_grade',
  };
}
