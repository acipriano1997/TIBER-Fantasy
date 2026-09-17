import type { CCFArchivedNflversePlayerIdCrosswalkSnapshot } from "./archivedNflversePlayerIdCrosswalk";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "./nflPlayerIdentityLinkage";
import { refCCFPFRPlayerIdentityBridge } from "./pfrPlayerIdentityBridge";
import {
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityCheckpoint,
  type CCFSourceReliabilityPolicy,
} from "./sourceReliabilityReview";

export const CCF_NFLVERSE_SNAP_COUNTS_SOURCE_ID_V2 =
  "nflverse-pfr-snap-counts-v2" as const;
export const CCF_NFLVERSE_SNAP_COUNTS_CRITICAL_FIELD_POLICY_REF_V2 =
  "ccf://policy/nflverse-snap-counts-observed-workload-critical-fields-v2" as const;
export const CCF_NFLVERSE_SNAP_COUNTS_CORRECTION_POLICY_REF_V1 =
  "ccf://policy/nflverse-snap-counts-corrections-v1" as const;
export const CCF_NFLVERSE_SNAP_COUNTS_CHECKPOINT_POLICY_REF_V1 =
  "ccf://policy/nflverse-snap-counts-checkpoints-2026-v1" as const;

export const CCF_NFLVERSE_SNAP_COUNTS_CHECKPOINTS_2026_V1: CCFSourceReliabilityCheckpoint[] = [
  { checkpointId: "w2-tue-1000-et", scheduledFor: "2026-09-22T14:00:00Z" },
  { checkpointId: "w2-wed-1000-et", scheduledFor: "2026-09-23T14:00:00Z" },
  { checkpointId: "w3-tue-1000-et", scheduledFor: "2026-09-29T14:00:00Z" },
  { checkpointId: "w3-wed-1000-et", scheduledFor: "2026-09-30T14:00:00Z" },
];

export interface BuildCCFNflverseSnapCountsReliabilityPolicyInput {
  crosswalk: CCFArchivedNflversePlayerIdCrosswalkSnapshot;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  frozenAt: string;
  notes?: string[];
}

export class CCFNflverseSnapCountsCertificationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseSnapCountsCertificationPolicyError";
  }
}

/**
 * Build the prospective observed-workload reliability policy only when an
 * archived exact PFR -> GSIS crosswalk and a real governed GSIS -> canonical CCF
 * receipt are supplied. No production identity receipt or rights clearance is
 * fabricated here.
 */
export function buildCCFNflverseSnapCountsReliabilityPolicy(
  input: BuildCCFNflverseSnapCountsReliabilityPolicyInput,
): CCFSourceReliabilityPolicy {
  const frozenAtMs = Date.parse(input.frozenAt);
  if (!Number.isFinite(frozenAtMs)) {
    throw new CCFNflverseSnapCountsCertificationPolicyError(
      "frozenAt must be a valid timestamp",
    );
  }
  if (Date.parse(input.crosswalk.knownAt) > frozenAtMs) {
    throw new CCFNflverseSnapCountsCertificationPolicyError(
      "PFR -> GSIS crosswalk must be known no later than the reliability policy",
    );
  }
  if (Date.parse(input.identityReceipt.frozenAt) > frozenAtMs) {
    throw new CCFNflverseSnapCountsCertificationPolicyError(
      "GSIS -> canonical identity receipt must be frozen no later than the reliability policy",
    );
  }

  const identityBindingRef = refCCFPFRPlayerIdentityBridge(
    input.crosswalk,
    input.identityReceipt,
  );
  const policy: CCFSourceReliabilityPolicy = {
    schemaVersion: "ccf-source-reliability-policy-v1",
    policyId: "nflverse-pfr-snap-counts-pb01-prospective-2026-v1",
    sourceId: CCF_NFLVERSE_SNAP_COUNTS_SOURCE_ID_V2,
    producer: "nflverse",
    intendedUse: "ffcc_native_weekly_recommendation",
    frozenAt: input.frozenAt,
    parserVersion: "ccf-nflverse-snap-counts-candidate-v2",
    identityBindingRef,
    criticalFieldPolicyRef: CCF_NFLVERSE_SNAP_COUNTS_CRITICAL_FIELD_POLICY_REF_V2,
    correctionPolicyRef: CCF_NFLVERSE_SNAP_COUNTS_CORRECTION_POLICY_REF_V1,
    checkpointPolicyRef: CCF_NFLVERSE_SNAP_COUNTS_CHECKPOINT_POLICY_REF_V1,
    checkpoints: CCF_NFLVERSE_SNAP_COUNTS_CHECKPOINTS_2026_V1.map((checkpoint) => ({
      ...checkpoint,
    })),
    minimumSuccessfulCaptures: 4,
    minimumCaptureSuccessRate: 1,
    minimumSchemaValidRate: 1,
    minimumIdentityResolutionRate: 1,
    maximumCriticalMissingRate: 0,
    maximumDuplicateKeyRate: 0,
    minimumOnTimeCaptureRate: 0.75,
    maximumCaptureDelayMs: 2 * 60 * 60 * 1000,
    maximumUnreconciledCorrections: 0,
    notes: [
      "policy must be frozen before the first prospective checkpoint",
      "full QB/RB/WR/TE capture scope is required for every qualification observation",
      "identity is exact PFR -> archived GSIS -> governed canonical CCF; names are never fallback evidence",
      "missing position or opponent context counts against critical-field reliability",
      "Tuesday/Wednesday recaptures across two NFL weeks measure availability and correction stability",
      "passing reliability does not clear Pro Football Reference or nflverse intended-use rights, source promotion, or operator attestation",
      ...(input.notes ?? []),
    ],
  };

  validateCCFSourceReliabilityPolicy(policy);
  return policy;
}

export function fingerprintCCFNflverseSnapCountsReliabilityPolicy(
  input: BuildCCFNflverseSnapCountsReliabilityPolicyInput,
): string {
  return fingerprintCCFSourceReliabilityPolicy(
    buildCCFNflverseSnapCountsReliabilityPolicy(input),
  );
}
