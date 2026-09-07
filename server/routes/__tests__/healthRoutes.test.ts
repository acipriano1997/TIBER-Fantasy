import express from 'express';
import request from 'supertest';
import {
  checkDatabaseReadiness,
  createHealthRouter,
  type DatabaseReadiness,
} from '../healthRoutes';

function appWith(checkDatabaseReadiness: () => Promise<DatabaseReadiness>) {
  const app = express();
  app.use(createHealthRouter({ checkDatabaseReadiness, serviceName: 'TiberClaw' }));
  return app;
}

describe('health routes', () => {
  test('legacy /health and canonical /api/health are dependency-free liveness probes', async () => {
    const dbCheck = jest.fn<Promise<DatabaseReadiness>, []>().mockRejectedValue(
      new Error('must not be called by liveness'),
    );
    const app = appWith(dbCheck);

    const legacy = await request(app).get('/health');
    const api = await request(app).get('/api/health');

    expect(legacy.status).toBe(200);
    expect(api.status).toBe(200);
    expect(legacy.body).toEqual({ ok: true, status: 'live', service: 'TiberClaw' });
    expect(api.body).toEqual({ ok: true, status: 'live', service: 'TiberClaw' });
    expect(dbCheck).not.toHaveBeenCalled();
  });

  test('returns 200 only when database readiness is proven', async () => {
    const app = appWith(async () => ({ ready: true, code: 'database_ready' }));
    const response = await request(app).get('/api/health/db');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      status: 'ready',
      service: 'TiberClaw',
      database: { ready: true, code: 'database_ready' },
    });
  });

  test.each([
    'database_url_missing' as const,
    'database_unavailable' as const,
  ])('returns a typed 503 without provider error text for %s', async (code) => {
    const app = appWith(async () => ({ ready: false, code }));
    const response = await request(app).get('/api/health/db');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      status: 'unavailable',
      service: 'TiberClaw',
      database: { ready: false, code },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/neon|postgres|password|endpoint has been disabled/i);
  });

  test('reports a missing DATABASE_URL without importing database infrastructure', async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(checkDatabaseReadiness()).resolves.toEqual({
        ready: false,
        code: 'database_url_missing',
      });
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
