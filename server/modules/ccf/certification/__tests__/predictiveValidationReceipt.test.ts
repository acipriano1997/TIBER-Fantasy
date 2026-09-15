import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import {
  CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
  fingerprintCCFPredictiveValidationReceipt,
  validateCCFPredictiveValidationReceipt,
  type CCFPredictiveValidationReceipt,
} from "../predictiveValidationReceipt";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "ccf-weekly-outcomes-v1",
    frozenAt: "2026-09-15T05:30:00Z",
    modelVersion: "ccf-candidate-v1",
    datasetFingerprint: "dataset-sha256-fixture",
    sourcePlanFingerprint: "source-plan-sha256-fixture",
    scoringProfileFingerprint: "scoring-sha256-fixture",
    featureSetFingerprint: "features-sha256-fixture",
    decisionPolicyFingerprint: "decision-policy-sha256-fixture",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
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
    targets: ["fantasy_points", "boom_probability", "lineup_utility"],
    arms: [
      "native_candidate",
      "historical_mean",
      "recent_mean",
      "usage_rate",
      "previous_ccf",
      "tiber_challenger",
    ],
    primaryMetrics: ["mae", "brier", "lineup_regret", "paired_loss_improvement"],
    secondaryMetrics: ["rmse", "rank_spearman", "expected_calibration_error"],
    subgroupDimensions: ["position", "role_tier", "uncertainty_band", "season_era"],
    featureFamilies: ["usage", "role", "matchup", "injury", "weather", "market"],
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
    negativeControls: ["label_permutation", "future_feature_canary", "random_noise_feature"],
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
      deterministicSeed: "ccf-weekly-outcomes-v1",
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

function receipt(p: CCFPredictiveValidationProtocol = protocol()): CCFPredictiveValidationReceipt {
  return {
    contractVersion: "ccf-predictive-validation-receipt-v1",
    runId: "run-2026-09-15-fixture",
    runnerVersion: "ccf-rolling-origin-runner-v1",
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
    candidateArtifactFingerprint: "candidate-artifact-sha256-fixture",
    nativeBaselineFingerprint: "native-baseline-sha256-fixture",
    pairedRows: 500,
    independentTimeBlocks: 20,
    finalHoldoutAccessCount: 1,
    tiberUsedAsAuthority: false,
    requiredChecks: CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `evidence:${name}`,
    })),
    antiLeakageControls: p.antiLeakageControls.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `anti-leakage:${name}`,
    })),
    negativeControls: p.negativeControls.map((name) => ({
      name,
      status: "passed" as const,
      evidenceRef: `negative-control:${name}`,
    })),
    promotionCriteria: p.promotionCriteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      status: "passed" as const,
      evidenceRef: `criterion:${criterion.criterionId}`,
    })),
    evidenceRefs: ["artifact:rolling-origin-run", "artifact:promotion-evaluation"],
    releaseStatus: "certified",
  };
}

describe("CCF predictive validation receipt", () => {
  it("accepts a complete certified receipt bound to the frozen protocol", () => {
    const p = protocol();
    expect(validateCCFPredictiveValidationReceipt(p, receipt(p))).toEqual(receipt(p));
  });

  it("fails closed when a required certification check is missing", () => {
    const p = protocol();
    const candidate = receipt(p);
    candidate.requiredChecks = candidate.requiredChecks.slice(1);
    expect(() => validateCCFPredictiveValidationReceipt(p, candidate)).toThrow(
      /missing required result/,
    );
  });

  it("rejects TIBER authority and multiple final-holdout accesses", () => {
    const p = protocol();
    expect(() =>
      validateCCFPredictiveValidationReceipt(p, {
        ...receipt(p),
        tiberUsedAsAuthority: true,
      }),
    ).toThrow(/TIBER cannot be recommendation authority/);

    expect(() =>
      validateCCFPredictiveValidationReceipt(p, {
        ...receipt(p),
        finalHoldoutAccessCount: 2,
      }),
    ).toThrow(/exactly one final holdout access/);
  });

  it("rejects receipts that do not match frozen model/data identity", () => {
    const p = protocol();
    expect(() =>
      validateCCFPredictiveValidationReceipt(p, {
        ...receipt(p),
        datasetFingerprint: "different-dataset",
      }),
    ).toThrow(/datasetFingerprint does not match frozen protocol/);
  });

  it("does not certify a receipt with a failed required check", () => {
    const p = protocol();
    const candidate = receipt(p);
    candidate.requiredChecks = candidate.requiredChecks.map((result) =>
      result.name === "lineup_regret" ? { ...result, status: "failed" as const } : result,
    );
    expect(() => validateCCFPredictiveValidationReceipt(p, candidate)).toThrow(
      /requiredChecks failed: lineup_regret/,
    );
  });

  it("fingerprints receipt set-like fields deterministically", () => {
    const p = protocol();
    const first = receipt(p);
    const reordered: CCFPredictiveValidationReceipt = {
      ...first,
      requiredChecks: [...first.requiredChecks].reverse(),
      antiLeakageControls: [...first.antiLeakageControls].reverse(),
      negativeControls: [...first.negativeControls].reverse(),
      promotionCriteria: [...first.promotionCriteria].reverse(),
      evidenceRefs: [...first.evidenceRefs].reverse(),
    };
    expect(fingerprintCCFPredictiveValidationReceipt(p, first)).toBe(
      fingerprintCCFPredictiveValidationReceipt(p, reordered),
    );
  });
});
