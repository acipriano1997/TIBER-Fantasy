import { compareContractPlayerValues } from '../contractValue';
import { makeBoundarySnapshot } from './decisionBoundaryFixtures';

function valueEvidence() {
  return {
    schemaVersion: 'contract-player-value-evidence.v1' as const,
    leagueKey: 'league-boundary',
    decisionAsOf: '2026-09-15T12:20:00.000Z',
    evidenceFingerprint: 'sha256:ccf-values',
    players: [
      {
        canonicalPlayerId: 'synthetic-player',
        fantasyValue: {
          metricId: 'fantasy-points-weekly',
          horizonId: 'week-2',
          p10: 6,
          median: 12,
          mean: 12.5,
          p90: 20,
        },
        rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 4 },
        uncertaintyLabel: 'MEDIUM',
      },
      {
        canonicalPlayerId: 'free-agent-1',
        fantasyValue: {
          metricId: 'fantasy-points-weekly',
          horizonId: 'week-2',
          p10: 4,
          median: 10,
          mean: 10.5,
          p90: 18,
        },
        rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 2.5 },
        uncertaintyLabel: 'MEDIUM',
      },
    ],
  };
}

describe('CCF contract value comparison boundary', () => {
  it('keeps native player value, contract cost, market price, and monetary surplus separate', () => {
    const result = compareContractPlayerValues({
      snapshot: makeBoundarySnapshot(),
      leagueKey: 'league-boundary',
      sourceTeamName: 'Synthetic Team',
      decisionAsOf: '2026-09-15T12:30:00.000Z',
      valueEvidence: valueEvidence(),
      marketPriceEvidence: {
        schemaVersion: 'contract-market-price-evidence.v1',
        leagueKey: 'league-boundary',
        decisionAsOf: '2026-09-15T12:25:00.000Z',
        evidenceFingerprint: 'sha256:market',
        prices: [{
          canonicalPlayerId: 'free-agent-1',
          acquisitionPrice: 8,
          currencyId: 'league-cap',
          confidence: 'MEDIUM',
          sourceCount: 4,
        }],
      },
      replacementPlayerIds: ['free-agent-1'],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      canonicalPlayerId: 'synthetic-player',
      rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 4 },
      contractCost: {
        currentSeason: { season: 2026, guaranteed: 7, optional: 5, capHit: 12 },
        totalRemainingCapHit: 12,
      },
      capEfficiency: {
        metricId: 'lineup-points-weekly',
        currentSeasonMarginalValuePerCapUnit: 0.333333,
      },
      marketAcquisitionPrice: null,
      monetarySurplus: { status: 'UNAVAILABLE' },
    });
    expect(result.replacementFrontier).toEqual([{
      canonicalPlayerId: 'free-agent-1',
      rosterMarginalValue: 2.5,
      metricId: 'lineup-points-weekly',
      currentContractCapHit: null,
      marketAcquisitionPrice: 8,
    }]);
  });

  it('rejects CCF evidence from after the frozen decision time', () => {
    const values = valueEvidence();
    values.decisionAsOf = '2026-09-15T12:31:00.000Z';
    const result = compareContractPlayerValues({
      snapshot: makeBoundarySnapshot(),
      leagueKey: 'league-boundary',
      sourceTeamName: 'Synthetic Team',
      decisionAsOf: '2026-09-15T12:30:00.000Z',
      valueEvidence: values,
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CCF_VALUE_AFTER_DECISION');
  });

  it('rejects a snapshot imported after the frozen decision time', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.provenance.importedAt = '2026-09-15T12:31:00.000Z';
    const result = compareContractPlayerValues({
      snapshot,
      leagueKey: 'league-boundary',
      sourceTeamName: 'Synthetic Team',
      decisionAsOf: '2026-09-15T12:30:00.000Z',
      valueEvidence: valueEvidence(),
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('SNAPSHOT_IMPORTED_AFTER_DECISION');
  });

  it('rejects source contract state modified after the frozen decision time', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.provenance.sourceModifiedAt = '2026-09-15T12:31:00.000Z';
    const result = compareContractPlayerValues({
      snapshot,
      leagueKey: 'league-boundary',
      sourceTeamName: 'Synthetic Team',
      decisionAsOf: '2026-09-15T12:30:00.000Z',
      valueEvidence: valueEvidence(),
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION');
  });
});
