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
    draftedPlayerNames: [],
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

  test('does not report ready when the clock is safe but the ESPN pick is unreadable', () => {
    store.ingestHeartbeat(heartbeat({ currentPick: null, secondsRemaining: 35 }));
    expect(store.getStatus()).toMatchObject({
      connected: true,
      readyToDraft: false,
      page: { currentPick: null, secondsRemaining: 35 },
    });
  });

  test('binds every explicit request to the exact ESPN tab and current pick and blocks concurrent requests', () => {
    store.ingestHeartbeat(heartbeat({ currentPick: 31 }));
    const action = store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' });
    expect(action.pageInstanceId).toBe('page-1');
    expect(action.pickNumber).toBe(31);
    expect(action.status).toBe('pending');
    expect(() => store.requestPick({ name: 'Player Two', team: 'NYG', position: 'WR' }))
      .toThrow(/already pending/i);
    expect(store.nextAction('other-page')).toBeNull();
    expect(store.nextAction('page-1')?.actionId).toBe(action.actionId);
  });

  test('a second ESPN tab cannot inherit or resolve an action armed by the first tab', () => {
    store.ingestHeartbeat(heartbeat({ pageInstanceId: 'page-1', currentPick: 31 }));
    const action = store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' });

    store.ingestHeartbeat(heartbeat({ pageInstanceId: 'page-2', currentPick: 31 }));
    expect(store.nextAction('page-2')).toBeNull();
    expect(store.nextAction('page-1')?.actionId).toBe(action.actionId);
    expect(() => store.resolveAction({
      pageInstanceId: 'page-2',
      actionId: action.actionId,
      status: 'confirmed',
    })).toThrow(/does not match the draft action/i);

    expect(store.resolveAction({
      pageInstanceId: 'page-1',
      actionId: action.actionId,
      status: 'rejected',
      reason: 'Bound tab rejected safely.',
    })).toMatchObject({ status: 'rejected', pageInstanceId: 'page-1' });
  });

  test('expires a pending action immediately when its bound ESPN tab advances to a new pick', () => {
    store.ingestHeartbeat(heartbeat({ pageInstanceId: 'page-1', currentPick: 31 }));
    const action = store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' });
    expect(action.status).toBe('pending');

    store.ingestHeartbeat(heartbeat({ pageInstanceId: 'page-1', currentPick: 32 }));
    expect(store.getStatus().activeAction).toMatchObject({
      actionId: action.actionId,
      pageInstanceId: 'page-1',
      pickNumber: 31,
      status: 'expired',
    });
    expect(store.nextAction('page-1')).toBeNull();
  });

  test('rejects a player already observed in ESPN draft history', () => {
    store.ingestHeartbeat(heartbeat({
      draftedPlayerNames: ['Player One', 'Already Gone'],
    }));
    expect(store.getStatus().page?.draftedPlayerNames).toEqual(['Player One', 'Already Gone']);
    expect(() => store.requestPick({ name: 'Player One', team: 'DAL', position: 'WR' }))
      .toThrow(/already appears in ESPN draft history/i);
  });

  test('locks an uncertain click until the same ESPN tab has advanced beyond that exact pick', () => {
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

    store.ingestHeartbeat(heartbeat({ pageInstanceId: 'page-2', currentPick: 45 }));
    expect(() => store.clearResolvedAction()).toThrow(/owns the uncertain action/i);

    store.ingestHeartbeat(heartbeat({ pageInstanceId: 'page-1', currentPick: 45 }));
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
