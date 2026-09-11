import {
  CCFSourceSnapshotError,
  assertCCFSourceSnapshotEligibleAt,
  createCCFSourceSnapshotManifest,
  verifyCCFSourceSnapshotContent,
} from "../sourceSnapshot";

describe("CCF source snapshots", () => {
  it("hashes immutable source bytes and verifies them later", () => {
    const content = "player_id,week\n00-1,1\n";
    const manifest = createCCFSourceSnapshotManifest({
      provider: "nflverse",
      dataset: "stats_player_week",
      sourceUrl: "https://example.test/stats.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-player-stats-v1",
      content,
      retrievedAt: "2026-09-11T12:00:00Z",
    });

    expect(manifest.contentBytes).toBe(Buffer.byteLength(content));
    expect(manifest.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.knownAt).toBe("2026-09-11T12:00:00Z");
    expect(verifyCCFSourceSnapshotContent(manifest, content)).toBe(true);
    expect(verifyCCFSourceSnapshotContent(manifest, content + "tamper")).toBe(false);
  });

  it("does not use Last-Modified as proof that CCF knew a file earlier", () => {
    const manifest = createCCFSourceSnapshotManifest({
      provider: "nflverse",
      dataset: "stats_player_week",
      sourceUrl: "https://example.test/stats.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-player-stats-v1",
      content: "x",
      retrievedAt: "2026-09-11T12:00:00Z",
      sourceLastModified: "2026-09-10T18:00:00Z",
    });

    expect(() =>
      assertCCFSourceSnapshotEligibleAt(manifest, "2026-09-10T20:00:00Z"),
    ).toThrow(CCFSourceSnapshotError);
    expect(assertCCFSourceSnapshotEligibleAt(manifest, "2026-09-11T12:00:00Z")).toBe(
      manifest,
    );
  });

  it("requires an immutable archive reference before calling a snapshot point-in-time archived", () => {
    expect(() =>
      createCCFSourceSnapshotManifest({
        provider: "nflverse",
        dataset: "stats_player_week",
        sourceUrl: "https://example.test/stats.csv",
        license: "CC-BY-4.0",
        parserVersion: "ccf-nflverse-player-stats-v1",
        content: "x",
        retrievedAt: "2026-09-11T12:00:00Z",
        temporalMode: "archived_point_in_time",
      }),
    ).toThrow(CCFSourceSnapshotError);
  });

  it("accepts an explicitly archived immutable snapshot", () => {
    const manifest = createCCFSourceSnapshotManifest({
      provider: "nflverse",
      dataset: "stats_player_week",
      sourceUrl: "https://example.test/stats.csv",
      license: "CC-BY-4.0",
      parserVersion: "ccf-nflverse-player-stats-v1",
      content: "x",
      retrievedAt: "2026-09-11T12:00:00Z",
      temporalMode: "archived_point_in_time",
      archiveRef: "ccf://raw/nflverse/stats_player_week/sha256/example",
    });

    expect(manifest.temporalMode).toBe("archived_point_in_time");
    expect(manifest.archiveRef).toContain("ccf://raw/");
  });
});
