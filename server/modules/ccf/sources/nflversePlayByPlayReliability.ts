import type { CCFArchivedNflversePlayByPlaySnapshot } from "./archivedNflversePlayByPlay";
import {
  auditCCFNFLPlayerIdentitySubset,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import type { CCFNflversePbpBinaryField } from "./nflversePlayByPlay";
import {
  validateCCFSourceReliabilityObservation,
  type CCFSourceCorrectionStatus,
  type CCFSourceReliabilityObservation,
} from "./sourceReliabilityReview";

export interface BuildCCFNflversePlayByPlayReliabilityObservationInput {
  snapshot: CCFArchivedNflversePlayByPlaySnapshot;
  previousSnapshot?: CCFArchivedNflversePlayByPlaySnapshot | null;
  sourceId: string;
  checkpointId: string;
  scheduledFor: string;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  criticalFieldPolicyRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  notes?: string[];
}

export class CCFNflversePlayByPlayReliabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflversePlayByPlayReliabilityError";
  }
}

const REQUIRED_PARSER_VERSION = "ccf-nflverse-play-by-play-candidate-v2";
const PASS_BINARY_FIELDS: CCFNflversePbpBinaryField[] = [
  "pass_attempt",
  "qb_dropback",
  "sack",
  "complete_pass",
  "two_point_attempt",
];
const RUN_BINARY_FIELDS: CCFNflversePbpBinaryField[] = [
  "rush_attempt",
  "qb_kneel",
  "two_point_attempt",
];
const KNEEL_BINARY_FIELDS: CCFNflversePbpBinaryField[] = [
  "rush_attempt",
  "qb_kneel",
];

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) {
    throw new CCFNflversePlayByPlayReliabilityError(`${label} is required`);
  }
  return value;
}

function archiveRef(snapshot: CCFArchivedNflversePlayByPlaySnapshot): string {
  const value = snapshot.archive.manifest.archiveRef;
  if (!hasText(value)) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "archived play-by-play snapshot is missing archiveRef",
    );
  }
  return value;
}

function validateSnapshot(snapshot: CCFArchivedNflversePlayByPlaySnapshot): void {
  const manifest = snapshot.archive.manifest;
  if (manifest.provider !== "nflverse" || manifest.dataset !== "play_by_play") {
    throw new CCFNflversePlayByPlayReliabilityError(
      "reliability observation requires an archived nflverse play-by-play snapshot",
    );
  }
  if (manifest.parserVersion !== REQUIRED_PARSER_VERSION) {
    throw new CCFNflversePlayByPlayReliabilityError(
      `play-by-play reliability requires parser ${REQUIRED_PARSER_VERSION}`,
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "reliability observation requires a prospective CCF archived point-in-time capture",
    );
  }
  if (snapshot.knownAt !== manifest.knownAt || snapshot.retrievedAt !== manifest.retrievedAt) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!Number.isInteger(snapshot.requestedWeek) || (snapshot.requestedWeek ?? 0) <= 0) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "reliability observation requires a week-scoped play-by-play capture",
    );
  }
  if (snapshot.rows.length === 0) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "play-by-play snapshot rows must not be empty",
    );
  }
  for (const row of snapshot.rows) {
    if (row.season !== snapshot.season || row.week !== snapshot.requestedWeek) {
      throw new CCFNflversePlayByPlayReliabilityError(
        "play-by-play snapshot contains rows outside the requested season/week",
      );
    }
  }
}

function checkpointWeek(checkpointId: string): number | null {
  const match = /^w(\d+)-/.exec(checkpointId.trim().toLowerCase());
  return match ? Number(match[1]) : null;
}

function duplicateKeyCount(snapshot: CCFArchivedNflversePlayByPlaySnapshot): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of snapshot.rows) {
    const key = `${row.season}|${row.week}|${row.gameId}|${row.playId}`;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function auditCriticalOpportunityFields(
  snapshot: CCFArchivedNflversePlayByPlaySnapshot,
): { eligibleCount: number; missingCount: number } {
  let eligibleCount = 0;
  let missingCount = 0;

  const check = (missing: boolean): void => {
    eligibleCount += 1;
    if (missing) missingCount += 1;
  };

  const checkBinaryFields = (
    missingFields: ReadonlySet<CCFNflversePbpBinaryField>,
    fields: readonly CCFNflversePbpBinaryField[],
  ): void => {
    for (const field of fields) check(missingFields.has(field));
  };

  for (const row of snapshot.rows) {
    const missingBinary = new Set(row.missingBinaryFields);
    const hasOpportunitySignal =
      row.passAttempt || row.rushAttempt || row.qbDropback || row.sack || row.qbKneel;

    if (!row.playType && hasOpportunitySignal) {
      check(true);
    }

    if (row.playType === "pass") {
      check(!hasText(row.offenseTeam));
      checkBinaryFields(missingBinary, PASS_BINARY_FIELDS);

      if (row.qbDropback || row.passAttempt || row.sack) {
        check(!hasText(row.passerPlayerId));
      }

      const receiverAttributionRequired =
        row.passAttempt &&
        !row.twoPointAttempt &&
        (row.completePass || row.airYards != null || row.yardsAfterCatch != null);
      if (receiverAttributionRequired) {
        check(!hasText(row.receiverPlayerId));
      }
      if (row.passAttempt && !row.twoPointAttempt && hasText(row.receiverPlayerId)) {
        check(row.yardline100 == null);
      }
    } else if (row.playType === "run") {
      check(!hasText(row.offenseTeam));
      checkBinaryFields(missingBinary, RUN_BINARY_FIELDS);
      const opportunityCarry = row.rushAttempt && !row.qbKneel && !row.twoPointAttempt;
      if (opportunityCarry) {
        check(!hasText(row.rusherPlayerId));
        check(row.yardline100 == null);
      }
    } else if (row.playType === "qb_kneel") {
      check(!hasText(row.offenseTeam));
      checkBinaryFields(missingBinary, KNEEL_BINARY_FIELDS);
    } else if (row.playType === "qb_spike") {
      check(!hasText(row.offenseTeam));
      checkBinaryFields(missingBinary, PASS_BINARY_FIELDS);
      if (row.passAttempt) check(!hasText(row.passerPlayerId));
    }

    if (row.twoPointAttempt) {
      check(
        !hasText(row.passerPlayerId) &&
          !hasText(row.rusherPlayerId) &&
          !hasText(row.receiverPlayerId),
      );
    }
  }

  return { eligibleCount, missingCount };
}

function correctionStatus(
  current: CCFArchivedNflversePlayByPlaySnapshot,
  previous: CCFArchivedNflversePlayByPlaySnapshot | null | undefined,
): CCFSourceCorrectionStatus {
  if (!previous) return "none";
  validateSnapshot(previous);
  if (
    previous.season !== current.season ||
    previous.requestedWeek !== current.requestedWeek
  ) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "previous play-by-play snapshot must match the current season/week",
    );
  }
  if (Date.parse(previous.knownAt) > Date.parse(current.knownAt)) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "previous play-by-play snapshot cannot be captured after the current snapshot",
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
 * Build one prospective PBP opportunity reliability observation. The parser
 * preserves play_type and provider binary missingness so quality is measured
 * only where a field or player attribution is semantically required.
 *
 * Throwaways and non-play rows are not converted into false receiver misses;
 * unresolved canonical player IDs remain measured misses. Invalid/future
 * identity evidence is fatal. This does not promote nflverse or clear rights.
 */
export function buildCCFNflversePlayByPlayReliabilityObservation(
  input: BuildCCFNflversePlayByPlayReliabilityObservationInput,
): CCFSourceReliabilityObservation {
  validateSnapshot(input.snapshot);
  requireText("sourceId", input.sourceId);
  requireText("checkpointId", input.checkpointId);
  requireText("criticalFieldPolicyRef", input.criticalFieldPolicyRef);
  requireText("correctionPolicyRef", input.correctionPolicyRef);
  requireText("checkpointPolicyRef", input.checkpointPolicyRef);

  const expectedWeek = checkpointWeek(input.checkpointId);
  if (expectedWeek != null && input.snapshot.requestedWeek !== expectedWeek) {
    throw new CCFNflversePlayByPlayReliabilityError(
      `checkpoint ${input.checkpointId} requires week ${expectedWeek} evidence`,
    );
  }

  const requestedSourcePlayerIds = Array.from(
    new Set(input.snapshot.opportunities.map((row) => row.playerId).filter(hasText)),
  ).sort();
  if (requestedSourcePlayerIds.length === 0) {
    throw new CCFNflversePlayByPlayReliabilityError(
      "play-by-play reliability requires at least one derived player opportunity",
    );
  }
  const identityAudit = auditCCFNFLPlayerIdentitySubset(
    input.identityReceipt,
    requestedSourcePlayerIds,
    input.snapshot.knownAt,
  );
  const fatalIdentityBlockers = identityAudit.blockers.filter(
    (blocker) => !isCoverageOnlyIdentityBlocker(blocker),
  );
  if (fatalIdentityBlockers.length > 0 || !identityAudit.identityBindingRef) {
    throw new CCFNflversePlayByPlayReliabilityError(
      `NFL identity evidence is ineligible for reliability observation: ${fatalIdentityBlockers.join(", ") || "identity_binding_ref_missing"}`,
    );
  }

  const currentArchiveRef = archiveRef(input.snapshot);
  const previous = input.previousSnapshot ?? null;
  const revisionStatus = correctionStatus(input.snapshot, previous);
  const previousArchiveRef = previous ? archiveRef(previous) : null;
  const critical = auditCriticalOpportunityFields(input.snapshot);

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
    throw new CCFNflversePlayByPlayReliabilityError("notes must not contain duplicates");
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

  const identityEligibleCount = identityAudit.requestedCount - identityAudit.notApplicableCount;
  const observation: CCFSourceReliabilityObservation = {
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: [
      input.sourceId,
      "play_by_play_opportunity",
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
    criticalFieldEligibleCount: critical.eligibleCount,
    criticalFieldMissingCount: critical.missingCount,
    duplicateKeyCount: duplicateKeyCount(input.snapshot),
    correctionStatus: revisionStatus,
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
    notes: observationNotes.sort(),
  };

  return validateCCFSourceReliabilityObservation(observation);
}
