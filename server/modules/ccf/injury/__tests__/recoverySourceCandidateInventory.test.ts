import {
  assertCCFRecoveryMinimumSourceCoverage,
  fingerprintCCFRecoverySourceBindingPlan,
} from "../injurySourceBinding";
import {
  CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY,
  CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY_FINGERPRINT,
  getCCFRecoverySourceCandidateInventory,
} from "../recoverySourceCandidateInventory";

describe("CCF recovery source candidate inventory", () => {
  it("is valid and deterministically fingerprinted", () => {
    const inventory = getCCFRecoverySourceCandidateInventory();
    expect(fingerprintCCFRecoverySourceBindingPlan(inventory)).toBe(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY_FINGERPRINT,
    );
  });

  it("contains no production-eligible bindings", () => {
    expect(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.filter(
        (binding) => binding.status === "production_eligible",
      ),
    ).toEqual([]);
  });

  it("records NFL.com official inactive reports as terms-blocked, not as a production candidate", () => {
    const activation = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) => binding.sourceClass === "official_game_activation",
    );

    expect(activation).toMatchObject({
      bindingId: "nfl-official-inactive-report-terms-blocked-v1",
      provider: "NFL.com",
      datasetOrProduct: "Inactive Reports",
      authority: "raw_fact",
      status: "rejected",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      parserVersion: null,
      sourceLocatorTemplate: "https://www.nfl.com/inactives/",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
    });
    expect(activation?.licenseOrTermsRef).toMatch(/systematic retrieval/i);
    expect(activation?.reliabilityReviewRef).toMatch(/Terms and Conditions audited/);
  });

  it("has no viable official game-activation binding after the terms audit", () => {
    expect(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.filter(
        (binding) =>
          binding.sourceClass === "official_game_activation" &&
          binding.status !== "rejected",
      ),
    ).toEqual([]);
  });

  it("keeps the minimum source coverage gate failing until promotion proof exists", () => {
    expect(() =>
      assertCCFRecoveryMinimumSourceCoverage(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY),
    ).toThrow(/official injury designation evidence/);
  });
});
