import {
  buildCCFRollingValidationPromotionEvaluation,
} from "../rollingValidationPromotionEvaluation";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictivePromotionCriterion,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type {
  CCFRollingValidationPromotionEvidenceV1,
} from "../rollingValidationPromotionEvidence";
import type {
  CCFRollingValidationSubgroupPromotionEvidenceV1,
} from "../rollingValidationSubgroupPromotionEvidence";

function criterion(
  criterionId: string,
  appliesTo: CCFPredictivePromotionCriterion["appliesTo"],
): CCFPredictivePromotionCriterion {
  return {
    criterionId,
    target: "fantasy_points",
    metric: "mae",
    comparatorArm: "usage_rate",
    candidateArm: "native_candidate",
    direction: "lower_is_better",
    minimumAbsoluteImprovement: 1,
    minimumRelativeImprovement: null,
    confidenceLowerBoundMustBeatZero: true,
    appliesTo,
  };
}

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "rolling-promotion-evaluation-v1",
    frozenAt: "2026-09-18T16:00:00Z",
    modelVersion: "ccf-player-outcome-v0",
    datasetFingerprint: "dataset-v1",
    sourcePlanFingerprint: "source-plan-v1",
    scoringProfileFingerprint: "scoring-v1",
    featureSetFingerprint: "features-v1",
    decisionPolicyFingerprint: "decision-v1",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
    split: {
      train: {
        start: { season: 2024, week: 1 },
        end: { season: 2024, week: 2 },
      },
      validation: {
        start: { season: 2024, week: 3 },
        end: { season: 2024, week: 4 },
      },
      test: {
        start: { season: 2024, week: 5 },
        end: { season: 2024, week: 5 },
      },
    },
    targets: ["fantasy_points"],
    arms: ["native_candidate", "historical_mean", "recent_mean", "usage_rate"],
    primaryMetrics: ["mae"],
    secondaryMetrics: ["rmse"],
    subgroupDimensions: ["position"],
    featureFamilies: ["role"],
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
      minimumOverallPairedRows: 2,
      minimumSubgroupRows: 2,
      minimumIndependentTimeBlocks: 2,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "rolling-promotion-evaluation",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      criterion("overall-mae", "overall"),
      criterion("both-mae", "both"),
      criterion("subgroup-mae", "supported_subgroups"),
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

function overallCriterion(criterionId: string) {
  return {
    contractVersion: "ccf-rolling-validation-criterion-evidence-v1" as const,
    criterion: {
      criterionId,
      target: "fantasy_points" as const,
      metric: "mae" as const,
      comparatorArm: "usage_rate" as const,
      candidateArm: "native_candidate" as const,
      candidateValue: 2,
      comparatorValue: 4,
      pairedSampleSize: 2,
      independentTimeBlocks: 2,
      confidenceLowerBoundForImprovement: 0.5,
      supportedSubgroupsPassed: null,
    },
    uncertainty: {} as any,
    evidenceRef:
      "ccf://rolling-validation-criterion-evidence/sha256/" +
      criterionId.padEnd(64, "a").slice(0, 64),
  };
}

function overallEvidence(
  frozen: CCFPredictiveValidationProtocol,
): CCFRollingValidationPromotionEvidenceV1 {
  return {
    contractVersion: "ccf-rolling-validation-promotion-evidence-v1",
    replayBindingId: "ccf://rolling-replay-binding/sha256/evaluation",
    protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(frozen),
    criterionEvidence: [
      overallCriterion("overall-mae"),
      overallCriterion("both-mae"),
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

function subgroupCriterion(
  criterionId: string,
  appliesTo: "supported_subgroups" | "both",
  supportedSubgroupsPassed = true,
) {
  return {
    contractVersion:
      "ccf-rolling-validation-subgroup-criterion-evidence-v1" as const,
    criterionId,
    appliesTo,
    comparatorArm: "usage_rate" as const,
    subgroupResults: [],
    evaluatedSubgroups: ["WR"],
    underpoweredSubgroups: [],
    supportedSubgroupsPassed,
    evidenceRef:
      "ccf://rolling-validation-subgroup-criterion-evidence/sha256/" +
      criterionId.padEnd(64, "b").slice(0, 64),
  };
}

function subgroupEvidence(
  frozen: CCFPredictiveValidationProtocol,
  subgroupOnlyPassed = true,
): CCFRollingValidationSubgroupPromotionEvidenceV1 {
  return {
    contractVersion:
      "ccf-rolling-validation-subgroup-promotion-evidence-v1",
    replayBindingId: "ccf://rolling-replay-binding/sha256/evaluation",
    protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(frozen),
    dimension: "position",
    criterionEvidence: [
      subgroupCriterion("both-mae", "both"),
      subgroupCriterion(
        "subgroup-mae",
        "supported_subgroups",
        subgroupOnlyPassed,
      ),
    ],
    promotionEvaluated: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

describe("CCF rolling validation promotion evaluation", () => {
  it("applies overall, subgroup-only, and both scopes without inventing extra gates", () => {
    const frozen = protocol();
    const result = buildCCFRollingValidationPromotionEvaluation({
      protocol: frozen,
      overallEvidence: overallEvidence(frozen),
      subgroupEvidence: subgroupEvidence(frozen),
    });

    expect(result).toMatchObject({
      promotionEvaluated: true,
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.evaluation.passed).toBe(true);

    expect(
      result.evaluation.criterionResults.find(
        (row) => row.criterionId === "overall-mae",
      ),
    ).toMatchObject({
      absoluteImprovement: 2,
      overallGateApplied: true,
      subgroupGateApplied: false,
      subgroupGatePassed: true,
      passed: true,
    });

    expect(
      result.evaluation.criterionResults.find(
        (row) => row.criterionId === "both-mae",
      ),
    ).toMatchObject({
      absoluteImprovement: 2,
      overallGateApplied: true,
      subgroupGateApplied: true,
      subgroupGatePassed: true,
      passed: true,
    });

    expect(
      result.evaluation.criterionResults.find(
        (row) => row.criterionId === "subgroup-mae",
      ),
    ).toMatchObject({
      absoluteImprovement: null,
      relativeImprovement: null,
      overallGateApplied: false,
      subgroupGateApplied: true,
      sampleGatePassed: true,
      independentBlockGatePassed: true,
      absoluteImprovementGatePassed: true,
      relativeImprovementGatePassed: true,
      confidenceGatePassed: true,
      subgroupGatePassed: true,
      passed: true,
    });
    expect(result.evidenceRefs).toHaveLength(4);
    expect(result.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-promotion-evaluation\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("fails the top-level validation gate when a required subgroup criterion fails", () => {
    const frozen = protocol();
    const result = buildCCFRollingValidationPromotionEvaluation({
      protocol: frozen,
      overallEvidence: overallEvidence(frozen),
      subgroupEvidence: subgroupEvidence(frozen, false),
    });

    expect(result.evaluation.passed).toBe(false);
    expect(
      result.evaluation.criterionResults.find(
        (row) => row.criterionId === "subgroup-mae",
      )?.subgroupGatePassed,
    ).toBe(false);
  });

  it("rejects evidence packets from different replay bindings", () => {
    const frozen = protocol();
    const subgroup = subgroupEvidence(frozen);
    (subgroup as any).replayBindingId =
      "ccf://rolling-replay-binding/sha256/other";

    expect(() =>
      buildCCFRollingValidationPromotionEvaluation({
        protocol: frozen,
        overallEvidence: overallEvidence(frozen),
        subgroupEvidence: subgroup,
      }),
    ).toThrow(/do not share one replay binding/);
  });

  it("refuses any packet after final-holdout access", () => {
    const frozen = protocol();
    const overall = overallEvidence(frozen);
    (overall as any).finalHoldoutAccessed = true;

    expect(() =>
      buildCCFRollingValidationPromotionEvaluation({
        protocol: frozen,
        overallEvidence: overall,
        subgroupEvidence: subgroupEvidence(frozen),
      }),
    ).toThrow(/opened final holdout/);
  });

  it("fingerprints identical sealed validation evidence deterministically", () => {
    const frozen = protocol();
    const input = {
      protocol: frozen,
      overallEvidence: overallEvidence(frozen),
      subgroupEvidence: subgroupEvidence(frozen),
    };
    expect(
      buildCCFRollingValidationPromotionEvaluation(input).evidenceRef,
    ).toBe(
      buildCCFRollingValidationPromotionEvaluation(input).evidenceRef,
    );
  });
});
