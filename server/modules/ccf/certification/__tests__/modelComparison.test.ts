import { compareCCFModelToBenchmark } from "../modelComparison";

describe("CCF model benchmark comparison", () => {
  it("compares candidate and benchmark only on paired observations", () => {
    const result = compareCCFModelToBenchmark([
      { actual: 10, candidate: 9, benchmark: 7 },
      { actual: 20, candidate: 18, benchmark: 21 },
      { actual: 15, candidate: null, benchmark: 14 },
    ]);

    expect(result.pairedSampleSize).toBe(2);
    expect(result.candidateMae).toBe(1.5);
    expect(result.benchmarkMae).toBe(2);
    expect(result.maeImprovement).toBe(0.5);
    expect(result.candidateWins).toBe(1);
    expect(result.benchmarkWins).toBe(1);
    expect(result.ties).toBe(0);
  });

  it("returns null metrics when no paired observations exist", () => {
    const result = compareCCFModelToBenchmark([
      { actual: 10, candidate: null, benchmark: 8 },
    ]);
    expect(result.pairedSampleSize).toBe(0);
    expect(result.candidateMae).toBeNull();
    expect(result.maeImprovement).toBeNull();
  });
});
