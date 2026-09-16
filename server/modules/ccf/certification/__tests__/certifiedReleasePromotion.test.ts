import {
  EMPTY_CCF_BACKTEST_METRICS,
  validateCCFBacktestProgressHistory,
  type CCFBacktestMetricSet,
  type CCFBacktestProgressRecord,
} from "../backtestProgressHistory";
import {
  certifiedModelIdentityFromRelease,
  promoteCCFPredictiveReceiptToCertifiedRelease,
} from "../certifiedReleasePromotion";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import {
  CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
  type CCFPredictiveValidationReceipt,
} from "../predictiveValidationReceipt";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "weekly-release-fixture",
    frozenAt: "2026-09-15T05:30:00Z",
    modelVersion: "ccf-model-fixture-v1",
    datasetFingerprint: "dataset-fingerprint",
    sourcePlanFingerprint: "source-plan-fingerprint",
    scoringProfileFingerprint: "scoring-profile-fingerprint",
    featureSetFingerprint: "feature-set-fingerprint",
    decisionPolicyFingerprint: "decision-policy-fingerprint",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
    split: {
      train: { start: { season: 2023, week: 1 }, end: { season: 2023, week: 18 } },
      validation: { start: { season: 2024, week: 1 }, end: { season: 2024, week: 18 } },
      test: { start: { season: 2025, week: 1 }, end: { season: 2025, week: 18 } },
    },
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
      minimumOverallPairedRows: 20,
      minimumSubgroupRows: 5,
      minimumIndependentTimeBlocks: 5,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "release-fixture",
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
    runId: "release-run-fixture",
    runnerVersion: "runner-v1",
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
    candidateArtifactFingerprint: "candidate-artifact-fingerprint",
    nativeBaselineFingerprint: "native-baseline-fingerprint",
    pairedRows: 20,
    independentTimeBlocks: 5,
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
    evidenceRefs: ["artifact:validation-run"],
    releaseStatus: "certified",
  };
}

function metrics(mae: number, rmse: number): CCFBacktestMetricSet {
  return {
    ...EMPTY_CCF_BACKTEST_METRICS,
    mae,
    rmse,
    spearman: 0.5,
    central80Coverage: 0.8,
  };
}

function promotionInput() {
  return {
    calibrationArtifactFingerprint: "calibration-artifact-fingerprint",
    metrics: metrics(3.1, 4.2),
    simpleBaselineMetrics: metrics(3.8, 4.9),
    challengerMetrics: null,
    tiberRole: "none" as const,
    evidenceRefs: ["artifact:metric-summary"],
    claim: "Frozen native candidate satisfied the preregistered predictive certification contract.",
  };
}

describe("CCF certified release promotion", () => {
  it("mints the authority identity from the certified receipt run itself", () => {
    const p = protocol();
    const record = promoteCCFPredictiveReceiptToCertifiedRelease(p, receipt(p), promotionInput());
    expect(record.id).toBe("release-run-fixture");
    expect(record.stage).toBe("certified_release");
    expect(record.status).toBe("certified");
    expect(record.calibrationVersion).toBe("calibration-artifact-fingerprint");
    expect(record.comparisonIdentity).toMatchObject({
      protocolVersion: "ccf-predictive-validation-protocol-v1",
      scoringProfileHash: p.scoringProfileFingerprint,
      datasetFingerprint: p.datasetFingerprint,
      testWindow: "2025-W1..2025-W18",
    });
    expect(record.certificationBinding).toMatchObject({
      candidateArtifactFingerprint: "candidate-artifact-fingerprint",
      calibrationArtifactFingerprint: "calibration-artifact-fingerprint",
      finalHoldoutAccessCount: 1,
    });
    expect(() => validateCCFBacktestProgressHistory([record])).not.toThrow();
    expect(certifiedModelIdentityFromRelease(record)).toEqual({
      modelVersion: p.modelVersion,
      calibrationVersion: "calibration-artifact-fingerprint",
      certificationRunId: "release-run-fixture",
    });
  });

  it("refuses to promote a merely passed or incomplete release", () => {
    const p = protocol();
    const candidate = { ...receipt(p), releaseStatus: "passed" as const };
    expect(() =>
      promoteCCFPredictiveReceiptToCertifiedRelease(p, candidate, promotionInput()),
    ).toThrow(/only a certified predictive validation receipt/);
  });

  it("requires authority-comparable candidate and native baseline metrics", () => {
    const p = protocol();
    const input = promotionInput();
    input.metrics = { ...input.metrics, mae: null };
    expect(() => promoteCCFPredictiveReceiptToCertifiedRelease(p, receipt(p), input)).toThrow(
      /metrics.mae is required for authority-eligible certification/,
    );
  });

  it("rejects hand-authored certified records without validation-artifact binding", () => {
    const p = protocol();
    const valid = promoteCCFPredictiveReceiptToCertifiedRelease(p, receipt(p), promotionInput());
    const handAuthored: CCFBacktestProgressRecord = {
      ...valid,
      certificationBinding: null,
    };
    expect(() => validateCCFBacktestProgressHistory([handAuthored])).toThrow(
      /certified release requires certificationBinding/,
    );
    expect(() => certifiedModelIdentityFromRelease(handAuthored)).toThrow(
      /model identity requires a valid certified release/,
    );
  });

  it("rejects certification-binding tampering", () => {
    const p = protocol();
    const valid = promoteCCFPredictiveReceiptToCertifiedRelease(p, receipt(p), promotionInput());
    const tampered: CCFBacktestProgressRecord = {
      ...valid,
      certificationBinding: {
        ...valid.certificationBinding!,
        calibrationArtifactFingerprint: "other-calibration",
      },
    };
    expect(() => validateCCFBacktestProgressHistory([tampered])).toThrow(
      /calibrationVersion must equal certification calibration fingerprint/,
    );
  });
});
