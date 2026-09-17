import type { CCFPosition } from '../outcomes/contract';

export const CCF_KICKOFF_FLEX_PLACEMENT_VERSION = 'ccf-kickoff-flex-placement-v0' as const;

export type CCFKickoffFlexLockState = 'locked' | 'unlocked' | 'unknown';

export interface CCFKickoffFlexSlot {
  slotId: string;
  slotType: string;
  eligiblePositions: readonly CCFPosition[];
  lockedPlayerId: string | null;
}

export interface CCFKickoffFlexPlayer {
  playerId: string;
  position: CCFPosition;
  observedStarterSlotId: string | null;
  lockState: CCFKickoffFlexLockState;
  lockAt: string | null;
}

export interface CCFKickoffFlexAssignment {
  slotId: string;
  slotType: string;
  playerId: string;
  position: CCFPosition;
  locked: boolean;
  expectedFpts: number;
}

export type CCFKickoffFlexPlacementReason =
  | 'optimized'
  | 'already_optimal'
  | 'not_needed'
  | 'missing_lock_time'
  | 'invalid_lock_time'
  | 'unknown_lock_state'
  | 'selected_player_missing'
  | 'selected_slot_missing'
  | 'infeasible_selected_starter_geometry';

export interface CCFKickoffFlexPlacementResult<TAssignment extends CCFKickoffFlexAssignment> {
  version: typeof CCF_KICKOFF_FLEX_PLACEMENT_VERSION;
  assignments: TAssignment[];
  applied: boolean;
  reason: CCFKickoffFlexPlacementReason;
  flexibilityPenalty: number | null;
  churnPenalty: number | null;
}

type FlowEdge = {
  to: number;
  rev: number;
  capacity: number;
  cost: number;
  playerIndex?: number;
  slotIndex?: number;
};

const FLEXIBILITY_COST_MULTIPLIER = 1_000;

function validTimestamp(value: string | null | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function addEdge(graph: FlowEdge[][], from: number, edge: Omit<FlowEdge, 'rev'>): void {
  const forward: FlowEdge = { ...edge, rev: graph[edge.to].length };
  const reverse: FlowEdge = {
    to: from,
    rev: graph[from].length,
    capacity: 0,
    cost: -edge.cost,
  };
  graph[from].push(forward);
  graph[edge.to].push(reverse);
}

function slotBreadth(slot: CCFKickoffFlexSlot): number {
  return new Set(slot.eligiblePositions).size;
}

function originalAssignments<TAssignment extends CCFKickoffFlexAssignment>(
  assignments: readonly TAssignment[],
  reason: Exclude<CCFKickoffFlexPlacementReason, 'optimized' | 'already_optimal'>,
): CCFKickoffFlexPlacementResult<TAssignment> {
  return {
    version: CCF_KICKOFF_FLEX_PLACEMENT_VERSION,
    assignments: assignments.map((assignment) => ({ ...assignment } as TAssignment)),
    applied: false,
    reason,
    flexibilityPenalty: null,
    churnPenalty: null,
  };
}

/**
 * Re-slot a fixed selected starter set without changing who starts or any
 * expected-fantasy-points total.
 *
 * Primary player selection remains owned by the complete-lineup expected-points
 * solver. This helper only chooses among legal slot permutations of the already
 * selected unlocked starters.
 *
 * The secondary objective preserves future recourse: earlier-locking players
 * pay a larger penalty for occupying broad slots, while later-locking players
 * are preferentially left in FLEX/SUPERFLEX-style slots. Among equal
 * flexibility structures, the tertiary objective minimizes unnecessary slot
 * churn versus the observed starter placement.
 *
 * Explicit lock state remains authoritative. This helper never infers whether a
 * player is locked by comparing a timestamp with the wall clock; `lockAt` is
 * used only to order future lock windows for players already declared unlocked.
 */
export function optimizeCCFKickoffAwareFlexPlacement<
  TAssignment extends CCFKickoffFlexAssignment,
>(args: {
  slots: readonly CCFKickoffFlexSlot[];
  players: readonly CCFKickoffFlexPlayer[];
  assignments: readonly TAssignment[];
}): CCFKickoffFlexPlacementResult<TAssignment> {
  const unlockedAssignments = args.assignments.filter((assignment) => !assignment.locked);
  if (unlockedAssignments.length <= 1) {
    return originalAssignments(args.assignments, 'not_needed');
  }

  const slotById = new Map(args.slots.map((slot) => [slot.slotId, slot]));
  const playerById = new Map(args.players.map((player) => [player.playerId, player]));
  const originalAssignmentByPlayerId = new Map(
    unlockedAssignments.map((assignment) => [assignment.playerId, assignment]),
  );

  const players: CCFKickoffFlexPlayer[] = [];
  for (const assignment of unlockedAssignments) {
    const player = playerById.get(assignment.playerId);
    if (!player) return originalAssignments(args.assignments, 'selected_player_missing');
    if (player.lockState === 'unknown') return originalAssignments(args.assignments, 'unknown_lock_state');
    if (player.lockState !== 'unlocked') return originalAssignments(args.assignments, 'infeasible_selected_starter_geometry');
    if (player.lockAt === null) return originalAssignments(args.assignments, 'missing_lock_time');
    if (!validTimestamp(player.lockAt)) return originalAssignments(args.assignments, 'invalid_lock_time');
    players.push(player);
  }

  const slots: CCFKickoffFlexSlot[] = [];
  for (const assignment of unlockedAssignments) {
    const slot = slotById.get(assignment.slotId);
    if (!slot) return originalAssignments(args.assignments, 'selected_slot_missing');
    if (slot.lockedPlayerId) return originalAssignments(args.assignments, 'infeasible_selected_starter_geometry');
    slots.push(slot);
  }

  const uniquePlayers = new Set(players.map((player) => player.playerId));
  const uniqueSlots = new Set(slots.map((slot) => slot.slotId));
  if (uniquePlayers.size !== players.length || uniqueSlots.size !== slots.length) {
    return originalAssignments(args.assignments, 'infeasible_selected_starter_geometry');
  }

  players.sort((left, right) => left.playerId.localeCompare(right.playerId));
  slots.sort((left, right) => left.slotId.localeCompare(right.slotId));

  const lockTimes = Array.from(new Set(players.map((player) => Date.parse(player.lockAt!))))
    .sort((left, right) => left - right);
  const lockRank = new Map(lockTimes.map((timestamp, index) => [timestamp, index]));
  const latestRank = Math.max(0, lockTimes.length - 1);

  const playerCount = players.length;
  const slotCount = slots.length;
  const source = 0;
  const playerOffset = 1;
  const slotOffset = playerOffset + playerCount;
  const sink = slotOffset + slotCount;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);

  players.forEach((player, playerIndex) => {
    addEdge(graph, source, {
      to: playerOffset + playerIndex,
      capacity: 1,
      cost: 0,
    });

    const rank = lockRank.get(Date.parse(player.lockAt!));
    if (rank === undefined) return;
    const earlierWindowsRemaining = latestRank - rank;

    slots.forEach((slot, slotIndex) => {
      if (!slot.eligiblePositions.includes(player.position)) return;
      const flexibilityPenalty = earlierWindowsRemaining * Math.max(0, slotBreadth(slot) - 1);
      const churnPenalty = player.observedStarterSlotId === slot.slotId ? 0 : 1;
      addEdge(graph, playerOffset + playerIndex, {
        to: slotOffset + slotIndex,
        capacity: 1,
        cost: flexibilityPenalty * FLEXIBILITY_COST_MULTIPLIER + churnPenalty,
        playerIndex,
        slotIndex,
      });
    });
  });

  slots.forEach((_, slotIndex) => {
    addEdge(graph, slotOffset + slotIndex, {
      to: sink,
      capacity: 1,
      cost: 0,
    });
  });

  let flow = 0;
  while (flow < slotCount) {
    const distance = Array(graph.length).fill(Number.POSITIVE_INFINITY);
    const previousNode = Array(graph.length).fill(-1);
    const previousEdge = Array(graph.length).fill(-1);
    distance[source] = 0;

    for (let iteration = 0; iteration < graph.length - 1; iteration += 1) {
      let changed = false;
      for (let node = 0; node < graph.length; node += 1) {
        if (!Number.isFinite(distance[node])) continue;
        for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
          const edge = graph[node][edgeIndex];
          if (edge.capacity <= 0) continue;
          const nextDistance = distance[node] + edge.cost;
          if (nextDistance < distance[edge.to]) {
            distance[edge.to] = nextDistance;
            previousNode[edge.to] = node;
            previousEdge[edge.to] = edgeIndex;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (!Number.isFinite(distance[sink])) break;

    let node = sink;
    while (node !== source) {
      const from = previousNode[node];
      const edgeIndex = previousEdge[node];
      const edge = graph[from][edgeIndex];
      edge.capacity -= 1;
      graph[node][edge.rev].capacity += 1;
      node = from;
    }
    flow += 1;
  }

  if (flow !== slotCount) {
    return originalAssignments(args.assignments, 'infeasible_selected_starter_geometry');
  }

  const optimizedUnlocked: TAssignment[] = [];
  let totalFlexibilityPenalty = 0;
  let totalChurnPenalty = 0;

  players.forEach((player, playerIndex) => {
    const node = playerOffset + playerIndex;
    const chosenEdge = graph[node].find((edge) =>
      edge.playerIndex === playerIndex && edge.slotIndex !== undefined && edge.capacity === 0,
    );
    if (!chosenEdge || chosenEdge.slotIndex === undefined) return;

    const slot = slots[chosenEdge.slotIndex];
    const original = originalAssignmentByPlayerId.get(player.playerId)!;
    const rank = lockRank.get(Date.parse(player.lockAt!))!;
    const earlierWindowsRemaining = latestRank - rank;
    totalFlexibilityPenalty += earlierWindowsRemaining * Math.max(0, slotBreadth(slot) - 1);
    totalChurnPenalty += player.observedStarterSlotId === slot.slotId ? 0 : 1;

    optimizedUnlocked.push({
      ...original,
      slotId: slot.slotId,
      slotType: slot.slotType,
    } as TAssignment);
  });

  if (optimizedUnlocked.length !== unlockedAssignments.length) {
    return originalAssignments(args.assignments, 'infeasible_selected_starter_geometry');
  }

  const optimizedByPlayerId = new Map(
    optimizedUnlocked.map((assignment) => [assignment.playerId, assignment]),
  );
  const assignments = args.assignments.map((assignment) =>
    assignment.locked
      ? ({ ...assignment } as TAssignment)
      : ({ ...optimizedByPlayerId.get(assignment.playerId)! } as TAssignment),
  );

  const applied = assignments.some((assignment, index) =>
    assignment.slotId !== args.assignments[index].slotId,
  );

  return {
    version: CCF_KICKOFF_FLEX_PLACEMENT_VERSION,
    assignments,
    applied,
    reason: applied ? 'optimized' : 'already_optimal',
    flexibilityPenalty: totalFlexibilityPenalty,
    churnPenalty: totalChurnPenalty,
  };
}
