import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  auditCCFNFLPlayerIdentitySubset,
} from "../nflPlayerIdentityLinkage";
import {
  buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot,
  fingerprintCCFNFLPlayerIdentityRegistryRows,
  materializeCCFNFLPlayerIdentityRegistrySnapshot,
  type CCFNFLPlayerIdentityRegistrySourceRow,
} from "../nflPlayerIdentityRegistrySnapshot";

const ROWS: CCFNFLPlayerIdentityRegistrySourceRow[] = [
  {
    canonicalId: "legacy-canonical-2",
    tiberPlayerId: "tbr_p_01JTEST0000000000000000002",
    gsisId: "00-0039992",
    mergedInto: null,
  },
  {
    canonicalId: "legacy-canonical-1",
    tiberPlayerId: "tbr_p_01JTEST0000000000000000001",
    gsisId: "00-0039991",
    mergedInto: null,
  },
  {
    canonicalId: "legacy-merged-3",
    tiberPlayerId: null,
    gsisId: "00-0039993",
    mergedInto: "legacy-canonical-1",
  },
  {
    canonicalId: "legacy-no-gsis",
    tiberPlayerId: "tbr_p_01JTEST0000000000000000004",
    gsisId: null,
    mergedInto: null,
  },
];

describe("prospective NFL player identity registry snapshots", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-player-identity-registry-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("archives only GSIS-bearing exact registry columns with capture-time knownAt", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      sourceRows: ROWS,
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
    });

    expect(snapshot.knownAt).toBe("2026-09-16T18:00:00Z");
    expect(snapshot.capturedAt).toBe("2026-09-16T18:00:00Z");
    expect(snapshot.knownAtBasis).toBe("ccf_capture");
    expect(snapshot.rowCount).toBe(3);
    expect(snapshot.resolvedExactCount).toBe(2);
    expect(snapshot.unresolvedCount).toBe(1);
    expect(snapshot.rows.map((row) => row.gsisId)).toEqual([
      "00-0039991",
      "00-0039992",
      "00-0039993",
    ]);
    expect(snapshot.archive.manifest.temporalMode).toBe("archived_point_in_time");
    expect(snapshot.archive.manifest.archiveRef).toMatch(
      /^ccf:\/\/raw\/tiber\/player_identity_map_gsis_tiber\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("produces the same registry-state fingerprint regardless of database row order", () => {
    expect(fingerprintCCFNFLPlayerIdentityRegistryRows(ROWS)).toBe(
      fingerprintCCFNFLPlayerIdentityRegistryRows([...ROWS].reverse()),
    );
  });

  it("fails closed on duplicate GSIS aliases", async () => {
    const duplicate = [
      ...ROWS,
      {
        canonicalId: "legacy-other",
        tiberPlayerId: "tbr_p_01JTEST0000000000000000999",
        gsisId: "00-0039991",
        mergedInto: null,
      },
    ];

    await expect(
      materializeCCFNFLPlayerIdentityRegistrySnapshot({
        sourceRows: duplicate,
        archiveRootDir,
        capturedAt: "2026-09-16T18:00:00Z",
      }),
    ).rejects.toThrow(/duplicate gsisId 00-0039991/);
  });

  it("fails closed on duplicate resolved TIBER identities", async () => {
    const duplicate = ROWS.map((row) => ({ ...row }));
    duplicate[1].tiberPlayerId = duplicate[0].tiberPlayerId;

    await expect(
      materializeCCFNFLPlayerIdentityRegistrySnapshot({
        sourceRows: duplicate,
        archiveRootDir,
        capturedAt: "2026-09-16T18:00:00Z",
      }),
    ).rejects.toThrow(/duplicate resolved tiberPlayerId/);
  });

  it("rejects whitespace-corrupted exact identifiers rather than normalizing them", async () => {
    const dirty = ROWS.map((row) => ({ ...row }));
    dirty[0].gsisId = " 00-0039992";

    await expect(
      materializeCCFNFLPlayerIdentityRegistrySnapshot({
        sourceRows: dirty,
        archiveRootDir,
        capturedAt: "2026-09-16T18:00:00Z",
      }),
    ).rejects.toThrow(/gsisId must not contain surrounding whitespace/);
  });

  it("keeps merged rows unresolved instead of implicitly traversing to a survivor", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      sourceRows: ROWS,
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
    });
    const materialized = buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
      snapshot,
      "2026-09-16T18:01:00Z",
    );
    const merged = materialized.receipt.rows.find(
      (row) => row.sourcePlayerId === "00-0039993",
    );

    expect(merged).toMatchObject({
      status: "unresolved",
      canonicalPlayerId: null,
      bindingMethod: null,
    });
  });

  it("creates exact GSIS-to-TIBER receipt rows with snapshot evidence and no heuristic fields", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      sourceRows: ROWS,
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
    });
    const materialized = buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
      snapshot,
      "2026-09-16T18:01:00Z",
    );

    expect(materialized.receiptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(materialized.receiptRef).toMatch(
      /^ccf:\/\/nfl-player-identity\/sha256\/[a-f0-9]{64}$/,
    );
    expect(materialized.receipt.identityRegistryKnownAt).toBe(snapshot.knownAt);
    expect(materialized.receipt.rows[0].evidenceRefs).toContain(
      snapshot.archive.manifest.archiveRef,
    );
    expect(materialized.receipt.rows.find((row) => row.sourcePlayerId === "00-0039991")).toMatchObject({
      status: "resolved_exact",
      canonicalPlayerId: "tbr_p_01JTEST0000000000000000001",
      bindingMethod: "exact_external_id",
      knownAt: "2026-09-16T18:00:00Z",
    });
    for (const row of materialized.receipt.rows) {
      expect(Object.keys(row).sort()).toEqual([
        "bindingMethod",
        "canonicalPlayerId",
        "evidenceRefs",
        "knownAt",
        "sourcePlayerId",
        "status",
      ]);
    }
  });

  it("cannot use the prospective receipt before the registry snapshot was actually known", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      sourceRows: ROWS,
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
    });
    const { receipt } = buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
      snapshot,
      "2026-09-16T18:01:00Z",
    );

    const before = auditCCFNFLPlayerIdentitySubset(
      receipt,
      ["00-0039991"],
      "2026-09-16T17:59:59Z",
    );
    expect(before.resolvedCount).toBe(0);
    expect(before.blockers).toEqual(expect.arrayContaining([
      "identity_registry_known_after_as_of",
      "receipt_frozen_after_as_of",
      "00-0039991:known_after_as_of",
    ]));

    const after = auditCCFNFLPlayerIdentitySubset(
      receipt,
      ["00-0039991"],
      "2026-09-16T18:01:00Z",
    );
    expect(after.blockers).toEqual([]);
    expect(after.resolvedCount).toBe(1);
  });

  it("rejects receipt freezing before the registry snapshot knownAt", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      sourceRows: ROWS,
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
    });

    expect(() =>
      buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
        snapshot,
        "2026-09-16T17:59:59Z",
      ),
    ).toThrow(/frozenAt cannot precede snapshot knownAt/);
  });
});
