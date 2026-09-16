import {
  calculateCCFReplacementBaselines,
  calculateCCFVorp,
} from "../replacementValue";

describe("CCF replacement value", () => {
  const players = [
    { playerId: "q1", position: "QB" as const, projectedPoints: 30 },
    { playerId: "q2", position: "QB" as const, projectedPoints: 20 },
    { playerId: "q3", position: "QB" as const, projectedPoints: 10 },
    { playerId: "r1", position: "RB" as const, projectedPoints: 25 },
    { playerId: "r2", position: "RB" as const, projectedPoints: 24 },
    { playerId: "r3", position: "RB" as const, projectedPoints: 23 },
    { playerId: "r4", position: "RB" as const, projectedPoints: 15 },
    { playerId: "w1", position: "WR" as const, projectedPoints: 22 },
    { playerId: "w2", position: "WR" as const, projectedPoints: 21 },
    { playerId: "w3", position: "WR" as const, projectedPoints: 20 },
    { playerId: "w4", position: "WR" as const, projectedPoints: 14 },
    { playerId: "t1", position: "TE" as const, projectedPoints: 18 },
    { playerId: "t2", position: "TE" as const, projectedPoints: 17 },
    { playerId: "t3", position: "TE" as const, projectedPoints: 16 },
  ];

  const config = {
    managerCount: 2,
    startersByPosition: { QB: 1, RB: 1, WR: 1, TE: 1 },
    flexStartersPerManager: 1,
    flexEligiblePositions: ["RB", "WR", "TE"] as const,
  };

  it("allocates flex demand from the best remaining eligible players", () => {
    const baselines = calculateCCFReplacementBaselines(players, config);
    expect(baselines.find((row) => row.position === "RB")).toMatchObject({
      starterDemand: 2,
      flexAllocatedStarters: 1,
      replacementRankWithinPosition: 4,
      replacementPlayerId: "r4",
      replacementPoints: 15,
    });
    expect(baselines.find((row) => row.position === "WR")).toMatchObject({
      flexAllocatedStarters: 1,
      replacementPlayerId: "w4",
      replacementPoints: 14,
    });
    expect(baselines.find((row) => row.position === "TE")).toMatchObject({
      flexAllocatedStarters: 0,
      replacementPlayerId: "t3",
      replacementPoints: 16,
    });
  });

  it("computes VORP from league-derived replacement points", () => {
    const baselines = calculateCCFReplacementBaselines(players, config);
    const values = calculateCCFVorp(players, baselines);
    expect(values.find((row) => row.playerId === "r1")?.vorp).toBe(10);
    expect(values.find((row) => row.playerId === "w1")?.vorp).toBe(8);
    expect(values.find((row) => row.playerId === "q1")?.vorp).toBe(20);
  });
});
