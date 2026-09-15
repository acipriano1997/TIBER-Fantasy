import crypto from "crypto";
import {
  validateCCFChronologicalSplitConfig,
  type CCFChronologicalSplitConfig,
} from "./chronologicalSplit";

export type CCFPredictiveTarget =
  | "fantasy_points"
  | "play_probability"
  | "snap_share"
  | "route_participation"
  | "target_share"
  | "touch_opportunity"
  | "boom_probability"
  | "bust_probability"
  | "pairwise_outscore_probability"
  | "lineup_utility";

export type CCFPredictiveValidationArm =
  | "native_candidate"
  | "historical_mean"
  | "recent_mean"
  | "usage_rate"
  | "previous_ccf"
  | "market_challenger"
  | "expert_challenger"
  | "tiber_challenger"
  | "diagnostic_oracle";

export type CCFPredictiveMetric =
  | "mae"
  | "rmse"
  | "rank_spearman"
  | "rank_kendall"
  | "brier"
  | "log_loss"
  | "expected_calibration_error"
  | "interval_coverage"
  | "pinball_loss"
  | "lineup_regret"
  | "decision_win_rate"
  | "abstention_selectivity"
  | "paired_loss_improvement";

export type CCFPredictiveSubgroupDimension =
  | "position"
  | "season"
  | "week_band"
  | "scoring_format"
  | "role_tier"
  | "injury_readiness_context"
  | "team_environment"
  | "market_disagreement"
  | "uncertainty_band"
  | "season_era";

export type CCFAntiLeakageControl =
  | "post_cutoff_evidence_rejected"
  | "future_correction_rejected"
  | "current_depth_chart_backfill_rejected"
  | "closing_market_leakage_rejected"
  | "outcome_field_mutation_invariant"
  | "identity_join_leakage_rejected"
  | "missing_outcome_not_negative";

export type CCFNegativeControl =
  | "label_permutation"
  | "future_feature_canary"
  | "random_noise_feature";

export interface CCFPredictiveSamplePolicy {
  minimumOverallPairedRows: number;
  minimumSubgroupRows: number;
  minimumIndependentTimeBlocks: number;
  underpoweredSubgroupTreatment: "report_only" | "pool" | "exclude_from_promotion";
}

export interface CCFPredictiveUncertaintyPolicy {
  method: "paired_block_bootstrap";
  blockUnit: "season_week" | "week" | "season";
  iterations: number;
  confidenceLevel: number;
  deterministicSeed: string;
  multiplicityPolicy: "primary_metrics_only" | "familywise_primary_metrics";
}

export interface CCFPredictivePromotionCriterion {
  criterionId: string;
  target: CCFPredictiveTarget;
  metric: CCFPredictiveMetric;
  comparatorArm: CCFPredictiveValidationArm;
  candidateArm: "native_candidate";
  direction: "lower_is_better" | "higher_is_better";
  minimumAbsoluteImprovement: number | null;
  minimumRelativeImprovement: number | null;
  confidenceLowerBoundMustBeatZero: boolean;
  appliesTo: "overall" | "supported_subgroups" | "both";
}

export interface CCFPredictiveValidationProtocol {
  contractVersion: "ccf-predictive-validation-protocol-v1";
  protocolId: string;
  frozenAt: string;
  modelVersion: string;
  datasetFingerprint: string;
  sourcePlanFingerprint: string;
  scoringProfileFingerprint: string;
  featureSetFingerprint: string;
  decisionPolicyFingerprint: string;
  supportedPopulation: string;
  split: CCFChronologicalSplitConfig;
  targets: CCFPredictiveTarget[];
  arms: CCFPredictiveValidationArm[];
  primaryMetrics: CCFPredictiveMetric[];
  secondaryMetrics: CCFPredictiveMetric[];
  subgroupDimensions: CCFPredictiveSubgroupDimension[];
  featureFamilies: string[];
  ablationModes: Array<"leave_one_family_out" | "single_family_only">;
  antiLeakageControls: CCFAntiLeakageControl[];
  negativeControls: CCFNegativeControl[];
  samplePolicy: CCFPredictiveSamplePolicy;
  uncertaintyPolicy: CCFPredictiveUncertaintyPolicy;
  promotionCriteria: CCFPredictivePromotionCriterion[];
  outcomeAccessedBeforeFreeze: false;
  oneTouchFinalHoldoutRequired: boolean;
  freezeNativeBeforeChallengerRequired: boolean;
  tiberOffRequired: boolean;
  failedCandidateRetentionRequired: boolean;
  appendOnlyLedgerRequired: boolean;
  externalEvidenceCannotMutateFrozenPacket: boolean;
  notes: string[];
}

export class CCFPredictiveValidationProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFPredictiveValidationProtocolError";
  }
}

const REQUIRED_NATIVE_ARMS: readonly CCFPredictiveValidationArm[] = [
  "native_candidate",
  "historical_mean",
  "recent_mean",
  "usage_rate",
];

const REQUIRED_ANTI_LEAKAGE_CONTROLS: readonly CCFAntiLeakageControl[] = [
  "post_cutoff_evidence_rejected",
  "future_correction_rejected",
  "current_depth_chart_backfill_rejected",
  "closing_market_leakage_rejected",
  "outcome_field_mutation_invariant",
  "identity_join_leakage_rejected",
  "missing_outcome_not_negative",
];

const REQUIRED_NEGATIVE_CONTROLS: readonly CCFNegativeControl[] = [
  "label_permutation",
  "future_feature_canary",
];

function requireText(label: string, value: string): void {
  if (!value.trim()) throw new CCFPredictiveValidationProtocolError(`${label} is required`);
}

function requireTimestamp(label: string, value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new CCFPredictiveValidationProtocolError(`${label} must be a valid timestamp`);
  }
}

function requirePositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CCFPredictiveValidationProtocolError(`${label} must be a positive integer`);
  }
}

function requireUniqueNonEmpty<T extends string>(label: string, values: readonly T[]): void {
  if (values.length === 0) {
    throw new CCFPredictiveValidationProtocolError(`${label} must not be empty`);
  }
  if (new Set(values).size !== values.length) {
    throw new CCFPredictiveValidationProtocolError(`${label} contains duplicate values`);
  }
}

function requireThreshold(label: string, value: number | null): void {
  if (value != null && !Number.isFinite(value)) {
    throw new CCFPredictiveValidationProtocolError(`${label} must be finite when provided`);
  }
}

function requireIncludes<T extends string>(
  label: string,
  values: readonly T[],
  required: readonly T[],
): void {
  for (const value of required) {
    if (!values.includes(value)) {
      throw new CCFPredictiveValidationProtocolError(`${label} must include ${value}`);
    }
  }
}

export function validateCCFPredictiveValidationProtocol(
  protocol: CCFPredictiveValidationProtocol,
): CCFPredictiveValidationProtocol {
  if (protocol.contractVersion !== "ccf-predictive-validation-protocol-v1") {
    throw new CCFPredictiveValidationProtocolError("unsupported predictive validation protocol version");
  }

  for (const [label, value] of [
    ["protocolId", protocol.protocolId],
    ["modelVersion", protocol.modelVersion],
    ["datasetFingerprint", protocol.datasetFingerprint],
    ["sourcePlanFingerprint", protocol.sourcePlanFingerprint],
    ["scoringProfileFingerprint", protocol.scoringProfileFingerprint],
    ["featureSetFingerprint", protocol.featureSetFingerprint],
    ["decisionPolicyFingerprint", protocol.decisionPolicyFingerprint],
    ["supportedPopulation", protocol.supportedPopulation],
  ] as const) {
    requireText(label, value);
  }
  requireTimestamp("frozenAt", protocol.frozenAt);

  validateCCFChronologicalSplitConfig(protocol.split);
  if (!protocol.split.validation || !protocol.split.test) {
    throw new CCFPredictiveValidationProtocolError(
      "production predictive validation requires frozen validation and final test windows",
    );
  }

  requireUniqueNonEmpty("targets", protocol.targets);
  requireUniqueNonEmpty("arms", protocol.arms);
  requireIncludes("arms", protocol.arms, REQUIRED_NATIVE_ARMS);
  requireUniqueNonEmpty("primaryMetrics", protocol.primaryMetrics);
  if (new Set(protocol.secondaryMetrics).size !== protocol.secondaryMetrics.length) {
    throw new CCFPredictiveValidationProtocolError("secondaryMetrics contains duplicate values");
  }
  if (protocol.secondaryMetrics.some((metric) => protocol.primaryMetrics.includes(metric))) {
    throw new CCFPredictiveValidationProtocolError("primary and secondary metrics must not overlap");
  }
  requireUniqueNonEmpty("subgroupDimensions", protocol.subgroupDimensions);
  requireUniqueNonEmpty("featureFamilies", protocol.featureFamilies);
  requireUniqueNonEmpty("ablationModes", protocol.ablationModes);
  requireUniqueNonEmpty("antiLeakageControls", protocol.antiLeakageControls);
  requireIncludes(
    "antiLeakageControls",
    protocol.antiLeakageControls,
    REQUIRED_ANTI_LEAKAGE_CONTROLS,
  );
  requireUniqueNonEmpty("negativeControls", protocol.negativeControls);
  requireIncludes("negativeControls", protocol.negativeControls, REQUIRED_NEGATIVE_CONTROLS);

  requirePositiveInteger(
    "samplePolicy.minimumOverallPairedRows",
    protocol.samplePolicy.minimumOverallPairedRows,
  );
  requirePositiveInteger(
    "samplePolicy.minimumSubgroupRows",
    protocol.samplePolicy.minimumSubgroupRows,
  );
  requirePositiveInteger(
    "samplePolicy.minimumIndependentTimeBlocks",
    protocol.samplePolicy.minimumIndependentTimeBlocks,
  );

  if (protocol.uncertaintyPolicy.method !== "paired_block_bootstrap") {
    throw new CCFPredictiveValidationProtocolError("paired block bootstrap is required for v1");
  }
  requirePositiveInteger("uncertaintyPolicy.iterations", protocol.uncertaintyPolicy.iterations);
  if (protocol.uncertaintyPolicy.iterations < 1000) {
    throw new CCFPredictiveValidationProtocolError(
      "uncertaintyPolicy.iterations must be at least 1000 for promotion evaluation",
    );
  }
  if (
    !Number.isFinite(protocol.uncertaintyPolicy.confidenceLevel) ||
    protocol.uncertaintyPolicy.confidenceLevel < 0.8 ||
    protocol.uncertaintyPolicy.confidenceLevel >= 1
  ) {
    throw new CCFPredictiveValidationProtocolError(
      "uncertaintyPolicy.confidenceLevel must be at least 0.8 and less than 1",
    );
  }
  requireText("uncertaintyPolicy.deterministicSeed", protocol.uncertaintyPolicy.deterministicSeed);

  if (protocol.promotionCriteria.length === 0) {
    throw new CCFPredictiveValidationProtocolError(
      "promotionCriteria must be predeclared before final evaluation",
    );
  }
  const criterionIds = new Set<string>();
  for (const criterion of protocol.promotionCriteria) {
    requireText("promotion criterionId", criterion.criterionId);
    if (criterionIds.has(criterion.criterionId)) {
      throw new CCFPredictiveValidationProtocolError(
        `duplicate promotion criterionId ${criterion.criterionId}`,
      );
    }
    criterionIds.add(criterion.criterionId);
    if (!protocol.targets.includes(criterion.target)) {
      throw new CCFPredictiveValidationProtocolError(
        `${criterion.criterionId} target is not present in protocol targets`,
      );
    }
    if (!protocol.primaryMetrics.includes(criterion.metric)) {
      throw new CCFPredictiveValidationProtocolError(
        `${criterion.criterionId} metric must be a primary metric`,
      );
    }
    if (!protocol.arms.includes(criterion.comparatorArm)) {
      throw new CCFPredictiveValidationProtocolError(
        `${criterion.criterionId} comparatorArm is not present in protocol arms`,
      );
    }
    if (criterion.comparatorArm === criterion.candidateArm) {
      throw new CCFPredictiveValidationProtocolError(
        `${criterion.criterionId} comparator and candidate arms must differ`,
      );
    }
    requireThreshold(
      `${criterion.criterionId}.minimumAbsoluteImprovement`,
      criterion.minimumAbsoluteImprovement,
    );
    requireThreshold(
      `${criterion.criterionId}.minimumRelativeImprovement`,
      criterion.minimumRelativeImprovement,
    );
    if (
      criterion.minimumAbsoluteImprovement == null &&
      criterion.minimumRelativeImprovement == null
    ) {
      throw new CCFPredictiveValidationProtocolError(
        `${criterion.criterionId} must predeclare at least one promotion threshold`,
      );
    }
  }

  const requiredTruths: Array<[string, boolean]> = [
    ["oneTouchFinalHoldoutRequired", protocol.oneTouchFinalHoldoutRequired],
    ["freezeNativeBeforeChallengerRequired", protocol.freezeNativeBeforeChallengerRequired],
    ["tiberOffRequired", protocol.tiberOffRequired],
    ["failedCandidateRetentionRequired", protocol.failedCandidateRetentionRequired],
    ["appendOnlyLedgerRequired", protocol.appendOnlyLedgerRequired],
    ["externalEvidenceCannotMutateFrozenPacket", protocol.externalEvidenceCannotMutateFrozenPacket],
  ];
  for (const [label, value] of requiredTruths) {
    if (!value) {
      throw new CCFPredictiveValidationProtocolError(`${label} must be true for promotion evaluation`);
    }
  }

  return protocol;
}

export function fingerprintCCFPredictiveValidationProtocol(
  protocol: CCFPredictiveValidationProtocol,
): string {
  validateCCFPredictiveValidationProtocol(protocol);
  const canonical = JSON.stringify({
    ...protocol,
    targets: [...protocol.targets].sort(),
    arms: [...protocol.arms].sort(),
    primaryMetrics: [...protocol.primaryMetrics].sort(),
    secondaryMetrics: [...protocol.secondaryMetrics].sort(),
    subgroupDimensions: [...protocol.subgroupDimensions].sort(),
    featureFamilies: [...protocol.featureFamilies].sort(),
    ablationModes: [...protocol.ablationModes].sort(),
    antiLeakageControls: [...protocol.antiLeakageControls].sort(),
    negativeControls: [...protocol.negativeControls].sort(),
    promotionCriteria: [...protocol.promotionCriteria].sort((left, right) =>
      left.criterionId.localeCompare(right.criterionId),
    ),
    notes: [...protocol.notes],
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
