process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://example.com/testdb';

jest.mock('../../infra/db', () => ({ db: {} }));
jest.mock('../../storage', () => ({ storage: {} }));

import express from 'express';
import request from 'supertest';
import { createManagementRouter } from '../managementRoutes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(createManagementRouter({
    storage: {} as any,
    computeLeagueDashboard: jest.fn() as any,
    classifyTeamDirection: jest.fn() as any,
  }));
  return app;
}

const healthyHeartbeat = {
  pageInstanceId: 'route-test-page',
  leagueId: '12345',
  teamId: '7',
  visible: true,
  onClock: true,
  autopickEnabled: false,
  draftPaused: false,
  currentPick: 19,
  secondsRemaining: 35,
  rosterCount: 2,
  enabledDraftButtons: 12,
  availablePlayerCount: 120,
  draftedPlayerNames: [],
  urlPath: '/football/draft?leagueId=12345&teamId=7',
};

describe('ESPN draft bridge localhost execution boundary', () => {
  test('rejects a non-local Host even when the request reaches the app over loopback', async () => {
    const res = await request(buildApp())
      .get('/api/management/espn-draft-bridge/status')
      .set('Host', 'example.com');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringMatching(/local-only/i),
    });
  });

  test('admits the local extension heartbeat and marks the response non-cacheable', async () => {
    const res = await request(buildApp())
      .post('/api/management/espn-draft-bridge/heartbeat')
      .set('Host', 'localhost:5000')
      .send(healthyHeartbeat);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      success: true,
      schemaVersion: 'espn_draft_bridge_v1',
      connected: true,
      readyToDraft: true,
      credentialsRetained: false,
      page: {
        leagueId: '12345',
        teamId: '7',
        currentPick: 19,
        secondsRemaining: 35,
      },
    });
  });
});
