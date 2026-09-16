import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflversePlayerIdCrosswalk } from "../archivedNflversePlayerIdCrosswalk";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import {
  assertCCFPFRPlayerIdentityBridgeResolved,
  auditCCFPFRPlayerIdentityBridge,
  refCCFPFRPlayerIdentityBridge,
} from "../pfrPlayerIdentityBridge";

const CSV = [
  "gsis_id,pfr_id,display_name,position",
  "00-0000001,SmitJo00,John Smith,QB",
  "00-0000002,JoneJa00,James Jones,WR",
].join("\n");

function canonicalReceipt(
  secondStatus: "resolved_exact" | "unresolved" | "ambiguous" = "resolved_exact",
  overrides: Partial<CCFNFLPlayerIdentityLinkageReceipt> = {},
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "pfr-bridge-test-gsis-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-canonical-registry",
    identityRegistryKnownAt: "2026-09-16T17:00:00Z",
    frozenAt: "2026-09-16T17:15:00Z",
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T17:00:00Z",
        evidenceRefs: ["ccf://registry/00-0000001"],
      },
      {
        sourcePlayerId: "00-0000002",
        status: secondStatus,
        canonicalPlayerId: secondStatus === "resolved_exact" ? "ccf-player-2" : null,
        bindingMethod: secondStatus === "resolved_exact" ? "exact_external_id" : null,
        knownAt: "2026-09-16T17:00:00Z",
        evidenceRefs: ["ccf://registry/00-0000002"],
      },
    ],
    notes: ["synthetic bridge test receipt"],
    ...overrides,
  };
}

describe("PFR -> GSIS -> canonical CCF identity bridge", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-pfr-identity-bridge-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function crosswalk(capturedAt = "2026-09-16T17:30:00Z") {
    const fetchImpl = jest.fn(async () => new Response(CSV, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflversePlayerIdCrosswalk({
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  it("resolves exact PFR ids only when both bridge links are governed and timely", async () => {
    const snapshot = await crosswalk();
    const receipt = canonicalReceipt();
    const audit = auditCCFPFRPlayerIdentityBridge(
      snapshot,
      receipt,
      ["SmitJo00", "JoneJa00"],
      "2026-09-16T18:00:00Z",
    );

    expect(audit).toMatchObject({
      requestedCount: 2,
      pfrToGsisResolvedCount: 2,
      canonicalResolvedCount: 2,
      unresolvedPfrCount: 0,
      canonicalUnresolvedCount: 0,
      canonicalAmbiguousCount: 0,
      blockers: [],
    });
    expect(audit.resolvedPfrPlayerIds).toEqual(["JoneJa00", "SmitJo00"]);
    expect(audit.identityBindingRef).toBe(refCCFPFRPlayerIdentityBridge(snapshot, receipt));
    expect(audit.identityBindingRef).toMatch(
      /^ccf:\/\/pfr-player-identity-bridge\/sha256\/[a-f0-9]{64}$/,
    );
    expect(() =>
      assertCCFPFRPlayerIdentityBridgeResolved(
        snapshot,
        receipt,
        ["SmitJo00", "JoneJa00"],
        "2026-09-16T18:00:00Z",
      ),
    ).not.toThrow();
  });

  it("measures a missing PFR crosswalk row instead of falling back to a name", async () => {
    const snapshot = await crosswalk();
    const audit = auditCCFPFRPlayerIdentityBridge(
      snapshot,
      canonicalReceipt(),
      ["SmitJo00", "NoSuch00"],
      "2026-09-16T18:00:00Z",
    );

    expect(audit.unresolvedPfrCount).toBe(1);
    expect(audit.canonicalResolvedCount).toBe(1);
    expect(audit.blockers).toContain("unresolved_pfr_ids:1");
    expect(() =>
      assertCCFPFRPlayerIdentityBridgeResolved(
        snapshot,
        canonicalReceipt(),
        ["SmitJo00", "NoSuch00"],
        "2026-09-16T18:00:00Z",
      ),
    ).toThrow(/unresolved_pfr_ids:1/);
  });

  it("measures unresolved canonical GSIS identity after an exact PFR bridge", async () => {
    const snapshot = await crosswalk();
    const audit = auditCCFPFRPlayerIdentityBridge(
      snapshot,
      canonicalReceipt("unresolved"),
      ["SmitJo00", "JoneJa00"],
      "2026-09-16T18:00:00Z",
    );

    expect(audit.pfrToGsisResolvedCount).toBe(2);
    expect(audit.canonicalResolvedCount).toBe(1);
    expect(audit.canonicalUnresolvedCount).toBe(1);
    expect(audit.blockers).toContain("canonical_unresolved_ids:1");
  });

  it("does not backdate a crosswalk captured after the decision asOf", async () => {
    const snapshot = await crosswalk("2026-09-17T17:30:00Z");
    const audit = auditCCFPFRPlayerIdentityBridge(
      snapshot,
      canonicalReceipt(),
      ["SmitJo00"],
      "2026-09-16T18:00:00Z",
    );

    expect(audit.blockers).toContain("crosswalk_known_after_as_of");
    expect(audit.identityBindingRef).toBeNull();
  });

  it("rejects canonical identity evidence learned after asOf", async () => {
    const snapshot = await crosswalk();
    const futureReceipt = canonicalReceipt("resolved_exact", {
      identityRegistryKnownAt: "2026-09-17T17:00:00Z",
      frozenAt: "2026-09-17T17:15:00Z",
      rows: canonicalReceipt().rows.map((row) => ({
        ...row,
        knownAt: "2026-09-17T17:00:00Z",
      })),
    });
    const audit = auditCCFPFRPlayerIdentityBridge(
      snapshot,
      futureReceipt,
      ["SmitJo00"],
      "2026-09-16T18:00:00Z",
    );

    expect(audit.blockers).toEqual(expect.arrayContaining([
      "canonical:identity_registry_known_after_as_of",
      "canonical:receipt_frozen_after_as_of",
      "canonical:00-0000001:known_after_as_of",
    ]));
    expect(audit.identityBindingRef).toBeNull();
  });

  it("revalidates archived rows so an in-memory duplicate cannot overwrite identity", async () => {
    const snapshot = await crosswalk();
    snapshot.rows.push({
      ...snapshot.rows[0],
      gsisId: "00-0000099",
    });
    const audit = auditCCFPFRPlayerIdentityBridge(
      snapshot,
      canonicalReceipt(),
      ["SmitJo00"],
      "2026-09-16T18:00:00Z",
    );

    expect(audit.blockers.some((blocker) => blocker.includes("duplicate PFR player id"))).toBe(true);
    expect(audit.identityBindingRef).toBeNull();
  });
});
