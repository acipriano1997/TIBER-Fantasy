import {
  auditCCFNFLPlayerIdentitySubset,
  assertCCFNFLPlayerIdentitySubsetResolved,
  fingerprintCCFNFLPlayerIdentityLinkageReceipt,
  refCCFNFLPlayerIdentityLinkageReceipt,
  validateCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "../nflPlayerIdentityLinkage";

function receipt(
  overrides: Partial<CCFNFLPlayerIdentityLinkageReceipt> = {},
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "nflverse-gsis-identity-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "canonical-registry-sha256",
    identityRegistryKnownAt: "2026-09-16T14:00:00Z",
    frozenAt: "2026-09-16T14:30:00Z",
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T14:00:00Z",
        evidenceRefs: ["ccf://registry/player-1"],
      },
      {
        sourcePlayerId: "00-0000002",
        status: "unresolved",
        canonicalPlayerId: null,
        bindingMethod: null,
        knownAt: "2026-09-16T14:00:00Z",
        evidenceRefs: ["ccf://registry/unresolved-2"],
      },
      {
        sourcePlayerId: "00-0000003",
        status: "ambiguous",
        canonicalPlayerId: null,
        bindingMethod: null,
        knownAt: "2026-09-16T14:00:00Z",
        evidenceRefs: ["ccf://registry/ambiguous-3"],
      },
    ],
    notes: [],
    ...overrides,
  };
}

describe("CCF NFL player identity linkage", () => {
  it("validates and deterministically fingerprints exact external-ID mappings", () => {
    const candidate = receipt();
    expect(validateCCFNFLPlayerIdentityLinkageReceipt(candidate)).toBe(candidate);
    expect(fingerprintCCFNFLPlayerIdentityLinkageReceipt(candidate)).toMatch(/^[a-f0-9]{64}$/);
    expect(refCCFNFLPlayerIdentityLinkageReceipt(candidate)).toMatch(
      /^ccf:\/\/nfl-player-identity\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("measures unresolved and ambiguous requested identities without inventing matches", () => {
    const candidate = receipt();
    const audit = auditCCFNFLPlayerIdentitySubset(
      candidate,
      ["00-0000001", "00-0000002", "00-0000003", "00-0000004"],
      "2026-09-16T16:00:00Z",
    );

    expect(audit.resolvedCount).toBe(1);
    expect(audit.unresolvedCount).toBe(2);
    expect(audit.ambiguousCount).toBe(1);
    expect(audit.resolvedSourcePlayerIds).toEqual(["00-0000001"]);
    expect(audit.identityBindingRef).toBe(refCCFNFLPlayerIdentityLinkageReceipt(candidate));
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "unresolved_requested_ids:2",
      "ambiguous_requested_ids:1",
    ]));
  });

  it("requires full exact resolution when the caller explicitly asks for a resolved subset", () => {
    const candidate = receipt({
      rows: receipt().rows.map((row) => ({
        ...row,
        status: "resolved_exact" as const,
        canonicalPlayerId: `ccf-${row.sourcePlayerId}`,
        bindingMethod: "exact_external_id" as const,
      })),
    });
    const audit = assertCCFNFLPlayerIdentitySubsetResolved(
      candidate,
      ["00-0000001", "00-0000002"],
      "2026-09-16T16:00:00Z",
    );
    expect(audit.resolvedCount).toBe(2);
    expect(audit.blockers).toEqual([]);
  });

  it("rejects fuzzy/implicit non-resolved bindings and duplicate identities", () => {
    const nonResolvedClaimsBinding = receipt();
    nonResolvedClaimsBinding.rows[1] = {
      ...nonResolvedClaimsBinding.rows[1],
      canonicalPlayerId: "ccf-player-2",
      bindingMethod: "explicit_mapping",
    };
    expect(() => validateCCFNFLPlayerIdentityLinkageReceipt(nonResolvedClaimsBinding)).toThrow(
      /non-resolved status must not claim a player binding/,
    );

    const duplicateSource = receipt();
    duplicateSource.rows[1] = {
      ...duplicateSource.rows[1],
      sourcePlayerId: duplicateSource.rows[0].sourcePlayerId,
    };
    expect(() => validateCCFNFLPlayerIdentityLinkageReceipt(duplicateSource)).toThrow(
      /duplicate sourcePlayerId/,
    );

    const duplicateCanonical = receipt({
      rows: [
        receipt().rows[0],
        {
          sourcePlayerId: "00-0000002",
          status: "resolved_exact",
          canonicalPlayerId: "ccf-player-1",
          bindingMethod: "exact_external_id",
          knownAt: "2026-09-16T14:00:00Z",
          evidenceRefs: ["ccf://registry/player-2"],
        },
      ],
    });
    expect(() => validateCCFNFLPlayerIdentityLinkageReceipt(duplicateCanonical)).toThrow(
      /duplicate resolved canonicalPlayerId/,
    );
  });

  it("fails closed on identity evidence learned after the decision checkpoint", () => {
    const candidate = receipt({
      identityRegistryKnownAt: "2026-09-16T16:30:00Z",
      frozenAt: "2026-09-16T16:30:00Z",
      rows: receipt().rows.map((row) => ({
        ...row,
        knownAt: "2026-09-16T16:30:00Z",
      })),
    });
    const audit = auditCCFNFLPlayerIdentitySubset(
      candidate,
      ["00-0000001"],
      "2026-09-16T16:00:00Z",
    );
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "identity_registry_known_after_as_of",
      "receipt_frozen_after_as_of",
      "00-0000001:known_after_as_of",
    ]));
    expect(audit.resolvedCount).toBe(0);
  });

  it("rejects duplicate or empty requested source IDs", () => {
    expect(
      auditCCFNFLPlayerIdentitySubset(
        receipt(),
        ["00-0000001", "00-0000001", ""],
        "2026-09-16T16:00:00Z",
      ).blockers,
    ).toEqual(expect.arrayContaining([
      "requested_source_player_ids_duplicate",
      "requested_source_player_id_empty",
    ]));
  });

  it("fingerprints equivalent row/evidence ordering deterministically", () => {
    const first = receipt({ notes: ["b", "a"] });
    const second = receipt({
      notes: ["a", "b"],
      rows: [...first.rows].reverse().map((row) => ({
        ...row,
        evidenceRefs: [...row.evidenceRefs].reverse(),
      })),
    });
    expect(fingerprintCCFNFLPlayerIdentityLinkageReceipt(first)).toBe(
      fingerprintCCFNFLPlayerIdentityLinkageReceipt(second),
    );
  });
});
