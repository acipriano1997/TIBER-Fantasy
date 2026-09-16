import {
  CCF_NFLVERSE_SCHEDULE_TIME_ZONE,
  CCF_NFLVERSE_SCHEDULE_URL,
  buildNflverseScheduleSnapshot,
  deriveNflverseScheduleLockState,
  fetchNflverseSchedule,
  nflverseEasternKickoffToUtc,
  parseNflverseScheduleCsv,
  resolveNflverseTeamWeekSchedule,
} from "../nflverseSchedule";

const HEADER = "game_id,season,game_type,week,gameday,gametime,away_team,home_team";
const CSV = [
  HEADER,
  "2026_01_DAL_PHI,2026,REG,1,2026-09-10,20:20,DAL,PHI",
  "2026_01_KC_LAC,2026,REG,1,2026-09-11,20:15,KC,LAC",
  "2026_02_NYG_DAL,2026,REG,2,2026-09-20,13:00,NYG,DAL",
  "2026_02_KC_PHI,2026,REG,2,2026-09-20,16:25,KC,PHI",
  "2026_14_KC_CIN,2026,REG,14,2026-12-13,16:25,KC,CIN",
  "2026_WC_X_Y,2026,WC,19,2027-01-16,16:30,X,Y",
  "2025_01_DAL_PHI,2025,REG,1,2025-09-04,20:20,DAL,PHI",
].join("\n");

function snapshot() {
  return buildNflverseScheduleSnapshot({
    season: 2026,
    games: parseNflverseScheduleCsv(CSV, 2026),
    retrievedAt: "2026-09-16T14:00:00.000Z",
    etag: '"schedule-etag"',
    lastModified: "Wed, 16 Sep 2026 13:55:00 GMT",
  });
}

describe("nflverse schedule source", () => {
  it("converts documented Eastern kickoff times to exact UTC across EDT and EST", () => {
    expect(nflverseEasternKickoffToUtc("2026-09-10", "20:20")).toBe("2026-09-11T00:20:00.000Z");
    expect(nflverseEasternKickoffToUtc("2026-12-13", "16:25")).toBe("2026-12-13T21:25:00.000Z");
  });

  it("parses only the requested regular season and preserves deterministic kickoff order", () => {
    const games = parseNflverseScheduleCsv(CSV, 2026);
    expect(games).toHaveLength(5);
    expect(games[0]).toMatchObject({
      gameId: "2026_01_DAL_PHI",
      season: 2026,
      gameType: "REG",
      week: 1,
      gameday: "2026-09-10",
      gametimeEastern: "20:20",
      kickoffAt: "2026-09-11T00:20:00.000Z",
      awayTeam: "DAL",
      homeTeam: "PHI",
    });
    expect(games.some((game) => game.gameId === "2026_WC_X_Y")).toBe(false);
  });

  it("derives scheduled and bye states only from a season snapshot with known team/week coverage", () => {
    const source = snapshot();
    expect(resolveNflverseTeamWeekSchedule(source, "DAL", 2)).toMatchObject({
      state: "scheduled",
      team: "DAL",
      week: 2,
    });
    expect(resolveNflverseTeamWeekSchedule(source, "LAC", 2)).toEqual({
      state: "bye",
      team: "LAC",
      week: 2,
      game: null,
    });
    expect(resolveNflverseTeamWeekSchedule(source, "ZZZ", 2)).toEqual({
      state: "unknown",
      team: "ZZZ",
      week: 2,
      game: null,
      reason: "unknown_team",
    });
    expect(resolveNflverseTeamWeekSchedule(source, "DAL", 3)).toEqual({
      state: "unknown",
      team: "DAL",
      week: 3,
      game: null,
      reason: "week_not_present",
    });
  });

  it("derives lock state from the absolute kickoff and exact decision as-of", () => {
    const scheduled = resolveNflverseTeamWeekSchedule(snapshot(), "DAL", 1);
    expect(deriveNflverseScheduleLockState(scheduled, "2026-09-11T00:19:59.999Z")).toBe("unlocked");
    expect(deriveNflverseScheduleLockState(scheduled, "2026-09-11T00:20:00.000Z")).toBe("locked");
    expect(deriveNflverseScheduleLockState(scheduled, "not-a-timestamp")).toBe("unknown");
  });

  it("fails closed on schedule schema drift and duplicate game identifiers", () => {
    expect(() => parseNflverseScheduleCsv("game_id,season\na,2026", 2026)).toThrow(/schema missing required columns/);
    const duplicate = [HEADER, CSV.split("\n")[1], CSV.split("\n")[1]].join("\n");
    expect(() => parseNflverseScheduleCsv(duplicate, 2026)).toThrow(/duplicate game_id/);
  });

  it("fetches the current snapshot with explicit point-in-time limitations and source metadata", async () => {
    const fetchImpl = jest.fn(async () => new Response(CSV, {
      status: 200,
      headers: {
        etag: '"schedule-etag"',
        "last-modified": "Wed, 16 Sep 2026 13:55:00 GMT",
      },
    })) as unknown as typeof fetch;
    const source = await fetchNflverseSchedule({
      season: 2026,
      fetchImpl,
      now: () => new Date("2026-09-16T14:00:00.000Z"),
    });
    expect(fetchImpl).toHaveBeenCalledWith(CCF_NFLVERSE_SCHEDULE_URL, expect.objectContaining({ method: "GET" }));
    expect(source.contractVersion).toBe("ccf-nflverse-schedule-v1");
    expect(source.provenance).toMatchObject({
      provider: "nflverse",
      dataset: "nfldata_games",
      sourceUrl: CCF_NFLVERSE_SCHEDULE_URL,
      knownAt: "2026-09-16T14:00:00.000Z",
      temporalMode: "current_snapshot_only",
      kickoffTimeBasis: CCF_NFLVERSE_SCHEDULE_TIME_ZONE,
    });
    expect(source.teams).toEqual(["CIN", "DAL", "KC", "LAC", "NYG", "PHI"]);
  });

  it("fails closed when the source fetch fails or the selected season has no regular-season rows", async () => {
    const badFetch = jest.fn(async () => new Response("nope", { status: 503, statusText: "Unavailable" })) as unknown as typeof fetch;
    await expect(fetchNflverseSchedule({ season: 2026, fetchImpl: badFetch })).rejects.toThrow(/503 Unavailable/);

    const emptyFetch = jest.fn(async () => new Response([HEADER, "2025_01_DAL_PHI,2025,REG,1,2025-09-04,20:20,DAL,PHI"].join("\n"), { status: 200 })) as unknown as typeof fetch;
    await expect(fetchNflverseSchedule({ season: 2026, fetchImpl: emptyFetch })).rejects.toThrow(/no regular-season games/);
  });
});
