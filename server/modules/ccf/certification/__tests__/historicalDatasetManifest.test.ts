import {
  auditCCFHistoricalDatasetManifest,
  fingerprintCCFHistoricalDatasetManifest,
  validateCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetRowDescriptor,
} from "../historicalDatasetManifest";

function row(
  overrides: Partial<CCFHistoricalDatasetRowDescriptor> = {},
): CCFHistoricalDatasetRowDescriptor {
  return {
    rowId: "row-train",
    canonicalPlayerId: "player-1",
    gameId: "game-2023-1",
    season: 2023,
    week: 1,
    decisionAsOf: "2023-09-10T16:00:00Z",
    maxFeatureKnownAt: "2023-09-10T15:59:00Z",
    featureSnapshotFingerprint: "feature-row-train",
    sourceSnapshotRefs: ["archive://weekly/2023/1/player-1"],
    outcomeArtifactFingerprint: "outcome-row-train",
    outcomeKnownAt: "2023-09-11T03:00:00Z",
    split: "train",
    outcomeAccess: "available_for_training",
    ...overrides,
  };
}

function manifest(): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "ccf-weekly-history-v1",
    schemaVersion: "player-game-decision-v1",
    frozenAt: "2026-09-15T18:00:00Z",
    sourcePlanFingerprint: "source-plan-sha256",
    scoringProfileFingerprint: "scoring-sha256",
    featureSetFingerprint: "features-sha256",
    decisionPolicyFingerprint: "decision-policy-sha256",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
    split: {
      train: {
        start: { season: 2023, week: 1 },
        end: { season: 2023, week: 18 },
      },
      validation: {
        start: { season: 2024, week: 1 },
        end: { season: 2024, week: 18 },
      },
      test: {
        start: { season: 2025, week: 1 },
        end: { season: 2025, week: 18 },
      },
    },
    candidateRowCount: 4,
    exclusions: [{ reason: "missing_authoritative_decision_snapshot", count: 1 }],
    rows: [
      row(),
      row({
        rowId: "row-validation",
        canonicalPlayerId: "player-2",
        gameId: "game-2024-1",
        season: 2024,
        week: 1,
        decisionAsOf: "2024-09-08T16:00:00Z",
        maxFeatureKnownAt: "2024-09-08T15:58:00Z",
        featureSnapshotFingerprint: "feature-row-validation",
        sourceSnapshotRefs: ["archive://weekly/2024/1/player-2"],
        outcomeArtifactFingerprint: "outcome-row-validation",
        outcomeKnownAt: "2024-09-09T03:00:00Z",
        split: "validation",
        outcomeAccess: "available_for_validation",
      }),
      row({
        rowId: "row-test",
        canonicalPlayerId: "player-3",
        gameId: "game-2025-1",
        season: 2025,
        week: 1,
        decisionAsOf: "2025-09-07T16:00:00Z",
        maxFeatureKnownAt: "2025-09-07T15:57:00Z",
        featureSnapshotFingerprint: "feature-row-test",
        sourceSnapshotRefs: ["archive://weekly/2025/1/player-3"],
        outcomeArtifactFingerprint: "sealed-outcome-row-test",
        outcomeKnownAt: "2025-09-08T03:00:00Z",
        split: "test",
        outcomeAccess: "sealed_final_holdout",
      }),
    ],
    finalHoldoutOutcomesSealed: true,
    finalHoldoutAccessCountAtFreeze: 0,
    outcomeValuesEmbeddedInManifest: false,
    notes: [],
  };
}

describe("CCF historical predictive dataset manifest", () => {
  it("accepts a fully frozen train/validation/sealed-test dataset boundary", () => {
    const candidate = manifest();
    expect(validateCCFHistoricalDatasetManifest(candidate)).toBe(candidate);
    const audit = auditCCFHistoricalDatasetManifest(candidate);
    expect(audit.valid).toBe(true);
    expect(audit.candidateRowCount).toBe(4);
    expect(audit.admittedRowCount).toBe(3);
    expect(audit.excludedRowCount).toBe(1);
    expect(audit.uniquePlayers).toBe(3);
    expect(audit.uniqueGames).toBe(3);
    expect(audit.uniqueDecisions).toBe(3);
    expect(audit.splitCounts).toEqual({ train: 1, validation: 1, test: 1 });
    expect(audit.independentSeasonWeeks).toBe(3);
    expect(audit.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects feature evidence learned after the historical decision", () => {
    const candidate = manifest();
    candidate.rows[0] = {
      ...candidate.rows[0],
      maxFeatureKnownAt: "2023-09-10T16:00:01Z",
    };
    expect(() => validateCCFHistoricalDatasetManifest(candidate)).toThrow(
      /feature evidence known after decisionAsOf/,
    );
  });

  it("requires the outcome to become known after the decision", () => {
    const candidate = manifest();
    candidate.rows[0] = {
      ...candidate.rows[0],
      outcomeKnownAt: candidate.rows[0].decisionAsOf,
    };
    expect(() => validateCCFHistoricalDatasetManifest(candidate)).toThrow(
      /outcome must become known strictly after decisionAsOf/,
    );
  });

  it("keeps final-test outcomes sealed and unavailable to training or validation", () => {
    const candidate = manifest();
    candidate.rows[2] = {
      ...candidate.rows[2],
      outcomeAccess: "available_for_validation",
    };
    expect(() => validateCCFHistoricalDatasetManifest(candidate)).toThrow(
      /outcomeAccess does not match test split policy/,
    );

    expect(() => validateCCFHistoricalDatasetManifest({
      ...manifest(),
      finalHoldoutAccessCountAtFreeze: 1 as 0,
    })).toThrow(/finalHoldoutAccessCountAtFreeze must be zero/);
  });

  it("rejects row split labels that do not match frozen chronological windows", () => {
    const candidate = manifest();
    candidate.rows[1] = {
      ...candidate.rows[1],
      split: "train",
      outcomeAccess: "available_for_training",
    };
    expect(() => validateCCFHistoricalDatasetManifest(candidate)).toThrow(
      /split does not match frozen chronological windows/,
    );
  });

  it("requires every candidate row to be admitted or explicitly accounted for as an exclusion", () => {
    expect(() => validateCCFHistoricalDatasetManifest({
      ...manifest(),
      candidateRowCount: 5,
    })).toThrow(/candidateRowCount must equal admitted rows plus explicitly counted exclusions/);

    expect(() => validateCCFHistoricalDatasetManifest({
      ...manifest(),
      exclusions: [
        { reason: "missing_source", count: 1 },
        { reason: "missing_source", count: 1 },
      ],
      candidateRowCount: 5,
    })).toThrow(/duplicate exclusion reason/);
  });

  it("rejects duplicate row identity and player/game/decision rows", () => {
    const duplicateRowId = manifest();
    duplicateRowId.rows[1] = { ...duplicateRowId.rows[1], rowId: duplicateRowId.rows[0].rowId };
    expect(() => validateCCFHistoricalDatasetManifest(duplicateRowId)).toThrow(/duplicate rowId/);

    const duplicateDecision = manifest();
    duplicateDecision.rows[1] = {
      ...duplicateDecision.rows[1],
      canonicalPlayerId: duplicateDecision.rows[0].canonicalPlayerId,
      gameId: duplicateDecision.rows[0].gameId,
      decisionAsOf: duplicateDecision.rows[0].decisionAsOf,
      maxFeatureKnownAt: duplicateDecision.rows[0].maxFeatureKnownAt,
      season: duplicateDecision.rows[0].season,
      week: duplicateDecision.rows[0].week,
      split: "train",
      outcomeAccess: "available_for_training",
    };
    expect(() => validateCCFHistoricalDatasetManifest(duplicateDecision)).toThrow(
      /duplicates an existing player\/game\/decision row/,
    );
  });

  it("rejects missing or duplicated raw source snapshot references", () => {
    const missing = manifest();
    missing.rows[0] = { ...missing.rows[0], sourceSnapshotRefs: [] };
    expect(() => validateCCFHistoricalDatasetManifest(missing)).toThrow(/requires sourceSnapshotRefs/);

    const duplicate = manifest();
    duplicate.rows[0] = {
      ...duplicate.rows[0],
      sourceSnapshotRefs: ["archive://one", "archive://one"],
    };
    expect(() => validateCCFHistoricalDatasetManifest(duplicate)).toThrow(
      /sourceSnapshotRefs must be unique non-empty references/,
    );
  });

  it("fingerprints equivalent ordering deterministically but changes on evidence changes", () => {
    const first = manifest();
    const reordered: CCFHistoricalDatasetManifest = {
      ...first,
      rows: [...first.rows].reverse(),
      exclusions: [...first.exclusions].reverse(),
      notes: ["second", "first"],
    };
    const comparison = { ...first, notes: ["first", "second"] };
    expect(fingerprintCCFHistoricalDatasetManifest(reordered)).toBe(
      fingerprintCCFHistoricalDatasetManifest(comparison),
    );

    const changed = manifest();
    changed.rows[0] = {
      ...changed.rows[0],
      featureSnapshotFingerprint: "different-feature-evidence",
    };
    expect(fingerprintCCFHistoricalDatasetManifest(changed)).not.toBe(
      fingerprintCCFHistoricalDatasetManifest(first),
    );
  });
});
