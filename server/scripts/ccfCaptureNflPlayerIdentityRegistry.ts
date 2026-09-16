#!/usr/bin/env tsx
/**
 * Prospective CCF NFL identity-registry capture.
 *
 * This command reads the current exact GSIS/TIBER identity columns from
 * `player_identity_map`, archives the observed bytes immutably, re-verifies the
 * persisted archive from disk, and only then mints a frozen GSIS -> canonical
 * TIBER linkage receipt from that exact archive.
 *
 * It never backdates knowledge to database row timestamps or migrations, never
 * uses player names/teams/positions, and never promotes a source. Credentials
 * are inherited from the normal runtime environment; they are not accepted on
 * the command line.
 *
 * Required environment:
 *   DATABASE_URL             target registry database
 *   CCF_SOURCE_ARCHIVE_ROOT  durable root for immutable CCF source archives
 *
 * Example:
 *   npx tsx server/scripts/ccfCaptureNflPlayerIdentityRegistry.ts > identity-receipt.json
 */

import type {
  CCFNFLPlayerIdentityReceiptFromSnapshot,
  CCFNFLPlayerIdentityRegistrySnapshot,
} from "../modules/ccf/sources/nflPlayerIdentityRegistrySnapshot";

export interface CCFIdentitySnapshotCommandDeps {
  archiveRootDir: string;
  capture: (archiveRootDir: string) => Promise<CCFNFLPlayerIdentityRegistrySnapshot>;
  buildReceipt: (
    snapshot: CCFNFLPlayerIdentityRegistrySnapshot,
    frozenAt: string,
  ) =>
    | CCFNFLPlayerIdentityReceiptFromSnapshot
    | Promise<CCFNFLPlayerIdentityReceiptFromSnapshot>;
  now?: () => string;
}

export interface CCFIdentitySnapshotCommandOutcome {
  exitCode: 0 | 1;
  output: Record<string, unknown>;
}

export async function runCCFIdentitySnapshotCommand(
  deps: CCFIdentitySnapshotCommandDeps,
): Promise<CCFIdentitySnapshotCommandOutcome> {
  const now = deps.now ?? (() => new Date().toISOString());
  try {
    const snapshot = await deps.capture(deps.archiveRootDir);
    const frozenAt = now();
    const materialized = await deps.buildReceipt(snapshot, frozenAt);
    return {
      exitCode: 0,
      output: {
        receipt_kind: "ccf_nfl_player_identity_registry_capture_v1",
        capturedAt: snapshot.capturedAt,
        knownAt: snapshot.knownAt,
        frozenAt,
        snapshotId: snapshot.snapshotId,
        archiveRef: snapshot.archive.manifest.archiveRef,
        registryContentSha256: snapshot.archive.manifest.contentSha256,
        rowCount: snapshot.rowCount,
        resolvedExactCount: snapshot.resolvedExactCount,
        unresolvedCount: snapshot.unresolvedCount,
        linkageReceiptFingerprint: materialized.receiptFingerprint,
        linkageReceiptRef: materialized.receiptRef,
        linkageReceipt: materialized.receipt,
        persistedArchiveVerified: true,
        productionPromotionAuthorized: false,
      },
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: {
        receipt_kind: "ccf_nfl_player_identity_registry_capture_v1",
        generatedAt: now(),
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        persistedArchiveVerified: false,
        productionPromotionAuthorized: false,
      },
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.stderr.write(
      "DATABASE_URL is not set. Run this inside the target environment; credentials are never passed on the command line.\n",
    );
    process.exit(1);
  }
  const archiveRootDir = process.env.CCF_SOURCE_ARCHIVE_ROOT?.trim();
  if (!archiveRootDir) {
    process.stderr.write(
      "CCF_SOURCE_ARCHIVE_ROOT is not set. Refusing to create an identity receipt without an explicit durable archive root.\n",
    );
    process.exit(1);
  }

  // Lazy import: the DB adapter opens the normal application database at module
  // load. Keeping it out of the pure command path makes unit testing possible
  // without DATABASE_URL and keeps credential handling identical to the app.
  const [
    { captureCCFNFLPlayerIdentityRegistry },
    { buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot },
  ] = await Promise.all([
    import("../modules/ccf/sources/nflPlayerIdentityRegistryDb"),
    import("../modules/ccf/sources/nflPlayerIdentityRegistrySnapshot"),
  ]);

  const outcome = await runCCFIdentitySnapshotCommand({
    archiveRootDir,
    capture: (root) => captureCCFNFLPlayerIdentityRegistry({ archiveRootDir: root }),
    buildReceipt: buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot,
  });

  process.stdout.write(`${JSON.stringify(outcome.output, null, 2)}\n`);
  process.exit(outcome.exitCode);
}

if (process.env.JEST_WORKER_ID === undefined) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[ccf-identity-snapshot] fatal: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}