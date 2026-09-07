import {
  computeTruthBoundLeagueDashboard,
  LeagueDashboardTruthError,
  LEAGUE_DASHBOARD_TRUTH_BOUNDARY_VERSION,
} from '../leagueDashboardTruthBoundary';

const FIXED_NOW = new Date('2026-09-07T12:00:00.000Z');

function basePayload(teams: any[]) {
  return {
    success: true as const,
    meta: {
      league_id: 'league-1',
      week: 1,
      season: 2026,
      computed_at: FIXED_NOW.toISOString(),
      cached: false,
    },
    diagnostics: {
      forgeArtifact: {
        state: 'available',
        available: true,
        code: null,
        sourcePath: '/tmp/forge_player_static_v1.json',
        contractVersion: 'v1',
        generatedAt: '2026-09-01T12:00:00.000Z',
        generatedAtSource: 'root_generated_at',
        promotedAt: null,
        freshness: { status: 'fresh' },
      },
    },
    unresolvedPlayers: [],
    teams,
  } as any;
}

function player(sleeperId: string, pos: string, alpha: number | null, source: string = 'player_specific') {
  return {
    rosterKey: `sleeper:${sleeperId}`,
    canonicalId: `sleeper:${sleeperId}`,
    sleeperId,
    name: sleeperId,
    pos,
    alpha,
    forgeScoreSource: source,
    usedAsStarter: false,
  };
}

function deps(overrides: any = {}) {
  const league = {
    id: 'league-1',
    userId: 'personal-user',
    leagueIdExternal: 'sleeper-league',
    scoringFormat: 'ppr',
    season: 2026,
    settings: { roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX'] },
    teams: [
      { id: 'team-a', externalRosterId: '2', externalUserId: 'owner-b', displayName: 'A' },
      { id: 'team-b', externalRosterId: '1', externalUserId: 'owner-a', displayName: 'B' },
    ],
  };

  const legacyPayload = basePayload([
    {
      team_id: 'team-a',
      display_name: 'A',
      totals: { QB: 0, RB: 0, WR: 90, TE: 0 },
      bench_contribution: 0,
      overall_total: 90,
      starters_used: [player('s1', 'WR', 90)],
      roster: [player('s1', 'WR', 90)],
    },
    {
      team_id: 'team-b',
      display_name: 'B',
      totals: { QB: 0, RB: 0, WR: 20, TE: 0 },
      bench_contribution: 0,
      overall_total: 20,
      starters_used: [player('s2', 'WR', 20)],
      roster: [player('s2', 'WR', 20), player('s3', 'WR', 10)],
    },
  ]);

  return {
    storage: {
      getLeagueWithTeams: jest.fn().mockResolvedValue(league),
    },
    sleeperClient: {
      getLeagueRosters: jest.fn().mockResolvedValue([
        { roster_id: 1, owner_id: 'owner-a', players: ['s1'], starters: ['s1'] },
        { roster_id: 2, owner_id: 'owner-b', players: ['s2', 's3'], starters: ['s3'] },
      ]),
    },
    computeLeagueDashboard: jest.fn().mockResolvedValue(legacyPayload),
    now: () => FIXED_NOW,
    ...overrides,
  } as any;
}

describe('league dashboard truth boundary', () => {
  it('binds teams by externalRosterId instead of payload ordering or synthetic lineup state', async () => {
    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1', week: 1, season: 2026 },
      deps(),
    );

    const teamA = result.teams.find((team: any) => team.team_id === 'team-a') as any;
    const teamB = result.teams.find((team: any) => team.team_id === 'team-b') as any;

    expect(teamA.roster.map((row: any) => row.sleeperId)).toEqual(['s2', 's3']);
    expect(teamB.roster.map((row: any) => row.sleeperId)).toEqual(['s1']);
  });

  it('uses Sleeper observed starters rather than the highest FORGE alpha', async () => {
    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      deps(),
    );

    const teamA = result.teams.find((team: any) => team.team_id === 'team-a') as any;
    expect(teamA.roster.find((row: any) => row.sleeperId === 's2').usedAsStarter).toBe(false);
    expect(teamA.roster.find((row: any) => row.sleeperId === 's3').usedAsStarter).toBe(true);
    expect(teamA.starters_used.map((row: any) => row.sleeperId)).toEqual(['s3']);
    expect(teamA.starter_source).toBe('sleeper_observed');
    expect(teamA.totals.WR).toBe(10);
  });

  it('attaches an inspectable context receipt with exact roster, owner, and settings bindings', async () => {
    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1', week: 1, season: 2026 },
      deps(),
    ) as any;

    expect(result.context_receipt).toEqual(expect.objectContaining({
      version: LEAGUE_DASHBOARD_TRUTH_BOUNDARY_VERSION,
      user_id: 'personal-user',
      league_id: 'league-1',
      external_league_id: 'sleeper-league',
      settings_fingerprint: expect.any(String),
      roster_binding: 'external_roster_id_to_sleeper_roster_id',
      starter_source: 'sleeper_observed',
      fingerprint: expect.any(String),
      observed_at: FIXED_NOW.toISOString(),
    }));
    expect(result.context_receipt.team_receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        team_id: 'team-a',
        external_roster_id: '2',
        expected_external_owner_id: 'owner-b',
        sleeper_permitted_owner_ids: ['owner-b'],
        forge_freshness_decision: 'accepted',
      }),
      expect.objectContaining({
        team_id: 'team-b',
        external_roster_id: '1',
        expected_external_owner_id: 'owner-a',
        sleeper_permitted_owner_ids: ['owner-a'],
        forge_freshness_decision: 'accepted',
      }),
    ]));
  });

  it('suppresses Overall when player-specific FORGE coverage is insufficient', async () => {
    const custom = deps();
    const payload = await custom.computeLeagueDashboard();
    payload.teams[1].roster[1] = player('s3', 'WR', 10, 'generated_baseline');
    custom.computeLeagueDashboard.mockResolvedValue(payload);

    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      custom,
    );

    const teamA = result.teams.find((team: any) => team.team_id === 'team-a') as any;
    expect(teamA.overall_available).toBe(false);
    expect(teamA.overall_total).toBeNull();
    expect(teamA.overall_unavailable_reason).toBe('insufficient_player_specific_forge_coverage');
  });

  it('suppresses Overall when FORGE player-specific evidence is stale', async () => {
    const custom = deps();
    const payload = await custom.computeLeagueDashboard();
    payload.diagnostics.forgeArtifact.generatedAt = '2026-01-01T00:00:00.000Z';
    custom.computeLeagueDashboard.mockResolvedValue(payload);

    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      custom,
    );

    const teamA = result.teams.find((team: any) => team.team_id === 'team-a') as any;
    expect(teamA.overall_available).toBe(false);
    expect(teamA.overall_total).toBeNull();
    expect(teamA.overall_unavailable_reason).toBe('forge_freshness_root_generated_at_stale');
    expect(teamA.forge_freshness_receipt.decision).toBe('rejected');
  });

  it('fails closed when persisted externalRosterId cannot be matched', async () => {
    const custom = deps();
    custom.sleeperClient.getLeagueRosters.mockResolvedValue([
      { roster_id: 1, owner_id: 'owner-a', players: ['s1'], starters: ['s1'] },
    ]);

    await expect(computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      custom,
    )).rejects.toMatchObject<Partial<LeagueDashboardTruthError>>({
      code: 'external_roster_binding_mismatch',
      statusCode: 409,
    });
  });

  it('fails closed when roster id matches but persisted owner identity conflicts', async () => {
    const custom = deps();
    const league = await custom.storage.getLeagueWithTeams();
    league.teams[0].externalUserId = 'wrong-owner';
    custom.storage.getLeagueWithTeams.mockResolvedValue(league);

    await expect(computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      custom,
    )).rejects.toMatchObject<Partial<LeagueDashboardTruthError>>({
      code: 'external_roster_owner_mismatch',
      statusCode: 409,
    });
  });

  it('accepts a persisted owner that is an observed Sleeper co-owner', async () => {
    const custom = deps();
    const league = await custom.storage.getLeagueWithTeams();
    league.teams[0].externalUserId = 'co-owner-b';
    custom.storage.getLeagueWithTeams.mockResolvedValue(league);
    custom.sleeperClient.getLeagueRosters.mockResolvedValue([
      { roster_id: 1, owner_id: 'owner-a', players: ['s1'], starters: ['s1'] },
      { roster_id: 2, owner_id: 'owner-b', co_owners: ['co-owner-b'], players: ['s2', 's3'], starters: ['s3'] },
    ]);

    const result = await computeTruthBoundLeagueDashboard(
      { userId: 'personal-user', leagueId: 'league-1' },
      custom,
    ) as any;
    const receipt = result.context_receipt.team_receipts.find((row: any) => row.team_id === 'team-a');
    expect(receipt.expected_external_owner_id).toBe('co-owner-b');
    expect(receipt.sleeper_permitted_owner_ids).toEqual(['owner-b', 'co-owner-b']);
  });

  it('rejects the legacy shared default_user at the service boundary', async () => {
    await expect(computeTruthBoundLeagueDashboard(
      { userId: 'default_user', leagueId: 'league-1' },
      deps(),
    )).rejects.toMatchObject<Partial<LeagueDashboardTruthError>>({
      code: 'unscoped_user_id',
      statusCode: 400,
    });
  });
});
