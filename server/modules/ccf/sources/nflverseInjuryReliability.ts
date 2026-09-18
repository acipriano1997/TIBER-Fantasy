import type { CCFArchivedNflverseInjurySnapshot } from "./archivedNflverseInjuries";
import {
  auditCCFNFLPlayerIdentitySubset,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
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
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
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

const REQUIRED_PARSER_VERSION = "ccf-nflverse-injuries-candidate-v2";

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) throw new CCFNflverseInjuryReliabilityError(`${label} is required`);
  return value;
}

function checkpointWeek(checkpointId: string): number | null {
  const normalized = checkpointId.trim().toLowerCase();
  const match = /^(?:week-|w)(\d+)-/.exec(normalized);
  return match ? Number(match[1]) : null;
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
  if (manifest.parserVersion !== REQUIRED_PARSER_VERSION) {
    throw new CCFNflverseInjuryReliabilityError(
      `injury reliability requires parser ${REQUIRED_PARSER_VERSION}`,
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
  if (Date.parse(previous.knownAt) > Date.parse(current.knownAt)) {
    throw new CCFNflverseInjuryReliabilityError(
      "previous injury snapshot cannot be captured after the current snapshot",
    );
  }
  return previous.archive.manifest.contentSha256 === current.archive.manifest.contentSha256
    ? "none"
    : "reconciled";
}

function isCoverageOnlyIdentityBlocker(blocker: string): boolean {
  return (
    blocker.startsWith("unresolved_requested_ids:") ||
    blocker.startsWith("ambiguous_requested_ids:")
  );
}

/**
 * Derive one capability-specific reliability observation from an immutable
 * nflverse injury capture. Quality counts come from the archived snapshot and
 * identity resolution comes from one frozen GSIS -> canonical CCF receipt.
 * Unresolved/ambiguous identities are measured as reliability misses; invalid,
 * future, or otherwise temporally ineligible identity evidence is rejected.
 */
export function buildCCFNflverseInjuryReliabilityObservation(
  input: BuildCCFNflverseInjuryReliabilityObservationInput,
): CCFSourceReliabilityObservation {
  validateSnapshot(input.snapshot);
  requireText("sourceId", input.sourceId);
  requireText("checkpointId", input.checkpointId);
  requireText("criticalFieldPolicyRef", input.criticalFieldPolicyRef);
  requireText("correctionPolicyRef", input.correctionPolicyRef);
  requireText("checkpointPolicyRef", input.checkpointPolicyRef);

  const expectedWeek = checkpointWeek(input.checkpointId);
  if (expectedWeek != null && input.snapshot.requestedWeek !== expectedWeek) {
    throw new CCFNflverseInjuryReliabilityError(
      `checkpoint ${input.checkpointId} requires week ${expectedWeek} evidence`,
    );
  }

  const requestedSourcePlayerIds = Array.from(
    new Set(input.snapshot.rows.map((row) => row.playerId)),
  ).sort();
  const identityAudit = auditCCFNFLPlayerIdentitySubset(
    input.identityReceipt,
    requestedSourcePlayerIds,
    input.snapshot.knownAt,
  );
  const fatalIdentityBlockers = identityAudit.blockers.filter(
    (blocker) => !isCoverageOnlyIdentityBlocker(blocker),
  );
  if (fatalIdentityBlockers.length > 0 || !identityAudit.identityBindingRef) {
    throw new CCFNflverseInjuryReliabilityError(
      `NFL identity evidence is ineligible for reliability observation: ${fatalIdentityBlockers.join(", ") || "identity_binding_ref_missing"}`,
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
  if (identityAudit.unresolvedCount > 0) {
    observationNotes.push(`identity_unresolved:${identityAudit.unresolvedCount}`);
  }
  if (identityAudit.ambiguousCount > 0) {
    observationNotes.push(`identity_ambiguous:${identityAudit.ambiguousCount}`);
  }
  if (new Set(observationNotes).size !== observationNotes.length) {
    throw new CCFNflverseInjuryReliabilityError("notes must not contain duplicates");
  }

  const evidenceRefs = [
    currentArchiveRef,
    identityAudit.identityBindingRef,
    input.criticalFieldPolicyRef,
    input.correctionPolicyRef,
    input.checkpointPolicyRef,
  ];
  if (revisionStatus === "reconciled" && previousArchiveRef) {
    evidenceRefs.push(previousArchiveRef);
  }

  const identityEligibleCount =
    identityAudit.requestedCount - identityAudit.notApplicableCount;
  const observation: CCFSourceReliabilityObservation = {
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: [
      input.sourceId,
      input.capability,
      input.checkpointId,
      input.snapshot.archive.manifest.contentSha256,
      identityAudit.receiptFingerprint,
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
    identityEligibleCount,
    identityResolvedCount: identityAudit.resolvedCount,
    criticalFieldEligibleCount: critical.eligible,
    criticalFieldMissingCount: critical.missing,
    duplicateKeyCount: duplicateKeyCount(input.snapshot),
    correctionStatus: revisionStatus,
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
    notes: observationNotes.sort(),
  };

  return validateCCFSourceReliabilityObservation(observation);
}
