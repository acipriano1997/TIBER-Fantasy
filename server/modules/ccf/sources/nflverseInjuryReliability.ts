import type { CCFArchivedNflverseInjurySnapshot } from "./archivedNflverseInjuries";
import {
  validateCCFSourceReliabilityObservation,
  type CCFSourceCorrectionStatus,
  type CCFSourceReliabilityObservation,
} from "./sourceReliabilityReview";

export type CCFNflverseInjuryReliabilityCapability =
  | "injury_designation"
  | "practice_participation";

export interface BuildCCFNflverseInjuryReliabilityObservationInput {
  snapshot: CCFArchivedNflverseInjurySnapshot;
  previousSnapshot?: CCFArchivedNflverseInjurySnapshot | null;
  capability: CCFNflverseInjuryReliabilityCapability;
  sourceId: string;
  checkpointId: string;
  scheduledFor: string;
  resolvedSourcePlayerIds: readonly string[];
  identityBindingRef: string;
  criticalFieldPolicyRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  notes?: string[];
}

export class CCFNflverseInjuryReliabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseInjuryReliabilityError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) throw new CCFNflverseInjuryReliabilityError(`${label} is required`);
  return value;
}

function archiveRef(snapshot: CCFArchivedNflverseInjurySnapshot): string {
  const value = snapshot.archive.manifest.archiveRef;
  if (!hasText(value)) {
    throw new CCFNflverseInjuryReliabilityError("archived injury snapshot is missing archiveRef");
  }
  return value;
}

function validateSnapshot(snapshot: CCFArchivedNflverseInjurySnapshot): void {
  const manifest = snapshot.archive.manifest;
  if (manifest.provider !== "nflverse" || manifest.dataset !== "injuries") {
    throw new CCFNflverseInjuryReliabilityError(
      "reliability observation requires an archived nflverse injuries snapshot",
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNflverseInjuryReliabilityError(
      "reliability observation requires a prospective CCF archived point-in-time capture",
    );
  }
  if (snapshot.knownAt !== manifest.knownAt || snapshot.retrievedAt !== manifest.retrievedAt) {
    throw new CCFNflverseInjuryReliabilityError(
      "snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!Number.isInteger(snapshot.requestedWeek) || (snapshot.requestedWeek ?? 0) <= 0) {
    throw new CCFNflverseInjuryReliabilityError(
      "reliability observation requires a week-scoped injury capture",
    );
  }
  if (snapshot.rows.length === 0) {
    throw new CCFNflverseInjuryReliabilityError("injury snapshot rows must not be empty");
  }
  for (const row of snapshot.rows) {
    if (row.season !== snapshot.season || row.week !== snapshot.requestedWeek) {
      throw new CCFNflverseInjuryReliabilityError(
        "injury snapshot contains rows outside the requested season/week",
      );
    }
  }
}

function rowKey(row: CCFArchivedNflverseInjurySnapshot["rows"][number]): string {
  return [row.season, row.week, row.team, row.playerId].join("|");
}

function duplicateKeyCount(snapshot: CCFArchivedNflverseInjurySnapshot): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of snapshot.rows) {
    const key = rowKey(row);
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function designationEligible(
  row: CCFArchivedNflverseInjurySnapshot["rows"][number],
): boolean {
  return Boolean(
    row.reportPrimaryInjury ||
      row.reportSecondaryInjury ||
      row.reportStatus,
  );
}

function practiceEligible(
  row: CCFArchivedNflverseInjurySnapshot["rows"][number],
): boolean {
  return Boolean(
    row.practicePrimaryInjury ||
      row.practiceSecondaryInjury ||
      row.practiceStatus,
  );
}

function criticalFieldCounts(
  snapshot: CCFArchivedNflverseInjurySnapshot,
  capability: CCFNflverseInjuryReliabilityCapability,
): { eligible: number; missing: number } {
  const eligibleRows = snapshot.rows.filter((row) =>
    capability === "injury_designation" ? designationEligible(row) : practiceEligible(row),
  );
  const missing = eligibleRows.filter((row) =>
    capability === "injury_designation" ? !row.reportStatus : !row.practiceStatus,
  ).length;
  return { eligible: eligibleRows.length, missing };
}

function correctionStatus(
  current: CCFArchivedNflverseInjurySnapshot,
  previous: CCFArchivedNflverseInjurySnapshot | null | undefined,
): CCFSourceCorrectionStatus {
  if (!previous) return "none";
  validateSnapshot(previous);
  if (
    previous.season !== current.season ||
    previous.requestedWeek !== current.requestedWeek
  ) {
    throw new CCFNflverseInjuryReliabilityError(
      "previous injury snapshot must match the current season/week",
    );
  }
  return previous.archive.manifest.contentSha256 === current.archive.manifest.contentSha256
    ? "none"
    : "reconciled";
}

/**
 * Derive one capability-specific reliability observation from an immutable
 * nflverse injury capture. Quality counts are computed from the parsed rows and
 * the caller supplies only the already-governed identity-resolution result and
 * frozen policy references. A content change is considered reconciled only
 * when both current and previous exact archives are present.
 */
export function buildCCFNflverseInjuryReliabilityObservation(
  input: BuildCCFNflverseInjuryReliabilityObservationInput,
): CCFSourceReliabilityObservation {
  validateSnapshot(input.snapshot);
  requireText("sourceId", input.sourceId);
  requireText("checkpointId", input.checkpointId);
  requireText("identityBindingRef", input.identityBindingRef);
  requireText("criticalFieldPolicyRef", input.criticalFieldPolicyRef);
  requireText("correctionPolicyRef", input.correctionPolicyRef);
  requireText("checkpointPolicyRef", input.checkpointPolicyRef);

  const resolvedIds = new Set(input.resolvedSourcePlayerIds);
  if (resolvedIds.size !== input.resolvedSourcePlayerIds.length) {
    throw new CCFNflverseInjuryReliabilityError(
      "resolvedSourcePlayerIds must not contain duplicates",
    );
  }
  if (input.resolvedSourcePlayerIds.some((playerId) => !hasText(playerId))) {
    throw new CCFNflverseInjuryReliabilityError(
      "resolvedSourcePlayerIds must contain non-empty source player IDs",
    );
  }

  const currentArchiveRef = archiveRef(input.snapshot);
  const previous = input.previousSnapshot ?? null;
  const revisionStatus = correctionStatus(input.snapshot, previous);
  const previousArchiveRef = previous ? archiveRef(previous) : null;
  const critical = criticalFieldCounts(input.snapshot, input.capability);
  const observationNotes = [...(input.notes ?? [])];
  if (revisionStatus === "reconciled") {
    observationNotes.push("provider_snapshot_changed_with_archived_before_after_witnesses");
  }
  if (new Set(observationNotes).size !== observationNotes.length) {
    throw new CCFNflverseInjuryReliabilityError("notes must not contain duplicates");
  }

  const evidenceRefs = [
    currentArchiveRef,
    input.identityBindingRef,
    input.criticalFieldPolicyRef,
    input.correctionPolicyRef,
    input.checkpointPolicyRef,
  ];
  if (revisionStatus === "reconciled" && previousArchiveRef) {
    evidenceRefs.push(previousArchiveRef);
  }

  const observation: CCFSourceReliabilityObservation = {
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: [
      input.sourceId,
      input.capability,
      input.checkpointId,
      input.snapshot.archive.manifest.contentSha256,
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
    identityEligibleCount: input.snapshot.rows.length,
    identityResolvedCount: input.snapshot.rows.filter((row) => resolvedIds.has(row.playerId)).length,
    criticalFieldEligibleCount: critical.eligible,
    criticalFieldMissingCount: critical.missing,
    duplicateKeyCount: duplicateKeyCount(input.snapshot),
    correctionStatus: revisionStatus,
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
    notes: observationNotes.sort(),
  };

  return validateCCFSourceReliabilityObservation(observation);
}
