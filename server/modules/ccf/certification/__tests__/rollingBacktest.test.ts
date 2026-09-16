import { buildCCFRollingBacktestWindows } from "../rollingBacktest";

describe("CCF rolling backtest windows", () => {
  const keys = Array.from({ length: 12 }, (_, index) => ({ season: 2025, week: index + 1 }));

  it("builds expanding-train rolling validation/test windows", () => {
    const windows = buildCCFRollingBacktestWindows(keys, {
      minimumTrainObservations: 4,
      validationObservations: 2,
      testObservations: 2,
      stepObservations: 2,
    });

    expect(windows).toHaveLength(3);
    expect(windows[0].split.train.end).toEqual({ season: 2025, week: 4 });
    expect(windows[0].split.validation).toEqual({
      start: { season: 2025, week: 5 },
      end: { season: 2025, week: 6 },
    });
    expect(windows[0].split.test).toEqual({
      start: { season: 2025, week: 7 },
      end: { season: 2025, week: 8 },
    });
    expect(windows[2].trainObservationCount).toBe(8);
  });

  it("deduplicates repeated season/week keys before windowing", () => {
    const windows = buildCCFRollingBacktestWindows([...keys, { season: 2025, week: 1 }], {
      minimumTrainObservations: 8,
      validationObservations: 2,
      testObservations: 2,
      stepObservations: 1,
    });
    expect(windows).toHaveLength(1);
  });
});
