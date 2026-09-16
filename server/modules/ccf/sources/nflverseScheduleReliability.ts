import type { CCFArchivedNflverseScheduleSnapshot } from "./archivedNflverseSchedule";
import {
  assertCCFNflverseScheduleIdentityResolved,
  type CCFNflverseScheduleIdentityPolicyReceipt,
} from "./nflverseScheduleIdentity";
import {
  validateCCFSourceReliabilityObservation,
  type CCFSourceCorrectionStatus,
  type CCFSourceReliabilityObservation,
} from "./sourceReliabilityReview";

export interface BuildCCFNflverseScheduleReliabilityObservationInput {
  snapshot: CCFArchivedNflverseScheduleSnapshot;
  previousSnapshot?: CCFArchivedNflverseScheduleSnapshot | null;
  sourceId: string;
  checkpointId: string;
  scheduledFor: string;
  identityPolicyReceipt: CCFNflverseScheduleIdentityPolicyReceipt;
  criticalFieldPolicyRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  notes?: string[];
}

export class CCFNflverseScheduleReliabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseScheduleReliabilityError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) {
    throw new CCFNflverseScheduleReliabilityError(`${label} is required`);
  }
  return value;
}

function archiveRef(snapshot: CCFArchivedNflverseScheduleSnapshot): string {
  const value = snapshot.archive.manifest.archiveRef;
  if (!hasText(value)) {
    throw new CCFNflverseScheduleReliabilityError(
      "archived schedule snapshot is missing archiveRef",
    );
  }
  return value;
}

function validateSnapshot(snapshot: CCFArchivedNflverseScheduleSnapshot): void {
  const manifest = snapshot.archive.manifest;
  if (manifest.provider !== "nflverse" || manifest.dataset !== "schedules") {
    throw new CCFNflverseScheduleReliabilityError(
      "reliability observation requires an archived nflverse schedule snapshot",
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNflverseScheduleReliabilityError(
      "reliability observation requires a prospective CCF archived point-in-time capture",
    );
  }
  if (snapshot.knownAt !== manifest.knownAt || snapshot.retrievedAt !== manifest.retrievedAt) {
    throw new CCFNflverseScheduleReliabilityError(
      "snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!Number.isInteger(snapshot.requestedWeek) || (snapshot.requestedWeek ?? 0) <= 0) {
    throw new CCFNflverseScheduleReliabilityError(
      "reliability observation requires a week-scoped schedule capture",
    );
  }
  if (snapshot.rows.length === 0) {
    throw new CCFNflverseScheduleReliabilityError("schedule snapshot rows must not be empty");
  }

  const gameIds = new Set<string>();
  for (const row of snapshot.rows) {
    if (row.season !== snapshot.season || row.week !== snapshot.requestedWeek) {
      throw new CCFNflverseScheduleReliabilityError(
        "schedule snapshot contains rows outside the requested season/week",
      );
    }
    if (
      !hasText(row.gameId) ||
      !hasText(row.gameday) ||
      !hasText(row.gametimeEt) ||
      !hasText(row.kickoffAt) ||
      !hasText(row.awayTeam) ||
      !hasText(row.homeTeam)
    ) {
      throw new CCFNflverseScheduleReliabilityError(
        "schedule snapshot contains a row missing critical identity or kickoff fields",
      );
    }
    if (gameIds.has(row.gameId)) {
      throw new CCFNflverseScheduleReliabilityError(
        `schedule snapshot contains duplicate gameId ${row.gameId}`,
      );
    }
    gameIds.add(row.gameId);
  }
}

function correctionStatus(
  current: CCFArchivedNflverseScheduleSnapshot,
  previous: CCFArchivedNflverseScheduleSnapshot | null | undefined,
): CCFSourceCorrectionStatus {
  if (!previous) return "none";
  validateSnapshot(previous);
  if (
    previous.season !== current.season ||
    previous.requestedWeek !== current.requestedWeek
  ) {
    throw new CCFNflverseScheduleReliabilityError(
      "previous schedule snapshot must match the current season/week",
    );
  }
  return previous.archive.manifest.contentSha256 === current.archive.manifest.contentSha256
    ? "none"
    : "reconciled";
}

/**
 * Derive one prospective reliability observation from an immutable nflverse
 * schedule capture.
 *
 * Identity resolution is intentionally provider-native. A frozen, fingerprinted
 * identity policy must explicitly declare that nflverse `game_id` plus nflverse
 * team abbreviations are the source-local schedule key. This builder never
 * treats a caller-supplied string as proof of identity and never claims a
 * cross-provider canonical game identity.
 *
 * This does not promote the source, clear intended-use rights, or create a
 * universal game-identity registry.
 */
export function buildCCFNflverseScheduleReliabilityObservation(
  input: BuildCCFNflverseScheduleReliabilityObservationInput,
): CCFSourceReliabilityObservation {
  validateSnapshot(input.snapshot);
  requireText("sourceId", input.sourceId);
  requireText("checkpointId", input.checkpointId);
  requireText("criticalFieldPolicyRef", input.criticalFieldPolicyRef);
  requireText("correctionPolicyRef", input.correctionPolicyRef);
  requireText("checkpointPolicyRef", input.checkpointPolicyRef);

  const identityAudit = assertCCFNflverseScheduleIdentityResolved(
    input.snapshot,
    input.identityPolicyReceipt,
    input.snapshot.knownAt,
  );
  if (!identityAudit.identityBindingRef) {
    throw new CCFNflverseScheduleReliabilityError(
      "resolved schedule identity audit must provide identityBindingRef",
    );
  }

  const currentArchiveRef = archiveRef(input.snapshot);
  const previous = input.previousSnapshot ?? null;
  const revisionStatus = correctionStatus(input.snapshot, previous);
  const previousArchiveRef = previous ? archiveRef(previous) : null;
  const observationNotes = [...(input.notes ?? [])];
  if (revisionStatus === "reconciled") {
    observationNotes.push("provider_snapshot_changed_with_archived_before_after_witnesses");
  }
  if (new Set(observationNotes).size !== observationNotes.length) {
    throw new CCFNflverseScheduleReliabilityError("notes must not contain duplicates");
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

  const rowCount = input.snapshot.rows.length;
  const observation: CCFSourceReliabilityObservation = {
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: [
      input.sourceId,
      "nfl_schedule",
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
    rowCount,
    identityEligibleCount: identityAudit.eligibleCount,
    identityResolvedCount: identityAudit.resolvedCount,
    criticalFieldEligibleCount: rowCount,
    criticalFieldMissingCount: 0,
    duplicateKeyCount: 0,
    correctionStatus: revisionStatus,
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
    notes: observationNotes.sort(),
  };

  return validateCCFSourceReliabilityObservation(observation);
}
