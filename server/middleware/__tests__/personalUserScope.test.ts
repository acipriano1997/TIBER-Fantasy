import express from 'express';
import request from 'supertest';
import { createPersonalUserScopeMiddleware, PERSONAL_USER_COOKIE } from '../personalUserScope';

function buildApp(
  ids: string[] = ['personal_test_1', 'personal_test_2'],
  userScopedPathPrefixes?: readonly string[],
) {
  const app = express();
  app.use(express.json());
  let index = 0;
  app.use(createPersonalUserScopeMiddleware({
    idFactory: () => ids[index++] ?? 'personal_fallback',
    userScopedPathPrefixes,
  }));
  app.all('/echo', (req, res) => {
    res.json({
      query: req.query,
      body: req.body,
      scopedUserId: (req as any).tiberUserId,
    });
  });
  return app;
}

describe('personal user scope middleware', () => {
  it('replaces legacy default_user query state with a browser-scoped id', async () => {
    const app = buildApp();
    const response = await request(app).get('/echo?user_id=default_user');

    expect(response.status).toBe(200);
    expect(response.body.query.user_id).toBe('personal_test_1');
    expect(response.body.scopedUserId).toBe('personal_test_1');
    expect(response.headers['set-cookie']?.[0]).toContain(`${PERSONAL_USER_COOKIE}=personal_test_1`);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
  });

  it('keeps the same isolated id on later requests from the same browser', async () => {
    const app = buildApp();
    const agent = request.agent(app);

    const first = await agent.get('/echo?user_id=default_user');
    const second = await agent.post('/echo').send({ user_id: 'default_user' });

    expect(first.body.scopedUserId).toBe('personal_test_1');
    expect(second.body.body.user_id).toBe('personal_test_1');
    expect(second.body.scopedUserId).toBe('personal_test_1');
  });

  it('preserves an explicit non-legacy user id and aligns the cookie to it', async () => {
    const app = buildApp();
    const response = await request(app).get('/echo?user_id=operator_123');

    expect(response.body.query.user_id).toBe('operator_123');
    expect(response.body.scopedUserId).toBe('operator_123');
    expect(response.headers['set-cookie']?.[0]).toContain(`${PERSONAL_USER_COOKIE}=operator_123`);
  });

  it('does not inject user_id into unrelated request bodies', async () => {
    const app = buildApp();
    const response = await request(app).post('/echo').send({ foo: 'bar' });

    expect(response.status).toBe(200);
    expect(response.body.body).toEqual({ foo: 'bar' });
    expect(response.body.scopedUserId).toBe('personal_test_1');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('injects a scoped user id when a known user-scoped API omits it', async () => {
    const app = buildApp(['personal_scoped'], ['/echo']);
    const response = await request(app).post('/echo').send({ league_id: 'league-1' });

    expect(response.status).toBe(200);
    expect(response.body.body).toEqual({ league_id: 'league-1', user_id: 'personal_scoped' });
    expect(response.body.scopedUserId).toBe('personal_scoped');
    expect(response.headers['set-cookie']?.[0]).toContain(`${PERSONAL_USER_COOKIE}=personal_scoped`);
  });
});
