import {
  buildCCFCandidateParameterArtifact,
  fingerprintCCFCandidateParameterArtifact,
} from "../candidateParameterArtifact";
import {
  buildCCFHistoricalDatasetFreezeReceipt,
} from "../historicalDatasetFreezeReceipt";
import {
  fingerprintCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "../historicalDatasetManifest";
import type { CCFPredictiveValidationProtocol } from "../predictiveValidationProtocol";
import type { CCFWeeklyNativeFeatureSet } from "../../features/weeklyFeatureEvidence";
import {
  CCF_BASE_PPR_RULES,
  fingerprintCCFLeagueScoringRules,
} from "../../scoring/scoringRules";
import { buildCCFRoleBaselineCandidate } from "../../outcomes/roleBaselineCandidate";
import {
  loadCCFRoleBaselineParametersFromCandidateArtifact,
} from "../../outcomes/roleBaselineParameterLoader";

function manifest(
  scoringProfileFingerprint = "scoring-v1",
): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "parameter-training-history-v1",
    schemaVersion: "player-game-decision-v1",
    frozenAt: "2026-09-17T22:00:00Z",
    sourcePlanFingerprint: "source-plan-v1",
    scoringProfileFingerprint,
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
    protocolId: "role-baseline-validation-v1",
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
      deterministicSeed: "role-baseline-validation-v1",
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

function frozenPair(
  scoringProfileFingerprint = "scoring-v1",
) {
  const dataset = manifest(scoringProfileFingerprint);
  const frozenProtocol = protocol(dataset);
  const freezeReceipt = buildCCFHistoricalDatasetFreezeReceipt({
    manifest: dataset,
    protocol: frozenProtocol,
    verifiedAt: "2026-09-17T22:10:00Z",
  });
  return { dataset, frozenProtocol, freezeReceipt };
}

describe("candidate parameter artifact", () => {
  it("binds exact parameter bytes to the frozen dataset/protocol before validation", () => {
    const { frozenProtocol, freezeReceipt } = frozenPair();
    const artifact = buildCCFCandidateParameterArtifact({
      freezeReceipt,
      protocol: frozenProtocol,
      modelFamily: "role_opportunity_baseline",
      parameterRef: "ccf://parameters/role-baseline/v1",
      parameterContent: JSON.stringify({ intercept: 2, targets: 1 }),
      trainingRunId: "train-role-baseline-001",
      trainingStartedAt: "2026-09-17T22:11:00Z",
      trainingCompletedAt: "2026-09-17T22:20:00Z",
      frozenAt: "2026-09-17T22:21:00Z",
      trainingCodeFingerprint: "training-code-sha256",
      hyperparameterFingerprint: "hyperparameters-sha256",
      evidenceRefs: ["ccf://training-log/train-role-baseline-001"],
    });

    expect(artifact).toMatchObject({
      modelVersion: "ccf-player-outcome-v0-role-baseline-candidate",
      modelFamily: "role_opportunity_baseline",
      datasetFingerprint: freezeReceipt.datasetFingerprint,
      protocolId: frozenProtocol.protocolId,
      finalHoldoutAccessCountDuringTraining: 0,
      challengerEvidenceUsedForFit: false,
      productionCertificationAuthorized: false,
    });
    expect(artifact.parameterContentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.artifactId).toMatch(
      /^ccf:\/\/candidate-parameter-artifact\/sha256\/[a-f0-9]{64}$/,
    );
    expect(fingerprintCCFCandidateParameterArtifact(artifact)).toHaveLength(64);
    expect(artifact.evidenceRefs).toEqual(expect.arrayContaining([
      freezeReceipt.receiptId,
      "ccf://parameters/role-baseline/v1",
      "ccf://training-log/train-role-baseline-001",
    ]));
  });

  it("refuses training that begins before the frozen dataset/protocol handoff", () => {
    const { frozenProtocol, freezeReceipt } = frozenPair();
    expect(() =>
      buildCCFCandidateParameterArtifact({
        freezeReceipt,
        protocol: frozenProtocol,
        modelFamily: "role_opportunity_baseline",
        parameterRef: "ccf://parameters/role-baseline/v1",
        parameterContent: "{}",
        trainingRunId: "too-early",
        trainingStartedAt: "2026-09-17T22:04:00Z",
        trainingCompletedAt: "2026-09-17T22:20:00Z",
        frozenAt: "2026-09-17T22:21:00Z",
        trainingCodeFingerprint: "training-code-sha256",
        hyperparameterFingerprint: "hyperparameters-sha256",
      }),
    ).toThrow(/training cannot start before/);
  });

  it("requires the dataset freeze receipt to be bound to the exact predictive protocol", () => {
    const dataset = manifest();
    const frozenProtocol = protocol(dataset);
    const unboundReceipt = buildCCFHistoricalDatasetFreezeReceipt({
      manifest: dataset,
      verifiedAt: "2026-09-17T22:10:00Z",
    });

    expect(() =>
      buildCCFCandidateParameterArtifact({
        freezeReceipt: unboundReceipt,
        protocol: frozenProtocol,
        modelFamily: "role_opportunity_baseline",
        parameterRef: "ccf://parameters/role-baseline/v1",
        parameterContent: "{}",
        trainingRunId: "unbound",
        trainingStartedAt: "2026-09-17T22:11:00Z",
        trainingCompletedAt: "2026-09-17T22:20:00Z",
        frozenAt: "2026-09-17T22:21:00Z",
        trainingCodeFingerprint: "training-code-sha256",
        hyperparameterFingerprint: "hyperparameters-sha256",
      }),
    ).toThrow(/requires a dataset freeze receipt bound to a predictive protocol/);
  });

  it("detects mutation after the candidate artifact is frozen", () => {
    const { frozenProtocol, freezeReceipt } = frozenPair();
    const artifact = buildCCFCandidateParameterArtifact({
      freezeReceipt,
      protocol: frozenProtocol,
      modelFamily: "role_opportunity_baseline",
      parameterRef: "ccf://parameters/role-baseline/v1",
      parameterContent: "{}",
      trainingRunId: "train-role-baseline-002",
      trainingStartedAt: "2026-09-17T22:11:00Z",
      trainingCompletedAt: "2026-09-17T22:20:00Z",
      frozenAt: "2026-09-17T22:21:00Z",
      trainingCodeFingerprint: "training-code-sha256",
      hyperparameterFingerprint: "hyperparameters-sha256",
    });
    artifact.trainingCodeFingerprint = "mutated-code";

    expect(() => fingerprintCCFCandidateParameterArtifact(artifact)).toThrow(
      /artifactId does not match artifact contents/,
    );
  });
});


const ROLE_TARGETS = "opportunity.targets_per_recorded_game";
const ROLE_CARRIES = "opportunity.carries_per_recorded_game";
const ROLE_TARGET_SHARE = "opportunity.mean_target_share";

function roleParameterContent(
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    contractVersion: "ccf-role-baseline-parameter-payload-v1",
    position: "WR",
    featureContractRef: "ccf://rolling-opportunity-feature-receipt-v1",
    featureKeys: [ROLE_TARGETS, ROLE_CARRIES, ROLE_TARGET_SHARE],
    meanIntercept: 2,
    meanWeights: {
      [ROLE_TARGETS]: 1,
      [ROLE_CARRIES]: 0.5,
      [ROLE_TARGET_SHARE]: 4,
    },
    volatilityIntercept: 3,
    volatilityWeights: {
      [ROLE_TARGETS]: 0,
      [ROLE_CARRIES]: 0,
      [ROLE_TARGET_SHARE]: 0,
    },
    minimumVolatility: 2,
    thresholds: {
      zeroOrNearZeroFpts: 2,
      bustFpts: 7,
      boomFpts: 18,
    },
    parameterConfidence: 0.7,
    ...extra,
  });
}

function roleFeatureSet(
  sourceRefs: string[] = ["ccf://rolling-opportunity/targets"],
): CCFWeeklyNativeFeatureSet {
  return {
    playerId: "ccf-player-1",
    position: "WR",
    season: 2026,
    week: 3,
    asOf: "2026-09-20T12:00:00Z",
    features: {
      [ROLE_TARGETS]: {
        key: ROLE_TARGETS,
        status: "available",
        value: 7,
        unit: "per_recorded_game",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-19T12:00:00Z",
        sourceRefs,
      },
      [ROLE_CARRIES]: {
        key: ROLE_CARRIES,
        status: "available",
        value: 2,
        unit: "per_recorded_game",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-19T12:00:00Z",
        sourceRefs: ["ccf://rolling-opportunity/carries"],
      },
      [ROLE_TARGET_SHARE]: {
        key: ROLE_TARGET_SHARE,
        status: "available",
        value: 0.25,
        unit: "share",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-19T12:00:00Z",
        sourceRefs: ["ccf://rolling-opportunity/target-share"],
      },
    },
  };
}

describe("role baseline parameter loader convergence", () => {
  function roleArtifact(
    parameterContent = roleParameterContent(),
    modelFamily = "role_opportunity_baseline",
  ) {
    const scoringFingerprint =
      fingerprintCCFLeagueScoringRules(CCF_BASE_PPR_RULES);
    const { frozenProtocol, freezeReceipt } = frozenPair(scoringFingerprint);
    const artifact = buildCCFCandidateParameterArtifact({
      freezeReceipt,
      protocol: frozenProtocol,
      modelFamily,
      parameterRef: "ccf://parameters/role-baseline/exact-v1",
      parameterContent,
      trainingRunId: "train-role-baseline-loader-001",
      trainingStartedAt: "2026-09-17T22:11:00Z",
      trainingCompletedAt: "2026-09-17T22:20:00Z",
      frozenAt: "2026-09-17T22:21:00Z",
      trainingCodeFingerprint: "role-loader-training-code-sha256",
      hyperparameterFingerprint: "role-loader-hyperparameters-sha256",
      evidenceRefs: ["ccf://training-log/train-role-baseline-loader-001"],
    });
    return { artifact, frozenProtocol, freezeReceipt };
  }

  it("verifies exact frozen bytes and runs the candidate through one governed model path", () => {
    const parameterContent = roleParameterContent();
    const { artifact, frozenProtocol, freezeReceipt } =
      roleArtifact(parameterContent);
    const loaded =
      loadCCFRoleBaselineParametersFromCandidateArtifact({
        artifact,
        parameterContent,
        freezeReceipt,
        protocol: frozenProtocol,
      });

    expect(loaded).toMatchObject({
      candidateOnly: true,
      artifactId: artifact.artifactId,
      parameterContentSha256: artifact.parameterContentSha256,
    });
    expect(loaded.parameters).toMatchObject({
      modelVersion: artifact.modelVersion,
      frozenAt: artifact.frozenAt,
      parameterArtifactRef: artifact.artifactId,
      trainingDatasetFingerprint: artifact.datasetFingerprint,
      scoringProfileFingerprint: artifact.scoringProfileFingerprint,
      certificationState: "uncertified_candidate",
    });

    const candidate = buildCCFRoleBaselineCandidate({
      featureSet: roleFeatureSet(),
      scoringFormat: "PPR",
      scoringRules: CCF_BASE_PPR_RULES,
      parameters: loaded.parameters,
    });

    expect(candidate.candidateOnly).toBe(true);
    expect(candidate.parameterArtifactRef).toBe(artifact.artifactId);
    expect(candidate.outcome).toMatchObject({
      playerId: "ccf-player-1",
      position: "WR",
      medianFpts: 11,
      volatility: 3,
      confidence: 0.7,
      coverage: 1,
      abstain: false,
      modelVersion: artifact.modelVersion,
      mode: "CCF_NATIVE",
    });
  });

  it("rejects mutated parameter bytes before JSON is trusted", () => {
    const parameterContent = roleParameterContent();
    const { artifact, frozenProtocol, freezeReceipt } =
      roleArtifact(parameterContent);

    expect(() =>
      loadCCFRoleBaselineParametersFromCandidateArtifact({
        artifact,
        parameterContent: parameterContent + " ",
        freezeReceipt,
        protocol: frozenProtocol,
      }),
    ).toThrow(/parameter bytes do not match the frozen candidate artifact/);
  });

  it("rejects payloads that try to inject governance identity", () => {
    const parameterContent = roleParameterContent({
      scoringProfileFingerprint: "attacker-controlled",
    });
    const { artifact, frozenProtocol, freezeReceipt } =
      roleArtifact(parameterContent);

    expect(() =>
      loadCCFRoleBaselineParametersFromCandidateArtifact({
        artifact,
        parameterContent,
        freezeReceipt,
        protocol: frozenProtocol,
      }),
    ).toThrow(/payload keys do not match the frozen payload schema/);
  });

  it("rejects a governed artifact from the wrong model family", () => {
    const parameterContent = roleParameterContent();
    const { artifact, frozenProtocol, freezeReceipt } =
      roleArtifact(parameterContent, "some_other_model");

    expect(() =>
      loadCCFRoleBaselineParametersFromCandidateArtifact({
        artifact,
        parameterContent,
        freezeReceipt,
        protocol: frozenProtocol,
      }),
    ).toThrow(/is not role_opportunity_baseline/);
  });

  it("rejects a parameter artifact loaded against a different frozen protocol context", () => {
    const parameterContent = roleParameterContent();
    const { artifact } = roleArtifact(parameterContent);
    const unrelated = frozenPair("some-other-scoring-fingerprint");

    expect(() =>
      loadCCFRoleBaselineParametersFromCandidateArtifact({
        artifact,
        parameterContent,
        freezeReceipt: unrelated.freezeReceipt,
        protocol: unrelated.frozenProtocol,
      }),
    ).toThrow(/does not match the supplied historical dataset freeze receipt|does not match the supplied predictive validation protocol/);
  });

  it("rejects duplicate feature evidence refs at candidate execution", () => {
    const parameterContent = roleParameterContent();
    const { artifact, frozenProtocol, freezeReceipt } =
      roleArtifact(parameterContent);
    const loaded =
      loadCCFRoleBaselineParametersFromCandidateArtifact({
        artifact,
        parameterContent,
        freezeReceipt,
        protocol: frozenProtocol,
      });

    expect(() =>
      buildCCFRoleBaselineCandidate({
        featureSet: roleFeatureSet([
          "ccf://rolling-opportunity/targets",
          "ccf://rolling-opportunity/targets",
        ]),
        scoringFormat: "PPR",
        scoringRules: CCF_BASE_PPR_RULES,
        parameters: loaded.parameters,
      }),
    ).toThrow(/unique non-empty source references/);
  });
});
