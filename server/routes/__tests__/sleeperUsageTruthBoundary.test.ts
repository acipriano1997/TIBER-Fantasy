import express from 'express';
import request from 'supertest';
import {
  SLEEPER_USAGE_UNAVAILABLE_CODE,
  sleeperUsageTruthBoundaryRouter,
} from '../sleeperUsageTruthBoundary';

describe('Sleeper usage truth boundary', () => {
  test('fails closed instead of returning generated position-shaped usage', async () => {
    const app = express();
    app.use(sleeperUsageTruthBoundaryRouter);

    const response = await request(app).get('/api/sleeper/stats/1234');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: SLEEPER_USAGE_UNAVAILABLE_CODE,
      message: 'Verified player usage data is unavailable for this endpoint.',
      data: null,
      provenance: {
        state: 'unavailable',
        syntheticFallbackAllowed: false,
      },
    });
    expect(response.body).not.toEqual(expect.objectContaining({
      snapPct: expect.any(Number),
      routeParticipation: expect.any(Number),
      targetShare: expect.any(Number),
    }));
  });

  test('does not fall through to a later synthetic legacy handler', async () => {
    const app = express();
    const legacyHandler = jest.fn((_req, res) => res.json({ snapPct: 75, metadata: { source: 'fallback' } }));
    app.use(sleeperUsageTruthBoundaryRouter);
    app.get('/api/sleeper/stats/:playerId', legacyHandler);

    const response = await request(app).get('/api/sleeper/stats/player-x');

    expect(response.status).toBe(503);
    expect(response.body.code).toBe(SLEEPER_USAGE_UNAVAILABLE_CODE);
    expect(legacyHandler).not.toHaveBeenCalled();
  });
});
