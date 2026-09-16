import {
  CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
  type CCFPredictiveValidationReceipt,
} from "../../certification/predictiveValidationReceipt";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../../certification/predictiveValidationProtocol";
import {
  promoteCCFPredictiveReceiptToCertifiedRelease,
} from "../../certification/certifiedReleasePromotion";
import {
  EMPTY_CCF_BACKTEST_METRICS,
  type CCFBacktestProgressRecord,
} from "../../certification/backtestProgressHistory";
import {
  fingerprintCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "../../certification/historicalDatasetManifest";
import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  fingerprintCCFWeeklySourceSpinePlan,
  type CCFWeeklySourceSpinePlan,
} from "../../sources/weeklySourceSpine";
import type { CCFSourceState } from "../../sources/sourceState";
import type { CCFDevyIdentityLinkageReceipt } from "../../sources/devyIdentityLinkage";
import type {
  CCFAuthorityGraph,
  CCFTrustedAuthorityBinding,
} from "../authorityGraph";
import {
  assertCCFPersonalBetaReady,
  evaluateCCFPersonalBetaReadiness,
  type CCFPersonalBetaReadinessInput,
} from "../personalBetaReadiness";

const AS_OF = "2026-09-15T20:00:00Z";
const POPULATION = "QB/RB/WR/TE weekly fantasy decisions";
const SCORING = "scoring-profile-fixture";

function sourceState(): CCFSourceState {
  return {
    sourceId: "qualified-provider-fixture",
    evidenceClass: "source_backed",
    governanceState: "promoted",
    knownAt: "2026-09-15T10:00:00Z",
    supportWindow: {
      validFrom: "2026-09-01T00:00:00Z",
      validThrough: null,
    },
    staleAfter: "2026-09-16T00:00:00Z",
    producer: "fixture-provider",
    qualification: {
      qualificationVersion: "ccf-source-qualification-v1",
      qualificationId: "qualification-fixture",
      reviewedAt: "2026-09-10T00:00:00Z",
      termsOrLicenseRef: "terms://fixture",
      permissionStatus: "permitted_for_intended_use",
      parserVersion: "parser-v1",
      rawTraceSupported: true,
      pointInTimeSemanticsDocumented: true,
      reliabilityReviewRef: "reliability://fixture",
      reliabilityStatus: "passed",
      notes: [],
    },
  };
}

function sourcePlan(): CCFWeeklySourceSpinePlan {
  return {
    contractVersion: "ccf-weekly-source-spine-v1",
    planId: "weekly-source-plan-fixture",
    frozenAt: "2026-09-15T11:00:00Z",
    intendedUse: "ffcc_native_weekly_recommendation",
    bindings: CCF_WEEKLY_SOURCE_CAPABILITIES.map((capability) => ({
      capability,
      sourceState: sourceState(),
      identityBindingRef: `identity://${capability}`,
      rawArchiveRef: `archive://${capability}`,
      correctionPolicyRef: `corrections://${capability}`,
      checkpointPolicyRef: `checkpoint://${capability}`,
      captureMode: "provider_historical_archive" as const,
    })),
    notes: [],
  };
}

function dataset(plan: CCFWeeklySourceSpinePlan): CCFHistoricalDatasetManifest {
  return {
    contractVersion: "ccf-historical-dataset-manifest-v1",
    datasetId: "historical-fixture-v1",
    schemaVersion: "player-game-decision-v1",
    frozenAt: "2026-09-15T12:00:00Z",
    sourcePlanFingerprint: fingerprintCCFWeeklySourceSpinePlan(plan),
    scoringProfileFingerprint: SCORING,
    featureSetFingerprint: "feature-set-fixture",
    decisionPolicyFingerprint: "decision-policy-fixture",
    supportedPopulation: POPULATION,
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
        featureSnapshotFingerprint: "feature-train",
        sourceSnapshotRefs: ["archive://train"],
        outcomeArtifactFingerprint: "outcome-train",
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
        featureSnapshotFingerprint: "feature-validation",
        sourceSnapshotRefs: ["archive://validation"],
        outcomeArtifactFingerprint: "outcome-validation",
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
        featureSnapshotFingerprint: "feature-test",
        sourceSnapshotRefs: ["archive://test"],
        outcomeArtifactFingerprint: "sealed-outcome-test",
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

function protocol(data: CCFHistoricalDatasetManifest): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "predictive-fixture-v1",
    frozenAt: "2026-09-15T13:00:00Z",
    modelVersion: "model-fixture-v1",
    datasetFingerprint: fingerprintCCFHistoricalDatasetManifest(data),
    sourcePlanFingerprint: data.sourcePlanFingerprint,
    scoringProfileFingerprint: data.scoringProfileFingerprint,
    featureSetFingerprint: data.featureSetFingerprint,
    decisionPolicyFingerprint: data.decisionPolicyFingerprint,
    supportedPopulation: data.supportedPopulation,
    split: data.split,
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
      deterministicSeed: "personal-beta-fixture",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [{
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
    }],
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

function receipt(p: CCFPredictiveValidationProtocol): CCFPredictiveValidationReceipt {
  return {
    contractVersion: "ccf-predictive-validation-receipt-v1",
    runId: "certification-run-fixture",
    runnerVersion: "runner-v1",
    startedAt: "2026-09-15T14:00:00Z",
    completedAt: "2026-09-15T15:00:00Z",
    protocolId: p.protocolId,
    protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(p),
    modelVersion: p.modelVersion,
    datasetFingerprint: p.datasetFingerprint,
    sourcePlanFingerprint: p.sourcePlanFingerprint,
    scoringProfileFingerprint: p.scoringProfileFingerprint,
    featureSetFingerprint: p.featureSetFingerprint,
    decisionPolicyFingerprint: p.decisionPolicyFingerprint,
    supportedPopulation: p.supportedPopulation,
    candidateArtifactFingerprint: "candidate-artifact-fixture",
    nativeBaselineFingerprint: "native-baseline-fixture",
    pairedRows: 1,
    independentTimeBlocks: 1,
    finalHoldoutAccessCount: 1,
    tiberUsedAsAuthority: false,
    requiredChecks: CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `check:${name}`,
    })),
    antiLeakageControls: p.antiLeakageControls.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `anti:${name}`,
    })),
    negativeControls: p.negativeControls.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `negative:${name}`,
    })),
    promotionCriteria: p.promotionCriteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      status: "passed" as const,
      evidenceRef: `criterion:${criterion.criterionId}`,
    })),
    evidenceRefs: ["artifact:predictive-run"],
    releaseStatus: "certified",
  };
}

function release(
  p: CCFPredictiveValidationProtocol,
  r: CCFPredictiveValidationReceipt,
): CCFBacktestProgressRecord {
  return promoteCCFPredictiveReceiptToCertifiedRelease(p, r, {
    calibrationArtifactFingerprint: "calibration-fixture",
    metrics: { ...EMPTY_CCF_BACKTEST_METRICS, mae: 3, rmse: 4 },
    simpleBaselineMetrics: { ...EMPTY_CCF_BACKTEST_METRICS, mae: 4, rmse: 5 },
    challengerMetrics: null,
    tiberRole: "none",
    evidenceRefs: ["artifact:metric-summary"],
    claim: "Synthetic fully-certified release for personal-beta readiness tests.",
  });
}

function authority(
  run: CCFBacktestProgressRecord,
): { graph: CCFAuthorityGraph; bindings: CCFTrustedAuthorityBinding[] } {
  const stages = ["source", "evidence", "eligibility", "feature", "model", "policy", "recommendation"] as const;
  const families = {
    source: "ccf_native_fact",
    evidence: "ccf_native_fact",
    eligibility: "ccf_native_derived",
    feature: "ccf_native_derived",
    model: "ccf_native_model",
    policy: "ccf_native_policy",
    recommendation: "ccf_native_policy",
  } as const;
  const kinds = {
    source: "fact",
    evidence: "fact",
    eligibility: "deterministic_derivative",
    feature: "deterministic_derivative",
    model: "model_inference",
    policy: "policy",
    recommendation: "policy",
  } as const;
  const graph: CCFAuthorityGraph = {
    schemaVersion: "ccf-authority-graph-v1",
    graphId: "lineup-production-fixture",
    surface: "lineup",
    purpose: "production",
    asOf: AS_OF,
    scoringProfileHash: SCORING,
    supportedPopulation: POPULATION,
    recommendationNodeIds: ["recommendation"],
    nodes: stages.map((stage, index) => ({
      id: stage,
      stage,
      producer: `native-${stage}`,
      producerFamily: families[stage],
      evidenceKind: kinds[stage],
      criticality: "recommendation_critical",
      availability: "eligible",
      knownAt: "2026-09-15T16:00:00Z",
      provenanceRef: `native://${stage}`,
      certificationState: "certified",
      fallbackBehavior: "abstain",
      dependsOn: index === 0 ? [] : [stages[index - 1]],
      modelIdentity: stage === "model" ? {
        modelVersion: run.modelVersion!,
        calibrationVersion: run.calibrationVersion!,
        certificationRunId: run.id,
      } : null,
    })),
  };
  const bindings: CCFTrustedAuthorityBinding[] = graph.nodes.map((node) => ({
    schemaVersion: "ccf-trusted-authority-binding-v1",
    bindingId: `binding-${node.id}`,
    graphId: graph.graphId,
    surface: graph.surface,
    nodeId: node.id,
    stage: node.stage,
    producer: node.producer,
    producerFamily: node.producerFamily as CCFTrustedAuthorityBinding["producerFamily"],
    evidenceKind: node.evidenceKind as CCFTrustedAuthorityBinding["evidenceKind"],
    provenanceRef: node.provenanceRef!,
    bindingEvidenceRef: `binding-evidence://${node.id}`,
    attestedAt: "2026-09-15T16:30:00Z",
    validFrom: "2026-09-15T16:30:00Z",
    validThrough: null,
    status: "active",
  }));
  return { graph, bindings };
}

function devyReceipt(leagueId = "league-fixture"): CCFDevyIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-devy-identity-linkage-v1",
    receiptId: "devy-linkage-fixture",
    sourceArtifactFingerprint: "spreadsheet-fixture",
    sourceSchemaVersion: "roster-columns-v1",
    sourceImportedAt: "2026-09-15T17:00:00Z",
    sleeperLeagueId: leagueId,
    sleeperSnapshotFingerprint: "sleeper-snapshot-fixture",
    sleeperSnapshotKnownAt: "2026-09-15T17:05:00Z",
    frozenAt: "2026-09-15T17:10:00Z",
    rosterBindings: [{
      sourceRosterKey: "@fixture",
      sleeperRosterId: 7,
      bindingMethod: "explicit_mapping",
      evidenceRefs: ["evidence:roster"],
    }],
    rows: [{
      sourceRowKey: "sheet:row:1",
      sourceRosterKey: "@fixture",
      status: "resolved_exact",
      canonicalPlayerId: "canonical-player-1",
      sleeperPlayerId: "sleeper-player-1",
      bindingMethod: "exact_external_id",
      knownAt: "2026-09-15T17:05:00Z",
      evidenceRefs: ["evidence:player"],
    }],
    notes: [],
  };
}

function fixture(): CCFPersonalBetaReadinessInput {
  const plan = sourcePlan();
  const data = dataset(plan);
  const p = protocol(data);
  const r = receipt(p);
  const certified = release(p, r);
  const auth = authority(certified);
  return {
    asOf: AS_OF,
    weeklySourceSpine: plan,
    historicalDataset: data,
    predictiveProtocol: p,
    predictiveReceipt: r,
    backtestHistory: [certified],
    requiredAuthoritySurfaces: ["lineup"],
    authorityInputs: [{ surface: "lineup", graph: auth.graph, trustedBindings: auth.bindings }],
    sleeper: {
      portfolioPreflight: "passed",
      portfolioEvidenceRef: "sleeper://portfolio-preflight",
      writeActionsRequired: false,
      writeAuthorization: "not_required",
      actionSafetyCertified: true,
      actionSafetyEvidenceRef: "ci://sleeper-action-safety",
    },
    devy: {
      required: false,
      state: "not_run",
      expectedSleeperLeagueId: null,
      linkageReceipt: null,
    },
    smoke: {
      state: "passed",
      exactCandidateRef: "candidate://exact-build",
      evidenceRef: "smoke://personal-beta",
    },
  };
}

describe("CCF personal-beta evidence-native readiness", () => {
  it("can become ready only when all required evidence joins exactly", () => {
    const input = fixture();
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.contractVersion).toBe("ccf-personal-beta-readiness-v2");
    expect(result.ready).toBe(true);
    expect(result.overallStatus).toBe("ready");
    expect(result.gates.map((gate) => [gate.id, gate.status])).toEqual([
      ["PB-01", "pass"],
      ["PB-02", "pass"],
      ["PB-03", "pass"],
      ["PB-04", "pass"],
      ["PB-05", "pass"],
      ["PB-06", "not_applicable"],
      ["PB-07", "not_applicable"],
      ["PB-08", "pass"],
    ]);
    expect(() => assertCCFPersonalBetaReady(input)).not.toThrow();
  });

  it("PB-01 requires the whole production-ready six-capability source plan", () => {
    const input = fixture();
    input.weeklySourceSpine = null;
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.ready).toBe(false);
    expect(result.internalBlockers).toContain("PB-01:weekly_source_spine_missing");

    const partial = fixture();
    partial.weeklySourceSpine = {
      ...partial.weeklySourceSpine!,
      bindings: partial.weeklySourceSpine!.bindings.slice(1),
    };
    const partialResult = evaluateCCFPersonalBetaReadiness(partial);
    expect(partialResult.internalBlockers.some((blocker) =>
      blocker.includes("PB-01:weekly_box_score:missing_binding"),
    )).toBe(true);
  });

  it("PB-02 rejects valid-but-different weekly source plan and dataset identities", () => {
    const input = fixture();
    input.weeklySourceSpine = {
      ...input.weeklySourceSpine!,
      planId: "another-production-plan",
    };
    const sourceMismatch = evaluateCCFPersonalBetaReadiness(input);
    expect(sourceMismatch.internalBlockers).toContain(
      "PB-02:historical_dataset_source_plan_mismatch",
    );

    const dataMismatch = fixture();
    dataMismatch.predictiveProtocol = {
      ...dataMismatch.predictiveProtocol!,
      datasetFingerprint: "another-dataset",
    };
    const result = evaluateCCFPersonalBetaReadiness(dataMismatch);
    expect(result.internalBlockers.some((blocker) =>
      blocker.includes("PB-02:datasetFingerprint_mismatch"),
    )).toBe(true);
  });

  it("PB-03 requires the exact receipt-bound certified release in history", () => {
    const missing = fixture();
    missing.backtestHistory = [];
    expect(evaluateCCFPersonalBetaReadiness(missing).internalBlockers).toContain(
      "PB-03:certified_release_record_missing",
    );

    const tampered = fixture();
    tampered.backtestHistory = [{
      ...tampered.backtestHistory[0],
      certificationBinding: {
        ...tampered.backtestHistory[0].certificationBinding!,
        receiptFingerprint: "different-receipt",
      },
    }];
    const result = evaluateCCFPersonalBetaReadiness(tampered);
    expect(result.internalBlockers).toEqual(expect.arrayContaining([
      expect.stringContaining("PB-03:certified_release_invalid:"),
      "PB-03:certified_release_receipt_fingerprint_mismatch",
    ]));
  });

  it("PB-03 rejects a future receipt even if every cryptographic identity matches", () => {
    const input = fixture();
    input.asOf = "2026-09-15T14:30:00Z";
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.internalBlockers).toContain("PB-03:predictive_receipt_completed_after_as_of");
  });

  it("PB-07 requires an actual exact Devy receipt for the expected Sleeper league", () => {
    const missing = fixture();
    missing.devy = {
      required: true,
      state: "ready",
      expectedSleeperLeagueId: "league-fixture",
      linkageReceipt: null,
    };
    expect(evaluateCCFPersonalBetaReadiness(missing).internalBlockers).toContain(
      "PB-07:devy_identity_linkage_receipt_missing",
    );

    const exact = fixture();
    exact.devy = {
      required: true,
      state: "ready",
      expectedSleeperLeagueId: "league-fixture",
      linkageReceipt: devyReceipt(),
    };
    expect(evaluateCCFPersonalBetaReadiness(exact).gates.find((gate) => gate.id === "PB-07")?.status)
      .toBe("pass");

    const wrongLeague = fixture();
    wrongLeague.devy = {
      required: true,
      state: "ready",
      expectedSleeperLeagueId: "league-fixture",
      linkageReceipt: devyReceipt("another-league"),
    };
    expect(evaluateCCFPersonalBetaReadiness(wrongLeague).internalBlockers).toContain(
      "PB-07:devy_sleeper_league_mismatch",
    );
  });

  it("classifies known external blockers separately but never lets them hide internal blockers", () => {
    const externalOnly = fixture();
    externalOnly.devy = {
      required: true,
      state: "pending_external",
      expectedSleeperLeagueId: "league-fixture",
      linkageReceipt: null,
    };
    const external = evaluateCCFPersonalBetaReadiness(externalOnly);
    expect(external.overallStatus).toBe("blocked_external");
    expect(external.externalBlockers).toContain("PB-07:devy_identity_linkage_pending_external");

    const mixed = fixture();
    mixed.weeklySourceSpine = null;
    mixed.sleeper.portfolioPreflight = "pending_external";
    const result = evaluateCCFPersonalBetaReadiness(mixed);
    expect(result.overallStatus).toBe("blocked_internal");
    expect(result.internalBlockers.length).toBeGreaterThan(0);
    expect(result.externalBlockers).toContain("PB-05:sleeper_portfolio_preflight_pending_external");
  });
});
