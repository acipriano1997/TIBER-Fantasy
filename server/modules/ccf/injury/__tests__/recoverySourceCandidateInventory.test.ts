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

  it("does not pretend the missing game-activation source exists", () => {
    expect(
      CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY.bindings.some(
        (binding) => binding.sourceClass === "official_game_activation",
      ),
    ).toBe(false);
  });

  it("keeps the minimum source coverage gate failing until promotion proof exists", () => {
    expect(() =>
      assertCCFRecoveryMinimumSourceCoverage(CCF_RECOVERY_SOURCE_CANDIDATE_INVENTORY),
    ).toThrow(/official injury designation evidence/);
  });
});
