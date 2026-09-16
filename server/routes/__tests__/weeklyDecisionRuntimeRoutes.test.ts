jest.mock('../../storage', () => ({ storage: {} }));

import express from 'express';
import request from 'supertest';
import { createWeeklyDecisionRuntimeRouter } from '../weeklyDecisionRuntimeRoutes';

describe('POST /api/command-center/weekly/compare', () => {
  test('binds the request to the active league/team context', async () => {
    const activeLeague = {
      id: 'league-internal',
      leagueName: 'Runtime League',
      platform: 'sleeper',
      leagueIdExternal: 'league-1',
      season: 2026,
    };
    const activeTeam = { id: 'team-1', externalRosterId: '7' };
    const storage = {
      getUserLeagueContext: jest.fn().mockResolvedValue({ activeLeague, activeTeam }),
    } as any;
    const evaluateRuntime = jest.fn().mockResolvedValue({
      schemaVersion: 'command-center-weekly-runtime.v1',
      state: 'blocked',
      blockers: ['CCF calibrated tail unavailable'],
      missingInputs: ['starter:ccf_calibrated_tail'],
      roster: null,
      candidateSnapshot: null,
      decisionContext: null,
      decision: null,
    });

    const app = express();
    app.use(express.json());
    app.use(createWeeklyDecisionRuntimeRouter({ storage, evaluateRuntime } as any));

    const response = await request(app)
      .post('/api/command-center/weekly/compare')
      .send({
        user_id: 'test-user',
        week: 2,
        starter_player_id: 'starter',
        bench_player_id: 'bench',
        operator_posture: 'balanced',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.runtime.state).toBe('blocked');
    expect(storage.getUserLeagueContext).toHaveBeenCalledWith('test-user');
    expect(evaluateRuntime).toHaveBeenCalledWith(expect.objectContaining({
      activeLeague,
      activeTeam,
      week: 2,
      starterPlayerId: 'starter',
      benchPlayerId: 'bench',
      operatorPosture: 'balanced',
    }));
  });

  test('rejects malformed comparison requests before loading league state', async () => {
    const storage = { getUserLeagueContext: jest.fn() } as any;
    const evaluateRuntime = jest.fn();
    const app = express();
    app.use(express.json());
    app.use(createWeeklyDecisionRuntimeRouter({ storage, evaluateRuntime } as any));

    const response = await request(app)
      .post('/api/command-center/weekly/compare')
      .send({ week: 0, starter_player_id: 'a', bench_player_id: 'b' });

    expect(response.status).toBe(400);
    expect(storage.getUserLeagueContext).not.toHaveBeenCalled();
    expect(evaluateRuntime).not.toHaveBeenCalled();
  });
});
