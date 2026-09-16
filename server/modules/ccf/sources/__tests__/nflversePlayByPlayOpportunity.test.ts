import {
  buildNflversePbpOpportunitySnapshot,
  fetchNflversePbpOpportunity,
  nflversePlayByPlayCsvUrl,
  parseNflversePbpOpportunityCsv,
  summarizeNflversePbpOpportunities,
} from "../nflversePlayByPlayOpportunity";

const HEADER = [
  "game_id",
  "play_id",
  "season",
  "season_type",
  "week",
  "play_type",
  "posteam",
  "passer_player_id",
  "receiver_player_id",
  "rusher_player_id",
  "pass_attempt",
  "rush_attempt",
  "complete_pass",
  "qb_dropback",
  "two_point_attempt",
].join(",");

const CSV = [
  HEADER,
  "2026_01_DAL_PHI,10,2026,REG,1,pass,DAL,QB1,WR1,,1,0,0,1,0",
  "2026_01_DAL_PHI,20,2026,REG,1,pass,DAL,QB1,WR1,,1,0,1,1,0",
  "2026_01_DAL_PHI,30,2026,REG,1,run,DAL,,,RB1,0,1,0,0,0",
  "2026_01_DAL_PHI,40,2026,REG,1,no_play,DAL,QB1,WR1,,1,0,0,1,0",
  "2026_01_DAL_PHI,50,2026,REG,1,pass,DAL,QB1,WR2,,1,0,1,1,1",
  "2026_02_NYG_DAL,10,2026,REG,2,run,DAL,,,RB1,0,1,0,0,0",
  "2026_WC_DAL_PHI,10,2026,POST,19,pass,DAL,QB1,WR1,,1,0,1,1,0",
  "2025_01_DAL_PHI,10,2025,REG,1,pass,DAL,QB1,WR1,,1,0,1,1,0",
].join("\n");

function snapshot() {
  return buildNflversePbpOpportunitySnapshot({
    season: 2026,
    week: 1,
    plays: parseNflversePbpOpportunityCsv(CSV, 2026, 1),
    retrievedAt: "2026-09-16T15:30:00.000Z",
    etag: '"pbp-etag"',
    lastModified: "Wed, 16 Sep 2026 15:25:00 GMT",
  });
}

describe("nflverse play-by-play opportunity source", () => {
  it("uses the canonical nflverse release URL for the requested season", () => {
    expect(nflversePlayByPlayCsvUrl(2026)).toBe(
      "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2026.csv",
    );
  });

  it("parses only requested regular-season week rows with source IDs and documented opportunity flags", () => {
    const plays = parseNflversePbpOpportunityCsv(CSV, 2026, 1);
    expect(plays).toHaveLength(5);
    expect(plays[0]).toMatchObject({
      gameId: "2026_01_DAL_PHI",
      playId: 10,
      season: 2026,
      seasonType: "REG",
      week: 1,
      playType: "pass",
      possessionTeam: "DAL",
      passerSourcePlayerId: "QB1",
      targetedReceiverSourcePlayerId: "WR1",
      passAttempt: true,
      completePass: false,
      qbDropback: true,
      twoPointAttempt: false,
    });
  });

  it("summarizes carries, targets and receptions while excluding nullified plays and separating two-point chances", () => {
    const summary = summarizeNflversePbpOpportunities(snapshot());
    expect(summary).toEqual([
      {
        sourcePlayerId: "RB1",
        teams: ["DAL"],
        carries: 1,
        targets: 0,
        receptions: 0,
        twoPointCarries: 0,
        twoPointTargets: 0,
      },
      {
        sourcePlayerId: "WR1",
        teams: ["DAL"],
        carries: 0,
        targets: 2,
        receptions: 1,
        twoPointCarries: 0,
        twoPointTargets: 0,
      },
      {
        sourcePlayerId: "WR2",
        teams: ["DAL"],
        carries: 0,
        targets: 0,
        receptions: 0,
        twoPointCarries: 0,
        twoPointTargets: 1,
      },
    ]);
  });

  it("keeps a not-yet-observed week explicit instead of treating zero rows as zero opportunity", () => {
    const source = buildNflversePbpOpportunitySnapshot({
      season: 2026,
      week: 3,
      plays: parseNflversePbpOpportunityCsv(CSV, 2026, 3),
      retrievedAt: "2026-09-16T15:30:00.000Z",
    });
    expect(source.coverageState).toBe("no_rows");
    expect(source.plays).toEqual([]);
    expect(summarizeNflversePbpOpportunities(source)).toEqual([]);
  });

  it("fails closed on schema drift, malformed flags and duplicate play identities", () => {
    expect(() => parseNflversePbpOpportunityCsv("game_id,season\na,2026", 2026, 1)).toThrow(
      /schema missing required columns/,
    );
    const malformed = CSV.replace(",1,0,0,1,0", ",maybe,0,0,1,0");
    expect(() => parseNflversePbpOpportunityCsv(malformed, 2026, 1)).toThrow(/pass_attempt must be binary/);
    const duplicate = [HEADER, CSV.split("\n")[1], CSV.split("\n")[1]].join("\n");
    expect(() => parseNflversePbpOpportunityCsv(duplicate, 2026, 1)).toThrow(/duplicate play/);
  });

  it("fetches a current snapshot with explicit source namespace and point-in-time limitation", async () => {
    const fetchImpl = jest.fn(async () => new Response(CSV, {
      status: 200,
      headers: {
        etag: '"pbp-etag"',
        "last-modified": "Wed, 16 Sep 2026 15:25:00 GMT",
      },
    })) as unknown as typeof fetch;
    const source = await fetchNflversePbpOpportunity({
      season: 2026,
      week: 1,
      fetchImpl,
      now: () => new Date("2026-09-16T15:30:00.000Z"),
    });
    expect(fetchImpl).toHaveBeenCalledWith(nflversePlayByPlayCsvUrl(2026), expect.objectContaining({ method: "GET" }));
    expect(source.coverageState).toBe("observed");
    expect(source.provenance).toMatchObject({
      provider: "nflverse",
      dataset: "nflfastR_play_by_play",
      releaseTag: "pbp",
      knownAt: "2026-09-16T15:30:00.000Z",
      temporalMode: "current_snapshot_only",
      identityNamespace: "nflverse_source_player_id",
    });
  });

  it("fails closed on fetch errors without manufacturing opportunity evidence", async () => {
    const badFetch = jest.fn(async () => new Response("nope", { status: 503, statusText: "Unavailable" })) as unknown as typeof fetch;
    await expect(fetchNflversePbpOpportunity({ season: 2026, week: 1, fetchImpl: badFetch })).rejects.toThrow(
      /503 Unavailable/,
    );
  });
});
