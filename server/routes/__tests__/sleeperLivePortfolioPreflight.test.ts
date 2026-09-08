import express from 'express';
import { AddressInfo } from 'net';

const mockGetUser = jest.fn();
const mockGetUserLeagues = jest.fn();

jest.mock('../../services/sleeperSyncV2', () => ({
  syncLeague: jest.fn(),
  getSyncStatus: jest.fn(),
  getUnresolvedPlayerCount: jest.fn(),
  getStoredLeagues: jest.fn().mockResolvedValue([]),
  getSchedulerStatus: jest.fn().mockReturnValue({}),
}));

jest.mock('../../infra/db', () => ({
  db: {
    select: jest.fn(),
    execute: jest.fn(),
  },
}));

jest.mock('../../integrations/sleeperClient', () => {
  class MockSleeperApiError extends Error {
    status: number;
    path: string;
    responseText: string;

    constructor(status: number, path: string, responseText: string) {
      super(`Sleeper API error ${status}: ${responseText}`);
      this.name = 'SleeperApiError';
      this.status = status;
      this.path = path;
      this.responseText = responseText;
    }
  }

  return {
    SleeperApiError: MockSleeperApiError,
    sleeperClient: {
      getUser: mockGetUser,
      getUserLeagues: mockGetUserLeagues,
    },
  };
});

import { SleeperApiError } from '../../integrations/sleeperClient';
import { leaguesRouter } from '../sleeperSyncV2Routes';

async function call(app: express.Express, path: string) {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: response.status, body: await response.json() as any };
  } finally {
    server.close();
  }
}

describe('Sleeper live portfolio production preflight', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockGetUserLeagues.mockReset();
  });

  it('resolves username to immutable user ID and preserves every live league scoring contract', async () => {
    mockGetUser.mockResolvedValue({
      user_id: 'user-123',
      username: 'Cippy97',
      display_name: 'Cippy97',
    });
    mockGetUserLeagues.mockResolvedValue([
      {
        league_id: 'league-1',
        name: 'League One',
        season: '2026',
        status: 'in_season',
        total_rosters: 12,
        roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN'],
        scoring_settings: { pass_td: 6, rec: 1, rush_yd: 0.1 },
        settings: { leg: 1 },
        draft_id: 'draft-1',
        previous_league_id: null,
      },
      {
        league_id: 'league-2',
        name: 'League Two',
        season: '2026',
        scoring_settings: { pass_td: 4, rec: 0.5 },
        roster_positions: ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX', 'BN'],
        settings: { leg: 1 },
      },
    ]);

    const app = express();
    app.use('/api/sleeper', leaguesRouter);

    const res = await call(app, '/api/sleeper/leagues/live?username=Cippy97&season=2026');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe('user-123');
    expect(res.body.data.season).toBe(2026);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.leagues[0].leagueId).toBe('league-1');
    expect(res.body.data.leagues[0].scoringSettings).toEqual({ pass_td: 6, rec: 1, rush_yd: 0.1 });
    expect(res.body.data.leagues[0].rosterPositions).toContain('FLEX');
    expect(res.body.data.provenance).toMatchObject({
      source: 'sleeper',
      mode: 'live',
      complete: true,
      syntheticFallbackAllowed: false,
    });
    expect(mockGetUser).toHaveBeenCalledWith('Cippy97');
    expect(mockGetUserLeagues).toHaveBeenCalledWith('user-123', '2026');
  });

  it('returns a typed 404 for an unknown Sleeper username', async () => {
    mockGetUser.mockRejectedValue(new SleeperApiError(404, '/user/missing', 'Not Found'));

    const app = express();
    app.use('/api/sleeper', leaguesRouter);

    const res = await call(app, '/api/sleeper/leagues/live?username=missing&season=2026');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('USER_NOT_FOUND');
    expect(mockGetUserLeagues).not.toHaveBeenCalled();
  });

  it('fails closed with 502 when live league discovery is unavailable', async () => {
    mockGetUser.mockResolvedValue({
      user_id: 'user-123',
      username: 'Cippy97',
      display_name: 'Cippy97',
    });
    mockGetUserLeagues.mockRejectedValue(new SleeperApiError(503, '/user/user-123/leagues/nfl/2026', 'Unavailable'));

    const app = express();
    app.use('/api/sleeper', leaguesRouter);

    const res = await call(app, '/api/sleeper/leagues/live?username=Cippy97&season=2026');

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('SLEEPER_UPSTREAM_ERROR');
    expect(res.body.data.stage).toBe('leagues');
    expect(JSON.stringify(res.body)).not.toContain('stored');
    expect(JSON.stringify(res.body)).not.toContain('synthetic league');
  });

  it('rejects malformed live-portfolio queries before any upstream request', async () => {
    const app = express();
    app.use('/api/sleeper', leaguesRouter);

    const res = await call(app, '/api/sleeper/leagues/live?username=%20&season=bad');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_PORTFOLIO_QUERY');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetUserLeagues).not.toHaveBeenCalled();
  });
});
