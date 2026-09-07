import {
  compareWeeklyDecisionChampionAndChallenger,
  evaluateWeeklyDecisionChallenger,
} from '../../../shared/weeklyDecisionChallenger';
import type {
  WeeklyDecisionCandidate,
  WeeklyDecisionContext,
  WeeklyTailOutlook,
} from '../../../shared/weeklyDecisionContract';

function tail(overrides: Partial<WeeklyTailOutlook> = {}): WeeklyTailOutlook {
  return {
    status: 'ready',
    scoringProfileRef: 'league:ppr:hash-1',
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    generatedAt: '2026-09-07T16:05:00.000Z',
    modelVersion: 'forecast-weekly-tail-v2',
    calibrationVersion: 'calibration-2026-w1',
    supportedPopulation: 'NFL WR PPR weekly',
    quantiles: { p10: 8, p25: 11, p50: 15, p75: 21, p90: 28, p95: 32 },
    rightTail: null,
    leftTail: null,
    pathways: null,
    sourceReceipts: [{
      owner: 'TIBER-Forecast',
      artifactOrEndpoint: 'weekly-tail-v2',
      schemaOrModelVersion: 'forecast-weekly-tail-v2',
      runOrContentHash: 'run-a',
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
    playerName: playerId,
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter,
    tailOutlook,
  };
}

function context(overrides: Partial<WeeklyDecisionContext> = {}): WeeklyDecisionContext {
  return {
    decisionId: 'challenger-1',
    season: 2026,
    week: 1,
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    validUntil: '2026-09-07T23:00:00.000Z',
    leagueRef: 'league-1',
    teamRef: 'team-1',
    scoringProfileRef: 'league:ppr:hash-1',
    scoringProfileHash: 'hash-1',
    rosterSnapshotRef: 'roster-1',
    rosterSnapshotHash: 'roster-hash-1',
    lineupAHash: 'lineup-a',
    lineupBHash: 'lineup-b',
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'balanced',
    candidateA: candidate('starter', true, tail()),
    candidateB: candidate('bench', false, tail({
      quantiles: { p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31 },
      sourceReceipts: [{ ...tail().sourceReceipts[0], runOrContentHash: 'run-b' }],
    })),
    ...overrides,
  };
}

describe('Weekly Decision independent challenger', () => {
  test('is explicitly no-model and always leaves final authority to the human', () => {
    const challenger = evaluateWeeklyDecisionChallenger(context());

    expect(challenger.state).toBe('baseline_available');
    expect(challenger.preferredPlayerId).toBe('starter');
    expect(challenger.baselineAction).toBe('keep_observed_starter');
    expect(challenger.methodology).toBe('incumbent_preservation_no_model');
    expect(challenger.modelInputsUsed).toBe(false);
    expect(challenger.tailEvidenceUsed).toBe(false);
    expect(challenger.confidenceBoostAllowed).toBe(false);
    expect(challenger.finalActionAuthority).toBe('human');
  });

  test('does not fail merely because Forecast evidence is missing', () => {
    const challenger = evaluateWeeklyDecisionChallenger(context({
      candidateA: candidate('starter', true, null),
      candidateB: candidate('bench', false, null),
    }));

    expect(challenger.state).toBe('baseline_available');
    expect(challenger.preferredPlayerId).toBe('starter');
    expect(challenger.tailEvidenceUsed).toBe(false);
  });

  test('disagrees when the champion recommends changing the observed starter', () => {
    const comparison = compareWeeklyDecisionChampionAndChallenger(context({
      candidateA: candidate('starter', true, tail({
        quantiles: { p10: 5, p25: 8, p50: 11, p75: 15, p90: 20, p95: 24 },
      })),
      candidateB: candidate('bench', false, tail({
        quantiles: { p10: 8, p25: 12, p50: 16, p75: 22, p90: 29, p95: 34 },
        sourceReceipts: [{ ...tail().sourceReceipts[0], runOrContentHash: 'run-b' }],
      })),
    }));

    expect(comparison.champion.preferredPlayerId).toBe('bench');
    expect(comparison.challenger.preferredPlayerId).toBe('starter');
    expect(comparison.relation).toBe('disagreement');
    expect(comparison.confidenceBoostAllowed).toBe(false);
  });

  test('agreement is an audit signal and never a confidence multiplier', () => {
    const comparison = compareWeeklyDecisionChampionAndChallenger(context());

    expect(comparison.relation).toBe('agreement');
    expect(comparison.champion.preferredPlayerId).toBe('starter');
    expect(comparison.challenger.preferredPlayerId).toBe('starter');
    expect(comparison.confidenceBoostAllowed).toBe(false);
  });

  test('champion can abstain while the independent baseline still exists', () => {
    const comparison = compareWeeklyDecisionChampionAndChallenger(context({
      candidateB: candidate('bench', false, null),
    }));

    expect(comparison.champion.decisionState).toBe('insufficient_evidence');
    expect(comparison.champion.preferredPlayerId).toBeNull();
    expect(comparison.challenger.state).toBe('baseline_available');
    expect(comparison.relation).toBe('champion_abstained');
  });

  test('both paths abstain on locked geometry', () => {
    const comparison = compareWeeklyDecisionChampionAndChallenger(context({ locked: true }));

    expect(comparison.champion.decisionState).toBe('unsupported_domain');
    expect(comparison.challenger.state).toBe('unsupported_domain');
    expect(comparison.relation).toBe('both_abstained');
  });
});
