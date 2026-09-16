import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  validateCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import {
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityCheckpoint,
  type CCFSourceReliabilityPolicy,
} from "./sourceReliabilityReview";

export const CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2 =
  "nflverse-weekly-player-stats-v2" as const;
export const CCF_NFLVERSE_WEEKLY_STATS_CRITICAL_FIELD_POLICY_REF_V2 =
  "ccf://policy/nflverse-weekly-player-stats-scoring-critical-fields-v2" as const;
export const CCF_NFLVERSE_WEEKLY_STATS_CORRECTION_POLICY_REF_V1 =
  "ccf://policy/nflverse-weekly-player-stats-corrections-v1" as const;
export const CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINT_POLICY_REF_V1 =
  "ccf://policy/nflverse-weekly-player-stats-checkpoints-2026-v1" as const;

/**
 * Prospective post-week checkpoints. Tuesday captures test first-available
 * complete weekly results after Monday night; Wednesday recaptures provide a
 * correction/stability witness. The window spans two NFL weeks so one week
 * cannot create false confidence.
 */
export const CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINTS_2026_V1: CCFSourceReliabilityCheckpoint[] = [
  { checkpointId: "w2-tue-0900-et", scheduledFor: "2026-09-22T13:00:00Z" },
  { checkpointId: "w2-wed-0900-et", scheduledFor: "2026-09-23T13:00:00Z" },
  { checkpointId: "w3-tue-0900-et", scheduledFor: "2026-09-29T13:00:00Z" },
  { checkpointId: "w3-wed-0900-et", scheduledFor: "2026-09-30T13:00:00Z" },
];

export interface BuildCCFNflverseWeeklyStatsReliabilityPolicyInput {
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  frozenAt: string;
  notes?: string[];
}

export class CCFNflverseWeeklyStatsCertificationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseWeeklyStatsCertificationPolicyError";
  }
}

/**
 * Build the frozen source-reliability policy only after a real governed GSIS ->
 * canonical CCF identity receipt exists. This function deliberately does not
 * export a fabricated production receipt or pre-instantiated policy.
 *
 * Passing this policy remains necessary but not sufficient for promotion:
 * intended-use rights, source-state promotion, and operator attestation are
 * independent fail-closed PB-01 gates.
 */
export function buildCCFNflverseWeeklyStatsReliabilityPolicy(
  input: BuildCCFNflverseWeeklyStatsReliabilityPolicyInput,
): CCFSourceReliabilityPolicy {
  validateCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt);
  const frozenAtMs = Date.parse(input.frozenAt);
  if (!Number.isFinite(frozenAtMs)) {
    throw new CCFNflverseWeeklyStatsCertificationPolicyError(
      "frozenAt must be a valid timestamp",
    );
  }
  if (Date.parse(input.identityReceipt.frozenAt) > frozenAtMs) {
    throw new CCFNflverseWeeklyStatsCertificationPolicyError(
      "identity receipt must be frozen no later than the reliability policy",
    );
  }

  const identityBindingRef = refCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt);
  const policy: CCFSourceReliabilityPolicy = {
    schemaVersion: "ccf-source-reliability-policy-v1",
    policyId: "nflverse-weekly-player-stats-pb01-prospective-2026-v1",
    sourceId: CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
    producer: "nflverse",
    intendedUse: "ffcc_native_weekly_recommendation",
    frozenAt: input.frozenAt,
    parserVersion: "ccf-nflverse-player-stats-v2",
    identityBindingRef,
    criticalFieldPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CRITICAL_FIELD_POLICY_REF_V2,
    correctionPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CORRECTION_POLICY_REF_V1,
    checkpointPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINT_POLICY_REF_V1,
    checkpoints: CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINTS_2026_V1.map((checkpoint) => ({
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
      "two-week Tuesday/Wednesday window measures availability plus correction stability",
      "full GSIS identity resolution is required; unresolved or ambiguous players fail promotion",
      "scoring-critical missingness includes team/opponent context and all FFCC base scoring counts exposed by the v2 adapter",
      "passing reliability does not clear intended-use rights, source promotion, or operator attestation",
      ...(input.notes ?? []),
    ],
  };

  validateCCFSourceReliabilityPolicy(policy);
  return policy;
}

export function fingerprintCCFNflverseWeeklyStatsReliabilityPolicy(
  input: BuildCCFNflverseWeeklyStatsReliabilityPolicyInput,
): string {
  return fingerprintCCFSourceReliabilityPolicy(
    buildCCFNflverseWeeklyStatsReliabilityPolicy(input),
  );
}
