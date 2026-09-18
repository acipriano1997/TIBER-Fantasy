import {
  buildCCFRollingValidationTiberOffEvidence,
} from "../rollingValidationTiberOffEvidence";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type {
  CCFRollingValidationExecutionV1,
} from "../rollingValidationExecution";
import type { CCFPlayerOutcome } from "../../outcomes/contract";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "tiber-off-replay-v1",
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
        end: { season: 2024, week: 3 },
      },
      test: {
        start: { season: 2024, week: 4 },
        end: { season: 2024, week: 4 },
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
      deterministicSeed: "tiber-off-replay",
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

function outcome(): CCFPlayerOutcome {
  return {
    playerId: "p1",
    position: "WR",
    season: 2024,
    week: 3,
    scoringFormat: "CUSTOM",
    scoringFingerprint: "scoring-v1",
    meanFpts: 12,
    medianFpts: 11,
    p10Fpts: 5,
    p25Fpts: 8,
    p75Fpts: 15,
    p90Fpts: 19,
    zeroOrNearZeroProbability: 0.05,
    boomProbability: 0.25,
    bustProbability: 0.15,
    volatility: 4,
    confidence: 0.8,
    coverage: 1,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [],
    criticalFeatureProvenance: [
      {
        feature: "opportunity.targets",
        producerFamily: "ccf_native_derived",
        critical: true,
        evidenceKind: "derived",
        sourceRef: "ccf://source/pbp-opportunity",
        knownAt: "2024-09-22T15:00:00Z",
      },
      {
        feature: "role.route_share",
        producerFamily: "ccf_native_model",
        critical: false,
        evidenceKind: "inferred",
        sourceRef: "ccf://source/role-model",
        knownAt: "2024-09-22T15:30:00Z",
      },
    ],
    modelVersion: "ccf-player-outcome-v0",
    asOf: "2024-09-22T16:00:00Z",
    mode: "CCF_NATIVE",
  };
}

function execution(
  frozen: CCFPredictiveValidationProtocol,
): CCFRollingValidationExecutionV1 {
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(frozen);
  return {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding: {
      contractVersion: "ccf-rolling-replay-binding-v1",
      bindingId: "ccf://rolling-replay-binding/sha256/tiber-off",
      windowIndex: 0,
      manifestFingerprint: "manifest-v1",
      protocolFingerprint,
      trainingDatasetFingerprint: "training-v1",
      trainingDatasetRef: "ccf://rolling-training-subset/sha256/training-v1",
      trainingRowIds: ["train-1"],
      evaluationRowIds: ["val-1"],
      trainingEvidenceMaxKnownAt: "2024-09-15T03:00:00Z",
      earliestEvaluationDecisionAsOf: "2024-09-22T16:00:00Z",
      modelArtifactFingerprint:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
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
        actualFantasyPoints: 14,
        predictedFantasyPoints: 12,
        pointEstimate: "mean_fpts",
        abstained: false,
        replayBindingId: "ccf://rolling-replay-binding/sha256/tiber-off",
        featureSnapshotFingerprint: "feature-v1",
        outcomeArtifactFingerprint: "outcome-v1",
        modelArtifactFingerprint:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        outcome: outcome(),
      },
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}

describe("CCF rolling validation TIBER-off evidence", () => {
  it("proves a sealed replay used only CCF-native model feature producers", () => {
    const frozen = protocol();
    const result = buildCCFRollingValidationTiberOffEvidence({
      protocol: frozen,
      execution: execution(frozen),
    });

    expect(result).toMatchObject({
      auditedPredictionCount: 1,
      auditedModelFeatureCount: 2,
      producerFamilies: ["ccf_native_derived", "ccf_native_model"],
      tiberUsedAsAuthority: false,
      tiberUsedAsModelInput: false,
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.evidenceRefs).toEqual(
      expect.arrayContaining([
        "ccf://rolling-replay-binding/sha256/tiber-off",
        "ccf://source/pbp-opportunity",
        "ccf://source/role-model",
      ]),
    );
    expect(result.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-tiber-off-evidence\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("fails if any model feature provenance uses TIBER even when marked non-critical", () => {
    const frozen = protocol();
    const run = execution(frozen);
    run.predictions[0].outcome.criticalFeatureProvenance[1] = {
      ...run.predictions[0].outcome.criticalFeatureProvenance[1],
      producerFamily: "tiber_model",
    };

    expect(() =>
      buildCCFRollingValidationTiberOffEvidence({
        protocol: frozen,
        execution: run,
      }),
    ).toThrow(/uses non-native producer tiber_model/);
  });

  it("fails when a model feature lacks auditable provenance", () => {
    const frozen = protocol();
    const run = execution(frozen);
    run.predictions[0].outcome.criticalFeatureProvenance[1] = {
      ...run.predictions[0].outcome.criticalFeatureProvenance[1],
      sourceRef: undefined,
    };

    expect(() =>
      buildCCFRollingValidationTiberOffEvidence({
        protocol: frozen,
        execution: run,
      }),
    ).toThrow(/missing provenance ref/);
  });

  it("rejects predictions that do not share the replay binding", () => {
    const frozen = protocol();
    const run = execution(frozen);
    run.predictions[0] = {
      ...run.predictions[0],
      replayBindingId: "ccf://rolling-replay-binding/sha256/other",
    };

    expect(() =>
      buildCCFRollingValidationTiberOffEvidence({
        protocol: frozen,
        execution: run,
      }),
    ).toThrow(/does not match the rolling replay binding/);
  });

  it("refuses any execution after final-holdout access", () => {
    const frozen = protocol();
    const run = execution(frozen);
    (run as any).finalHoldoutAccessed = true;

    expect(() =>
      buildCCFRollingValidationTiberOffEvidence({
        protocol: frozen,
        execution: run,
      }),
    ).toThrow(/sealed-holdout certification-only/);
  });

  it("fingerprints identical audited replays deterministically", () => {
    const frozen = protocol();
    const input = {
      protocol: frozen,
      execution: execution(frozen),
    };
    expect(
      buildCCFRollingValidationTiberOffEvidence(input).evidenceRef,
    ).toBe(
      buildCCFRollingValidationTiberOffEvidence(input).evidenceRef,
    );
  });
});
