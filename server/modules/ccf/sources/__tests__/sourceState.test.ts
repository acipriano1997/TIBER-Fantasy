import {
  assertCCFSourceStateEligible,
  evaluateCCFSourceStateEligibility,
  fingerprintCCFSourceQualification,
  type CCFSourceQualification,
  type CCFSourceState,
} from "../sourceState";

const qualification: CCFSourceQualification = {
  qualificationVersion: "ccf-source-qualification-v1",
  qualificationId: "example-source-qualification-v1",
  reviewedAt: "2026-09-11T11:00:00Z",
  termsOrLicenseRef: "terms://example/intended-use",
  permissionStatus: "permitted_for_intended_use",
  parserVersion: "example-parser-v1",
  rawTraceSupported: true,
  pointInTimeSemanticsDocumented: true,
  reliabilityReviewRef: "review://example/source-v1",
  reliabilityStatus: "passed",
  notes: [],
};

const promoted: CCFSourceState = {
  sourceId: "example",
  evidenceClass: "source_backed",
  governanceState: "promoted",
  knownAt: "2026-09-11T12:00:00Z",
  supportWindow: {
    validFrom: "2026-09-01T00:00:00Z",
    validThrough: "2026-09-20T23:59:59Z",
  },
  staleAfter: "2026-09-15T00:00:00Z",
  producer: "provider",
  qualification,
};

describe("CCF source state eligibility", () => {
  it("admits only qualified source-backed promoted evidence inside its support/staleness window", () => {
    expect(evaluateCCFSourceStateEligibility(promoted, "2026-09-12T00:00:00Z")).toEqual({
      eligible: true,
      reason: "eligible",
    });
    expect(() => assertCCFSourceStateEligible(promoted, "2026-09-12T00:00:00Z")).not.toThrow();
  });

  it("fingerprints qualification evidence deterministically", () => {
    expect(fingerprintCCFSourceQualification(qualification)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintCCFSourceQualification({ ...qualification })).toBe(
      fingerprintCCFSourceQualification(qualification),
    );
  });

  it("rejects fixtures regardless of directory or naming", () => {
    expect(
      evaluateCCFSourceStateEligibility(
        { ...promoted, evidenceClass: "fixture_only" },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "not_source_backed" });
  });

  it("rejects source-backed candidates until explicit promotion", () => {
    expect(
      evaluateCCFSourceStateEligibility(
        { ...promoted, governanceState: "candidate" },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "not_promoted" });
  });

  it("rejects a promoted label without qualification evidence", () => {
    expect(
      evaluateCCFSourceStateEligibility(
        { ...promoted, qualification: null },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "qualification_missing" });
  });

  it("requires intended-use permission rather than a terms reference alone", () => {
    expect(
      evaluateCCFSourceStateEligibility(
        {
          ...promoted,
          qualification: { ...qualification, permissionStatus: "evaluation_only" },
        },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "permission_not_cleared" });

    expect(
      evaluateCCFSourceStateEligibility(
        {
          ...promoted,
          qualification: { ...qualification, permissionStatus: "conflicted" },
        },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "permission_not_cleared" });
  });

  it("requires a versioned parser, raw trace, PIT semantics, and passed reliability review", () => {
    expect(
      evaluateCCFSourceStateEligibility(
        {
          ...promoted,
          qualification: { ...qualification, parserVersion: null },
        },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "parser_unversioned" });

    expect(
      evaluateCCFSourceStateEligibility(
        {
          ...promoted,
          qualification: { ...qualification, rawTraceSupported: false },
        },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "raw_trace_unavailable" });

    expect(
      evaluateCCFSourceStateEligibility(
        {
          ...promoted,
          qualification: { ...qualification, pointInTimeSemanticsDocumented: false },
        },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "point_in_time_undocumented" });

    expect(
      evaluateCCFSourceStateEligibility(
        {
          ...promoted,
          qualification: { ...qualification, reliabilityStatus: "incomplete" },
        },
        "2026-09-12T00:00:00Z",
      ),
    ).toEqual({ eligible: false, reason: "reliability_not_passed" });
  });

  it("rejects evidence known after the decision time", () => {
    expect(evaluateCCFSourceStateEligibility(promoted, "2026-09-11T11:59:59Z")).toEqual({
      eligible: false,
      reason: "known_after_as_of",
    });
  });

  it("rejects stale or unsupported evidence instead of silently using it", () => {
    expect(evaluateCCFSourceStateEligibility(promoted, "2026-09-16T00:00:00Z")).toEqual({
      eligible: false,
      reason: "stale",
    });
    expect(evaluateCCFSourceStateEligibility(promoted, "2026-09-25T00:00:00Z")).toEqual({
      eligible: false,
      reason: "after_support_window",
    });
  });
});
