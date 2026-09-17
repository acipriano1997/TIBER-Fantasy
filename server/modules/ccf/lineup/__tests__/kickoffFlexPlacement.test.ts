import {
  CCF_KICKOFF_FLEX_PLACEMENT_VERSION,
  optimizeCCFKickoffAwareFlexPlacement,
  type CCFKickoffFlexAssignment,
  type CCFKickoffFlexPlayer,
  type CCFKickoffFlexSlot,
} from '../kickoffFlexPlacement';

const THURSDAY = '2026-09-17T20:15:00.000Z';
const SUNDAY_EARLY = '2026-09-20T13:00:00.000Z';
const SUNDAY_LATE = '2026-09-20T16:25:00.000Z';
const SUNDAY_NIGHT = '2026-09-20T20:20:00.000Z';
const MONDAY = '2026-09-21T20:15:00.000Z';

function slot(
  slotId: string,
  slotType: string,
  eligiblePositions: CCFKickoffFlexSlot['eligiblePositions'],
  lockedPlayerId: string | null = null,
): CCFKickoffFlexSlot {
  return { slotId, slotType, eligiblePositions, lockedPlayerId };
}

function player(
  playerId: string,
  position: CCFKickoffFlexPlayer['position'],
  lockAt: string | null,
  observedStarterSlotId: string | null,
  lockState: CCFKickoffFlexPlayer['lockState'] = 'unlocked',
): CCFKickoffFlexPlayer {
  return {
    playerId,
    position,
    observedStarterSlotId,
    lockState,
    lockAt,
  };
}

function assignment(
  slotId: string,
  slotType: string,
  playerId: string,
  position: CCFKickoffFlexAssignment['position'],
  expectedFpts: number,
  locked = false,
): CCFKickoffFlexAssignment {
  return { slotId, slotType, playerId, position, expectedFpts, locked };
}

function bySlot(assignments: readonly CCFKickoffFlexAssignment[]): Map<string, string> {
  return new Map(assignments.map((item) => [item.slotId, item.playerId]));
}

function starterSet(assignments: readonly CCFKickoffFlexAssignment[]): Set<string> {
  return new Set(assignments.map((item) => item.playerId));
}

describe('CCF kickoff-aware flex placement', () => {
  it('moves a Thursday WR out of FLEX and preserves FLEX for the later WR', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
    ];
    const players = [
      player('wr-thu', 'WR', THURSDAY, 'FLEX:1'),
      player('wr-sun', 'WR', SUNDAY_EARLY, 'WR:1'),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-sun', 'WR', 15),
      assignment('FLEX:1', 'FLEX', 'wr-thu', 'WR', 18),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(result.version).toBe(CCF_KICKOFF_FLEX_PLACEMENT_VERSION);
    expect(result.reason).toBe('optimized');
    expect(result.applied).toBe(true);
    expect(bySlot(result.assignments).get('WR:1')).toBe('wr-thu');
    expect(bySlot(result.assignments).get('FLEX:1')).toBe('wr-sun');
    expect(starterSet(result.assignments)).toEqual(starterSet(assignments));
    expect(result.assignments.reduce((sum, item) => sum + item.expectedFpts, 0)).toBe(33);
  });

  it('generalizes from TNF to Sunday early versus Sunday late', () => {
    const slots = [
      slot('RB:1', 'RB', ['RB']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
    ];
    const players = [
      player('rb-early', 'RB', SUNDAY_EARLY, 'FLEX:1'),
      player('rb-late', 'RB', SUNDAY_LATE, 'RB:1'),
    ];
    const assignments = [
      assignment('RB:1', 'RB', 'rb-late', 'RB', 14),
      assignment('FLEX:1', 'FLEX', 'rb-early', 'RB', 17),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(bySlot(result.assignments).get('RB:1')).toBe('rb-early');
    expect(bySlot(result.assignments).get('FLEX:1')).toBe('rb-late');
    expect(result.flexibilityPenalty).toBe(0);
  });

  it('places the earlier QB in QB and preserves SUPERFLEX for the Monday QB', () => {
    const slots = [
      slot('QB:1', 'QB', ['QB']),
      slot('SF:1', 'SUPERFLEX', ['QB', 'RB', 'WR', 'TE']),
    ];
    const players = [
      player('qb-early', 'QB', SUNDAY_EARLY, 'SF:1'),
      player('qb-mon', 'QB', MONDAY, 'QB:1'),
    ];
    const assignments = [
      assignment('QB:1', 'QB', 'qb-mon', 'QB', 22),
      assignment('SF:1', 'SUPERFLEX', 'qb-early', 'QB', 24),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(bySlot(result.assignments).get('QB:1')).toBe('qb-early');
    expect(bySlot(result.assignments).get('SF:1')).toBe('qb-mon');
  });

  it('does not invent a kickoff preference inside the same lock window and minimizes churn', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
    ];
    const players = [
      player('wr-a', 'WR', SUNDAY_EARLY, 'WR:1'),
      player('wr-b', 'WR', SUNDAY_EARLY, 'FLEX:1'),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-a', 'WR', 16),
      assignment('FLEX:1', 'FLEX', 'wr-b', 'WR', 15),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(result.reason).toBe('already_optimal');
    expect(result.applied).toBe(false);
    expect(result.assignments).toEqual(assignments);
    expect(result.flexibilityPenalty).toBe(0);
    expect(result.churnPenalty).toBe(0);
  });

  it('never moves an already-locked FLEX starter', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE'], 'wr-locked'),
    ];
    const players = [
      player('wr-locked', 'WR', THURSDAY, 'FLEX:1', 'locked'),
      player('wr-late', 'WR', SUNDAY_LATE, 'WR:1'),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-late', 'WR', 14),
      assignment('FLEX:1', 'FLEX', 'wr-locked', 'WR', 18, true),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(result.reason).toBe('not_needed');
    expect(bySlot(result.assignments).get('FLEX:1')).toBe('wr-locked');
  });

  it('keeps an early player in FLEX when no legal narrow-slot swap exists', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
    ];
    const players = [
      player('te-thu', 'TE', THURSDAY, 'FLEX:1'),
      player('wr-sun', 'WR', SUNDAY_EARLY, 'WR:1'),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-sun', 'WR', 15),
      assignment('FLEX:1', 'FLEX', 'te-thu', 'TE', 13),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(result.reason).toBe('already_optimal');
    expect(bySlot(result.assignments).get('FLEX:1')).toBe('te-thu');
    expect(starterSet(result.assignments)).toEqual(starterSet(assignments));
  });

  it('never changes the selected starter set or expected points', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
      slot('SF:1', 'SUPERFLEX', ['QB', 'RB', 'WR', 'TE']),
    ];
    const players = [
      player('wr-thu', 'WR', THURSDAY, 'FLEX:1'),
      player('wr-snf', 'WR', SUNDAY_NIGHT, 'WR:1'),
      player('qb-mon', 'QB', MONDAY, 'SF:1'),
      player('bench-rb', 'RB', SUNDAY_LATE, null),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-snf', 'WR', 14),
      assignment('FLEX:1', 'FLEX', 'wr-thu', 'WR', 20),
      assignment('SF:1', 'SUPERFLEX', 'qb-mon', 'QB', 25),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(starterSet(result.assignments)).toEqual(starterSet(assignments));
    expect(result.assignments.some((item) => item.playerId === 'bench-rb')).toBe(false);
    expect(result.assignments.reduce((sum, item) => sum + item.expectedFpts, 0)).toBe(59);
    expect(bySlot(result.assignments).get('WR:1')).toBe('wr-thu');
  });

  it('degrades without inventing an ordering when a selected unlocked player lacks lock timing', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
    ];
    const players = [
      player('wr-unknown-time', 'WR', null, 'FLEX:1'),
      player('wr-late', 'WR', SUNDAY_LATE, 'WR:1'),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-late', 'WR', 15),
      assignment('FLEX:1', 'FLEX', 'wr-unknown-time', 'WR', 16),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('missing_lock_time');
    expect(result.flexibilityPenalty).toBeNull();
    expect(result.assignments).toEqual(assignments);
  });

  it('respects nonstandard league slot eligibility rather than hard-coding FLEX names', () => {
    const slots = [
      slot('WR_TE:1', 'WR_TE', ['WR', 'TE']),
      slot('FLEX_ANY:1', 'FLEX_ANY', ['RB', 'WR', 'TE']),
    ];
    const players = [
      player('wr-early', 'WR', THURSDAY, 'FLEX_ANY:1'),
      player('te-late', 'TE', MONDAY, 'WR_TE:1'),
    ];
    const assignments = [
      assignment('WR_TE:1', 'WR_TE', 'te-late', 'TE', 13),
      assignment('FLEX_ANY:1', 'FLEX_ANY', 'wr-early', 'WR', 17),
    ];

    const result = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(bySlot(result.assignments).get('WR_TE:1')).toBe('wr-early');
    expect(bySlot(result.assignments).get('FLEX_ANY:1')).toBe('te-late');
  });

  it('is deterministic for the same frozen slot/player/assignment packet', () => {
    const slots = [
      slot('WR:1', 'WR', ['WR']),
      slot('FLEX:1', 'FLEX', ['RB', 'WR', 'TE']),
      slot('SF:1', 'SUPERFLEX', ['QB', 'RB', 'WR', 'TE']),
    ];
    const players = [
      player('wr-thu', 'WR', THURSDAY, 'FLEX:1'),
      player('wr-late', 'WR', SUNDAY_LATE, 'WR:1'),
      player('qb-mon', 'QB', MONDAY, 'SF:1'),
    ];
    const assignments = [
      assignment('WR:1', 'WR', 'wr-late', 'WR', 14),
      assignment('FLEX:1', 'FLEX', 'wr-thu', 'WR', 18),
      assignment('SF:1', 'SUPERFLEX', 'qb-mon', 'QB', 25),
    ];

    const first = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });
    const second = optimizeCCFKickoffAwareFlexPlacement({ slots, players, assignments });

    expect(second).toEqual(first);
  });
});
