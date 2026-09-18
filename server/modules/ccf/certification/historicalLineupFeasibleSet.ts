import crypto from "crypto";
import type { CCFLineupRosterPlayer, CCFLineupSlot } from "../lineup/lineupDecision";
import {
  verifyCCFFrozenRosterStateSnapshot,
  type CCFFrozenRosterStateSnapshot,
} from "../lineup/rosterStateSnapshot";
import {
  verifyCCFLineupSlotGeometry,
  type CCFLineupSlotGeometryV1,
} from "../lineup/lineupSlotGeometry";

export const CCF_HISTORICAL_LINEUP_FEASIBLE_SET_VERSION =
  "ccf-historical-lineup-feasible-set-v1" as const;
export const CCF_HISTORICAL_LINEUP_FEASIBLE_SET_BUILDER_VERSION =
  "ccf-historical-lineup-feasible-set-builder-v1" as const;

export interface CCFHistoricalLineupAssignmentV1 {
  slotId: string;
  playerId: string;
}

export interface CCFHistoricalFeasibleLineupV1 {
  lineupFingerprint: string;
  assignments: CCFHistoricalLineupAssignmentV1[];
}

export interface CCFHistoricalLineupFeasibleSetV1 {
  contractVersion: typeof CCF_HISTORICAL_LINEUP_FEASIBLE_SET_VERSION;
  builderVersion: typeof CCF_HISTORICAL_LINEUP_FEASIBLE_SET_BUILDER_VERSION;
  leagueRef: string;
  teamRef: string;
  season: number;
  week: number;
  decisionAsOf: string;
  rosterSnapshotFingerprint: string;
  slotGeometryFingerprint: string;
  feasibleLineupCount: number;
  lineups: CCFHistoricalFeasibleLineupV1[];
  feasibleSetFingerprint: string;
  evidenceRefs: string[];
  feasibleSetRef: string;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFHistoricalLineupFeasibleSetInput {
  rosterSnapshot: CCFFrozenRosterStateSnapshot;
  slotGeometry: CCFLineupSlotGeometryV1;
  maximumFeasibleLineups?: number;
}

export class CCFHistoricalLineupFeasibleSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFHistoricalLineupFeasibleSetError";
  }
}

function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFHistoricalLineupFeasibleSetError(
      `${label} must be a valid timestamp`,
    );
  }
  return parsed;
}

function assignmentFingerprint(
  assignments: readonly CCFHistoricalLineupAssignmentV1[],
): string {
  const canonical = [...assignments]
    .map((row) => ({ slotId: row.slotId, playerId: row.playerId }))
    .sort((left, right) => left.slotId.localeCompare(right.slotId));
  return sha256(canonical);
}

function assertKnownRosterState(
  snapshot: CCFFrozenRosterStateSnapshot,
): Map<string, CCFLineupRosterPlayer> {
  const players = new Map<string, CCFLineupRosterPlayer>();
  const asOfMs = timestamp("roster snapshot asOf", snapshot.asOf);

  for (const player of snapshot.players) {
    if (!player.playerId.trim()) {
      throw new CCFHistoricalLineupFeasibleSetError("roster playerId is required");
    }
    if (players.has(player.playerId)) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `duplicate roster player ${player.playerId}`,
      );
    }
    players.set(player.playerId, player);

    if (player.identityStatus === "unresolved") {
      throw new CCFHistoricalLineupFeasibleSetError(
        `player ${player.playerId} has unresolved identity at the historical cutoff`,
      );
    }
    if (player.availability === "unknown") {
      throw new CCFHistoricalLineupFeasibleSetError(
        `player ${player.playerId} has unknown availability at the historical cutoff`,
      );
    }
    if (!player.byeWeekKnown) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `player ${player.playerId} has unknown bye-week state at the historical cutoff`,
      );
    }
    if (player.lockState === "unknown") {
      throw new CCFHistoricalLineupFeasibleSetError(
        `player ${player.playerId} has unknown lock state at the historical cutoff`,
      );
    }
    if (player.lockState === "locked") {
      if (!player.lockAt) {
        throw new CCFHistoricalLineupFeasibleSetError(
          `locked player ${player.playerId} is missing lockAt`,
        );
      }
      const lockAtMs = timestamp(`${player.playerId}.lockAt`, player.lockAt);
      if (lockAtMs > asOfMs) {
        throw new CCFHistoricalLineupFeasibleSetError(
          `locked player ${player.playerId} cannot lock after the historical cutoff`,
        );
      }
    } else if (player.lockAt != null) {
      timestamp(`${player.playerId}.lockAt`, player.lockAt);
    }
  }

  return players;
}

function assertSlotBindings(
  snapshot: CCFFrozenRosterStateSnapshot,
  slots: readonly CCFLineupSlot[],
  players: ReadonlyMap<string, CCFLineupRosterPlayer>,
): void {
  const slotById = new Map(slots.map((slot) => [slot.slotId, slot]));

  for (const slot of slots) {
    if (!slot.lockedPlayerId) continue;
    const player = players.get(slot.lockedPlayerId);
    if (!player) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `locked slot ${slot.slotId} references player outside the frozen roster`,
      );
    }
    if (player.lockState !== "locked") {
      throw new CCFHistoricalLineupFeasibleSetError(
        `slot ${slot.slotId} locked player ${player.playerId} is not locked in the frozen roster`,
      );
    }
    if (player.observedStarterSlotId !== slot.slotId) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `slot ${slot.slotId} locked player ${player.playerId} is not bound to the same observed starter slot`,
      );
    }
    if (!slot.eligiblePositions.includes(player.position)) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `slot ${slot.slotId} locked player ${player.playerId} is position-ineligible`,
      );
    }
    if (
      player.availability !== "eligible" ||
      player.byeWeek === snapshot.week
    ) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `slot ${slot.slotId} locked player ${player.playerId} is not a legal historical starter`,
      );
    }
  }

  for (const player of players.values()) {
    if (player.lockState !== "locked" || !player.observedStarterSlotId) continue;
    const slot = slotById.get(player.observedStarterSlotId);
    if (!slot || slot.lockedPlayerId !== player.playerId) {
      throw new CCFHistoricalLineupFeasibleSetError(
        `locked starter ${player.playerId} is not exactly bound to its frozen slot`,
      );
    }
  }
}

function candidatePlayers(
  snapshot: CCFFrozenRosterStateSnapshot,
  players: ReadonlyMap<string, CCFLineupRosterPlayer>,
  lockedPlayerIds: ReadonlySet<string>,
): CCFLineupRosterPlayer[] {
  return Array.from(players.values())
    .filter((player) => player.availability === "eligible")
    .filter((player) => player.byeWeek !== snapshot.week)
    .filter((player) => {
      if (player.lockState !== "locked") return true;
      return lockedPlayerIds.has(player.playerId);
    })
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function buildFeasibleSetFingerprint(args: {
  rosterSnapshotFingerprint: string;
  slotGeometryFingerprint: string;
  lineupFingerprints: readonly string[];
}): string {
  return sha256({
    contractVersion: CCF_HISTORICAL_LINEUP_FEASIBLE_SET_VERSION,
    builderVersion: CCF_HISTORICAL_LINEUP_FEASIBLE_SET_BUILDER_VERSION,
    rosterSnapshotFingerprint: args.rosterSnapshotFingerprint,
    slotGeometryFingerprint: args.slotGeometryFingerprint,
    lineupFingerprints: [...args.lineupFingerprints].sort(),
    certificationOnly: true,
    productionInferenceAuthorized: false,
  });
}

/**
 * Enumerate the exact full-lineup choice set available at one frozen historical
 * cutoff. This is legality evidence only: it does not consume projections or
 * realized outcomes and cannot choose or score a lineup.
 *
 * Unknown identity, availability, bye, or lock state fails closed because a
 * complete feasible set cannot be claimed while any load-bearing legality fact
 * is unresolved. Locked bench players are not insertable; locked observed
 * starters remain bound to their exact frozen slot.
 */
export function buildCCFHistoricalLineupFeasibleSet(
  input: BuildCCFHistoricalLineupFeasibleSetInput,
): CCFHistoricalLineupFeasibleSetV1 {
  if (!verifyCCFFrozenRosterStateSnapshot(input.rosterSnapshot)) {
    throw new CCFHistoricalLineupFeasibleSetError(
      "historical feasible-set construction requires an intact frozen roster snapshot",
    );
  }
  if (!verifyCCFLineupSlotGeometry(input.slotGeometry)) {
    throw new CCFHistoricalLineupFeasibleSetError(
      "historical feasible-set construction requires an intact frozen slot geometry",
    );
  }
  if (
    input.rosterSnapshot.rosterSlotsFingerprint !==
    input.slotGeometry.fingerprint
  ) {
    throw new CCFHistoricalLineupFeasibleSetError(
      "frozen roster snapshot does not bind the supplied lineup slot geometry",
    );
  }

  const maximum = input.maximumFeasibleLineups ?? 250_000;
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new CCFHistoricalLineupFeasibleSetError(
      "maximumFeasibleLineups must be a positive integer",
    );
  }

  const players = assertKnownRosterState(input.rosterSnapshot);
  const slots = [...input.slotGeometry.slots];
  assertSlotBindings(input.rosterSnapshot, slots, players);

  const lockedAssignments: CCFHistoricalLineupAssignmentV1[] = [];
  const lockedPlayerIds = new Set<string>();
  const unlockedSlots: CCFLineupSlot[] = [];

  for (const slot of slots) {
    if (slot.lockedPlayerId) {
      lockedPlayerIds.add(slot.lockedPlayerId);
      lockedAssignments.push({
        slotId: slot.slotId,
        playerId: slot.lockedPlayerId,
      });
    } else {
      unlockedSlots.push(slot);
    }
  }

  const candidates = candidatePlayers(
    input.rosterSnapshot,
    players,
    lockedPlayerIds,
  ).filter((player) => !lockedPlayerIds.has(player.playerId));

  const orderedSlots = [...unlockedSlots].sort((left, right) => {
    const eligibility =
      left.eligiblePositions.length - right.eligiblePositions.length;
    return eligibility !== 0
      ? eligibility
      : left.slotId.localeCompare(right.slotId);
  });

  const lineups: CCFHistoricalFeasibleLineupV1[] = [];
  const used = new Set<string>();
  const current: CCFHistoricalLineupAssignmentV1[] = [];

  const visit = (slotIndex: number): void => {
    if (slotIndex === orderedSlots.length) {
      const assignments = [...lockedAssignments, ...current].sort((left, right) =>
        left.slotId.localeCompare(right.slotId),
      );
      lineups.push({
        lineupFingerprint: assignmentFingerprint(assignments),
        assignments,
      });
      if (lineups.length > maximum) {
        throw new CCFHistoricalLineupFeasibleSetError(
          `exact feasible-set enumeration exceeded safety limit ${maximum}`,
        );
      }
      return;
    }

    const slot = orderedSlots[slotIndex];
    for (const player of candidates) {
      if (used.has(player.playerId)) continue;
      if (!slot.eligiblePositions.includes(player.position)) continue;
      used.add(player.playerId);
      current.push({ slotId: slot.slotId, playerId: player.playerId });
      visit(slotIndex + 1);
      current.pop();
      used.delete(player.playerId);
    }
  };

  visit(0);
  if (lineups.length === 0) {
    throw new CCFHistoricalLineupFeasibleSetError(
      "frozen roster cannot produce a complete legal lineup",
    );
  }

  lineups.sort((left, right) =>
    left.lineupFingerprint.localeCompare(right.lineupFingerprint),
  );
  const lineupFingerprints = lineups.map((row) => row.lineupFingerprint);
  if (new Set(lineupFingerprints).size !== lineupFingerprints.length) {
    throw new CCFHistoricalLineupFeasibleSetError(
      "feasible-set enumeration produced duplicate lineup fingerprints",
    );
  }

  const feasibleSetFingerprint = buildFeasibleSetFingerprint({
    rosterSnapshotFingerprint: input.rosterSnapshot.fingerprint,
    slotGeometryFingerprint: input.slotGeometry.fingerprint,
    lineupFingerprints,
  });
  const evidenceRefs = [
    input.rosterSnapshot.producer.sourceSnapshotRef,
    `ccf://lineup-slot-geometry/sha256/${input.slotGeometry.fingerprint}`,
  ].sort();

  return {
    contractVersion: CCF_HISTORICAL_LINEUP_FEASIBLE_SET_VERSION,
    builderVersion: CCF_HISTORICAL_LINEUP_FEASIBLE_SET_BUILDER_VERSION,
    leagueRef: input.rosterSnapshot.leagueRef,
    teamRef: input.rosterSnapshot.teamRef,
    season: input.rosterSnapshot.season,
    week: input.rosterSnapshot.week,
    decisionAsOf: input.rosterSnapshot.asOf,
    rosterSnapshotFingerprint: input.rosterSnapshot.fingerprint,
    slotGeometryFingerprint: input.slotGeometry.fingerprint,
    feasibleLineupCount: lineups.length,
    lineups,
    feasibleSetFingerprint,
    evidenceRefs,
    feasibleSetRef:
      `ccf://historical-lineup-feasible-set/sha256/${feasibleSetFingerprint}`,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
