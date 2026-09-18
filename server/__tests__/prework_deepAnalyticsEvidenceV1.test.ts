import {
  DEEP_ANALYTICS_FAMILIES_V1,
  DEEP_ANALYTICS_PREWORK_DOCTRINE_V1,
  evaluateDeepAnalyticsEvidenceV1,
  type DeepAnalyticsEvidenceV1,
} from "../prework_deepAnalyticsEvidenceV1";

const baseEvidence: DeepAnalyticsEvidenceV1 = {
  evidenceId: "route-coverage-player-week-1",
  family: "ROUTE_COVERAGE_INTERACTION",
  producer: "EXTERNAL_CHALLENGER",
  producerVersion: "research-v1",
  subjectId: "player-1",
  season: 2026,
  week: 1,
  knownAt: "2026-09-10T20:00:00Z",
  observedAt: "2026-09-10T19:00:00Z",
  coverage: "observed",
  sampleSize: 18,
  featureKeys: ["route_family", "coverage_family"],
  evidenceRefs: ["archive://route-coverage/player-1/week-1"],
};

describe("prework deep analytics evidence v1", () => {
  test("is explicitly inert and carries no recommendation authority", () => {
    expect(DEEP_ANALYTICS_PREWORK_DOCTRINE_V1).toEqual(
      expect.objectContaining({
        runtimeActivation: false,
        recommendationAuthority: "none",
        finalHoldoutAccess: false,
        scoringWeights: false,
      }),
    );
  });

  test("keeps the major anti-double-counting families explicit", () => {
    expect(DEEP_ANALYTICS_FAMILIES_V1).toEqual(
      expect.arrayContaining([
        "PASS_RUN_TENDENCY",
        "OFFENSIVE_INTENT",
        "ROUTE_COVERAGE_INTERACTION",
        "RUN_SCHEME_BLOCKING",
        "PASS_PROTECTION_PRESSURE",
        "ROLE_STATE",
        "JOINT_DEPENDENCE",
        "DECISION_OPTIONALITY",
      ]),
    );
  });

  test("allows point-in-time evidence for diagnostic use only", () => {
    expect(
      evaluateDeepAnalyticsEvidenceV1(
        baseEvidence,
        "2026-09-10T20:30:00Z",
      ),
    ).toEqual({
      eligibleForDiagnosticUse: true,
      eligibleForRuntimeInfluence: false,
      reasons: [],
    });
  });

  test("rejects evidence learned after the decision cutoff", () => {
    const result = evaluateDeepAnalyticsEvidenceV1(
      { ...baseEvidence, knownAt: "2026-09-10T21:00:00Z" },
      "2026-09-10T20:30:00Z",
    );

    expect(result.eligibleForDiagnosticUse).toBe(false);
    expect(result.eligibleForRuntimeInfluence).toBe(false);
    expect(result.reasons).toContain("future_known_at");
  });

  test("preserves unavailable rather than smuggling features through zero-like state", () => {
    const result = evaluateDeepAnalyticsEvidenceV1(
      {
        ...baseEvidence,
        coverage: "unavailable",
        sampleSize: 12,
        featureKeys: ["route_family"],
        evidenceRefs: [],
      },
      "2026-09-10T20:30:00Z",
    );

    expect(result.eligibleForDiagnosticUse).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "unavailable_has_features",
        "unavailable_has_sample",
      ]),
    );
  });

  test("requires evidence references whenever evidence is present", () => {
    const result = evaluateDeepAnalyticsEvidenceV1(
      { ...baseEvidence, evidenceRefs: [] },
      "2026-09-10T20:30:00Z",
    );

    expect(result.eligibleForDiagnosticUse).toBe(false);
    expect(result.reasons).toContain("missing_evidence_refs");
  });
});
