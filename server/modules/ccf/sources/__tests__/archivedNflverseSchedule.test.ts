import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  nflverseEasternKickoffToIso,
  parseNflverseScheduleCsv,
} from "../nflverseSchedule";
import { fetchAndArchiveNflverseSchedule } from "../archivedNflverseSchedule";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

const HEADER = "game_id,season,game_type,week,gameday,gametime,away_team,home_team";
const WEEK2_CSV = [
  HEADER,
  "2026_02_TB_CIN,2026,REG,2,2026-09-20,13:00,TB,CIN",
  "2026_02_SF_LA,2026,REG,2,2026-09-20,16:25,SF,LA",
].join("\n");

describe("governed nflverse schedule candidate", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-schedule-archive-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("converts the documented Eastern wall-clock kickoff across DST and standard time", () => {
    expect(nflverseEasternKickoffToIso("2026-09-20", "13:00")).toBe(
      "2026-09-20T17:00:00.000Z",
    );
    expect(nflverseEasternKickoffToIso("2026-11-08", "13:00")).toBe(
      "2026-11-08T18:00:00.000Z",
    );
  });

  it("parses exact schedule identity and kickoff evidence without reconstructing game ids", () => {
    const rows = parseNflverseScheduleCsv(WEEK2_CSV, { season: 2026, week: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gameId: "2026_02_TB_CIN",
      season: 2026,
      gameType: "REG",
      week: 2,
      gameday: "2026-09-20",
      gametimeEt: "13:00",
      kickoffTimeZone: "America/New_York",
      kickoffAt: "2026-09-20T17:00:00.000Z",
      awayTeam: "TB",
      homeTeam: "CIN",
    });
  });

  it("fails closed when kickoff or required schedule identity fields are missing", () => {
    const missingKickoff = [
      HEADER,
      "2026_02_TB_CIN,2026,REG,2,2026-09-20,,TB,CIN",
    ].join("\n");
    expect(() => parseNflverseScheduleCsv(missingKickoff, { season: 2026, week: 2 })).toThrow(
      /gametime is missing/,
    );

    const duplicate = [
      HEADER,
      "2026_02_TB_CIN,2026,REG,2,2026-09-20,13:00,TB,CIN",
      "2026_02_TB_CIN,2026,REG,2,2026-09-20,16:25,TB,CIN",
    ].join("\n");
    expect(() => parseNflverseScheduleCsv(duplicate, { season: 2026, week: 2 })).toThrow(
      /duplicate nflverse schedule game_id/,
    );
  });

  it("archives exact bytes and treats CCF retrieval as knownAt", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(WEEK2_CSV, {
        status: 200,
        headers: {
          etag: "schedule-etag-1",
          "last-modified": "Wed, 16 Sep 2026 13:00:00 GMT",
        },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseSchedule({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T15:20:00Z"),
    });

    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.knownAt).toBe("2026-09-16T15:20:00.000Z");
    expect(snapshot.permissionState).toBe("unreviewed");
    expect(snapshot.kickoffBasis).toBe("nfldata_gameday_plus_documented_eastern_gametime");
    expect(snapshot.archive.manifest.temporalMode).toBe("archived_point_in_time");
    expect(snapshot.archive.manifest.knownAtBasis).toBe("ccf_capture");
    expect(snapshot.archive.manifest.knownAt).toBe(snapshot.knownAt);
    expect(snapshot.archive.manifest.license).toMatch(/CC BY 4\.0/);
    expect(snapshot.archive.manifest.license).toMatch(/intended-use promotion separately unreviewed/);
    expect(await fs.readFile(snapshot.archive.contentPath, "utf8")).toBe(WEEK2_CSV);

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(snapshot.archive.manifest, "2026-09-16T15:19:59Z"),
    ).toThrow(/temporally ineligible/);
  });

  it("proves kickoff corrections only through later archived captures", async () => {
    const firstCsv = [
      HEADER,
      "2026_02_TB_CIN,2026,REG,2,2026-09-20,13:00,TB,CIN",
    ].join("\n");
    const correctedCsv = [
      HEADER,
      "2026_02_TB_CIN,2026,REG,2,2026-09-20,16:25,TB,CIN",
    ].join("\n");

    const first = await fetchAndArchiveNflverseSchedule({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl: jest.fn(async () => new Response(firstCsv, { status: 200 })) as unknown as typeof fetch,
      now: () => new Date("2026-09-16T15:20:00Z"),
    });
    const second = await fetchAndArchiveNflverseSchedule({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl: jest.fn(async () => new Response(correctedCsv, { status: 200 })) as unknown as typeof fetch,
      now: () => new Date("2026-09-17T15:20:00Z"),
    });

    expect(first.rows[0].kickoffAt).toBe("2026-09-20T17:00:00.000Z");
    expect(second.rows[0].kickoffAt).toBe("2026-09-20T20:25:00.000Z");
    expect(first.archive.manifest.archiveRef).not.toBe(second.archive.manifest.archiveRef);
    expect(first.knownAt).toBe("2026-09-16T15:20:00.000Z");
    expect(second.knownAt).toBe("2026-09-17T15:20:00.000Z");
  });
});
