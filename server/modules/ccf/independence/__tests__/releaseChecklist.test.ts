import {
  assertCCFUniversalReleaseReady,
  buildCCFUniversalReleaseChecklist,
} from "../releaseChecklist";

const RELEASE_AS_OF = "2026-09-15T22:00:00.000Z";

describe("CCF universal release checklist", () => {
  it("keeps universal promotion blocked while migration, dependency, or lineup release work remains", () => {
    const checklist = buildCCFUniversalReleaseChecklist([], RELEASE_AS_OF);
    expect(checklist.promotable).toBe(false);
    expect(checklist.summary.capabilityBlockers).toBeGreaterThan(0);
    expect(checklist.summary.criticalDependencyBlockers).toBeGreaterThan(0);
    expect(checklist.summary.lineupDecisionBlockers).toBeGreaterThan(0);
    expect(checklist.lineupDecision.ready).toBe(false);
    expect(() => assertCCFUniversalReleaseReady([], RELEASE_AS_OF)).toThrow(/release blocked/);
  });

  it("surfaces native scaffolds as partial rather than certified", () => {
    const checklist = buildCCFUniversalReleaseChecklist([], RELEASE_AS_OF);
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
    const checklist = buildCCFUniversalReleaseChecklist([], RELEASE_AS_OF);
    expect(checklist.capabilities.find((item) => item.id === "rookies-alpha-output")).toMatchObject({
      state: "non_authoritative",
      required: false,
    });
    expect(checklist.capabilities.find((item) => item.id === "forge-grade-rank-output")).toMatchObject({
      state: "non_authoritative",
      required: false,
    });
  });

  it("reports all eight surfaces blocked without lineage and model certification", () => {
    const checklist = buildCCFUniversalReleaseChecklist([], RELEASE_AS_OF);
    expect(checklist.authority.surfaces.map((audit) => audit.surface)).toEqual([
      "draft", "lineup", "waiver", "trade", "keeper", "dynasty", "devy", "beat_vegas",
    ]);
    expect(checklist.summary.authoritySurfaceBlockers).toBe(8);
    expect(checklist.summary.trustedBindingSurfaceBlockers).toBe(8);
    expect(checklist.summary.uncertifiedModelSurfaces).toBe(8);
    expect(checklist.authority.modelCertificationComplete).toBe(false);
    expect(checklist.authority.surfaces.every((audit) => audit.recommendationAuthority === false)).toBe(true);
  });

  it("exposes the exact native lineup release blockers rather than treating code existence as certification", () => {
    const checklist = buildCCFUniversalReleaseChecklist([], RELEASE_AS_OF);
    expect(checklist.lineupDecision.blockers).toEqual(expect.arrayContaining([
      "unified_league_context_adapter:missing",
      "active_league_position_coverage:missing",
      "production_weekly_source_spine:missing",
      "predictive_validation:missing",
      "trusted_lineup_authority_binding:missing",
      "chronological_lineup_decision_evaluation:missing",
      "tiber_off_replay:missing",
      "certified_route_cutover:missing",
    ]));
  });
});
