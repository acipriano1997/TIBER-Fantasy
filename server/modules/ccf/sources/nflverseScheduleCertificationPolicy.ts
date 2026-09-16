import {
  fingerprintCCFNflverseScheduleIdentityPolicyReceipt,
  refCCFNflverseScheduleIdentityPolicyReceipt,
  validateCCFNflverseScheduleIdentityPolicyReceipt,
  type CCFNflverseScheduleIdentityPolicyReceipt,
} from "./nflverseScheduleIdentity";
import {
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityPolicy,
} from "./sourceReliabilityReview";

/**
 * Provider-native schedule identity semantics for PB-01 evaluation.
 *
 * This receipt says only that nflverse `game_id` and nflverse team
 * abbreviations are the source-local keys used to evaluate the schedule feed.
 * It intentionally makes no claim that those identifiers are a universal or
 * cross-provider canonical NFL game/team identity.
 */
export const CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1: CCFNflverseScheduleIdentityPolicyReceipt = {
  contractVersion: "ccf-nflverse-schedule-identity-policy-v1",
  receiptId: "nflverse-schedule-provider-native-identity-2026-v1",
  sourceSystem: "nflverse",
  gameIdNamespace: "nflverse_game_id",
  teamIdNamespace: "nflverse_team_abbreviation",
  identityScope: "provider_native_schedule",
  crossProviderCanonicalClaim: false,
  knownAt: "2026-09-16T17:00:00Z",
  frozenAt: "2026-09-16T17:00:00Z",
  evidenceRefs: [
    "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
    "https://github.com/nflverse/nflverse-data",
  ],
  notes: [
    "provider-native identity policy only; no cross-provider canonical game identity claim",
    "intended-use permission remains a separate PB-01 promotion gate",
  ],
};

export const CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_REF_V1 =
  refCCFNflverseScheduleIdentityPolicyReceipt(CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1);

export const CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_FINGERPRINT_V1 =
  fingerprintCCFNflverseScheduleIdentityPolicyReceipt(
    CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1,
  );

/**
 * Frozen prospective reliability policy for the nflverse schedule candidate.
 *
 * The two-week window is intentionally fixed before observations. A failed or
 * missed checkpoint must still be recorded as an observation; it may not be
 * silently omitted. Passing this policy is necessary but not sufficient for
 * source promotion: intended-use permission and trusted operator attestation
 * remain independent gates.
 */
export const CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1: CCFSourceReliabilityPolicy = {
  schemaVersion: "ccf-source-reliability-policy-v1",
  policyId: "nflverse-schedule-pb01-prospective-2026-v1",
  sourceId: "nflverse-schedules-v1",
  producer: "nflverse",
  intendedUse: "ffcc_native_weekly_recommendation",
  frozenAt: "2026-09-16T17:00:00Z",
  parserVersion: "ccf-nflverse-schedule-candidate-v1",
  identityBindingRef: CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_REF_V1,
  criticalFieldPolicyRef: "ccf://policy/nflverse-schedule-critical-fields-v1",
  correctionPolicyRef: "ccf://policy/nflverse-schedule-corrections-v1",
  checkpointPolicyRef: "ccf://policy/nflverse-schedule-checkpoints-2026-v1",
  checkpoints: [
    { checkpointId: "w2-thu-0900-et", scheduledFor: "2026-09-17T13:00:00Z" },
    { checkpointId: "w2-fri-0900-et", scheduledFor: "2026-09-18T13:00:00Z" },
    { checkpointId: "w2-sat-0900-et", scheduledFor: "2026-09-19T13:00:00Z" },
    { checkpointId: "w2-sun-0900-et", scheduledFor: "2026-09-20T13:00:00Z" },
    { checkpointId: "w2-sun-1200-et", scheduledFor: "2026-09-20T16:00:00Z" },
    { checkpointId: "w2-mon-0900-et", scheduledFor: "2026-09-21T13:00:00Z" },
    { checkpointId: "w3-wed-0900-et", scheduledFor: "2026-09-23T13:00:00Z" },
    { checkpointId: "w3-fri-0900-et", scheduledFor: "2026-09-25T13:00:00Z" },
    { checkpointId: "w3-sun-0900-et", scheduledFor: "2026-09-27T13:00:00Z" },
    { checkpointId: "w3-sun-1200-et", scheduledFor: "2026-09-27T16:00:00Z" },
  ],
  minimumSuccessfulCaptures: 9,
  minimumCaptureSuccessRate: 0.9,
  minimumSchemaValidRate: 1,
  minimumIdentityResolutionRate: 1,
  maximumCriticalMissingRate: 0,
  maximumDuplicateKeyRate: 0,
  minimumOnTimeCaptureRate: 0.9,
  maximumCaptureDelayMs: 60 * 60 * 1000,
  maximumUnreconciledCorrections: 0,
  notes: [
    "policy frozen before the first prospective checkpoint",
    "review spans two NFL weeks to reduce one-week false confidence",
    "all checkpoints require explicit success or failure observations; misses are not silently dropped",
    "passing reliability does not clear intended-use permission or source promotion",
    "provider-native identity scope does not claim cross-provider canonical game identity",
  ],
};

// Fail immediately at module load if a future edit breaks the frozen contracts.
validateCCFNflverseScheduleIdentityPolicyReceipt(
  CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1,
);
validateCCFSourceReliabilityPolicy(CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1);

export const CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_FINGERPRINT_V1 =
  fingerprintCCFSourceReliabilityPolicy(CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1);
