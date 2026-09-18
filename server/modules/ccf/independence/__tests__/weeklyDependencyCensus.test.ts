import type { CCFTiberCapabilityMigrationRecord } from "../tiberCapabilityMigration";
import { CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0 } from "../allTiberCapabilityMigration";
import {
  CCF_WEEKLY_DEPENDENCY_CENSUS_V0,
  blockedCriticalDependencies,
  canClaimCCFPrimary,
} from "../weeklyDependencyCensus";

describe("CCF weekly dependency census", () => {
  it("refuses a CCF_PRIMARY claim while recommendation-critical blockers remain", () => {
    expect(canClaimCCFPrimary()).toBe(false);
    expect(blockedCriticalDependencies().length).toBeGreaterThan(0);
  });

  it("classifies the EPA projection proxy as a blocked legacy heuristic", () => {
    const projection = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.find(
      (record) => record.fieldOrMechanism === "projPoints",
    );

    expect(projection).toMatchObject({
      producerFamily: "legacy_internal_heuristic",
      recommendationCritical: true,
      nativeStatus: "blocked_native",
    });
  });

  it("keeps ECR challenger-only", () => {
    const ecr = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.find(
      (record) => record.fieldOrMechanism === "ecrDelta",
    );

    expect(ecr).toMatchObject({
      producerFamily: "external_consensus",
      nativeStatus: "challenger_only",
    });
  });

  it("does not treat pending source-fact verification as native authority", () => {
    const injury = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.find(
      (record) => record.fieldOrMechanism === "injuryTag",
    );

    expect(injury?.nativeStatus).toBe("pending_verification");
    expect(canClaimCCFPrimary([injury!])).toBe(false);
  });

  it("still refuses CCF_PRIMARY if dependency rows are native but capability migration is incomplete", () => {
    const allNative = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.map((record) => ({
      ...record,
      nativeStatus: "eligible_native" as const,
    }));

    expect(canClaimCCFPrimary(allNative)).toBe(false);
  });

  it("rejects status-only relabeling even with a certified capability registry", () => {
    const allNative = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.map((record) => ({
      ...record,
      nativeStatus: "eligible_native" as const,
    }));
    const allMigrated: CCFTiberCapabilityMigrationRecord[] =
      CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.map((record) => ({
        ...record,
        status: record.requiredForUniversalCCF ? "native_certified" : record.status,
      }));

    expect(blockedCriticalDependencies(allNative).length).toBeGreaterThan(0);
    expect(canClaimCCFPrimary(allNative, allMigrated)).toBe(false);
  });

  it("requires complete census and surface evidence even after native relabeling", () => {
    const native = CCF_WEEKLY_DEPENDENCY_CENSUS_V0.map((record) => ({
      ...record, producerFamily: "ccf_native_fact" as const, nativeStatus: "eligible_native" as const,
    }));
    const certified = CCF_ALL_TIBER_CAPABILITY_MIGRATION_V0.map((record) => ({
      ...record, status: record.requiredForUniversalCCF ? "native_certified" as const : record.status,
    }));
    expect(blockedCriticalDependencies(native)).toEqual([]);
    for (const census of [
      [], native.slice(1), [...native, native[0]],
      native.map((record) => ({ ...record, recommendationCritical: false })), native,
    ]) expect(canClaimCCFPrimary(census, certified)).toBe(false);
  });

});
