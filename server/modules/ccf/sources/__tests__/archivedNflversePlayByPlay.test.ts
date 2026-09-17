import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflversePlayByPlay } from "../archivedNflversePlayByPlay";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

const HEADER = [
  "play_id",
  "game_id",
  "season",
  "season_type",
  "week",
  "posteam",
  "passer_player_id",
  "rusher_player_id",
  "receiver_player_id",
  "pass_attempt",
  "rush_attempt",
  "qb_dropback",
  "qb_scramble",
  "qb_kneel",
  "sack",
  "complete_pass",
  "two_point_attempt",
  "touchdown",
  "air_yards",
  "yards_after_catch",
  "yards_gained",
  "down",
  "goal_to_go",
  "yardline_100",
].join(",");

function csvRow(values: Record<string, string | number | null>): string {
  return HEADER.split(",")
    .map((column) => {
      const value = values[column];
      return value == null ? "" : String(value);
    })
    .join(",");
}

const WEEK1_ROWS = [
  csvRow({
    play_id: 10,
    game_id: "2026_01_DAL_NYG",
    season: 2026,
    season_type: "REG",
    week: 1,
    posteam: "DAL",
    passer_player_id: "00-0000001",
    receiver_player_id: "00-0000002",
    pass_attempt: 1,
    qb_dropback: 1,
    complete_pass: 1,
    air_yards: 12,
    yards_after_catch: 6,
    yards_gained: 18,
    down: 1,
    yardline_100: 24,
  }),
  csvRow({
    play_id: 20,
    game_id: "2026_01_DAL_NYG",
    season: 2026,
    season_type: "REG",
    week: 1,
    posteam: "DAL",
    rusher_player_id: "00-0000003",
    rush_attempt: 1,
    yards_gained: 7,
    down: 2,
    yardline_100: 9,
  }),
];

const PBP_CSV = [HEADER, ...WEEK1_ROWS].join("\n");

describe("prospective archived nflverse play-by-play capture", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-pbp-archive-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("archives exact source bytes before exposing derived opportunity evidence", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(PBP_CSV, {
        status: 200,
        headers: {
          etag: '"pbp-etag"',
          "last-modified": "Tue, 15 Sep 2026 18:00:00 GMT",
        },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflversePlayByPlay({
      season: 2026,
      week: 1,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T18:00:00Z"),
    });

    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.opportunities.find((row) => row.playerId === "00-0000002")).toMatchObject({
      targets: 1,
      receptions: 1,
      receivingAirYards: 12,
    });
    expect(snapshot.opportunities.find((row) => row.playerId === "00-0000003")).toMatchObject({
      opportunityCarries: 1,
      inside10Carries: 1,
    });
    expect(snapshot.archive.manifest).toMatchObject({
      provider: "nflverse",
      dataset: "play_by_play",
      parserVersion: "ccf-nflverse-play-by-play-candidate-v1",
      temporalMode: "archived_point_in_time",
      knownAtBasis: "ccf_capture",
      knownAt: "2026-09-16T18:00:00.000Z",
      sourceLastModified: "Tue, 15 Sep 2026 18:00:00 GMT",
      etag: '"pbp-etag"',
    });
    expect(snapshot.archive.manifest.archiveRef).toMatch(
      /^ccf:\/\/raw\/nflverse\/play_by_play\/sha256\/[a-f0-9]{64}$/,
    );
    expect(await fs.readFile(snapshot.archive.contentPath, "utf8")).toBe(PBP_CSV);
  });

  it("never lets source Last-Modified backdate CCF knowledge", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(PBP_CSV, {
        status: 200,
        headers: { "last-modified": "Tue, 15 Sep 2026 18:00:00 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflversePlayByPlay({
      season: 2026,
      week: 1,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T18:00:00Z"),
    });

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T17:59:59Z",
      ),
    ).toThrow(/temporally ineligible/);
    expect(
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-16T18:00:00Z",
      ),
    ).toBe(snapshot.archive.manifest);
  });

  it("does not archive a response with no eligible requested-week plays", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(PBP_CSV, { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(
      fetchAndArchiveNflversePlayByPlay({
        season: 2026,
        week: 2,
        archiveRootDir,
        fetchImpl,
        now: () => new Date("2026-09-16T18:00:00Z"),
      }),
    ).rejects.toThrow(/no eligible 2026 week 2 play-by-play rows/);

    const providerDir = path.join(archiveRootDir, "nflverse", "play_by_play");
    await expect(fs.access(providerDir)).rejects.toThrow();
  });
});
