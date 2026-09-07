import {
  evaluateWeeklyDecision,
  type WeeklyDecisionContext,
  type WeeklyDecisionResult,
} from './weeklyDecisionContract';

export const WEEKLY_DECISION_CHALLENGER_VERSION =
  'weekly_incumbent_baseline_challenger_v1' as const;

export type WeeklyDecisionChallengerState =
  | 'baseline_available'
  | 'insufficient_context'
  | 'unsupported_domain';

export type WeeklyDecisionChallengerResult = {
  challengerVersion: typeof WEEKLY_DECISION_CHALLENGER_VERSION;
  state: WeeklyDecisionChallengerState;
  finalActionAuthority: 'human';
  preferredPlayerId: string | null;
  baselineAction: 'keep_observed_starter' | null;
  methodology: 'incumbent_preservation_no_model';
  modelInputsUsed: false;
  tailEvidenceUsed: false;
  confidenceBoostAllowed: false;
  reasons: string[];
  blockers: string[];
};

export type WeeklyDecisionChallengeRelation =
  | 'agreement'
  | 'disagreement'
  | 'champion_abstained'
  | 'challenger_abstained'
  | 'both_abstained';

export type WeeklyDecisionChallengeComparison = {
  champion: WeeklyDecisionResult;
  challenger: WeeklyDecisionChallengerResult;
  relation: WeeklyDecisionChallengeRelation;
  confidenceBoostAllowed: false;
  finalActionAuthority: 'human';
};

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

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

function completeContext(context: WeeklyDecisionContext): boolean {
  return Boolean(
    context.decisionId
    && Number.isInteger(context.season)
    && context.season >= 2000
    && Number.isInteger(context.week)
    && context.week >= 1
    && context.week <= 25
    && validIsoTimestamp(context.evidenceCutoffAt)
    && (context.validUntil === null || validIsoTimestamp(context.validUntil))
    && context.leagueRef
    && context.teamRef
    && context.scoringProfileRef
    && context.scoringProfileHash
    && context.rosterSnapshotRef
    && context.rosterSnapshotHash
    && context.lineupAHash
    && context.lineupBHash,
  );
}

/**
 * Deliberately simple challenger for Weekly Decisions v1.
 *
 * This is not a second projection model and it does not consume FORGE,
 * rankings, ADP, Forecast quantiles, calibration output, or source receipts.
 * It is an incumbent-preservation baseline: when the controlled decision
 * geometry is valid, it says "keep the observed starter". Its purpose is to
 * expose when the champion model is asking the operator to change state, not to
 * provide alternate action authority.
 */
export function evaluateWeeklyDecisionChallenger(
  context: WeeklyDecisionContext,
): WeeklyDecisionChallengerResult {
  const base: Omit<WeeklyDecisionChallengerResult, 'state' | 'preferredPlayerId' | 'baselineAction' | 'reasons' | 'blockers'> = {
    challengerVersion: WEEKLY_DECISION_CHALLENGER_VERSION,
    finalActionAuthority: 'human',
    methodology: 'incumbent_preservation_no_model',
    modelInputsUsed: false,
    tailEvidenceUsed: false,
    confidenceBoostAllowed: false,
  };

  if (!completeContext(context)) {
    return {
      ...base,
      state: 'insufficient_context',
      preferredPlayerId: null,
      baselineAction: null,
      reasons: [],
      blockers: ['The challenger requires the same exact, valid league/team/roster/lineup/as-of identity envelope as the champion.'],
    };
  }

  const a = context.candidateA;
  const b = context.candidateB;
  if (
    !SUPPORTED_POSITIONS.has(a.position)
    || !SUPPORTED_POSITIONS.has(b.position)
    || a.playerId === b.playerId
    || a.position !== b.position
    || !context.samePositionLegalSwap
    || context.locked
    || !a.observedStarter
    || b.observedStarter
    || a.identityStatus === 'unresolved'
    || b.identityStatus === 'unresolved'
  ) {
    return {
      ...base,
      state: 'unsupported_domain',
      preferredPlayerId: null,
      baselineAction: null,
      reasons: [],
      blockers: ['The controlled decision is not a verified unlocked same-position observed starter/bench comparison.'],
    };
  }

  return {
    ...base,
    state: 'baseline_available',
    preferredPlayerId: a.playerId,
    baselineAction: 'keep_observed_starter',
    reasons: [
      'Independent baseline preserves the observed starter and intentionally ignores all modeled player-strength evidence.',
      'Agreement or disagreement with the champion is an audit signal only and cannot increase recommendation confidence.',
    ],
    blockers: [],
  };
}

export function compareWeeklyDecisionChampionAndChallenger(
  context: WeeklyDecisionContext,
): WeeklyDecisionChallengeComparison {
  const champion = evaluateWeeklyDecision(context);
  const challenger = evaluateWeeklyDecisionChallenger(context);
  const championAvailable = champion.preferredPlayerId !== null;
  const challengerAvailable = challenger.preferredPlayerId !== null;

  let relation: WeeklyDecisionChallengeRelation;
  if (!championAvailable && !challengerAvailable) relation = 'both_abstained';
  else if (!championAvailable) relation = 'champion_abstained';
  else if (!challengerAvailable) relation = 'challenger_abstained';
  else relation = champion.preferredPlayerId === challenger.preferredPlayerId ? 'agreement' : 'disagreement';

  return {
    champion,
    challenger,
    relation,
    confidenceBoostAllowed: false,
    finalActionAuthority: 'human',
  };
}
