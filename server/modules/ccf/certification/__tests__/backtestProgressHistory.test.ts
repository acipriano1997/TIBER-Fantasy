import {
  CCF_BACKTEST_PROGRESS_HISTORY_V1,
  areCCFBacktestRecordsComparable,
  latestCompletedCCFBacktest,
  validateCCFBacktestProgressHistory,
  type CCFBacktestProgressRecord,
} from "../backtestProgressHistory";

describe("CCF backtest progression history", () => {
  it("accepts the canonical append-only history", () => {
    expect(() => validateCCFBacktestProgressHistory()).not.toThrow();
  });

  it("does not pretend infrastructure-only stages have predictive metrics", () => {
    expect(CCF_BACKTEST_PROGRESS_HISTORY_V1[0].status).toBe("infrastructure_only");
    expect(Object.values(CCF_BACKTEST_PROGRESS_HISTORY_V1[0].metrics).every((value) => value === null)).toBe(true);
  });

  it("records that the current CCF foundation has not yet completed a production historical OOS run", () => {
    const current = CCF_BACKTEST_PROGRESS_HISTORY_V1.at(-1)!;
    expect(current.stage).toBe("native_scaffold");
    expect(current.status).toBe("not_run");
    expect(current.tiberRole).toBe("challenger_only");
    expect(latestCompletedCCFBacktest()).toBeNull();
  });

  it("refuses comparisons when protocol/data/scoring identity is not frozen", () => {
    expect(areCCFBacktestRecordsComparable(
      CCF_BACKTEST_PROGRESS_HISTORY_V1[0],
      CCF_BACKTEST_PROGRESS_HISTORY_V1[1],
    )).toBe(false);
  });

  it("allows comparison only for the exact same frozen evaluation identity", () => {
    const base: CCFBacktestProgressRecord = {
      ...CCF_BACKTEST_PROGRESS_HISTORY_V1[1],
      id: "candidate-a",
      status: "passed",
      modelVersion: "ccf-a",
      comparisonIdentity: {
        protocolVersion: "ccf-chronological-oos-v1",
        scoringProfileHash: "score-hash",
        supportedPopulation: "QB/RB/WR/TE",
        testWindow: "2024-W1..2025-W18",
        datasetFingerprint: "dataset-hash",
      },
    };
    const next: CCFBacktestProgressRecord = {
      ...base,
      id: "candidate-b",
      modelVersion: "ccf-b",
    };
    expect(areCCFBacktestRecordsComparable(base, next)).toBe(true);
    expect(
      areCCFBacktestRecordsComparable(base, {
        ...next,
        comparisonIdentity: { ...next.comparisonIdentity, datasetFingerprint: "different-data" },
      }),
    ).toBe(false);
  });

  it("rejects backfilled metrics on a not-run entry", () => {
    const invalid = CCF_BACKTEST_PROGRESS_HISTORY_V1.map((record) => ({ ...record })) as CCFBacktestProgressRecord[];
    invalid[1] = {
      ...invalid[1],
      metrics: { ...invalid[1].metrics, mae: 4.2 },
    };
    expect(() => validateCCFBacktestProgressHistory(invalid)).toThrow(
      /cannot carry performance metrics before a completed backtest/,
    );
  });
});
