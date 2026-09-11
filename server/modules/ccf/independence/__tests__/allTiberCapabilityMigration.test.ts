import {
  CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
  allTiberCapabilityMigrationBlockers,
  canClaimAllTiberCapabilityMigrationComplete,
  duplicateTiberCapabilityIds,
} from "../allTiberCapabilityMigration";

describe("complete TIBER capability migration registry", () => {
  it("has unique capability ids across every audited TIBER registry", () => {
    expect(duplicateTiberCapabilityIds()).toEqual([]);
  });

  it("keeps universal CCF blocked while required Data, Rookies, and Fantasy-app mechanisms are uncertified", () => {
    const blockerIds = new Set(allTiberCapabilityMigrationBlockers().map((record) => record.id));
    for (const id of [
      "data-weather-evidence-contract",
      "rookies-athletic-draft-signal-features",
      "rookies-historical-reconstruction-freeze",
      "rookies-transactional-artifact-promotion",
      "fantasy-fire-role-opportunity",
      "fantasy-matchup-sos-context",
      "fantasy-sentinel-output-guardrails",
      "fantasy-metric-matrix-similarity",
      "fantasy-management-use-activation-gates",
      "fantasy-context-entity-lineage",
      "fantasy-post-cutoff-signal-ledger",
      "fantasy-hypothesis-core",
      "fantasy-doctrine-insulation-market",
      "fantasy-draft-context-compiler",
    ]) {
      expect(blockerIds).toContain(id);
    }
    expect(canClaimAllTiberCapabilityMigrationComplete()).toBe(false);
  });

  it("explicitly retires uncalibrated or duplicate legacy brains", () => {
    for (const id of ["rookies-experimental-ml-lane", "fantasy-legacy-composite-brains"]) {
      expect(CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.find((record) => record.id === id)).toMatchObject({
        disposition: "intentionally_retire",
        status: "intentionally_retired",
        requiredForUniversalCCF: false,
      });
    }
  });

  it("keeps discovery and optional leverage hypotheses outside native outcome authority", () => {
    for (const id of [
      "rookies-devy-signal-discovery",
      "rookies-operator-signal-candidates",
      "fantasy-catalyst-leverage-context",
    ]) {
      expect(CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.find((record) => record.id === id)?.requiredForUniversalCCF).toBe(false);
    }
  });

  it("would allow migration completion only after every required capability is independently certified", () => {
    const certified = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.map((record) =>
      record.requiredForUniversalCCF
        ? { ...record, status: "native_certified" as const }
        : record,
    );
    expect(canClaimAllTiberCapabilityMigrationComplete(certified)).toBe(true);
  });
});
