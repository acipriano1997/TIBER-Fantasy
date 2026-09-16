import crypto from "crypto";
import { looksLikeTiberPlayerId } from "../../../services/identity/tiberPlayerId";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";
import {
  fingerprintCCFNFLPlayerIdentityLinkageReceipt,
  refCCFNFLPlayerIdentityLinkageReceipt,
  validateCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageRow,
} from "./nflPlayerIdentityLinkage";

export interface CCFNFLPlayerIdentityRegistrySourceRow {
  canonicalId: string;
  tiberPlayerId: string | null;
  gsisId: string | null;
  mergedInto: string | null;
}

export interface CCFNFLPlayerIdentityRegistrySnapshotRow {
  canonicalId: string;
  gsisId: string;
  tiberPlayerId: string | null;
  mergedInto: string | null;
}

export interface CCFNFLPlayerIdentityRegistrySnapshot {
  contractVersion: "ccf-nfl-player-identity-registry-snapshot-v1";
  snapshotId: string;
  capturedAt: string;
  knownAt: string;
  knownAtBasis: "ccf_capture";
  sourceTable: "player_identity_map";
  schemaAuthorityRef: string;
  rowCount: number;
  resolvedExactCount: number;
  unresolvedCount: number;
  rows: CCFNFLPlayerIdentityRegistrySnapshotRow[];
  archive: CCFArchivedSourceSnapshot;
}

export interface MaterializeCCFNFLPlayerIdentityRegistrySnapshotInput {
  sourceRows: readonly CCFNFLPlayerIdentityRegistrySourceRow[];
  archiveRootDir: string;
  capturedAt: string;
}

export interface CCFNFLPlayerIdentityReceiptFromSnapshot {
  receipt: CCFNFLPlayerIdentityLinkageReceipt;
  receiptFingerprint: string;
  receiptRef: string;
}

export class CCFNFLPlayerIdentityRegistrySnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNFLPlayerIdentityRegistrySnapshotError";
  }
}

export const CCF_NFL_PLAYER_IDENTITY_REGISTRY_SCHEMA_AUTHORITY_REF =
  "github://acipriano1997/TIBER-Fantasy/migrations/0014_canonical_tiber_player_id.sql";
export const CCF_NFL_PLAYER_IDENTITY_REGISTRY_PARSER_VERSION =
  "ccf-nfl-player-identity-registry-snapshot-v1";

const GSIS_ID_PATTERN = /^00-\d{7}$/;

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function exactTrimmed(label: string, value: string): string {
  if (!hasText(value)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(`${label} is required`);
  }
  if (value !== value.trim()) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      `${label} must not contain surrounding whitespace`,
    );
  }
  return value;
}

function normalizeRows(
  sourceRows: readonly CCFNFLPlayerIdentityRegistrySourceRow[],
): CCFNFLPlayerIdentityRegistrySnapshotRow[] {
  const rows: CCFNFLPlayerIdentityRegistrySnapshotRow[] = [];
  const gsisIds = new Set<string>();
  const resolvedTiberIds = new Set<string>();

  for (const sourceRow of sourceRows) {
    // Rows without a GSIS alias cannot resolve nflverse player identity and are
    // intentionally outside this source-scoped snapshot.
    if (sourceRow.gsisId == null) continue;

    const canonicalId = exactTrimmed("canonicalId", sourceRow.canonicalId);
    const gsisId = exactTrimmed("gsisId", sourceRow.gsisId);
    if (!GSIS_ID_PATTERN.test(gsisId)) {
      throw new CCFNFLPlayerIdentityRegistrySnapshotError(
        `gsisId ${gsisId} does not match the governed GSIS namespace`,
      );
    }
    const tiberPlayerId = sourceRow.tiberPlayerId == null
      ? null
      : exactTrimmed("tiberPlayerId", sourceRow.tiberPlayerId);
    if (tiberPlayerId != null && !looksLikeTiberPlayerId(tiberPlayerId)) {
      throw new CCFNFLPlayerIdentityRegistrySnapshotError(
        `tiberPlayerId ${tiberPlayerId} does not match the canonical TIBER player-id format`,
      );
    }
    const mergedInto = sourceRow.mergedInto == null
      ? null
      : exactTrimmed("mergedInto", sourceRow.mergedInto);

    if (gsisIds.has(gsisId)) {
      throw new CCFNFLPlayerIdentityRegistrySnapshotError(
        `duplicate gsisId ${gsisId}`,
      );
    }
    gsisIds.add(gsisId);

    // A merged registry row is not independently canonical. Even if stale data
    // still carries a tiber_player_id, do not use it as an exact source binding.
    if (mergedInto == null && tiberPlayerId != null) {
      if (resolvedTiberIds.has(tiberPlayerId)) {
        throw new CCFNFLPlayerIdentityRegistrySnapshotError(
          `duplicate resolved tiberPlayerId ${tiberPlayerId}`,
        );
      }
      resolvedTiberIds.add(tiberPlayerId);
    }

    rows.push({ canonicalId, gsisId, tiberPlayerId, mergedInto });
  }

  if (rows.length === 0) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot requires at least one GSIS-bearing row",
    );
  }

  return rows.sort((left, right) => {
    const byGsis = left.gsisId.localeCompare(right.gsisId);
    return byGsis !== 0 ? byGsis : left.canonicalId.localeCompare(right.canonicalId);
  });
}

function canonicalSnapshotContent(
  rows: readonly CCFNFLPlayerIdentityRegistrySnapshotRow[],
): string {
  return `${JSON.stringify({
    contractVersion: "ccf-nfl-player-identity-registry-content-v1",
    sourceTable: "player_identity_map",
    schemaAuthorityRef: CCF_NFL_PLAYER_IDENTITY_REGISTRY_SCHEMA_AUTHORITY_REF,
    rows,
  })}\n`;
}

function contentSha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function assertCCFNFLPlayerIdentityRegistrySnapshotIntegrity(
  snapshot: CCFNFLPlayerIdentityRegistrySnapshot,
): CCFNFLPlayerIdentityRegistrySnapshot {
  if (snapshot.contractVersion !== "ccf-nfl-player-identity-registry-snapshot-v1") {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "unsupported identity registry snapshot version",
    );
  }
  if (
    snapshot.sourceTable !== "player_identity_map" ||
    snapshot.schemaAuthorityRef !== CCF_NFL_PLAYER_IDENTITY_REGISTRY_SCHEMA_AUTHORITY_REF ||
    snapshot.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot authority metadata is invalid",
    );
  }
  if (!validTimestamp(snapshot.capturedAt) || !validTimestamp(snapshot.knownAt)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "snapshot capturedAt and knownAt must be valid timestamps",
    );
  }

  const manifest = snapshot.archive.manifest;
  if (
    manifest.provider !== "tiber" ||
    manifest.dataset !== "player_identity_map_gsis_tiber" ||
    manifest.parserVersion !== CCF_NFL_PLAYER_IDENTITY_REGISTRY_PARSER_VERSION ||
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "snapshot archive manifest does not describe the governed identity registry capture",
    );
  }
  if (
    manifest.retrievedAt !== snapshot.capturedAt ||
    manifest.knownAt !== snapshot.knownAt
  ) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!hasText(manifest.archiveRef)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot requires immutable archiveRef",
    );
  }

  const normalized = normalizeRows(snapshot.rows);
  const expectedContentSha256 = contentSha256(canonicalSnapshotContent(normalized));
  if (expectedContentSha256 !== manifest.contentSha256) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot rows do not match immutable archived content",
    );
  }
  if (snapshot.rowCount !== normalized.length) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot rowCount does not match rows",
    );
  }
  const resolvedExactCount = normalized.filter(
    (row) => row.mergedInto == null && row.tiberPlayerId != null,
  ).length;
  if (
    snapshot.resolvedExactCount !== resolvedExactCount ||
    snapshot.unresolvedCount !== normalized.length - resolvedExactCount
  ) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot resolution counts do not match rows",
    );
  }
  const expectedSnapshotId = `ccf-nfl-player-identity-registry:${manifest.contentSha256}`;
  if (snapshot.snapshotId !== expectedSnapshotId) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshotId does not match archived content fingerprint",
    );
  }

  return snapshot;
}

export async function materializeCCFNFLPlayerIdentityRegistrySnapshot(
  input: MaterializeCCFNFLPlayerIdentityRegistrySnapshotInput,
): Promise<CCFNFLPlayerIdentityRegistrySnapshot> {
  if (!validTimestamp(input.capturedAt)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "capturedAt must be a valid timestamp",
    );
  }

  const rows = normalizeRows(input.sourceRows);
  const content = canonicalSnapshotContent(rows);
  const archive = await archiveCCFSourceSnapshot({
    rootDir: input.archiveRootDir,
    provider: "tiber",
    dataset: "player_identity_map_gsis_tiber",
    sourceUrl: "tiber://database/player_identity_map",
    license: "tiber_internal_identity_registry",
    parserVersion: CCF_NFL_PLAYER_IDENTITY_REGISTRY_PARSER_VERSION,
    content,
    retrievedAt: input.capturedAt,
    knownAt: input.capturedAt,
    knownAtBasis: "ccf_capture",
    sourceVersionKnownAt: null,
    knownAtProofRef: null,
    sourceLastModified: null,
    etag: null,
  });

  const resolvedExactCount = rows.filter(
    (row) => row.mergedInto == null && row.tiberPlayerId != null,
  ).length;
  const unresolvedCount = rows.length - resolvedExactCount;

  return assertCCFNFLPlayerIdentityRegistrySnapshotIntegrity({
    contractVersion: "ccf-nfl-player-identity-registry-snapshot-v1",
    snapshotId: `ccf-nfl-player-identity-registry:${archive.manifest.contentSha256}`,
    capturedAt: input.capturedAt,
    knownAt: archive.manifest.knownAt,
    knownAtBasis: "ccf_capture",
    sourceTable: "player_identity_map",
    schemaAuthorityRef: CCF_NFL_PLAYER_IDENTITY_REGISTRY_SCHEMA_AUTHORITY_REF,
    rowCount: rows.length,
    resolvedExactCount,
    unresolvedCount,
    rows,
    archive,
  });
}

export function buildCCFNFLPlayerIdentityLinkageReceiptFromSnapshot(
  snapshot: CCFNFLPlayerIdentityRegistrySnapshot,
  frozenAt: string,
): CCFNFLPlayerIdentityReceiptFromSnapshot {
  assertCCFNFLPlayerIdentityRegistrySnapshotIntegrity(snapshot);
  if (!validTimestamp(frozenAt)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "frozenAt must be a valid timestamp",
    );
  }
  if (Date.parse(frozenAt) < Date.parse(snapshot.knownAt)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "receipt frozenAt cannot precede snapshot knownAt",
    );
  }
  const archiveRef = snapshot.archive.manifest.archiveRef;
  if (!hasText(archiveRef)) {
    throw new CCFNFLPlayerIdentityRegistrySnapshotError(
      "identity registry snapshot requires immutable archiveRef",
    );
  }

  const rows: CCFNFLPlayerIdentityLinkageRow[] = snapshot.rows.map((row) => {
    const resolved = row.mergedInto == null && row.tiberPlayerId != null;
    return {
      sourcePlayerId: row.gsisId,
      status: resolved ? "resolved_exact" : "unresolved",
      canonicalPlayerId: resolved ? row.tiberPlayerId : null,
      bindingMethod: resolved ? "exact_external_id" : null,
      knownAt: snapshot.knownAt,
      evidenceRefs: [archiveRef, snapshot.schemaAuthorityRef],
    };
  });

  const receipt: CCFNFLPlayerIdentityLinkageReceipt = {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: `nflverse-gsis-to-tiber-${snapshot.archive.manifest.contentSha256.slice(0, 16)}`,
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: snapshot.archive.manifest.contentSha256,
    identityRegistryKnownAt: snapshot.knownAt,
    frozenAt,
    rows,
    notes: [
      "materialized prospectively from immutable player_identity_map snapshot",
      "capture time owns knownAt; mutable database timestamps do not backdate identity knowledge",
      "exact gsis_id to tiber_player_id bindings only; no name/team/fuzzy fallback",
      "merged registry rows remain unresolved until an explicit governed survivor mapping is materialized",
    ],
  };

  validateCCFNFLPlayerIdentityLinkageReceipt(receipt);
  return {
    receipt,
    receiptFingerprint: fingerprintCCFNFLPlayerIdentityLinkageReceipt(receipt),
    receiptRef: refCCFNFLPlayerIdentityLinkageReceipt(receipt),
  };
}

/**
 * Stable content fingerprint for tests/audits that need to compare registry
 * state independently from capture time. The archiveRef still distinguishes
 * separate prospective retrieval events even when registry bytes are unchanged.
 */
export function fingerprintCCFNFLPlayerIdentityRegistryRows(
  sourceRows: readonly CCFNFLPlayerIdentityRegistrySourceRow[],
): string {
  return contentSha256(canonicalSnapshotContent(normalizeRows(sourceRows)));
}
