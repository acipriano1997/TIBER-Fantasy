import {
  evaluateWeeklyDecision,
  type WeeklyDecisionCandidate,
  type WeeklyDecisionContext,
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
    quantiles: { p10: 8, p25: 11, p50: 15, p75: 21, p90: 28, p95: 32 },
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

function candidate(id: string, starter: boolean, outlook: WeeklyTailOutlook): WeeklyDecisionCandidate {
  return {
    playerId: id,
    playerName: id,
    position: 'WR',
    identityStatus: 'canonical',
    observedStarter: starter,
    tailOutlook: outlook,
  };
}

function context(tailB: WeeklyTailOutlook, overrides: Partial<WeeklyDecisionContext> = {}): WeeklyDecisionContext {
  return {
    decisionId: 'lineage-1',
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
    candidateB: candidate('bench', false, tailB),
    ...overrides,
  };
}

function receipt(overrides: Partial<WeeklyTailOutlook['sourceReceipts'][number]> = {}) {
  return {
    ...tail().sourceReceipts[0],
    runOrContentHash: 'run-b',
    ...overrides,
  };
}

describe('Weekly Decision source-lineage boundary', () => {
  test('accepts a promoted fresh supported TIBER-Forecast receipt bound to the same artifact clocks', () => {
    const decision = evaluateWeeklyDecision(context(tail({
      sourceReceipts: [receipt()],
      quantiles: { p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31 },
    })));

    expect(decision.decisionState).toBe('comparison_available');
    expect(decision.missingInputs).toEqual([]);
  });

  test('rejects a packet that launders tail authority through a non-Forecast owner', () => {
    const decision = evaluateWeeklyDecision(context(tail({
      sourceReceipts: [receipt({ owner: 'TIBER-Fantasy' })],
    })));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('bench:authoritative_forecast_receipt_missing');
  });

  test('rejects a Forecast receipt whose model version does not match the admitted tail packet', () => {
    const decision = evaluateWeeklyDecision(context(tail({
      sourceReceipts: [receipt({ schemaOrModelVersion: 'different-model' })],
    })));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('bench:authoritative_forecast_receipt_invalid');
  });

  test.each([
    ['publication state', { publicationState: 'draft' }],
    ['freshness', { freshness: 'stale' }],
    ['coverage', { coverage: 'partial' }],
  ])('rejects a ready packet when authoritative receipt %s is not release-admissible', (_label, mutation) => {
    const decision = evaluateWeeklyDecision(context(tail({
      sourceReceipts: [receipt(mutation)],
    })));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('bench:authoritative_forecast_receipt_invalid');
  });

  test('rejects a tail packet from a different evidence cutoff than the frozen decision context', () => {
    const decision = evaluateWeeklyDecision(context(tail({
      evidenceCutoffAt: '2026-09-07T15:00:00.000Z',
      sourceReceipts: [receipt({ inputCutoffAt: '2026-09-07T15:00:00.000Z' })],
    })));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('bench:evidence_cutoff_mismatch');
  });

  test('rejects a receipt that expires before the decision validity window', () => {
    const decision = evaluateWeeklyDecision(context(tail({
      sourceReceipts: [receipt({ validUntil: '2026-09-07T20:00:00.000Z' })],
    })));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('bench:authoritative_forecast_receipt_invalid');
  });

  test('rejects malformed decision valid-until metadata before model comparison', () => {
    const decision = evaluateWeeklyDecision(context(tail({ sourceReceipts: [receipt()] }), {
      validUntil: '2026-09-07 23:00:00',
    }));

    expect(decision.decisionState).toBe('insufficient_evidence');
    expect(decision.missingInputs).toContain('valid_until');
  });
});
