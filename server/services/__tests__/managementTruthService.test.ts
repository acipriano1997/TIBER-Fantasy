jest.mock('../../storage', () => ({ storage: {} }));
jest.mock('../../integrations/sleeperClient', () => ({ sleeperClient: {} }));
jest.mock('../leagueDashboardService', () => ({
  computeLeagueDashboard: jest.fn(),
}));

import {
  MANAGEMENT_TRUTH_VERSION,
  computeTruthBoundLeagueDashboard,
} from '../managementTruthService';

function legacyPlayer(
  sleeperId: string,
  alpha: number | null,
  forgeScoreSource: string | null,
  usedAsStarter: boolean,
  pos = 'WR',
) {
  return {
    rosterKey: `sleeper:${sleeperId}`,
    canonicalId: `sleeper:${sleeperId}`,
    sleeperId,
    provider: 'sleeper',
    providerPlayerId: sleeperId,
    name: `Player ${sleeperId}`,
    pos,
    alpha,
    forgeScoreSource,
    usedAsStarter,
  };
}

function buildDeps(options: {
  team?: any;
  sleeperRosters?: any[];
  legacyRoster?: any[];
} = {}) {
  const team = options.team ?? {
    id: 'team-1',
    externalUserId: 'legacy-owner-id',
    externalRosterId: '7',
    displayName: 'Truth Team',
  };
  const league = {
    id: 'league-1',
    userId: 'user-1',
    leagueIdExternal: 'sleeper-league-1',
    teams: [team],
  };
  const sleeperRosters = options.sleeperRosters ?? [
    {
      roster_id: 7,
      owner_id: 'current-owner-id',
      players: ['s1', 's2'],
      starters: ['s2'],
    },
  ];
  const legacyRoster = options.legacyRoster ?? [
    legacyPlayer('s1', 10, 'player_specific', true),
    legacyPlayer('s2', 20, 'player_specific', false),
  ];
  const legacyPayload = {
    success: true,
    meta: {
      league_id: 'league-1',
      week: 1,
      season: 2026,
      computed_at: '2026-09-07T18:00:00.000Z',
      cached: true,
    },
    unresolvedPlayers: [],
    teams: [
      {
        team_id: 'team-1',
        display_name: 'Truth Team',
        totals: { QB: 0, RB: 0, WR: 10, TE: 0 },
        bench_contribution: 3,
        overall_total: 13,
        starters_used: [legacyRoster[0]],
        roster: legacyRoster,
      },
    ],
  };

  return {
    storage: {
      getLeagueWithTeams: jest.fn().mockResolvedValue(league),
    },
    sleeperClient: {
      getLeagueRosters: jest.fn().mockResolvedValue(sleeperRosters),
    },
    computeLeagueDashboard: jest.fn().mockResolvedValue(legacyPayload),
  } as any;
}

describe('computeTruthBoundLeagueDashboard', () => {
  it('binds by external_roster_id and overwrites synthetic starter state from Sleeper starters', async () => {
    const deps = buildDeps();

    const result: any = await computeTruthBoundLeagueDashboard(
      { userId: 'user-1', leagueId: 'league-1', season: 2026, week: 1 },
      deps,
    );

    expect(result.meta.management_truth_version).toBe(MANAGEMENT_TRUTH_VERSION);
    expect(result.meta.roster_binding).toBe('external_roster_id');
    expect(result.teams[0].binding.external_roster_id).toBe('7');
    expect(result.teams[0].binding.sleeper_owner_id).toBe('current-owner-id');

    const s1 = result.teams[0].roster.find((player: any) => player.sleeperId === 's1');
    const s2 = result.teams[0].roster.find((player: any) => player.sleeperId === 's2');
    expect(s1.usedAsStarter).toBe(false);
    expect(s2.usedAsStarter).toBe(true);
    expect(result.teams[0].starters_used.map((player: any) => player.sleeperId)).toEqual(['s2']);
    expect(result.teams[0].totals.WR).toBe(20);
  });

  it('does not require owner_id equality when canonical external_roster_id matches', async () => {
    const deps = buildDeps({
      team: {
        id: 'team-1',
        externalUserId: 'former-owner',
        externalRosterId: '7',
        displayName: 'Truth Team',
      },
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'new-owner',
          players: ['s1', 's2'],
          starters: ['s2'],
        },
      ],
    });

    const result: any = await computeTruthBoundLeagueDashboard(
      { userId: 'user-1', leagueId: 'league-1' },
      deps,
    );

    expect(result.teams[0].binding.status).toBe('verified');
    expect(result.teams[0].binding.sleeper_owner_id).toBe('new-owner');
  });

  it('ignores Sleeper empty-slot placeholder 0 without inventing a player', async () => {
    const deps = buildDeps({
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'owner',
          players: ['s1', 's2'],
          starters: ['s2', '0'],
        },
      ],
    });

    const result: any = await computeTruthBoundLeagueDashboard(
      { userId: 'user-1', leagueId: 'league-1' },
      deps,
    );

    expect(result.teams[0].binding.observed_starter_count).toBe(1);
    expect(result.teams[0].starters_used.map((player: any) => player.sleeperId)).toEqual(['s2']);
  });

  it('fails closed when Sleeper starter state is unavailable instead of treating everyone as bench', async () => {
    const deps = buildDeps({
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'owner',
          players: ['s1', 's2'],
          starters: null,
        },
      ],
    });

    await expect(
      computeTruthBoundLeagueDashboard({ userId: 'user-1', leagueId: 'league-1' }, deps),
    ).rejects.toMatchObject({
      code: 'sleeper_starters_unavailable',
    });
  });

  it('fails closed when a Sleeper starter is not on the bound roster', async () => {
    const deps = buildDeps({
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'owner',
          players: ['s1', 's2'],
          starters: ['not-on-roster'],
        },
      ],
    });

    await expect(
      computeTruthBoundLeagueDashboard({ userId: 'user-1', leagueId: 'league-1' }, deps),
    ).rejects.toMatchObject({
      code: 'sleeper_starter_not_on_roster',
    });
  });

  it('fails closed when the legacy roster membership does not match the external roster', async () => {
    const deps = buildDeps({
      legacyRoster: [legacyPlayer('wrong-player', 50, 'player_specific', true)],
    });

    await expect(
      computeTruthBoundLeagueDashboard({ userId: 'user-1', leagueId: 'league-1' }, deps),
    ).rejects.toMatchObject({
      code: 'dashboard_roster_mismatch',
    });
  });

  it('fails closed when the dashboard repeats a player row instead of deduplicating it', async () => {
    const deps = buildDeps({
      legacyRoster: [
        legacyPlayer('s1', 10, 'player_specific', true),
        legacyPlayer('s1', 10, 'player_specific', false),
        legacyPlayer('s2', 20, 'player_specific', false),
      ],
    });

    await expect(
      computeTruthBoundLeagueDashboard({ userId: 'user-1', leagueId: 'league-1' }, deps),
    ).rejects.toMatchObject({
      code: 'dashboard_roster_duplicate_player_id',
    });
  });

  it('fails closed when a team has no external_roster_id instead of falling back to owner id', async () => {
    const deps = buildDeps({
      team: {
        id: 'team-1',
        externalUserId: 'owner-only',
        externalRosterId: null,
        displayName: 'Truth Team',
      },
    });

    await expect(
      computeTruthBoundLeagueDashboard({ userId: 'user-1', leagueId: 'league-1' }, deps),
    ).rejects.toMatchObject({
      code: 'team_missing_external_roster_id',
    });
  });

  it('suppresses Overall when any roster contribution lacks player-specific FORGE evidence', async () => {
    const deps = buildDeps({
      legacyRoster: [
        legacyPlayer('s1', 10, 'player_specific', true),
        legacyPlayer('s2', 75, 'generated_baseline', false),
      ],
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'owner',
          players: ['s1', 's2'],
          starters: ['s1'],
        },
      ],
    });

    const result: any = await computeTruthBoundLeagueDashboard(
      { userId: 'user-1', leagueId: 'league-1' },
      deps,
    );

    expect(result.teams[0].overall_total).toBeNull();
    expect(result.teams[0].bench_contribution).toBeNull();
    expect(result.teams[0].evaluation).toMatchObject({
      status: 'insufficient_evidence',
      overall_available: false,
    });
  });

  it('suppresses Overall when Sleeper truth reports no observed starters', async () => {
    const deps = buildDeps({
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'owner',
          players: ['s1', 's2'],
          starters: [],
        },
      ],
    });

    const result: any = await computeTruthBoundLeagueDashboard(
      { userId: 'user-1', leagueId: 'league-1' },
      deps,
    );

    expect(result.teams[0].overall_total).toBeNull();
    expect(result.teams[0].evaluation).toMatchObject({
      status: 'insufficient_evidence',
      reason: 'overall_unavailable_no_observed_starters',
    });
  });

  it('recomputes Overall from observed starters and covered bench when evidence is complete', async () => {
    const deps = buildDeps({
      sleeperRosters: [
        {
          roster_id: 7,
          owner_id: 'owner',
          players: ['s1', 's2'],
          starters: ['s1'],
        },
      ],
    });

    const result: any = await computeTruthBoundLeagueDashboard(
      { userId: 'user-1', leagueId: 'league-1' },
      deps,
    );

    expect(result.teams[0].overall_total).toBe(13);
    expect(result.teams[0].bench_contribution).toBe(3);
    expect(result.teams[0].evaluation.status).toBe('available');
  });
});
