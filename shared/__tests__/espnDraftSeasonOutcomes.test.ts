import { DRAFT_SEASON_OUTCOME_SCHEMA_VERSION, type DraftSeasonOutcomeArtifact } from '../draftSeasonOutcomeContract';
import { attachSeasonOutcomesToEspnDraftPlayers } from '../espnDraftSeasonOutcomes';

const context = {
  season: 2026,
  scoringProfileRef: 'espn:league:123:scoring',
  scoringProfileHash: 'score-hash-1',
  asOf: '2026-09-08T15:00:00.000Z',
};

function artifact(playerId: string): DraftSeasonOutcomeArtifact {
  return {
    schemaVersion: DRAFT_SEASON_OUTCOME_SCHEMA_VERSION,
    status: 'ready',
    horizon: 'season',
    playerId,
    season: 2026,
    scoringProfileRef: context.scoringProfileRef,
    scoringProfileHash: context.scoringProfileHash,
    evidenceCutoffAt: '2026-09-08T14:00:00.000Z',
    generatedAt: '2026-09-08T14:05:00.000Z',
    modelVersion: 'season-dist-v1',
    calibrationVersion: 'season-cal-v1',
    supportedPopulation: '2026-redraft-qb-rb-wr-te',
    bands: {
      low: { percentile: 0.2, fantasyPoints: 180 },
      median: { percentile: 0.5, fantasyPoints: 240 },
      high: { percentile: 0.8, fantasyPoints: 310 },
    },
    bandSelection: {
      method: 'backtest_calibrated_quantiles',
      backtestVersion: 'season-band-backtest-v3',
      cohort: 'position-archetype-age-role',
      sampleSize: 1200,
    },
    sourceReceipts: [{
      owner: 'TIBER-Forecast',
      artifactOrEndpoint: 'forecast://season-outcomes/2026/run-1',
      schemaOrModelVersion: 'season-dist-v1',
      runOrContentHash: `sha256:${playerId}`,
      evidenceWindow: 'preseason',
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
}

describe('attachSeasonOutcomesToEspnDraftPlayers', () => {
  it('attaches an outcome state to every ESPN draft row', () => {
    const rows = attachSeasonOutcomesToEspnDraftPlayers(
      [
        { espnPlayerId: 'espn-1', canonicalPlayerId: 'canon-1', name: 'Player One' },
        { espnPlayerId: 'espn-2', canonicalPlayerId: 'canon-2', name: 'Player Two' },
        { espnPlayerId: 'espn-3', canonicalPlayerId: 'canon-3', name: 'Player Three' },
      ],
      [artifact('canon-1'), artifact('canon-2')],
      context,
    );

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.seasonOutcome != null)).toBe(true);
    expect(rows[0].seasonOutcome.status).toBe('ready');
    expect(rows[1].seasonOutcome.status).toBe('ready');
    expect(rows[2].seasonOutcome.status).toBe('unavailable');
    expect(rows[2].seasonOutcome.blockers).toEqual(['season_outcome_missing']);
  });

  it('never treats an ESPN provider-local ID as the canonical Forecast identity', () => {
    const [row] = attachSeasonOutcomesToEspnDraftPlayers(
      [{ espnPlayerId: 'canon-1', canonicalPlayerId: null, name: 'Unresolved Player' }],
      [artifact('canon-1')],
      context,
    );

    expect(row.seasonOutcome.status).toBe('unavailable');
    expect(row.seasonOutcome.blockers).toEqual(['canonical_player_identity_missing']);
  });

  it('fails closed on duplicate canonical artifacts instead of choosing one arbitrarily', () => {
    const [row] = attachSeasonOutcomesToEspnDraftPlayers(
      [{ espnPlayerId: 'espn-1', canonicalPlayerId: 'canon-1' }],
      [artifact('canon-1'), artifact('canon-1')],
      context,
    );

    expect(row.seasonOutcome.status).toBe('unavailable');
    expect(row.seasonOutcome.blockers).toEqual(['duplicate_season_outcome_artifact']);
  });
});
