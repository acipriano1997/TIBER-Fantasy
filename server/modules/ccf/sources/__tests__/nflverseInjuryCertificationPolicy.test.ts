import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "../nflPlayerIdentityLinkage";
import {
  createCCFNflverseInjuryCertificationPolicies,
} from "../nflverseInjuryCertificationPolicy";

const REGISTRY_SHA = "a".repeat(64);
const ARCHIVE_REF = `ccf://raw/tiber/player_identity_map_gsis_tiber/sha256/${"b".repeat(64)}`;
const SCHEMA_REF =
  "github://acipriano1997/TIBER-Fantasy/migrations/0014_canonical_tiber_player_id.sql";

function realShapeReceipt(
  overrides: Partial<CCFNFLPlayerIdentityLinkageReceipt> = {},
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "nflverse-gsis-to-tiber-aaaaaaaaaaaaaaaa",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: REGISTRY_SHA,
    identityRegistryKnownAt: "2026-09-16T18:00:00Z",
    frozenAt: "2026-09-16T18:01:00Z",
    rows: [
      {
        sourcePlayerId: "00-0039991",
        status: "resolved_exact",
        canonicalPlayerId: "tbr_p_01JTEST0000000000000000001",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T18:00:00Z",
        evidenceRefs: [ARCHIVE_REF, SCHEMA_REF],
      },
      {
        sourcePlayerId: "00-0039992",
        status: "unresolved",
        canonicalPlayerId: null,
        bindingMethod: null,
        knownAt: "2026-09-16T18:00:00Z",
        evidenceRefs: [ARCHIVE_REF, SCHEMA_REF],
      },
    ],
    notes: ["prospective test receipt"],
    ...overrides,
  };
}

const CHECKPOINTS = [
  { checkpointId: "w2-thu", scheduledFor: "2026-09-17T20:00:00Z" },
  { checkpointId: "w2-fri", scheduledFor: "2026-09-18T20:00:00Z" },
  { checkpointId: "w2-sun", scheduledFor: "2026-09-20T13:00:00Z" },
  { checkpointId: "w3-wed", scheduledFor: "2026-09-23T20:00:00Z" },
  { checkpointId: "w3-fri", scheduledFor: "2026-09-25T20:00:00Z" },
  { checkpointId: "w3-sun", scheduledFor: "2026-09-27T13:00:00Z" },
];

describe("receipt-bound nflverse injury/practice certification policies", () => {
  it("creates two deterministic policies only after a prospective registry-backed identity receipt", () => {
    const receipt = realShapeReceipt();
    const bundle = createCCFNflverseInjuryCertificationPolicies({
      identityReceipt: receipt,
      frozenAt: "2026-09-16T19:00:00Z",
      checkpoints: CHECKPOINTS,
    });

    expect(bundle.identityBindingRef).toBe(
      refCCFNFLPlayerIdentityLinkageReceipt(receipt),
    );
    expect(bundle.identityRegistryFingerprint).toBe(REGISTRY_SHA);
    expect(bundle.injuryDesignation).toMatchObject({
      sourceId: "nflverse-injuries-designation-v2",
      parserVersion: "ccf-nflverse-injuries-candidate-v2",
      minimumCaptureSuccessRate: 0.9,
      minimumSchemaValidRate: 1,
      minimumIdentityResolutionRate: 0.99,
      maximumCriticalMissingRate: 0.05,
      maximumDuplicateKeyRate: 0,
      maximumUnreconciledCorrections: 0,
    });
    expect(bundle.practiceParticipation.sourceId).toBe(
      "nflverse-injuries-practice-v2",
    );
    expect(bundle.practiceParticipation.identityBindingRef).toBe(
      bundle.identityBindingRef,
    );
    expect(bundle.injuryDesignation.criticalFieldPolicyRef).not.toBe(
      bundle.practiceParticipation.criticalFieldPolicyRef,
    );
    expect(bundle.fingerprints.injuryDesignation).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.fingerprints.practiceParticipation).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an arbitrary structurally valid linkage receipt that lacks immutable registry archive evidence", () => {
    const receipt = realShapeReceipt();
    receipt.rows = receipt.rows.map((row) => ({
      ...row,
      evidenceRefs: ["fixture://identity", SCHEMA_REF],
    }));

    expect(() =>
      createCCFNflverseInjuryCertificationPolicies({
        identityReceipt: receipt,
        frozenAt: "2026-09-16T19:00:00Z",
        checkpoints: CHECKPOINTS,
      }),
    ).toThrow(/missing immutable prospective registry archive evidence/);
  });

  it("rejects policy freeze before the real identity receipt existed", () => {
    expect(() =>
      createCCFNflverseInjuryCertificationPolicies({
        identityReceipt: realShapeReceipt(),
        frozenAt: "2026-09-16T17:59:59Z",
        checkpoints: CHECKPOINTS,
      }),
    ).toThrow(/cannot precede identity registry knownAt or identity receipt frozenAt/);
  });

  it("rejects checkpoints that have already occurred by policy freeze", () => {
    expect(() =>
      createCCFNflverseInjuryCertificationPolicies({
        identityReceipt: realShapeReceipt(),
        frozenAt: "2026-09-18T21:00:00Z",
        checkpoints: CHECKPOINTS,
      }),
    ).toThrow(/must occur after policy freeze/);
  });

  it("requires a multi-cycle prospective window instead of a tiny post-hoc sample", () => {
    expect(() =>
      createCCFNflverseInjuryCertificationPolicies({
        identityReceipt: realShapeReceipt(),
        frozenAt: "2026-09-16T19:00:00Z",
        checkpoints: CHECKPOINTS.slice(0, 3),
      }),
    ).toThrow(/at least six prospective checkpoints/);

    const compressed = CHECKPOINTS.map((checkpoint, index) => ({
      ...checkpoint,
      scheduledFor: new Date(
        Date.parse("2026-09-17T20:00:00Z") + index * 12 * 60 * 60 * 1000,
      ).toISOString(),
    }));
    expect(() =>
      createCCFNflverseInjuryCertificationPolicies({
        identityReceipt: realShapeReceipt(),
        frozenAt: "2026-09-16T19:00:00Z",
        checkpoints: compressed,
      }),
    ).toThrow(/span at least six days/);
  });

  it("rejects ambiguous identity rows because the prospective registry materializer never manufactures ambiguity", () => {
    const receipt = realShapeReceipt();
    receipt.rows[1] = {
      ...receipt.rows[1],
      status: "ambiguous",
    };

    expect(() =>
      createCCFNflverseInjuryCertificationPolicies({
        identityReceipt: receipt,
        frozenAt: "2026-09-16T19:00:00Z",
        checkpoints: CHECKPOINTS,
      }),
    ).toThrow(/only exact-resolved or unresolved GSIS rows/);
  });

  it("keeps permission and source promotion explicitly outside a reliability pass", () => {
    const bundle = createCCFNflverseInjuryCertificationPolicies({
      identityReceipt: realShapeReceipt(),
      frozenAt: "2026-09-16T19:00:00Z",
      checkpoints: CHECKPOINTS,
    });

    for (const policy of [bundle.injuryDesignation, bundle.practiceParticipation]) {
      expect(policy.notes).toEqual(expect.arrayContaining([
        "passing reliability does not clear intended-use permission or trusted source promotion",
        "this policy does not authorize CCF_PRIMARY cutover or recommendation authority",
      ]));
    }
  });
});
