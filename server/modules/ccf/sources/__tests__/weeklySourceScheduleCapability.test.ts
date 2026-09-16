import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  evaluateCCFWeeklySourceSpine,
  type CCFWeeklySourceSpinePlan,
} from "../weeklySourceSpine";

describe("weekly source schedule capability", () => {
  it("cannot report complete weekly source coverage without nfl_schedule", () => {
    expect(CCF_WEEKLY_SOURCE_CAPABILITIES).toContain("nfl_schedule");
    expect(CCF_WEEKLY_SOURCE_CAPABILITIES).toHaveLength(7);

    const plan: CCFWeeklySourceSpinePlan = {
      contractVersion: "ccf-weekly-source-spine-v1",
      planId: "missing-schedule-proof",
      frozenAt: "2026-09-16T15:00:00Z",
      intendedUse: "ffcc_native_weekly_recommendation",
      bindings: [],
      notes: [],
    };

    const audit = evaluateCCFWeeklySourceSpine(plan, "2026-09-16T15:30:00Z", []);
    expect(audit.requiredCapabilityCount).toBe(7);
    expect(audit.productionReady).toBe(false);
    expect(audit.blockers).toContain("nfl_schedule:missing_binding");
  });
});
