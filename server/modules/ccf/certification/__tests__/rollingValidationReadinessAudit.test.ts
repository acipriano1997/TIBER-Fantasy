import {
  buildCCFRollingValidationReadinessAudit,
} from "../rollingValidationReadinessAudit";
import {
  CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
} from "../predictiveValidationReceipt";
import {
  fingerprintCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "readiness-audit-v1",
    frozenAt: "2026-09-18T16:00:00Z",
    modelVersion: "ccf-player-outcome-v0",
    datasetFingerprint: "dataset-v1",
    sourcePlanFingerprint: "source-plan-v1",
    scoringProfileFingerprint: "scoring-v1",
    featureSetFingerprint: "features-v1",
    decisionPolicyFingerprint: "decision-v1",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
    split: {
      train: {
        start: { season: 2024, week: 1 },
        end: { season: 2024, week: 2 },
      },
      validation: {
        start: { season: 2024, week: 3 },
        end: { season: 2024, week: 4 },
      },
      test: {
        start: { season: 2024, week: 5 },
        end: { season: 2024, week: 5 },
      },
    },
    targets: ["fantasy_points"],
    arms: ["native_candidate", "historical_mean", "recent_mean", "usage_rate"],
    primaryMetrics: ["mae"],
    secondaryMetrics: [
      "rank_spearman",
      "pinball_loss",
      "interval_coverage",
      "abstention_selectivity",
    ],
    subgroupDimensions: ["position", "role_tier"],
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
      minimumOverallPairedRows: 2,
      minimumSubgroupRows: 2,
      minimumIndependentTimeBlocks: 2,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "readiness-audit",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      {
        criterionId: "fantasy-mae-vs-usage",
        target: "fantasy_points",
        metric: "mae",
        comparatorArm: "usage_rate",
        candidateArm: "native_candidate",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0,
        minimumRelativeImprovement: null,
        confidenceLowerBoundMustBeatZero: false,
        appliesTo: "both",
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

function packets(frozen = protocol()) {
  const fingerprint = fingerprintCCFPredictiveValidationProtocol(frozen);
  const binding = "ccf://rolling-replay-binding/sha256/readiness";

  const execution = {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding: {
      bindingId: binding,
      protocolFingerprint: fingerprint,
    },
    pointEstimate: "mean_fpts",
    predictions: [{ rowId: "row-1" }],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  const baselineEvidence = {
    contractVersion: "ccf-rolling-validation-baseline-evidence-v1",
    replayBindingId: binding,
    protocolFingerprint: fingerprint,
    pointEstimate: "mean_fpts",
    evaluationRowIds: ["row-1"],
    armEvidence: [
      {
        arm: "historical_mean",
        evidenceRef: "ccf://baseline/historical",
      },
      {
        arm: "recent_mean",
        evidenceRef: "ccf://baseline/recent",
      },
      {
        arm: "usage_rate",
        evidenceRef: "ccf://baseline/usage",
      },
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  const promotionEvidence = {
    contractVersion: "ccf-rolling-validation-promotion-evidence-v1",
    replayBindingId: binding,
    protocolFingerprint: fingerprint,
    criterionEvidence: [
      {
        evidenceRef: "ccf://uncertainty/overall",
        uncertainty: { pairedSampleSize: 2 },
      },
    ],
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  const diagnosticEvidence = {
    contractVersion: "ccf-rolling-validation-diagnostic-evidence-v1",
    replayBindingId: binding,
    protocolFingerprint: fingerprint,
    declaredMetrics: [
      "rank_spearman",
      "pinball_loss",
      "interval_coverage",
      "abstention_selectivity",
    ],
    rankByBlock: [{ blockId: "2024-W3", sampleSize: 2 }],
    quantileScoring: { sampleSize: 10 },
    intervalCalibration: { sampleSize: 2 },
    selectivePrediction: {
      contractVersion: "ccf-rolling-validation-selective-evidence-v1",
      selectionScoreField: "outcome.confidence",
      abstainedCount: 0,
      metrics: { sampleSize: 2 },
    },
    evidenceRef: "ccf://diagnostic/readiness",
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  const subgroupEvidence = {
    contractVersion:
      "ccf-rolling-validation-subgroup-promotion-evidence-v1",
    replayBindingId: binding,
    protocolFingerprint: fingerprint,
    dimension: "position",
    criterionEvidence: [
      {
        criterionId: "fantasy-mae-vs-usage",
        evidenceRef: "ccf://subgroup/position",
        subgroupResults: [
          {
            status: "evaluated",
            evidenceRef: "ccf://uncertainty/subgroup",
          },
        ],
      },
    ],
    promotionEvaluated: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  const promotionEvaluation = {
    contractVersion: "ccf-rolling-validation-promotion-evaluation-v1",
    replayBindingId: binding,
    protocolFingerprint: fingerprint,
    criterionEvidence: [],
    evaluation: {
      contractVersion: "ccf-predictive-promotion-evaluation-v1",
      protocolFingerprint: fingerprint,
      criterionResults: [],
      passed: true,
    },
    evidenceRefs: [],
    evidenceRef: "ccf://promotion-evaluation/readiness",
    promotionEvaluated: true,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  const tiberOffEvidence = {
    contractVersion: "ccf-rolling-validation-tiber-off-evidence-v1",
    replayBindingId: binding,
    protocolFingerprint: fingerprint,
    auditedPredictionCount: 1,
    auditedModelFeatureCount: 1,
    producerFamilies: ["ccf_native_derived"],
    tiberUsedAsAuthority: false,
    tiberUsedAsModelInput: false,
    evidenceRefs: ["ccf://source/native"],
    evidenceRef: "ccf://tiber-off/readiness",
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  } as any;

  return {
    execution,
    baselineEvidence,
    promotionEvidence,
    diagnosticEvidence,
    subgroupEvidence,
    promotionEvaluation,
    tiberOffEvidence,
  };
}

describe("CCF rolling validation readiness audit", () => {
  it("covers every mandatory receipt check without upgrading evidence availability into certification", () => {
    const frozen = protocol();
    const result = buildCCFRollingValidationReadinessAudit({
      protocol: frozen,
      ...packets(frozen),
    });

    expect(result.checks.map((row) => row.name).sort()).toEqual(
      [...CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS].sort(),
    );
    expect(result).toMatchObject({
      availableCheckCount: 7,
      partialCheckCount: 2,
      missingCheckCount: 2,
      promotionCriteriaEvaluated: true,
      promotionCriteriaPassed: true,
      finalHoldoutReady: false,
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });

    expect(
      result.checks.find((row) => row.name === "calibration"),
    ).toMatchObject({
      status: "partial",
      blockers: [
        "probability_event_labels_and_probability_calibration_not_frozen",
      ],
    });
    expect(
      result.checks.find((row) => row.name === "subgroup_stability"),
    ).toMatchObject({
      status: "partial",
      blockers: ["subgroup_dimension_not_evaluated:role_tier"],
    });
    expect(
      result.checks.find((row) => row.name === "lineup_regret"),
    ).toMatchObject({
      status: "missing",
    });
    expect(
      result.checks.find((row) => row.name === "feature_ablation"),
    ).toMatchObject({
      status: "missing",
    });
    expect(
      result.checks.find((row) => row.name === "tiber_off_replay"),
    ).toMatchObject({
      status: "evidence_available",
      evidenceRefs: ["ccf://tiber-off/readiness"],
    });

    expect(result.receiptControlBlockers).toHaveLength(
      frozen.antiLeakageControls.length + frozen.negativeControls.length,
    );
    expect(result.auditRef).toMatch(
      /^ccf:\/\/rolling-validation-readiness-audit\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("reports position subgroup evidence as complete only when position is the full frozen subgroup scope", () => {
    const frozen = {
      ...protocol(),
      subgroupDimensions: ["position"] as CCFPredictiveValidationProtocol["subgroupDimensions"],
    };
    const result = buildCCFRollingValidationReadinessAudit({
      protocol: frozen,
      ...packets(frozen),
    });

    expect(
      result.checks.find((row) => row.name === "subgroup_stability"),
    ).toMatchObject({
      status: "evidence_available",
      blockers: [],
    });
    expect(result.availableCheckCount).toBe(8);
    expect(result.partialCheckCount).toBe(1);
  });

  it("recognizes a replay-bound lineup regret evidence packet without upgrading other blockers", () => {
    const frozen = protocol();
    const input = packets(frozen);
    input.lineupRegretEvidence = {
      contractVersion: "ccf-rolling-validation-lineup-regret-evidence-v1",
      replayBindingId:
        "ccf://rolling-replay-binding/sha256/readiness",
      protocolFingerprint:
        fingerprintCCFPredictiveValidationProtocol(frozen),
      policyVersion: "ccf-lineup-regret-policy-v1",
      catastrophicRegretThreshold: 10,
      decisionCount: 2,
      metrics: {},
      decisionEvidenceRefs: ["ccf://historical-lineup/decision-1"],
      evidenceRef: "ccf://lineup-regret/readiness",
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    } as any;

    const result = buildCCFRollingValidationReadinessAudit({
      protocol: frozen,
      ...input,
    });

    expect(
      result.checks.find((row) => row.name === "lineup_regret"),
    ).toMatchObject({
      status: "evidence_available",
      evidenceRefs: ["ccf://lineup-regret/readiness"],
      blockers: [],
    });
    expect(result.availableCheckCount).toBe(8);
    expect(result.missingCheckCount).toBe(1);
    expect(result.finalHoldoutReady).toBe(false);
  });

  it("marks missing predeclared diagnostic evidence instead of inferring it", () => {
    const frozen = protocol();
    const input = packets(frozen);
    input.diagnosticEvidence.rankByBlock = null;
    input.diagnosticEvidence.quantileScoring = null;

    const result = buildCCFRollingValidationReadinessAudit({
      protocol: frozen,
      ...input,
    });

    expect(
      result.checks.find((row) => row.name === "rank_quality")?.status,
    ).toBe("missing");
    expect(
      result.checks.find((row) => row.name === "distribution_quality")?.status,
    ).toBe("missing");
  });

  it("rejects evidence packets from another replay binding", () => {
    const frozen = protocol();
    const input = packets(frozen);
    input.tiberOffEvidence.replayBindingId =
      "ccf://rolling-replay-binding/sha256/other";

    expect(() =>
      buildCCFRollingValidationReadinessAudit({
        protocol: frozen,
        ...input,
      }),
    ).toThrow(/TIBER-off evidence does not match/);
  });

  it("refuses any readiness audit after final-holdout access", () => {
    const frozen = protocol();
    const input = packets(frozen);
    input.execution.finalHoldoutAccessed = true;

    expect(() =>
      buildCCFRollingValidationReadinessAudit({
        protocol: frozen,
        ...input,
      }),
    ).toThrow(/sealed-holdout certification-only execution/);
  });

  it("fingerprints identical evidence coverage deterministically", () => {
    const frozen = protocol();
    const input = {
      protocol: frozen,
      ...packets(frozen),
    };
    expect(
      buildCCFRollingValidationReadinessAudit(input).auditRef,
    ).toBe(
      buildCCFRollingValidationReadinessAudit(input).auditRef,
    );
  });
});
