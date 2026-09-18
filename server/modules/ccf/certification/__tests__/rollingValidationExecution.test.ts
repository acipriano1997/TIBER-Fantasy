import {
  executeCCFRollingValidation,
  fingerprintCCFHistoricalOutcomeWitness,
  fingerprintCCFWeeklyNativeFeatureSnapshot,
  type CCFHistoricalOutcomeWitnessV1,
} from "../rollingValidationExecution";
import {
  fingerprintCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "../historicalDatasetManifest";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import {
  fingerprintCCFRollingTrainingSubset,
} from "../rollingReplayBinding";
import type { CCFRollingBacktestWindow } from "../rollingBacktest";
import type { CCFWeeklyNativeFeatureSet } from "../../features/weeklyFeatureEvidence";
import type { CCFPlayerOutcomeModelArtifactV0 } from "../../outcomes/playerOutcomeEngineV0";

const KEY = "opportunity.targets";

function validationFeatureSet(value = 8): CCFWeeklyNativeFeatureSet {
  return {
    playerId: "p1",
    position: "RB",
    season: 2024,
    week: 3,
    asOf: "2024-09-22T16:00:00Z",
    features: {
      [KEY]: {
        key: KEY,
        status: "available",
        value,
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2024-09-22T15:00:00Z",
        sourceRefs: ["ccf://source/validation-w3"],
      },
    },
  };
}

function validationWitness(points = 12): CCFHistoricalOutcomeWitnessV1 {
  return {
    contractVersion: "ccf-historical-outcome-witness-v1",
    rowId: "validation-w3",
    canonicalPlayerId: "p1",
    gameId: "g3",
    season: 2024,
    week: 3,
    outcomeKnownAt: "2024-09-23T03:00:00Z",
    actualFantasyPoints: points,
  };
}

function sealedWitness(): CCFHistoricalOutcomeWitnessV1 {
  return {
    contractVersion: "ccf-historical-outcome-witness-v1",
    rowId: "sealed-w4",
    canonicalPlayerId: "p1",
    gameId: "g4",
    season: 2024,
    week: 4,
    outcomeKnownAt: "2024-09-30T03:00:00Z",
    actualFantasyPoints: 20,
  };
}

function manifest(): CCFHistoricalDatasetManifest {
  const features = validationFeatureSet();
  const witness = validationWitness();
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "rolling-execution-history-v1",
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
        featureSnapshotFingerprint: "train-f1",
        sourceSnapshotRefs: ["source://w1"],
        outcomeArtifactFingerprint: "train-o1",
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
        featureSnapshotFingerprint: "train-f2",
        sourceSnapshotRefs: ["source://w2"],
        outcomeArtifactFingerprint: "train-o2",
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
        decisionAsOf: features.asOf,
        maxFeatureKnownAt: "2024-09-22T15:00:00Z",
        featureSnapshotFingerprint:
          fingerprintCCFWeeklyNativeFeatureSnapshot(features),
        sourceSnapshotRefs: ["source://w3"],
        outcomeArtifactFingerprint:
          fingerprintCCFHistoricalOutcomeWitness(witness),
        outcomeKnownAt: witness.outcomeKnownAt,
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
        featureSnapshotFingerprint: "sealed-f4",
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
    protocolId: "rolling-execution-protocol-v1",
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
      deterministicSeed: "rolling-execution",
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
): CCFPlayerOutcomeModelArtifactV0 {
  const trainingFingerprint = fingerprintCCFRollingTrainingSubset(
    dataset,
    window(),
  );
  const head = (intercept: number, coefficient: number) => ({
    intercept,
    coefficients: { [KEY]: coefficient },
  });
  return {
    contractVersion: "ccf-player-outcome-model-artifact-v0",
    modelVersion: frozenProtocol.modelVersion,
    position: "RB",
    scoringFormat: "CUSTOM",
    scoringFingerprint: dataset.scoringProfileFingerprint,
    featureKeys: [KEY],
    criticalFeatureKeys: [KEY],
    coverageRequirements: [{ key: KEY, weight: 1 }],
    featureFamilies: { [KEY]: "role" },
    heads: {
      meanFpts: head(0.5, 1),
      medianFpts: head(0, 1),
      p10Fpts: head(-3, 1),
      p25Fpts: head(-1, 1),
      p75Fpts: head(1, 1),
      p90Fpts: head(3, 1),
      logVolatility: head(Math.log(2), 0),
      zeroOrNearZeroProbabilityLogit: head(-2, 0),
      boomProbabilityLogit: head(-1, 0),
      bustProbabilityLogit: head(0, 0),
      confidenceLogit: head(1, 0),
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
    validationProtocolRef:
      "ccf://predictive-validation/rolling-execution-protocol-v1",
    notes: ["synthetic rolling validation execution artifact"],
  };
}

function executionInput() {
  const dataset = manifest();
  const frozenProtocol = protocol(dataset);
  return {
    manifest: dataset,
    protocol: frozenProtocol,
    window: window(),
    artifact: artifact(dataset, frozenProtocol),
    scoringFormat: "CUSTOM" as const,
    scoringFingerprint: dataset.scoringProfileFingerprint,
    pointEstimate: "mean_fpts" as const,
    featurePackets: [
      {
        contractVersion: "ccf-historical-feature-packet-v1" as const,
        rowId: "validation-w3",
        featureSet: validationFeatureSet(),
      },
    ],
    outcomeWitnesses: [validationWitness()],
  };
}

describe("CCF rolling validation execution", () => {
  it("executes the real outcome kernel from manifest-bound historical packets without opening holdout", () => {
    const result = executeCCFRollingValidation(executionInput());

    expect(result).toMatchObject({
      pointEstimate: "mean_fpts",
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0]).toMatchObject({
      rowId: "validation-w3",
      blockId: "2024-W3",
      actualFantasyPoints: 12,
      predictedFantasyPoints: 8.5,
      pointEstimate: "mean_fpts",
      abstained: false,
      outcome: {
        meanFpts: 8.5,
        medianFpts: 8,
        mode: "CCF_NATIVE",
        asOf: "2024-09-22T16:00:00Z",
      },
    });
  });

  it("fails closed if historical feature bytes/values do not match the frozen manifest fingerprint", () => {
    const input = executionInput();
    input.featurePackets[0] = {
      ...input.featurePackets[0],
      featureSet: validationFeatureSet(9),
    };
    expect(() => executeCCFRollingValidation(input)).toThrow(
      /feature packet validation-w3 fingerprint does not match/,
    );
  });

  it("fails closed if the realized outcome witness is mutated after freeze", () => {
    const input = executionInput();
    input.outcomeWitnesses[0] = validationWitness(13);
    expect(() => executeCCFRollingValidation(input)).toThrow(
      /outcome witness validation-w3 fingerprint does not match/,
    );
  });

  it("refuses any extra realized-outcome witness from the sealed final holdout", () => {
    const input = executionInput();
    input.outcomeWitnesses.push(sealedWitness());
    expect(() => executeCCFRollingValidation(input)).toThrow(
      /would open the sealed final holdout/,
    );
  });

  it("requires the certification point estimate to be explicit and preserves median when selected", () => {
    const input = {
      ...executionInput(),
      pointEstimate: "median_fpts" as const,
    };
    const result = executeCCFRollingValidation(input);
    expect(result.predictions[0].predictedFantasyPoints).toBe(8);
    expect(result.predictions[0].pointEstimate).toBe("median_fpts");
  });
});
