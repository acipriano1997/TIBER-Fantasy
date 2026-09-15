import {
  evaluateWeeklyDecision,
  type WeeklyDecisionContext,
  type WeeklyDecisionResult,
} from '../../shared/weeklyDecisionContract';
import {
  assessLeagueDecisionReadiness,
  type UnifiedLeagueContextV1,
} from './leagueContextV1';

export type WeeklyDecisionLeagueBinding = {
  ready: boolean;
  blockers: string[];
  scoringProfileRef: string | null;
  scoringProfileHash: string | null;
};

export function leagueScoringProfileRef(context: UnifiedLeagueContextV1): string | null {
  if (context.scoring.status !== 'certified' || !context.scoring.fingerprint) return null;
  return `${context.identity.platform}:${context.identity.leagueId}:scoring:${context.scoring.fingerprint.slice(0, 12)}`;
}

/**
 * Weekly lineup decisions must prove that their scoring identity is exactly the
 * certified active-league scoring identity. A stale/missing profile or a packet
 * copied from another league fails closed before the weekly evaluator runs.
 */
export function inspectWeeklyDecisionLeagueBinding(
  context: UnifiedLeagueContextV1,
  weekly: WeeklyDecisionContext,
): WeeklyDecisionLeagueBinding {
  const readiness = assessLeagueDecisionReadiness(context, { decisionType: 'lineup' });
  const blockers = [...readiness.blockers];
  const scoringProfileRef = leagueScoringProfileRef(context);
  const scoringProfileHash = context.scoring.fingerprint;

  if (weekly.leagueRef !== context.identity.leagueId) {
    blockers.push(`Weekly decision leagueRef ${weekly.leagueRef} does not match active league ${context.identity.leagueId}.`);
  }
  if (!scoringProfileHash || weekly.scoringProfileHash !== scoringProfileHash) {
    blockers.push('Weekly decision scoringProfileHash does not match the certified active-league scoring fingerprint.');
  }
  if (!scoringProfileRef || weekly.scoringProfileRef !== scoringProfileRef) {
    blockers.push('Weekly decision scoringProfileRef does not match the certified active-league scoring profile.');
  }
  if (weekly.season !== context.identity.season) {
    blockers.push(`Weekly decision season ${weekly.season} does not match active league season ${context.identity.season}.`);
  }

  return {
    ready: blockers.length === 0,
    blockers,
    scoringProfileRef,
    scoringProfileHash,
  };
}

export function evaluateWeeklyDecisionWithLeagueContext(
  context: UnifiedLeagueContextV1,
  weekly: WeeklyDecisionContext,
): WeeklyDecisionResult {
  const binding = inspectWeeklyDecisionLeagueBinding(context, weekly);
  if (!binding.ready) {
    return {
      schemaVersion: 'weekly_lineup_decision_packet_v1',
      decisionState: 'insufficient_evidence',
      finalActionAuthority: 'human',
      preferredPlayerId: null,
      comparisonMetric: null,
      metricDelta: null,
      reasons: [],
      blockers: binding.blockers,
      missingInputs: ['certified_active_league_context'],
      tailEvidenceUsed: false,
      correlationSensitiveWinProbability: null,
      receipt: {
        decisionId: weekly.decisionId,
        leagueRef: weekly.leagueRef,
        teamRef: weekly.teamRef,
        season: weekly.season,
        week: weekly.week,
        scoringProfileRef: weekly.scoringProfileRef,
        scoringProfileHash: weekly.scoringProfileHash,
        rosterSnapshotRef: weekly.rosterSnapshotRef,
        rosterSnapshotHash: weekly.rosterSnapshotHash,
        lineupAHash: weekly.lineupAHash,
        lineupBHash: weekly.lineupBHash,
        evidenceCutoffAt: weekly.evidenceCutoffAt,
        validUntil: weekly.validUntil,
        operatorPosture: weekly.operatorPosture,
        candidatePlayerIds: [weekly.candidateA.playerId, weekly.candidateB.playerId],
        tailModelVersions: [weekly.candidateA.tailOutlook?.modelVersion ?? null, weekly.candidateB.tailOutlook?.modelVersion ?? null],
        calibrationVersions: [weekly.candidateA.tailOutlook?.calibrationVersion ?? null, weekly.candidateB.tailOutlook?.calibrationVersion ?? null],
      },
    };
  }
  return evaluateWeeklyDecision(weekly);
}
