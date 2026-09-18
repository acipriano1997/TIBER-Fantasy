import {
  buildCCFCandidateParameterArtifact,
} from "../candidateParameterArtifact";
import {
  verifyCCFCandidateParameterPayload,
} from "../candidateParameterPayload";
import {
  buildCCFHistoricalDatasetFreezeReceipt,
} from "../historicalDatasetFreezeReceipt";
import {
  fingerprintCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "../historicalDatasetManifest";
import type { CCFPredictiveValidationProtocol } from "../predictiveValidationProtocol";

function manifest(): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "payload-verifier-history-v1",
    schemaVersion: "player-game-decision-v1",
    frozenAt: "2026-09-17T22:00:00Z",
    sourcePlanFingerprint: "source-plan-v1",
    scoringProfileFingerprint: "scoring-v1",
    featureSetFingerprint: "features-v1",
    decisionPolicyFingerprint: "decision-policy-v1",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
    split: {
      train: { start: { season: 2023, week: 1 }, end: { season: 2023, week: 18 } },
      validation: { start: { season: 2024, week: 1 }, end: { season: 2024, week: 18 } },
      test: { start: { season: 2025, week: 1 }, end: { season: 2025, week: 18 } },
    },
    candidateRowCount: 3,
    exclusions: [],
    rows: [
      {
        rowId: "train-row",
        canonicalPlayerId: "p1",
        gameId: "g1",
        season: 2023,
        week: 1,
        decisionAsOf: "2023-09-10T16:00:00Z",
        maxFeatureKnownAt: "2023-09-10T15:59:00Z",
        featureSnapshotFingerprint: "f1",
        sourceSnapshotRefs: ["source://train"],
        outcomeArtifactFingerprint: "o1",
        outcomeKnownAt: "2023-09-11T03:00:00Z",
        split: "train",
        outcomeAccess: "available_for_training",
      },
      {
        rowId: "validation-row",
        canonicalPlayerId: "p2",
        gameId: "g2",
        season: 2024,
        week: 1,
        decisionAsOf: "2024-09-08T16:00:00Z",
        maxFeatureKnownAt: "2024-09-08T15:59:00Z",
        featureSnapshotFingerprint: "f2",
        sourceSnapshotRefs: ["source://validation"],
        outcomeArtifactFingerprint: "o2",
        outcomeKnownAt: "2024-09-09T03:00:00Z",
        split: "validation",
        outcomeAccess: "available_for_validation",
      },
      {
        rowId: "test-row",
        canonicalPlayerId: "p3",
        gameId: "g3",
        season: 2025,
        week: 1,
        decisionAsOf: "2025-09-07T16:00:00Z",
        maxFeatureKnownAt: "2025-09-07T15:59:00Z",
        featureSnapshotFingerprint: "f3",
        sourceSnapshotRefs: ["source://test"],
        outcomeArtifactFingerprint: "sealed-o3",
        outcomeKnownAt: "2025-09-08T03:00:00Z",
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
    protocolId: "payload-verifier-protocol-v1",
    frozenAt: "2026-09-17T22:05:00Z",
    modelVersion: "ccf-player-outcome-v0-role-baseline-candidate",
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
    featureFamilies: ["role_opportunity"],
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
      deterministicSeed: "payload-verifier-protocol-v1",
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

function artifact(parameterContent: string) {
  const dataset = manifest();
  const frozenProtocol = protocol(dataset);
  const freezeReceipt = buildCCFHistoricalDatasetFreezeReceipt({
    manifest: dataset,
    protocol: frozenProtocol,
    verifiedAt: "2026-09-17T22:10:00Z",
  });
  return buildCCFCandidateParameterArtifact({
    freezeReceipt,
    protocol: frozenProtocol,
    modelFamily: "role_opportunity_baseline",
    parameterRef: "ccf://parameters/role-baseline/payload-test",
    parameterContent,
    trainingRunId: "payload-verifier-training",
    trainingStartedAt: "2026-09-17T22:11:00Z",
    trainingCompletedAt: "2026-09-17T22:20:00Z",
    frozenAt: "2026-09-17T22:21:00Z",
    trainingCodeFingerprint: "training-code-sha256",
    hyperparameterFingerprint: "hyperparameters-sha256",
  });
}

describe("candidate parameter payload verifier", () => {
  it("returns the decoded object only when exact frozen JSON bytes match", () => {
    const bytes = '{"intercept":2,"targets":1}';
    const frozen = artifact(bytes);
    const verified = verifyCCFCandidateParameterPayload(frozen, bytes);

    expect(verified).toMatchObject({
      contractVersion: "ccf-verified-candidate-parameter-payload-v1",
      artifactId: frozen.artifactId,
      parameterRef: frozen.parameterRef,
      parameterContentSha256: frozen.parameterContentSha256,
      parsedPayload: { intercept: 2, targets: 1 },
    });
    expect(verified.artifactFingerprint).toHaveLength(64);
  });

  it("rejects semantically equivalent JSON when the exact bytes differ", () => {
    const frozen = artifact('{"intercept":2,"targets":1}');

    expect(() =>
      verifyCCFCandidateParameterPayload(
        frozen,
        '{ "intercept": 2, "targets": 1 }',
      ),
    ).toThrow(/bytes do not match the frozen artifact hash/);
  });

  it("rejects invalid JSON even when those invalid bytes are what the artifact froze", () => {
    const bytes = "not-json";
    const frozen = artifact(bytes);

    expect(() => verifyCCFCandidateParameterPayload(frozen, bytes)).toThrow(
      /not valid JSON/,
    );
  });

  it("requires a top-level JSON object rather than arrays or scalar payloads", () => {
    const bytes = "[1,2,3]";
    const frozen = artifact(bytes);

    expect(() => verifyCCFCandidateParameterPayload(frozen, bytes)).toThrow(
      /top-level object/,
    );
  });

  it("rejects a mutated artifact before accepting otherwise matching bytes", () => {
    const bytes = '{"intercept":2}';
    const frozen = artifact(bytes);
    frozen.trainingCodeFingerprint = "mutated-code";

    expect(() => verifyCCFCandidateParameterPayload(frozen, bytes)).toThrow(
      /artifactId does not match artifact contents/,
    );
  });
});
