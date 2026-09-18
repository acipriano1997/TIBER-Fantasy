import crypto from "crypto";

export interface CCFSourceReliabilityCheckpoint {
  checkpointId: string;
  scheduledFor: string;
}

export interface CCFSourceReliabilityPolicy {
  schemaVersion: "ccf-source-reliability-policy-v1";
  policyId: string;
  sourceId: string;
  producer: string;
  intendedUse: "ffcc_native_weekly_recommendation";
  frozenAt: string;
  parserVersion: string;
  identityBindingRef: string;
  criticalFieldPolicyRef: string;
  correctionPolicyRef: string;
  checkpointPolicyRef: string;
  checkpoints: CCFSourceReliabilityCheckpoint[];
  minimumSuccessfulCaptures: number;
  minimumCaptureSuccessRate: number;
  minimumSchemaValidRate: number;
  minimumIdentityResolutionRate: number;
  maximumCriticalMissingRate: number;
  maximumDuplicateKeyRate: number;
  minimumOnTimeCaptureRate: number;
  maximumCaptureDelayMs: number;
  maximumUnreconciledCorrections: number;
  notes: string[];
}

export type CCFSourceCaptureStatus = "success" | "failure";
export type CCFSourceSchemaStatus = "valid" | "invalid" | "not_evaluated";
export type CCFSourceCorrectionStatus =
  | "none"
  | "reconciled"
  | "unreconciled"
  | "not_evaluated";

export interface CCFSourceReliabilityObservation {
  schemaVersion: "ccf-source-reliability-observation-v1";
  observationId: string;
  sourceId: string;
  producer: string;
  checkpointId: string;
  scheduledFor: string;
  capturedAt: string;
  captureStatus: CCFSourceCaptureStatus;
  parserVersion: string | null;
  archiveRef: string | null;
  contentSha256: string | null;
  schemaStatus: CCFSourceSchemaStatus;
  rowCount: number;
  identityEligibleCount: number;
  identityResolvedCount: number;
  criticalFieldEligibleCount: number;
  criticalFieldMissingCount: number;
  duplicateKeyCount: number;
  correctionStatus: CCFSourceCorrectionStatus;
  evidenceRefs: string[];
  notes: string[];
}

export interface CCFSourceReliabilityMetrics {
  expectedCheckpointCount: number;
  observedCheckpointCount: number;
  successfulCaptureCount: number;
  captureSuccessRate: number;
  schemaValidRate: number | null;
  identityResolutionRate: number | null;
  criticalMissingRate: number | null;
  duplicateKeyRate: number | null;
  onTimeCaptureRate: number;
  unreconciledCorrectionCount: number;
}

export interface CCFSourceReliabilityReview {
  schemaVersion: "ccf-source-reliability-review-v1";
  reviewId: string;
  sourceId: string;
  producer: string;
  policyFingerprint: string;
  reviewedAt: string;
  status: "incomplete" | "passed" | "failed";
  metrics: CCFSourceReliabilityMetrics;
  blockers: string[];
  observationFingerprints: string[];
  reviewFingerprint: string;
  reviewRef: string;
}

export class CCFSourceReliabilityReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFSourceReliabilityReviewError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFSourceReliabilityReviewError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requireProbability(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new CCFSourceReliabilityReviewError(`${label} must be within [0, 1]`);
  }
}

function requireNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CCFSourceReliabilityReviewError(`${label} must be a non-negative integer`);
  }
}

function canonicalPolicy(policy: CCFSourceReliabilityPolicy) {
  return {
    ...policy,
    checkpoints: [...policy.checkpoints].sort((left, right) =>
      left.checkpointId.localeCompare(right.checkpointId),
    ),
    notes: [...policy.notes].sort(),
  };
}

function canonicalObservation(observation: CCFSourceReliabilityObservation) {
  return {
    ...observation,
    evidenceRefs: [...observation.evidenceRefs].sort(),
    notes: [...observation.notes].sort(),
  };
}

function requiredProcessingEvidenceRefs(policy: CCFSourceReliabilityPolicy): string[] {
  return [
    policy.identityBindingRef,
    policy.criticalFieldPolicyRef,
    policy.correctionPolicyRef,
    policy.checkpointPolicyRef,
  ];
}

export function validateCCFSourceReliabilityPolicy(
  policy: CCFSourceReliabilityPolicy,
): CCFSourceReliabilityPolicy {
  if (policy.schemaVersion !== "ccf-source-reliability-policy-v1") {
    throw new CCFSourceReliabilityReviewError("unsupported source reliability policy version");
  }
  for (const [label, value] of [
    ["policyId", policy.policyId],
    ["sourceId", policy.sourceId],
    ["producer", policy.producer],
    ["parserVersion", policy.parserVersion],
    ["identityBindingRef", policy.identityBindingRef],
    ["criticalFieldPolicyRef", policy.criticalFieldPolicyRef],
    ["correctionPolicyRef", policy.correctionPolicyRef],
    ["checkpointPolicyRef", policy.checkpointPolicyRef],
  ] as const) {
    if (!hasText(value)) throw new CCFSourceReliabilityReviewError(`${label} is required`);
  }
  if (policy.intendedUse !== "ffcc_native_weekly_recommendation") {
    throw new CCFSourceReliabilityReviewError(
      "intendedUse must remain ffcc_native_weekly_recommendation",
    );
  }
  const frozenAt = parseTimestamp("frozenAt", policy.frozenAt);
  if (policy.checkpoints.length === 0) {
    throw new CCFSourceReliabilityReviewError("checkpoints must not be empty");
  }
  const checkpointIds = new Set<string>();
  let earliestCheckpoint = Number.POSITIVE_INFINITY;
  for (const checkpoint of policy.checkpoints) {
    if (!hasText(checkpoint.checkpointId)) {
      throw new CCFSourceReliabilityReviewError("checkpointId is required");
    }
    if (checkpointIds.has(checkpoint.checkpointId)) {
      throw new CCFSourceReliabilityReviewError(
        `duplicate checkpointId ${checkpoint.checkpointId}`,
      );
    }
    checkpointIds.add(checkpoint.checkpointId);
    earliestCheckpoint = Math.min(
      earliestCheckpoint,
      parseTimestamp(`${checkpoint.checkpointId}.scheduledFor`, checkpoint.scheduledFor),
    );
  }
  if (frozenAt > earliestCheckpoint) {
    throw new CCFSourceReliabilityReviewError(
      "reliability policy must be frozen before the first observation checkpoint",
    );
  }
  requireNonNegativeInteger("minimumSuccessfulCaptures", policy.minimumSuccessfulCaptures);
  if (policy.minimumSuccessfulCaptures === 0) {
    throw new CCFSourceReliabilityReviewError("minimumSuccessfulCaptures must be positive");
  }
  if (policy.minimumSuccessfulCaptures > policy.checkpoints.length) {
    throw new CCFSourceReliabilityReviewError(
      "minimumSuccessfulCaptures cannot exceed checkpoint count",
    );
  }
  requireProbability("minimumCaptureSuccessRate", policy.minimumCaptureSuccessRate);
  requireProbability("minimumSchemaValidRate", policy.minimumSchemaValidRate);
  requireProbability("minimumIdentityResolutionRate", policy.minimumIdentityResolutionRate);
  requireProbability("maximumCriticalMissingRate", policy.maximumCriticalMissingRate);
  requireProbability("maximumDuplicateKeyRate", policy.maximumDuplicateKeyRate);
  requireProbability("minimumOnTimeCaptureRate", policy.minimumOnTimeCaptureRate);
  requireNonNegativeInteger("maximumCaptureDelayMs", policy.maximumCaptureDelayMs);
  requireNonNegativeInteger(
    "maximumUnreconciledCorrections",
    policy.maximumUnreconciledCorrections,
  );
  if (new Set(policy.notes).size !== policy.notes.length) {
    throw new CCFSourceReliabilityReviewError("policy notes must not contain duplicates");
  }
  return policy;
}

export function fingerprintCCFSourceReliabilityPolicy(
  policy: CCFSourceReliabilityPolicy,
): string {
  validateCCFSourceReliabilityPolicy(policy);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalPolicy(policy)))
    .digest("hex");
}

export function validateCCFSourceReliabilityObservation(
  observation: CCFSourceReliabilityObservation,
): CCFSourceReliabilityObservation {
  if (observation.schemaVersion !== "ccf-source-reliability-observation-v1") {
    throw new CCFSourceReliabilityReviewError(
      "unsupported source reliability observation version",
    );
  }
  for (const [label, value] of [
    ["observationId", observation.observationId],
    ["sourceId", observation.sourceId],
    ["producer", observation.producer],
    ["checkpointId", observation.checkpointId],
  ] as const) {
    if (!hasText(value)) throw new CCFSourceReliabilityReviewError(`${label} is required`);
  }
  const scheduledFor = parseTimestamp("scheduledFor", observation.scheduledFor);
  const capturedAt = parseTimestamp("capturedAt", observation.capturedAt);
  if (capturedAt < scheduledFor) {
    throw new CCFSourceReliabilityReviewError(
      "capturedAt cannot precede the scheduled reliability checkpoint",
    );
  }
  for (const [label, value] of [
    ["rowCount", observation.rowCount],
    ["identityEligibleCount", observation.identityEligibleCount],
    ["identityResolvedCount", observation.identityResolvedCount],
    ["criticalFieldEligibleCount", observation.criticalFieldEligibleCount],
    ["criticalFieldMissingCount", observation.criticalFieldMissingCount],
    ["duplicateKeyCount", observation.duplicateKeyCount],
  ] as const) {
    requireNonNegativeInteger(label, value);
  }
  if (observation.identityResolvedCount > observation.identityEligibleCount) {
    throw new CCFSourceReliabilityReviewError(
      "identityResolvedCount cannot exceed identityEligibleCount",
    );
  }
  if (observation.criticalFieldMissingCount > observation.criticalFieldEligibleCount) {
    throw new CCFSourceReliabilityReviewError(
      "criticalFieldMissingCount cannot exceed criticalFieldEligibleCount",
    );
  }
  if (observation.duplicateKeyCount > observation.rowCount) {
    throw new CCFSourceReliabilityReviewError("duplicateKeyCount cannot exceed rowCount");
  }

  if (observation.captureStatus === "success") {
    if (!hasText(observation.parserVersion)) {
      throw new CCFSourceReliabilityReviewError("successful captures require parserVersion");
    }
    if (!hasText(observation.archiveRef) || !hasText(observation.contentSha256)) {
      throw new CCFSourceReliabilityReviewError(
        "successful captures require archiveRef and contentSha256",
      );
    }
    if (!/^[a-f0-9]{64}$/i.test(observation.contentSha256)) {
      throw new CCFSourceReliabilityReviewError(
        "successful capture contentSha256 must be a 64-character hex digest",
      );
    }
    if (observation.schemaStatus === "not_evaluated") {
      throw new CCFSourceReliabilityReviewError(
        "successful captures must evaluate schema status",
      );
    }
    if (observation.correctionStatus === "not_evaluated") {
      throw new CCFSourceReliabilityReviewError(
        "successful captures must evaluate correction status",
      );
    }
  } else {
    if (observation.parserVersion !== null) {
      throw new CCFSourceReliabilityReviewError(
        "failed captures must not claim parserVersion",
      );
    }
    if (observation.archiveRef !== null || observation.contentSha256 !== null) {
      throw new CCFSourceReliabilityReviewError(
        "failed captures must not claim archiveRef or contentSha256",
      );
    }
    if (
      observation.schemaStatus !== "not_evaluated" ||
      observation.correctionStatus !== "not_evaluated" ||
      observation.rowCount !== 0 ||
      observation.identityEligibleCount !== 0 ||
      observation.identityResolvedCount !== 0 ||
      observation.criticalFieldEligibleCount !== 0 ||
      observation.criticalFieldMissingCount !== 0 ||
      observation.duplicateKeyCount !== 0
    ) {
      throw new CCFSourceReliabilityReviewError(
        "failed captures must not claim parsed quality measurements",
      );
    }
  }

  if (observation.evidenceRefs.length === 0) {
    throw new CCFSourceReliabilityReviewError("observation evidenceRefs must not be empty");
  }
  if (
    observation.evidenceRefs.some((reference) => !hasText(reference)) ||
    new Set(observation.evidenceRefs).size !== observation.evidenceRefs.length
  ) {
    throw new CCFSourceReliabilityReviewError(
      "observation evidenceRefs must contain unique non-empty references",
    );
  }
  if (
    observation.captureStatus === "success" &&
    observation.archiveRef != null &&
    !observation.evidenceRefs.includes(observation.archiveRef)
  ) {
    throw new CCFSourceReliabilityReviewError(
      "successful observation evidenceRefs must include archiveRef",
    );
  }
  if (new Set(observation.notes).size !== observation.notes.length) {
    throw new CCFSourceReliabilityReviewError("observation notes must not contain duplicates");
  }
  return observation;
}

export function fingerprintCCFSourceReliabilityObservation(
  observation: CCFSourceReliabilityObservation,
): string {
  validateCCFSourceReliabilityObservation(observation);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalObservation(observation)))
    .digest("hex");
}

function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function evaluateCCFSourceReliabilityReview(
  policy: CCFSourceReliabilityPolicy,
  observations: readonly CCFSourceReliabilityObservation[],
  reviewedAt: string,
): CCFSourceReliabilityReview {
  validateCCFSourceReliabilityPolicy(policy);
  const reviewedAtMs = parseTimestamp("reviewedAt", reviewedAt);
  if (reviewedAtMs < parseTimestamp("policy.frozenAt", policy.frozenAt)) {
    throw new CCFSourceReliabilityReviewError(
      "reviewedAt cannot precede the frozen reliability policy",
    );
  }

  const policyFingerprint = fingerprintCCFSourceReliabilityPolicy(policy);
  const checkpointById = new Map(
    policy.checkpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint]),
  );
  const observationIds = new Set<string>();
  const checkpointObservations = new Map<string, CCFSourceReliabilityObservation>();

  for (const observation of observations) {
    validateCCFSourceReliabilityObservation(observation);
    if (Date.parse(observation.capturedAt) > reviewedAtMs) {
      throw new CCFSourceReliabilityReviewError(
        `observation ${observation.observationId} was captured after reviewedAt`,
      );
    }
    if (observation.sourceId !== policy.sourceId || observation.producer !== policy.producer) {
      throw new CCFSourceReliabilityReviewError(
        `observation ${observation.observationId} does not match reliability policy source identity`,
      );
    }
    const checkpoint = checkpointById.get(observation.checkpointId);
    if (!checkpoint) {
      throw new CCFSourceReliabilityReviewError(
        `observation ${observation.observationId} references unknown checkpoint ${observation.checkpointId}`,
      );
    }
    if (observation.scheduledFor !== checkpoint.scheduledFor) {
      throw new CCFSourceReliabilityReviewError(
        `observation ${observation.observationId} scheduledFor does not match frozen policy`,
      );
    }
    if (observation.captureStatus === "success") {
      if (observation.parserVersion !== policy.parserVersion) {
        throw new CCFSourceReliabilityReviewError(
          `observation ${observation.observationId} parserVersion does not match frozen policy`,
        );
      }
      for (const reference of requiredProcessingEvidenceRefs(policy)) {
        if (!observation.evidenceRefs.includes(reference)) {
          throw new CCFSourceReliabilityReviewError(
            `observation ${observation.observationId} is missing frozen processing evidence ${reference}`,
          );
        }
      }
    }
    if (observationIds.has(observation.observationId)) {
      throw new CCFSourceReliabilityReviewError(
        `duplicate observationId ${observation.observationId}`,
      );
    }
    if (checkpointObservations.has(observation.checkpointId)) {
      throw new CCFSourceReliabilityReviewError(
        `multiple observations claim checkpoint ${observation.checkpointId}`,
      );
    }
    observationIds.add(observation.observationId);
    checkpointObservations.set(observation.checkpointId, observation);
  }

  const successful = observations.filter((observation) => observation.captureStatus === "success");
  const schemaValid = successful.filter((observation) => observation.schemaStatus === "valid");
  const expectedCheckpointCount = policy.checkpoints.length;
  const successfulCaptureCount = successful.length;
  const identityEligibleCount = successful.reduce(
    (sum, observation) => sum + observation.identityEligibleCount,
    0,
  );
  const identityResolvedCount = successful.reduce(
    (sum, observation) => sum + observation.identityResolvedCount,
    0,
  );
  const criticalFieldEligibleCount = successful.reduce(
    (sum, observation) => sum + observation.criticalFieldEligibleCount,
    0,
  );
  const criticalFieldMissingCount = successful.reduce(
    (sum, observation) => sum + observation.criticalFieldMissingCount,
    0,
  );
  const rowCount = successful.reduce((sum, observation) => sum + observation.rowCount, 0);
  const duplicateKeyCount = successful.reduce(
    (sum, observation) => sum + observation.duplicateKeyCount,
    0,
  );
  const onTimeCaptureCount = successful.filter((observation) => {
    const delay = Date.parse(observation.capturedAt) - Date.parse(observation.scheduledFor);
    return delay <= policy.maximumCaptureDelayMs;
  }).length;
  const unreconciledCorrectionCount = successful.filter(
    (observation) => observation.correctionStatus === "unreconciled",
  ).length;

  const metrics: CCFSourceReliabilityMetrics = {
    expectedCheckpointCount,
    observedCheckpointCount: observations.length,
    successfulCaptureCount,
    captureSuccessRate: successfulCaptureCount / expectedCheckpointCount,
    schemaValidRate: safeRate(schemaValid.length, successfulCaptureCount),
    identityResolutionRate: safeRate(identityResolvedCount, identityEligibleCount),
    criticalMissingRate: safeRate(criticalFieldMissingCount, criticalFieldEligibleCount),
    duplicateKeyRate: safeRate(duplicateKeyCount, rowCount),
    onTimeCaptureRate: onTimeCaptureCount / expectedCheckpointCount,
    unreconciledCorrectionCount,
  };

  const blockers = new Set<string>();
  const lastCheckpointAt = Math.max(
    ...policy.checkpoints.map((checkpoint) => Date.parse(checkpoint.scheduledFor)),
  );
  const reviewWindowComplete = reviewedAtMs >= lastCheckpointAt;
  if (!reviewWindowComplete) blockers.add("review_window_incomplete");

  const missingObservationCount = expectedCheckpointCount - observations.length;
  if (missingObservationCount > 0) blockers.add(`missing_observations:${missingObservationCount}`);
  if (successfulCaptureCount < policy.minimumSuccessfulCaptures) {
    blockers.add("successful_captures_below_minimum");
  }
  if (metrics.captureSuccessRate < policy.minimumCaptureSuccessRate) {
    blockers.add("capture_success_rate_below_threshold");
  }
  if (metrics.schemaValidRate == null) {
    blockers.add("schema_sample_empty");
  } else if (metrics.schemaValidRate < policy.minimumSchemaValidRate) {
    blockers.add("schema_valid_rate_below_threshold");
  }
  if (metrics.identityResolutionRate == null) {
    blockers.add("identity_sample_empty");
  } else if (metrics.identityResolutionRate < policy.minimumIdentityResolutionRate) {
    blockers.add("identity_resolution_rate_below_threshold");
  }
  if (metrics.criticalMissingRate == null) {
    blockers.add("critical_field_sample_empty");
  } else if (metrics.criticalMissingRate > policy.maximumCriticalMissingRate) {
    blockers.add("critical_missing_rate_above_threshold");
  }
  if (metrics.duplicateKeyRate == null) {
    blockers.add("row_sample_empty");
  } else if (metrics.duplicateKeyRate > policy.maximumDuplicateKeyRate) {
    blockers.add("duplicate_key_rate_above_threshold");
  }
  if (metrics.onTimeCaptureRate < policy.minimumOnTimeCaptureRate) {
    blockers.add("on_time_capture_rate_below_threshold");
  }
  if (metrics.unreconciledCorrectionCount > policy.maximumUnreconciledCorrections) {
    blockers.add("unreconciled_corrections_above_threshold");
  }

  const observationFingerprints = observations
    .map(fingerprintCCFSourceReliabilityObservation)
    .sort();
  const status: CCFSourceReliabilityReview["status"] = !reviewWindowComplete
    ? "incomplete"
    : blockers.size === 0
      ? "passed"
      : "failed";
  const canonicalReview = {
    schemaVersion: "ccf-source-reliability-review-v1" as const,
    reviewId: `${policy.policyId}:${reviewedAt}`,
    sourceId: policy.sourceId,
    producer: policy.producer,
    policyFingerprint,
    reviewedAt,
    status,
    metrics,
    blockers: Array.from(blockers).sort(),
    observationFingerprints,
  };
  const reviewFingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalReview))
    .digest("hex");

  return {
    ...canonicalReview,
    reviewFingerprint,
    reviewRef: `ccf://source-reliability/sha256/${reviewFingerprint}`,
  };
}
