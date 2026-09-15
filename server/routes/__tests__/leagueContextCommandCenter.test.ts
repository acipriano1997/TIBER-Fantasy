import express from 'express';
import request from 'supertest';
import { createLeagueSyncRouter } from '../leagueSyncRoutes';

const scoring = {
  pass_yd: 0.04,
  pass_td: 6,
  int: -1,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

describe('GET /api/league-context Command Center league truth', () => {
  test('publishes certified live Sleeper scoring without changing the active selector', async () => {
    const activeLeague = {
      id: 'internal-1',
      leagueName: 'Custom Six Point League',
      platform: 'sleeper',
      season: 2026,
      leagueIdExternal: 'external-1',
      teams: [{ id: 'team-1', externalUserId: 'user-1' }],
    };
    const storage = {
      getUserLeagueContext: jest.fn().mockResolvedValue({ activeLeague, activeTeam: activeLeague.teams[0] }),
      getUserPlatformProfile: jest.fn().mockResolvedValue({ externalUserId: 'user-1' }),
      setUserLeagueContext: jest.fn(),
    } as any;
    const sleeperClient = {
      getLeague: jest.fn().mockResolvedValue({
        league_id: 'external-1',
        name: 'Custom Six Point League',
        season: '2026',
        scoring_settings: scoring,
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN'],
      }),
    } as any;

    const app = express();
    app.use(express.json());
    app.use(createLeagueSyncRouter({
      storage,
      sleeperClient,
      deriveSleeperScoringFormat: jest.fn(),
    } as any));

    const response = await request(app).get('/api/league-context?user_id=test-user');
    expect(response.status).toBe(200);
    expect(response.body.activeLeague.id).toBe('internal-1');
    expect(response.body.commandCenterLeagueContext.status).toBe('ready');
    expect(response.body.commandCenterLeagueContext.scoring.status).toBe('certified');
    expect(response.body.commandCenterLeagueContext.readiness.lineup.ready).toBe(true);
    expect(response.body.commandCenterLeagueContext.readiness.trade.ready).toBe(true);
    expect(sleeperClient.getLeague).toHaveBeenCalledWith('external-1');
  });
});
