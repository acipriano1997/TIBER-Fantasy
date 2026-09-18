import { evaluateCCFPredictivePromotion } from "../promotionEvaluation";
import type { CCFPredictiveValidationProtocol } from "../predictiveValidationProtocol";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "promotion-fixture-v1",
    frozenAt: "2026-09-15T05:30:00Z",
    modelVersion: "candidate-v1",
    datasetFingerprint: "dataset",
    sourcePlanFingerprint: "sources",
    scoringProfileFingerprint: "scoring",
    featureSetFingerprint: "features",
    decisionPolicyFingerprint: "policy",
    supportedPopulation: "QB/RB/WR/TE",
    split: {
      train: {
        start: { season: 2022, week: 1 },
        end: { season: 2024, week: 18 },
      },
      validation: {
        start: { season: 2025, week: 1 },
        end: { season: 2025, week: 18 },
      },
      test: {
        start: { season: 2026, week: 1 },
        end: { season: 2026, week: 18 },
      },
    },
    targets: ["fantasy_points"],
    arms: ["native_candidate", "historical_mean", "recent_mean", "usage_rate"],
    primaryMetrics: ["mae"],
    secondaryMetrics: ["rmse"],
    subgroupDimensions: ["position"],
    featureFamilies: ["usage", "role"],
    ablationModes: ["leave_one_family_out"],
    antiLeakageControls: [
      "post_cutoff_evidence_rejected",
      "future_correction_rejected",
      "current_depth_chart_backfill_rejected",
      "closing_market_leakage_rejected",
      "outcome_field_mutation_invariant",
      "identity_join_leakage_rejected",
      "missing_outcome_not_negative",
    ],
    negativeControls: ["label_permutation", "future_feature_canary"],
    samplePolicy: {
      minimumOverallPairedRows: 100,
      minimumSubgroupRows: 25,
      minimumIndependentTimeBlocks: 10,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "promotion-fixture-v1",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      {
        criterionId: "mae-vs-usage",
        target: "fantasy_points",
        metric: "mae",
        comparatorArm: "usage_rate",
        candidateArm: "native_candidate",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0.25,
        minimumRelativeImprovement: 0.05,
        confidenceLowerBoundMustBeatZero: true,
        appliesTo: "both",
      },
    ],
    outcomeAccessedBeforeFreeze: false,
    oneTouchFinalHoldoutRequired: true,
    freezeNativeBeforeChallengerRequired: true,
    tiberOffRequired: true,
    failedCandidateRetentionRequired: true,
    appendOnlyLedgerRequired: true,
    externalEvidenceCannotMutateFrozenPacket: true,
    notes: [],
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    criterionId: "mae-vs-usage",
    target: "fantasy_points" as const,
    metric: "mae" as const,
    comparatorArm: "usage_rate" as const,
    candidateArm: "native_candidate" as const,
    candidateValue: 4,
    comparatorValue: 5,
    pairedSampleSize: 500,
    independentTimeBlocks: 30,
    confidenceLowerBoundForImprovement: 0.2,
    supportedSubgroupsPassed: true,
    ...overrides,
  };
}

describe("CCF predictive promotion evaluation", () => {
  it("passes only when the frozen improvement, sample, uncertainty, and subgroup gates all pass", () => {
    const result = evaluateCCFPredictivePromotion(protocol(), [evidence()]);
    expect(result.passed).toBe(true);
    expect(result.criterionResults[0].absoluteImprovement).toBe(1);
    expect(result.criterionResults[0].relativeImprovement).toBeCloseTo(0.2);
  });

  it("fails rather than weakening a preregistered gate after outcomes are known", () => {
    const result = evaluateCCFPredictivePromotion(protocol(), [
      evidence({
        candidateValue: 4.7,
        confidenceLowerBoundForImprovement: -0.05,
      }),
    ]);
    expect(result.passed).toBe(false);
    expect(result.criterionResults[0].absoluteImprovementGatePassed).toBe(true);
    expect(result.criterionResults[0].relativeImprovementGatePassed).toBe(true);
    expect(result.criterionResults[0].confidenceGatePassed).toBe(false);
  });

  it("does not invent overall gates for a subgroup-only frozen criterion", () => {
    const frozen = protocol();
    frozen.promotionCriteria[0] = {
      ...frozen.promotionCriteria[0],
      appliesTo: "supported_subgroups",
    };

    const result = evaluateCCFPredictivePromotion(
      frozen,
      [
        evidence({
          candidateValue: null,
          comparatorValue: null,
          pairedSampleSize: null,
          independentTimeBlocks: null,
          confidenceLowerBoundForImprovement: null,
          supportedSubgroupsPassed: true,
        }),
      ] as never,
    );

    expect(result.passed).toBe(true);
    expect(result.criterionResults[0]).toMatchObject({
      absoluteImprovement: null,
      relativeImprovement: null,
      overallGateApplied: false,
      subgroupGateApplied: true,
      sampleGatePassed: true,
      independentBlockGatePassed: true,
      confidenceGatePassed: true,
      subgroupGatePassed: true,
      passed: true,
    });
  });

  it("binds metric/target/arm identity rather than trusting a criterion id alone", () => {
    expect(() =>
      evaluateCCFPredictivePromotion(protocol(), [
        evidence({ comparatorArm: "historical_mean" }),
      ] as never),
    ).toThrow(/comparatorArm does not match frozen criterion/);
  });

  it("fails closed on missing or unexpected criterion evidence", () => {
    expect(() => evaluateCCFPredictivePromotion(protocol(), [])).toThrow(/missing criterion evidence/);
    expect(() =>
      evaluateCCFPredictivePromotion(protocol(), [
        evidence({ criterionId: "not-in-protocol" }),
      ] as never),
    ).toThrow(/unexpected criterion evidence/);
  });
});
