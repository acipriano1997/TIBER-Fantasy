import crypto from "crypto";
import type { CCFArchivedNflversePlayerIdCrosswalkSnapshot } from "./archivedNflversePlayerIdCrosswalk";
import {
  auditCCFNFLPlayerIdentitySubset,
  refCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";

export interface CCFPFRPlayerIdentityBridgeAudit {
  contractVersion: "ccf-pfr-player-identity-bridge-audit-v1";
  asOf: string;
  requestedCount: number;
  pfrToGsisResolvedCount: number;
  canonicalResolvedCount: number;
  unresolvedPfrCount: number;
  canonicalUnresolvedCount: number;
  canonicalAmbiguousCount: number;
  resolvedPfrPlayerIds: string[];
  identityBindingRef: string | null;
  crosswalkArchiveRef: string | null;
  canonicalIdentityRef: string | null;
  blockers: string[];
}

export class CCFPFRPlayerIdentityBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFPFRPlayerIdentityBridgeError";
  }
}

const REQUIRED_CROSSWALK_PARSER = "ccf-nflverse-pfr-gsis-crosswalk-v1";

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validateCrosswalkSnapshot(
  snapshot: CCFArchivedNflversePlayerIdCrosswalkSnapshot,
): void {
  const manifest = snapshot.archive.manifest;
  if (manifest.provider !== "nflverse" || manifest.dataset !== "players") {
    throw new CCFPFRPlayerIdentityBridgeError(
      "PFR identity bridge requires an archived nflverse players snapshot",
    );
  }
  if (manifest.parserVersion !== REQUIRED_CROSSWALK_PARSER) {
    throw new CCFPFRPlayerIdentityBridgeError(
      `PFR identity bridge requires parser ${REQUIRED_CROSSWALK_PARSER}`,
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture"
  ) {
    throw new CCFPFRPlayerIdentityBridgeError(
      "PFR identity bridge requires a prospective archived point-in-time crosswalk",
    );
  }
  if (snapshot.knownAt !== manifest.knownAt || snapshot.retrievedAt !== manifest.retrievedAt) {
    throw new CCFPFRPlayerIdentityBridgeError(
      "crosswalk snapshot timestamps must match immutable archive manifest",
    );
  }
  if (!hasText(manifest.archiveRef) || !hasText(manifest.contentSha256)) {
    throw new CCFPFRPlayerIdentityBridgeError(
      "crosswalk snapshot requires immutable archive reference and content hash",
    );
  }
  if (snapshot.rows.length === 0) {
    throw new CCFPFRPlayerIdentityBridgeError("crosswalk snapshot rows must not be empty");
  }

  const seenPfr = new Set<string>();
  const seenGsis = new Set<string>();
  for (const row of snapshot.rows) {
    if (!hasText(row.pfrId) || !hasText(row.gsisId)) {
      throw new CCFPFRPlayerIdentityBridgeError(
        "crosswalk snapshot contains an empty PFR or GSIS id",
      );
    }
    if (seenPfr.has(row.pfrId)) {
      throw new CCFPFRPlayerIdentityBridgeError(
        `crosswalk snapshot contains duplicate PFR player id ${row.pfrId}`,
      );
    }
    if (seenGsis.has(row.gsisId)) {
      throw new CCFPFRPlayerIdentityBridgeError(
        `crosswalk snapshot contains duplicate GSIS player id ${row.gsisId}`,
      );
    }
    seenPfr.add(row.pfrId);
    seenGsis.add(row.gsisId);
  }
}

function bridgeBindingRef(
  crosswalk: CCFArchivedNflversePlayerIdCrosswalkSnapshot,
  canonicalIdentityRef: string,
): string {
  const payload = JSON.stringify({
    contractVersion: "ccf-pfr-player-identity-bridge-binding-v1",
    crosswalkArchiveRef: crosswalk.archive.manifest.archiveRef,
    crosswalkContentSha256: crosswalk.archive.manifest.contentSha256,
    crosswalkParserVersion: crosswalk.archive.manifest.parserVersion,
    canonicalIdentityRef,
  });
  const fingerprint = crypto.createHash("sha256").update(payload).digest("hex");
  return `ccf://pfr-player-identity-bridge/sha256/${fingerprint}`;
}

function isCoverageOnlyCanonicalBlocker(blocker: string): boolean {
  return (
    blocker.startsWith("unresolved_requested_ids:") ||
    blocker.startsWith("ambiguous_requested_ids:")
  );
}

/**
 * Audit exact PFR IDs through two independently governed links:
 * PFR -> GSIS from one archived nflverse players snapshot, then GSIS ->
 * canonical CCF from the existing identity receipt contract.
 *
 * Names are never consulted. Missing PFR rows and unresolved/ambiguous
 * canonical rows are measured as coverage misses. Future, invalid, or otherwise
 * temporally ineligible evidence is fatal and cannot be backdated.
 */
export function auditCCFPFRPlayerIdentityBridge(
  crosswalk: CCFArchivedNflversePlayerIdCrosswalkSnapshot,
  canonicalReceipt: CCFNFLPlayerIdentityLinkageReceipt,
  requestedPfrPlayerIds: readonly string[],
  asOf: string,
): CCFPFRPlayerIdentityBridgeAudit {
  const blockers = new Set<string>();
  let crosswalkArchiveRef: string | null = null;
  let canonicalIdentityRef: string | null = null;
  let identityBindingRef: string | null = null;

  if (!validTimestamp(asOf)) blockers.add("invalid_as_of");
  if (requestedPfrPlayerIds.some((id) => !hasText(id))) {
    blockers.add("requested_pfr_player_id_empty");
  }
  if (new Set(requestedPfrPlayerIds).size !== requestedPfrPlayerIds.length) {
    blockers.add("requested_pfr_player_ids_duplicate");
  }

  let crosswalkValid = true;
  try {
    validateCrosswalkSnapshot(crosswalk);
    crosswalkArchiveRef = crosswalk.archive.manifest.archiveRef;
  } catch (error) {
    crosswalkValid = false;
    blockers.add(`invalid_crosswalk:${error instanceof Error ? error.message : "unknown"}`);
  }

  if (
    crosswalkValid &&
    validTimestamp(asOf) &&
    Date.parse(crosswalk.knownAt) > Date.parse(asOf)
  ) {
    blockers.add("crosswalk_known_after_as_of");
  }

  const crosswalkByPfr = new Map(crosswalk.rows.map((row) => [row.pfrId, row]));
  const mappedPfrToGsis = new Map<string, string>();
  const unresolvedPfrPlayerIds: string[] = [];
  for (const pfrPlayerId of requestedPfrPlayerIds) {
    if (!hasText(pfrPlayerId)) continue;
    const row = crosswalkByPfr.get(pfrPlayerId);
    if (!row) {
      unresolvedPfrPlayerIds.push(pfrPlayerId);
      continue;
    }
    mappedPfrToGsis.set(pfrPlayerId, row.gsisId);
  }
  if (unresolvedPfrPlayerIds.length > 0) {
    blockers.add(`unresolved_pfr_ids:${unresolvedPfrPlayerIds.length}`);
  }

  const requestedGsisIds = Array.from(new Set(mappedPfrToGsis.values())).sort();
  const canonicalAudit = auditCCFNFLPlayerIdentitySubset(
    canonicalReceipt,
    requestedGsisIds,
    asOf,
  );
  canonicalIdentityRef = canonicalAudit.identityBindingRef ?? null;
  const fatalCanonicalBlockers = canonicalAudit.blockers.filter(
    (blocker) => !isCoverageOnlyCanonicalBlocker(blocker),
  );
  for (const blocker of fatalCanonicalBlockers) {
    blockers.add(`canonical:${blocker}`);
  }
  if (canonicalAudit.unresolvedCount > 0) {
    blockers.add(`canonical_unresolved_ids:${canonicalAudit.unresolvedCount}`);
  }
  if (canonicalAudit.ambiguousCount > 0) {
    blockers.add(`canonical_ambiguous_ids:${canonicalAudit.ambiguousCount}`);
  }

  if (
    crosswalkValid &&
    crosswalkArchiveRef &&
    canonicalIdentityRef &&
    !blockers.has("invalid_as_of") &&
    !blockers.has("crosswalk_known_after_as_of") &&
    fatalCanonicalBlockers.length === 0
  ) {
    identityBindingRef = bridgeBindingRef(crosswalk, canonicalIdentityRef);
  }

  const resolvedGsisIds = new Set(canonicalAudit.resolvedSourcePlayerIds);
  const resolvedPfrPlayerIds = Array.from(mappedPfrToGsis.entries())
    .filter(([, gsisId]) => resolvedGsisIds.has(gsisId))
    .map(([pfrId]) => pfrId)
    .sort();

  return {
    contractVersion: "ccf-pfr-player-identity-bridge-audit-v1",
    asOf,
    requestedCount: requestedPfrPlayerIds.length,
    pfrToGsisResolvedCount: mappedPfrToGsis.size,
    canonicalResolvedCount: resolvedPfrPlayerIds.length,
    unresolvedPfrCount: unresolvedPfrPlayerIds.length,
    canonicalUnresolvedCount: canonicalAudit.unresolvedCount,
    canonicalAmbiguousCount: canonicalAudit.ambiguousCount,
    resolvedPfrPlayerIds,
    identityBindingRef,
    crosswalkArchiveRef,
    canonicalIdentityRef,
    blockers: Array.from(blockers).sort(),
  };
}

export function assertCCFPFRPlayerIdentityBridgeResolved(
  crosswalk: CCFArchivedNflversePlayerIdCrosswalkSnapshot,
  canonicalReceipt: CCFNFLPlayerIdentityLinkageReceipt,
  requestedPfrPlayerIds: readonly string[],
  asOf: string,
): CCFPFRPlayerIdentityBridgeAudit {
  const audit = auditCCFPFRPlayerIdentityBridge(
    crosswalk,
    canonicalReceipt,
    requestedPfrPlayerIds,
    asOf,
  );
  if (
    audit.blockers.length > 0 ||
    audit.canonicalResolvedCount !== audit.requestedCount ||
    !audit.identityBindingRef
  ) {
    throw new CCFPFRPlayerIdentityBridgeError(
      `PFR player identity bridge is not resolved: ${audit.blockers.join(", ") || "coverage_incomplete"}`,
    );
  }
  return audit;
}

export function refCCFPFRPlayerIdentityBridge(
  crosswalk: CCFArchivedNflversePlayerIdCrosswalkSnapshot,
  canonicalReceipt: CCFNFLPlayerIdentityLinkageReceipt,
): string {
  validateCrosswalkSnapshot(crosswalk);
  const canonicalIdentityRef = refCCFNFLPlayerIdentityLinkageReceipt(canonicalReceipt);
  return bridgeBindingRef(crosswalk, canonicalIdentityRef);
}
