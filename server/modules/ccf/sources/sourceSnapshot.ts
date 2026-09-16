import crypto from "crypto";

export type CCFSourceTemporalMode = "current_snapshot_only" | "archived_point_in_time";
export type CCFSourceKnownAtBasis = "ccf_capture" | "provider_archive_proven";

export interface CCFSourceSnapshotManifest {
  manifestVersion: "ccf-source-snapshot-v1";
  provider: string;
  dataset: string;
  sourceUrl: string;
  license: string;
  parserVersion: string;
  retrievedAt: string;
  knownAt: string;
  /**
   * Explains why `knownAt` is trustworthy. `ccf_capture` means CCF only claims
   * knowledge when it actually retrieved the bytes. `provider_archive_proven`
   * is reserved for an immutable historical provider version whose publication
   * time is independently evidenced by `sourceVersionKnownAt` +
   * `knownAtProofRef`.
   */
  knownAtBasis: CCFSourceKnownAtBasis;
  /** Exact time this immutable provider version is proven to have been available. */
  sourceVersionKnownAt: string | null;
  /** Durable evidence supporting a provider-archive historical known-at claim. */
  knownAtProofRef: string | null;
  /** HTTP/header metadata only; never sufficient by itself to backdate knownAt. */
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
  knownAtBasis?: CCFSourceKnownAtBasis;
  sourceVersionKnownAt?: string | null;
  knownAtProofRef?: string | null;
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

function requireText(label: string, value: string | null | undefined): string {
  if (!value?.trim()) throw new CCFSourceSnapshotError(`${label} is required`);
  return value;
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
  const temporalMode = input.temporalMode ?? "current_snapshot_only";
  if (temporalMode === "archived_point_in_time" && !input.archiveRef?.trim()) {
    throw new CCFSourceSnapshotError(
      "archived_point_in_time snapshots require an immutable archiveRef",
    );
  }

  const knownAtBasis = input.knownAtBasis ?? "ccf_capture";
  let knownAt: string;
  let sourceVersionKnownAt: string | null = input.sourceVersionKnownAt ?? null;
  let knownAtProofRef: string | null = input.knownAtProofRef ?? null;

  if (knownAtBasis === "ccf_capture") {
    knownAt = input.knownAt ?? input.retrievedAt;
    const knownAtMs = parseTimestamp("knownAt", knownAt);

    // For ordinary captures, CCF cannot claim it knew bytes before retrieval.
    if (knownAtMs < retrievedAtMs) {
      throw new CCFSourceSnapshotError(
        "knownAt cannot precede retrievedAt when knownAtBasis is ccf_capture",
      );
    }

    if (sourceVersionKnownAt != null) {
      parseTimestamp("sourceVersionKnownAt", sourceVersionKnownAt);
    }
  } else if (knownAtBasis === "provider_archive_proven") {
    if (temporalMode !== "archived_point_in_time") {
      throw new CCFSourceSnapshotError(
        "provider_archive_proven knownAt requires archived_point_in_time temporal mode",
      );
    }
    requireText("archiveRef", input.archiveRef);
    sourceVersionKnownAt = requireText("sourceVersionKnownAt", sourceVersionKnownAt);
    knownAtProofRef = requireText("knownAtProofRef", knownAtProofRef);

    const sourceVersionKnownAtMs = parseTimestamp(
      "sourceVersionKnownAt",
      sourceVersionKnownAt,
    );
    if (sourceVersionKnownAtMs > retrievedAtMs) {
      throw new CCFSourceSnapshotError(
        "sourceVersionKnownAt cannot be later than retrievedAt for provider archive proof",
      );
    }

    knownAt = input.knownAt ?? sourceVersionKnownAt;
    const knownAtMs = parseTimestamp("knownAt", knownAt);
    if (knownAtMs !== sourceVersionKnownAtMs) {
      throw new CCFSourceSnapshotError(
        "provider_archive_proven knownAt must equal the proven sourceVersionKnownAt",
      );
    }
  } else {
    const exhaustive: never = knownAtBasis;
    throw new CCFSourceSnapshotError(`unsupported knownAtBasis ${exhaustive}`);
  }

  if (input.sourceLastModified != null) {
    parseTimestamp("sourceLastModified", input.sourceLastModified);
  }

  const bytes = toBuffer(input.content);
  if (bytes.byteLength === 0) {
    throw new CCFSourceSnapshotError("source snapshot content must not be empty");
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
    knownAtBasis,
    sourceVersionKnownAt,
    knownAtProofRef,
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
 * Point-in-time eligibility is deliberately based on the manifest `knownAt`.
 * Header metadata such as Last-Modified never backdates knowledge by itself.
 * Historical backdating is allowed only when the manifest explicitly carries
 * a provider-archive proof accepted by the source binding.
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
