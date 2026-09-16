import {
  evaluateCCFIntervalCalibration,
  evaluateCCFProbabilityCalibration,
} from "../calibration";

describe("CCF calibration evaluators", () => {
  it("measures interval coverage and median error", () => {
    const metrics = evaluateCCFIntervalCalibration([
      { actual: 15, p10: 10, p50: 14, p90: 20 },
      { actual: 8, p10: 9, p50: 12, p90: 18 },
      { actual: 25, p10: 12, p50: 18, p90: 22 },
    ]);

    expect(metrics.sampleSize).toBe(3);
    expect(metrics.central80Coverage).toBeCloseTo(1 / 3);
    expect(metrics.belowP10Rate).toBeCloseTo(1 / 3);
    expect(metrics.aboveP90Rate).toBeCloseTo(1 / 3);
    expect(metrics.medianMeanError).toBeCloseTo((-1 + 4 - 7) / 3);
    expect(metrics.medianMae).toBeCloseTo((1 + 4 + 7) / 3);
  });

  it("builds probability reliability bins and Brier score", () => {
    const metrics = evaluateCCFProbabilityCalibration(
      [
        { probability: 0.2, occurred: false },
        { probability: 0.3, occurred: true },
        { probability: 0.8, occurred: true },
      ],
      5,
    );

    expect(metrics.sampleSize).toBe(3);
    expect(metrics.brierScore).toBeCloseTo((0.04 + 0.49 + 0.04) / 3);
    expect(metrics.bins.reduce((sum, bin) => sum + bin.sampleSize, 0)).toBe(3);
  });

  it("does not fabricate calibration when no valid observations exist", () => {
    const interval = evaluateCCFIntervalCalibration([]);
    const probability = evaluateCCFProbabilityCalibration([]);
    expect(interval.central80Coverage).toBeNull();
    expect(probability.brierScore).toBeNull();
  });
});
