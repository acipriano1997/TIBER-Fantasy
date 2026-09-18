import type { CCFHistoricalDatasetManifest } from "../../modules/ccf/certification/historicalDatasetManifest";
import { runCCFHistoricalDatasetFreezeVerification } from "../ccfVerifyHistoricalDatasetFreeze";

function manifest(): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "history-v1",
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

describe("CCF historical dataset freeze verification command", () => {
  it("emits a non-authoritative verified receipt for a valid frozen manifest", () => {
    const outcome = runCCFHistoricalDatasetFreezeVerification({
      manifest: manifest(),
      now: () => "2026-09-17T22:10:00Z",
    });

    expect(outcome.exitCode).toBe(0);
    expect(outcome.output).toMatchObject({
      receipt_kind: "ccf_historical_dataset_freeze_verification_v1",
      ok: true,
      productionCertificationAuthorized: false,
      receipt: {
        datasetId: "history-v1",
        finalHoldoutAccessCountAtFreeze: 0,
        productionCertificationAuthorized: false,
      },
    });
  });

  it("fails closed without emitting certification authority for an invalid manifest", () => {
    const invalid = manifest();
    invalid.outcomeValuesEmbeddedInManifest = true as false;

    const outcome = runCCFHistoricalDatasetFreezeVerification({
      manifest: invalid,
      now: () => "2026-09-17T22:10:00Z",
    });

    expect(outcome.exitCode).toBe(1);
    expect(outcome.output).toMatchObject({
      receipt_kind: "ccf_historical_dataset_freeze_verification_v1",
      ok: false,
      productionCertificationAuthorized: false,
    });
  });
});
