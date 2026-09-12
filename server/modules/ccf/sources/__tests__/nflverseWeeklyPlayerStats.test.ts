import {
  CCFNflverseSourceError,
  fetchNflverseWeeklyPlayerStats,
  nflverseWeeklyPlayerStatsUrl,
  parseNflverseWeeklyPlayerStatsCsv,
} from "../nflverseWeeklyPlayerStats";

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
  "passing_air_yards",
  "passing_epa",
  "passing_cpoe",
  "passing_2pt_conversions",
  "carries",
  "rushing_yards",
  "rushing_tds",
  "rushing_fumbles_lost",
  "rushing_first_downs",
  "rushing_epa",
  "rushing_2pt_conversions",
  "receptions",
  "targets",
  "receiving_yards",
  "receiving_tds",
  "receiving_fumbles_lost",
  "receiving_air_yards",
  "receiving_yards_after_catch",
  "receiving_first_downs",
  "receiving_epa",
  "receiving_2pt_conversions",
  "fantasy_points",
  "fantasy_points_ppr",
].join(",");

const WR_ROW = [
  "00-0000001",
  "Fixture Receiver",
  "WR",
  "2026",
  "1",
  "REG",
  "DAL",
  "PHI",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "0",
  "7",
  "10",
  "91",
  "1",
  "0",
  "114",
  "22",
  "5",
  "4.2",
  "0",
  "15.1",
  "22.1",
].join(",");

const POST_ROW = WR_ROW.replace(",REG,", ",POST,").replace(",1,REG,", ",2,POST,");

const DEF_ROW = WR_ROW.replace(",WR,", ",LB,").replace("00-0000001", "00-0000002");

const CSV = `${HEADER}\n${WR_ROW}\n${POST_ROW}\n${DEF_ROW}\n`;

describe("nflverse weekly player stats source", () => {
  it("uses the official nflverse weekly player stats release path", () => {
    expect(nflverseWeeklyPlayerStatsUrl(2026)).toBe(
      "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
    );
  });

  it("parses only eligible regular-season offensive fantasy positions", () => {
    const rows = parseNflverseWeeklyPlayerStatsCsv(CSV, {
      season: 2026,
      week: 1,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: "00-0000001",
      playerName: "Fixture Receiver",
      position: "WR",
      team: "DAL",
      opponentTeam: "PHI",
      receptions: 7,
      targets: 10,
      receivingYards: 91,
      receivingTouchdowns: 1,
      receivingAirYards: 114,
      receivingEpa: 4.2,
      fantasyPointsPpr: 22.1,
    });
    expect(rows[0].passingCpoe).toBeNull();
  });

  it("fails closed when the upstream schema loses a required field", () => {
    const broken = CSV.replace("targets,", "targets_removed,");

    expect(() =>
      parseNflverseWeeklyPlayerStatsCsv(broken, { season: 2026, week: 1 }),
    ).toThrow(CCFNflverseSourceError);
  });

  it("records retrieval-time provenance and current-snapshot-only semantics", async () => {
    const headers = new Headers({
      etag: '"fixture-etag"',
      "last-modified": "Thu, 10 Sep 2026 18:25:51 GMT",
    });
    const fetchImpl = jest.fn(async () =>
      new Response(CSV, {
        status: 200,
        headers,
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchNflverseWeeklyPlayerStats({
      season: 2026,
      week: 1,
      fetchImpl,
      now: () => new Date("2026-09-11T12:00:00.000Z"),
    });

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.provenance).toEqual({
      provider: "nflverse",
      dataset: "stats_player_week",
      license: "CC-BY-4.0",
      sourceUrl:
        "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
      retrievedAt: "2026-09-11T12:00:00.000Z",
      knownAt: "2026-09-11T12:00:00.000Z",
      etag: '"fixture-etag"',
      lastModified: "Thu, 10 Sep 2026 18:25:51 GMT",
      temporalMode: "current_snapshot_only",
    });
  });

  it("fails rather than returning an apparently valid empty snapshot", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(HEADER + "\n", {
        status: 200,
      }),
    ) as unknown as typeof fetch;

    await expect(
      fetchNflverseWeeklyPlayerStats({
        season: 2026,
        week: 1,
        fetchImpl,
      }),
    ).rejects.toThrow(CCFNflverseSourceError);
  });
});
