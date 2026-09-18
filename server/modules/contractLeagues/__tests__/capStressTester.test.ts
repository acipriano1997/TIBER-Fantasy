import { evaluatePlanningOnlyCapScenario } from '../capStressTester';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

function scenario() {
  return {
    schemaVersion: 'contract-cap-scenario.v1' as const,
    scenarioId: 'planning-scenario',
    leagueKey: 'league-boundary',
    baseSnapshotFingerprint: 'sha256:snapshot',
    policyVersion: 'policy-v1',
    rightsStateFingerprint: null,
    decisionAsOf: '2026-09-15T12:30:00.000Z',
    ccfEvidenceFingerprint: null,
    assumptions: [
      { type: 'RESERVE_BUDGET' as const, category: 'IN_SEASON', amount: 50, season: 2026 },
      {
        type: 'TARGET_ACQUISITION' as const,
        player: { canonicalPlayerId: 'free-agent-1' },
        annualSalary: 100,
        years: 1,
        startSeason: 2026,
      },
    ],
    proposedActions: [],
    constraints: [
      { type: 'MINIMUM_CAP_ROOM' as const, season: 2026, amount: 350 },
      { type: 'MAXIMUM_DEAD_CAP' as const, season: 2026, amount: 0 },
    ],
    objective: 'PROTECT_FUTURE_FLEXIBILITY' as const,
    origin: { createdBy: 'USER' as const, label: 'Planning stress test' },
  };
}

describe('planning-only cap stress tester', () => {
  it('keeps explicit assumptions separate from baseline cap truth and evaluates supported constraints', () => {
    const result = evaluatePlanningOnlyCapScenario({
      snapshot: makeBoundarySnapshot(),
      policy: makeBoundaryPolicy(),
      leagueKey: 'league-boundary',
      healthContext: {
        teamKey: 'team-boundary',
        sourceTeamName: 'Synthetic Team',
        phase: 'REGULAR_SEASON',
      },
      scenario: scenario(),
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.seasons[0]).toMatchObject({
      season: 2026,
      baselineCapRemaining: 488,
      assumedCapChange: -150,
      projectedCapRemaining: 338,
    });
    expect(result.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'MINIMUM_CAP_ROOM', status: 'FAIL', season: 2026 }),
      expect.objectContaining({ type: 'MAXIMUM_DEAD_CAP', status: 'PASS', season: 2026 }),
    ]));
    expect(result.allResolvedConstraintsPass).toBe(false);
  });

  it('hard-gates transaction sequences instead of summing independent deltas', () => {
    const input = scenario();
    input.proposedActions = [{
      actionId: 'cut-player',
      engine: 'TRANSACTION',
      payload: { type: 'CUT', teamKey: 'team-boundary', player: { canonicalPlayerId: 'synthetic-player' } },
    }];

    const result = evaluatePlanningOnlyCapScenario({
      snapshot: makeBoundarySnapshot(),
      policy: makeBoundaryPolicy(),
      leagueKey: 'league-boundary',
      healthContext: {
        teamKey: 'team-boundary',
        sourceTeamName: 'Synthetic Team',
        phase: 'REGULAR_SEASON',
      },
      scenario: input,
    });

    expect(result.status).toBe('EXECUTION_GATED');
    if (result.status !== 'EXECUTION_GATED') return;
    expect(result.reasonCodes).toContain('HYPOTHETICAL_BRANCH_STATE_REQUIRED');
  });
});
