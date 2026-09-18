import {
  buildCCFRollingValidationDiagnosticEvidence,
} from "../rollingValidationDiagnosticEvidence";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type { CCFRollingValidationExecutionV1 } from "../rollingValidationExecution";
import type { CCFPlayerOutcome } from "../../outcomes/contract";

function protocol(
  secondaryMetrics: CCFPredictiveValidationProtocol["secondaryMetrics"] = [
    "rank_spearman",
    "rank_kendall",
    "pinball_loss",
    "interval_coverage",
    "abstention_selectivity",
  ],
): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "rolling-diagnostics-v1",
    frozenAt: "2026-09-18T15:00:00Z",
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
    secondaryMetrics,
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
      deterministicSeed: "rolling-diagnostics",
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
  week: number,
  medianFpts: number,
  {
    p10,
    p25,
    p75,
    p90,
    confidence,
    abstain = false,
  }: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
    confidence: number;
    abstain?: boolean;
  },
): CCFPlayerOutcome {
  return {
    playerId,
    position: "WR",
    season: 2024,
    week,
    scoringFormat: "PPR",
    scoringFingerprint: "scoring-v1",
    meanFpts: medianFpts,
    medianFpts,
    p10Fpts: p10,
    p25Fpts: p25,
    p75Fpts: p75,
    p90Fpts: p90,
    zeroOrNearZeroProbability: 0.05,
    boomProbability: 0.25,
    bustProbability: 0.15,
    volatility: 4,
    confidence,
    coverage: abstain ? 0.5 : 1,
    abstain,
    abstainReasons: abstain ? ["native_coverage_below_0.60"] : [],
    mechanismContributions: [],
    criticalFeatureProvenance: [],
    modelVersion: "ccf-player-outcome-v0",
    asOf: `2024-09-${week === 3 ? "22" : "29"}T16:00:00Z`,
    mode: "CCF_NATIVE",
  };
}

function execution(frozen: CCFPredictiveValidationProtocol): CCFRollingValidationExecutionV1 {
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(frozen);
  const bindingId = "ccf://rolling-replay-binding/sha256/diagnostics";
  const rows = [
    {
      rowId: "w3-a",
      blockId: "2024-W3",
      actualFantasyPoints: 10,
      predictedFantasyPoints: 9,
      outcome: outcome("p1", 3, 9, {
        p10: 5,
        p25: 7,
        p75: 11,
        p90: 13,
        confidence: 0.95,
      }),
    },
    {
      rowId: "w3-b",
      blockId: "2024-W3",
      actualFantasyPoints: 20,
      predictedFantasyPoints: 18,
      outcome: outcome("p2", 3, 18, {
        p10: 12,
        p25: 15,
        p75: 21,
        p90: 24,
        confidence: 0.8,
      }),
    },
    {
      rowId: "w4-a",
      blockId: "2024-W4",
      actualFantasyPoints: 15,
      predictedFantasyPoints: 14,
      outcome: outcome("p3", 4, 14, {
        p10: 9,
        p25: 12,
        p75: 17,
        p90: 20,
        confidence: 0.7,
      }),
    },
    {
      rowId: "w4-b",
      blockId: "2024-W4",
      actualFantasyPoints: 5,
      predictedFantasyPoints: 6,
      outcome: outcome("p4", 4, 6, {
        p10: 2,
        p25: 4,
        p75: 8,
        p90: 10,
        confidence: 0.2,
        abstain: true,
      }),
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
    pointEstimate: "median_fpts",
    predictions: rows.map((row) => ({
      contractVersion: "ccf-historical-validation-prediction-v1" as const,
      ...row,
      pointEstimate: "median_fpts" as const,
      abstained: row.outcome.abstain,
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

describe("CCF rolling validation diagnostic evidence", () => {
  it("derives only predeclared rank, quantile, interval, and selective diagnostics", () => {
    const frozen = protocol();
    const evidence = buildCCFRollingValidationDiagnosticEvidence({
      execution: execution(frozen),
      protocol: frozen,
    });

    expect(evidence).toMatchObject({
      contractVersion: "ccf-rolling-validation-diagnostic-evidence-v1",
      declaredMetrics: [
        "abstention_selectivity",
        "interval_coverage",
        "pinball_loss",
        "rank_kendall",
        "rank_spearman",
      ],
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(evidence.rankByBlock).toHaveLength(2);
    expect(evidence.rankByBlock?.map((block) => ({
      blockId: block.blockId,
      sampleSize: block.sampleSize,
      spearman: block.spearman,
      kendallTauB: block.kendallTauB,
    }))).toEqual([
      { blockId: "2024-W3", sampleSize: 2, spearman: 1, kendallTauB: 1 },
      { blockId: "2024-W4", sampleSize: 2, spearman: 1, kendallTauB: 1 },
    ]);
    expect(evidence.quantileScoring).toMatchObject({
      sampleSize: 20,
    });
    expect(evidence.quantileScoring?.byQuantile.map((row) => row.quantile)).toEqual([
      0.1,
      0.25,
      0.5,
      0.75,
      0.9,
    ]);
    expect(evidence.intervalCalibration).toMatchObject({
      sampleSize: 4,
      central80Coverage: 1,
    });
    expect(evidence.selectivePrediction).toMatchObject({
      selectionScoreField: "outcome.confidence",
      abstainedCount: 1,
      metrics: {
        sampleSize: 4,
      },
    });
    expect(evidence.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-diagnostic-evidence\/sha256\/[a-f0-9]{64}$/,
    );

    const again = buildCCFRollingValidationDiagnosticEvidence({
      execution: execution(frozen),
      protocol: frozen,
    });
    expect(again.evidenceRef).toBe(evidence.evidenceRef);
  });

  it("does not emit diagnostics that were not frozen into the protocol", () => {
    const frozen = protocol(["pinball_loss"]);
    const evidence = buildCCFRollingValidationDiagnosticEvidence({
      execution: execution(frozen),
      protocol: frozen,
    });

    expect(evidence.declaredMetrics).toEqual(["pinball_loss"]);
    expect(evidence.quantileScoring?.sampleSize).toBe(20);
    expect(evidence.rankByBlock).toBeNull();
    expect(evidence.intervalCalibration).toBeNull();
    expect(evidence.selectivePrediction).toBeNull();
  });

  it("refuses post-hoc probability diagnostics when no supported diagnostic was predeclared", () => {
    const frozen = protocol(["brier", "log_loss"]);
    expect(() =>
      buildCCFRollingValidationDiagnosticEvidence({
        execution: execution(frozen),
        protocol: frozen,
      }),
    ).toThrow(/declares no supported rolling diagnostic metrics/);
  });

  it("rejects tampered execution packets instead of scoring them", () => {
    const frozen = protocol();
    const run = execution(frozen);
    run.predictions[0] = {
      ...run.predictions[0],
      predictedFantasyPoints: 999,
    };

    expect(() =>
      buildCCFRollingValidationDiagnosticEvidence({
        execution: run,
        protocol: frozen,
      }),
    ).toThrow(/point estimate does not match its outcome/);
  });

  it("refuses diagnostics after final-holdout access", () => {
    const frozen = protocol();
    const run = execution(frozen) as CCFRollingValidationExecutionV1 & {
      finalHoldoutAccessed: boolean;
    };
    (run as any).finalHoldoutAccessed = true;

    expect(() =>
      buildCCFRollingValidationDiagnosticEvidence({
        execution: run as CCFRollingValidationExecutionV1,
        protocol: frozen,
      }),
    ).toThrow(/sealed-holdout certification-only execution/);
  });
});
