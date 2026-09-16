export type CCFTiberSourceSystem =
  | "TIBER-Forecast"
  | "TIBER-Data"
  | "TIBER-Rookies"
  | "TIBER-Fantasy/FORGE";

export type CCFCapabilityScope =
  | "weekly_outcome"
  | "ros_seasonal"
  | "decision_value"
  | "rookie_devy"
  | "data_governance"
  | "cross_cutting";

export type CCFCapabilityDisposition =
  | "rebuild_native"
  | "native_equivalent"
  | "challenger_only"
  | "intentionally_retire";

export type CCFCapabilityMigrationStatus =
  | "native_certified"
  | "native_partial"
  | "rebuild_required"
  | "challenger_only"
  | "intentionally_retired";

export type CCFCapabilityPromotionEvidence =
  | "native_implementation"
  | "point_in_time_data"
  | "chronological_oos"
  | "calibration"
  | "ablation"
  | "subgroup_stability"
  | "tiber_off";

export interface CCFTiberCapabilityMigrationRecord {
  id: string;
  sourceSystem: CCFTiberSourceSystem;
  sourceCapability: string;
  sourceEvidence: readonly string[];
  scope: CCFCapabilityScope;
  disposition: CCFCapabilityDisposition;
  status: CCFCapabilityMigrationStatus;
  ccfOwner: string;
  requiredForUniversalCCF: boolean;
  promotionEvidenceRequired: readonly CCFCapabilityPromotionEvidence[];
  note: string;
}

/**
 * CCF capability-mining registry.
 *
 * This is intentionally mechanism-oriented. CCF may learn from a TIBER design,
 * but recommendation-critical TIBER outputs, fitted weights, grades, rankings,
 * probabilities, and opaque scores are not copied into CCF_NATIVE authority.
 * A `native_certified` status means an independent CCF implementation has the
 * required evidence below; code parity by itself is insufficient.
 */
export const CCF_TIBER_CAPABILITY_MIGRATION_V0: readonly CCFTiberCapabilityMigrationRecord[] = [
  {
    id: "forecast-exact-scoring",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "exact configurable fantasy scoring and scoring-profile binding",
    sourceEvidence: ["src/contracts/scoring.ts", "src/transforms/tiberScoring.ts"],
    scope: "cross_cutting",
    disposition: "native_equivalent",
    status: "native_certified",
    ccfOwner: "server/modules/ccf/scoring",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "tiber_off"],
    note: "CCF owns scoring coefficients, bonuses, validation, and stable scoring fingerprints.",
  },
  {
    id: "forecast-distribution-tail-contract",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "range/interval outputs, uncertainty-aware player cards, and bounded confidence",
    sourceEvidence: [
      "src/calculators/range/calculateRangeProfile.ts",
      "src/calculators/range/calculateStabilityScore.ts",
      "src/contracts/fantasyForecastWeeklyPlayerV1.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF Player Outcome Engine",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "CCF has the quantile/probability/abstention contract, but the current fixture engine is not a calibrated production distribution.",
  },
  {
    id: "forecast-xfpg-opportunity",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "position-aware expected fantasy points from opportunity",
    sourceEvidence: [
      "src/calculators/xfpg/calculateExpectedPoints.ts",
      "src/calculators/xfpg/calculateQbXfpg.ts",
      "src/calculators/xfpg/calculateRbXfpg.ts",
      "src/calculators/xfpg/calculatePassCatcherXfpg.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF role/opportunity + expected-points feature layer",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "tiber_off",
    ],
    note: "Rebuild from CCF-owned play-by-play/opportunity facts; do not import Forecast xFPG as a critical feature.",
  },
  {
    id: "forecast-feature-families",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "usage, efficiency, matchup, team-context, event-context, and player-arc feature families",
    sourceEvidence: [
      "src/features/builders/buildUsageFeatures.ts",
      "src/features/builders/buildEfficiencyFeatures.ts",
      "src/features/builders/buildMatchupFeatures.ts",
      "src/features/builders/buildTeamContextFeatures.ts",
      "src/features/builders/buildEventContextFeatures.ts",
      "src/features/builders/buildPlayerArcFeatures.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF native feature spine",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "tiber_off",
    ],
    note: "CCF has feature-evidence contracts and a first raw-stat adapter, not the complete production feature producers.",
  },
  {
    id: "forecast-regression-diagnostics",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "efficiency fragility, touchdown regression, usage-production gap, volume stability, and stickiness diagnostics",
    sourceEvidence: [
      "src/diagnostics/scoring/scoreEfficiencyFragility.ts",
      "src/diagnostics/scoring/scoreTdRegressionRisk.ts",
      "src/diagnostics/scoring/scoreUsageProductionGap.ts",
      "src/diagnostics/scoring/scoreVolumeStability.ts",
      "src/diagnostics/scoring/scoreProjectionStickiness.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF regression/fragility feature family",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "Preserve the mechanisms only if unseen-data ablations show incremental value; do not copy heuristic scores or weights.",
  },
  {
    id: "forecast-residual-uncertainty",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "context-bucketed residual bands and prediction intervals",
    sourceEvidence: [
      "src/models_ml/uncertainty/estimateResidualBands.ts",
      "src/models_ml/uncertainty/bucketPredictionContext.ts",
      "src/models_ml/uncertainty/assignPredictionInterval.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF calibration/uncertainty layer",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "CCF needs empirically calibrated residual/tail behavior rather than fixture-supplied volatility.",
  },
  {
    id: "forecast-calibration-reliability",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "calibration tables and reliability evaluation",
    sourceEvidence: [
      "src/models_ml/calibration/buildCalibrationTable.ts",
      "src/models_ml/calibration/buildReliabilityReport.ts",
      "src/models_ml/calibration/evaluateCalibration.ts",
    ],
    scope: "cross_cutting",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF model certification/calibration",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "Gate probability/quantile claims on measured reliability by position, scoring cohort, and decision context.",
  },
  {
    id: "forecast-time-series-backtest",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "chronological/time-series splits, rolling backtest windows, and report generation",
    sourceEvidence: [
      "src/datasets/splits/timeSeriesSplit.ts",
      "src/datasets/splits/rollingBacktestWindows.ts",
      "src/datasets/evaluation/evaluatePredictions.ts",
      "src/datasets/evaluation/generateBacktestReport.ts",
    ],
    scope: "cross_cutting",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF historical certification harness",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "tiber_off",
    ],
    note: "This is a hard promotion gate; random or hindsight-contaminated splits cannot certify CCF.",
  },
  {
    id: "forecast-simple-benchmarks",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "mean, recent-trend, and usage-only benchmark models",
    sourceEvidence: [
      "src/datasets/benchmarks/baselineMeanModel.ts",
      "src/datasets/benchmarks/baselineRecentTrendModel.ts",
      "src/datasets/benchmarks/baselineUsageModel.ts",
      "src/models_ml/evaluation/evaluateModelAgainstBenchmarks.ts",
    ],
    scope: "cross_cutting",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF challenger/backtest harness",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "chronological_oos", "tiber_off"],
    note: "The production model must beat deliberately simpler baselines rather than merely look sophisticated.",
  },
  {
    id: "forecast-subgroup-stability",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "subgroup stability evaluation",
    sourceEvidence: [
      "src/models_ml/subgroup/evaluateSubgroupStability.ts",
      "src/models_ml/subgroup/subgroupDefinitions.ts",
    ],
    scope: "cross_cutting",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF model certification harness",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "chronological_oos", "subgroup_stability", "tiber_off"],
    note: "Require performance and calibration checks across positions and materially different usage/experience cohorts.",
  },
  {
    id: "forecast-scenario-fusion",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "bounded scenario fusion with recomputed intervals and diagnostics",
    sourceEvidence: [
      "src/fusion/core/fuseScenarioWithModel.ts",
      "src/fusion/core/recomputeIntervalsAfterFusion.ts",
      "src/fusion/core/recomputeDiagnosticsAfterFusion.ts",
      "src/fusion/policies/applyBoundedFusion.ts",
    ],
    scope: "weekly_outcome",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF scenario/update engine",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "tiber_off",
    ],
    note: "Useful for injuries, role changes, signings, trades, and weather; CCF should update distributions rather than bolt on uncalibrated point deltas.",
  },
  {
    id: "forecast-replacement-vorp",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "replacement baselines and value over replacement",
    sourceEvidence: [
      "src/calculators/replacement/calculateReplacementBaselines.ts",
      "src/calculators/replacement/buildDefaultReplacementPoints.ts",
      "src/calculators/vorp/calculateVorp.ts",
    ],
    scope: "decision_value",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF replacement/value layer",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "chronological_oos", "ablation", "tiber_off"],
    note: "Replacement should be league/roster/scoring-aware; static Forecast defaults must not be copied as universal truth.",
  },
  {
    id: "forecast-ros-seasonal",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "rest-of-season/seasonal modeling separated from weekly scoring",
    sourceEvidence: [
      "src/models/seasonal/seasonalPprModel.ts",
      "src/models/seasonal/forwardRidgeModel.ts",
      "src/services/scoring/scoreRosService.ts",
    ],
    scope: "ros_seasonal",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF ROS Player Outcome Engine",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "Weekly and ROS horizons should share evidence but retain separately validated targets and calibration.",
  },
  {
    id: "forecast-consensus-edge",
    sourceSystem: "TIBER-Forecast",
    sourceCapability: "comparison to consensus and trust-adjusted market edge",
    sourceEvidence: [
      "src/market/scoring/compareToConsensus.ts",
      "src/market/scoring/scoreTrustAdjustedEdge.ts",
    ],
    scope: "decision_value",
    disposition: "challenger_only",
    status: "challenger_only",
    ccfOwner: "CCF Expert/External Signal Engine",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note: "Keep the disagreement/edge concept; external consensus must never become native projection authority.",
  },
  {
    id: "data-identity-source-assertions",
    sourceSystem: "TIBER-Data",
    sourceCapability: "canonical identity, source assertions, and crosswalk discipline",
    sourceEvidence: [
      "contracts/tiber-system-flow-registry.v1.json",
      "TRUTH_SOURCES.md",
      "identity source-assertion/candidate registries",
    ],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF canonical identity + source spine",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note: "CCF has identity/provenance foundations, but the direct-source GSIS/provider crosswalk is not yet complete for native weekly authority.",
  },
  {
    id: "data-immutable-observation-receipts",
    sourceSystem: "TIBER-Data",
    sourceCapability: "raw observation receipts, manifests, checksums, source lineage, and temporal eligibility",
    sourceEvidence: ["TRUTH_SOURCES.md", "data manifests/provenance records", "source observation receipts"],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF source snapshots + canonical evidence envelope",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note: "CCF source snapshots preserve hashes and known time, but historical immutable coverage and richer source envelopes remain incomplete.",
  },
  {
    id: "data-candidate-promotion-lifecycle",
    sourceSystem: "TIBER-Data",
    sourceCapability: "candidate/promoted lifecycle with explicit unavailable semantics and auditable promotion evidence",
    sourceEvidence: ["data candidate/promoted registries", "manifests", "provenance artifacts"],
    scope: "data_governance",
    disposition: "rebuild_native",
    status: "native_partial",
    ccfOwner: "CCF evidence/model promotion governance",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "point_in_time_data", "tiber_off"],
    note: "Preserve the governance pattern while keeping CCF the authority for its own source/model promotion decisions.",
  },
  {
    id: "rookies-age-production",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "age-adjusted production, breakout age, year-over-year development, and production scoring",
    sourceEvidence: [
      "scripts/compute_age_adjusted_production.py",
      "scripts/compute_breakout_age.py",
      "scripts/compute_yoy_trends.py",
      "scripts/compute_production_scores.py",
    ],
    scope: "rookie_devy",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF rookie/devy translation model",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "Rebuild features from CCF-owned college/NFL evidence; do not copy Rookie Alpha weights as truth.",
  },
  {
    id: "rookies-historical-comps",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "historical comparable-player construction with governed reference populations",
    sourceEvidence: ["scripts/compute_historical_comps.py", "docs/historical-comps-contract.md"],
    scope: "rookie_devy",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF rookie/devy historical analogue challenger",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "tiber_off",
    ],
    note: "Comps should remain explanatory/challenger evidence unless their incremental predictive value is demonstrated out of sample.",
  },
  {
    id: "rookies-transition-profile",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "rookie transition profile separating prospect signal from NFL landing/role evidence",
    sourceEvidence: [
      "scripts/compute_rookie_transition_profile.py",
      "docs/rookie-transition-profile-contract.md",
      "docs/rookie-transition-profile-v0-design.md",
    ],
    scope: "rookie_devy",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF rookie/devy translation + transition layer",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "tiber_off",
    ],
    note: "Keep pre-draft talent and post-draft opportunity as inspectable mechanisms rather than one opaque score.",
  },
  {
    id: "rookies-landing-role-context",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "post-draft role/opportunity and team-context enrichment",
    sourceEvidence: [
      "scripts/enrich_post_draft_alpha_with_role_opportunity.py",
      "scripts/enrich_post_draft_alpha_with_team_context.py",
    ],
    scope: "rookie_devy",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF rookie transition + team opportunity layer",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "ablation",
      "tiber_off",
    ],
    note: "Use the concept, not the upstream Alpha enrichment values; CCF should derive role/team context from its own evidence spine.",
  },
  {
    id: "rookies-outcome-calibration",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "historical NFL fantasy outcome reconstruction and rookie signal calibration",
    sourceEvidence: ["docs/nfl-fantasy-outcome-calibration.md", "historical reconstruction contracts/artifacts"],
    scope: "rookie_devy",
    disposition: "rebuild_native",
    status: "rebuild_required",
    ccfOwner: "CCF rookie/devy historical certification harness",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: [
      "native_implementation",
      "point_in_time_data",
      "chronological_oos",
      "calibration",
      "subgroup_stability",
      "tiber_off",
    ],
    note: "Outcome labels and reference populations must be frozen before evaluation to avoid survivor/hindsight leakage.",
  },
  {
    id: "rookies-model-demotion-governance",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "explicit candidate-model evaluation, promotion, and demotion when an ML lane fails to earn authority",
    sourceEvidence: ["docs/migrations/2026-08-23-rookie-ml-lane-demotion.md", "experimental ML evaluation artifacts"],
    scope: "cross_cutting",
    disposition: "native_equivalent",
    status: "native_partial",
    ccfOwner: "CCF promotion/certification governance",
    requiredForUniversalCCF: true,
    promotionEvidenceRequired: ["native_implementation", "chronological_oos", "tiber_off"],
    note: "The governance principle is already present in CCF, but it must be exercised by the eventual production native model, not only by contracts/fixtures.",
  },
  {
    id: "rookies-alpha-output",
    sourceSystem: "TIBER-Rookies",
    sourceCapability: "Rookie Alpha final score/rank/weights",
    sourceEvidence: ["scripts/compute_rookie_alpha.py", "promoted rookie-alpha exports"],
    scope: "rookie_devy",
    disposition: "challenger_only",
    status: "challenger_only",
    ccfOwner: "CCF external/challenger evidence layer",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note: "Do not port the final Alpha score or fitted weighting into CCF_NATIVE; mine validated mechanisms and independently refit/revalidate them.",
  },
  {
    id: "forge-grade-rank-output",
    sourceSystem: "TIBER-Fantasy/FORGE",
    sourceCapability: "FORGE final grade/rank and legacy pillar weighting",
    sourceEvidence: ["server/modules/forge/**", "docs/architecture/FORGE_EXTERNALIZATION_TRANSITION_SPEC.md"],
    scope: "weekly_outcome",
    disposition: "challenger_only",
    status: "challenger_only",
    ccfOwner: "CCF external/challenger evidence layer",
    requiredForUniversalCCF: false,
    promotionEvidenceRequired: [],
    note: "Do not recreate the final FORGE authority. Individual mechanisms may be rebuilt only when source-backed and supported by CCF ablations.",
  },
] as const;

export function capabilityMigrationBlockers(
  registry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_TIBER_CAPABILITY_MIGRATION_V0,
): CCFTiberCapabilityMigrationRecord[] {
  return registry.filter(
    (record) => record.requiredForUniversalCCF && record.status !== "native_certified",
  );
}

export function canClaimTiberCapabilityMigrationComplete(
  registry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_TIBER_CAPABILITY_MIGRATION_V0,
): boolean {
  return capabilityMigrationBlockers(registry).length === 0;
}

export function assertNoTiberOutputPromotedAsNative(
  registry: readonly CCFTiberCapabilityMigrationRecord[] = CCF_TIBER_CAPABILITY_MIGRATION_V0,
): void {
  const invalid = registry.filter(
    (record) =>
      (record.disposition === "challenger_only" || record.disposition === "intentionally_retire") &&
      record.status === "native_certified",
  );

  if (invalid.length > 0) {
    throw new Error(
      `CCF capability migration illegally promoted non-native TIBER outputs: ${invalid
        .map((record) => record.id)
        .join(", ")}`,
    );
  }
}
