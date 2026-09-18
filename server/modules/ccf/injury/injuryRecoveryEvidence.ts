import {
  isCCFNativeProducerFamily,
  type CCFPosition,
  type CCFProducerFamily,
} from "../outcomes/contract";

export type CCFRecoveryDimension =
  | "structural"
  | "participation"
  | "workload"
  | "performance"
  | "conditioning"
  | "setback_context";

export type CCFRecoveryFactStatus =
  | "confirmed"
  | "reported"
  | "observed"
  | "speculative";

export type CCFRecoveryModelTreatment =
  | "immediate_update"
  | "partial_update"
  | "watch_only"
  | "context_only"
  | "no_model_weight";

export type CCFRecoverySourceClass =
  | "official_injury_designation"
  | "official_practice_participation"
  | "official_game_activation"
  | "confirmed_procedure"
  | "team_announcement"
  | "direct_medical_statement"
  | "direct_player_statement"
  | "coach_statement"
  | "observed_game_usage"
  | "observed_performance"
  | "credible_independent_reporting"
  | "analyst_medical_inference"
  | "social_media_speculation";

/**
 * Ordinal evidence bands are an audit aid, not model weights. Relevance remains
 * dimension-specific: official designation is strong availability evidence,
 * while observed snaps/routes are stronger evidence of actual workload.
 */
export type CCFRecoveryCredibilityBand =
  | "A_OBJECTIVE_OR_OFFICIAL"
  | "B_CONFIRMED_PRIMARY"
  | "C_DIRECT_NARRATIVE"
  | "D_CREDIBLE_REPORTING"
  | "E_EXPERT_INFERENCE"
  | "F_UNVERIFIED";

export type CCFParticipationState =
  | "dnp"
  | "limited_practice"
  | "full_practice"
  | "medically_cleared"
  | "active"
  | "inactive"
  | "snap_participation"
  | "unknown";

export type CCFTreatmentMode = "operative" | "non_operative" | "unknown";
export type CCFProcedureStrategy =
  | "repair"
  | "reconstruction"
  | "preservation"
  | "other"
  | "unknown";

export type CCFRecoveryMetricKey =
  | "snap_share"
  | "route_participation"
  | "target_share"
  | "carry_share"
  | "touches"
  | "targets"
  | "carries"
  | "designed_usage"
  | "high_leverage_usage"
  | "goal_line_usage"
  | "pass_protection_snaps"
  | "special_teams_share"
  | "max_speed_exposure"
  | "acceleration"
  | "deceleration"
  | "rushing_efficiency"
  | "yards_after_contact"
  | "separation"
  | "target_depth"
  | "explosive_play_rate"
  | "designed_rush_rate"
  | "scramble_rate"
  | "pressure_avoidance"
  | "other";

export interface CCFRecoveryMetric {
  key: CCFRecoveryMetricKey;
  value: number;
  unit: string;
  window: string;
}

interface CCFRecoveryEvidenceBase {
  evidenceId: string;
  injuryEpisodeId: string | null;
  dimension: CCFRecoveryDimension;
  factStatus: CCFRecoveryFactStatus;
  sourceClass: CCFRecoverySourceClass;
  sourceId: string;
  sourceLocator: string | null;
  occurredAt: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  knownAt: string;
  recheckAt: string | null;
  modelTreatment: CCFRecoveryModelTreatment;
  statement: string;
  rawTraceRef: string;
  notes: string[];
}

export interface CCFStructuralRecoveryEvidence extends CCFRecoveryEvidenceBase {
  dimension: "structural";
  injuryType: string | null;
  bodyPart: string | null;
  tissueOrStructure: string | null;
  laterality: "left" | "right" | "bilateral" | "unknown" | null;
  treatmentMode: CCFTreatmentMode | null;
  procedureStrategy: CCFProcedureStrategy | null;
  procedureName: string | null;
  procedureAt: string | null;
  complication: "confirmed" | "reported" | "not_reported" | "unknown" | null;
}

export interface CCFParticipationRecoveryEvidence extends CCFRecoveryEvidenceBase {
  dimension: "participation";
  participationState: CCFParticipationState;
  metric: CCFRecoveryMetric | null;
}

export interface CCFWorkloadRecoveryEvidence extends CCFRecoveryEvidenceBase {
  dimension: "workload";
  metric: CCFRecoveryMetric;
}

export interface CCFPerformanceRecoveryEvidence extends CCFRecoveryEvidenceBase {
  dimension: "performance";
  metric: CCFRecoveryMetric;
}

export interface CCFConditioningRecoveryEvidence extends CCFRecoveryEvidenceBase {
  dimension: "conditioning";
  status:
    | "cleared_but_snap_limited"
    | "conditioning_rotation_reported"
    | "full_participation_high_demand_actions_reduced"
    | "apparently_normal_workload"
    | "unknown";
  metric: CCFRecoveryMetric | null;
}

export interface CCFSetbackContextEvidence extends CCFRecoveryEvidenceBase {
  dimension: "setback_context";
  context:
    | "recent_return"
    | "recurrence_history"
    | "compensatory_injury"
    | "opposite_limb_injury"
    | "soft_tissue_aggravation"
    | "rapid_workload_change"
    | "age_context"
    | "position_demand"
    | "other";
  metric: CCFRecoveryMetric | null;
}

export type CCFInjuryRecoveryEvidenceRecord =
  | CCFStructuralRecoveryEvidence
  | CCFParticipationRecoveryEvidence
  | CCFWorkloadRecoveryEvidence
  | CCFPerformanceRecoveryEvidence
  | CCFConditioningRecoveryEvidence
  | CCFSetbackContextEvidence;

export interface CCFInjuryRecoveryEvidenceBundle {
  contractVersion: "ccf-injury-recovery-evidence-v1";
  generatedAt: string;
  asOf: string;
  availability: "available" | "unavailable";
  unavailableReason: string | null;
  player: {
    playerId: string;
    position: CCFPosition;
    team: string | null;
  };
  evidence: CCFInjuryRecoveryEvidenceRecord[];
  warnings: string[];
}

export type CCFReturnStage =
  | "not_returned"
  | "return_to_participation"
  | "return_to_football"
  | "return_to_expected_workload"
  | "return_to_previous_performance"
  | "uncertain";

export type CCFSetbackUncertainty =
  | "unknown"
  | "limited_evidence"
  | "elevated_context";

export interface CCFRecoveryAssessment {
  assessmentVersion: string;
  playerId: string;
  asOf: string;
  producerFamily: CCFProducerFamily;
  returnStage: CCFReturnStage;
  setbackUncertainty: CCFSetbackUncertainty;
  confidence: number;
  evidenceRefs: string[];
  uncertaintyReasons: string[];
  notes: string[];
}

export interface CCFObservedWorkloadComparison {
  metricKey: CCFRecoveryMetricKey;
  previousValue: number;
  currentValue: number;
  absoluteChange: number;
  relativeChange: number | null;
  unit: string;
  interpretation: "increase" | "decrease" | "unchanged";
  medicalCausalityClaimed: false;
}

export class CCFInjuryRecoveryEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFInjuryRecoveryEvidenceError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFInjuryRecoveryEvidenceError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function validateProbability(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new CCFInjuryRecoveryEvidenceError(`${label} must be within [0, 1]`);
  }
}

function validateMetric(evidenceId: string, metric: CCFRecoveryMetric | null): void {
  if (metric == null) return;
  if (!Number.isFinite(metric.value)) {
    throw new CCFInjuryRecoveryEvidenceError(`${evidenceId} metric value must be finite`);
  }
  if (!metric.unit.trim() || !metric.window.trim()) {
    throw new CCFInjuryRecoveryEvidenceError(`${evidenceId} metric requires unit and window`);
  }
  if (
    ["snap_share", "route_participation", "target_share", "carry_share", "special_teams_share", "explosive_play_rate", "designed_rush_rate", "scramble_rate"].includes(metric.key) &&
    (metric.value < 0 || metric.value > 1)
  ) {
    throw new CCFInjuryRecoveryEvidenceError(`${evidenceId} ${metric.key} must be within [0, 1]`);
  }
}

export function defaultCCFRecoveryCredibilityBand(
  sourceClass: CCFRecoverySourceClass,
): CCFRecoveryCredibilityBand {
  switch (sourceClass) {
    case "official_injury_designation":
    case "official_practice_participation":
    case "official_game_activation":
    case "observed_game_usage":
    case "observed_performance":
      return "A_OBJECTIVE_OR_OFFICIAL";
    case "confirmed_procedure":
    case "direct_medical_statement":
      return "B_CONFIRMED_PRIMARY";
    case "team_announcement":
    case "direct_player_statement":
    case "coach_statement":
      return "C_DIRECT_NARRATIVE";
    case "credible_independent_reporting":
      return "D_CREDIBLE_REPORTING";
    case "analyst_medical_inference":
      return "E_EXPERT_INFERENCE";
    case "social_media_speculation":
      return "F_UNVERIFIED";
  }
}

function validateEvidenceRecord(record: CCFInjuryRecoveryEvidenceRecord, asOfMs: number): void {
  if (!record.evidenceId.trim() || !record.sourceId.trim() || !record.statement.trim()) {
    throw new CCFInjuryRecoveryEvidenceError("evidenceId, sourceId, and statement are required");
  }
  if (!record.rawTraceRef.trim()) {
    throw new CCFInjuryRecoveryEvidenceError(`${record.evidenceId} rawTraceRef is required`);
  }

  const retrievedAtMs = parseTimestamp(`${record.evidenceId}.retrievedAt`, record.retrievedAt);
  const knownAtMs = parseTimestamp(`${record.evidenceId}.knownAt`, record.knownAt);
  if (knownAtMs < retrievedAtMs) {
    throw new CCFInjuryRecoveryEvidenceError(`${record.evidenceId} knownAt precedes retrievedAt`);
  }
  if (knownAtMs > asOfMs) {
    throw new CCFInjuryRecoveryEvidenceError(`${record.evidenceId} knownAt is later than bundle asOf`);
  }
  if (record.occurredAt != null) parseTimestamp(`${record.evidenceId}.occurredAt`, record.occurredAt);
  if (record.publishedAt != null) parseTimestamp(`${record.evidenceId}.publishedAt`, record.publishedAt);
  if (record.recheckAt != null) parseTimestamp(`${record.evidenceId}.recheckAt`, record.recheckAt);

  if (record.factStatus === "speculative" && ["immediate_update", "partial_update"].includes(record.modelTreatment)) {
    throw new CCFInjuryRecoveryEvidenceError(
      `${record.evidenceId} speculative evidence cannot directly update the native model`,
    );
  }
  if (record.sourceClass === "social_media_speculation" && record.modelTreatment !== "no_model_weight") {
    throw new CCFInjuryRecoveryEvidenceError(
      `${record.evidenceId} social-media speculation must carry no model weight`,
    );
  }
  if (record.sourceClass === "analyst_medical_inference" && record.modelTreatment === "immediate_update") {
    throw new CCFInjuryRecoveryEvidenceError(
      `${record.evidenceId} analyst medical inference cannot be an immediate native-model update`,
    );
  }

  switch (record.dimension) {
    case "structural":
      if (record.procedureAt != null) parseTimestamp(`${record.evidenceId}.procedureAt`, record.procedureAt);
      break;
    case "participation":
      validateMetric(record.evidenceId, record.metric);
      break;
    case "workload":
    case "performance":
      validateMetric(record.evidenceId, record.metric);
      break;
    case "conditioning":
    case "setback_context":
      validateMetric(record.evidenceId, record.metric);
      break;
  }
}

export function validateCCFInjuryRecoveryEvidenceBundle(
  bundle: CCFInjuryRecoveryEvidenceBundle,
): CCFInjuryRecoveryEvidenceBundle {
  if (bundle.contractVersion !== "ccf-injury-recovery-evidence-v1") {
    throw new CCFInjuryRecoveryEvidenceError("unsupported injury/recovery contractVersion");
  }
  if (!bundle.player.playerId.trim()) {
    throw new CCFInjuryRecoveryEvidenceError("player.playerId is required");
  }
  const asOfMs = parseTimestamp("asOf", bundle.asOf);
  const generatedAtMs = parseTimestamp("generatedAt", bundle.generatedAt);
  if (generatedAtMs < asOfMs) {
    throw new CCFInjuryRecoveryEvidenceError("generatedAt cannot precede asOf");
  }

  if (bundle.availability === "available") {
    if (bundle.evidence.length === 0) {
      throw new CCFInjuryRecoveryEvidenceError("available bundle requires evidence");
    }
    if (bundle.unavailableReason != null) {
      throw new CCFInjuryRecoveryEvidenceError("available bundle cannot carry unavailableReason");
    }
  } else {
    if (bundle.evidence.length !== 0) {
      throw new CCFInjuryRecoveryEvidenceError("unavailable bundle cannot carry evidence");
    }
    if (!bundle.unavailableReason?.trim()) {
      throw new CCFInjuryRecoveryEvidenceError("unavailable bundle requires unavailableReason");
    }
  }

  const ids = new Set<string>();
  for (const record of bundle.evidence) {
    if (ids.has(record.evidenceId)) {
      throw new CCFInjuryRecoveryEvidenceError(`duplicate evidenceId ${record.evidenceId}`);
    }
    ids.add(record.evidenceId);
    validateEvidenceRecord(record, asOfMs);
  }

  return bundle;
}

export function validateCCFRecoveryAssessment(
  assessment: CCFRecoveryAssessment,
  bundle: CCFInjuryRecoveryEvidenceBundle,
): CCFRecoveryAssessment {
  validateCCFInjuryRecoveryEvidenceBundle(bundle);
  if (assessment.playerId !== bundle.player.playerId) {
    throw new CCFInjuryRecoveryEvidenceError("assessment playerId must match evidence bundle playerId");
  }
  if (!assessment.assessmentVersion.trim()) {
    throw new CCFInjuryRecoveryEvidenceError("assessmentVersion is required");
  }
  if (!isCCFNativeProducerFamily(assessment.producerFamily)) {
    throw new CCFInjuryRecoveryEvidenceError(
      `recovery assessment must be CCF-native, got ${assessment.producerFamily}`,
    );
  }
  if (assessment.producerFamily === "ccf_native_fact") {
    throw new CCFInjuryRecoveryEvidenceError("recovery assessment is derived/model state, not a raw fact");
  }
  validateProbability("assessment.confidence", assessment.confidence);

  const assessmentAsOf = parseTimestamp("assessment.asOf", assessment.asOf);
  const bundleAsOf = parseTimestamp("bundle.asOf", bundle.asOf);
  if (assessmentAsOf !== bundleAsOf) {
    throw new CCFInjuryRecoveryEvidenceError("assessment asOf must exactly match frozen evidence bundle asOf");
  }

  const byId = new Map(bundle.evidence.map((record) => [record.evidenceId, record]));
  if (assessment.evidenceRefs.length === 0 && assessment.returnStage !== "uncertain") {
    throw new CCFInjuryRecoveryEvidenceError("non-uncertain return stage requires evidenceRefs");
  }
  for (const evidenceRef of assessment.evidenceRefs) {
    if (!byId.has(evidenceRef)) {
      throw new CCFInjuryRecoveryEvidenceError(`assessment references unknown evidence ${evidenceRef}`);
    }
  }

  const referenced = assessment.evidenceRefs.map((id) => byId.get(id)!);
  const hasDimension = (dimension: CCFRecoveryDimension) =>
    referenced.some((record) => record.dimension === dimension);

  if (
    assessment.returnStage === "return_to_participation" &&
    !hasDimension("participation")
  ) {
    throw new CCFInjuryRecoveryEvidenceError("return_to_participation requires participation evidence");
  }
  if (
    assessment.returnStage === "return_to_football" &&
    !(hasDimension("participation") || hasDimension("workload"))
  ) {
    throw new CCFInjuryRecoveryEvidenceError("return_to_football requires participation or workload evidence");
  }
  if (
    assessment.returnStage === "return_to_expected_workload" &&
    !hasDimension("workload")
  ) {
    throw new CCFInjuryRecoveryEvidenceError("return_to_expected_workload requires workload evidence");
  }
  if (assessment.returnStage === "return_to_previous_performance") {
    if (!hasDimension("workload") || !hasDimension("performance")) {
      throw new CCFInjuryRecoveryEvidenceError(
        "return_to_previous_performance requires both workload and performance evidence",
      );
    }
  }

  return assessment;
}

/**
 * Deterministically compares two observed workloads. This function intentionally
 * does not label the change as a reinjury cause or assign medical risk.
 */
export function compareObservedRecoveryWorkload(
  previous: CCFRecoveryMetric,
  current: CCFRecoveryMetric,
): CCFObservedWorkloadComparison {
  if (previous.key !== current.key || previous.unit !== current.unit) {
    throw new CCFInjuryRecoveryEvidenceError("workload comparison requires matching metric key and unit");
  }
  validateMetric("previous", previous);
  validateMetric("current", current);

  const absoluteChange = current.value - previous.value;
  const relativeChange = previous.value === 0 ? null : absoluteChange / Math.abs(previous.value);
  return {
    metricKey: current.key,
    previousValue: previous.value,
    currentValue: current.value,
    absoluteChange,
    relativeChange,
    unit: current.unit,
    interpretation: absoluteChange > 0 ? "increase" : absoluteChange < 0 ? "decrease" : "unchanged",
    medicalCausalityClaimed: false,
  };
}
