import {
  buildCCFRollingReplayBinding,
  fingerprintCCFRollingTrainingSubset,
} from "../rollingReplayBinding";
import {
  fingerprintCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "../historicalDatasetManifest";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import type { CCFRollingBacktestWindow } from "../rollingBacktest";
import type { CCFPlayerOutcomeModelArtifactV0 } from "../../outcomes/playerOutcomeEngineV0";

function manifest(): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "rolling-replay-history-v1",
    schemaVersion: "player-game-decision-v1",
    frozenAt: "2026-09-17T22:00:00Z",
    sourcePlanFingerprint: "source-plan-v1",
    scoringProfileFingerprint: "scoring-v1",
    featureSetFingerprint: "features-v1",
    decisionPolicyFingerprint: "decision-policy-v1",
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
    candidateRowCount: 4,
    exclusions: [],
    rows: [
      {
        rowId: "train-w1",
        canonicalPlayerId: "p1",
        gameId: "g1",
        season: 2024,
        week: 1,
        decisionAsOf: "2024-09-08T16:00:00Z",
        maxFeatureKnownAt: "2024-09-08T15:00:00Z",
        featureSnapshotFingerprint: "f1",
        sourceSnapshotRefs: ["source://w1"],
        outcomeArtifactFingerprint: "o1",
        outcomeKnownAt: "2024-09-09T03:00:00Z",
        split: "train",
        outcomeAccess: "available_for_training",
      },
      {
        rowId: "train-w2",
        canonicalPlayerId: "p1",
        gameId: "g2",
        season: 2024,
        week: 2,
        decisionAsOf: "2024-09-15T16:00:00Z",
        maxFeatureKnownAt: "2024-09-15T15:00:00Z",
        featureSnapshotFingerprint: "f2",
        sourceSnapshotRefs: ["source://w2"],
        outcomeArtifactFingerprint: "o2",
        outcomeKnownAt: "2024-09-16T03:00:00Z",
        split: "train",
        outcomeAccess: "available_for_training",
      },
      {
        rowId: "validation-w3",
        canonicalPlayerId: "p1",
        gameId: "g3",
        season: 2024,
        week: 3,
        decisionAsOf: "2024-09-22T16:00:00Z",
        maxFeatureKnownAt: "2024-09-22T15:00:00Z",
        featureSnapshotFingerprint: "f3",
        sourceSnapshotRefs: ["source://w3"],
        outcomeArtifactFingerprint: "o3",
        outcomeKnownAt: "2024-09-23T03:00:00Z",
        split: "validation",
        outcomeAccess: "available_for_validation",
      },
      {
        rowId: "sealed-w4",
        canonicalPlayerId: "p1",
        gameId: "g4",
        season: 2024,
        week: 4,
        decisionAsOf: "2024-09-29T16:00:00Z",
        maxFeatureKnownAt: "2024-09-29T15:00:00Z",
        featureSnapshotFingerprint: "f4",
        sourceSnapshotRefs: ["source://w4"],
        outcomeArtifactFingerprint: "sealed-o4",
        outcomeKnownAt: "2024-09-30T03:00:00Z",
        split: "test",
        outcomeAccess: "sealed_final_holdout",
      },
    ],
    finalHoldoutOutcomesSealed: true,
    finalHoldoutAccessCountAtFreeze: 0,
    outcomeValuesEmbeddedInManifest: false,
    notes: [],
  };
}

function protocol(dataset: CCFHistoricalDatasetManifest): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "rolling-replay-protocol-v1",
    frozenAt: "2026-09-17T22:05:00Z",
    modelVersion: "ccf-player-outcome-rb-v0",
    datasetFingerprint: fingerprintCCFHistoricalDatasetManifest(dataset),
    sourcePlanFingerprint: dataset.sourcePlanFingerprint,
    scoringProfileFingerprint: dataset.scoringProfileFingerprint,
    featureSetFingerprint: dataset.featureSetFingerprint,
    decisionPolicyFingerprint: dataset.decisionPolicyFingerprint,
    supportedPopulation: dataset.supportedPopulation,
    split: dataset.split,
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
      deterministicSeed: "rolling-replay",
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

function window(): CCFRollingBacktestWindow {
  return {
    index: 0,
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
    trainObservationCount: 2,
    validationObservationCount: 1,
    testObservationCount: 1,
  };
}

function artifact(
  dataset: CCFHistoricalDatasetManifest,
  frozenProtocol: CCFPredictiveValidationProtocol,
  overrides: Partial<CCFPlayerOutcomeModelArtifactV0> = {},
): CCFPlayerOutcomeModelArtifactV0 {
  const trainingFingerprint = fingerprintCCFRollingTrainingSubset(
    dataset,
    window(),
  );
  return {
    contractVersion: "ccf-player-outcome-model-artifact-v0",
    modelVersion: frozenProtocol.modelVersion,
    position: "RB",
    scoringFormat: "CUSTOM",
    scoringFingerprint: dataset.scoringProfileFingerprint,
    featureKeys: ["opportunity.targets"],
    criticalFeatureKeys: ["opportunity.targets"],
    coverageRequirements: [{ key: "opportunity.targets", weight: 1 }],
    featureFamilies: { "opportunity.targets": "role" },
    heads: {
      meanFpts: { intercept: 0, coefficients: { "opportunity.targets": 1 } },
      medianFpts: { intercept: 0, coefficients: { "opportunity.targets": 1 } },
      p10Fpts: { intercept: -3, coefficients: { "opportunity.targets": 1 } },
      p25Fpts: { intercept: -1, coefficients: { "opportunity.targets": 1 } },
      p75Fpts: { intercept: 1, coefficients: { "opportunity.targets": 1 } },
      p90Fpts: { intercept: 3, coefficients: { "opportunity.targets": 1 } },
      logVolatility: { intercept: Math.log(2), coefficients: { "opportunity.targets": 0 } },
      zeroOrNearZeroProbabilityLogit: { intercept: -2, coefficients: { "opportunity.targets": 0 } },
      boomProbabilityLogit: { intercept: -1, coefficients: { "opportunity.targets": 0 } },
      bustProbabilityLogit: { intercept: 0, coefficients: { "opportunity.targets": 0 } },
      confidenceLogit: { intercept: 1, coefficients: { "opportunity.targets": 0 } },
    },
    abstainBelowCoverage: 1,
    trainingDatasetFingerprint: trainingFingerprint,
    trainingDatasetFrozenAt: "2026-09-17T22:00:00Z",
    validationProtocolFingerprint:
      fingerprintCCFPredictiveValidationProtocol(frozenProtocol),
    validationProtocolFrozenAt: frozenProtocol.frozenAt,
    sourcePlanFingerprint: dataset.sourcePlanFingerprint,
    featureSetFingerprint: dataset.featureSetFingerprint,
    decisionPolicyFingerprint: dataset.decisionPolicyFingerprint,
    supportedPopulation: dataset.supportedPopulation,
    trainedAt: "2026-09-17T22:10:00Z",
    frozenAt: "2026-09-17T22:11:00Z",
    trainingDatasetRef:
      `ccf://rolling-training-subset/sha256/${trainingFingerprint}`,
    validationProtocolRef: "ccf://predictive-validation/rolling-replay-protocol-v1",
    notes: ["synthetic rolling replay binding artifact"],
    ...overrides,
  };
}

describe("CCF rolling replay binding", () => {
  it("binds a fold artifact to non-holdout training rows and their true evidence cutoff", () => {
    const dataset = manifest();
    const frozenProtocol = protocol(dataset);
    const model = artifact(dataset, frozenProtocol);
    const binding = buildCCFRollingReplayBinding({
      manifest: dataset,
      protocol: frozenProtocol,
      window: window(),
      artifact: model,
    });

    expect(binding).toMatchObject({
      windowIndex: 0,
      trainingRowIds: ["train-w1", "train-w2"],
      evaluationRowIds: ["validation-w3"],
      trainingEvidenceMaxKnownAt: "2024-09-16T03:00:00Z",
      earliestEvaluationDecisionAsOf: "2024-09-22T16:00:00Z",
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(binding.bindingId).toMatch(
      /^ccf:\/\/rolling-replay-binding\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("rejects artifacts that are not trained on the exact fold subset", () => {
    const dataset = manifest();
    const frozenProtocol = protocol(dataset);
    expect(() =>
      buildCCFRollingReplayBinding({
        manifest: dataset,
        protocol: frozenProtocol,
        window: window(),
        artifact: artifact(dataset, frozenProtocol, {
          trainingDatasetFingerprint: "wrong-fold",
        }),
      }),
    ).toThrow(/trainingDatasetFingerprint does not match/);
  });

  it("rejects any rolling validation window that reaches the sealed final holdout", () => {
    const dataset = manifest();
    const frozenProtocol = protocol(dataset);
    const unsafeWindow: CCFRollingBacktestWindow = {
      ...window(),
      index: 1,
      split: {
        train: window().split.train,
        validation: {
          start: { season: 2024, week: 4 },
          end: { season: 2024, week: 4 },
        },
      },
    };

    expect(() =>
      fingerprintCCFRollingTrainingSubset(dataset, unsafeWindow),
    ).toThrow(/sealed final-holdout rows/);
  });

  it("rejects training outcomes that became known after the evaluation decision", () => {
    const dataset = manifest();
    dataset.rows[1] = {
      ...dataset.rows[1],
      outcomeKnownAt: "2024-09-23T03:00:00Z",
    };
    const frozenProtocol = protocol(dataset);
    const model = artifact(dataset, frozenProtocol);

    expect(() =>
      buildCCFRollingReplayBinding({
        manifest: dataset,
        protocol: frozenProtocol,
        window: window(),
        artifact: model,
      }),
    ).toThrow(/training evidence is known after/);
  });
});
