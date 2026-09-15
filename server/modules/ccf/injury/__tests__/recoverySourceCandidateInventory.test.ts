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

  it("tracks official NFL inactive reports as an unpromoted game-activation candidate", () => {
    const activation = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) => binding.sourceClass === "official_game_activation",
    );

    expect(activation).toMatchObject({
      bindingId: "nfl-official-inactive-report-candidate-v1",
      provider: "NFL.com",
      datasetOrProduct: "Inactive Reports",
      authority: "raw_fact",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "provider_archive",
      parserVersion: "ccf-nfl-official-inactives-candidate-v1",
      sourceLocatorTemplate: "https://amp.nfl.com/news/{inactive-report-article-slug}",
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
    });
    expect(activation?.licenseOrTermsRef).toBeNull();
    expect(activation?.reliabilityReviewRef).toBeNull();
  });

  it("keeps the minimum source coverage gate failing until promotion proof exists", () => {
    expect(() =>
      assertCCFRecoveryMinimumSourceCoverage(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY),
    ).toThrow(/official injury designation evidence/);
  });
});
