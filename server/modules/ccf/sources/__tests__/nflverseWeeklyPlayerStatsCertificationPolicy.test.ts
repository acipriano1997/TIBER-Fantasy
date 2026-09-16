import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "../nflPlayerIdentityLinkage";
import {
  buildCCFNflverseWeeklyStatsReliabilityPolicy,
  CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINTS_2026_V1,
  CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
  fingerprintCCFNflverseWeeklyStatsReliabilityPolicy,
} from "../nflverseWeeklyPlayerStatsCertificationPolicy";

function identityReceipt(
  overrides: Partial<CCFNFLPlayerIdentityLinkageReceipt> = {},
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "weekly-stats-policy-test-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-registry-sha256",
    identityRegistryKnownAt: "2026-09-16T15:30:00Z",
    frozenAt: "2026-09-16T16:00:00Z",
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T15:30:00Z",
        evidenceRefs: ["ccf://registry/player-1"],
      },
    ],
    notes: ["synthetic test receipt"],
    ...overrides,
  };
}

describe("nflverse weekly player-stats prospective reliability policy", () => {
  it("binds the exact governed identity receipt without fabricating a production mapping", () => {
    const receipt = identityReceipt();
    const policy = buildCCFNflverseWeeklyStatsReliabilityPolicy({
      identityReceipt: receipt,
      frozenAt: "2026-09-16T17:00:00Z",
    });

    expect(policy).toMatchObject({
      sourceId: CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
      producer: "nflverse",
      intendedUse: "ffcc_native_weekly_recommendation",
      parserVersion: "ccf-nflverse-player-stats-v2",
      identityBindingRef: refCCFNFLPlayerIdentityLinkageReceipt(receipt),
      minimumSuccessfulCaptures: 4,
      minimumCaptureSuccessRate: 1,
      minimumSchemaValidRate: 1,
      minimumIdentityResolutionRate: 1,
      maximumCriticalMissingRate: 0,
      maximumDuplicateKeyRate: 0,
      maximumUnreconciledCorrections: 0,
    });
    expect(policy.checkpoints).toEqual(CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINTS_2026_V1);
    expect(fingerprintCCFNflverseWeeklyStatsReliabilityPolicy({
      identityReceipt: receipt,
      frozenAt: "2026-09-16T17:00:00Z",
    })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a policy that tries to bind identity evidence frozen later", () => {
    const receipt = identityReceipt({
      identityRegistryKnownAt: "2026-09-17T15:30:00Z",
      frozenAt: "2026-09-17T16:00:00Z",
      rows: identityReceipt().rows.map((row) => ({
        ...row,
        knownAt: "2026-09-17T15:30:00Z",
      })),
    });

    expect(() =>
      buildCCFNflverseWeeklyStatsReliabilityPolicy({
        identityReceipt: receipt,
        frozenAt: "2026-09-16T17:00:00Z",
      }),
    ).toThrow(/identity receipt must be frozen no later/);
  });

  it("fails if the policy is frozen after its first prospective checkpoint", () => {
    expect(() =>
      buildCCFNflverseWeeklyStatsReliabilityPolicy({
        identityReceipt: identityReceipt(),
        frozenAt: "2026-09-22T14:00:00Z",
      }),
    ).toThrow(/reliability policy must be frozen before the first observation checkpoint/);
  });

  it("keeps the prospective window fixed across two completed NFL weeks", () => {
    expect(CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINTS_2026_V1).toEqual([
      { checkpointId: "w2-tue-0900-et", scheduledFor: "2026-09-22T13:00:00Z" },
      { checkpointId: "w2-wed-0900-et", scheduledFor: "2026-09-23T13:00:00Z" },
      { checkpointId: "w3-tue-0900-et", scheduledFor: "2026-09-29T13:00:00Z" },
      { checkpointId: "w3-wed-0900-et", scheduledFor: "2026-09-30T13:00:00Z" },
    ]);
  });
});
