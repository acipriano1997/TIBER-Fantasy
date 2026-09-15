import {
  CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
  type CCFPredictiveValidationReceipt,
} from "../../certification/predictiveValidationReceipt";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../../certification/predictiveValidationProtocol";
import {
  EMPTY_CCF_BACKTEST_METRICS,
  type CCFBacktestProgressRecord,
} from "../../certification/backtestProgressHistory";
import type { CCFSourceState } from "../../sources/sourceState";
import type {
  CCFAuthorityGraph,
  CCFTrustedAuthorityBinding,
} from "../authorityGraph";
import {
  assertCCFPersonalBetaReady,
  evaluateCCFPersonalBetaReadiness,
  type CCFPersonalBetaReadinessInput,
} from "../personalBetaReadiness";

const AS_OF = "2026-09-15T12:00:00Z";

function sourceState(): CCFSourceState {
  return {
    sourceId: "synthetic-weekly-source",
    evidenceClass: "source_backed",
    governanceState: "promoted",
    knownAt: "2026-09-15T10:00:00Z",
    supportWindow: {
      validFrom: "2026-09-01T00:00:00Z",
      validThrough: null,
    },
    staleAfter: "2026-09-16T00:00:00Z",
    producer: "ccf-native-source",
    qualification: {
      qualificationVersion: "ccf-source-qualification-v1",
      qualificationId: "synthetic-weekly-source-q1",
      reviewedAt: "2026-09-14T00:00:00Z",
      termsOrLicenseRef: "license://synthetic",
      permissionStatus: "permitted_for_intended_use",
      parserVersion: "synthetic-parser-v1",
      rawTraceSupported: true,
      pointInTimeSemanticsDocumented: true,
      reliabilityReviewRef: "review://synthetic-source",
      reliabilityStatus: "passed",
      notes: [],
    },
  };
}

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "synthetic-protocol",
    frozenAt: "2026-09-15T05:30:00Z",
    modelVersion: "synthetic-model",
    datasetFingerprint: "synthetic-dataset",
    sourcePlanFingerprint: "synthetic-source-plan",
    scoringProfileFingerprint: "synthetic-score",
    featureSetFingerprint: "synthetic-features",
    decisionPolicyFingerprint: "synthetic-decision-policy",
    supportedPopulation: "synthetic-population",
    split: {
      train: {
        start: { season: 2021, week: 1 },
        end: { season: 2024, week: 18 },
      },
      validation: {
        start: { season: 2025, week: 1 },
        end: { season: 2025, week: 18 },
      },
      test: {
        start: { season: 2026, week: 1 },
        end: { season: 2026, week: 18 },
      },
    },
    targets: ["fantasy_points", "lineup_utility"],
    arms: [
      "native_candidate",
      "historical_mean",
      "recent_mean",
      "usage_rate",
      "previous_ccf",
      "tiber_challenger",
    ],
    primaryMetrics: ["mae", "lineup_regret", "paired_loss_improvement"],
    secondaryMetrics: ["rmse", "rank_spearman"],
    subgroupDimensions: ["position", "role_tier", "uncertainty_band"],
    featureFamilies: ["usage", "role", "matchup", "injury"],
    ablationModes: ["leave_one_family_out", "single_family_only"],
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
      minimumOverallPairedRows: 500,
      minimumSubgroupRows: 75,
      minimumIndependentTimeBlocks: 20,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 2000,
      confidenceLevel: 0.95,
      deterministicSeed: "synthetic-protocol",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      {
        criterionId: "fantasy-points-mae-vs-usage",
        target: "fantasy_points",
        metric: "mae",
        comparatorArm: "usage_rate",
        candidateArm: "native_candidate",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0.01,
        minimumRelativeImprovement: null,
        confidenceLowerBoundMustBeatZero: true,
        appliesTo: "both",
      },
      {
        criterionId: "lineup-regret-vs-previous",
        target: "lineup_utility",
        metric: "lineup_regret",
        comparatorArm: "previous_ccf",
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

function predictiveReceipt(p: CCFPredictiveValidationProtocol): CCFPredictiveValidationReceipt {
  return {
    contractVersion: "ccf-predictive-validation-receipt-v1",
    runId: "synthetic-run",
    runnerVersion: "synthetic-runner-v1",
    startedAt: "2026-09-15T06:00:00Z",
    completedAt: "2026-09-15T06:30:00Z",
    protocolId: p.protocolId,
    protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(p),
    modelVersion: p.modelVersion,
    datasetFingerprint: p.datasetFingerprint,
    sourcePlanFingerprint: p.sourcePlanFingerprint,
    scoringProfileFingerprint: p.scoringProfileFingerprint,
    featureSetFingerprint: p.featureSetFingerprint,
    decisionPolicyFingerprint: p.decisionPolicyFingerprint,
    supportedPopulation: p.supportedPopulation,
    candidateArtifactFingerprint: "synthetic-candidate-artifact",
    nativeBaselineFingerprint: "synthetic-native-baseline",
    pairedRows: 500,
    independentTimeBlocks: 20,
    finalHoldoutAccessCount: 1,
    tiberUsedAsAuthority: false,
    requiredChecks: CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `check://${name}`,
    })),
    antiLeakageControls: p.antiLeakageControls.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `anti-leakage://${name}`,
    })),
    negativeControls: p.negativeControls.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `negative://${name}`,
    })),
    promotionCriteria: p.promotionCriteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      status: "passed" as const,
      evidenceRef: `criterion://${criterion.criterionId}`,
    })),
    evidenceRefs: ["receipt://synthetic-run"],
    releaseStatus: "certified",
  };
}

function authorityGraph(): CCFAuthorityGraph {
  const stages = [
    "source",
    "evidence",
    "eligibility",
    "feature",
    "model",
    "policy",
    "recommendation",
  ] as const;
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

  return {
    schemaVersion: "ccf-authority-graph-v1",
    graphId: "synthetic-lineup",
    surface: "lineup",
    purpose: "production",
    asOf: AS_OF,
    scoringProfileHash: "synthetic-score",
    supportedPopulation: "synthetic-population",
    recommendationNodeIds: ["recommendation"],
    nodes: stages.map((stage, index): CCFAuthorityGraph["nodes"][number] => ({
      id: stage,
      stage,
      producer: `synthetic-ccf-${stage}`,
      producerFamily: families[stage],
      evidenceKind: kinds[stage],
      criticality: "recommendation_critical",
      availability: "eligible",
      knownAt: "2026-09-15T10:00:00Z",
      provenanceRef: `synthetic://${stage}`,
      certificationState: "certified",
      fallbackBehavior: "abstain",
      dependsOn: index === 0 ? [] : [stages[index - 1]],
      modelIdentity: stage === "model" ? {
        modelVersion: "synthetic-model",
        calibrationVersion: "synthetic-calibration",
        certificationRunId: "synthetic-run",
      } : null,
    })),
  };
}

function trustedBindings(graph: CCFAuthorityGraph): CCFTrustedAuthorityBinding[] {
  return graph.nodes.map((node) => ({
    schemaVersion: "ccf-trusted-authority-binding-v1",
    bindingId: `${graph.surface}-${node.id}-binding`,
    graphId: graph.graphId,
    surface: graph.surface,
    nodeId: node.id,
    stage: node.stage,
    producer: node.producer,
    producerFamily: node.producerFamily as CCFTrustedAuthorityBinding["producerFamily"],
    evidenceKind: node.evidenceKind as CCFTrustedAuthorityBinding["evidenceKind"],
    provenanceRef: node.provenanceRef!,
    bindingEvidenceRef: `binding://${node.id}`,
    attestedAt: "2026-09-15T09:00:00Z",
    validFrom: "2026-09-15T09:00:00Z",
    validThrough: null,
    status: "active",
  }));
}

function certifiedHistoryRecord(): CCFBacktestProgressRecord {
  return {
    id: "synthetic-run",
    recordedAt: "2026-09-15T07:00:00Z",
    stage: "certified_release",
    status: "certified",
    modelVersion: "synthetic-model",
    calibrationVersion: "synthetic-calibration",
    comparisonIdentity: {
      protocolVersion: "ccf-predictive-validation-protocol-v1",
      scoringProfileHash: "synthetic-score",
      supportedPopulation: "synthetic-population",
      testWindow: "2026 weeks 1-18",
      datasetFingerprint: "synthetic-dataset",
    },
    metrics: {
      ...EMPTY_CCF_BACKTEST_METRICS,
      mae: 3,
      rmse: 4,
      lineupRegret: 0.8,
    },
    simpleBaselineMetrics: {
      ...EMPTY_CCF_BACKTEST_METRICS,
      mae: 4,
      rmse: 5,
      lineupRegret: 1,
    },
    challengerMetrics: null,
    tiberRole: "challenger_only",
    evidenceRefs: ["receipt://synthetic-run"],
    claim: "Synthetic certified fixture for personal-beta readiness tests.",
  };
}

function readyInput(): CCFPersonalBetaReadinessInput {
  const p = protocol();
  const graph = authorityGraph();
  return {
    asOf: AS_OF,
    requiredSourceStates: [sourceState()],
    predictiveProtocol: p,
    predictiveReceipt: predictiveReceipt(p),
    backtestHistory: [certifiedHistoryRecord()],
    requiredAuthoritySurfaces: ["lineup"],
    authorityInputs: [{
      surface: "lineup",
      graph,
      trustedBindings: trustedBindings(graph),
    }],
    sleeper: {
      portfolioPreflight: "passed",
      portfolioEvidenceRef: "sleeper://portfolio-preflight",
      writeActionsRequired: true,
      writeAuthorization: "authorized",
      actionSafetyCertified: true,
      actionSafetyEvidenceRef: "sleeper://action-safety-cert",
    },
    devy: {
      required: true,
      linkageCertified: true,
      evidenceRef: "devy://identity-linkage-cert",
    },
    smoke: {
      state: "passed",
      exactCandidateRef: "git://candidate-sha",
      evidenceRef: "smoke://personal-beta",
    },
  };
}

describe("CCF personal beta readiness", () => {
  it("passes only when every applicable launch-critical gate is certified", () => {
    const result = evaluateCCFPersonalBetaReadiness(readyInput());
    expect(result.overallStatus).toBe("ready");
    expect(result.ready).toBe(true);
    expect(result.gates).toHaveLength(8);
    expect(result.gates.every((gate) => gate.status === "pass" || gate.status === "not_applicable")).toBe(true);
    expect(() => assertCCFPersonalBetaReady(readyInput())).not.toThrow();
  });

  it("reports Sleeper-only waiting as external when internal gates are green", () => {
    const input = readyInput();
    input.sleeper = {
      ...input.sleeper,
      portfolioPreflight: "pending_external",
      portfolioEvidenceRef: null,
      writeAuthorization: "pending_external",
    };
    input.smoke = {
      state: "pending_external",
      exactCandidateRef: null,
      evidenceRef: null,
    };
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.overallStatus).toBe("blocked_external");
    expect(result.internalBlockers).toEqual([]);
    expect(result.externalBlockers).toEqual(expect.arrayContaining([
      "PB-05:sleeper_portfolio_preflight_pending_external",
      "PB-06:sleeper_write_authorization_pending_external",
      "PB-08:personal_beta_smoke_pending_external",
    ]));
  });

  it("does not hide internal source blockers behind pending Sleeper approval", () => {
    const input = readyInput();
    input.requiredSourceStates = [{
      ...sourceState(),
      qualification: {
        ...sourceState().qualification!,
        permissionStatus: "evaluation_only",
      },
    }];
    input.sleeper = {
      ...input.sleeper,
      portfolioPreflight: "pending_external",
      portfolioEvidenceRef: null,
      writeAuthorization: "pending_external",
    };
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.overallStatus).toBe("blocked_internal");
    expect(result.internalBlockers).toContain("PB-01:synthetic-weekly-source:permission_not_cleared");
    expect(result.externalBlockers).toEqual(expect.arrayContaining([
      "PB-05:sleeper_portfolio_preflight_pending_external",
      "PB-06:sleeper_write_authorization_pending_external",
    ]));
  });

  it("blocks when a frozen predictive receipt is absent", () => {
    const input = readyInput();
    input.predictiveReceipt = null;
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.overallStatus).toBe("blocked_internal");
    expect(result.internalBlockers).toContain("PB-03:predictive_receipt_missing");
  });

  it("blocks when active recommendation authority loses a trusted binding", () => {
    const input = readyInput();
    input.authorityInputs = [{
      ...input.authorityInputs[0],
      trustedBindings: input.authorityInputs[0].trustedBindings.slice(1),
    }];
    const result = evaluateCCFPersonalBetaReadiness(input);
    expect(result.overallStatus).toBe("blocked_internal");
    expect(result.internalBlockers.some((blocker) =>
      blocker.includes("PB-04:lineup:binding:source:unbound_critical_node"),
    )).toBe(true);
  });
});
