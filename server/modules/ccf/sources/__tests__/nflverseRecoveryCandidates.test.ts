import {
  fetchNflverseInjuries,
  parseNflverseInjuriesCsv,
} from "../nflverseInjuries";
import {
  fetchNflverseSnapCounts,
  parseNflverseSnapCountsCsv,
} from "../nflverseSnapCounts";

const INJURY_CSV = [
  "season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified",
  "2026,REG,AAA,2,00-0000001,WR,Example Receiver,Example,Receiver,Hamstring,,Questionable,Hamstring,,Limited Participation,2026-09-15 12:30:00",
  "2026,REG,AAA,2,00-0000002,T,Example Tackle,Example,Tackle,Knee,,Questionable,Knee,,Full Participation,2026-09-15 12:31:00",
].join("\n");

const SNAP_CSV = [
  "game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct",
  "2026_02_BBB_AAA,202609130aaa,2026,REG,2,Example Receiver,ReceEx00,WR,AAA,BBB,52,80%,0,0%,2,10%",
  "2026_02_BBB_AAA,202609130aaa,2026,REG,2,Example Tackle,TackEx00,T,AAA,BBB,65,100%,0,0%,0,0%",
].join("\n");

describe("nflverse injury/practice candidate adapter", () => {
  it("parses current-season official-report fields while preserving upstream date_modified separately", () => {
    const rows = parseNflverseInjuriesCsv(INJURY_CSV, { season: 2026, week: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: "00-0000001",
      reportPrimaryInjury: "Hamstring",
      reportStatus: "Questionable",
      practiceStatus: "Limited Participation",
      upstreamDateModified: "2026-09-15 12:30:00",
    });
  });

  it("accepts the reactivated current-season release without backdating CCF knownAt", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(INJURY_CSV, {
        status: 200,
        headers: { etag: "fixture-etag", "last-modified": "Tue, 15 Sep 2026 12:38:18 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchNflverseInjuries({
      season: 2026,
      week: 2,
      fetchImpl,
      now: () => new Date("2026-09-16T11:30:00Z"),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(snapshot.provenance.knownAt).toBe("2026-09-16T11:30:00.000Z");
    expect(snapshot.provenance.temporalMode).toBe("current_snapshot_only");
    expect(snapshot.provenance.licenseStatus).toBe("candidate_review_required");
    expect(snapshot.provenance.licenseRef).toContain("nflverse-data/blob/main/LICENSE.md");
    expect(snapshot.provenance.availability).toBe("historical_and_current_release_assets");
    expect(snapshot.provenance.upstreamProducer).toBe("nflapi::nflapi_injuries");
    expect(snapshot.provenance.updateCadence).toBe("daily_0707_utc_sep_feb");
    expect(snapshot.rows[0].upstreamDateModified).toBe("2026-09-15 12:30:00");
  });

  it("fails closed through the ordinary fetch path when a requested release asset is absent", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response("not found", { status: 404, statusText: "Not Found" }),
    ) as unknown as typeof fetch;

    await expect(
      fetchNflverseInjuries({ season: 2027, week: 1, fetchImpl }),
    ).rejects.toThrow(/nflverse injury fetch failed: 404 Not Found/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when required injury-report columns disappear", () => {
    expect(() =>
      parseNflverseInjuriesCsv(
        "season,game_type,team,week,gsis_id,position\n2026,REG,AAA,2,00-1,WR",
        { season: 2026 },
      ),
    ).toThrow(/missing required columns/);
  });
});

describe("nflverse snap-count candidate adapter", () => {
  it("normalizes post-game snap percentages and filters to fantasy skill positions", () => {
    const rows = parseNflverseSnapCountsCsv(SNAP_CSV, { season: 2026, week: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pfrPlayerId: "ReceEx00",
      offenseSnaps: 52,
      offensePct: 0.8,
      specialTeamsPct: 0.1,
    });
  });

  it("marks fetched snap counts as current-snapshot, post-game observed evidence", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(SNAP_CSV, {
        status: 200,
        headers: { etag: "snap-etag" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchNflverseSnapCounts({
      season: 2026,
      week: 2,
      fetchImpl,
      now: () => new Date("2026-09-14T12:05:00Z"),
    });

    expect(snapshot.provenance.knownAt).toBe("2026-09-14T12:05:00.000Z");
    expect(snapshot.provenance.temporalMode).toBe("current_snapshot_only");
    expect(snapshot.provenance.evidenceTiming).toBe("post_game_observed");
    expect(snapshot.provenance.licenseStatus).toBe("candidate_review_required");
  });

  it("rejects impossible snap percentages", () => {
    const invalid = SNAP_CSV.replace("80%", "150%");
    expect(() => parseNflverseSnapCountsCsv(invalid, { season: 2026, week: 2 })).toThrow(
      /cannot exceed 100%/,
    );
  });
});
