import {
  auditWeeklyDecisionWithIndependentChallenger,
  type WeeklyDecisionChallengerEvidencePacket,
  type WeeklyDecisionChallengerPointEvidence,
} from '../weeklyDecisionChallenger';
import { createWeeklyDecisionLedgerEntry } from '../weeklyDecisionLedger';
import type {
  WeeklyDecisionCandidate,
  WeeklyDecisionContext,
  WeeklyTailOutlook,
} from '../../../shared/weeklyDecisionContract';

function tail(
  runOrContentHash: string,
  quantiles: WeeklyTailOutlook['quantiles'] = { p10: 8, p25: 11, p50: 15, p75: 21, p90: 28, p95: 32 },
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
  };
}

function candidate(
  playerId: string,
  observedStarter: boolean,
  outlook: WeeklyTailOutlook,
): WeeklyDecisionCandidate {
  return {
    playerId,
    playerName: playerId === 'player-a' ? 'Player A' : 'Player B',
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter,
    tailOutlook: outlook,
  };
}

function context(overrides: Partial<WeeklyDecisionContext> = {}): WeeklyDecisionContext {
  return {
    decisionId: 'challenger-decision-1',
    season: 2026,
    week: 1,
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    validUntil: '2026-09-07T23:00:00.000Z',
    leagueRef: 'league-1',
    teamRef: 'team-1',
    scoringProfileRef: 'league:ppr:hash-1',
    scoringProfileHash: 'hash-1',
    rosterSnapshotRef: 'roster-snapshot-1',
    rosterSnapshotHash: 'roster-hash-1',
    lineupAHash: 'lineup-a',
    lineupBHash: 'lineup-b',
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'unset',
    candidateA: candidate('player-a', true, tail('run-a')),
    candidateB: candidate(
      'player-b',
      false,
      tail('run-b', { p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31 }),
    ),
    ...overrides,
  };
}

function pointEvidence(
  playerId: string,
  projectedPoints: number,
  overrides: Partial<WeeklyDecisionChallengerPointEvidence> = {},
): WeeklyDecisionChallengerPointEvidence {
  return {
    playerId,
    status: 'ready',
    scoringProfileRef: 'league:ppr:hash-1',
    projectedPoints,
    sourceFamily: 'platform_projection',
    producer: 'Sleeper Projection Feed',
    methodology: 'independent_point_projection',
    modelVersion: 'sleeper-projection-2026-w1',
    sourceHash: `sleeper-${playerId}`,
    inputCutoffAt: '2026-09-07T15:50:00.000Z',
    generatedAt: '2026-09-07T15:55:00.000Z',
    retrievedAt: '2026-09-07T15:56:00.000Z',
    ...overrides,
  };
}

function evidence(
  pointsA = 14,
  pointsB = 16,
  overrides: Partial<WeeklyDecisionChallengerEvidencePacket> = {},
): WeeklyDecisionChallengerEvidencePacket {
  return {
    candidateA: pointEvidence('player-a', pointsA),
    candidateB: pointEvidence('player-b', pointsB),
    ...overrides,
  };
}

function ledger(overrides: Partial<WeeklyDecisionContext> = {}) {
  return createWeeklyDecisionLedgerEntry(
    context(overrides),
    '2026-09-07T16:10:00.000Z',
  );
}

describe('Weekly Decision Gate 2 independent challenger', () => {
  test('surfaces champion disagreement without gaining decision authority or changing confidence', () => {
    const entry = ledger();
    expect(entry.resultSnapshot.preferredPlayerId).toBe('player-a');

    const audit = auditWeeklyDecisionWithIndependentChallenger(entry, evidence(14, 16));

    expect(audit.state).toBe('comparison_available');
    expect(audit.preferredPlayerId).toBe('player-b');
    expect(audit.pointDelta).toBe(2);
    expect(audit.championComparison).toBe('disagree');
    expect(audit.purpose).toBe('verification_only');
    expect(audit.decisionAuthority).toBe('none');
    expect(audit.finalActionAuthority).toBe('human');
    expect(audit.confidenceEffect).toBe('none');
    expect(audit.independence).toEqual({
      method: 'single_point_projection',
      usesChampionTailQuantiles: false,
      usesChampionOperatorPosture: false,
      usesChampionPreferredPlayerAsInput: false,
      requiresDistinctProducerFromChampionLineage: true,
      requiresDistinctSourceHashFromChampionLineage: true,
    });
  });

  test('agreement remains diagnostic and cannot boost champion confidence', () => {
    const audit = auditWeeklyDecisionWithIndependentChallenger(ledger(), evidence(17, 13));

    expect(audit.state).toBe('comparison_available');
    expect(audit.preferredPlayerId).toBe('player-a');
    expect(audit.championComparison).toBe('agree');
    expect(audit.confidenceEffect).toBe('none');
    expect('confidence' in audit).toBe(false);
  });

  test('uses only the independent point projection even when champion operator posture changes', () => {
    const crossed = context({
      operatorPosture: 'chase_spike',
      candidateB: candidate(
        'player-b',
        false,
        tail('run-b', { p10: 6, p25: 9, p50: 14, p75: 23, p90: 31, p95: 36 }),
      ),
    });
    const entry = createWeeklyDecisionLedgerEntry(crossed, '2026-09-07T16:10:00.000Z');
    expect(entry.resultSnapshot.preferredPlayerId).toBe('player-b');

    const audit = auditWeeklyDecisionWithIndependentChallenger(entry, evidence(18, 12));
    expect(audit.preferredPlayerId).toBe('player-a');
    expect(audit.championComparison).toBe('disagree');
    expect(audit.independence.usesChampionOperatorPosture).toBe(false);
  });

  test('rejects challenger evidence that reuses champion producer or content hash', () => {
    const packet = evidence(17, 13, {
      candidateA: pointEvidence('player-a', 17, {
        producer: 'TIBER-Forecast',
        sourceHash: 'run-a',
      }),
    });
    const audit = auditWeeklyDecisionWithIndependentChallenger(ledger(), packet);

    expect(audit.state).toBe('insufficient_evidence');
    expect(audit.missingInputs).toContain('candidateA:player-a:producer_overlaps_champion_lineage');
    expect(audit.missingInputs).toContain('candidateA:player-a:source_hash_overlaps_champion_lineage');
  });

  test('rejects future-leaking challenger evidence relative to the frozen champion receipt', () => {
    const packet = evidence(17, 13, {
      candidateB: pointEvidence('player-b', 13, {
        inputCutoffAt: '2026-09-07T16:01:00.000Z',
        generatedAt: '2026-09-07T16:11:00.000Z',
        retrievedAt: '2026-09-07T16:12:00.000Z',
      }),
    });
    const audit = auditWeeklyDecisionWithIndependentChallenger(ledger(), packet);

    expect(audit.state).toBe('insufficient_evidence');
    expect(audit.missingInputs).toContain('candidateB:player-b:input_cutoff_after_champion_cutoff');
    expect(audit.missingInputs).toContain('candidateB:player-b:generated_after_champion_recorded_at');
    expect(audit.missingInputs).toContain('candidateB:player-b:retrieved_after_champion_recorded_at');
  });

  test('rejects scoring-profile and player-identity mismatches instead of comparing unrelated numbers', () => {
    const packet = evidence(17, 13, {
      candidateB: pointEvidence('other-player', 13, {
        scoringProfileRef: 'league:half-ppr:wrong',
      }),
    });
    const audit = auditWeeklyDecisionWithIndependentChallenger(ledger(), packet);

    expect(audit.state).toBe('insufficient_evidence');
    expect(audit.missingInputs).toContain('candidateB:player-b:player_identity_mismatch');
    expect(audit.missingInputs).toContain('candidateB:player-b:scoring_profile_mismatch');
  });

  test('fails closed on stale or missing point evidence', () => {
    const packet = evidence(17, 13, {
      candidateB: pointEvidence('player-b', 13, {
        status: 'stale',
        projectedPoints: null,
      }),
    });
    const audit = auditWeeklyDecisionWithIndependentChallenger(ledger(), packet);

    expect(audit.state).toBe('insufficient_evidence');
    expect(audit.missingInputs).toContain('candidateB:player-b:status_stale');
    expect(audit.missingInputs).toContain('candidateB:player-b:projected_points_missing_or_invalid');
  });

  test('returns a structural tie for identical independent point projections', () => {
    const audit = auditWeeklyDecisionWithIndependentChallenger(ledger(), evidence(15, 15));

    expect(audit.state).toBe('structural_tie');
    expect(audit.preferredPlayerId).toBeNull();
    expect(audit.pointDelta).toBe(0);
    expect(audit.comparisonMetric).toBe('projected_points');
    expect(audit.championComparison).toBe('not_comparable');
  });

  test('refuses to audit a tampered champion receipt', () => {
    const entry = ledger();
    const tampered = JSON.parse(JSON.stringify(entry));
    tampered.resultSnapshot.preferredPlayerId = 'player-b';

    const audit = auditWeeklyDecisionWithIndependentChallenger(tampered, evidence(17, 13));

    expect(audit.state).toBe('champion_unverifiable');
    expect(audit.preferredPlayerId).toBeNull();
    expect(audit.championComparison).toBe('not_comparable');
    expect(audit.blockers.join(' ')).toContain('Champion ledger replay failed');
  });
});
