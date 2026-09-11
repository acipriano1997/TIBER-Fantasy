import {
  assertCCFUniversalReleaseReady,
  buildCCFUniversalReleaseChecklist,
} from "../releaseChecklist";

describe("CCF universal release checklist", () => {
  it("keeps universal promotion blocked while migration or dependency work remains", () => {
    const checklist = buildCCFUniversalReleaseChecklist();
    expect(checklist.promotable).toBe(false);
    expect(checklist.summary.capabilityBlockers).toBeGreaterThan(0);
    expect(checklist.summary.criticalDependencyBlockers).toBeGreaterThan(0);
    expect(() => assertCCFUniversalReleaseReady()).toThrow(/release blocked/);
  });

  it("surfaces native scaffolds as partial rather than certified", () => {
    const checklist = buildCCFUniversalReleaseChecklist();
    for (const id of [
      "forecast-time-series-backtest",
      "forecast-simple-benchmarks",
      "forecast-replacement-vorp",
    ]) {
      expect(checklist.capabilities.find((item) => item.id === id)).toMatchObject({
        state: "partial",
        required: true,
      });
    }
  });

  it("keeps challenger-only outputs outside native authority", () => {
    const checklist = buildCCFUniversalReleaseChecklist();
    expect(checklist.capabilities.find((item) => item.id === "rookies-alpha-output")).toMatchObject({
      state: "non_authoritative",
      required: false,
    });
    expect(checklist.capabilities.find((item) => item.id === "forge-grade-rank-output")).toMatchObject({
      state: "non_authoritative",
      required: false,
    });
  });
});
