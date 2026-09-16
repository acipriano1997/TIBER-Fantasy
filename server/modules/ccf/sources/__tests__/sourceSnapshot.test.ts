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
    expect(manifest.knownAtBasis).toBe("ccf_capture");
    expect(manifest.sourceVersionKnownAt).toBeNull();
    expect(manifest.knownAtProofRef).toBeNull();
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

  it("rejects backdated ordinary captures even if a provider timestamp is supplied", () => {
    expect(() =>
      createCCFSourceSnapshotManifest({
        provider: "NFL.com",
        dataset: "Inactive Reports",
        sourceUrl: "https://example.test/inactives",
        license: "terms-review",
        parserVersion: "ccf-nfl-inactives-candidate-v1",
        content: "x",
        retrievedAt: "2026-09-14T17:00:00Z",
        knownAt: "2026-09-14T16:00:00Z",
        sourceVersionKnownAt: "2026-09-14T15:30:00Z",
        knownAtBasis: "ccf_capture",
      }),
    ).toThrow(/cannot precede retrievedAt/);
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

  it("accepts an explicitly archived immutable CCF capture", () => {
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
    expect(manifest.knownAtBasis).toBe("ccf_capture");
    expect(manifest.archiveRef).toContain("ccf://raw/");
  });

  it("allows historical knownAt only with explicit immutable provider-archive proof", () => {
    const manifest = createCCFSourceSnapshotManifest({
      provider: "NFL.com",
      dataset: "Inactive Reports",
      sourceUrl: "https://example.test/archived-inactives",
      license: "terms-review",
      parserVersion: "ccf-nfl-inactives-candidate-v1",
      content: "historical immutable bytes",
      retrievedAt: "2026-09-14T17:00:00Z",
      knownAtBasis: "provider_archive_proven",
      sourceVersionKnownAt: "2025-09-07T15:40:00Z",
      knownAtProofRef: "provider://nfl/archive-metadata/week1-2025",
      temporalMode: "archived_point_in_time",
      archiveRef: "ccf://raw/nfl/inactives/sha256/example",
    });

    expect(manifest.knownAt).toBe("2025-09-07T15:40:00Z");
    expect(manifest.knownAtBasis).toBe("provider_archive_proven");
    expect(
      assertCCFSourceSnapshotEligibleAt(manifest, "2025-09-07T16:00:00Z"),
    ).toBe(manifest);
  });

  it("rejects archive-proven knownAt without exact version proof", () => {
    expect(() =>
      createCCFSourceSnapshotManifest({
        provider: "NFL.com",
        dataset: "Inactive Reports",
        sourceUrl: "https://example.test/archived-inactives",
        license: "terms-review",
        parserVersion: "ccf-nfl-inactives-candidate-v1",
        content: "x",
        retrievedAt: "2026-09-14T17:00:00Z",
        knownAtBasis: "provider_archive_proven",
        temporalMode: "archived_point_in_time",
        archiveRef: "ccf://raw/nfl/inactives/sha256/example",
      }),
    ).toThrow(/sourceVersionKnownAt is required/);
  });

  it("rejects a provider-archive knownAt that differs from the proven source-version time", () => {
    expect(() =>
      createCCFSourceSnapshotManifest({
        provider: "NFL.com",
        dataset: "Inactive Reports",
        sourceUrl: "https://example.test/archived-inactives",
        license: "terms-review",
        parserVersion: "ccf-nfl-inactives-candidate-v1",
        content: "x",
        retrievedAt: "2026-09-14T17:00:00Z",
        knownAt: "2025-09-07T15:00:00Z",
        knownAtBasis: "provider_archive_proven",
        sourceVersionKnownAt: "2025-09-07T15:40:00Z",
        knownAtProofRef: "provider://nfl/archive-metadata/week1-2025",
        temporalMode: "archived_point_in_time",
        archiveRef: "ccf://raw/nfl/inactives/sha256/example",
      }),
    ).toThrow(/must equal the proven sourceVersionKnownAt/);
  });
});
