import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_PBP_CHECKPOINTS_2026_V1,
  CCF_NFLVERSE_PBP_SOURCE_ID_V2,
  buildCCFNflversePlayByPlayReliabilityPolicy,
  fingerprintCCFNflversePlayByPlayReliabilityPolicy,
} from "../nflversePlayByPlayCertificationPolicy";

function identityReceipt(
  frozenAt = "2026-09-16T18:00:00Z",
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "pbp-policy-test-identity-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-pbp-policy-registry",
    identityRegistryKnownAt: "2026-09-16T17:45:00Z",
    frozenAt,
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T17:45:00Z",
        evidenceRefs: ["ccf://registry/00-0000001"],
      },
    ],
    notes: ["synthetic PBP policy test receipt"],
  };
}

describe("nflverse play-by-play prospective reliability policy", () => {
  it("binds parser v2, exact identity evidence, and the frozen two-week checkpoints", () => {
    const policy = buildCCFNflversePlayByPlayReliabilityPolicy({
      identityReceipt: identityReceipt(),
      frozenAt: "2026-09-16T18:30:00Z",
    });

    expect(policy).toMatchObject({
      sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V2,
      producer: "nflverse",
      intendedUse: "ffcc_native_weekly_recommendation",
      parserVersion: "ccf-nflverse-play-by-play-candidate-v2",
      minimumSuccessfulCaptures: 4,
      minimumCaptureSuccessRate: 1,
      minimumSchemaValidRate: 1,
      minimumIdentityResolutionRate: 1,
      maximumCriticalMissingRate: 0,
      maximumDuplicateKeyRate: 0,
      maximumUnreconciledCorrections: 0,
    });
    expect(policy.checkpoints).toEqual(CCF_NFLVERSE_PBP_CHECKPOINTS_2026_V1);
    expect(policy.frozenAt).toBe("2026-09-16T18:30:00Z");
    expect(policy.identityBindingRef).toMatch(
      /^ccf:\/\/nfl-player-identity-linkage\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("does not permit the policy to predate its identity receipt", () => {
    expect(() =>
      buildCCFNflversePlayByPlayReliabilityPolicy({
        identityReceipt: identityReceipt("2026-09-17T18:00:00Z"),
        frozenAt: "2026-09-16T18:30:00Z",
      }),
    ).toThrow(/identity receipt must be frozen no later/);
  });

  it("rejects a policy frozen after the first prospective checkpoint", () => {
    expect(() =>
      buildCCFNflversePlayByPlayReliabilityPolicy({
        identityReceipt: identityReceipt(),
        frozenAt: "2026-09-22T14:00:01Z",
      }),
    ).toThrow(/must be frozen before the first observation checkpoint/);
  });

  it("fingerprints identical frozen inputs deterministically", () => {
    const input = {
      identityReceipt: identityReceipt(),
      frozenAt: "2026-09-16T18:30:00Z",
    };
    expect(fingerprintCCFNflversePlayByPlayReliabilityPolicy(input)).toBe(
      fingerprintCCFNflversePlayByPlayReliabilityPolicy(input),
    );
  });
});
