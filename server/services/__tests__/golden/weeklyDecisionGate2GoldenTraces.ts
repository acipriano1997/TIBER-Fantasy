import type {
  WeeklyDecisionCandidate,
  WeeklyDecisionContext,
  WeeklyDecisionState,
  WeeklyTailOutlook,
} from '../../../../shared/weeklyDecisionContract';
import type { WeeklyDecisionChallengeRelation } from '../../../../shared/weeklyDecisionChallenger';

export type WeeklyDecisionGate2GoldenTrace = {
  id: string;
  description: string;
  recordedAt: string;
  context: WeeklyDecisionContext;
  expected: {
    championState: WeeklyDecisionState;
    championPreferredPlayerId: string | null;
    challengerPreferredPlayerId: string | null;
    relation: WeeklyDecisionChallengeRelation;
    requiredMissingInput?: string;
  };
};

function tail(
  runOrContentHash: string,
  quantiles: WeeklyTailOutlook['quantiles'],
  overrides: Partial<WeeklyTailOutlook> = {},
): WeeklyTailOutlook {
  return {
    status: 'ready',
    scoringProfileRef: 'league:ppr:hash-1',
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    generatedAt: '2026-09-07T16:05:00.000Z',
    modelVersion: 'forecast-weekly-tail-v2',
    calibrationVersion: 'calibration-2026-w1',
    supportedPopulation: 'NFL WR PPR weekly',
    quantiles,
    rightTail: null,
    leftTail: null,
    pathways: null,
    sourceReceipts: [{
      owner: 'TIBER-Forecast',
      artifactOrEndpoint: 'weekly-tail-v2',
      schemaOrModelVersion: 'forecast-weekly-tail-v2',
      runOrContentHash,
      evidenceWindow: '2026 week 1',
      observedAt: '2026-09-07T15:55:00.000Z',
      inputCutoffAt: '2026-09-07T16:00:00.000Z',
      generatedAt: '2026-09-07T16:05:00.000Z',
      retrievedAt: '2026-09-07T16:06:00.000Z',
      validUntil: '2026-09-07T23:00:00.000Z',
      publicationState: 'promoted',
      freshness: 'fresh',
      coverage: 'supported',
    }],
    ...overrides,
  };
}

function candidate(
  playerId: string,
  observedStarter: boolean,
  tailOutlook: WeeklyTailOutlook | null,
): WeeklyDecisionCandidate {
  return {
    playerId,
    playerName: playerId === 'starter' ? 'Observed Starter' : 'Observed Bench',
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter,
    tailOutlook,
  };
}

function baseContext(overrides: Partial<WeeklyDecisionContext> = {}): WeeklyDecisionContext {
  return {
    decisionId: 'golden-week1-wr',
    season: 2026,
    week: 1,
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    validUntil: '2026-09-07T23:00:00.000Z',
    leagueRef: 'golden-league-1',
    teamRef: 'golden-team-1',
    scoringProfileRef: 'league:ppr:hash-1',
    scoringProfileHash: 'hash-1',
    rosterSnapshotRef: 'golden-roster-snapshot-1',
    rosterSnapshotHash: 'golden-roster-hash-1',
    lineupAHash: 'golden-lineup-a',
    lineupBHash: 'golden-lineup-b',
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'balanced',
    candidateA: candidate('starter', true, tail('run-starter', {
      p10: 8, p25: 11, p50: 15, p75: 21, p90: 28, p95: 32,
    })),
    candidateB: candidate('bench', false, tail('run-bench', {
      p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31,
    })),
    ...overrides,
  };
}

export const WEEKLY_DECISION_GATE2_GOLDEN_TRACES: readonly WeeklyDecisionGate2GoldenTrace[] = [
  {
    id: 'admitted_keep_agreement',
    description: 'Champion distribution dominance preserves the observed starter; independent incumbent baseline agrees without increasing confidence.',
    recordedAt: '2026-09-07T16:10:00.000Z',
    context: baseContext(),
    expected: {
      championState: 'comparison_available',
      championPreferredPlayerId: 'starter',
      challengerPreferredPlayerId: 'starter',
      relation: 'agreement',
    },
  },
  {
    id: 'admitted_swap_disagreement',
    description: 'Champion distribution dominance recommends the bench player; independent incumbent baseline deliberately disagrees.',
    recordedAt: '2026-09-07T16:11:00.000Z',
    context: baseContext({
      decisionId: 'golden-week1-wr-swap',
      candidateA: candidate('starter', true, tail('run-starter-low', {
        p10: 5, p25: 8, p50: 11, p75: 15, p90: 20, p95: 24,
      })),
      candidateB: candidate('bench', false, tail('run-bench-high', {
        p10: 8, p25: 12, p50: 16, p75: 22, p90: 29, p95: 34,
      })),
    }),
    expected: {
      championState: 'comparison_available',
      championPreferredPlayerId: 'bench',
      challengerPreferredPlayerId: 'starter',
      relation: 'disagreement',
    },
  },
  {
    id: 'fail_closed_missing_tail',
    description: 'Champion refuses to substitute rankings or defaults when the bench tail packet is missing; independent no-model baseline remains observable only as an audit reference.',
    recordedAt: '2026-09-07T16:12:00.000Z',
    context: baseContext({
      decisionId: 'golden-week1-wr-missing-tail',
      candidateB: candidate('bench', false, null),
    }),
    expected: {
      championState: 'insufficient_evidence',
      championPreferredPlayerId: null,
      challengerPreferredPlayerId: 'starter',
      relation: 'champion_abstained',
      requiredMissingInput: 'bench:tail_outlook_missing',
    },
  },
  {
    id: 'fail_closed_locked_slot',
    description: 'Both champion and challenger refuse to act when the controlled lineup slot is locked.',
    recordedAt: '2026-09-07T16:13:00.000Z',
    context: baseContext({
      decisionId: 'golden-week1-wr-locked',
      locked: true,
    }),
    expected: {
      championState: 'unsupported_domain',
      championPreferredPlayerId: null,
      challengerPreferredPlayerId: null,
      relation: 'both_abstained',
    },
  },
  {
    id: 'fail_closed_source_laundering',
    description: 'A packet with plausible quantiles but no authoritative TIBER-Forecast receipt cannot enter the decision path.',
    recordedAt: '2026-09-07T16:14:00.000Z',
    context: baseContext({
      decisionId: 'golden-week1-wr-source-laundering',
      candidateB: candidate('bench', false, tail('run-laundered', {
        p10: 9, p25: 12, p50: 17, p75: 23, p90: 30, p95: 35,
      }, {
        sourceReceipts: [{
          owner: 'TIBER-Fantasy',
          artifactOrEndpoint: 'weekly-tail-v2',
          schemaOrModelVersion: 'forecast-weekly-tail-v2',
          runOrContentHash: 'run-laundered',
          evidenceWindow: '2026 week 1',
          observedAt: '2026-09-07T15:55:00.000Z',
          inputCutoffAt: '2026-09-07T16:00:00.000Z',
          generatedAt: '2026-09-07T16:05:00.000Z',
          retrievedAt: '2026-09-07T16:06:00.000Z',
          validUntil: '2026-09-07T23:00:00.000Z',
          publicationState: 'promoted',
          freshness: 'fresh',
          coverage: 'supported',
        }],
      })),
    }),
    expected: {
      championState: 'insufficient_evidence',
      championPreferredPlayerId: null,
      challengerPreferredPlayerId: 'starter',
      relation: 'champion_abstained',
      requiredMissingInput: 'bench:authoritative_forecast_receipt_missing',
    },
  },
] as const;
