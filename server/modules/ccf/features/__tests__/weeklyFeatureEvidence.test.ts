import {
  CCFNativeFeatureUnavailableError,
  CCFWeeklyFeatureContractError,
  computeCCFNativeFeatureCoverage,
  requireCCFNativeNumericFeature,
  validateCCFWeeklyNativeFeatureSet,
  type CCFWeeklyNativeFeatureSet,
} from "../weeklyFeatureEvidence";

function featureSet(): CCFWeeklyNativeFeatureSet {
  return {
    playerId: "player-1",
    position: "RB",
    season: 2026,
    week: 1,
    asOf: "2026-09-11T12:00:00Z",
    features: {
      target_share: {
        key: "target_share",
        status: "available",
        value: 0.14,
        unit: "share",
        producerFamily: "ccf_native_fact",
        evidenceKind: "observed",
        knownAt: "2026-09-10T20:00:00Z",
        sourceRefs: ["usage-source"],
      },
      route_participation: {
        key: "route_participation",
        status: "missing",
        reason: "source coverage unavailable",
        sourceRefs: [],
      },
    },
  };
}

describe("CCF weekly native feature evidence", () => {
  it("accepts native, temporally eligible observed evidence", () => {
    expect(validateCCFWeeklyNativeFeatureSet(featureSet())).toEqual(featureSet());
  });

  it("does not convert a missing critical feature into zero", () => {
    expect(() =>
      requireCCFNativeNumericFeature(featureSet(), "route_participation"),
    ).toThrow(CCFNativeFeatureUnavailableError);
  });

  it("does not invent a value for an absent feature", () => {
    expect(() => requireCCFNativeNumericFeature(featureSet(), "goal_line_share")).toThrow(
      CCFNativeFeatureUnavailableError,
    );
  });

  it("rejects TIBER output presented as an available native feature", () => {
    const set = featureSet();
    set.features.forecast_projection = {
      key: "forecast_projection",
      status: "available",
      value: 16.8,
      unit: "fantasy_points",
      producerFamily: "tiber_model",
      evidenceKind: "external_challenger",
      knownAt: "2026-09-10T20:00:00Z",
      sourceRefs: ["tiber-forecast"],
    };

    expect(() => validateCCFWeeklyNativeFeatureSet(set)).toThrow(
      CCFWeeklyFeatureContractError,
    );
  });

  it("rejects temporally ineligible evidence", () => {
    const set = featureSet();
    set.features.target_share = {
      ...set.features.target_share,
      status: "available",
      value: 0.14,
      producerFamily: "ccf_native_fact",
      evidenceKind: "observed",
      knownAt: "2026-09-11T13:00:00Z",
      sourceRefs: ["usage-source"],
    };

    expect(() => validateCCFWeeklyNativeFeatureSet(set)).toThrow(
      CCFWeeklyFeatureContractError,
    );
  });

  it("computes explicit weighted coverage without filling missing values", () => {
    const coverage = computeCCFNativeFeatureCoverage(featureSet(), [
      { key: "target_share", weight: 2 },
      { key: "route_participation", weight: 1 },
    ]);

    expect(coverage).toBeCloseTo(2 / 3);
  });

  it("requires a versioned coverage policy with positive total weight", () => {
    expect(() =>
      computeCCFNativeFeatureCoverage(featureSet(), [
        { key: "target_share", weight: 0 },
      ]),
    ).toThrow(CCFWeeklyFeatureContractError);
  });
});
