import type { CCFLineupRosterPlayer } from '../lineupDecision';
import {
  createCCFFrozenRosterStateSnapshot,
  verifyCCFFrozenRosterStateSnapshot,
} from '../rosterStateSnapshot';

const AS_OF = '2026-09-16T12:00:00.000Z';

function player(
  playerId: string,
  overrides: Partial<CCFLineupRosterPlayer> = {},
): CCFLineupRosterPlayer {
  return {
    playerId,
    position: 'WR',
    identityStatus: 'canonical',
    availability: 'eligible',
    byeWeek: null,
    byeWeekKnown: true,
    observedStarterSlotId: null,
    lockState: 'unlocked',
    lockAt: null,
    ...overrides,
  };
}

function snapshot(players: readonly CCFLineupRosterPlayer[]) {
  return createCCFFrozenRosterStateSnapshot({
    leagueRef: 'league-1',
    teamRef: 'team-1',
    season: 2026,
    week: 2,
    asOf: AS_OF,
    rosterSlotsFingerprint: 'slots-fingerprint',
    producer: {
      producerId: 'sleeper-roster-legality-adapter',
      producerVersion: 'v0',
      sourcePlanFingerprint: 'source-plan-fingerprint',
      sourceSnapshotRef: 'raw:league-1:team-1:week-2',
    },
    players,
  });
}

describe('CCF frozen roster-state snapshot', () => {
  it('canonicalizes presentation order out of the fingerprint', () => {
    const first = snapshot([player('wr-a'), player('wr-b', { availability: 'ineligible' })]);
    const reordered = snapshot([player('wr-b', { availability: 'ineligible' }), player('wr-a')]);
    expect(first.fingerprint).toBe(reordered.fingerprint);
  });

  it('changes the fingerprint when any recommendation-relevant legality state changes', () => {
    const first = snapshot([player('wr-a')]);
    const changed = snapshot([player('wr-a', { lockState: 'locked', lockAt: AS_OF })]);
    expect(first.fingerprint).not.toBe(changed.fingerprint);
  });

  it('replays deterministically for identical frozen contents', () => {
    const first = snapshot([player('wr-a'), player('wr-b')]);
    const replay = snapshot([player('wr-a'), player('wr-b')]);
    expect(replay).toEqual(first);
    expect(verifyCCFFrozenRosterStateSnapshot(replay)).toBe(true);
  });

  it('detects a roster mutation that was not accompanied by a new fingerprint', () => {
    const frozen = snapshot([player('wr-a')]);
    frozen.players[0].availability = 'unknown';
    expect(verifyCCFFrozenRosterStateSnapshot(frozen)).toBe(false);
  });
});
