import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "../predictiveValidationProtocol";
import { evaluateCCFPairedBlockBootstrap } from "../pairedUncertainty";
import { evaluateCCFDecisionRegret } from "../decisionRegret";
import {
  summarizeCCFMissAttributions,
  validateCCFMissAttributionRecord,
  type CCFMissAttributionRecord,
} from "../missAttribution";
import {
  buildCCFFeatureAblationPlan,
  fingerprintCCFFeatureAblationPlan,
  validateCCFFeatureAblationPlan,
} from "../featureAblation";

function protocol(
  overrides: Partial<CCFPredictiveValidationProtocol> = {},
): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "ccf-weekly-outcomes-v1",
    frozenAt: "2026-09-15T05:30:00Z",
    modelVersion: "ccf-candidate-fixture-v1",
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
    ...overrides,
  };
}

describe("CCF-wide predictive validation protocol", () => {
  it("accepts a frozen leakage-safe promotion protocol", () => {
    expect(validateCCFPredictiveValidationProtocol(protocol())).toEqual(protocol());
  });

  it("requires validation and one-touch final holdout windows", () => {
    expect(() =>
      validateCCFPredictiveValidationProtocol(
        protocol({
          split: {
            train: {
              start: { season: 2021, week: 1 },
              end: { season: 2025, week: 18 },
            },
            test: {
              start: { season: 2026, week: 1 },
              end: { season: 2026, week: 18 },
            },
          },
        }),
      ),
    ).toThrow(/validation and final test windows/);
    expect(() =>
      validateCCFPredictiveValidationProtocol(
        protocol({ oneTouchFinalHoldoutRequired: false }),
      ),
    ).toThrow(/oneTouchFinalHoldoutRequired/);
  });

  it("requires simple native baselines, anti-leakage canaries, and TIBER-off replay", () => {
    expect(() =>
      validateCCFPredictiveValidationProtocol(
        protocol({ arms: ["native_candidate", "historical_mean", "recent_mean"] }),
      ),
    ).toThrow(/usage_rate/);
    expect(() =>
      validateCCFPredictiveValidationProtocol(
        protocol({ antiLeakageControls: ["post_cutoff_evidence_rejected"] }),
      ),
    ).toThrow(/future_correction_rejected/);
    expect(() =>
      validateCCFPredictiveValidationProtocol(
        protocol({ negativeControls: ["random_noise_feature"] }),
      ),
    ).toThrow(/label_permutation/);
    expect(() =>
      validateCCFPredictiveValidationProtocol(protocol({ tiberOffRequired: false })),
    ).toThrow(/tiberOffRequired/);
  });

  it("fingerprints equivalent set-like protocol fields deterministically", () => {
    const first = protocol();
    const reordered = {
      ...first,
      targets: [...first.targets].reverse(),
      arms: [...first.arms].reverse(),
      primaryMetrics: [...first.primaryMetrics].reverse(),
      secondaryMetrics: [...first.secondaryMetrics].reverse(),
      subgroupDimensions: [...first.subgroupDimensions].reverse(),
      featureFamilies: [...first.featureFamilies].reverse(),
      ablationModes: [...first.ablationModes].reverse(),
      antiLeakageControls: [...first.antiLeakageControls].reverse(),
      negativeControls: [...first.negativeControls].reverse(),
      promotionCriteria: [...first.promotionCriteria].reverse(),
    };
    expect(fingerprintCCFPredictiveValidationProtocol(first)).toBe(
      fingerprintCCFPredictiveValidationProtocol(reordered),
    );
  });
});

describe("paired block uncertainty", () => {
  const rows = [
    { blockId: "2024-W1", candidateLoss: 1, comparatorLoss: 3 },
    { blockId: "2024-W1", candidateLoss: 2, comparatorLoss: 4 },
    { blockId: "2024-W2", candidateLoss: 1, comparatorLoss: 2.5 },
    { blockId: "2024-W2", candidateLoss: 1.5, comparatorLoss: 3 },
    { blockId: "2024-W3", candidateLoss: 2, comparatorLoss: 3.5 },
  ];

  it("preserves time-block dependence and returns deterministic paired uncertainty", () => {
    const first = evaluateCCFPairedBlockBootstrap(rows, {
      iterations: 1000,
      seed: "fixture-seed",
    });
    const second = evaluateCCFPairedBlockBootstrap(rows, {
      iterations: 1000,
      seed: "fixture-seed",
    });
    expect(second).toEqual(first);
    expect(first.independentBlockCount).toBe(3);
    expect(first.meanImprovement).toBeGreaterThan(0);
    expect(first.confidenceLower).toBeGreaterThan(0);
    expect(first.probabilityCandidateBetter).toBe(1);
  });

  it("refuses to manufacture interval certainty from one independent block", () => {
    const result = evaluateCCFPairedBlockBootstrap(
      rows.filter((row) => row.blockId === "2024-W1"),
      { iterations: 1000 },
    );
    expect(result.independentBlockCount).toBe(1);
    expect(result.confidenceLower).toBeNull();
    expect(result.probabilityCandidateBetter).toBeNull();
  });
});

describe("decision regret", () => {
  it("distinguishes optimal choices, regret magnitude, catastrophic misses, and abstention", () => {
    const metrics = evaluateCCFDecisionRegret(
      [
        {
          decisionId: "d1",
          chosenRealizedUtility: 20,
          bestFeasibleRealizedUtility: 20,
          feasibleAlternativeCount: 2,
          abstained: false,
        },
        {
          decisionId: "d2",
          chosenRealizedUtility: 8,
          bestFeasibleRealizedUtility: 22,
          feasibleAlternativeCount: 3,
          abstained: false,
        },
        {
          decisionId: "d3",
          chosenRealizedUtility: null,
          bestFeasibleRealizedUtility: null,
          feasibleAlternativeCount: 0,
          abstained: true,
        },
      ],
      10,
    );

    expect(metrics.evaluatedDecisionCount).toBe(2);
    expect(metrics.abstentionRate).toBeCloseTo(1 / 3);
    expect(metrics.meanRegret).toBe(7);
    expect(metrics.zeroRegretRate).toBe(0.5);
    expect(metrics.catastrophicRegretRate).toBe(0.5);
  });

  it("fails closed when the claimed best feasible outcome is worse than the chosen one", () => {
    expect(() =>
      evaluateCCFDecisionRegret([
        {
          decisionId: "invalid",
          chosenRealizedUtility: 15,
          bestFeasibleRealizedUtility: 10,
          feasibleAlternativeCount: 1,
          abstained: false,
        },
      ]),
    ).toThrow(/cannot be below chosenRealizedUtility/);
  });
});

function attribution(
  overrides: Partial<CCFMissAttributionRecord> = {},
): CCFMissAttributionRecord {
  return {
    contractVersion: "ccf-miss-attribution-v1",
    attributionId: "attr-1",
    decisionReceiptId: "decision-1",
    outcomeKnownAt: "2026-09-14T23:00:00Z",
    attributedAt: "2026-09-15T00:00:00Z",
    primaryCause: "evidence_error",
    contributingCauses: ["late_breaking_evidence"],
    severity: "major",
    realizedRegret: 12,
    absolutePredictionError: 8,
    evidenceRefs: ["decision://decision-1"],
    reviewStatus: "automated_preliminary",
    modelUpdateAuthorized: false,
    notes: [],
    ...overrides,
  };
}

describe("miss attribution", () => {
  it("keeps post-outcome diagnosis separate from model-update authority", () => {
    expect(validateCCFMissAttributionRecord(attribution())).toEqual(attribution());
    expect(() =>
      validateCCFMissAttributionRecord({
        ...attribution(),
        modelUpdateAuthorized: true as false,
      }),
    ).toThrow(/cannot itself authorize a model update/);
  });

  it("summarizes miss frequency and regret by causal class", () => {
    const summary = summarizeCCFMissAttributions([
      attribution(),
      attribution({
        attributionId: "attr-2",
        decisionReceiptId: "decision-2",
        primaryCause: "model_error",
        realizedRegret: 4,
        severity: "material",
      }),
    ]);
    expect(summary.totalRecords).toBe(2);
    expect(summary.rows.find((row) => row.cause === "evidence_error")?.totalRegret).toBe(12);
    expect(summary.rows.find((row) => row.cause === "model_error")?.count).toBe(1);
  });
});

describe("feature ablation plans", () => {
  it("builds deterministic full, leave-one-out, and single-family controls", () => {
    const first = buildCCFFeatureAblationPlan("feature-set-v1", ["usage", "weather", "role"]);
    const second = buildCCFFeatureAblationPlan("feature-set-v1", ["role", "usage", "weather"]);
    expect(validateCCFFeatureAblationPlan(first)).toEqual(first);
    expect(first.variants.map((variant) => variant.variantId)).toContain("without:weather");
    expect(first.variants.map((variant) => variant.variantId)).toContain("only:usage");
    expect(fingerprintCCFFeatureAblationPlan(first)).toBe(
      fingerprintCCFFeatureAblationPlan(second),
    );
  });
});
