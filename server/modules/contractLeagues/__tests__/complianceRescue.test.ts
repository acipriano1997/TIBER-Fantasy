import { buildMultiYearCapHealth, certifyCapLiquidityCandidates } from '../capIntelligence';
import { findCertifiedSingleActionComplianceRescue } from '../complianceRescue';
import {
  makeBoundaryContext,
  makeBoundaryPolicy,
  makeBoundarySnapshot,
} from './decisionBoundaryFixtures';

describe('single-action compliance rescue', () => {
  it('surfaces a move only when its owning engine certifies the post-action state legal', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.teams[0].contracts[0].totalValue = 510;
    snapshot.teams[0].contracts[0].aav = 510;
    snapshot.teams[0].contracts[0].years[0] = {
      season: 2026,
      guaranteed: 500,
      optional: 10,
      capHit: 510,
    };
    snapshot.teams[0].cap[0] = {
      season: 2026,
      totalGuaranteed: 500,
      totalCapHit: 510,
      capAfterGuarantees: 0,
      capRemaining: -10,
    };
    const policy = makeBoundaryPolicy();
    policy.transactions.cuts.financialTreatment = {
      guaranteed: 'CLEAR',
      optional: 'CLEAR',
      deadCapCountsTowardGuaranteedLedger: false,
    };

    const health = buildMultiYearCapHealth(snapshot, policy, {
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
    });
    const candidates = certifyCapLiquidityCandidates(snapshot, policy, [{
      candidateId: 'cut-over-cap-contract',
      targetTeamKey: 'team-boundary',
      kind: 'TRANSACTION',
      context: makeBoundaryContext(),
      action: {
        type: 'CUT',
        teamKey: 'team-boundary',
        player: { canonicalPlayerId: 'synthetic-player' },
      },
    }]);

    const result = findCertifiedSingleActionComplianceRescue(health, 2026, candidates);

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.violationRuleIds).toEqual(['synthetic-cap']);
    expect(result.options).toEqual([
      expect.objectContaining({
        candidateId: 'cut-over-cap-contract',
        currentSeasonRelief: 510,
      }),
    ]);
  });

  it('gates combinations when no supplied single action is certified as a rescue', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.teams[0].contracts[0].years[0].capHit = 510;
    snapshot.teams[0].contracts[0].years[0].guaranteed = 500;
    snapshot.teams[0].contracts[0].years[0].optional = 10;
    snapshot.teams[0].cap[0] = {
      season: 2026,
      totalGuaranteed: 500,
      totalCapHit: 510,
      capAfterGuarantees: 0,
      capRemaining: -10,
    };
    const health = buildMultiYearCapHealth(snapshot, makeBoundaryPolicy(), {
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
    });

    const result = findCertifiedSingleActionComplianceRescue(health, 2026, []);

    expect(result.status).toBe('MULTI_ACTION_GATED');
    if (result.status !== 'MULTI_ACTION_GATED') return;
    expect(result.reasonCode).toBe('HYPOTHETICAL_BRANCH_STATE_REQUIRED');
  });
});
