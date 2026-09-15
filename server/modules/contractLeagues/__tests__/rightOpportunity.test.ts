import { certifyCapLiquidityCandidates, type CapLiquidityCandidate } from '../capIntelligence';
import { buildScarceRightOpportunityCost } from '../rightOpportunity';
import {
  makeBoundaryContext,
  makeBoundaryPolicy,
  makeBoundarySnapshot,
} from './decisionBoundaryFixtures';

describe('scarce contract-right opportunity cost', () => {
  it('shows when using the final amnesty forecloses another certified alternative', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.teams[0].contracts.push({
      sourcePlayerName: 'Second Synthetic Player',
      canonicalPlayerId: 'synthetic-player-2',
      position: 'RB',
      status: 'ACTIVE',
      totalValue: 10,
      aav: 10,
      years: [{ season: 2026, guaranteed: 5, optional: 5, capHit: 10 }],
      metadata: { notes: [] },
    });
    snapshot.teams[0].cap[0] = {
      season: 2026,
      totalGuaranteed: 12,
      totalCapHit: 22,
      capAfterGuarantees: 488,
      capRemaining: 478,
    };

    const policy = makeBoundaryPolicy();
    policy.contracts.amnesty = {
      enabled: true,
      allowance: { maxUses: 1, mode: 'LIFETIME', windowSeasons: null },
      clearsGuaranteedMoney: true,
      clearsOptionalMoney: true,
      sendsPlayerToWaivers: true,
      reacquisitionCooldownHours: null,
    };
    const context = makeBoundaryContext();

    const candidates: CapLiquidityCandidate[] = [
      {
        candidateId: 'amnesty-1',
        targetTeamKey: 'team-boundary',
        kind: 'TRANSACTION',
        context,
        action: { type: 'AMNESTY', teamKey: 'team-boundary', player: { canonicalPlayerId: 'synthetic-player' } },
      },
      {
        candidateId: 'amnesty-2',
        targetTeamKey: 'team-boundary',
        kind: 'TRANSACTION',
        context,
        action: { type: 'AMNESTY', teamKey: 'team-boundary', player: { canonicalPlayerId: 'synthetic-player-2' } },
      },
    ];
    const results = certifyCapLiquidityCandidates(snapshot, policy, candidates);
    expect(results.every((result) => result.status === 'READY')).toBe(true);

    const opportunity = buildScarceRightOpportunityCost({
      leagueKey: 'league-boundary',
      asOfSeason: 2026,
      policy,
      rightsState: context.rightsState,
      candidates,
      results,
    });

    expect(opportunity.status).toBe('READY');
    if (opportunity.status !== 'READY') return;
    expect(opportunity.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: 'amnesty-1',
        rightType: 'AMNESTY',
        remainingBefore: 1,
        remainingAfter: 0,
        consumesLastAvailableRight: true,
        alternativeCandidateIds: ['amnesty-2'],
        opportunityCost: 'FORECLOSES_CERTIFIED_ALTERNATIVES',
      }),
      expect.objectContaining({
        candidateId: 'amnesty-2',
        alternativeCandidateIds: ['amnesty-1'],
      }),
    ]));
  });
});
