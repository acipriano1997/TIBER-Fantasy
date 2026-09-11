import {
  evaluateCCFBenchmarkErrors,
  predictCCFHistoricalMean,
  predictCCFRecentMean,
  predictCCFUsageRateBaseline,
} from "../simpleBenchmarks";

describe("CCF simple benchmarks", () => {
  const history = [
    { playerId: "p1", actualFantasyPoints: 10, opportunity: 10 },
    { playerId: "p1", actualFantasyPoints: 14, opportunity: 14 },
    { playerId: "p1", actualFantasyPoints: 18, opportunity: 18 },
    { playerId: "p1", actualFantasyPoints: 22, opportunity: 22 },
  ];

  it("computes historical and recent mean baselines", () => {
    expect(predictCCFHistoricalMean(history)).toMatchObject({
      model: "historical_mean",
      predictedFantasyPoints: 16,
      sampleSize: 4,
    });
    expect(predictCCFRecentMean(history, 2)).toMatchObject({
      model: "recent_mean",
      predictedFantasyPoints: 20,
      sampleSize: 2,
    });
  });

  it("computes a usage-rate baseline without hidden fitted weights", () => {
    expect(predictCCFUsageRateBaseline(history, 12)).toMatchObject({
      model: "usage_rate",
      predictedFantasyPoints: 12,
      sampleSize: 4,
    });
  });

  it("preserves missing usage as unavailable rather than zero", () => {
    expect(predictCCFUsageRateBaseline(history, undefined)).toMatchObject({
      predictedFantasyPoints: null,
      sampleSize: 0,
    });
  });

  it("evaluates simple benchmark error metrics", () => {
    const metrics = evaluateCCFBenchmarkErrors([
      { actual: 10, predicted: 8 },
      { actual: 14, predicted: 16 },
    ]);
    expect(metrics.mae).toBe(2);
    expect(metrics.rmse).toBe(2);
    expect(metrics.sampleSize).toBe(2);
  });
});
