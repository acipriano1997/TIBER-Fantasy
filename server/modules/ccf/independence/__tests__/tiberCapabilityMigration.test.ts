import {
  CCF_TIBER_CAPABILITY_MIGRATION_V0,
  assertNoTiberOutputPromotedAsNative,
  capabilityMigrationBlockers,
  canClaimTiberCapabilityMigrationComplete,
  type CCFTiberCapabilityMigrationRecord,
} from "../tiberCapabilityMigration";

describe("CCF TIBER capability migration", () => {
  it("blocks a complete-migration claim while native rebuilds are missing or partial", () => {
    expect(canClaimTiberCapabilityMigrationComplete()).toBe(false);
    expect(capabilityMigrationBlockers().length).toBeGreaterThan(0);
  });

  it("keeps final TIBER/FORGE model outputs challenger-only", () => {
    const challengerIds = ["rookies-alpha-output", "forge-grade-rank-output"];

    for (const id of challengerIds) {
      expect(CCF_TIBER_CAPABILITY_MIGRATION_V0.find((record) => record.id === id)).toMatchObject({
        disposition: "challenger_only",
        status: "challenger_only",
        requiredForUniversalCCF: false,
      });
    }

    expect(() => assertNoTiberOutputPromotedAsNative()).not.toThrow();
  });

  it("requires the native production model to inherit Forecast validation mechanisms, not Forecast outputs", () => {
    const requiredIds = [
      "forecast-xfpg-opportunity",
      "forecast-residual-uncertainty",
      "forecast-calibration-reliability",
      "forecast-time-series-backtest",
      "forecast-simple-benchmarks",
      "forecast-subgroup-stability",
      "forecast-scenario-fusion",
      "forecast-replacement-vorp",
      "forecast-ros-seasonal",
    ];

    for (const id of requiredIds) {
      const record = CCF_TIBER_CAPABILITY_MIGRATION_V0.find((candidate) => candidate.id === id);
      expect(record?.requiredForUniversalCCF).toBe(true);
      expect(record?.disposition).toBe("rebuild_native");
      expect(record?.status).not.toBe("native_certified");
    }
  });

  it("tracks Data governance and rookie/developmental mechanisms as native rebuild work", () => {
    const dataRecord = CCF_TIBER_CAPABILITY_MIGRATION_V0.find(
      (record) => record.id === "data-immutable-observation-receipts",
    );
    const rookieRecord = CCF_TIBER_CAPABILITY_MIGRATION_V0.find(
      (record) => record.id === "rookies-transition-profile",
    );

    expect(dataRecord).toMatchObject({
      sourceSystem: "TIBER-Data",
      requiredForUniversalCCF: true,
      status: "native_partial",
    });
    expect(rookieRecord).toMatchObject({
      sourceSystem: "TIBER-Rookies",
      disposition: "rebuild_native",
      status: "rebuild_required",
    });
  });

  it("only clears the migration gate when every required capability is certified natively", () => {
    const certified: CCFTiberCapabilityMigrationRecord[] = CCF_TIBER_CAPABILITY_MIGRATION_V0.map(
      (record) => ({
        ...record,
        status: record.requiredForUniversalCCF ? "native_certified" : record.status,
      }),
    );

    expect(canClaimTiberCapabilityMigrationComplete(certified)).toBe(true);
  });

  it("rejects relabeling a challenger-only TIBER output as native", () => {
    const invalid: CCFTiberCapabilityMigrationRecord[] = CCF_TIBER_CAPABILITY_MIGRATION_V0.map(
      (record) =>
        record.id === "rookies-alpha-output"
          ? { ...record, status: "native_certified" as const }
          : { ...record },
    );

    expect(() => assertNoTiberOutputPromotedAsNative(invalid)).toThrow(
      /rookies-alpha-output/,
    );
  });
});
