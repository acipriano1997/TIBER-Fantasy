import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseWeeklyPlayerStats } from "../archivedNflverseWeeklyPlayerStats";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

const HEADER = [
  "player_id",
  "player_display_name",
  "position",
  "season",
  "week",
  "season_type",
  "team",
  "opponent_team",
  "completions",
  "attempts",
  "passing_yards",
  "passing_tds",
  "passing_interceptions",
  "sacks_suffered",
  "passing_2pt_conversions",
  "carries",
  "rushing_yards",
  "rushing_tds",
  "rushing_2pt_conversions",
  "receptions",
  "targets",
  "receiving_yards",
  "receiving_tds",
  "receiving_2pt_conversions",
  "fumbles_lost_total",
  "special_teams_tds",
].join(",");

const WR_ROW = [
  "00-0000001",
  "Fixture Receiver",
  "WR",
  "2026",
  "2",
  "REG",
  "DAL",
  "NYG",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "1",
  "4",
  "0",
  "0",
  "7",
  "10",
  "91",
  "1",
  "0",
  "1",
  "1",
].join(",");

const WEEKLY_STATS_CSV = `${HEADER}\n${WR_ROW}\n`;

describe("prospective archived nflverse weekly player-stat capture", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-weekly-stats-archive-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("archives exact source bytes and exposes complete parsed scoring evidence", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(WEEKLY_STATS_CSV, {
        status: 200,
        headers: {
          etag: '"weekly-stats-etag"',
          "last-modified": "Tue, 15 Sep 2026 09:00:00 GMT",
        },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseWeeklyPlayerStats({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T16:30:00Z"),
    });

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({
      playerId: "00-0000001",
      position: "WR",
      receptions: 7,
      targets: 10,
      receivingYards: 91,
      receivingTouchdowns: 1,
      fumblesLostTotal: 1,
      specialTeamsTouchdowns: 1,
    });
    expect(snapshot.knownAt).toBe("2026-09-16T16:30:00.000Z");
    expect(snapshot.archive.manifest).toMatchObject({
      provider: "nflverse",
      dataset: "stats_player_week",
      parserVersion: "ccf-nflverse-player-stats-v2",
      temporalMode: "archived_point_in_time",
      knownAtBasis: "ccf_capture",
      knownAt: "2026-09-16T16:30:00.000Z",
      sourceLastModified: "Tue, 15 Sep 2026 09:00:00 GMT",
      etag: '"weekly-stats-etag"',
    });
    expect(snapshot.archive.manifest.archiveRef).toMatch(
      /^ccf:\/\/raw\/nflverse\/stats_player_week\/sha256\/[a-f0-9]{64}$/,
    );
    expect(await fs.readFile(snapshot.archive.contentPath, "utf8")).toBe(WEEKLY_STATS_CSV);
  });

  it("never lets Last-Modified backdate CCF knowledge", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(WEEKLY_STATS_CSV, {
        status: 200,
        headers: { "last-modified": "Tue, 15 Sep 2026 09:00:00 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseWeeklyPlayerStats({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T16:30:00Z"),
    });

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T16:29:59Z",
      ),
    ).toThrow(/temporally ineligible/);
    expect(
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T16:30:00Z",
      ),
    ).toBe(snapshot.archive.manifest);
  });

  it("does not archive a response that has no eligible offensive fantasy rows", async () => {
    const noEligibleRows = WEEKLY_STATS_CSV.replace(",WR,", ",LB,");
    const fetchImpl = jest.fn(async () =>
      new Response(noEligibleRows, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      fetchAndArchiveNflverseWeeklyPlayerStats({
        season: 2026,
        week: 2,
        archiveRootDir,
        fetchImpl,
        now: () => new Date("2026-09-16T16:30:00Z"),
      }),
    ).rejects.toThrow(/no eligible 2026 week 2 QB\/RB\/WR\/TE rows/);

    const providerDir = path.join(archiveRootDir, "nflverse", "stats_player_week");
    await expect(fs.access(providerDir)).rejects.toThrow();
  });
});
