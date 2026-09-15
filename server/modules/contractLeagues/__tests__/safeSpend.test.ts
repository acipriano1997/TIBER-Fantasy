import { calculateSafeSpendEnvelope } from '../safeSpend';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

describe('contract safe spend envelope', () => {
  it('separates current cap capacity, constraint-safe capacity, and unavailable legal/recommended maxima', () => {
    const policy = makeBoundaryPolicy();
    policy.freeAgency.salaryIncrement = 1;

    const result = calculateSafeSpendEnvelope({
      snapshot: makeBoundarySnapshot(),
      policy,
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
      startSeason: 2026,
      years: 1,
      structureId: 'synthetic',
      constraints: [{ season: 2026, minimumRemainingCapRoom: 100 }],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.capCapacityMaximumAnnualValue).toBe(488);
    expect(result.constraintSafeMaximumAnnualValue).toBe(388);
    expect(result.legalMaximum).toMatchObject({
      status: 'UNAVAILABLE',
      reasonCode: 'FREE_AGENT_TRANSACTION_ENGINE_REQUIRED',
    });
    expect(result.ccfRecommendedRange).toMatchObject({
      status: 'UNAVAILABLE',
      reasonCode: 'CCF_VALUE_DECISION_REQUIRED',
    });
  });

  it('fails closed when a proposed term reaches a season without authoritative cap state', () => {
    const result = calculateSafeSpendEnvelope({
      snapshot: makeBoundarySnapshot(),
      policy: makeBoundaryPolicy(),
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
      startSeason: 2026,
      years: 2,
      structureId: 'synthetic',
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
  });
});
