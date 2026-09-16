import {
  CCFIndependenceError,
  CCFOutcomeContractError,
  assertCCFNativeIndependence,
  validateCCFPlayerOutcome,
  type CCFPlayerOutcome,
} from "../contract";

function makeOutcome(overrides: Partial<CCFPlayerOutcome> = {}): CCFPlayerOutcome {
  return {
    playerId: "player-1",
    position: "WR",
    season: 2026,
    week: 1,
    scoringFormat: "PPR",
    meanFpts: 16.2,
    medianFpts: 15.8,
    p10Fpts: 6.5,
    p25Fpts: 10.2,
    p75Fpts: 21.4,
    p90Fpts: 27.8,
    zeroOrNearZeroProbability: 0.04,
    boomProbability: 0.22,
    bustProbability: 0.18,
    volatility: 7.1,
    confidence: 0.72,
    coverage: 0.84,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [
      {
        family: "role_opportunity",
        direction: "up",
        magnitude: 1.4,
        confidence: 0.8,
        evidenceKind: "derived",
        evidenceRefs: ["usage-fixture"],
      },
    ],
    criticalFeatureProvenance: [
      {
        feature: "target_share",
        producerFamily: "ccf_native_fact",
        critical: true,
        evidenceKind: "observed",
        sourceRef: "usage-fixture",
        knownAt: "2026-09-10T20:00:00Z",
      },
      {
        feature: "role_state",
        producerFamily: "ccf_native_model",
        critical: true,
        evidenceKind: "inferred",
        sourceRef: "ccf-role-v0",
        knownAt: "2026-09-10T20:01:00Z",
      },
    ],
    modelVersion: "ccf-player-outcome-v0-fixture",
    asOf: "2026-09-11T12:00:00Z",
    mode: "CCF_NATIVE",
    ...overrides,
  };
}

describe("CCFPlayerOutcome contract", () => {
  it("accepts a temporally eligible native outcome", () => {
    const outcome = makeOutcome();

    expect(validateCCFPlayerOutcome(outcome)).toBe(outcome);
    expect(assertCCFNativeIndependence(outcome)).toBe(outcome);
  });

  it("rejects a critical TIBER model producer in CCF_NATIVE", () => {
    const outcome = makeOutcome({
      criticalFeatureProvenance: [
        {
          feature: "forecast_projection",
          producerFamily: "tiber_model",
          critical: true,
          evidenceKind: "external_challenger",
          sourceRef: "tiber-forecast",
          knownAt: "2026-09-10T20:00:00Z",
        },
      ],
    });

    expect(() => assertCCFNativeIndependence(outcome)).toThrow(CCFIndependenceError);
  });

  it("rejects a critical external consensus producer in CCF_NATIVE", () => {
    const outcome = makeOutcome({
      criticalFeatureProvenance: [
        {
          feature: "ecr_rank",
          producerFamily: "external_consensus",
          critical: true,
          evidenceKind: "external_challenger",
          sourceRef: "ecr",
          knownAt: "2026-09-10T20:00:00Z",
        },
      ],
    });

    expect(() => assertCCFNativeIndependence(outcome)).toThrow(CCFIndependenceError);
  });

  it("rejects a critical legacy internal heuristic in CCF_NATIVE", () => {
    const outcome = makeOutcome({
      criticalFeatureProvenance: [
        {
          feature: "epa_projection_proxy",
          producerFamily: "legacy_internal_heuristic",
          critical: true,
          evidenceKind: "derived",
          sourceRef: "start-sit-mapEPAToProjection",
          knownAt: "2026-09-10T20:00:00Z",
        },
      ],
    });

    expect(() => assertCCFNativeIndependence(outcome)).toThrow(CCFIndependenceError);
  });

  it("rejects an unknown critical producer in CCF_NATIVE", () => {
    const outcome = makeOutcome({
      criticalFeatureProvenance: [
        {
          feature: "unclassified_signal",
          producerFamily: "unknown",
          critical: true,
          evidenceKind: "inferred",
          knownAt: "2026-09-10T20:00:00Z",
        },
      ],
    });

    expect(() => assertCCFNativeIndependence(outcome)).toThrow(CCFIndependenceError);
  });

  it("allows noncritical challenger evidence to travel with a native result", () => {
    const outcome = makeOutcome({
      criticalFeatureProvenance: [
        ...makeOutcome().criticalFeatureProvenance,
        {
          feature: "tiber_disagreement_signal",
          producerFamily: "challenger_only",
          critical: false,
          evidenceKind: "external_challenger",
          sourceRef: "tiber-forecast",
          knownAt: "2026-09-10T20:00:00Z",
        },
      ],
    });

    expect(assertCCFNativeIndependence(outcome)).toBe(outcome);
  });

  it("rejects temporal leakage when a critical feature was not known by asOf", () => {
    const outcome = makeOutcome({
      criticalFeatureProvenance: [
        {
          feature: "late_injury_report",
          producerFamily: "ccf_native_fact",
          critical: true,
          evidenceKind: "observed",
          knownAt: "2026-09-11T13:00:00Z",
        },
      ],
    });

    expect(() => validateCCFPlayerOutcome(outcome)).toThrow(CCFOutcomeContractError);
  });

  it("rejects unordered quantiles", () => {
    const outcome = makeOutcome({ p25Fpts: 18, medianFpts: 15.8 });

    expect(() => validateCCFPlayerOutcome(outcome)).toThrow(CCFOutcomeContractError);
  });

  it("requires a reason when the model abstains", () => {
    const outcome = makeOutcome({ abstain: true, abstainReasons: [] });

    expect(() => validateCCFPlayerOutcome(outcome)).toThrow(CCFOutcomeContractError);
  });
});
