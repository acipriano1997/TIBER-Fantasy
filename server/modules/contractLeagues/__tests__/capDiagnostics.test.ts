import {
  buildCapConcentrationDiagnostics,
  buildPositionalSpendEfficiency,
} from '../capDiagnostics';
import { compareContractPlayerValues } from '../contractValue';
import { makeBoundarySnapshot } from './decisionBoundaryFixtures';

describe('contract cap diagnostics', () => {
  it('exposes concentration and expiration mechanics without a hidden health score', () => {
    const result = buildCapConcentrationDiagnostics(makeBoundarySnapshot(), 'Synthetic Team');

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.seasons[0]).toMatchObject({
      season: 2026,
      ledgerTotalCapHit: 12,
      contractCapHit: 12,
      deadCap: 0,
      topPlayerCapHitShare: 1,
      topThreePlayerCapHitShare: 1,
      topPlayerGuaranteedShare: 1,
      topThreeGuaranteedShare: 1,
      expiringContractCapHit: 12,
      expiringContractShare: 1,
      optionalMoney: 5,
      optionalShareOfContractCapHit: 0.416667,
    });
    expect(result.seasons[0].byPosition).toEqual([{
      position: 'WR',
      capHit: 12,
      guaranteed: 7,
      optional: 5,
      playerCount: 1,
      shareOfContractCapHit: 1,
    }]);
  });

  it('groups spend efficiency only within the explicit CCF marginal-value metric', () => {
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
        players: [{
          canonicalPlayerId: 'synthetic-player',
          fantasyValue: {
            metricId: 'fantasy-points-weekly',
            horizonId: 'week-2',
            p10: 5,
            median: 10,
            mean: 11,
            p90: 18,
          },
          rosterMarginalValue: { metricId: 'lineup-points-weekly', value: 3 },
          uncertaintyLabel: null,
        }],
      },
    });

    const result = buildPositionalSpendEfficiency(comparison);

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.groups).toEqual([{
      position: 'WR',
      metricId: 'lineup-points-weekly',
      playerCount: 1,
      currentCapHit: 12,
      rosterMarginalValue: 3,
      marginalValuePerCapUnit: 0.25,
    }]);
  });
});
