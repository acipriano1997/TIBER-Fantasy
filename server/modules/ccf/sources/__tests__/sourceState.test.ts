import {
  assertCCFSourceStateEligible,
  evaluateCCFSourceStateEligibility,
  type CCFSourceState,
} from "../sourceState";

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
};

describe("CCF source state eligibility", () => {
  it("admits only source-backed promoted evidence inside its support/staleness window", () => {
    expect(evaluateCCFSourceStateEligibility(promoted, "2026-09-12T00:00:00Z")).toEqual({
      eligible: true,
      reason: "eligible",
    });
    expect(() => assertCCFSourceStateEligible(promoted, "2026-09-12T00:00:00Z")).not.toThrow();
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
