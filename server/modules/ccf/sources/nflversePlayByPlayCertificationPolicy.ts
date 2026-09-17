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

export const CCF_NFLVERSE_PBP_SOURCE_ID_V2 =
  "nflverse-play-by-play-opportunity-v2" as const;
export const CCF_NFLVERSE_PBP_CRITICAL_FIELD_POLICY_REF_V2 =
  "ccf://policy/nflverse-pbp-opportunity-critical-fields-v2" as const;
export const CCF_NFLVERSE_PBP_CORRECTION_POLICY_REF_V1 =
  "ccf://policy/nflverse-pbp-opportunity-corrections-v1" as const;
export const CCF_NFLVERSE_PBP_CHECKPOINT_POLICY_REF_V1 =
  "ccf://policy/nflverse-pbp-opportunity-checkpoints-2026-v1" as const;

export const CCF_NFLVERSE_PBP_CHECKPOINTS_2026_V1: CCFSourceReliabilityCheckpoint[] = [
  { checkpointId: "w2-tue-1000-et", scheduledFor: "2026-09-22T14:00:00Z" },
  { checkpointId: "w2-wed-1000-et", scheduledFor: "2026-09-23T14:00:00Z" },
  { checkpointId: "w3-tue-1000-et", scheduledFor: "2026-09-29T14:00:00Z" },
  { checkpointId: "w3-wed-1000-et", scheduledFor: "2026-09-30T14:00:00Z" },
];

export interface BuildCCFNflversePlayByPlayReliabilityPolicyInput {
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  frozenAt: string;
  notes?: string[];
}

export class CCFNflversePlayByPlayCertificationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflversePlayByPlayCertificationPolicyError";
  }
}

/**
 * Build the prospective PBP reliability policy only when a real governed
 * GSIS -> canonical CCF identity receipt exists. Passing the policy is still
 * insufficient for source promotion: intended-use rights, source-state
 * promotion, and operator attestation remain separate PB-01 gates.
 */
export function buildCCFNflversePlayByPlayReliabilityPolicy(
  input: BuildCCFNflversePlayByPlayReliabilityPolicyInput,
): CCFSourceReliabilityPolicy {
  validateCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt);
  const frozenAtMs = Date.parse(input.frozenAt);
  if (!Number.isFinite(frozenAtMs)) {
    throw new CCFNflversePlayByPlayCertificationPolicyError(
      "frozenAt must be a valid timestamp",
    );
  }
  if (Date.parse(input.identityReceipt.frozenAt) > frozenAtMs) {
    throw new CCFNflversePlayByPlayCertificationPolicyError(
      "identity receipt must be frozen no later than the reliability policy",
    );
  }

  const identityBindingRef = refCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt);
  const policy: CCFSourceReliabilityPolicy = {
    schemaVersion: "ccf-source-reliability-policy-v1",
    policyId: "nflverse-pbp-opportunity-pb01-prospective-2026-v1",
    sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V2,
    producer: "nflverse",
    intendedUse: "ffcc_native_weekly_recommendation",
    frozenAt: input.frozenAt,
    parserVersion: "ccf-nflverse-play-by-play-candidate-v2",
    identityBindingRef,
    criticalFieldPolicyRef: CCF_NFLVERSE_PBP_CRITICAL_FIELD_POLICY_REF_V2,
    correctionPolicyRef: CCF_NFLVERSE_PBP_CORRECTION_POLICY_REF_V1,
    checkpointPolicyRef: CCF_NFLVERSE_PBP_CHECKPOINT_POLICY_REF_V1,
    checkpoints: CCF_NFLVERSE_PBP_CHECKPOINTS_2026_V1.map((checkpoint) => ({
      ...checkpoint,
    })),
    minimumSuccessfulCaptures: 4,
    minimumCaptureSuccessRate: 1,
    minimumSchemaValidRate: 1,
    minimumIdentityResolutionRate: 1,
    maximumCriticalMissingRate: 0,
    maximumDuplicateKeyRate: 0,
    minimumOnTimeCaptureRate: 0.75,
    maximumCaptureDelayMs: 4 * 60 * 60 * 1000,
    maximumUnreconciledCorrections: 0,
    notes: [
      "policy must be frozen before the first prospective checkpoint",
      "two-week Tuesday/Wednesday captures measure post-week availability plus correction stability",
      "parser v2 preserves play_type and provider binary missingness before qualification",
      "critical missingness is play-type-aware and does not classify throwaways or non-play rows as missing receiver opportunities",
      "full canonical identity resolution is required for every derived player opportunity",
      "passing reliability does not clear intended-use rights, source promotion, or operator attestation",
      ...(input.notes ?? []),
    ],
  };

  validateCCFSourceReliabilityPolicy(policy);
  return policy;
}

export function fingerprintCCFNflversePlayByPlayReliabilityPolicy(
  input: BuildCCFNflversePlayByPlayReliabilityPolicyInput,
): string {
  return fingerprintCCFSourceReliabilityPolicy(
    buildCCFNflversePlayByPlayReliabilityPolicy(input),
  );
}
