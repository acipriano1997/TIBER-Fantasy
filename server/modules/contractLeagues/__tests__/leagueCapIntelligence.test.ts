import { buildLeagueWideCapCapacity } from '../leagueCapIntelligence';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

describe('league-wide cap intelligence', () => {
  it('ranks factual cap absorption capacity without inferring manager intent', () => {
    const snapshot = makeBoundarySnapshot();
    snapshot.teams.push({
      sourceTeamName: 'Second Team',
      platformRosterId: null,
      contracts: [{
        sourcePlayerName: 'Second Team Player',
        canonicalPlayerId: 'second-team-player',
        position: 'RB',
        status: 'ACTIVE',
        totalValue: 100,
        aav: 100,
        years: [{ season: 2026, guaranteed: 50, optional: 50, capHit: 100 }],
        metadata: { notes: [] },
      }],
      deadCap: [],
      cap: [{
        season: 2026,
        totalGuaranteed: 50,
        totalCapHit: 100,
        capAfterGuarantees: 450,
        capRemaining: 400,
      }],
    });

    const result = buildLeagueWideCapCapacity({
      snapshot,
      policy: makeBoundaryPolicy(),
      phase: 'REGULAR_SEASON',
      teamBindings: [
        { teamKey: 'team-boundary', sourceTeamName: 'Synthetic Team' },
        { teamKey: 'team-second', sourceTeamName: 'Second Team' },
      ],
    });

    expect(result.status).toBe('READY');
    if (result.status === 'ABSTAIN') return;
    expect(result.teams.map((team) => ({
      teamKey: team.teamKey,
      capacity: team.currentCapOnlyAbsorptionCapacity,
      rank: team.rankByCurrentCapOnlyCapacity,
      intent: team.inferredManagerIntent,
    }))).toEqual([
      { teamKey: 'team-boundary', capacity: 488, rank: 1, intent: null },
      { teamKey: 'team-second', capacity: 400, rank: 2, intent: null },
    ]);
  });

  it('returns partial evidence when one explicit binding cannot be resolved', () => {
    const result = buildLeagueWideCapCapacity({
      snapshot: makeBoundarySnapshot(),
      policy: makeBoundaryPolicy(),
      phase: 'REGULAR_SEASON',
      teamBindings: [
        { teamKey: 'team-boundary', sourceTeamName: 'Synthetic Team' },
        { teamKey: 'missing-team', sourceTeamName: 'Missing Source Team' },
      ],
    });

    expect(result.status).toBe('PARTIAL');
    if (result.status === 'ABSTAIN') return;
    expect(result.teams).toHaveLength(1);
    expect(result.unavailableTeams[0].reasonCodes).toContain('TEAM_BINDING_UNRESOLVED');
  });
});
