import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflversePlayerIdCrosswalk } from "../archivedNflversePlayerIdCrosswalk";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import {
  buildCCFNflverseSnapCountsReliabilityPolicy,
  fingerprintCCFNflverseSnapCountsReliabilityPolicy,
} from "../nflverseSnapCountsCertificationPolicy";

const CROSSWALK_CSV = [
  "gsis_id,pfr_id,display_name,position",
  "00-0000001,SmitJo00,John Smith,QB",
].join("\n");

function canonicalReceipt(overrides: Partial<CCFNFLPlayerIdentityLinkageReceipt> = {}): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "snap-policy-gsis-v1",
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
    ],
    notes: ["synthetic snap policy receipt"],
    ...overrides,
  };
}

describe("nflverse/PFR snap-count prospective reliability policy", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-snap-policy-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function crosswalk(capturedAt = "2026-09-16T17:30:00Z") {
    const fetchImpl = jest.fn(async () => new Response(CROSSWALK_CSV, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflversePlayerIdCrosswalk({
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  it("binds the frozen policy to exact PFR->GSIS->canonical identity evidence", async () => {
    const xwalk = await crosswalk();
    const receipt = canonicalReceipt();
    const input = {
      crosswalk: xwalk,
      identityReceipt: receipt,
      frozenAt: "2026-09-16T18:00:00Z",
    };
    const policy = buildCCFNflverseSnapCountsReliabilityPolicy(input);

    expect(policy).toMatchObject({
      sourceId: "nflverse-pfr-snap-counts-v2",
      parserVersion: "ccf-nflverse-snap-counts-candidate-v2",
      intendedUse: "ffcc_native_weekly_recommendation",
      minimumSuccessfulCaptures: 4,
      minimumIdentityResolutionRate: 1,
      maximumCriticalMissingRate: 0,
      maximumDuplicateKeyRate: 0,
      maximumUnreconciledCorrections: 0,
    });
    expect(policy.identityBindingRef).toMatch(
      /^ccf:\/\/pfr-player-identity-bridge\/sha256\/[a-f0-9]{64}$/,
    );
    expect(fingerprintCCFNflverseSnapCountsReliabilityPolicy(input)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails if the crosswalk was learned after the policy freeze", async () => {
    const xwalk = await crosswalk("2026-09-17T17:30:00Z");
    expect(() =>
      buildCCFNflverseSnapCountsReliabilityPolicy({
        crosswalk: xwalk,
        identityReceipt: canonicalReceipt(),
        frozenAt: "2026-09-16T18:00:00Z",
      }),
    ).toThrow(/crosswalk must be known no later/);
  });

  it("fails if canonical identity was frozen after the policy", async () => {
    const xwalk = await crosswalk();
    expect(() =>
      buildCCFNflverseSnapCountsReliabilityPolicy({
        crosswalk: xwalk,
        identityReceipt: canonicalReceipt({ frozenAt: "2026-09-17T17:15:00Z" }),
        frozenAt: "2026-09-16T18:00:00Z",
      }),
    ).toThrow(/identity receipt must be frozen no later/);
  });

  it("cannot be frozen after the first prospective checkpoint", async () => {
    const xwalk = await crosswalk();
    expect(() =>
      buildCCFNflverseSnapCountsReliabilityPolicy({
        crosswalk: xwalk,
        identityReceipt: canonicalReceipt(),
        frozenAt: "2026-09-22T15:00:00Z",
      }),
    ).toThrow(/frozen before the first observation checkpoint/);
  });
});
