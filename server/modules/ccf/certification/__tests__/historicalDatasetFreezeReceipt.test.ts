import {
  buildCCFHistoricalDatasetFreezeReceipt,
  fingerprintCCFHistoricalDatasetFreezeReceipt,
} from "../historicalDatasetFreezeReceipt";
import {
  fingerprintCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "../historicalDatasetManifest";
import type { CCFPredictiveValidationProtocol } from "../predictiveValidationProtocol";

function manifest(): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "production-history-v1",
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
    protocolId: "weekly-native-v1",
    frozenAt: "2026-09-17T22:05:00Z",
    modelVersion: "ccf-native-v1",
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
    featureFamilies: ["usage"],
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
      deterministicSeed: "weekly-native-v1",
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

describe("historical dataset freeze receipt", () => {
  it("mints a non-authoritative handoff only from an exact frozen dataset/protocol pair", () => {
    const dataset = manifest();
    const receipt = buildCCFHistoricalDatasetFreezeReceipt({
      manifest: dataset,
      protocol: protocol(dataset),
      verifiedAt: "2026-09-17T22:10:00Z",
    });

    expect(receipt).toMatchObject({
      datasetId: "production-history-v1",
      candidateRowCount: 3,
      admittedRowCount: 3,
      excludedRowCount: 0,
      finalHoldoutOutcomesSealed: true,
      finalHoldoutAccessCountAtFreeze: 0,
      outcomeValuesEmbeddedInManifest: false,
      productionCertificationAuthorized: false,
    });
    expect(receipt.protocolBinding).toMatchObject({
      protocolId: "weekly-native-v1",
      testRows: 1,
      testIndependentTimeBlocks: 1,
    });
    expect(receipt.receiptId).toMatch(
      /^ccf-historical-dataset-freeze:[a-f0-9]{64}$/,
    );
    expect(fingerprintCCFHistoricalDatasetFreezeReceipt(receipt)).toHaveLength(64);
  });

  it("refuses a mismatched frozen protocol", () => {
    const dataset = manifest();
    const candidate = protocol(dataset);
    candidate.sourcePlanFingerprint = "different-source-plan";

    expect(() =>
      buildCCFHistoricalDatasetFreezeReceipt({
        manifest: dataset,
        protocol: candidate,
        verifiedAt: "2026-09-17T22:10:00Z",
      }),
    ).toThrow(/historical dataset\/protocol binding blocked/);
  });

  it("refuses verification before the manifest freeze", () => {
    expect(() =>
      buildCCFHistoricalDatasetFreezeReceipt({
        manifest: manifest(),
        verifiedAt: "2026-09-17T21:59:59Z",
      }),
    ).toThrow(/verifiedAt cannot precede the historical dataset freeze/);
  });

  it("detects receipt mutation", () => {
    const receipt = buildCCFHistoricalDatasetFreezeReceipt({
      manifest: manifest(),
      verifiedAt: "2026-09-17T22:10:00Z",
    });
    receipt.admittedRowCount = 2;

    expect(() => fingerprintCCFHistoricalDatasetFreezeReceipt(receipt)).toThrow(
      /receiptId does not match receipt contents/,
    );
  });
});
