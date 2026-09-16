import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseInjuries } from "../archivedNflverseInjuries";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

const INJURY_CSV = [
  "season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified",
  "2026,REG,AAA,2,00-0000001,WR,Example Receiver,Example,Receiver,Hamstring,,Questionable,Hamstring,,Limited Participation,2026-09-15 12:30:00",
].join("\n");

describe("prospective archived nflverse injury/practice capture", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-injury-archive-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("archives the exact fetched bytes before exposing parsed injury evidence", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(INJURY_CSV, {
        status: 200,
        headers: {
          etag: "injury-etag",
          "last-modified": "Tue, 15 Sep 2026 12:38:18 GMT",
        },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseInjuries({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T11:30:00Z"),
    });

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      playerId: "00-0000001",
      reportStatus: "Questionable",
      practiceStatus: "Limited Participation",
      upstreamDateModified: "2026-09-15 12:30:00",
    });
    expect(snapshot.knownAt).toBe("2026-09-16T11:30:00.000Z");
    expect(snapshot.archive.manifest.temporalMode).toBe("archived_point_in_time");
    expect(snapshot.archive.manifest.knownAtBasis).toBe("ccf_capture");
    expect(snapshot.archive.manifest.knownAt).toBe(snapshot.knownAt);
    expect(snapshot.archive.manifest.archiveRef).toMatch(
      /^ccf:\/\/raw\/nflverse\/injuries\/sha256\/[a-f0-9]{64}$/,
    );
    expect(snapshot.archive.manifest.sourceLastModified).toBe(
      "Tue, 15 Sep 2026 12:38:18 GMT",
    );
    expect(await fs.readFile(snapshot.archive.contentPath, "utf8")).toBe(INJURY_CSV);
  });

  it("does not let Last-Modified or row date_modified backdate CCF knowledge", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(INJURY_CSV, {
        status: 200,
        headers: { "last-modified": "Tue, 15 Sep 2026 12:38:18 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseInjuries({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T11:30:00Z"),
    });

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T11:29:59Z",
      ),
    ).toThrow(/temporally ineligible/);
    expect(
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T11:30:00Z",
      ),
    ).toBe(snapshot.archive.manifest);
  });

  it("does not archive an unusable response with no eligible fantasy rows", async () => {
    const noEligibleRows = INJURY_CSV.replace(
      "00-0000001,WR",
      "00-0000001,T",
    );
    const fetchImpl = jest.fn(async () => new Response(noEligibleRows, { status: 200 })) as unknown as typeof fetch;

    await expect(
      fetchAndArchiveNflverseInjuries({
        season: 2026,
        week: 2,
        archiveRootDir,
        fetchImpl,
        now: () => new Date("2026-09-16T11:30:00Z"),
      }),
    ).rejects.toThrow(/no eligible 2026 week 2 injury rows/);

    const providerDir = path.join(archiveRootDir, "nflverse", "injuries");
    await expect(fs.access(providerDir)).rejects.toThrow();
  });
});
