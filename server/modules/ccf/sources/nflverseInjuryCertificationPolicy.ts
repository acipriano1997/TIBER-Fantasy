import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  validateCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import {
  buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot,
  type CCFNFLPlayerIdentityRegistrySnapshot,
} from "./nflPlayerIdentityRegistrySnapshot";
import {
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityCheckpoint,
  type CCFSourceReliabilityPolicy,
} from "./sourceReliabilityReview";

export type CCFNflverseInjuryCertificationCapability =
  | "injury_designation"
  | "practice_participation";

export interface CreateCCFNflverseInjuryCertificationPoliciesInput {
  /** Prospective GSIS -> TIBER linkage receipt. Pure contract helper only. */
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  /** Time the operator freezes this exact policy instance. */
  frozenAt: string;
  /** Prospective checkpoints only; every expected checkpoint must later be observed or counted missing. */
  checkpoints: CCFSourceReliabilityCheckpoint[];
}

export interface CreateCCFNflverseInjuryCertificationPoliciesFromArchivedIdentitySnapshotInput {
  /**
   * The prospective player_identity_map snapshot whose persisted raw archive
   * will be re-read and verified immediately before the identity receipt and
   * reliability policy bundle are frozen.
   */
  identitySnapshot: CCFNFLPlayerIdentityRegistrySnapshot;
  /** One transaction boundary for both identity receipt and policy freeze. */
  frozenAt: string;
  /** Prospective checkpoints only; every expected checkpoint must later be observed or counted missing. */
  checkpoints: CCFSourceReliabilityCheckpoint[];
}

export interface CCFNflverseInjuryCertificationPolicyBundle {
  contractVersion: "ccf-nflverse-injury-certification-policy-bundle-v1";
  identityBindingRef: string;
  identityRegistryFingerprint: string;
  frozenAt: string;
  injuryDesignation: CCFSourceReliabilityPolicy;
  practiceParticipation: CCFSourceReliabilityPolicy;
  fingerprints: {
    injuryDesignation: string;
    practiceParticipation: string;
  };
}

export class CCFNflverseInjuryCertificationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseInjuryCertificationPolicyError";
  }
}

const INJURY_PARSER_VERSION = "ccf-nflverse-injuries-candidate-v2";
const IMMUTABLE_REGISTRY_ARCHIVE_REF =
  /^ccf:\/\/raw\/tiber\/player_identity_map_gsis_tiber\/sha256\/[a-f0-9]{64}$/;
const REGISTRY_SCHEMA_AUTHORITY_REF =
  "github://acipriano1997/TIBER-Fantasy/migrations/0014_canonical_tiber_player_id.sql";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const CRITICAL_FIELD_POLICY: Record<CCFNflverseInjuryCertificationCapability, string> = {
  injury_designation: "ccf://policy/injury-designation-fields-v1",
  practice_participation: "ccf://policy/practice-participation-fields-v1",
};

export const CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2 =
  "nflverse-injuries-designation-v2" as const;
export const CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2 =
  "nflverse-injuries-practice-v2" as const;

const SOURCE_ID: Record<CCFNflverseInjuryCertificationCapability, string> = {
  injury_designation: CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2,
  practice_participation: CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2,
};

const CORRECTION_POLICY_REF = "ccf://policy/nflverse-injury-corrections-v1";
const CHECKPOINT_POLICY_REF = "ccf://policy/nflverse-injury-checkpoints-prospective-v1";

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFNflverseInjuryCertificationPolicyError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function assertRegistryBackedIdentityReceipt(
  receipt: CCFNFLPlayerIdentityLinkageReceipt,
): string {
  try {
    validateCCFNFLPlayerIdentityLinkageReceipt(receipt);
  } catch (error) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      `identity receipt is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!SHA256_PATTERN.test(receipt.identityRegistryFingerprint)) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "identity receipt must carry the immutable registry content SHA-256",
    );
  }
  if (!receipt.receiptId.startsWith("nflverse-gsis-to-tiber-")) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "identity receipt was not materialized by the prospective GSIS-to-TIBER registry path",
    );
  }
  if (receipt.rows.some((row) => row.status === "ambiguous" || row.status === "not_applicable")) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "prospective registry receipt may contain only exact-resolved or unresolved GSIS rows",
    );
  }
  if (!receipt.rows.some((row) => row.status === "resolved_exact")) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "identity receipt must contain at least one exact GSIS-to-TIBER binding",
    );
  }

  for (const row of receipt.rows) {
    if (row.knownAt !== receipt.identityRegistryKnownAt) {
      throw new CCFNflverseInjuryCertificationPolicyError(
        `${row.sourcePlayerId} knownAt must equal the prospective registry snapshot knownAt`,
      );
    }
    if (!row.evidenceRefs.some((ref) => IMMUTABLE_REGISTRY_ARCHIVE_REF.test(ref))) {
      throw new CCFNflverseInjuryCertificationPolicyError(
        `${row.sourcePlayerId} is missing immutable prospective registry archive evidence`,
      );
    }
    if (!row.evidenceRefs.includes(REGISTRY_SCHEMA_AUTHORITY_REF)) {
      throw new CCFNflverseInjuryCertificationPolicyError(
        `${row.sourcePlayerId} is missing governed registry schema authority evidence`,
      );
    }
  }

  return refCCFNFLPlayerIdentityLinkageReceipt(receipt);
}

function validateProspectiveWindow(
  checkpoints: readonly CCFSourceReliabilityCheckpoint[],
  frozenAtMs: number,
): CCFSourceReliabilityCheckpoint[] {
  if (checkpoints.length < 6) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "injury/practice reliability review requires at least six prospective checkpoints",
    );
  }

  const seen = new Set<string>();
  const normalized = checkpoints.map((checkpoint) => {
    if (!checkpoint.checkpointId.trim()) {
      throw new CCFNflverseInjuryCertificationPolicyError("checkpointId is required");
    }
    if (seen.has(checkpoint.checkpointId)) {
      throw new CCFNflverseInjuryCertificationPolicyError(
        `duplicate checkpointId ${checkpoint.checkpointId}`,
      );
    }
    seen.add(checkpoint.checkpointId);
    const scheduledForMs = timestamp(
      `${checkpoint.checkpointId}.scheduledFor`,
      checkpoint.scheduledFor,
    );
    if (scheduledForMs <= frozenAtMs) {
      throw new CCFNflverseInjuryCertificationPolicyError(
        `${checkpoint.checkpointId} must occur after policy freeze`,
      );
    }
    return { ...checkpoint };
  });

  const times = normalized.map((checkpoint) => Date.parse(checkpoint.scheduledFor));
  const spanMs = Math.max(...times) - Math.min(...times);
  if (spanMs < 6 * 24 * 60 * 60 * 1000) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "injury/practice reliability review must span at least six days to avoid one-week false confidence",
    );
  }

  return normalized.sort((left, right) =>
    left.scheduledFor.localeCompare(right.scheduledFor),
  );
}

function buildPolicy(
  capability: CCFNflverseInjuryCertificationCapability,
  identityBindingRef: string,
  identityRegistryFingerprint: string,
  frozenAt: string,
  checkpoints: CCFSourceReliabilityCheckpoint[],
): CCFSourceReliabilityPolicy {
  // Thresholds are code-owned rather than caller-supplied so a real observation
  // window cannot tune the goalposts after seeing source performance.
  const policy: CCFSourceReliabilityPolicy = {
    schemaVersion: "ccf-source-reliability-policy-v1",
    policyId: [
      "nflverse-injuries",
      capability,
      "prospective",
      identityRegistryFingerprint.slice(0, 16),
      "v1",
    ].join("-"),
    sourceId: SOURCE_ID[capability],
    producer: "nflverse",
    intendedUse: "ffcc_native_weekly_recommendation",
    frozenAt,
    parserVersion: INJURY_PARSER_VERSION,
    identityBindingRef,
    criticalFieldPolicyRef: CRITICAL_FIELD_POLICY[capability],
    correctionPolicyRef: CORRECTION_POLICY_REF,
    checkpointPolicyRef: CHECKPOINT_POLICY_REF,
    checkpoints,
    minimumSuccessfulCaptures: Math.ceil(checkpoints.length * 0.9),
    minimumCaptureSuccessRate: 0.9,
    minimumSchemaValidRate: 1,
    minimumIdentityResolutionRate: 0.99,
    maximumCriticalMissingRate: 0.05,
    maximumDuplicateKeyRate: 0,
    minimumOnTimeCaptureRate: 0.9,
    maximumCaptureDelayMs: 60 * 60 * 1000,
    maximumUnreconciledCorrections: 0,
    notes: [
      "policy instantiated only from an immutable prospective player_identity_map GSIS-to-TIBER receipt",
      "thresholds are code-owned and cannot be caller-tuned after observations begin",
      "review window spans multiple NFL report cycles rather than a single quiet week",
      "missed checkpoints must be represented as misses and may not be silently omitted",
      "passing reliability does not clear intended-use permission or trusted source promotion",
      "this policy does not authorize CCF_PRIMARY cutover or recommendation authority",
    ],
  };
  return validateCCFSourceReliabilityPolicy(policy);
}

/**
 * Pure deterministic policy-construction helper.
 *
 * It validates the linkage-receipt contract but cannot itself prove that the
 * archive referenced by a caller-supplied receipt still exists on disk. Tests
 * and offline deterministic replay may use this helper. Operator/runtime code
 * must use createCCFNflverseInjuryCertificationPoliciesFromArchivedIdentitySnapshot
 * so the persisted archive is re-read immediately before policy freeze.
 */
export function createCCFNflverseInjuryCertificationPolicies(
  input: CreateCCFNflverseInjuryCertificationPoliciesInput,
): CCFNflverseInjuryCertificationPolicyBundle {
  const identityBindingRef = assertRegistryBackedIdentityReceipt(input.identityReceipt);
  const frozenAtMs = timestamp("frozenAt", input.frozenAt);
  const registryKnownAtMs = timestamp(
    "identityRegistryKnownAt",
    input.identityReceipt.identityRegistryKnownAt,
  );
  const receiptFrozenAtMs = timestamp(
    "identityReceipt.frozenAt",
    input.identityReceipt.frozenAt,
  );
  if (frozenAtMs < registryKnownAtMs || frozenAtMs < receiptFrozenAtMs) {
    throw new CCFNflverseInjuryCertificationPolicyError(
      "policy frozenAt cannot precede identity registry knownAt or identity receipt frozenAt",
    );
  }

  const checkpoints = validateProspectiveWindow(input.checkpoints, frozenAtMs);
  const injuryDesignation = buildPolicy(
    "injury_designation",
    identityBindingRef,
    input.identityReceipt.identityRegistryFingerprint,
    input.frozenAt,
    checkpoints,
  );
  const practiceParticipation = buildPolicy(
    "practice_participation",
    identityBindingRef,
    input.identityReceipt.identityRegistryFingerprint,
    input.frozenAt,
    checkpoints,
  );

  return {
    contractVersion: "ccf-nflverse-injury-certification-policy-bundle-v1",
    identityBindingRef,
    identityRegistryFingerprint: input.identityReceipt.identityRegistryFingerprint,
    frozenAt: input.frozenAt,
    injuryDesignation,
    practiceParticipation,
    fingerprints: {
      injuryDesignation: fingerprintCCFSourceReliabilityPolicy(injuryDesignation),
      practiceParticipation: fingerprintCCFSourceReliabilityPolicy(practiceParticipation),
    },
  };
}

/**
 * Operator-safe prospective policy freeze.
 *
 * One `frozenAt` timestamp is used as the transaction boundary for both the
 * linkage receipt and the two reliability policies. The identity snapshot's
 * persisted `content.raw` + `manifest.json` are re-read and verified first; if
 * either archive file has been changed, substituted, or removed, no policy
 * bundle is produced.
 *
 * This still does not promote nflverse, clear intended-use permission, start
 * observations retroactively, or authorize CCF_PRIMARY.
 */
export async function createCCFNflverseInjuryCertificationPoliciesFromArchivedIdentitySnapshot(
  input: CreateCCFNflverseInjuryCertificationPoliciesFromArchivedIdentitySnapshotInput,
): Promise<CCFNflverseInjuryCertificationPolicyBundle> {
  const materializedIdentity =
    await buildCCFNFLPlayerIdentityLinkageReceiptFromArchivedSnapshot(
      input.identitySnapshot,
      input.frozenAt,
    );

  return createCCFNflverseInjuryCertificationPolicies({
    identityReceipt: materializedIdentity.receipt,
    frozenAt: input.frozenAt,
    checkpoints: input.checkpoints,
  });
}