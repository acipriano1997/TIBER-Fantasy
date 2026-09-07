jest.mock('../../infra/db', () => ({ db: {} }));
jest.mock('../../storage', () => ({
  storage: {
    getLeagueWithTeams: jest.fn(),
    getLeaguesWithTeams: jest.fn(),
    getUserPlatformProfile: jest.fn(),
    setUserLeagueContext: jest.fn(),
    getUserLeagueContext: jest.fn(),
  },
}));

import express from 'express';
import { AddressInfo } from 'net';
import { createLeagueDashboardRouter } from '../leagueDashboardRoutes';
import { computeTruthBoundLeagueDashboard } from '../../services/managementTruthService';

jest.mock('../../services/managementTruthService', () => ({
  computeTruthBoundLeagueDashboard: jest.fn(),
  ManagementTruthBindingError: class ManagementTruthBindingError extends Error {
    code: string;
    statusCode = 409;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'ManagementTruthBindingError';
      this.code = code;
    }
  },
}));

describe('league dashboard routes', () => {
  function buildApp() {
    const app = express();
    app.use(createLeagueDashboardRouter());
    return app;
  }

  async function call(app: express.Express, path: string) {
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    const json = await response.json();
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    return { status: response.status, body: json };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (computeTruthBoundLeagueDashboard as jest.Mock).mockResolvedValue({
      success: true,
      meta: {
        league_id: 'l1',
        week: null,
        season: 2024,
        computed_at: new Date().toISOString(),
        cached: false,
        management_truth_version: 'management_truth_v1',
        roster_binding: 'external_roster_id',
      },
      unresolvedPlayers: [],
      teams: [
        {
          team_id: 't1',
          display_name: 'Team One',
          totals: { QB: 10, RB: 20, WR: 30, TE: 5 },
          overall_total: 65,
          starters_used: [],
          roster: [],
        },
      ],
    });
  });

  it('requires an explicit user id instead of silently using default_user', async () => {
    const app = buildApp();
    const res = await call(app, '/api/league-dashboard?league_id=l1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('user_id is required');
    expect(computeTruthBoundLeagueDashboard).not.toHaveBeenCalled();
  });

  it('returns truth-bound dashboard payload', async () => {
    const app = buildApp();
    const res = await call(app, '/api/league-dashboard?user_id=default_user&league_id=l1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.teams[0].overall_total).toBe(65);
    expect(res.body.meta.management_truth_version).toBe('management_truth_v1');
    expect(res.body.requestId).toBeDefined();
  });

  it('forces refresh when query flag passed', async () => {
    const app = buildApp();
    await call(app, '/api/league-dashboard?user_id=default_user&league_id=l1&refresh=1');

    expect(computeTruthBoundLeagueDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: true, leagueId: 'l1', userId: 'default_user', week: null, season: null }),
      undefined,
      expect.anything(),
    );
  });
});