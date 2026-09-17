import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  validateCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import type { CCFNflverseInjuryReliabilityCapability } from "./nflverseInjuryReliability";
import {
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityCheckpoint,
  type CCFSourceReliabilityPolicy,
} from "./sourceReliabilityReview";

export const CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2 =
  "nflverse-injuries-designation-v2" as const;
export const CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2 =
  "nflverse-injuries-practice-v2" as const;
export const CCF_NFLVERSE_INJURY_DESIGNATION_CRITICAL_FIELD_POLICY_REF_V1 =
  "ccf://policy/injury-designation-fields-v1" as const;
export const CCF_NFLVERSE_PRACTICE_PARTICIPATION_CRITICAL_FIELD_POLICY_REF_V1 =
  "ccf://policy/practice-participation-fields-v1" as const;
export const CCF_NFLVERSE_INJURY_CORRECTION_POLICY_REF_V1 =
  "ccf://policy/nflverse-injury-corrections-v1" as const;
export const CCF_NFLVERSE_INJURY_CHECKPOINT_POLICY_REF_V1 =
  "ccf://policy/nflverse-injury-checkpoints-2026-v1" as const;

/**
 * Prospective in-week captures beginning after this policy work was authored.
 * Week 2 uses Thursday/Friday because Wednesday has already passed; Week 3
 * restores the normal Wednesday/Thursday/Friday cadence. The two-week window
 * prevents one unusually clean injury cycle from creating false confidence.
 */
export const CCF_NFLVERSE_INJURY_CHECKPOINTS_2026_V1: CCFSourceReliabilityCheckpoint[] = [
  { checkpointId: "w2-thu-1600-et", scheduledFor: "2026-09-17T20:00:00Z" },
  { checkpointId: "w2-fri-1600-et", scheduledFor: "2026-09-18T20:00:00Z" },
  { checkpointId: "w3-wed-1600-et", scheduledFor: "2026-09-23T20:00:00Z" },
  { checkpointId: "w3-thu-1600-et", scheduledFor: "2026-09-24T20:00:00Z" },
  { checkpointId: "w3-fri-1600-et", scheduledFor: "2026-09-25T20:00:00Z" },
];

export interface BuildCCFNflverseInjuryReliabilityPolicyInput {
  capability: CCFNflverseInjuryReliabilityCapability;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  frozenAt: string;
  notes?: string[];
}

export class CCFNflverseInjuryCertificationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseInjuryCertificationPolicyError";
  }
}

function capabilityConfig(capability: CCFNflverseInjuryReliabilityCapability) {
  return capability === "injury_designation"
    ? {
        policyId: "nflverse-injury-designation-pb01-prospective-2026-v1",
        sourceId: CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2,
        criticalFieldPolicyRef:
          CCF_NFLVERSE_INJURY_DESIGNATION_CRITICAL_FIELD_POLICY_REF_V1,
      }
    : {
        policyId: "nflverse-practice-participation-pb01-prospective-2026-v1",
        sourceId: CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2,
        criticalFieldPolicyRef:
          CCF_NFLVERSE_PRACTICE_PARTICIPATION_CRITICAL_FIELD_POLICY_REF_V1,
      };
}

/**
 * Build one frozen prospective injury/practice reliability policy only after a
 * real governed GSIS -> canonical CCF identity receipt exists. The builder
 * deliberately does not export a fabricated production receipt or pre-created
 * policy. Passing this review is necessary but still insufficient for source
 * promotion because intended-use rights and operator promotion remain separate.
 */
export function buildCCFNflverseInjuryReliabilityPolicy(
  input: BuildCCFNflverseInjuryReliabilityPolicyInput,
): CCFSourceReliabilityPolicy {
  validateCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt);
  const frozenAtMs = Date.parse(input.frozenAt);
  if (!Number.isFinite(frozenAtMs)) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "frozenAt must be a valid timestamp",
    );
  }
  if (Date.parse(input.identityReceipt.frozenAt) > frozenAtMs) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "identity receipt must be frozen no later than the reliability policy",
    );
  }

  const config = capabilityConfig(input.capability);
  const policy: CCFSourceReliabilityPolicy = {
    schemaVersion: "ccf-source-reliability-policy-v1",
    policyId: config.policyId,
    sourceId: config.sourceId,
    producer: "nflverse",
    intendedUse: "ffcc_native_weekly_recommendation",
    frozenAt: input.frozenAt,
    parserVersion: "ccf-nflverse-injuries-candidate-v2",
    identityBindingRef: refCCFNFLPlayerIdentityLinkageReceipt(input.identityReceipt),
    criticalFieldPolicyRef: config.criticalFieldPolicyRef,
    correctionPolicyRef: CCF_NFLVERSE_INJURY_CORRECTION_POLICY_REF_V1,
    checkpointPolicyRef: CCF_NFLVERSE_INJURY_CHECKPOINT_POLICY_REF_V1,
    checkpoints: CCF_NFLVERSE_INJURY_CHECKPOINTS_2026_V1.map((checkpoint) => ({
      ...checkpoint,
    })),
    minimumSuccessfulCaptures: 5,
    minimumCaptureSuccessRate: 1,
    minimumSchemaValidRate: 1,
    minimumIdentityResolutionRate: 1,
    maximumCriticalMissingRate: 0,
    maximumDuplicateKeyRate: 0,
    minimumOnTimeCaptureRate: 0.8,
    maximumCaptureDelayMs: 2 * 60 * 60 * 1000,
    maximumUnreconciledCorrections: 0,
    notes: [
      "policy must be frozen before the first prospective checkpoint",
      "week 2 begins Thursday because earlier week-2 checkpoints predate this frozen policy window",
      "two-week in-week captures measure availability, completeness, and correction stability",
      "full GSIS identity resolution is required; unresolved or ambiguous players fail promotion",
      "injury designation and practice participation remain separately reviewed capabilities",
      "injury evidence must never be substituted for authoritative game-activation truth",
      "passing reliability does not clear intended-use rights, source promotion, or operator attestation",
      ...(input.notes ?? []),
    ],
  };

  validateCCFSourceReliabilityPolicy(policy);
  return policy;
}

export function fingerprintCCFNflverseInjuryReliabilityPolicy(
  input: BuildCCFNflverseInjuryReliabilityPolicyInput,
): string {
  return fingerprintCCFSourceReliabilityPolicy(
    buildCCFNflverseInjuryReliabilityPolicy(input),
  );
}
