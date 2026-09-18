import {
  buildCCFRollingValidationBaselineEvidence,
  type CCFRollingValidationBaselinePredictionV1,
} from "../rollingValidationBaselineEvidence";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type { CCFRollingValidationExecutionV1 } from "../rollingValidationExecution";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "baseline-evidence-v1",
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
      minimumOverallPairedRows: 1,
      minimumSubgroupRows: 1,
      minimumIndependentTimeBlocks: 1,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "baseline-evidence",
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

function execution(frozenProtocol: CCFPredictiveValidationProtocol): CCFRollingValidationExecutionV1 {
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(frozenProtocol);
  const outcome = (rowId: string, week: number, actual: number, predicted: number) => ({
    contractVersion: "ccf-historical-validation-prediction-v1" as const,
    rowId,
    blockId: `2024-W${week}`,
    actualFantasyPoints: actual,
    predictedFantasyPoints: predicted,
    pointEstimate: "mean_fpts" as const,
    abstained: false,
    replayBindingId: "ccf://rolling-replay-binding/sha256/abc",
    featureSnapshotFingerprint: `feature-${rowId}`,
    outcomeArtifactFingerprint: `outcome-${rowId}`,
    modelArtifactFingerprint: "model-v1",
    outcome: {
      playerId: "p1",
      position: "RB" as const,
      season: 2024,
      week,
      asOf: `2024-09-${String(week + 15).padStart(2, "0")}T16:00:00Z`,
      modelVersion: "ccf-player-outcome-v0",
      modelFamily: "CCF_PLAYER_OUTCOME" as const,
      mode: "CCF_NATIVE" as const,
      scoringFormat: "CUSTOM" as const,
      scoringFingerprint: "scoring-v1",
      meanFpts: predicted,
      medianFpts: predicted,
      p10Fpts: predicted - 3,
      p25Fpts: predicted - 1,
      p75Fpts: predicted + 1,
      p90Fpts: predicted + 3,
      stddevFpts: 2,
      zeroOrNearZeroProbability: 0.05,
      boomProbability: 0.2,
      bustProbability: 0.1,
      coverageScore: 1,
      confidenceScore: 0.9,
      abstain: false,
      criticalFeatureLineage: [],
      warnings: [],
    },
  });

  return {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding: {
      contractVersion: "ccf-rolling-replay-binding-v1",
      bindingId: "ccf://rolling-replay-binding/sha256/abc",
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
      outcome("val-1", 3, 10, 9),
      outcome("val-2", 4, 20, 18),
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

function baselines(): CCFRollingValidationBaselinePredictionV1[] {
  return [
    ["val-1", "historical_mean", 8],
    ["val-1", "recent_mean", 9.5],
    ["val-1", "usage_rate", 7],
    ["val-2", "historical_mean", 16],
    ["val-2", "recent_mean", 17],
    ["val-2", "usage_rate", 15],
  ].map(([rowId, arm, predictedFantasyPoints]) => ({
    contractVersion: "ccf-rolling-validation-baseline-prediction-v1" as const,
    rowId: rowId as string,
    arm: arm as "historical_mean" | "recent_mean" | "usage_rate",
    predictedFantasyPoints: predictedFantasyPoints as number,
    evidenceRef: `ccf://baseline/${rowId}/${arm}`,
  }));
}

describe("CCF rolling validation native baseline evidence", () => {
  it("builds paired baseline evidence on the exact frozen validation rows", () => {
    const frozenProtocol = protocol();
    const result = buildCCFRollingValidationBaselineEvidence({
      execution: execution(frozenProtocol),
      protocol: frozenProtocol,
      baselinePredictions: baselines(),
    });

    expect(result).toMatchObject({
      evaluationRowIds: ["val-1", "val-2"],
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.armEvidence).toHaveLength(3);
    const usage = result.armEvidence.find((row) => row.arm === "usage_rate");
    expect(usage).toMatchObject({
      pairedRows: 2,
      independentTimeBlocks: 2,
      candidateMae: 1.5,
      comparatorMae: 4,
      maeImprovement: 2.5,
    });
    expect(usage?.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-baseline-evidence\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("rejects a missing protocol-required baseline row", () => {
    const frozenProtocol = protocol();
    expect(() =>
      buildCCFRollingValidationBaselineEvidence({
        execution: execution(frozenProtocol),
        protocol: frozenProtocol,
        baselinePredictions: baselines().filter(
          (row) => !(row.rowId === "val-2" && row.arm === "usage_rate"),
        ),
      }),
    ).toThrow(/missing usage_rate baseline prediction for val-2/);
  });

  it("rejects extra baseline evidence outside the replay evaluation rows", () => {
    const frozenProtocol = protocol();
    expect(() =>
      buildCCFRollingValidationBaselineEvidence({
        execution: execution(frozenProtocol),
        protocol: frozenProtocol,
        baselinePredictions: [
          ...baselines(),
          {
            contractVersion:
              "ccf-rolling-validation-baseline-prediction-v1",
            rowId: "sealed-holdout",
            arm: "usage_rate",
            predictedFantasyPoints: 99,
            evidenceRef: "ccf://baseline/sealed-holdout/usage_rate",
          },
        ],
      }),
    ).toThrow(/unexpected baseline prediction sealed-holdout\|usage_rate/);
  });

  it("rejects protocol/execution fingerprint mismatch", () => {
    const frozenProtocol = protocol();
    const mutated = {
      ...frozenProtocol,
      protocolId: "mutated-protocol",
    };
    expect(() =>
      buildCCFRollingValidationBaselineEvidence({
        execution: execution(frozenProtocol),
        protocol: mutated,
        baselinePredictions: baselines(),
      }),
    ).toThrow(/frozen protocol does not match/);
  });
});
