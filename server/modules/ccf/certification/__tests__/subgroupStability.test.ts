import { evaluateCCFSubgroupStability } from "../subgroupStability";

describe("CCF subgroup stability", () => {
  it("reports group-level error and coverage gaps", () => {
    const report = evaluateCCFSubgroupStability([
      { subgroup: "RB", actual: 10, predicted: 9, p10: 5, p90: 15 },
      { subgroup: "RB", actual: 12, predicted: 11, p10: 6, p90: 16 },
      { subgroup: "WR", actual: 20, predicted: 14, p10: 10, p90: 18 },
      { subgroup: "WR", actual: 18, predicted: 13, p10: 9, p90: 17 },
    ]);

    expect(report.overall?.sampleSize).toBe(4);
    expect(report.groups.find((group) => group.subgroup === "RB")?.mae).toBe(1);
    expect(report.groups.find((group) => group.subgroup === "RB")?.central80Coverage).toBe(1);
    expect(report.groups.find((group) => group.subgroup === "WR")?.mae).toBe(5.5);
    expect(report.groups.find((group) => group.subgroup === "WR")?.central80Coverage).toBe(0);
    expect(report.worstMaeGapVsOverall).toBeGreaterThan(0);
    expect(report.worstCoverageGapVsOverall).toBeGreaterThan(0);
  });

  it("can suppress undersized groups without fabricating stability", () => {
    const report = evaluateCCFSubgroupStability(
      [
        { subgroup: "veteran", actual: 10, predicted: 10 },
        { subgroup: "rookie", actual: 8, predicted: 9 },
        { subgroup: "rookie", actual: 9, predicted: 9 },
      ],
      2,
    );

    expect(report.groups.map((group) => group.subgroup)).toEqual(["rookie"]);
  });
});
