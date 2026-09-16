import crypto from "crypto";

export type CCFSourceTemporalMode = "current_snapshot_only" | "archived_point_in_time";

export interface CCFSourceSnapshotManifest {
  manifestVersion: "ccf-source-snapshot-v1";
  provider: string;
  dataset: string;
  sourceUrl: string;
  license: string;
  parserVersion: string;
  retrievedAt: string;
  knownAt: string;
  sourceLastModified: string | null;
  etag: string | null;
  contentSha256: string;
  contentBytes: number;
  temporalMode: CCFSourceTemporalMode;
  archiveRef?: string;
}

export interface CreateCCFSourceSnapshotManifestInput {
  provider: string;
  dataset: string;
  sourceUrl: string;
  license: string;
  parserVersion: string;
  content: string | Buffer | Uint8Array;
  retrievedAt: string;
  knownAt?: string;
  sourceLastModified?: string | null;
  etag?: string | null;
  temporalMode?: CCFSourceTemporalMode;
  archiveRef?: string;
}

export class CCFSourceSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFSourceSnapshotError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFSourceSnapshotError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function toBuffer(content: string | Buffer | Uint8Array): Buffer {
  if (typeof content === "string") {
    return Buffer.from(content, "utf8");
  }
  return Buffer.from(content);
}

export function createCCFSourceSnapshotManifest(
  input: CreateCCFSourceSnapshotManifestInput,
): CCFSourceSnapshotManifest {
  if (!input.provider.trim()) throw new CCFSourceSnapshotError("provider is required");
  if (!input.dataset.trim()) throw new CCFSourceSnapshotError("dataset is required");
  if (!input.sourceUrl.trim()) throw new CCFSourceSnapshotError("sourceUrl is required");
  if (!input.license.trim()) throw new CCFSourceSnapshotError("license is required");
  if (!input.parserVersion.trim()) throw new CCFSourceSnapshotError("parserVersion is required");

  const retrievedAtMs = parseTimestamp("retrievedAt", input.retrievedAt);
  const knownAt = input.knownAt ?? input.retrievedAt;
  const knownAtMs = parseTimestamp("knownAt", knownAt);

  // CCF cannot claim it knew a source snapshot before it actually retrieved it.
  if (knownAtMs < retrievedAtMs) {
    throw new CCFSourceSnapshotError("knownAt cannot precede retrievedAt for a newly captured source snapshot");
  }

  if (input.sourceLastModified != null) {
    parseTimestamp("sourceLastModified", input.sourceLastModified);
  }

  const bytes = toBuffer(input.content);
  if (bytes.byteLength === 0) {
    throw new CCFSourceSnapshotError("source snapshot content must not be empty");
  }

  const temporalMode = input.temporalMode ?? "current_snapshot_only";
  if (temporalMode === "archived_point_in_time" && !input.archiveRef?.trim()) {
    throw new CCFSourceSnapshotError(
      "archived_point_in_time snapshots require an immutable archiveRef",
    );
  }

  return {
    manifestVersion: "ccf-source-snapshot-v1",
    provider: input.provider,
    dataset: input.dataset,
    sourceUrl: input.sourceUrl,
    license: input.license,
    parserVersion: input.parserVersion,
    retrievedAt: input.retrievedAt,
    knownAt,
    sourceLastModified: input.sourceLastModified ?? null,
    etag: input.etag ?? null,
    contentSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    contentBytes: bytes.byteLength,
    temporalMode,
    archiveRef: input.archiveRef,
  };
}

export function verifyCCFSourceSnapshotContent(
  manifest: CCFSourceSnapshotManifest,
  content: string | Buffer | Uint8Array,
): boolean {
  const bytes = toBuffer(content);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  return digest === manifest.contentSha256 && bytes.byteLength === manifest.contentBytes;
}

/**
 * Point-in-time eligibility is deliberately based on CCF's `knownAt`, never on
 * an upstream Last-Modified timestamp. A file fetched after the decision time
 * is ineligible even if the provider says the file itself was modified earlier.
 */
export function assertCCFSourceSnapshotEligibleAt(
  manifest: CCFSourceSnapshotManifest,
  asOf: string,
): CCFSourceSnapshotManifest {
  const knownAtMs = parseTimestamp("manifest.knownAt", manifest.knownAt);
  const asOfMs = parseTimestamp("asOf", asOf);

  if (knownAtMs > asOfMs) {
    throw new CCFSourceSnapshotError(
      `source snapshot is temporally ineligible: knownAt ${manifest.knownAt} > asOf ${asOf}`,
    );
  }

  return manifest;
}
