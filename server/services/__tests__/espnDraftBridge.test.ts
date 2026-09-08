import { ESPN_DRAFT_MIN_SECONDS, EspnDraftBridgeStore } from '../espnDraftBridge';

function heartbeat(overrides: Record<string, unknown> = {}) {
  return {
    pageInstanceId: 'page-1',
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
    urlPath: '/football/draft?leagueId=12345&teamId=7',
    ...overrides,
  };
}

describe('ESPN draft bridge fail-closed state machine', () => {
  let now: number;
  let store: EspnDraftBridgeStore;

  beforeEach(() => {
    now = Date.parse('2026-09-08T23:30:00.000Z');
    store = new EspnDraftBridgeStore(() => now);
  });

  test('requires a fresh on-clock heartbeat and the clock safety floor', () => {
    store.ingestHeartbeat(heartbeat());
    expect(store.getStatus()).toMatchObject({
      connected: true,
      readyToDraft: true,
      minimumDraftSeconds: ESPN_DRAFT_MIN_SECONDS,
      credentialsRetained: false,
    });

    store.ingestHeartbeat(heartbeat({ secondsRemaining: ESPN_DRAFT_MIN_SECONDS - 1 }));
    expect(store.getStatus().readyToDraft).toBe(false);
    expect(() => store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' }))
      .toThrow(/Fewer than 8 readable seconds remain/);
  });

  test('does not coerce missing ESPN clock or pick state into a valid zero', () => {
    store.ingestHeartbeat(heartbeat({ currentPick: null, secondsRemaining: null }));
    const status = store.getStatus();
    expect(status.page?.currentPick).toBeNull();
    expect(status.page?.secondsRemaining).toBeNull();
    expect(status.readyToDraft).toBe(false);
    expect(() => store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' }))
      .toThrow(/current pick could not be verified/i);
  });

  test('binds every explicit request to the current ESPN pick and blocks concurrent requests', () => {
    store.ingestHeartbeat(heartbeat({ currentPick: 31 }));
    const action = store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' });
    expect(action.pickNumber).toBe(31);
    expect(action.status).toBe('pending');
    expect(() => store.requestPick({ name: 'Player Two', team: 'NYG', position: 'WR' }))
      .toThrow(/already pending/i);
    expect(store.nextAction('other-page')).toBeNull();
    expect(store.nextAction('page-1')?.actionId).toBe(action.actionId);
  });

  test('locks an uncertain click until ESPN has advanced beyond that exact pick', () => {
    store.ingestHeartbeat(heartbeat({ currentPick: 44 }));
    const action = store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' });
    store.resolveAction({
      pageInstanceId: 'page-1',
      actionId: action.actionId,
      status: 'uncertain',
      reason: 'Native Draft click occurred but confirmation was not observed.',
      espnPlayerId: '123',
    });

    expect(() => store.requestPick({ name: 'Player Two', team: 'NYG', position: 'WR' }))
      .toThrow(/uncertain/i);
    expect(() => store.clearResolvedAction()).toThrow(/still on the uncertain pick/i);

    store.ingestHeartbeat(heartbeat({ currentPick: 45 }));
    expect(() => store.clearResolvedAction()).not.toThrow();
    expect(store.getStatus().activeAction).toBeNull();
  });

  test('stale heartbeats fail closed and no ESPN credential fields enter status/action state', () => {
    store.ingestHeartbeat(heartbeat());
    const action = store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' });
    const serialized = JSON.stringify({ status: store.getStatus(), action });
    expect(serialized).not.toMatch(/espn_s2|SWID|password|cookie/i);

    now += 2_501;
    expect(store.getStatus().connected).toBe(false);
    expect(store.getStatus().readyToDraft).toBe(false);
    expect(() => store.requestPick({ name: 'Player Two', team: 'NYG', position: 'WR' }))
      .toThrow(/not connected/i);
  });
});
