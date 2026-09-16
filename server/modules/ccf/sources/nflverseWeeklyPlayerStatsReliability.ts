import type { CCFArchivedNflverseWeeklyPlayerStatsSnapshot } from "./archivedNflverseWeeklyPlayerStats";
import {
  auditCCFNFLPlayerIdentitySubset,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import {
  validateCCFSourceReliabilityObservation,
  type CCFSourceCorrectionStatus,
  type CCFSourceReliabilityObservation,
} from "./sourceReliabilityReview";

export interface BuildCCFNflverseWeeklyPlayerStatsReliabilityObservationInput {
  snapshot: CCFArchivedNflverseWeeklyPlayerStatsSnapshot;
  previousSnapshot?: CCFArchivedNflverseWeeklyPlayerStatsSnapshot | null;
  sourceId: string;
  checkpointId: string;
  scheduledFor: string;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  criticalFieldPolicyRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  notes?: string[];
}

export class CCFNflverseWeeklyPlayerStatsReliabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseWeeklyPlayerStatsReliabilityError";
  }
}

const REQUIRED_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const REQUIRED_PARSER_VERSION = "ccf-nflverse-player-stats-v2";

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(`${label} is required`);
  }
  return value;
}

function archiveRef(snapshot: CCFArchivedNflverseWeeklyPlayerStatsSnapshot): string {
  const value = snapshot.archive.manifest.archiveRef;
  if (!hasText(value)) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "archived weekly player stats snapshot is missing archiveRef",
    );
  }
  return value;
}

function sameFullPositionScope(snapshot: CCFArchivedNflverseWeeklyPlayerStatsSnapshot): boolean {
  const observed = [...snapshot.positions].sort();
  const required = [...REQUIRED_POSITIONS].sort();
  return observed.length === required.length && observed.every((value, index) => value === required[index]);
}

function validateSnapshot(snapshot: CCFArchivedNflverseWeeklyPlayerStatsSnapshot): void {
  const manifest = snapshot.archive.manifest;
  if (manifest.provider !== "nflverse" || manifest.dataset !== "stats_player_week") {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "reliability observation requires an archived nflverse weekly player-stats snapshot",
    );
  }
  if (manifest.parserVersion !== REQUIRED_PARSER_VERSION) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      `weekly player-stats reliability requires parser ${REQUIRED_PARSER_VERSION}`,
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "reliability observation requires a prospective CCF archived point-in-time capture",
    );
  }
  if (snapshot.knownAt !== manifest.knownAt || snapshot.retrievedAt !== manifest.retrievedAt) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!Number.isInteger(snapshot.requestedWeek) || (snapshot.requestedWeek ?? 0) <= 0) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "reliability observation requires a week-scoped weekly player-stats capture",
    );
  }
  if (!sameFullPositionScope(snapshot)) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "reliability observation requires the complete QB/RB/WR/TE position scope",
    );
  }
  if (snapshot.rows.length === 0) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "weekly player-stats snapshot rows must not be empty",
    );
  }
  for (const row of snapshot.rows) {
    if (row.season !== snapshot.season || row.week !== snapshot.requestedWeek) {
      throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
        "weekly player-stats snapshot contains rows outside the requested season/week",
      );
    }
  }
}

function rowKey(row: CCFArchivedNflverseWeeklyPlayerStatsSnapshot["rows"][number]): string {
  return [row.season, row.week, row.playerId].join("|");
}

function duplicateKeyCount(snapshot: CCFArchivedNflverseWeeklyPlayerStatsSnapshot): number {
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
  row: CCFArchivedNflverseWeeklyPlayerStatsSnapshot["rows"][number],
): boolean {
  if (!hasText(row.team) || !hasText(row.opponentTeam)) return true;
  return [
    row.passingYards,
    row.passingTouchdowns,
    row.passingInterceptions,
    row.sacksTaken,
    row.passingTwoPointConversions,
    row.rushingYards,
    row.rushingTouchdowns,
    row.rushingTwoPointConversions,
    row.receptions,
    row.receivingYards,
    row.receivingTouchdowns,
    row.receivingTwoPointConversions,
    row.fumblesLostTotal,
    row.specialTeamsTouchdowns,
  ].some((value) => !Number.isFinite(value));
}

function correctionStatus(
  current: CCFArchivedNflverseWeeklyPlayerStatsSnapshot,
  previous: CCFArchivedNflverseWeeklyPlayerStatsSnapshot | null | undefined,
): CCFSourceCorrectionStatus {
  if (!previous) return "none";
  validateSnapshot(previous);
  if (
    previous.season !== current.season ||
    previous.requestedWeek !== current.requestedWeek
  ) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      "previous weekly player-stats snapshot must match the current season/week",
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
 * Derive one prospective reliability observation from an immutable, complete
 * nflverse weekly box-score capture. Identity resolution is measured from the
 * governed GSIS -> canonical CCF receipt; unresolved or ambiguous identities
 * count against reliability but are never guessed through.
 *
 * This observation does not promote the source or clear intended-use rights.
 */
export function buildCCFNflverseWeeklyPlayerStatsReliabilityObservation(
  input: BuildCCFNflverseWeeklyPlayerStatsReliabilityObservationInput,
): CCFSourceReliabilityObservation {
  validateSnapshot(input.snapshot);
  requireText("sourceId", input.sourceId);
  requireText("checkpointId", input.checkpointId);
  requireText("criticalFieldPolicyRef", input.criticalFieldPolicyRef);
  requireText("correctionPolicyRef", input.correctionPolicyRef);
  requireText("checkpointPolicyRef", input.checkpointPolicyRef);

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
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError(
      `NFL identity evidence is ineligible for reliability observation: ${fatalIdentityBlockers.join(", ") || "identity_binding_ref_missing"}`,
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
  if (identityAudit.unresolvedCount > 0) {
    observationNotes.push(`identity_unresolved:${identityAudit.unresolvedCount}`);
  }
  if (identityAudit.ambiguousCount > 0) {
    observationNotes.push(`identity_ambiguous:${identityAudit.ambiguousCount}`);
  }
  if (new Set(observationNotes).size !== observationNotes.length) {
    throw new CCFNflverseWeeklyPlayerStatsReliabilityError("notes must not contain duplicates");
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
      "weekly_box_score",
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
    criticalFieldEligibleCount: input.snapshot.rows.length,
    criticalFieldMissingCount: criticalMissingCount,
    duplicateKeyCount: duplicateKeyCount(input.snapshot),
    correctionStatus: revisionStatus,
    evidenceRefs: Array.from(new Set(evidenceRefs)).sort(),
    notes: observationNotes.sort(),
  };

  return validateCCFSourceReliabilityObservation(observation);
}
