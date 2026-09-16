import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseSnapCounts } from "../archivedNflverseSnapCounts";
import { assertCCFSourceSnapshotEligibleAt } from "../sourceSnapshot";

const SNAP_CSV = [
  "game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct",
  "2026_02_BBB_AAA,202609130aaa,2026,REG,2,Example Receiver,ReceEx00,WR,AAA,BBB,52,80%,0,0%,2,10%",
].join("\n");

describe("prospective archived nflverse snap-count capture", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-snap-archive-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  it("archives exact fetched bytes and preserves full qualification scope", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(SNAP_CSV, {
        status: 200,
        headers: {
          etag: "snap-etag",
          "last-modified": "Mon, 14 Sep 2026 11:30:00 GMT",
        },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseSnapCounts({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-14T12:05:00Z"),
    });

    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.positions).toEqual(["QB", "RB", "WR", "TE"]);
    expect(snapshot.rows[0]).toMatchObject({
      pfrPlayerId: "ReceEx00",
      offenseSnaps: 52,
      offensePct: 0.8,
    });
    expect(snapshot.knownAt).toBe("2026-09-14T12:05:00.000Z");
    expect(snapshot.archive.manifest).toMatchObject({
      provider: "nflverse",
      dataset: "snap_counts",
      parserVersion: "ccf-nflverse-snap-counts-candidate-v2",
      temporalMode: "archived_point_in_time",
      knownAtBasis: "ccf_capture",
      knownAt: "2026-09-14T12:05:00.000Z",
      sourceLastModified: "Mon, 14 Sep 2026 11:30:00 GMT",
      etag: "snap-etag",
    });
    expect(await fs.readFile(snapshot.archive.contentPath, "utf8")).toBe(SNAP_CSV);
  });

  it("preserves filtered position scope so it cannot masquerade as full coverage", async () => {
    const fetchImpl = jest.fn(async () => new Response(SNAP_CSV, { status: 200 })) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseSnapCounts({
      season: 2026,
      week: 2,
      positions: ["WR"],
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-14T12:05:00Z"),
    });

    expect(snapshot.positions).toEqual(["WR"]);
  });

  it("does not let upstream Last-Modified backdate the prospective CCF capture", async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(SNAP_CSV, {
        status: 200,
        headers: { "last-modified": "Mon, 14 Sep 2026 09:00:00 GMT" },
      }),
    ) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseSnapCounts({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-14T12:05:00Z"),
    });

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-14T11:00:00Z",
      ),
    ).toThrow(/temporally ineligible/);
    expect(
      assertCCFSourceSnapshotEligibleAt(
        snapshot.archive.manifest,
        "2026-09-14T12:05:00Z",
      ),
    ).toBe(snapshot.archive.manifest);
  });

  it("keeps post-game evidence timing explicit", async () => {
    const fetchImpl = jest.fn(async () => new Response(SNAP_CSV, { status: 200 })) as unknown as typeof fetch;

    const snapshot = await fetchAndArchiveNflverseSnapCounts({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-14T12:05:00Z"),
    });

    expect(snapshot.evidenceTiming).toBe("post_game_observed");
  });
});
