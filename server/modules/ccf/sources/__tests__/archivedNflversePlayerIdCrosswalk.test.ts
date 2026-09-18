import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflversePlayerIdCrosswalk } from "../archivedNflversePlayerIdCrosswalk";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

const CSV = [
  "gsis_id,pfr_id,display_name,position",
  "00-0000001,SmitJo00,John Smith,QB",
  "00-0000002,JoneJa00,James Jones,WR",
  "00-0000003,,Missing PFR,RB",
].join("\n");

describe("prospective archived nflverse PFR-GSIS identity crosswalk", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-player-id-crosswalk-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("archives exact player-registry bytes before exposing identity links", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(CSV, {
        status: 200,
        headers: {
          etag: '"players-etag"',
          "last-modified": "Tue, 15 Sep 2026 07:00:00 GMT",
        },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflversePlayerIdCrosswalk({
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T18:30:00Z"),
    });

    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows[0]).toMatchObject({
      pfrId: "JoneJa00",
      gsisId: "00-0000002",
    });
    expect(snapshot.archive.manifest).toMatchObject({
      provider: "nflverse",
      dataset: "players",
      parserVersion: "ccf-nflverse-pfr-gsis-crosswalk-v1",
      temporalMode: "archived_point_in_time",
      knownAtBasis: "ccf_capture",
      knownAt: "2026-09-16T18:30:00.000Z",
      sourceLastModified: "Tue, 15 Sep 2026 07:00:00 GMT",
      etag: '"players-etag"',
    });
    expect(snapshot.archive.manifest.archiveRef).toMatch(
      /^ccf:\/\/raw\/nflverse\/players\/sha256\/[a-f0-9]{64}$/,
    );
    expect(await fs.readFile(snapshot.archive.contentPath, "utf8")).toBe(CSV);
  });

  it("does not let Last-Modified backdate identity knowledge", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(CSV, {
        status: 200,
        headers: { "last-modified": "Tue, 15 Sep 2026 07:00:00 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflversePlayerIdCrosswalk({
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T18:30:00Z"),
    });

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T18:29:59Z",
      ),
    ).toThrow(/temporally ineligible/);
    expect(
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T18:30:00Z",
      ),
    ).toBe(snapshot.archive.manifest);
  });

  it("does not archive an unusable crosswalk", async () => {
    const unusable = [
      "gsis_id,pfr_id,display_name,position",
      "00-0000001,,John Smith,QB",
    ].join("\n");
    const fetchImpl = jest.fn(async () =>
      new Response(unusable, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      fetchAndArchiveNflversePlayerIdCrosswalk({
        archiveRootDir,
        fetchImpl,
        now: () => new Date("2026-09-16T18:30:00Z"),
      }),
    ).rejects.toThrow(/no exact PFR <-> GSIS identity rows/);

    const providerDir = path.join(archiveRootDir, "nflverse", "players");
    await expect(fs.access(providerDir)).rejects.toThrow();
  });
});
