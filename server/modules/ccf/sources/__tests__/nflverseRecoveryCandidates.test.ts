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
  "2024,REG,AAA,2,00-0000001,WR,Example Receiver,Example,Receiver,Hamstring,,Questionable,Hamstring,,Limited Participation,2024-09-10 20:30:00",
  "2024,REG,AAA,2,00-0000002,T,Example Tackle,Example,Tackle,Knee,,Questionable,Knee,,Full Participation,2024-09-10 20:31:00",
].join("\n");

const SNAP_CSV = [
  "game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct",
  "2026_02_BBB_AAA,202609130aaa,2026,REG,2,Example Receiver,ReceEx00,WR,AAA,BBB,52,80%,0,0%,2,10%",
  "2026_02_BBB_AAA,202609130aaa,2026,REG,2,Example Tackle,TackEx00,T,AAA,BBB,65,100%,0,0%,0,0%",
].join("\n");

describe("nflverse historical injury/practice adapter", () => {
  it("parses official-report fields while preserving upstream date_modified separately", () => {
    const rows = parseNflverseInjuriesCsv(INJURY_CSV, { season: 2024, week: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: "00-0000001",
      reportPrimaryInjury: "Hamstring",
      reportStatus: "Questionable",
      practiceStatus: "Limited Participation",
      upstreamDateModified: "2024-09-10 20:30:00",
    });
  });

  it("does not promote upstream date_modified into CCF knownAt", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(INJURY_CSV, {
        status: 200,
        headers: { etag: "fixture-etag", "last-modified": "Tue, 10 Sep 2024 21:00:00 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchNflverseInjuries({
      season: 2024,
      week: 2,
      fetchImpl,
      now: () => new Date("2026-09-14T12:00:00Z"),
    });

    expect(snapshot.provenance.knownAt).toBe("2026-09-14T12:00:00.000Z");
    expect(snapshot.provenance.temporalMode).toBe("current_snapshot_only");
    expect(snapshot.provenance.licenseStatus).toBe("candidate_review_required");
    expect(snapshot.provenance.licenseRef).toContain("nflverse-data/blob/main/LICENSE.md");
    expect(snapshot.provenance.availability).toBe("historical_through_2024");
    expect(snapshot.rows[0].upstreamDateModified).toBe("2024-09-10 20:30:00");
  });

  it("fails closed for 2025+ because upstream injury coverage ended after 2024", async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    await expect(
      fetchNflverseInjuries({ season: 2025, week: 1, fetchImpl }),
    ).rejects.toThrow(/unavailable after 2024/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when required injury-report columns disappear", () => {
    expect(() =>
      parseNflverseInjuriesCsv(
        "season,game_type,team,week,gsis_id,position\n2024,REG,AAA,2,00-1,WR",
        { season: 2024 },
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
