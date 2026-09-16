import type { CCFNFLPlayerIdentityRegistrySnapshot } from "../../modules/ccf/sources/nflPlayerIdentityRegistrySnapshot";
import { runCCFIdentitySnapshotCommand } from "../ccfCaptureNflPlayerIdentityRegistry";

const snapshot = {
  contractVersion: "ccf-nfl-player-identity-registry-snapshot-v1",
  snapshotId: "ccf-nfl-player-identity-registry:abc123",
  capturedAt: "2026-09-16T18:00:00Z",
  knownAt: "2026-09-16T18:00:00Z",
  knownAtBasis: "ccf_capture",
  sourceTable: "player_identity_map",
  schemaAuthorityRef: "github://schema",
  rowCount: 1,
  resolvedExactCount: 1,
  unresolvedCount: 0,
  rows: [],
  archive: {
    archiveDir: "/archive",
    contentPath: "/archive/content.raw",
    manifestPath: "/archive/manifest.json",
    manifest: {
      manifestVersion: "ccf-source-snapshot-v1",
      provider: "tiber",
      dataset: "player_identity_map_gsis_tiber",
      sourceUrl: "tiber://database/player_identity_map",
      license: "tiber_internal_identity_registry",
      parserVersion: "ccf-nfl-player-identity-registry-snapshot-v1",
      retrievedAt: "2026-09-16T18:00:00Z",
      knownAt: "2026-09-16T18:00:00Z",
      knownAtBasis: "ccf_capture",
      sourceVersionKnownAt: null,
      knownAtProofRef: null,
      sourceLastModified: null,
      etag: null,
      contentSha256: "abc123",
      contentBytes: 123,
      temporalMode: "archived_point_in_time",
      archiveRef: "ccf://raw/tiber/player_identity_map_gsis_tiber/sha256/archive123",
    },
  },
} as unknown as CCFNFLPlayerIdentityRegistrySnapshot;

describe("CCF identity snapshot command", () => {
  it("emits an auditable non-promotion receipt only after persisted verification succeeds", async () => {
    const outcome = await runCCFIdentitySnapshotCommand({
      archiveRootDir: "/archive-root",
      capture: async (root) => {
        expect(root).toBe("/archive-root");
        return snapshot;
      },
      buildReceipt: async (_snapshot, frozenAt) => ({
        receipt: { receiptId: "real-receipt" } as never,
        receiptFingerprint: "f".repeat(64),
        receiptRef: `ccf://nfl-player-identity/sha256/${"f".repeat(64)}`,
      }),
      now: () => "2026-09-16T18:01:00Z",
    });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toMatchObject({
      receipt_kind: "ccf_nfl_player_identity_registry_capture_v1",
      capturedAt: "2026-09-16T18:00:00Z",
      knownAt: "2026-09-16T18:00:00Z",
      frozenAt: "2026-09-16T18:01:00Z",
      rowCount: 1,
      resolvedExactCount: 1,
      unresolvedCount: 0,
      persistedArchiveVerified: true,
      productionPromotionAuthorized: false,
    });
  });

  it("fails closed and never emits promotion authority when capture fails", async () => {
    const outcome = await runCCFIdentitySnapshotCommand({
      archiveRootDir: "/archive-root",
      capture: async () => {
        throw new Error("registry unavailable");
      },
      buildReceipt: () => {
        throw new Error("must not be called");
      },
      now: () => "2026-09-16T18:01:00Z",
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toMatchObject({
      receipt_kind: "ccf_nfl_player_identity_registry_capture_v1",
      ok: false,
      error: "registry unavailable",
      persistedArchiveVerified: false,
      productionPromotionAuthorized: false,
    });
  });

  it("fails closed if persisted archive verification rejects receipt materialization", async () => {
    const outcome = await runCCFIdentitySnapshotCommand({
      archiveRootDir: "/archive-root",
      capture: async () => snapshot,
      buildReceipt: async () => {
        throw new Error("archive content failed stored-manifest verification");
      },
      now: () => "2026-09-16T18:01:00Z",
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toMatchObject({
      receipt_kind: "ccf_nfl_player_identity_registry_capture_v1",
      ok: false,
      error: "archive content failed stored-manifest verification",
      persistedArchiveVerified: false,
      productionPromotionAuthorized: false,
    });
  });
});