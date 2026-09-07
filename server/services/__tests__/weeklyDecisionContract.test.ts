import {
  evaluateWeeklyDecision,
  type WeeklyDecisionContext,
  type WeeklyDecisionCandidate,
  type WeeklyTailOutlook,
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
    quantiles: {
      p10: 8,
      p25: 11,
      p50: 15,
      p75: 21,
      p90: 28,
      p95: 32,
    },
    rightTail: null,
    leftTail: null,
    pathways: null,
    sourceReceipts: [
      {
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
      },
    ],
    ...overrides,
  };
}

function candidate(
  playerId: string,
  playerName: string,
  observedStarter: boolean,
  tailOutlook: WeeklyTailOutlook | null,
  overrides: Partial<WeeklyDecisionCandidate> = {},
): WeeklyDecisionCandidate {
  return {
    playerId,
    playerName,
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter,
    tailOutlook,
    ...overrides,
  };
}

function context(overrides: Partial<WeeklyDecisionContext> = {}): WeeklyDecisionContext {
  return {
    decisionId: 'decision-1',
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
    candidateA: candidate('player-a', 'Player A', true, tail()),
    candidateB: candidate('player-b', 'Player B', false, tail({
      quantiles: { p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31 },
    })),
    ...overrides,
  };
}

describe('Weekly Decision v1 contract', () => {
  test('admits distribution dominance without inventing matchup-win probability', () => {
    const decision = evaluateWeeklyDecision(context());

    expect(decision.decisionState).toBe('comparison_available');
    expect(decision.preferredPlayerId).toBe('player-a');
    expect(decision.comparisonMetric).toBe('distribution_dominance');
    expect(decision.tailEvidenceUsed).toBe(true);
    expect(decision.correlationSensitiveWinProbability).toBeNull();
    expect(decision.finalActionAuthority).toBe('human');
  });

  test('fails closed when calibrated tail evidence is absent', () => {
    const decision = evaluateWeeklyDecision(context({
      candidateB: candidate('player-b', 'Player B', false, null),
    }));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.preferredPlayerId).toBeNull();
    expect(decision.missingInputs).toContain('player-b:tail_outlook_missing');
    expect(decision.blockers.join(' ')).toContain('Rankings, FORGE, ADP');
  });

  test('fails closed on scoring-profile mismatch', () => {
    const decision = evaluateWeeklyDecision(context({
      candidateB: candidate('player-b', 'Player B', false, tail({ scoringProfileRef: 'league:half-ppr:other' })),
    }));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('player-b:scoring_profile_mismatch');
  });

  test('rejects unresolved canonical identity', () => {
    const decision = evaluateWeeklyDecision(context({
      candidateA: candidate('player-a', 'Player A', true, tail(), { identityStatus: 'unresolved' }),
    }));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('player-a:canonical_identity');
  });

  test('rejects cross-position or unproven lineup geometry instead of guessing flex legality', () => {
    const decision = evaluateWeeklyDecision(context({
      samePositionLegalSwap: false,
      candidateB: candidate('player-b', 'Player B', false, tail(), { position: 'RB' }),
    }));

    expect(decision.decisionState).toBe('unsupported_domain');
    expect(decision.preferredPlayerId).toBeNull();
    expect(decision.blockers.join(' ')).toContain('same-position');
  });

  test('rejects a locked controlled slot', () => {
    const decision = evaluateWeeklyDecision(context({ locked: true }));

    expect(decision.decisionState).toBe('unsupported_domain');
    expect(decision.blockers).toContain('The controlled lineup slot is locked.');
  });

  test('requires observed Sleeper starter/bench truth', () => {
    const decision = evaluateWeeklyDecision(context({
      candidateA: candidate('player-a', 'Player A', false, tail()),
      candidateB: candidate('player-b', 'Player B', true, tail()),
    }));

    expect(decision.decisionState).toBe('unsupported_domain');
    expect(decision.blockers.join(' ')).toContain('observed current starter');
  });

  test('returns a structural tie for identical admitted distributions', () => {
    const identicalTail = tail();
    const decision = evaluateWeeklyDecision(context({
      candidateA: candidate('player-a', 'Player A', true, identicalTail),
      candidateB: candidate('player-b', 'Player B', false, tail({ quantiles: { ...identicalTail.quantiles } })),
    }));

    expect(decision.decisionState).toBe('structural_tie');
    expect(decision.preferredPlayerId).toBeNull();
    expect(decision.tailEvidenceUsed).toBe(true);
  });

  test('requires an operator tiebreak when distributions cross and posture is unset', () => {
    const decision = evaluateWeeklyDecision(context({
      candidateB: candidate('player-b', 'Player B', false, tail({
        quantiles: { p10: 6, p25: 9, p50: 14, p75: 23, p90: 31, p95: 36 },
      })),
    }));

    expect(decision.decisionState).toBe('operator_tiebreak_required');
    expect(decision.preferredPlayerId).toBeNull();
    expect(decision.blockers.join(' ')).toContain('no operator posture');
  });

  test('uses downside posture only as an explicit transform over the same distribution', () => {
    const decision = evaluateWeeklyDecision(context({
      operatorPosture: 'protect_downside',
      candidateB: candidate('player-b', 'Player B', false, tail({
        quantiles: { p10: 6, p25: 9, p50: 14, p75: 23, p90: 31, p95: 36 },
      })),
    }));

    expect(decision.decisionState).toBe('comparison_available');
    expect(decision.preferredPlayerId).toBe('player-a');
    expect(decision.comparisonMetric).toBe('p25');
    expect(decision.metricDelta).toBe(2);
  });

  test('uses spike posture only as an explicit transform over the same distribution', () => {
    const decision = evaluateWeeklyDecision(context({
      operatorPosture: 'chase_spike',
      candidateB: candidate('player-b', 'Player B', false, tail({
        quantiles: { p10: 6, p25: 9, p50: 14, p75: 23, p90: 31, p95: 36 },
      })),
    }));

    expect(decision.decisionState).toBe('comparison_available');
    expect(decision.preferredPlayerId).toBe('player-b');
    expect(decision.comparisonMetric).toBe('p90');
    expect(decision.metricDelta).toBe(3);
  });

  test('uses balanced posture at the median without manufacturing confidence', () => {
    const decision = evaluateWeeklyDecision(context({
      operatorPosture: 'balanced',
      candidateB: candidate('player-b', 'Player B', false, tail({
        quantiles: { p10: 6, p25: 9, p50: 16, p75: 23, p90: 31, p95: 36 },
      })),
    }));

    expect(decision.decisionState).toBe('comparison_available');
    expect(decision.preferredPlayerId).toBe('player-b');
    expect(decision.comparisonMetric).toBe('p50');
    expect(decision.metricDelta).toBe(1);
    expect(decision.correlationSensitiveWinProbability).toBeNull();
  });

  test('preserves the frozen decision receipt', () => {
    const decision = evaluateWeeklyDecision(context());

    expect(decision.receipt).toMatchObject({
      decisionId: 'decision-1',
      leagueRef: 'league-1',
      teamRef: 'team-1',
      season: 2026,
      week: 1,
      scoringProfileRef: 'league:ppr:hash-1',
      scoringProfileHash: 'hash-1',
      rosterSnapshotRef: 'roster-snapshot-1',
      rosterSnapshotHash: 'roster-hash-1',
      lineupAHash: 'lineup-a',
      lineupBHash: 'lineup-b',
      operatorPosture: 'unset',
      candidatePlayerIds: ['player-a', 'player-b'],
    });
  });
});
