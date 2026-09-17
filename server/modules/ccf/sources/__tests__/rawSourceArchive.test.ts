import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  CCFRawSourceArchiveError,
  archiveCCFSourceSnapshot,
  verifyCCFArchivedSourceSnapshot,
} from "../rawSourceArchive";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

describe("CCF raw source archive", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-raw-source-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("persists exact bytes and a deterministic archived point-in-time manifest", async () => {
    const content = "season,week,player\n2026,1,00-1\n";
    const archived = await archiveCCFSourceSnapshot({
      rootDir,
      provider: "nflverse",
      dataset: "injuries",
      sourceUrl: "https://example.test/injuries.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      content,
      retrievedAt: "2026-09-14T12:00:00Z",
    });

    expect(archived.manifest.temporalMode).toBe("archived_point_in_time");
    expect(archived.manifest.knownAtBasis).toBe("ccf_capture");
    expect(archived.manifest.archiveRef).toMatch(
      /^ccf:\/\/raw\/nflverse\/injuries\/sha256\/[a-f0-9]{64}$/,
    );
    expect(await fs.readFile(archived.contentPath, "utf8")).toBe(content);
    expect(
      JSON.parse(await fs.readFile(archived.manifestPath, "utf8")),
    ).toEqual(archived.manifest);
    await expect(verifyCCFArchivedSourceSnapshot(archived)).resolves.toMatchObject({
      archiveDir: archived.archiveDir,
      manifest: archived.manifest,
    });
  });

  it("is idempotent for the exact same capture identity", async () => {
    const input = {
      rootDir,
      provider: "nflverse",
      dataset: "snap_counts",
      sourceUrl: "https://example.test/snaps.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-snap-counts-candidate-v1",
      content: "game_id,player\ng1,p1\n",
      retrievedAt: "2026-09-14T12:05:00Z",
    } as const;

    const first = await archiveCCFSourceSnapshot(input);
    const second = await archiveCCFSourceSnapshot(input);

    expect(second.archiveDir).toBe(first.archiveDir);
    expect(second.manifest).toEqual(first.manifest);
  });

  it("creates a distinct archive identity for a later retrieval of identical bytes", async () => {
    const base = {
      rootDir,
      provider: "nflverse",
      dataset: "injuries",
      sourceUrl: "https://example.test/injuries.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      content: "same bytes",
    } as const;

    const first = await archiveCCFSourceSnapshot({
      ...base,
      retrievedAt: "2026-09-14T12:00:00Z",
    });
    const second = await archiveCCFSourceSnapshot({
      ...base,
      retrievedAt: "2026-09-14T13:00:00Z",
    });

    expect(second.archiveDir).not.toBe(first.archiveDir);
    expect(second.manifest.contentSha256).toBe(first.manifest.contentSha256);
    expect(second.manifest.archiveRef).not.toBe(first.manifest.archiveRef);
  });

  it("detects tampering instead of silently overwriting an existing archive", async () => {
    const input = {
      rootDir,
      provider: "nflverse",
      dataset: "injuries",
      sourceUrl: "https://example.test/injuries.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-injuries-candidate-v1",
      content: "original bytes",
      retrievedAt: "2026-09-14T12:00:00Z",
    } as const;

    const archived = await archiveCCFSourceSnapshot(input);
    await fs.writeFile(archived.contentPath, "tampered bytes", "utf8");

    await expect(verifyCCFArchivedSourceSnapshot(archived)).rejects.toThrow(
      CCFRawSourceArchiveError,
    );
    await expect(archiveCCFSourceSnapshot(input)).rejects.toThrow(
      CCFRawSourceArchiveError,
    );
  });

  it("rejects a persisted manifest that no longer matches the archived snapshot object", async () => {
    const archived = await archiveCCFSourceSnapshot({
      rootDir,
      provider: "nflverse",
      dataset: "injuries",
      sourceUrl: "https://example.test/injuries.csv",
      license: "CC-BY-4.0",
      parserVersion: "candidate-v1",
      content: "original bytes",
      retrievedAt: "2026-09-14T12:00:00Z",
    });
    const forged = { ...archived.manifest, parserVersion: "forged-v999" };
    await fs.writeFile(archived.manifestPath, `${JSON.stringify(forged, null, 2)}\n`, "utf8");

    await expect(verifyCCFArchivedSourceSnapshot(archived)).rejects.toThrow(
      /stored manifest differs from supplied snapshot/,
    );
  });

  it("rejects path substitution even when the supplied manifest object is unchanged", async () => {
    const archived = await archiveCCFSourceSnapshot({
      rootDir,
      provider: "nflverse",
      dataset: "injuries",
      sourceUrl: "https://example.test/injuries.csv",
      license: "CC-BY-4.0",
      parserVersion: "candidate-v1",
      content: "original bytes",
      retrievedAt: "2026-09-14T12:00:00Z",
    });

    await expect(
      verifyCCFArchivedSourceSnapshot({
        ...archived,
        contentPath: path.join(archived.archiveDir, "other.raw"),
      }),
    ).rejects.toThrow(/contentPath does not match archiveDir/);
  });

  it("supports provider-archive historical knownAt only with explicit proof", async () => {
    const archived = await archiveCCFSourceSnapshot({
      rootDir,
      provider: "licensed-provider",
      dataset: "game_roster",
      sourceUrl: "https://example.test/game-roster.json",
      license: "licensed-evaluation-fixture",
      parserVersion: "candidate-v1",
      content: '{"players":[]}',
      retrievedAt: "2026-09-14T18:00:00Z",
      knownAtBasis: "provider_archive_proven",
      sourceVersionKnownAt: "2025-09-07T15:40:00Z",
      knownAtProofRef: "provider://archive/change-log/game-1/version-3",
    });

    expect(archived.manifest.knownAt).toBe("2025-09-07T15:40:00Z");
    expect(archived.manifest.knownAtBasis).toBe("provider_archive_proven");
    expect(
      assertCCFSourceSnapshotEligibleAt(archived.manifest, "2025-09-07T16:00:00Z"),
    ).toBe(archived.manifest);
  });

  it("rejects empty source bytes", async () => {
    await expect(
      archiveCCFSourceSnapshot({
        rootDir,
        provider: "nflverse",
        dataset: "injuries",
        sourceUrl: "https://example.test/injuries.csv",
        license: "CC-BY-4.0",
        parserVersion: "candidate-v1",
        content: "",
        retrievedAt: "2026-09-14T12:00:00Z",
      }),
    ).rejects.toThrow(/must not be empty/);
  });
});