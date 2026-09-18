import {
  buildCCFRollingValidationSubgroupPromotionEvidence,
} from "../rollingValidationSubgroupPromotionEvidence";
import {
  buildCCFRollingValidationSubgroupBaselineEvidence,
} from "../rollingValidationSubgroupBaselineEvidence";
import {
  buildCCFRollingValidationSubgroupEvidence,
} from "../rollingValidationSubgroupEvidence";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type {
  CCFNativeBaselineArm,
  CCFRollingValidationBaselinePredictionV1,
} from "../rollingValidationBaselineEvidence";
import type { CCFRollingValidationExecutionV1 } from "../rollingValidationExecution";
import type { CCFPlayerOutcome, CCFPosition } from "../../outcomes/contract";

function protocol(
  underpoweredSubgroupTreatment:
    CCFPredictiveValidationProtocol["samplePolicy"]["underpoweredSubgroupTreatment"] =
      "exclude_from_promotion",
): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "subgroup-promotion-evidence-v1",
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
    secondaryMetrics: ["interval_coverage"],
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
      underpoweredSubgroupTreatment,
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "subgroup-promotion-evidence",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      {
        criterionId: "fantasy-mae-vs-usage-by-position",
        target: "fantasy_points",
        metric: "mae",
        comparatorArm: "usage_rate",
        candidateArm: "native_candidate",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 1,
        minimumRelativeImprovement: null,
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

function outcome(
  playerId: string,
  position: CCFPosition,
  week: number,
  meanFpts: number,
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
    p10Fpts: meanFpts - 4,
    p25Fpts: meanFpts - 2,
    p75Fpts: meanFpts + 2,
    p90Fpts: meanFpts + 4,
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

function execution(
  frozen: CCFPredictiveValidationProtocol,
): CCFRollingValidationExecutionV1 {
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(frozen);
  const bindingId = "ccf://rolling-replay-binding/sha256/subgroup-promotion";
  const rows = [
    {
      rowId: "wr-1",
      blockId: "2024-W3",
      actualFantasyPoints: 10,
      predictedFantasyPoints: 9,
      outcome: outcome("wr-1", "WR", 3, 9),
    },
    {
      rowId: "wr-2",
      blockId: "2024-W4",
      actualFantasyPoints: 20,
      predictedFantasyPoints: 18,
      outcome: outcome("wr-2", "WR", 4, 18),
    },
    {
      rowId: "rb-1",
      blockId: "2024-W3",
      actualFantasyPoints: 12,
      predictedFantasyPoints: 10,
      outcome: outcome("rb-1", "RB", 3, 10),
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

function baselines(
  run: CCFRollingValidationExecutionV1,
): CCFRollingValidationBaselinePredictionV1[] {
  const offsets: Record<CCFNativeBaselineArm, number> = {
    historical_mean: 5,
    recent_mean: 4,
    usage_rate: 4,
  };
  const arms = Object.keys(offsets) as CCFNativeBaselineArm[];
  return run.predictions.flatMap((prediction) =>
    arms.map((arm) => ({
      contractVersion:
        "ccf-rolling-validation-baseline-prediction-v1" as const,
      rowId: prediction.rowId,
      arm,
      predictedFantasyPoints:
        prediction.actualFantasyPoints - offsets[arm],
      evidenceRef: `ccf://baseline/${prediction.rowId}/${arm}`,
    })),
  );
}

function packet(
  frozen: CCFPredictiveValidationProtocol,
) {
  const run = execution(frozen);
  const baselinePredictions = baselines(run);
  const subgroupEvidence = buildCCFRollingValidationSubgroupEvidence({
    execution: run,
    protocol: frozen,
  });
  const subgroupBaselineEvidence =
    buildCCFRollingValidationSubgroupBaselineEvidence({
      execution: run,
      protocol: frozen,
      baselinePredictions,
      subgroupEvidence,
    });
  return {
    run,
    baselinePredictions,
    subgroupBaselineEvidence,
  };
}

describe("CCF rolling validation subgroup promotion evidence", () => {
  it("evaluates powered positions with paired uncertainty and explicitly excludes underpowered positions", () => {
    const frozen = protocol("exclude_from_promotion");
    const {
      run,
      baselinePredictions,
      subgroupBaselineEvidence,
    } = packet(frozen);

    const evidence =
      buildCCFRollingValidationSubgroupPromotionEvidence({
        execution: run,
        protocol: frozen,
        baselinePredictions,
        subgroupBaselineEvidence,
      });

    expect(evidence).toMatchObject({
      dimension: "position",
      promotionEvaluated: false,
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(evidence.criterionEvidence).toHaveLength(1);

    const criterion = evidence.criterionEvidence[0];
    expect(criterion).toMatchObject({
      criterionId: "fantasy-mae-vs-usage-by-position",
      appliesTo: "both",
      comparatorArm: "usage_rate",
      evaluatedSubgroups: ["WR"],
      underpoweredSubgroups: ["RB"],
      supportedSubgroupsPassed: true,
    });

    const wr = criterion.subgroupResults.find(
      (row) => row.subgroup === "WR",
    );
    expect(wr).toMatchObject({
      status: "evaluated",
      pairedSampleSize: 2,
      independentTimeBlocks: 2,
      candidateValue: 1.5,
      comparatorValue: 4,
      absoluteImprovement: 2.5,
      sampleGatePassed: true,
      independentBlockGatePassed: true,
      absoluteImprovementGatePassed: true,
      relativeImprovementGatePassed: true,
      confidenceGatePassed: true,
      passed: true,
    });
    expect(wr?.confidenceLowerBoundForImprovement).toBeGreaterThan(0);
    expect(wr?.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-subgroup-criterion-result\/sha256\/[a-f0-9]{64}$/,
    );

    const rb = criterion.subgroupResults.find(
      (row) => row.subgroup === "RB",
    );
    expect(rb).toMatchObject({
      status: "excluded_underpowered",
      pairedSampleSize: 1,
      independentTimeBlocks: 1,
      sampleGatePassed: false,
      independentBlockGatePassed: false,
      passed: false,
    });
  });

  it("does not allow report-only underpowered groups to silently produce a subgroup pass", () => {
    const frozen = protocol("report_only");
    const {
      run,
      baselinePredictions,
      subgroupBaselineEvidence,
    } = packet(frozen);

    const evidence =
      buildCCFRollingValidationSubgroupPromotionEvidence({
        execution: run,
        protocol: frozen,
        baselinePredictions,
        subgroupBaselineEvidence,
      });

    expect(
      evidence.criterionEvidence[0].supportedSubgroupsPassed,
    ).toBe(false);
    expect(
      evidence.criterionEvidence[0].subgroupResults.find(
        (row) => row.subgroup === "RB",
      ),
    ).toMatchObject({
      status: "report_only_underpowered",
      passed: false,
    });
  });

  it("fails closed when pooling would be required but pooling semantics are not frozen", () => {
    const frozen = protocol("pool");
    const {
      run,
      baselinePredictions,
      subgroupBaselineEvidence,
    } = packet(frozen);

    expect(() =>
      buildCCFRollingValidationSubgroupPromotionEvidence({
        execution: run,
        protocol: frozen,
        baselinePredictions,
        subgroupBaselineEvidence,
      }),
    ).toThrow(/pooling semantics are not frozen/);
  });

  it("rejects subgroup summaries that disagree with raw paired evidence", () => {
    const frozen = protocol();
    const {
      run,
      baselinePredictions,
      subgroupBaselineEvidence,
    } = packet(frozen);
    const wrUsage = subgroupBaselineEvidence.rows.findIndex(
      (row) => row.subgroup === "WR" && row.arm === "usage_rate",
    );
    subgroupBaselineEvidence.rows[wrUsage] = {
      ...subgroupBaselineEvidence.rows[wrUsage],
      candidateMae: 999,
    };

    expect(() =>
      buildCCFRollingValidationSubgroupPromotionEvidence({
        execution: run,
        protocol: frozen,
        baselinePredictions,
        subgroupBaselineEvidence,
      }),
    ).toThrow(/paired evidence disagrees/);
  });

  it("refuses final-holdout-opened execution", () => {
    const frozen = protocol();
    const {
      run,
      baselinePredictions,
      subgroupBaselineEvidence,
    } = packet(frozen);
    (run as any).finalHoldoutAccessed = true;

    expect(() =>
      buildCCFRollingValidationSubgroupPromotionEvidence({
        execution: run,
        protocol: frozen,
        baselinePredictions,
        subgroupBaselineEvidence,
      }),
    ).toThrow(/sealed holdout|certification-only/);
  });
});
