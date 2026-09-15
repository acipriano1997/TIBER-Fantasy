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

  it("tracks Sportradar NFL Official Game Roster as the viable activation candidate", () => {
    const activation = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) =>
        binding.sourceClass === "official_game_activation" &&
        binding.status === "candidate",
    );

    expect(activation).toMatchObject({
      bindingId: "sportradar-nfl-official-game-roster-candidate-v1",
      provider: "Sportradar",
      datasetOrProduct: "NFL Official API - Game Roster",
      authority: "raw_fact",
      status: "candidate",
      temporalMode: "current_snapshot_only",
      archiveStrategy: "none",
      parserVersion: null,
      pointInTimeSemanticsDocumented: false,
      rawTraceSupported: false,
    });
    expect(activation?.sourceLocatorTemplate).toContain("api.sportradar.com/nfl/official/");
    expect(activation?.licenseOrTermsRef).toContain("developer.sportradar.com");
  });

  it("retains NFL.com public inactive reports as a terms-blocked rejected path", () => {
    const rejected = CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.find(
      (binding) => binding.bindingId === "nfl-official-inactive-report-terms-blocked-v1",
    );

    expect(rejected).toMatchObject({
      sourceClass: "official_game_activation",
      provider: "NFL.com",
      status: "rejected",
      archiveStrategy: "none",
      parserVersion: null,
    });
    expect(rejected?.licenseOrTermsRef).toMatch(/systematic retrieval/i);
  });

  it("keeps the minimum source coverage gate failing until promotion proof exists", () => {
    expect(() =>
      assertCCFRecoveryMinimumSourceCoverage(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY),
    ).toThrow(/official injury designation evidence/);
  });
});
