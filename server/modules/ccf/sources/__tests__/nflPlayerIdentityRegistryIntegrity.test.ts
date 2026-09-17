import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot,
  buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot,
  materializeCCFNFLPlayerIdentityRegistrySnapshot,
} from "../nflPlayerIdentityRegistrySnapshot";

describe("NFL player identity registry archive integrity", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-player-identity-integrity-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("refuses malformed GSIS aliases instead of treating arbitrary strings as source identity", async () => {
    await expect(
      materializeCCFNFLPlayerIdentityRegistrySnapshot({
        archiveRootDir,
        capturedAt: "2026-09-16T18:00:00Z",
        sourceRows: [
          {
            canonicalId: "legacy-canonical-1",
            tiberPlayerId: "tbr_p_01JTEST0000000000000000001",
            gsisId: "gsis:39991",
            mergedInto: null,
          },
        ],
      }),
    ).rejects.toThrow(/does not match the governed GSIS namespace/);
  });

  it("refuses malformed canonical TIBER IDs instead of certifying non-empty text", async () => {
    await expect(
      materializeCCFNFLPlayerIdentityRegistrySnapshot({
        archiveRootDir,
        capturedAt: "2026-09-16T18:00:00Z",
        sourceRows: [
          {
            canonicalId: "legacy-canonical-1",
            tiberPlayerId: "legacy-canonical-1",
            gsisId: "00-0039991",
            mergedInto: null,
          },
        ],
      }),
    ).rejects.toThrow(/does not match the canonical TIBER player-id format/);
  });

  it("refuses to mint a receipt after archived rows are mutated in memory", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
      sourceRows: [
        {
          canonicalId: "legacy-canonical-1",
          tiberPlayerId: "tbr_p_01JTEST0000000000000000001",
          gsisId: "00-0039991",
          mergedInto: null,
        },
      ],
    });

    snapshot.rows[0] = {
      ...snapshot.rows[0],
      tiberPlayerId: "tbr_p_01JTEST0000000000000000999",
    };

    expect(() =>
      buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
        snapshot,
        "2026-09-16T18:01:00Z",
      ),
    ).toThrow(/rows do not match immutable archived content/);
  });

  it("refuses the operator-safe receipt path after persisted archive bytes are tampered", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
      sourceRows: [
        {
          canonicalId: "legacy-canonical-1",
          tiberPlayerId: "tbr_p_01JTEST0000000000000000001",
          gsisId: "00-0039991",
          mergedInto: null,
        },
      ],
    });

    await fs.writeFile(snapshot.archive.contentPath, "tampered persisted bytes", "utf8");

    await expect(
      buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot(
        snapshot,
        "2026-09-16T18:01:00Z",
      ),
    ).rejects.toThrow(/archive content failed stored-manifest verification/);
  });

  it("refuses the operator-safe receipt path after persisted archive manifest tampering", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
      sourceRows: [
        {
          canonicalId: "legacy-canonical-1",
          tiberPlayerId: "tbr_p_01JTEST0000000000000000001",
          gsisId: "00-0039991",
          mergedInto: null,
        },
      ],
    });
    const storedManifest = JSON.parse(
      await fs.readFile(snapshot.archive.manifestPath, "utf8"),
    ) as Record<string, unknown>;
    storedManifest.parserVersion = "forged-parser-v999";
    await fs.writeFile(
      snapshot.archive.manifestPath,
      `${JSON.stringify(storedManifest, null, 2)}\n`,
      "utf8",
    );

    await expect(
      buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot(
        snapshot,
        "2026-09-16T18:01:00Z",
      ),
    ).rejects.toThrow(/stored manifest differs from supplied snapshot/);
  });

  it("refuses forged resolution counts even when row bytes are unchanged", async () => {
    const snapshot = await materializeCCFNFLPlayerIdentityRegistrySnapshot({
      archiveRootDir,
      capturedAt: "2026-09-16T18:00:00Z",
      sourceRows: [
        {
          canonicalId: "legacy-canonical-1",
          tiberPlayerId: "tbr_p_01JTEST0000000000000000001",
          gsisId: "00-0039991",
          mergedInto: null,
        },
      ],
    });

    snapshot.resolvedExactCount = 0;
    snapshot.unresolvedCount = 1;

    expect(() =>
      buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
        snapshot,
        "2026-09-16T18:01:00Z",
      ),
    ).toThrow(/resolution counts do not match rows/);
  });
});