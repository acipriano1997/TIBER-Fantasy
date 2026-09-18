import {
  buildCCFRollingValidationPromotionEvidence,
} from "../rollingValidationPromotionEvidence";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type {
  CCFRollingValidationBaselineEvidenceV1,
  CCFRollingValidationBaselinePredictionV1,
} from "../rollingValidationBaselineEvidence";
import type { CCFRollingValidationExecutionV1 } from "../rollingValidationExecution";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "promotion-evidence-v1",
    frozenAt: "2026-09-18T14:00:00Z",
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
    arms: ["native_candidate", "usage_rate"],
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
      minimumSubgroupRows: 1,
      minimumIndependentTimeBlocks: 2,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "promotion-evidence",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      {
        criterionId: "fantasy-mae-vs-usage",
        target: "fantasy_points",
        metric: "mae",
        comparatorArm: "usage_rate",
        candidateArm: "native_candidate",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0,
        minimumRelativeImprovement: null,
        confidenceLowerBoundMustBeatZero: false,
        appliesTo: "overall",
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

function execution(frozen: CCFPredictiveValidationProtocol): CCFRollingValidationExecutionV1 {
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(frozen);
  return {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding: {
      contractVersion: "ccf-rolling-replay-binding-v1",
      bindingId: "ccf://rolling-replay-binding/sha256/promotion",
      windowIndex: 0,
      manifestFingerprint: "manifest-v1",
      protocolFingerprint,
      trainingDatasetFingerprint: "training-v1",
      trainingDatasetRef: "ccf://rolling-training-subset/sha256/training-v1",
      trainingRowIds: ["train-1"],
      evaluationRowIds: ["val-1", "val-2"],
      trainingEvidenceMaxKnownAt: "2024-09-15T03:00:00Z",
      earliestEvaluationDecisionAsOf: "2024-09-22T16:00:00Z",
      modelArtifactFingerprint: "model-v1",
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    },
    pointEstimate: "mean_fpts",
    predictions: [
      {
        contractVersion: "ccf-historical-validation-prediction-v1",
        rowId: "val-1",
        blockId: "2024-W3",
        actualFantasyPoints: 10,
        predictedFantasyPoints: 9,
        pointEstimate: "mean_fpts",
        abstained: false,
        replayBindingId: "ccf://rolling-replay-binding/sha256/promotion",
        featureSnapshotFingerprint: "feature-1",
        outcomeArtifactFingerprint: "outcome-1",
        modelArtifactFingerprint: "model-v1",
        outcome: {} as any,
      },
      {
        contractVersion: "ccf-historical-validation-prediction-v1",
        rowId: "val-2",
        blockId: "2024-W4",
        actualFantasyPoints: 20,
        predictedFantasyPoints: 18,
        pointEstimate: "mean_fpts",
        abstained: false,
        replayBindingId: "ccf://rolling-replay-binding/sha256/promotion",
        featureSnapshotFingerprint: "feature-2",
        outcomeArtifactFingerprint: "outcome-2",
        modelArtifactFingerprint: "model-v1",
        outcome: {} as any,
      },
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

function baselines(): CCFRollingValidationBaselinePredictionV1[] {
  return [
    {
      contractVersion: "ccf-rolling-validation-baseline-prediction-v1",
      rowId: "val-1",
      arm: "usage_rate",
      predictedFantasyPoints: 7,
      evidenceRef: "ccf://baseline/val-1/usage",
    },
    {
      contractVersion: "ccf-rolling-validation-baseline-prediction-v1",
      rowId: "val-2",
      arm: "usage_rate",
      predictedFantasyPoints: 15,
      evidenceRef: "ccf://baseline/val-2/usage",
    },
  ];
}

function baselineEvidence(
  frozen: CCFPredictiveValidationProtocol,
): CCFRollingValidationBaselineEvidenceV1 {
  return {
    contractVersion: "ccf-rolling-validation-baseline-evidence-v1",
    replayBindingId: "ccf://rolling-replay-binding/sha256/promotion",
    protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(frozen),
    pointEstimate: "mean_fpts",
    evaluationRowIds: ["val-1", "val-2"],
    armEvidence: [
      {
        contractVersion: "ccf-rolling-validation-arm-evidence-v1",
        arm: "usage_rate",
        pairedRows: 2,
        independentTimeBlocks: 2,
        candidateMae: 1.5,
        comparatorMae: 4,
        maeImprovement: 2.5,
        candidateRmse: Math.sqrt(2.5),
        comparatorRmse: Math.sqrt(17),
        rmseImprovement: Math.sqrt(17) - Math.sqrt(2.5),
        candidateWins: 2,
        comparatorWins: 0,
        ties: 0,
        evidenceRef: "ccf://rolling-validation-baseline-evidence/sha256/usage",
      },
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

describe("CCF rolling validation promotion evidence", () => {
  it("derives paired-block uncertainty and frozen MAE criterion evidence", () => {
    const frozen = protocol();
    const result = buildCCFRollingValidationPromotionEvidence({
      execution: execution(frozen),
      baselineEvidence: baselineEvidence(frozen),
      baselinePredictions: baselines(),
      protocol: frozen,
    });

    expect(result).toMatchObject({
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.criterionEvidence).toHaveLength(1);
    const evidence = result.criterionEvidence[0];
    expect(evidence.criterion).toMatchObject({
      criterionId: "fantasy-mae-vs-usage",
      target: "fantasy_points",
      metric: "mae",
      comparatorArm: "usage_rate",
      candidateArm: "native_candidate",
      candidateValue: 1.5,
      comparatorValue: 4,
      pairedSampleSize: 2,
      independentTimeBlocks: 2,
      supportedSubgroupsPassed: null,
    });
    expect(evidence.uncertainty).toMatchObject({
      pairedSampleSize: 2,
      independentBlockCount: 2,
      candidateMeanLoss: 1.5,
      comparatorMeanLoss: 4,
      meanImprovement: 2.5,
    });
    expect(evidence.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-criterion-evidence\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("rejects baseline summaries that disagree with the paired row evidence", () => {
    const frozen = protocol();
    const summary = baselineEvidence(frozen);
    summary.armEvidence[0] = {
      ...summary.armEvidence[0],
      pairedRows: 1,
    };
    expect(() =>
      buildCCFRollingValidationPromotionEvidence({
        execution: execution(frozen),
        baselineEvidence: summary,
        baselinePredictions: baselines(),
        protocol: frozen,
      }),
    ).toThrow(/paired evidence disagrees/);
  });

  it("refuses evidence after any final-holdout access", () => {
    const frozen = protocol();
    const run = execution(frozen) as CCFRollingValidationExecutionV1 & {
      finalHoldoutAccessed: boolean;
    };
    (run as any).finalHoldoutAccessed = true;
    expect(() =>
      buildCCFRollingValidationPromotionEvidence({
        execution: run as CCFRollingValidationExecutionV1,
        baselineEvidence: baselineEvidence(frozen),
        baselinePredictions: baselines(),
        protocol: frozen,
      }),
    ).toThrow(/cannot consume an opened final holdout/);
  });
});
