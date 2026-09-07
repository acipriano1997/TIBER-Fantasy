import express from 'express';
import request from 'supertest';
import { createPersonalUserScopeMiddleware, PERSONAL_USER_COOKIE } from '../personalUserScope';

function buildApp(ids: string[] = ['personal_test_1', 'personal_test_2']) {
  const app = express();
  app.use(express.json());
  let index = 0;
  app.use(createPersonalUserScopeMiddleware({ idFactory: () => ids[index++] ?? 'personal_fallback' }));
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
});
