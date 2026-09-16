import {
  aggregateNflverseFantasyOpportunity,
  fetchNflversePlayByPlay,
  nflversePlayByPlayUrl,
  parseNflversePlayByPlayCsv,
} from "../nflversePlayByPlay";

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
  const columns = HEADER.split(",");
  return columns.map((column) => {
    const value = values[column];
    return value == null ? "" : String(value);
  }).join(",");
}

function fixtureCsv(): string {
  return [
    HEADER,
    csvRow({
      play_id: 10, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", passer_player_id: "QB1", receiver_player_id: "WR1",
      pass_attempt: 1, qb_dropback: 1, complete_pass: 1, air_yards: 10,
      yards_after_catch: 5, yards_gained: 15, down: 1, yardline_100: 15,
    }),
    csvRow({
      play_id: 20, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", rusher_player_id: "RB1", rush_attempt: 1,
      yards_gained: 6, down: 1, yardline_100: 8,
    }),
    csvRow({
      play_id: 30, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", passer_player_id: "QB1", receiver_player_id: "WR1",
      pass_attempt: 1, qb_dropback: 1, complete_pass: 0, air_yards: 6,
      yards_gained: 0, down: 2, yardline_100: 4,
    }),
    csvRow({
      play_id: 40, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", passer_player_id: "QB1", receiver_player_id: "WR2",
      pass_attempt: 1, qb_dropback: 1, complete_pass: 1, air_yards: 4,
      yards_after_catch: 3, yards_gained: 7, down: 3, yardline_100: 40,
    }),
    csvRow({
      play_id: 50, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", rusher_player_id: "QB1", rush_attempt: 1, qb_kneel: 1,
      yards_gained: -1, down: 1, yardline_100: 70,
    }),
    csvRow({
      play_id: 60, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", passer_player_id: "QB1", receiver_player_id: "WR1",
      pass_attempt: 1, qb_dropback: 1, complete_pass: 1, two_point_attempt: 1,
      yards_gained: 2, yardline_100: 2,
    }),
    csvRow({
      play_id: 70, game_id: "2026_01_AAA_BBB", season: 2026, season_type: "REG", week: 1,
      posteam: "AAA", passer_player_id: "QB1", sack: 1, qb_dropback: 1,
      yards_gained: -7, down: 2, yardline_100: 55,
    }),
    csvRow({
      play_id: 80, game_id: "2026_02_AAA_CCC", season: 2026, season_type: "REG", week: 2,
      posteam: "AAA", rusher_player_id: "RB1", rush_attempt: 1, yards_gained: 5,
      down: 1, yardline_100: 50,
    }),
    csvRow({
      play_id: 90, game_id: "2026_20_AAA_DDD", season: 2026, season_type: "POST", week: 20,
      posteam: "AAA", rusher_player_id: "RB1", rush_attempt: 1, yards_gained: 5,
      down: 1, yardline_100: 50,
    }),
  ].join("\n");
}

describe("nflverse play-by-play source", () => {
  it("uses the documented nflverse-data PBP release URL", () => {
    expect(nflversePlayByPlayUrl(2026)).toBe(
      "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv",
    );
    expect(() => nflversePlayByPlayUrl(1998)).toThrow(/season must be an integer/);
  });

  it("parses regular-season plays and honors the requested week", () => {
    const rows = parseNflversePlayByPlayCsv(fixtureCsv(), { season: 2026, week: 1 });
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      playId: 10,
      gameId: "2026_01_AAA_BBB",
      season: 2026,
      week: 1,
      offenseTeam: "AAA",
      passerPlayerId: "QB1",
      receiverPlayerId: "WR1",
      passAttempt: true,
      completePass: true,
      yardline100: 15,
    });
    expect(rows.some((row) => row.week === 2 || row.seasonType === "POST")).toBe(false);
  });

  it("fails closed when the upstream schema loses a required opportunity column", () => {
    const csv = fixtureCsv().replace("receiver_player_id,", "");
    expect(() => parseNflversePlayByPlayCsv(csv, { season: 2026, week: 1 })).toThrow(
      /schema missing required columns: receiver_player_id/,
    );
  });

  it("derives targets, high-value touches, dropbacks, and team shares without counting kneels or two-point tries as normal volume", () => {
    const rows = parseNflversePlayByPlayCsv(fixtureCsv(), { season: 2026, week: 1 });
    const summaries = aggregateNflverseFantasyOpportunity(rows);

    const wr1 = summaries.find((row) => row.playerId === "WR1")!;
    expect(wr1).toMatchObject({
      targets: 2,
      receptions: 1,
      receivingAirYards: 16,
      redZoneTargets: 2,
      inside10Targets: 1,
      goalLineTargets: 1,
      twoPointOpportunities: 1,
      teamTargets: 3,
    });
    expect(wr1.targetShare).toBeCloseTo(2 / 3);

    const rb1 = summaries.find((row) => row.playerId === "RB1")!;
    expect(rb1).toMatchObject({
      opportunityCarries: 1,
      redZoneCarries: 1,
      inside10Carries: 1,
      goalLineCarries: 0,
      teamOpportunityCarries: 1,
    });
    expect(rb1.carryShare).toBe(1);

    const qb1 = summaries.find((row) => row.playerId === "QB1")!;
    expect(qb1).toMatchObject({
      dropbacks: 5,
      passAttempts: 3,
      sacks: 1,
      opportunityCarries: 0,
      twoPointOpportunities: 1,
      teamOpportunityCarries: 1,
    });
  });

  it("preserves current-snapshot provenance and derives opportunity in one fetch", async () => {
    const fetchImpl = jest.fn(async () => new Response(fixtureCsv(), {
      status: 200,
      headers: {
        etag: '"pbp-fixture"',
        "last-modified": "Tue, 15 Sep 2026 18:00:00 GMT",
      },
    }));
    const snapshot = await fetchNflversePlayByPlay({
      season: 2026,
      week: 1,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-09-15T18:30:00Z"),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      nflversePlayByPlayUrl(2026),
      expect.objectContaining({ method: "GET", redirect: "follow" }),
    );
    expect(snapshot.rows).toHaveLength(7);
    expect(snapshot.opportunities.find((row) => row.playerId === "WR1")?.targets).toBe(2);
    expect(snapshot.provenance).toEqual(expect.objectContaining({
      provider: "nflverse",
      dataset: "play_by_play",
      license: "CC-BY-4.0",
      knownAt: "2026-09-15T18:30:00.000Z",
      temporalMode: "current_snapshot_only",
      evidenceTiming: "post_play_observed",
      etag: '"pbp-fixture"',
    }));
  });
});
