import {
  compareCCFPlayerFeatureVectors,
  rankCCFSimilarPlayers,
} from "../playerSimilarity";

describe("CCF player similarity", () => {
  it("compares only shared present governed features", () => {
    const result = compareCCFPlayerFeatureVectors(
      { playerId: "a", features: { usage: 0.8, efficiency: 0.5, role: null } },
      { playerId: "b", features: { usage: 0.7, efficiency: 0.5, role: 0.9 } },
      { minimumSharedFeatures: 2 },
    );
    expect(result.comparable).toBe(true);
    expect(result.sharedFeatures).toEqual(["efficiency", "usage"]);
    expect(result.missingFromLeft).toEqual(["role"]);
    expect(result.distance).toBeCloseTo(Math.sqrt((0 + 0.01) / 2));
  });

  it("abstains instead of filling missing features with neutral defaults", () => {
    const result = compareCCFPlayerFeatureVectors(
      { playerId: "a", features: { usage: 0.8, efficiency: null } },
      { playerId: "b", features: { usage: 0.7, efficiency: 0.5 } },
      { minimumSharedFeatures: 2 },
    );
    expect(result).toMatchObject({ comparable: false, distance: null, similarity: null });
  });

  it("ranks only comparable candidates by distance", () => {
    const ranked = rankCCFSimilarPlayers(
      { playerId: "a", features: { x: 0, y: 0 } },
      [
        { playerId: "b", features: { x: 0.1, y: 0.1 } },
        { playerId: "c", features: { x: 0.5, y: 0.5 } },
        { playerId: "d", features: { x: 0.1, y: null } },
      ],
      { minimumSharedFeatures: 2 },
    );
    expect(ranked.map((row) => row.rightPlayerId)).toEqual(["b", "c"]);
  });
});
