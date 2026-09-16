import {
  evaluateCCFSourceReliabilityReview,
  fingerprintCCFSourceReliabilityObservation,
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityObservation,
  validateCCFSourceReliabilityPolicy,
  type CCFSourceReliabilityObservation,
  type CCFSourceReliabilityPolicy,
} from "../sourceReliabilityReview";

const PARSER_VERSION = "ccf-nflverse-injuries-candidate-v2";
const IDENTITY_BINDING_REF = "ccf://identity/gsis-player-v1";
const CRITICAL_FIELD_POLICY_REF = "ccf://policy/injury-critical-fields-v1";
const CORRECTION_POLICY_REF = "ccf://policy/injury-corrections-v1";
const CHECKPOINT_POLICY_REF = "ccf://policy/injury-checkpoints-v1";
const PROCESSING_REFS = [
  IDENTITY_BINDING_REF,
  CRITICAL_FIELD_POLICY_REF,
  CORRECTION_POLICY_REF,
  CHECKPOINT_POLICY_REF,
];

function policy(
  overrides: Partial<CCFSourceReliabilityPolicy> = {},
): CCFSourceReliabilityPolicy {
  return {
    schemaVersion: "ccf-source-reliability-policy-v1",
    policyId: "nflverse-injuries-prospective-review-v1",
    sourceId: "nflverse:injuries:v2",
    producer: "nflverse",
    intendedUse: "ffcc_native_weekly_recommendation",
    frozenAt: "2026-09-16T10:00:00Z",
    parserVersion: PARSER_VERSION,
    identityBindingRef: IDENTITY_BINDING_REF,
    criticalFieldPolicyRef: CRITICAL_FIELD_POLICY_REF,
    correctionPolicyRef: CORRECTION_POLICY_REF,
    checkpointPolicyRef: CHECKPOINT_POLICY_REF,
    checkpoints: [
      { checkpointId: "week-2-wed", scheduledFor: "2026-09-16T16:00:00Z" },
      { checkpointId: "week-2-thu", scheduledFor: "2026-09-17T16:00:00Z" },
      { checkpointId: "week-2-fri", scheduledFor: "2026-09-18T16:00:00Z" },
    ],
    minimumSuccessfulCaptures: 3,
    minimumCaptureSuccessRate: 1,
    minimumSchemaValidRate: 1,
    minimumIdentityResolutionRate: 0.99,
    maximumCriticalMissingRate: 0.05,
    maximumDuplicateKeyRate: 0,
    minimumOnTimeCaptureRate: 1,
    maximumCaptureDelayMs: 5 * 60 * 1000,
    maximumUnreconciledCorrections: 0,
    notes: [],
    ...overrides,
  };
}

function observation(
  checkpointId: string,
  scheduledFor: string,
  overrides: Partial<CCFSourceReliabilityObservation> = {},
): CCFSourceReliabilityObservation {
  const suffix = checkpointId.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const capturedAt = new Date(Date.parse(scheduledFor) + 60_000).toISOString();
  const archiveRef = `ccf://raw/nflverse/injuries/sha256/${suffix}`;
  return {
    schemaVersion: "ccf-source-reliability-observation-v1",
    observationId: `obs-${suffix}`,
    sourceId: "nflverse:injuries:v2",
    producer: "nflverse",
    checkpointId,
    scheduledFor,
    capturedAt,
    captureStatus: "success",
    parserVersion: PARSER_VERSION,
    archiveRef,
    contentSha256: "a".repeat(64),
    schemaStatus: "valid",
    rowCount: 100,
    identityEligibleCount: 100,
    identityResolvedCount: 100,
    criticalFieldEligibleCount: 100,
    criticalFieldMissingCount: 0,
    duplicateKeyCount: 0,
    correctionStatus: "none",
    evidenceRefs: [archiveRef, ...PROCESSING_REFS],
    notes: [],
    ...overrides,
  };
}

function passingObservations(): CCFSourceReliabilityObservation[] {
  const frozen = policy();
  return frozen.checkpoints.map((checkpoint, index) =>
    observation(checkpoint.checkpointId, checkpoint.scheduledFor, {
      correctionStatus: index === 2 ? "reconciled" : "none",
      contentSha256: String(index + 1).repeat(64),
    }),
  );
}

describe("CCF source reliability review", () => {
  it("passes only after the frozen review window with all thresholds satisfied", () => {
    const frozen = policy();
    const review = evaluateCCFSourceReliabilityReview(
      frozen,
      passingObservations(),
      "2026-09-18T17:00:00Z",
    );

    expect(review.status).toBe("passed");
    expect(review.blockers).toEqual([]);
    expect(review.metrics).toEqual({
      expectedCheckpointCount: 3,
      observedCheckpointCount: 3,
      successfulCaptureCount: 3,
      captureSuccessRate: 1,
      schemaValidRate: 1,
      identityResolutionRate: 1,
      criticalMissingRate: 0,
      duplicateKeyRate: 0,
      onTimeCaptureRate: 1,
      unreconciledCorrectionCount: 0,
    });
    expect(review.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(review.reviewRef).toBe(
      `ccf://source-reliability/sha256/${review.reviewFingerprint}`,
    );
  });

  it("refuses post-hoc threshold selection after the first checkpoint", () => {
    expect(() =>
      validateCCFSourceReliabilityPolicy(
        policy({ frozenAt: "2026-09-16T16:00:01Z" }),
      ),
    ).toThrow(/frozen before the first observation checkpoint/);
  });

  it("requires the reliability policy to freeze the processing identities", () => {
    expect(() => validateCCFSourceReliabilityPolicy(policy({ parserVersion: "" }))).toThrow(
      /parserVersion is required/,
    );
    expect(() =>
      validateCCFSourceReliabilityPolicy(policy({ identityBindingRef: "" })),
    ).toThrow(/identityBindingRef is required/);
    expect(() =>
      validateCCFSourceReliabilityPolicy(policy({ correctionPolicyRef: "" })),
    ).toThrow(/correctionPolicyRef is required/);
  });

  it("keeps a review incomplete before the final frozen checkpoint", () => {
    const frozen = policy();
    const review = evaluateCCFSourceReliabilityReview(
      frozen,
      passingObservations().slice(0, 2),
      "2026-09-17T17:00:00Z",
    );
    expect(review.status).toBe("incomplete");
    expect(review.blockers).toEqual(expect.arrayContaining([
      "review_window_incomplete",
      "missing_observations:1",
      "successful_captures_below_minimum",
      "capture_success_rate_below_threshold",
      "on_time_capture_rate_below_threshold",
    ]));
  });

  it("fails a completed window when an expected checkpoint is missing", () => {
    const frozen = policy();
    const review = evaluateCCFSourceReliabilityReview(
      frozen,
      passingObservations().slice(0, 2),
      "2026-09-18T17:00:00Z",
    );
    expect(review.status).toBe("failed");
    expect(review.blockers).toContain("missing_observations:1");
  });

  it("fails late capture, schema drift, identity loss, missing critical fields, duplicates, and unresolved corrections", () => {
    const frozen = policy({ minimumSuccessfulCaptures: 1 });
    const degraded = passingObservations();
    degraded[0] = {
      ...degraded[0],
      capturedAt: "2026-09-16T16:10:00Z",
      schemaStatus: "invalid",
      identityResolvedCount: 90,
      criticalFieldMissingCount: 20,
      duplicateKeyCount: 2,
      correctionStatus: "unreconciled",
    };
    const review = evaluateCCFSourceReliabilityReview(
      frozen,
      degraded,
      "2026-09-18T17:00:00Z",
    );

    expect(review.status).toBe("failed");
    expect(review.blockers).toEqual(expect.arrayContaining([
      "schema_valid_rate_below_threshold",
      "identity_resolution_rate_below_threshold",
      "critical_missing_rate_above_threshold",
      "duplicate_key_rate_above_threshold",
      "on_time_capture_rate_below_threshold",
      "unreconciled_corrections_above_threshold",
    ]));
  });

  it("does not fail merely because a correction occurred when before/after evidence is reconciled", () => {
    const frozen = policy();
    const observations = passingObservations();
    observations[1] = { ...observations[1], correctionStatus: "reconciled" };
    const review = evaluateCCFSourceReliabilityReview(
      frozen,
      observations,
      "2026-09-18T17:00:00Z",
    );
    expect(review.status).toBe("passed");
    expect(review.metrics.unreconciledCorrectionCount).toBe(0);
  });

  it("makes capture failure explicit rather than turning it into empty valid data", () => {
    const frozen = policy({ minimumSuccessfulCaptures: 2, minimumCaptureSuccessRate: 0.9 });
    const observations = passingObservations();
    observations[1] = observation(
      frozen.checkpoints[1].checkpointId,
      frozen.checkpoints[1].scheduledFor,
      {
        captureStatus: "failure",
        parserVersion: null,
        archiveRef: null,
        contentSha256: null,
        schemaStatus: "not_evaluated",
        rowCount: 0,
        identityEligibleCount: 0,
        identityResolvedCount: 0,
        criticalFieldEligibleCount: 0,
        criticalFieldMissingCount: 0,
        duplicateKeyCount: 0,
        correctionStatus: "not_evaluated",
        evidenceRefs: ["ccf://capture-error/week-2-thu"],
      },
    );
    const review = evaluateCCFSourceReliabilityReview(
      frozen,
      observations,
      "2026-09-18T17:00:00Z",
    );
    expect(review.status).toBe("failed");
    expect(review.metrics.successfulCaptureCount).toBe(2);
    expect(review.blockers).toContain("capture_success_rate_below_threshold");
  });

  it("rejects source identity drift, unknown checkpoints, duplicate checkpoint observations, and future observations", () => {
    const frozen = policy();
    const first = passingObservations()[0];

    expect(() =>
      evaluateCCFSourceReliabilityReview(
        frozen,
        [{ ...first, sourceId: "different-source" }],
        "2026-09-18T17:00:00Z",
      ),
    ).toThrow(/does not match reliability policy source identity/);

    expect(() =>
      evaluateCCFSourceReliabilityReview(
        frozen,
        [{ ...first, checkpointId: "unknown" }],
        "2026-09-18T17:00:00Z",
      ),
    ).toThrow(/unknown checkpoint/);

    expect(() =>
      evaluateCCFSourceReliabilityReview(
        frozen,
        [first, { ...first, observationId: "another-observation" }],
        "2026-09-18T17:00:00Z",
      ),
    ).toThrow(/multiple observations claim checkpoint/);

    expect(() =>
      evaluateCCFSourceReliabilityReview(
        frozen,
        [{ ...first, capturedAt: "2026-09-19T00:00:00Z" }],
        "2026-09-18T17:00:00Z",
      ),
    ).toThrow(/captured after reviewedAt/);
  });

  it("rejects parser drift and missing frozen processing evidence", () => {
    const frozen = policy();
    const first = passingObservations()[0];

    expect(() =>
      evaluateCCFSourceReliabilityReview(
        frozen,
        [{ ...first, parserVersion: "different-parser" }],
        "2026-09-18T17:00:00Z",
      ),
    ).toThrow(/parserVersion does not match frozen policy/);

    expect(() =>
      evaluateCCFSourceReliabilityReview(
        frozen,
        [{ ...first, evidenceRefs: first.evidenceRefs.filter((ref) => ref !== IDENTITY_BINDING_REF) }],
        "2026-09-18T17:00:00Z",
      ),
    ).toThrow(/missing frozen processing evidence/);
  });

  it("requires successful observations to carry the immutable archive witness and valid digest", () => {
    const first = passingObservations()[0];
    expect(() =>
      validateCCFSourceReliabilityObservation({
        ...first,
        evidenceRefs: PROCESSING_REFS,
      }),
    ).toThrow(/must include archiveRef/);

    expect(() =>
      validateCCFSourceReliabilityObservation({
        ...first,
        archiveRef: null,
      }),
    ).toThrow(/require archiveRef and contentSha256/);

    expect(() =>
      validateCCFSourceReliabilityObservation({
        ...first,
        contentSha256: "not-a-digest",
      }),
    ).toThrow(/64-character hex digest/);
  });

  it("fingerprints equivalent policy and observation ordering deterministically", () => {
    const firstPolicy = policy({ notes: ["b", "a"] });
    const secondPolicy = policy({
      notes: ["a", "b"],
      checkpoints: [...policy().checkpoints].reverse(),
    });
    expect(fingerprintCCFSourceReliabilityPolicy(firstPolicy)).toBe(
      fingerprintCCFSourceReliabilityPolicy(secondPolicy),
    );

    const first = passingObservations()[0];
    const second = {
      ...first,
      evidenceRefs: [...first.evidenceRefs].reverse(),
      notes: ["second", "first"],
    };
    const comparable = { ...first, notes: ["first", "second"] };
    expect(fingerprintCCFSourceReliabilityObservation(second)).toBe(
      fingerprintCCFSourceReliabilityObservation(comparable),
    );
  });
});
