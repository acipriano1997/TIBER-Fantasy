import {
  buildDraftSeasonOutcomeBands,
  DRAFT_SEASON_OUTCOME_SCHEMA_VERSION,
  inspectDraftSeasonOutcomeArtifact,
  type DraftSeasonOutcomeArtifact,
  type DraftSeasonOutcomeExpectation,
} from '../draftSeasonOutcomeContract';

const expected: DraftSeasonOutcomeExpectation = {
  playerId: '00-0036900',
  season: 2026,
  scoringProfileRef: 'espn:league:123:scoring',
  scoringProfileHash: 'score-hash-1',
  asOf: '2026-09-08T15:00:00.000Z',
};

function readyArtifact(overrides: Partial<DraftSeasonOutcomeArtifact> = {}): DraftSeasonOutcomeArtifact {
  const base: DraftSeasonOutcomeArtifact = {
    schemaVersion: DRAFT_SEASON_OUTCOME_SCHEMA_VERSION,
    status: 'ready',
    horizon: 'season',
    playerId: expected.playerId,
    season: expected.season,
    scoringProfileRef: expected.scoringProfileRef,
    scoringProfileHash: expected.scoringProfileHash,
    evidenceCutoffAt: '2026-09-08T14:00:00.000Z',
    generatedAt: '2026-09-08T14:05:00.000Z',
    modelVersion: 'season-dist-v1',
    calibrationVersion: 'season-cal-v1',
    supportedPopulation: '2026-redraft-qb-rb-wr-te',
    bands: {
      low: { percentile: 0.2, fantasyPoints: 190.4 },
      median: { percentile: 0.5, fantasyPoints: 247.1 },
      high: { percentile: 0.8, fantasyPoints: 314.8 },
    },
    bandSelection: {
      method: 'backtest_calibrated_quantiles',
      backtestVersion: 'season-band-backtest-v3',
      cohort: 'position-archetype-age-role',
      sampleSize: 1248,
    },
    sourceReceipts: [{
      owner: 'TIBER-Forecast',
      artifactOrEndpoint: 'forecast://season-outcomes/2026/run-1',
      schemaOrModelVersion: 'season-dist-v1',
      runOrContentHash: 'sha256:abc',
      evidenceWindow: 'through-2026-09-08T14:00:00.000Z',
      observedAt: '2026-09-08T14:06:00.000Z',
      inputCutoffAt: '2026-09-08T14:00:00.000Z',
      generatedAt: '2026-09-08T14:05:00.000Z',
      retrievedAt: '2026-09-08T14:07:00.000Z',
      validUntil: '2026-09-09T14:05:00.000Z',
      publicationState: 'promoted',
      freshness: 'fresh',
      coverage: 'supported',
    }],
  };

  return { ...base, ...overrides };
}

describe('draft season outcome contract', () => {
  it('exposes promoted backtest-selected low / median / high season outcomes', () => {
    const result = buildDraftSeasonOutcomeBands(readyArtifact(), expected);

    expect(result).toMatchObject({
      status: 'ready',
      low: 190.4,
      median: 247.1,
      high: 314.8,
      lowPercentile: 0.2,
      medianPercentile: 0.5,
      highPercentile: 0.8,
      modelVersion: 'season-dist-v1',
      calibrationVersion: 'season-cal-v1',
      backtestVersion: 'season-band-backtest-v3',
      blockers: [],
    });
  });

  it('does not hard-code P20/P80 when backtesting promotes a different calibrated interval', () => {
    const artifact = readyArtifact({
      bands: {
        low: { percentile: 0.25, fantasyPoints: 201.2 },
        median: { percentile: 0.5, fantasyPoints: 247.1 },
        high: { percentile: 0.75, fantasyPoints: 298.5 },
      },
    });

    const result = buildDraftSeasonOutcomeBands(artifact, expected);
    expect(result.status).toBe('ready');
    expect([result.lowPercentile, result.medianPercentile, result.highPercentile]).toEqual([0.25, 0.5, 0.75]);
  });

  it('fails closed when outcome values are not ordered', () => {
    const artifact = readyArtifact({
      bands: {
        low: { percentile: 0.2, fantasyPoints: 260 },
        median: { percentile: 0.5, fantasyPoints: 247 },
        high: { percentile: 0.8, fantasyPoints: 315 },
      },
    });

    const result = buildDraftSeasonOutcomeBands(artifact, expected);
    expect(result.status).toBe('unavailable');
    expect(result.blockers).toContain('band_points_not_ordered');
    expect(result.low).toBeNull();
    expect(result.median).toBeNull();
    expect(result.high).toBeNull();
  });

  it('requires the median alias to remain the P50 outcome', () => {
    const artifact = readyArtifact({
      bands: {
        low: { percentile: 0.2, fantasyPoints: 190 },
        median: { percentile: 0.55, fantasyPoints: 250 },
        high: { percentile: 0.8, fantasyPoints: 315 },
      },
    });

    expect(inspectDraftSeasonOutcomeArtifact(artifact, expected)).toContain('median_percentile_not_p50');
  });

  it('rejects unpromoted, stale, or unsupported upstream evidence rather than fabricating bands', () => {
    for (const status of ['not_promoted', 'stale', 'unsupported'] as const) {
      const result = buildDraftSeasonOutcomeBands(readyArtifact({ status }), expected);
      expect(result.status).toBe('unavailable');
      expect(result.blockers).toContain(`season_outcome_status_${status}`);
    }
  });

  it('requires an authoritative promoted fresh supported TIBER-Forecast receipt', () => {
    const artifact = readyArtifact({
      sourceReceipts: [{
        ...readyArtifact().sourceReceipts[0],
        publicationState: 'candidate',
      }],
    });

    const result = buildDraftSeasonOutcomeBands(artifact, expected);
    expect(result.status).toBe('unavailable');
    expect(result.blockers).toContain('authoritative_forecast_receipt_invalid');
  });

  it('rejects scoring-profile mismatch so ESPN league scoring cannot silently reuse generic bands', () => {
    const result = buildDraftSeasonOutcomeBands(
      readyArtifact({ scoringProfileHash: 'different-scoring-hash' }),
      expected,
    );

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toContain('scoring_profile_hash_mismatch');
  });

  it('blocks future evidence leakage in historical replay and backtests', () => {
    const result = buildDraftSeasonOutcomeBands(
      readyArtifact({ evidenceCutoffAt: '2026-09-09T14:00:00.000Z' }),
      expected,
    );

    expect(result.status).toBe('unavailable');
    expect(result.blockers).toContain('future_evidence_leakage');
  });

  it('returns an explicit unavailable state when a player has no promoted season distribution', () => {
    const result = buildDraftSeasonOutcomeBands(null, expected);
    expect(result).toEqual({
      status: 'unavailable',
      low: null,
      median: null,
      high: null,
      lowPercentile: null,
      medianPercentile: null,
      highPercentile: null,
      modelVersion: null,
      calibrationVersion: null,
      backtestVersion: null,
      supportedPopulation: null,
      generatedAt: null,
      blockers: ['season_outcome_missing'],
    });
  });
});
