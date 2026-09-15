import { buildRetentionBudgetPlan } from '../retentionBudget';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

describe('retention budget planner', () => {
  it('reserves explicit retention budgets without inventing extension pricing or legality', () => {
    const result = buildRetentionBudgetPlan({
      snapshot: makeBoundarySnapshot(),
      policy: makeBoundaryPolicy(),
      healthContext: {
        teamKey: 'team-boundary',
        sourceTeamName: 'Synthetic Team',
        phase: 'REGULAR_SEASON',
      },
      targets: [{
        canonicalPlayerId: 'synthetic-player',
        label: 'Priority retention',
        priceSource: 'USER_ASSUMPTION',
        sourceFingerprint: null,
        reserveBySeason: [{ season: 2026, amount: 100 }],
      }],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.seasons[0]).toEqual({
      season: 2026,
      baselineCapRemaining: 488,
      retentionReserve: 100,
      capRemainingForOtherMoves: 388,
    });
    expect(result.legalExecution).toMatchObject({
      status: 'UNAVAILABLE',
      reasonCode: 'RE_SIGN_TRANSACTION_ENGINE_REQUIRED',
    });
  });
});
