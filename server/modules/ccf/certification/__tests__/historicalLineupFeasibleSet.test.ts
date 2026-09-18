import {
  buildCCFHistoricalLineupFeasibleSet,
} from "../historicalLineupFeasibleSet";
import {
  createCCFLineupSlotGeometry,
} from "../../lineup/lineupSlotGeometry";
import {
  createCCFFrozenRosterStateSnapshot,
} from "../../lineup/rosterStateSnapshot";
import type {
  CCFLineupRosterPlayer,
  CCFLineupSlot,
} from "../../lineup/lineupDecision";

const AS_OF = "2024-09-22T16:00:00Z";

function player(
  playerId: string,
  position: CCFLineupRosterPlayer["position"],
  overrides: Partial<CCFLineupRosterPlayer> = {},
): CCFLineupRosterPlayer {
  return {
    playerId,
    position,
    identityStatus: "canonical",
    availability: "eligible",
    byeWeek: null,
    byeWeekKnown: true,
    observedStarterSlotId: null,
    lockState: "unlocked",
    lockAt: null,
    ...overrides,
  };
}

function baseSlots(): CCFLineupSlot[] {
  return [
    {
      slotId: "QB:1",
      slotType: "QB",
      eligiblePositions: ["QB"],
      lockedPlayerId: null,
    },
    {
      slotId: "FLEX:1",
      slotType: "FLEX",
      eligiblePositions: ["RB", "WR", "TE"],
      lockedPlayerId: null,
    },
  ];
}

function frozen(
  slots: CCFLineupSlot[] = baseSlots(),
  players: CCFLineupRosterPlayer[] = [
    player("qb-1", "QB"),
    player("rb-1", "RB"),
    player("wr-1", "WR"),
  ],
) {
  const geometry = createCCFLineupSlotGeometry(slots);
  const snapshot = createCCFFrozenRosterStateSnapshot({
    leagueRef: "league-1",
    teamRef: "team-1",
    season: 2024,
    week: 3,
    asOf: AS_OF,
    rosterSlotsFingerprint: geometry.fingerprint,
    producer: {
      producerId: "historical-roster-adapter",
      producerVersion: "v1",
      sourcePlanFingerprint: "source-plan-v1",
      sourceSnapshotRef: "ccf://raw/roster/week-3",
    },
    players,
  });
  return { geometry, snapshot };
}

describe("CCF historical lineup feasible set", () => {
  it("enumerates every complete legal lineup and fingerprints it deterministically", () => {
    const input = frozen();
    const first = buildCCFHistoricalLineupFeasibleSet({
      rosterSnapshot: input.snapshot,
      slotGeometry: input.geometry,
    });
    const replay = buildCCFHistoricalLineupFeasibleSet({
      rosterSnapshot: input.snapshot,
      slotGeometry: input.geometry,
    });

    expect(first).toEqual(replay);
    expect(first.feasibleLineupCount).toBe(2);
    expect(first.lineups).toHaveLength(2);
    expect(first.lineups.flatMap((row) => row.assignments.map((a) => a.playerId)))
      .toEqual(expect.arrayContaining(["qb-1", "rb-1", "wr-1"]));
    expect(first.feasibleSetRef).toMatch(
      /^ccf:\/\/historical-lineup-feasible-set\/sha256\/[a-f0-9]{64}$/,
    );
    expect(first).toMatchObject({
      decisionAsOf: AS_OF,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
  });

  it("preserves a locked starter in its exact frozen slot and excludes a locked bench player", () => {
    const slots = baseSlots();
    slots[1] = { ...slots[1], lockedPlayerId: "wr-1" };
    const input = frozen(slots, [
      player("qb-1", "QB"),
      player("rb-1", "RB", {
        lockState: "locked",
        lockAt: "2024-09-22T15:00:00Z",
      }),
      player("wr-1", "WR", {
        observedStarterSlotId: "FLEX:1",
        lockState: "locked",
        lockAt: "2024-09-22T15:00:00Z",
      }),
    ]);

    const result = buildCCFHistoricalLineupFeasibleSet({
      rosterSnapshot: input.snapshot,
      slotGeometry: input.geometry,
    });

    expect(result.feasibleLineupCount).toBe(1);
    expect(result.lineups[0].assignments).toEqual([
      { slotId: "FLEX:1", playerId: "wr-1" },
      { slotId: "QB:1", playerId: "qb-1" },
    ]);
    expect(
      result.lineups[0].assignments.some((row) => row.playerId === "rb-1"),
    ).toBe(false);
  });

  it("rejects slot geometry that is not bound by the frozen roster snapshot", () => {
    const input = frozen();
    const other = createCCFLineupSlotGeometry([
      ...baseSlots(),
      {
        slotId: "WR:2",
        slotType: "WR",
        eligiblePositions: ["WR"],
        lockedPlayerId: null,
      },
    ]);

    expect(() =>
      buildCCFHistoricalLineupFeasibleSet({
        rosterSnapshot: input.snapshot,
        slotGeometry: other,
      }),
    ).toThrow(/does not bind the supplied lineup slot geometry/);
  });

  it("fails closed on unresolved legality state instead of claiming complete coverage", () => {
    for (const mutation of [
      { identityStatus: "unresolved" as const },
      { availability: "unknown" as const },
      { byeWeekKnown: false },
      { lockState: "unknown" as const },
    ]) {
      const input = frozen(baseSlots(), [
        player("qb-1", "QB"),
        player("wr-1", "WR", mutation),
      ]);

      expect(() =>
        buildCCFHistoricalLineupFeasibleSet({
          rosterSnapshot: input.snapshot,
          slotGeometry: input.geometry,
        }),
      ).toThrow();
    }
  });

  it("fails closed rather than truncating an exact feasible set at the safety limit", () => {
    const input = frozen();

    expect(() =>
      buildCCFHistoricalLineupFeasibleSet({
        rosterSnapshot: input.snapshot,
        slotGeometry: input.geometry,
        maximumFeasibleLineups: 1,
      }),
    ).toThrow(/exceeded safety limit 1/);
  });

  it("rejects a mutated roster snapshot even when its old fingerprint is retained", () => {
    const input = frozen();
    input.snapshot.players[0].availability = "ineligible";

    expect(() =>
      buildCCFHistoricalLineupFeasibleSet({
        rosterSnapshot: input.snapshot,
        slotGeometry: input.geometry,
      }),
    ).toThrow(/intact frozen roster snapshot/);
  });
});
