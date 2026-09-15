import crypto from "crypto";
import {
  validateCCFChronologicalSplitConfig,
  type CCFChronologicalSplitConfig,
} from "../certification/chronologicalSplit";

export type CCFRecoveryValidationQuestion =
  | "active_vs_workload_readiness"
  | "practice_progression_to_workload"
  | "role_evidence_vs_time_since_injury"
  | "return_to_performance_separation"
  | "position_interaction"
  | "treatment_or_procedure_interaction"
  | "setback_uncertainty";

export type CCFRecoveryValidationArm =
  | "native_baseline_no_recovery_features"
  | "eligible_raw_recovery_evidence"
  | "learned_recovery_features"
  | "legacy_or_external_challenger";

export type CCFRecoveryValidationMetric =
  | "fantasy_points_mae"
  | "fantasy_points_rmse"
  | "rank_spearman"
  | "interval_coverage"
  | "boom_bust_brier"
  | "lineup_regret"
  | "abstention_selectivity"
  | "snap_share_mae"
  | "route_participation_mae"
  | "touch_opportunity_mae";

export type CCFRecoverySubgroupDimension =
  | "position"
  | "injury_class"
  | "return_stage"
  | "week_since_return"
  | "age_band"
  | "scoring_format"
  | "role_tier"
  | "season_era";

export interface CCFRecoverySamplePolicy {
  minimumOverallPairedRows: number;
  minimumSubgroupRows: number;
  underpoweredSubgroupTreatment: "report_only" | "pool" | "exclude_from_promotion";
}

export interface CCFRecoveryPromotionCriterion {
  criterionId: string;
  metric: CCFRecoveryValidationMetric;
  comparatorArm: CCFRecoveryValidationArm;
  candidateArm: CCFRecoveryValidationArm;
  direction: "lower_is_better" | "higher_is_better";
  minimumAbsoluteImprovement: number | null;
  minimumRelativeImprovement: number | null;
  appliesTo: "overall" | "supported_subgroups" | "both";
}

export interface CCFRecoveryValidationProtocol {
  contractVersion: "ccf-recovery-validation-protocol-v1";
  protocolId: string;
  frozenAt: string;
  datasetFingerprint: string;
  sourceBindingPlanFingerprint: string;
  scoringProfileFingerprint: string;
  split: CCFChronologicalSplitConfig;
  questions: CCFRecoveryValidationQuestion[];
  arms: CCFRecoveryValidationArm[];
  primaryMetrics: CCFRecoveryValidationMetric[];
  secondaryMetrics: CCFRecoveryValidationMetric[];
  subgroupDimensions: CCFRecoverySubgroupDimension[];
  samplePolicy: CCFRecoverySamplePolicy;
  promotionCriteria: CCFRecoveryPromotionCriterion[];
  outcomeAccessedBeforeFreeze: false;
  tiberOffRequired: boolean;
  failedCandidateRetentionRequired: boolean;
  notes: string[];
}

export class CCFRecoveryValidationProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRecoveryValidationProtocolError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRecoveryValidationProtocolError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requireText(label: string, value: string): void {
  if (!value.trim()) throw new CCFRecoveryValidationProtocolError(`${label} is required`);
}

function assertUnique<T extends string>(label: string, values: readonly T[]): void {
  if (values.length === 0) {
    throw new CCFRecoveryValidationProtocolError(`${label} must not be empty`);
  }
  if (new Set(values).size !== values.length) {
    throw new CCFRecoveryValidationProtocolError(`${label} contains duplicate values`);
  }
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CCFRecoveryValidationProtocolError(`${label} must be a positive integer`);
  }
}

function assertFiniteThreshold(label: string, value: number | null): void {
  if (value != null && !Number.isFinite(value)) {
    throw new CCFRecoveryValidationProtocolError(`${label} must be finite when provided`);
  }
}

export function validateCCFRecoveryValidationProtocol(
  protocol: CCFRecoveryValidationProtocol,
): CCFRecoveryValidationProtocol {
  if (protocol.contractVersion !== "ccf-recovery-validation-protocol-v1") {
    throw new CCFRecoveryValidationProtocolError("unsupported recovery validation protocol version");
  }
  requireText("protocolId", protocol.protocolId);
  parseTimestamp("frozenAt", protocol.frozenAt);
  requireText("datasetFingerprint", protocol.datasetFingerprint);
  requireText("sourceBindingPlanFingerprint", protocol.sourceBindingPlanFingerprint);
  requireText("scoringProfileFingerprint", protocol.scoringProfileFingerprint);
  validateCCFChronologicalSplitConfig(protocol.split);
  if (!protocol.split.test) {
    throw new CCFRecoveryValidationProtocolError("a frozen recovery validation protocol requires a held-out test window");
  }

  assertUnique("questions", protocol.questions);
  assertUnique("arms", protocol.arms);
  assertUnique("primaryMetrics", protocol.primaryMetrics);
  if (new Set(protocol.secondaryMetrics).size !== protocol.secondaryMetrics.length) {
    throw new CCFRecoveryValidationProtocolError("secondaryMetrics contains duplicate values");
  }
  if (protocol.secondaryMetrics.some((metric) => protocol.primaryMetrics.includes(metric))) {
    throw new CCFRecoveryValidationProtocolError("primary and secondary metrics must not overlap");
  }
  assertUnique("subgroupDimensions", protocol.subgroupDimensions);

  if (!protocol.arms.includes("native_baseline_no_recovery_features")) {
    throw new CCFRecoveryValidationProtocolError("protocol must include the native no-recovery baseline arm");
  }
  if (!protocol.arms.includes("eligible_raw_recovery_evidence")) {
    throw new CCFRecoveryValidationProtocolError("protocol must include the eligible raw-recovery-evidence arm");
  }
  if (!protocol.arms.includes("learned_recovery_features")) {
    throw new CCFRecoveryValidationProtocolError("protocol must include the learned-recovery-features arm");
  }

  assertPositiveInteger("samplePolicy.minimumOverallPairedRows", protocol.samplePolicy.minimumOverallPairedRows);
  assertPositiveInteger("samplePolicy.minimumSubgroupRows", protocol.samplePolicy.minimumSubgroupRows);

  if (protocol.promotionCriteria.length === 0) {
    throw new CCFRecoveryValidationProtocolError("promotionCriteria must be predeclared before evaluation");
  }

  const criterionIds = new Set<string>();
  for (const criterion of protocol.promotionCriteria) {
    requireText("promotion criterionId", criterion.criterionId);
    if (criterionIds.has(criterion.criterionId)) {
      throw new CCFRecoveryValidationProtocolError(`duplicate promotion criterionId ${criterion.criterionId}`);
    }
    criterionIds.add(criterion.criterionId);
    if (!protocol.arms.includes(criterion.comparatorArm)) {
      throw new CCFRecoveryValidationProtocolError(
        `${criterion.criterionId} comparatorArm is not present in protocol arms`,
      );
    }
    if (!protocol.arms.includes(criterion.candidateArm)) {
      throw new CCFRecoveryValidationProtocolError(
        `${criterion.criterionId} candidateArm is not present in protocol arms`,
      );
    }
    if (!protocol.primaryMetrics.includes(criterion.metric)) {
      throw new CCFRecoveryValidationProtocolError(
        `${criterion.criterionId} promotion metric must be a primary metric`,
      );
    }
    if (criterion.comparatorArm === criterion.candidateArm) {
      throw new CCFRecoveryValidationProtocolError(
        `${criterion.criterionId} comparator and candidate arms must differ`,
      );
    }
    assertFiniteThreshold(
      `${criterion.criterionId}.minimumAbsoluteImprovement`,
      criterion.minimumAbsoluteImprovement,
    );
    assertFiniteThreshold(
      `${criterion.criterionId}.minimumRelativeImprovement`,
      criterion.minimumRelativeImprovement,
    );
    if (
      criterion.minimumAbsoluteImprovement == null &&
      criterion.minimumRelativeImprovement == null
    ) {
      throw new CCFRecoveryValidationProtocolError(
        `${criterion.criterionId} must predeclare at least one promotion threshold`,
      );
    }
  }

  if (!protocol.tiberOffRequired) {
    throw new CCFRecoveryValidationProtocolError("recovery promotion protocol must require a TIBER-off replay");
  }
  if (!protocol.failedCandidateRetentionRequired) {
    throw new CCFRecoveryValidationProtocolError(
      "recovery promotion protocol must retain failed candidates and negative results",
    );
  }

  return protocol;
}

export function fingerprintCCFRecoveryValidationProtocol(
  protocol: CCFRecoveryValidationProtocol,
): string {
  validateCCFRecoveryValidationProtocol(protocol);
  const canonical = JSON.stringify({
    ...protocol,
    questions: [...protocol.questions].sort(),
    arms: [...protocol.arms].sort(),
    primaryMetrics: [...protocol.primaryMetrics].sort(),
    secondaryMetrics: [...protocol.secondaryMetrics].sort(),
    subgroupDimensions: [...protocol.subgroupDimensions].sort(),
    promotionCriteria: [...protocol.promotionCriteria].sort((left, right) =>
      left.criterionId.localeCompare(right.criterionId),
    ),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
