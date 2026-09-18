import crypto from "crypto";
import {
  CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
  type CCFPredictiveCertificationCheck,
} from "./predictiveValidationReceipt";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import type { CCFRollingValidationExecutionV1 } from "./rollingValidationExecution";
import type { CCFRollingValidationBaselineEvidenceV1 } from "./rollingValidationBaselineEvidence";
import type { CCFRollingValidationPromotionEvidenceV1 } from "./rollingValidationPromotionEvidence";
import type { CCFRollingValidationDiagnosticEvidenceV1 } from "./rollingValidationDiagnosticEvidence";
import type { CCFRollingValidationSubgroupPromotionEvidenceV1 } from "./rollingValidationSubgroupPromotionEvidence";
import type { CCFRollingValidationPromotionEvaluationV1 } from "./rollingValidationPromotionEvaluation";
import type { CCFRollingValidationTiberOffEvidenceV1 } from "./rollingValidationTiberOffEvidence";
import type { CCFRollingValidationLineupRegretEvidenceV1 } from "./rollingValidationLineupRegretEvidence";

export type CCFRollingValidationReadinessStatus =
  | "evidence_available"
  | "partial"
  | "missing";

export interface CCFRollingValidationReadinessCheckV1 {
  name: CCFPredictiveCertificationCheck;
  status: CCFRollingValidationReadinessStatus;
  evidenceRefs: string[];
  blockers: string[];
}

export interface CCFRollingValidationReadinessAuditV1 {
  contractVersion: "ccf-rolling-validation-readiness-audit-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  checks: CCFRollingValidationReadinessCheckV1[];
  availableCheckCount: number;
  partialCheckCount: number;
  missingCheckCount: number;
  promotionCriteriaEvaluated: true;
  promotionCriteriaPassed: boolean;
  promotionEvaluationRef: string;
  receiptControlBlockers: string[];
  finalHoldoutReady: false;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
  auditRef: string;
}

export interface BuildCCFRollingValidationReadinessAuditInput {
  protocol: CCFPredictiveValidationProtocol;
  execution: CCFRollingValidationExecutionV1;
  baselineEvidence: CCFRollingValidationBaselineEvidenceV1;
  promotionEvidence: CCFRollingValidationPromotionEvidenceV1;
  diagnosticEvidence: CCFRollingValidationDiagnosticEvidenceV1;
  subgroupEvidence: CCFRollingValidationSubgroupPromotionEvidenceV1;
  promotionEvaluation: CCFRollingValidationPromotionEvaluationV1;
  tiberOffEvidence: CCFRollingValidationTiberOffEvidenceV1;
  lineupRegretEvidence?: CCFRollingValidationLineupRegretEvidenceV1;
}

export class CCFRollingValidationReadinessAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationReadinessAuditError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim()))).sort();
}

function check(
  name: CCFPredictiveCertificationCheck,
  status: CCFRollingValidationReadinessStatus,
  evidenceRefs: readonly string[] = [],
  blockers: readonly string[] = [],
): CCFRollingValidationReadinessCheckV1 {
  return {
    name,
    status,
    evidenceRefs: uniqueSorted(evidenceRefs),
    blockers: uniqueSorted(blockers),
  };
}

function assertSealedPacket(
  label: string,
  packet: {
    replayBindingId: string;
    protocolFingerprint: string;
    finalHoldoutAccessed: false;
    certificationOnly: true;
    productionInferenceAuthorized: false;
  },
  replayBindingId: string,
  protocolFingerprint: string,
): void {
  if (
    packet.replayBindingId !== replayBindingId ||
    packet.protocolFingerprint !== protocolFingerprint
  ) {
    throw new CCFRollingValidationReadinessAuditError(
      `${label} does not match the rolling replay binding/frozen protocol`,
    );
  }
  if (
    packet.finalHoldoutAccessed !== false ||
    packet.certificationOnly !== true ||
    packet.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationReadinessAuditError(
      `${label} must remain sealed-holdout certification-only evidence`,
    );
  }
}

function expectedNativeBaselineArms(
  protocol: CCFPredictiveValidationProtocol,
): string[] {
  return ["historical_mean", "recent_mean", "usage_rate"].filter((arm) =>
    protocol.arms.includes(arm as never),
  );
}

function buildChecks(
  input: BuildCCFRollingValidationReadinessAuditInput,
): CCFRollingValidationReadinessCheckV1[] {
  const baselineArms = new Set(
    input.baselineEvidence.armEvidence.map((row) => row.arm),
  );
  const expectedArms = expectedNativeBaselineArms(input.protocol);
  const missingArms = expectedArms.filter((arm) => !baselineArms.has(arm as never));

  const overallUncertaintyRefs =
    input.promotionEvidence.criterionEvidence.map((row) => row.evidenceRef);
  const subgroupUncertaintyRefs = input.subgroupEvidence.criterionEvidence.flatMap(
    (criterion) =>
      criterion.subgroupResults
        .filter((row) => row.status === "evaluated")
        .map((row) => row.evidenceRef),
  );
  const uncertaintyRefs = uniqueSorted([
    ...overallUncertaintyRefs,
    ...subgroupUncertaintyRefs,
  ]);

  const diagnostics = input.diagnosticEvidence;
  const rankEvidenceAvailable =
    diagnostics.rankByBlock != null && diagnostics.rankByBlock.length > 0;
  const distributionEvidenceAvailable = diagnostics.quantileScoring != null;
  const intervalCalibrationAvailable = diagnostics.intervalCalibration != null;
  const selectiveEvidenceAvailable = diagnostics.selectivePrediction != null;

  const declaredSubgroupDimensions = [...input.protocol.subgroupDimensions].sort();
  const unsupportedSubgroupDimensions = declaredSubgroupDimensions.filter(
    (dimension) => dimension !== "position",
  );
  const subgroupRefs = input.subgroupEvidence.criterionEvidence.map(
    (row) => row.evidenceRef,
  );

  return [
    check(
      "rolling_origin_execution",
      "evidence_available",
      [input.execution.replayBinding.bindingId],
    ),
    check(
      "native_baseline_comparison",
      missingArms.length === 0 ? "evidence_available" : "partial",
      input.baselineEvidence.armEvidence.map((row) => row.evidenceRef),
      missingArms.map((arm) => `native_baseline_missing:${arm}`),
    ),
    check(
      "paired_uncertainty",
      uncertaintyRefs.length > 0 ? "evidence_available" : "missing",
      uncertaintyRefs,
      uncertaintyRefs.length > 0
        ? []
        : ["paired_uncertainty_evidence_missing"],
    ),
    check(
      "calibration",
      intervalCalibrationAvailable ? "partial" : "missing",
      intervalCalibrationAvailable ? [diagnostics.evidenceRef] : [],
      intervalCalibrationAvailable
        ? ["probability_event_labels_and_probability_calibration_not_frozen"]
        : [
            "interval_calibration_evidence_missing",
            "probability_event_labels_and_probability_calibration_not_frozen",
          ],
    ),
    check(
      "rank_quality",
      rankEvidenceAvailable ? "evidence_available" : "missing",
      rankEvidenceAvailable ? [diagnostics.evidenceRef] : [],
      rankEvidenceAvailable
        ? []
        : ["rank_quality_metric_not_predeclared_or_evidence_missing"],
    ),
    check(
      "distribution_quality",
      distributionEvidenceAvailable ? "evidence_available" : "missing",
      distributionEvidenceAvailable ? [diagnostics.evidenceRef] : [],
      distributionEvidenceAvailable
        ? []
        : ["distribution_quality_metric_not_predeclared_or_evidence_missing"],
    ),
    check(
      "selective_prediction",
      selectiveEvidenceAvailable ? "evidence_available" : "missing",
      selectiveEvidenceAvailable ? [diagnostics.evidenceRef] : [],
      selectiveEvidenceAvailable
        ? []
        : ["selective_prediction_metric_not_predeclared_or_evidence_missing"],
    ),
    check(
      "lineup_regret",
      input.lineupRegretEvidence ? "evidence_available" : "missing",
      input.lineupRegretEvidence
        ? [input.lineupRegretEvidence.evidenceRef]
        : [],
      input.lineupRegretEvidence
        ? []
        : ["historical_lineup_decision_witnesses_missing_or_not_bound"],
    ),
    check(
      "subgroup_stability",
      subgroupRefs.length === 0
        ? "missing"
        : unsupportedSubgroupDimensions.length === 0
          ? "evidence_available"
          : "partial",
      subgroupRefs,
      subgroupRefs.length === 0
        ? ["subgroup_promotion_evidence_missing"]
        : unsupportedSubgroupDimensions.map(
            (dimension) => `subgroup_dimension_not_evaluated:${dimension}`,
          ),
    ),
    check(
      "feature_ablation",
      "missing",
      [],
      [
        "feature_ablation_variant_execution_evidence_missing",
        "feature_ablation_acceptance_semantics_not_frozen",
      ],
    ),
    check(
      "tiber_off_replay",
      "evidence_available",
      [input.tiberOffEvidence.evidenceRef],
    ),
  ];
}

function buildAuditRef(
  replayBindingId: string,
  protocolFingerprint: string,
  checks: readonly CCFRollingValidationReadinessCheckV1[],
  promotionEvaluationRef: string,
  promotionCriteriaPassed: boolean,
  receiptControlBlockers: readonly string[],
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-readiness-audit-v1",
    replayBindingId,
    protocolFingerprint,
    checks,
    promotionEvaluationRef,
    promotionCriteriaPassed,
    receiptControlBlockers,
    finalHoldoutReady: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  });
  return `ccf://rolling-validation-readiness-audit/sha256/${sha256(canonical)}`;
}

/**
 * Describe what the sealed validation replay can and cannot support before the
 * one-touch final holdout is opened.
 *
 * This audit intentionally uses evidence-coverage states, never "passed" for a
 * required receipt check. The final predictive-validation receipt owns that
 * certification judgment. Missing semantics/evidence stay visible rather than
 * being replaced with inferred thresholds or operator optimism.
 */
export function buildCCFRollingValidationReadinessAudit(
  input: BuildCCFRollingValidationReadinessAuditInput,
): CCFRollingValidationReadinessAuditV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);
  const replayBindingId = input.execution.replayBinding.bindingId;

  if (
    input.execution.finalHoldoutAccessed !== false ||
    input.execution.certificationOnly !== true ||
    input.execution.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationReadinessAuditError(
      "readiness audit requires sealed-holdout certification-only execution",
    );
  }
  if (input.execution.replayBinding.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingValidationReadinessAuditError(
      "rolling execution does not match frozen protocol",
    );
  }

  assertSealedPacket(
    "baseline evidence",
    input.baselineEvidence,
    replayBindingId,
    protocolFingerprint,
  );
  assertSealedPacket(
    "promotion evidence",
    input.promotionEvidence,
    replayBindingId,
    protocolFingerprint,
  );
  assertSealedPacket(
    "diagnostic evidence",
    input.diagnosticEvidence,
    replayBindingId,
    protocolFingerprint,
  );
  assertSealedPacket(
    "subgroup evidence",
    input.subgroupEvidence,
    replayBindingId,
    protocolFingerprint,
  );
  assertSealedPacket(
    "promotion evaluation",
    input.promotionEvaluation,
    replayBindingId,
    protocolFingerprint,
  );
  assertSealedPacket(
    "TIBER-off evidence",
    input.tiberOffEvidence,
    replayBindingId,
    protocolFingerprint,
  );
  if (input.lineupRegretEvidence) {
    assertSealedPacket(
      "lineup regret evidence",
      input.lineupRegretEvidence,
      replayBindingId,
      protocolFingerprint,
    );
  }

  if (input.promotionEvaluation.promotionEvaluated !== true) {
    throw new CCFRollingValidationReadinessAuditError(
      "promotion criteria must be evaluated on the sealed validation fold",
    );
  }
  if (
    input.tiberOffEvidence.tiberUsedAsAuthority !== false ||
    input.tiberOffEvidence.tiberUsedAsModelInput !== false
  ) {
    throw new CCFRollingValidationReadinessAuditError(
      "TIBER-off evidence cannot report TIBER authority or model input",
    );
  }

  const checks = buildChecks({ ...input, protocol });
  const names = checks.map((row) => row.name);
  if (
    names.length !== CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS.length ||
    CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS.some(
      (name) => !names.includes(name),
    )
  ) {
    throw new CCFRollingValidationReadinessAuditError(
      "readiness audit must cover every required predictive certification check",
    );
  }

  const availableCheckCount = checks.filter(
    (row) => row.status === "evidence_available",
  ).length;
  const partialCheckCount = checks.filter(
    (row) => row.status === "partial",
  ).length;
  const missingCheckCount = checks.filter(
    (row) => row.status === "missing",
  ).length;

  const receiptControlBlockers = [
    ...protocol.antiLeakageControls.map(
      (control) => `anti_leakage_result_not_materialized:${control}`,
    ),
    ...protocol.negativeControls.map(
      (control) => `negative_control_result_not_materialized:${control}`,
    ),
  ].sort();

  const promotionEvaluationRef =
    input.promotionEvaluation.evidenceRef;
  const promotionCriteriaPassed =
    input.promotionEvaluation.evaluation.passed;

  return {
    contractVersion: "ccf-rolling-validation-readiness-audit-v1",
    replayBindingId,
    protocolFingerprint,
    checks,
    availableCheckCount,
    partialCheckCount,
    missingCheckCount,
    promotionCriteriaEvaluated: true,
    promotionCriteriaPassed,
    promotionEvaluationRef,
    receiptControlBlockers,
    finalHoldoutReady: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
    auditRef: buildAuditRef(
      replayBindingId,
      protocolFingerprint,
      checks,
      promotionEvaluationRef,
      promotionCriteriaPassed,
      receiptControlBlockers,
    ),
  };
}
