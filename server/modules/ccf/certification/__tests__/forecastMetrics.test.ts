import { evaluateCCFSelectivePrediction } from "../selectivePrediction";
import { evaluateCCFQuantileScoring } from "../quantileScoring";
import { evaluateCCFRankMetrics } from "../rankMetrics";

describe("CCF selective prediction", () => {
  it("rewards confidence ordering that concentrates low-loss decisions first", () => {
    const metrics = evaluateCCFSelectivePrediction([
      { observationId: "a", loss: 0.5, selectionScore: 0.95 },
      { observationId: "b", loss: 1, selectionScore: 0.8 },
      { observationId: "c", loss: 5, selectionScore: 0.4 },
      { observationId: "d", loss: 8, selectionScore: 0.1 },
    ]);

    expect(metrics.sampleSize).toBe(4);
    expect(metrics.points[0].risk).toBe(0.5);
    expect(metrics.points.at(-1)?.risk).toBeCloseTo((0.5 + 1 + 5 + 8) / 4);
    expect(metrics.excessAreaUnderRiskCoverageCurve).toBeCloseTo(0);
  });

  it("exposes poor uncertainty ordering even when full-coverage risk is unchanged", () => {
    const good = evaluateCCFSelectivePrediction([
      { observationId: "a", loss: 0, selectionScore: 4 },
      { observationId: "b", loss: 1, selectionScore: 3 },
      { observationId: "c", loss: 5, selectionScore: 2 },
      { observationId: "d", loss: 10, selectionScore: 1 },
    ]);
    const bad = evaluateCCFSelectivePrediction([
      { observationId: "a", loss: 0, selectionScore: 1 },
      { observationId: "b", loss: 1, selectionScore: 2 },
      { observationId: "c", loss: 5, selectionScore: 3 },
      { observationId: "d", loss: 10, selectionScore: 4 },
    ]);

    expect(good.fullCoverageRisk).toBe(bad.fullCoverageRisk);
    expect(good.areaUnderRiskCoverageCurve as number).toBeLessThan(
      bad.areaUnderRiskCoverageCurve as number,
    );
    expect(bad.excessAreaUnderRiskCoverageCurve as number).toBeGreaterThan(0);
  });
});

describe("CCF quantile scoring", () => {
  it("computes proper pinball loss by quantile", () => {
    const metrics = evaluateCCFQuantileScoring([
      { actual: 10, predicted: 8, quantile: 0.5 },
      { actual: 10, predicted: 12, quantile: 0.5 },
      { actual: 10, predicted: 8, quantile: 0.9 },
    ]);
    expect(metrics.sampleSize).toBe(3);
    expect(metrics.byQuantile.find((row) => row.quantile === 0.5)?.meanPinballLoss).toBe(1);
    expect(metrics.byQuantile.find((row) => row.quantile === 0.9)?.meanPinballLoss).toBeCloseTo(1.8);
  });

  it("rejects invalid quantile levels", () => {
    expect(() =>
      evaluateCCFQuantileScoring([{ actual: 1, predicted: 1, quantile: 1 }]),
    ).toThrow(/quantile/);
  });
});

describe("CCF rank metrics", () => {
  it("returns perfect Spearman and Kendall agreement for identical orderings", () => {
    const metrics = evaluateCCFRankMetrics([
      { actual: 1, predicted: 10 },
      { actual: 2, predicted: 20 },
      { actual: 3, predicted: 30 },
      { actual: 4, predicted: 40 },
    ]);
    expect(metrics.spearman).toBeCloseTo(1);
    expect(metrics.kendallTauB).toBeCloseTo(1);
  });

  it("handles tied ranks without fabricating perfect correlation", () => {
    const metrics = evaluateCCFRankMetrics([
      { actual: 1, predicted: 1 },
      { actual: 1, predicted: 2 },
      { actual: 3, predicted: 3 },
    ]);
    expect(metrics.sampleSize).toBe(3);
    expect(metrics.spearman).not.toBeNull();
    expect(metrics.kendallTauB).not.toBeNull();
    expect(metrics.kendallTauB as number).toBeLessThan(1);
  });
});
