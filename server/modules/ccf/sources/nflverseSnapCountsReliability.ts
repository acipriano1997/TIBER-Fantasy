import type { CCFArchivedNflverseSnapCountSnapshot } from "./archivedNflverseSnapCounts";
import type { CCFArchivedNflversePlayerIdCrosswalkSnapshot } from "./archivedNflversePlayerIdCrosswalk";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "./nflPlayerIdentityLinkage";
import { auditCCFPFRPlayerIdentityBridge } from "./pfrPlayerIdentityBridge";
import {
  validateCCFSourceReliabilityObservation,
  type CCFSourceCorrectionStatus,
  type CCFSourceReliabilityObservation,
} from "./sourceReliabilityReview";

export interface BuildCCFNflverseSnapCountsReliabilityObservationInput {
  snapshot: CCFArchivedNflverseSnapCountSnapshot;
  previousSnapshot?: CCFArchivedNflverseSnapCountSnapshot | null;
  sourceId: string;
  checkpointId: string;
  scheduledFor: string;
  crosswalk: CCFArchivedNflversePlayerIdCrosswalkSnapshot;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  criticalFieldPolicyRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  notes?: string[];
}

export class CCFNflverseSnapCountsReliabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseSnapCountsReliabilityError";
  }
}

const REQUIRED_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const REQUIRED_PARSER_VERSION = "ccf-nflverse-snap-counts-candidate-v2";

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) {
    throw new CCFNflverseSnapCountsReliabilityError(`${label} is required`);
  }
  return value;
}

function archiveRef(snapshot: CCFArchivedNflverseSnapCountSnapshot): string {
  const value = snapshot.archive.manifest.archiveRef;
  if (!hasText(value)) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "archived snap-count snapshot is missing archiveRef",
    );
  }
  return value;
}

function sameFullPositionScope(snapshot: CCFArchivedNflverseSnapCountSnapshot): boolean {
  const observed = [...snapshot.positions].sort();
  const required = [...REQUIRED_POSITIONS].sort();
  return observed.length === required.length && observed.every((value, index) => value === required[index]);
}

function validateSnapshot(snapshot: CCFArchivedNflverseSnapCountSnapshot): void {
  const manifest = snapshot.archive.manifest;
  if (manifest.provider !== "nflverse" || manifest.dataset !== "snap_counts") {
    throw new CCFNflverseSnapCountsReliabilityError(
      "reliability observation requires an archived nflverse snap-count snapshot",
    );
  }
  if (manifest.parserVersion !== REQUIRED_PARSER_VERSION) {
    throw new CCFNflverseSnapCountsReliabilityError(
      `snap-count reliability requires parser ${REQUIRED_PARSER_VERSION}`,
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "reliability observation requires a prospective CCF archived point-in-time capture",
    );
  }
  if (snapshot.knownAt !== manifest.knownAt || snapshot.retrievedAt !== manifest.retrievedAt) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!Number.isInteger(snapshot.requestedWeek) || (snapshot.requestedWeek ?? 0) <= 0) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "reliability observation requires a week-scoped snap-count capture",
    );
  }
  if (!sameFullPositionScope(snapshot)) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "reliability observation requires the complete QB/RB/WR/TE position scope",
    );
  }
  if (snapshot.rows.length === 0) {
    throw new CCFNflverseSnapCountsReliabilityError("snap-count snapshot rows must not be empty");
  }
  for (const row of snapshot.rows) {
    if (row.season !== snapshot.season || row.week !== snapshot.requestedWeek) {
      throw new CCFNflverseSnapCountsReliabilityError(
        "snap-count snapshot contains rows outside the requested season/week",
      );
    }
    if (!Number.isFinite(row.offenseSnaps) || !Number.isFinite(row.offensePct)) {
      throw new CCFNflverseSnapCountsReliabilityError(
        "snap-count snapshot contains invalid core workload fields",
      );
    }
  }
}

function rowKey(row: CCFArchivedNflverseSnapCountSnapshot["rows"][number]): string {
  return [row.season, row.week, row.gameId, row.pfrPlayerId].join("|");
}

function duplicateKeyCount(snapshot: CCFArchivedNflverseSnapCountSnapshot): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of snapshot.rows) {
    const key = rowKey(row);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function rowHasCriticalMissingness(
  row: CCFArchivedNflverseSnapCountSnapshot["rows"][number],
): boolean {
  if (!hasText(row.position) || !hasText(row.opponent)) return true;
  return !Number.isFinite(row.offenseSnaps) || !Number.isFinite(row.offensePct);
}

function correctionStatus(
  current: CCFArchivedNflverseSnapCountSnapshot,
  previous: CCFArchivedNflverseSnapCountSnapshot | null | undefined,
): CCFSourceCorrectionStatus {
  if (!previous) return "none";
  validateSnapshot(previous);
  if (previous.season !== current.season || previous.requestedWeek !== current.requestedWeek) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "previous snap-count snapshot must match the current season/week",
    );
  }
  if (Date.parse(previous.knownAt) > Date.parse(current.knownAt)) {
    throw new CCFNflverseSnapCountsReliabilityError(
      "previous snap-count snapshot cannot be captured after the current snapshot",
    );
  }
  return previous.archive.manifest.contentSha256 === current.archive.manifest.contentSha256
    ? "none"
    : "reconciled";
}

function isCoverageOnlyIdentityBlocker(blocker: string): boolean {
  return (
    blocker.startsWith("unresolved_pfr_ids:") ||
    blocker.startsWith("canonical_unresolved_ids:") ||
    blocker.startsWith("canonical_ambiguous_ids:")
  );
}

/**
 * Derive one prospective observed-workload reliability observation from an
 * immutable full-scope nflverse/PFR snap-count capture. PFR identity is resolved
 * only through the archived PFR -> GSIS crosswalk and the governed GSIS -> CCF
 * receipt. Coverage misses count against reliability; future or invalid identity
 * evidence fails closed.
 *
 * This observation does not promote the source or clear intended-use rights.
 */
export function buildCCFNflverseSnapCountsReliabilityObservation(
  input: BuildCCFNflverseSnapCountsReliabilityObservationInput,
): CCFSourceReliabilityObservation {
  validateSnapshot(input.snapshot);
  requireText("sourceId", input.sourceId);
  requireText("checkpointId", input.checkpointId);
  requireText("criticalFieldPolicyRef", input.criticalFieldPolicyRef);
  requireText("correctionPolicyRef", input.correctionPolicyRef);
  requireText("checkpointPolicyRef", input.checkpointPolicyRef);

  const requestedPfrPlayerIds = Array.from(
    new Set(input.snapshot.rows.map((row) => row.pfrPlayerId)),
  ).sort();
  const identityAudit = auditCCFPFRPlayerIdentityBridge(
    input.crosswalk,
    input.identityReceipt,
    requestedPfrPlayerIds,
    input.snapshot.knownAt,
  );
  const fatalIdentityBlockers = identityAudit.blockers.filter(
    (blocker) => !isCoverageOnlyIdentityBlocker(blocker),
  );
  if (fatalIdentityBlockers.length > 0 || !identityAudit.identityBindingRef) {
    throw new CCFNflverseSnapCountsReliabilityError(
      `PFR identity evidence is ineligible for reliability observation: ${fatalIdentityBlockers.join(", ") || "identity_binding_ref_missing"}`,
    );
  }

  const currentArchiveRef = archiveRef(input.snapshot);
  const previous = input.previousSnapshot ?? null;
  const revisionStatus = correctionStatus(input.snapshot, previous);
  const previousArchiveRef = previous ? archiveRef(previous) : null;
  const criticalMissingCount = input.snapshot.rows.filter(rowHasCriticalMissingness).length;
  const observationNotes = [...(input.notes ?? [])];
  if (revisionStatus === "reconciled") {
    observationNotes.push("provider_snapshot_changed_with_archived_before_after_witnesses");
  }
  if (identityAudit.unresolvedPfrCount > 0) {
    observationNotes.push(`pfr_identity_unresolved:${identityAudit.unresolvedPfrCount}`);
  }
  if (identityAudit.canonicalUnresolvedCount > 0) {
    observationNotes.push(`canonical_identity_unresolved:${identityAudit.canonicalUnresolvedCount}`);
  }
  if (identityAudit.canonicalAmbiguousCount > 0) {
    observationNotes.push(`canonical_identity_ambiguous:${identityAudit.canonicalAmbiguousCount}`);
  }
  if (new Set(observationNotes).size !== observationNotes.length) {
    throw new CCFNflverseSnapCountsReliabilityError("notes must not contain duplicates");
  }

  const evidenceRefs = [
    currentArchiveRef,
    identityAudit.identityBindingRef,
    input.criticalFieldPolicyRef,
    input.correctionPolicyRef,
    input.checkpointPolicyRef,
  ];
  if (identityAudit.crosswalkArchiveRef) evidenceRefs.push(identityAudit.crosswalkArchiveRef);
  if (identityAudit.canonicalIdentityRef) evidenceRefs.push(identityAudit.canonicalIdentityRef);
  if (revisionStatus === "reconciled" && previousArchiveRef) {
    evidenceRefs.push(previousArchiveRef);
  }

  const observation: CCFSourceReliabilityObservation = {
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: [
      input.sourceId,
      "observed_workload",
      input.checkpointId,
      input.snapshot.archive.manifest.contentSha256,
      identityAudit.identityBindingRef,
    ].join(":"),
    sourceId: input.sourceId,
    producer: "nflverse",
    checkpointId: input.checkpointId,
    scheduledFor: input.scheduledFor,
    capturedAt: input.snapshot.knownAt,
    captureStatus: "success",
    parserVersion: input.snapshot.archive.manifest.parserVersion,
    archiveRef: currentArchiveRef,
    contentSha256: input.snapshot.archive.manifest.contentSha256,
    schemaStatus: "valid",
    rowCount: input.snapshot.rows.length,
    identityEligibleCount: identityAudit.requestedCount,
    identityResolvedCount: identityAudit.canonicalResolvedCount,
    criticalFieldEligibleCount: input.snapshot.rows.length,
    criticalFieldMissingCount: criticalMissingCount,
    duplicateKeyCount: duplicateKeyCount(input.snapshot),
    correctionStatus: revisionStatus,
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
    notes: observationNotes.sort(),
  };

  return validateCCFSourceReliabilityObservation(observation);
}
