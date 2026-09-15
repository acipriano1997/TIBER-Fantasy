import {
  buildMultiYearCapHealth,
  certifyCapLiquidityCandidates,
} from '../capIntelligence';
import {
  makeBoundaryContext,
  makeBoundaryPolicy,
  makeBoundarySnapshot,
} from './decisionBoundaryFixtures';

describe('contract cap intelligence primitives', () => {
  it('derives inspectable multi-year cap health without an opaque score', () => {
    const snapshot = makeBoundarySnapshot();
    const policy = makeBoundaryPolicy();
    policy.cap.compliance[0].reserveAmount = 25;

    const result = buildMultiYearCapHealth(snapshot, policy, {
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.seasons).toHaveLength(1);
    expect(result.seasons[0]).toMatchObject({
      season: 2026,
      sourceCapRemaining: 488,
      guaranteedObligation: 7,
      optionalObligation: 5,
      contractCapHit: 12,
      deadCap: 0,
      committedRosterSpots: 1,
      minimumFillCost: null,
      strictestHardHeadroom: 463,
    });
    expect(result.seasons[0].compliance[0]).toMatchObject({
      ruleId: 'synthetic-cap',
      allowedAmount: 475,
      measuredAmount: 12,
      headroom: 463,
      status: 'COMPLIANT',
    });
    expect(result.currentViolation).toBe(false);
  });

  it('separates a deterministic future cap violation from the current season', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.teams[0].contracts[0].years.push({
      season: 2027,
      guaranteed: 600,
      optional: 0,
      capHit: 600,
    });
    snapshot.teams[0].cap.push({
      season: 2027,
      totalGuaranteed: 600,
      totalCapHit: 600,
      capAfterGuarantees: -100,
      capRemaining: -100,
    });
    const policy = makeBoundaryPolicy();

    const result = buildMultiYearCapHealth(snapshot, policy, {
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.currentViolation).toBe(false);
    expect(result.knownFutureViolation).toBe(true);
    expect(result.firstViolationSeason).toBe(2027);
  });

  it('uses the known-at transaction boundary to certify liquidity instead of recreating cut math', () => {
    const snapshot = makeBoundarySnapshot();
    const policy = makeBoundaryPolicy();
    policy.transactions.cuts.financialTreatment = {
      guaranteed: 'CLEAR',
      optional: 'CLEAR',
      deadCapCountsTowardGuaranteedLedger: false,
    };
    const context = makeBoundaryContext();

    const results = certifyCapLiquidityCandidates(snapshot, policy, [{
      candidateId: 'cut-synthetic-player',
      targetTeamKey: 'team-boundary',
      kind: 'TRANSACTION',
      context,
      action: {
        type: 'CUT',
        teamKey: 'team-boundary',
        player: { canonicalPlayerId: 'synthetic-player' },
      },
    }]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      candidateId: 'cut-synthetic-player',
      status: 'READY',
      currentSeasonRelief: 12,
      totalPositiveRelief: 12,
      firstPositiveReliefSeason: 2026,
      rightsConsumed: 0,
      ccfValueLost: null,
    });
    expect(results[0].reliefBySeason).toEqual([
      { season: 2026, capRoomDelta: 12, deadCapDelta: 0 },
    ]);
  });
});
