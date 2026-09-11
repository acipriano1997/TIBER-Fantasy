import {
  CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0,
  allTiberCapabilityMigrationBlockers,
  canClaimAllTiberCapabilityMigrationComplete,
  duplicateTiberCapabilityIds,
} from "../allTiberCapabilityMigration";

describe("complete TIBER capability migration registry", () => {
  it("has unique capability ids across base and extension registries", () => {
    expect(duplicateTiberCapabilityIds()).toEqual([]);
  });

  it("keeps universal CCF blocked while newly discovered required mechanisms are uncertified", () => {
    const blockerIds = new Set(allTiberCapabilityMigrationBlockers().map((record) => record.id));
    expect(blockerIds).toContain("data-weather-evidence-contract");
    expect(blockerIds).toContain("rookies-athletic-draft-signal-features");
    expect(blockerIds).toContain("rookies-historical-reconstruction-freeze");
    expect(blockerIds).toContain("rookies-transactional-artifact-promotion");
    expect(canClaimAllTiberCapabilityMigrationComplete()).toBe(false);
  });

  it("explicitly retires the uncalibrated experimental Rookie ML lane", () => {
    expect(
      CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.find(
        (record) => record.id === "rookies-experimental-ml-lane",
      ),
    ).toMatchObject({
      disposition: "intentionally_retire",
      status: "intentionally_retired",
      requiredForUniversalCCF: false,
    });
  });

  it("keeps Devy and operator discovery signals outside native outcome authority", () => {
    for (const id of ["rookies-devy-signal-discovery", "rookies-operator-signal-candidates"]) {
      expect(CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.find((record) => record.id === id)).toMatchObject({
        disposition: "challenger_only",
        status: "challenger_only",
        requiredForUniversalCCF: false,
      });
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
