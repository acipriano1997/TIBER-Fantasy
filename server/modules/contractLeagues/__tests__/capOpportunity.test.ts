import { buildCapOpportunityFrontier } from '../capOpportunity';
import { compareContractPlayerValues } from '../contractValue';
import { makeBoundarySnapshot } from './decisionBoundaryFixtures';

describe('cap opportunity frontier', () => {
  it('shows what current cap can buy and what additional cap would unlock', () => {
    const comparison = compareContractPlayerValues({
      snapshot: makeBoundarySnapshot(),
      leagueKey: 'league-boundary',
      sourceTeamName: 'Synthetic Team',
      decisionAsOf: '2026-09-15T12:30:00.000Z',
      valueEvidence: {
        schemaVersion: 'contract-player-value-evidence.v1',
        leagueKey: 'league-boundary',
        decisionAsOf: '2026-09-15T12:20:00.000Z',
        evidenceFingerprint: 'sha256:values',
        players: [
          {
            canonicalPlayerId: 'synthetic-player',
            fantasyValue: { metricId: 'fp', horizonId: 'week-2', p10: 5, median: 10, mean: 11, p90: 18 },
            rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 3 },
            uncertaintyLabel: null,
          },
          {
            canonicalPlayerId: 'free-agent-cheap',
            fantasyValue: { metricId: 'fp', horizonId: 'week-2', p10: 4, median: 8, mean: 9, p90: 16 },
            rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 2 },
            uncertaintyLabel: null,
          },
          {
            canonicalPlayerId: 'free-agent-premium',
            fantasyValue: { metricId: 'fp', horizonId: 'week-2', p10: 6, median: 13, mean: 14, p90: 22 },
            rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 5 },
            uncertaintyLabel: null,
          },
        ],
      },
      marketPriceEvidence: {
        schemaVersion: 'contract-market-price-evidence.v1',
        leagueKey: 'league-boundary',
        decisionAsOf: '2026-09-15T12:25:00.000Z',
        evidenceFingerprint: 'sha256:market',
        prices: [
          { canonicalPlayerId: 'free-agent-cheap', acquisitionPrice: 8, currencyId: 'league-cap', confidence: 'MEDIUM', sourceCount: 3 },
          { canonicalPlayerId: 'free-agent-premium', acquisitionPrice: 15, currencyId: 'league-cap', confidence: 'MEDIUM', sourceCount: 3 },
        ],
      },
      replacementPlayerIds: ['free-agent-cheap', 'free-agent-premium'],
    });

    const result = buildCapOpportunityFrontier(comparison, 10);

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.affordable).toEqual([
      expect.objectContaining({
        canonicalPlayerId: 'free-agent-cheap',
        acquisitionPrice: 8,
        rosterMarginalValue: 2,
        capRemainingAfterAcquisition: 2,
      }),
    ]);
    expect(result.nextUnlocks).toEqual([
      expect.objectContaining({
        canonicalPlayerId: 'free-agent-premium',
        acquisitionPrice: 15,
        extraCapRequired: 5,
        rosterMarginalValue: 5,
      }),
    ]);
  });
});
