import {
  buildCCFRollingValidationSubgroupEvidence,
} from "../rollingValidationSubgroupEvidence";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type { CCFRollingValidationExecutionV1 } from "../rollingValidationExecution";
import type { CCFPlayerOutcome, CCFPosition } from "../../outcomes/contract";

function protocol(
  subgroupDimensions: CCFPredictiveValidationProtocol["subgroupDimensions"] = ["position"],
): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "rolling-subgroups-v1",
    frozenAt: "2026-09-18T15:30:00Z",
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
    secondaryMetrics: ["interval_coverage"],
    subgroupDimensions,
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
      deterministicSeed: "rolling-subgroups",
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

function outcome(
  playerId: string,
  position: CCFPosition,
  week: number,
  meanFpts: number,
  p10Fpts: number,
  p90Fpts: number,
): CCFPlayerOutcome {
  return {
    playerId,
    position,
    season: 2024,
    week,
    scoringFormat: "PPR",
    scoringFingerprint: "scoring-v1",
    meanFpts,
    medianFpts: meanFpts,
    p10Fpts,
    p25Fpts: (p10Fpts + meanFpts) / 2,
    p75Fpts: (meanFpts + p90Fpts) / 2,
    p90Fpts,
    zeroOrNearZeroProbability: 0.05,
    boomProbability: 0.25,
    bustProbability: 0.15,
    volatility: 4,
    confidence: 0.8,
    coverage: 1,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [],
    criticalFeatureProvenance: [],
    modelVersion: "ccf-player-outcome-v0",
    asOf: `2024-09-${week === 3 ? "22" : "29"}T16:00:00Z`,
    mode: "CCF_NATIVE",
  };
}

function execution(frozen: CCFPredictiveValidationProtocol): CCFRollingValidationExecutionV1 {
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(frozen);
  const bindingId = "ccf://rolling-replay-binding/sha256/subgroups";
  const rows = [
    {
      rowId: "wr-1",
      blockId: "2024-W3",
      actualFantasyPoints: 10,
      predictedFantasyPoints: 9,
      outcome: outcome("wr-1", "WR", 3, 9, 5, 13),
    },
    {
      rowId: "wr-2",
      blockId: "2024-W4",
      actualFantasyPoints: 20,
      predictedFantasyPoints: 18,
      outcome: outcome("wr-2", "WR", 4, 18, 12, 24),
    },
    {
      rowId: "rb-1",
      blockId: "2024-W3",
      actualFantasyPoints: 12,
      predictedFantasyPoints: 10,
      outcome: outcome("rb-1", "RB", 3, 10, 6, 14),
    },
    {
      rowId: "te-1",
      blockId: "2024-W4",
      actualFantasyPoints: 8,
      predictedFantasyPoints: 9,
      outcome: outcome("te-1", "TE", 4, 9, 5, 12),
    },
  ];

  return {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding: {
      contractVersion: "ccf-rolling-replay-binding-v1",
      bindingId,
      windowIndex: 0,
      manifestFingerprint: "manifest-v1",
      protocolFingerprint,
      trainingDatasetFingerprint: "training-v1",
      trainingDatasetRef: "ccf://rolling-training-subset/sha256/training-v1",
      trainingRowIds: ["train-1"],
      evaluationRowIds: rows.map((row) => row.rowId),
      trainingEvidenceMaxKnownAt: "2024-09-15T03:00:00Z",
      earliestEvaluationDecisionAsOf: "2024-09-22T16:00:00Z",
      modelArtifactFingerprint: "model-v1",
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    },
    pointEstimate: "mean_fpts",
    predictions: rows.map((row) => ({
      contractVersion: "ccf-historical-validation-prediction-v1" as const,
      ...row,
      pointEstimate: "mean_fpts" as const,
      abstained: false,
      replayBindingId: bindingId,
      featureSnapshotFingerprint: `feature-${row.rowId}`,
      outcomeArtifactFingerprint: `outcome-${row.rowId}`,
      modelArtifactFingerprint: "model-v1",
    })),
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

describe("CCF rolling validation subgroup evidence", () => {
  it("reports admitted and underpowered position groups without creating a promotion verdict", () => {
    const frozen = protocol();
    const evidence = buildCCFRollingValidationSubgroupEvidence({
      execution: execution(frozen),
      protocol: frozen,
    });

    expect(evidence).toMatchObject({
      dimension: "position",
      minimumSubgroupRows: 2,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
      promotionEvaluated: false,
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(evidence.report.overall).toMatchObject({
      subgroup: "ALL",
      sampleSize: 4,
    });
    expect(evidence.report.groups).toHaveLength(1);
    expect(evidence.report.groups[0]).toMatchObject({
      subgroup: "WR",
      sampleSize: 2,
      mae: 1.5,
      central80Coverage: 1,
    });
    expect(evidence.underpoweredSubgroups).toEqual([
      { subgroup: "RB", sampleSize: 1 },
      { subgroup: "TE", sampleSize: 1 },
    ]);
    expect(evidence.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-subgroup-evidence\/sha256\/[a-f0-9]{64}$/,
    );

    const again = buildCCFRollingValidationSubgroupEvidence({
      execution: execution(frozen),
      protocol: frozen,
    });
    expect(again.evidenceRef).toBe(evidence.evidenceRef);
  });

  it("refuses a subgroup dimension that was not predeclared", () => {
    const frozen = protocol(["season"]);
    expect(() =>
      buildCCFRollingValidationSubgroupEvidence({
        execution: execution(frozen),
        protocol: frozen,
      }),
    ).toThrow(/did not predeclare position subgroup analysis/);
  });

  it("refuses a tampered point estimate", () => {
    const frozen = protocol();
    const run = execution(frozen);
    run.predictions[0] = {
      ...run.predictions[0],
      predictedFantasyPoints: 100,
    };

    expect(() =>
      buildCCFRollingValidationSubgroupEvidence({
        execution: run,
        protocol: frozen,
      }),
    ).toThrow(/point estimate does not match its outcome/);
  });

  it("refuses subgroup evidence after final-holdout access", () => {
    const frozen = protocol();
    const run = execution(frozen) as CCFRollingValidationExecutionV1 & {
      finalHoldoutAccessed: boolean;
    };
    (run as any).finalHoldoutAccessed = true;

    expect(() =>
      buildCCFRollingValidationSubgroupEvidence({
        execution: run as CCFRollingValidationExecutionV1,
        protocol: frozen,
      }),
    ).toThrow(/sealed-holdout certification-only execution/);
  });
});
