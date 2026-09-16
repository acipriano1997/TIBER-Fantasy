import {
  CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_FINGERPRINT_V1,
  CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_REF_V1,
  CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1,
  CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_FINGERPRINT_V1,
  CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1,
} from "../nflverseScheduleCertificationPolicy";
import {
  refCCFNflverseScheduleIdentityPolicyReceipt,
  validateCCFNflverseScheduleIdentityPolicyReceipt,
} from "../nflverseScheduleIdentity";
import {
  evaluateCCFSourceReliabilityReview,
  fingerprintCCFSourceReliabilityPolicy,
  validateCCFSourceReliabilityPolicy,
} from "../sourceReliabilityReview";

describe("nflverse schedule prospective certification policy", () => {
  it("freezes provider-native identity without claiming cross-provider canonical identity", () => {
    expect(() =>
      validateCCFNflverseScheduleIdentityPolicyReceipt(
        CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1,
      ),
    ).not.toThrow();
    expect(CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1.crossProviderCanonicalClaim).toBe(false);
    expect(CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_REF_V1).toBe(
      refCCFNflverseScheduleIdentityPolicyReceipt(
        CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_V1,
      ),
    );
    expect(CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_FINGERPRINT_V1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("freezes reliability thresholds before the first prospective checkpoint", () => {
    expect(() =>
      validateCCFSourceReliabilityPolicy(
        CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1,
      ),
    ).not.toThrow();
    const firstCheckpoint = Math.min(
      ...CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1.checkpoints.map((checkpoint) =>
        Date.parse(checkpoint.scheduledFor),
      ),
    );
    expect(Date.parse(CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1.frozenAt)).toBeLessThan(
      firstCheckpoint,
    );
    expect(CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1.identityBindingRef).toBe(
      CCF_NFLVERSE_SCHEDULE_IDENTITY_POLICY_REF_V1,
    );
    expect(CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_FINGERPRINT_V1).toBe(
      fingerprintCCFSourceReliabilityPolicy(
        CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1,
      ),
    );
  });

  it("cannot pass before the frozen observation window is complete", () => {
    const review = evaluateCCFSourceReliabilityReview(
      CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1,
      [],
      "2026-09-20T17:00:00Z",
    );
    expect(review.status).toBe("incomplete");
    expect(review.blockers).toContain("review_window_incomplete");
  });

  it("fails rather than inventing evidence when the window closes without observations", () => {
    const review = evaluateCCFSourceReliabilityReview(
      CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1,
      [],
      "2026-09-27T17:00:00Z",
    );
    expect(review.status).toBe("failed");
    expect(review.blockers).toEqual(expect.arrayContaining([
      "missing_observations:10",
      "successful_captures_below_minimum",
      "capture_success_rate_below_threshold",
      "schema_sample_empty",
      "identity_sample_empty",
      "critical_field_sample_empty",
      "row_sample_empty",
      "on_time_capture_rate_below_threshold",
    ]));
  });

  it("keeps permission and promotion outside the reliability policy", () => {
    expect(CCF_NFLVERSE_SCHEDULE_RELIABILITY_POLICY_V1.notes).toEqual(
      expect.arrayContaining([
        "passing reliability does not clear intended-use permission or source promotion",
      ]),
    );
  });
});
