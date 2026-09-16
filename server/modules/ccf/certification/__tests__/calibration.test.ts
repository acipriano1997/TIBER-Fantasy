import {
  evaluateCCFIntervalCalibration,
  evaluateCCFProbabilityCalibration,
} from "../calibration";

describe("CCF calibration evaluators", () => {
  it("measures interval coverage, calibration error, sharpness, and median error", () => {
    const metrics = evaluateCCFIntervalCalibration([
      { actual: 15, p10: 10, p50: 14, p90: 20 },
      { actual: 8, p10: 9, p50: 12, p90: 18 },
      { actual: 25, p10: 12, p50: 18, p90: 22 },
    ]);

    expect(metrics.sampleSize).toBe(3);
    expect(metrics.central80Coverage).toBeCloseTo(1 / 3);
    expect(metrics.central80CoverageError).toBeCloseTo(1 / 3 - 0.8);
    expect(metrics.belowP10Rate).toBeCloseTo(1 / 3);
    expect(metrics.aboveP90Rate).toBeCloseTo(1 / 3);
    expect(metrics.medianMeanError).toBeCloseTo((-1 + 4 - 7) / 3);
    expect(metrics.medianMae).toBeCloseTo((1 + 4 + 7) / 3);
    expect(metrics.meanCentral80Width).toBeCloseTo((10 + 9 + 10) / 3);
  });

  it("builds probability reliability bins, Brier score, log loss, and calibration error", () => {
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
    expect(metrics.logLoss).toBeCloseTo(
      (-Math.log(0.8) - Math.log(0.3) - Math.log(0.8)) / 3,
    );
    expect(metrics.baseRate).toBeCloseTo(2 / 3);
    expect(metrics.meanForecast).toBeCloseTo((0.2 + 0.3 + 0.8) / 3);
    expect(metrics.expectedCalibrationError).not.toBeNull();
    expect(metrics.maximumCalibrationGap).not.toBeNull();
    expect(metrics.bins.reduce((sum, bin) => sum + bin.sampleSize, 0)).toBe(3);
  });

  it("keeps extreme probabilities finite for log loss without changing their Brier meaning", () => {
    const metrics = evaluateCCFProbabilityCalibration([
      { probability: 0, occurred: true },
      { probability: 1, occurred: false },
    ]);
    expect(metrics.brierScore).toBe(1);
    expect(metrics.logLoss).not.toBeNull();
    expect(Number.isFinite(metrics.logLoss as number)).toBe(true);
  });

  it("does not fabricate calibration when no valid observations exist", () => {
    const interval = evaluateCCFIntervalCalibration([]);
    const probability = evaluateCCFProbabilityCalibration([]);
    expect(interval.central80Coverage).toBeNull();
    expect(interval.meanCentral80Width).toBeNull();
    expect(probability.brierScore).toBeNull();
    expect(probability.logLoss).toBeNull();
    expect(probability.expectedCalibrationError).toBeNull();
  });
});
