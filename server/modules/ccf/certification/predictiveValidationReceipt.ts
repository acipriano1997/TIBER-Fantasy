import crypto from "crypto";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFAntiLeakageControl,
  type CCFNegativeControl,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export const CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS = [
  "rolling_origin_execution",
  "native_baseline_comparison",
  "paired_uncertainty",
  "calibration",
  "rank_quality",
  "distribution_quality",
  "selective_prediction",
  "lineup_regret",
  "subgroup_stability",
  "feature_ablation",
  "tiber_off_replay",
] as const;

export type CCFPredictiveCertificationCheck =
  typeof CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS[number];

export type CCFPredictiveCheckStatus = "passed" | "failed";
export type CCFPredictiveReleaseStatus = "passed" | "failed" | "certified";

export interface CCFPredictiveNamedCheckResult<TName extends string = string> {
  name: TName;
  status: CCFPredictiveCheckStatus;
  evidenceRef: string;
}

export interface CCFPredictivePromotionCriterionResult {
  criterionId: string;
  status: CCFPredictiveCheckStatus;
  evidenceRef: string;
}

export interface CCFPredictiveValidationReceipt {
  contractVersion: "ccf-predictive-validation-receipt-v1";
  runId: string;
  runnerVersion: string;
  startedAt: string;
  completedAt: string;
  protocolId: string;
  protocolFingerprint: string;
  modelVersion: string;
  datasetFingerprint: string;
  sourcePlanFingerprint: string;
  scoringProfileFingerprint: string;
  featureSetFingerprint: string;
  decisionPolicyFingerprint: string;
  supportedPopulation: string;
  candidateArtifactFingerprint: string;
  nativeBaselineFingerprint: string;
  pairedRows: number;
  independentTimeBlocks: number;
  finalHoldoutAccessCount: number;
  tiberUsedAsAuthority: boolean;
  requiredChecks: Array<CCFPredictiveNamedCheckResult<CCFPredictiveCertificationCheck>>;
  antiLeakageControls: Array<CCFPredictiveNamedCheckResult<CCFAntiLeakageControl>>;
  negativeControls: Array<CCFPredictiveNamedCheckResult<CCFNegativeControl>>;
  promotionCriteria: CCFPredictivePromotionCriterionResult[];
  evidenceRefs: string[];
  releaseStatus: CCFPredictiveReleaseStatus;
}

export class CCFPredictiveValidationReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFPredictiveValidationReceiptError";
  }
}

function requireText(label: string, value: string): void {
  if (!value.trim()) throw new CCFPredictiveValidationReceiptError(`${label} is required`);
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFPredictiveValidationReceiptError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requirePositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CCFPredictiveValidationReceiptError(`${label} must be a positive integer`);
  }
}

function validateNamedResults<TName extends string>(
  label: string,
  results: readonly CCFPredictiveNamedCheckResult<TName>[],
  requiredNames: readonly TName[],
): void {
  const required = new Set<string>(requiredNames);
  const seen = new Set<string>();

  for (const result of results) {
    requireText(`${label}.name`, result.name);
    requireText(`${label}.${result.name}.evidenceRef`, result.evidenceRef);
    if (!required.has(result.name)) {
      throw new CCFPredictiveValidationReceiptError(`${label} contains unknown result ${result.name}`);
    }
    if (seen.has(result.name)) {
      throw new CCFPredictiveValidationReceiptError(`${label} contains duplicate result ${result.name}`);
    }
    seen.add(result.name);
  }

  for (const name of requiredNames) {
    if (!seen.has(name)) {
      throw new CCFPredictiveValidationReceiptError(`${label} is missing required result ${name}`);
    }
  }
}

function requireAllPassed(
  label: string,
  results: readonly { name?: string; criterionId?: string; status: CCFPredictiveCheckStatus }[],
): void {
  const failed = results.filter((result) => result.status !== "passed");
  if (failed.length > 0) {
    const names = failed.map((result) => result.name ?? result.criterionId ?? "unknown");
    throw new CCFPredictiveValidationReceiptError(`${label} failed: ${names.join(", ")}`);
  }
}

export function validateCCFPredictiveValidationReceipt(
  protocolInput: CCFPredictiveValidationProtocol,
  receipt: CCFPredictiveValidationReceipt,
): CCFPredictiveValidationReceipt {
  const protocol = validateCCFPredictiveValidationProtocol(protocolInput);
  if (receipt.contractVersion !== "ccf-predictive-validation-receipt-v1") {
    throw new CCFPredictiveValidationReceiptError("unsupported predictive validation receipt version");
  }

  for (const [label, value] of [
    ["runId", receipt.runId],
    ["runnerVersion", receipt.runnerVersion],
    ["protocolId", receipt.protocolId],
    ["protocolFingerprint", receipt.protocolFingerprint],
    ["modelVersion", receipt.modelVersion],
    ["datasetFingerprint", receipt.datasetFingerprint],
    ["sourcePlanFingerprint", receipt.sourcePlanFingerprint],
    ["scoringProfileFingerprint", receipt.scoringProfileFingerprint],
    ["featureSetFingerprint", receipt.featureSetFingerprint],
    ["decisionPolicyFingerprint", receipt.decisionPolicyFingerprint],
    ["supportedPopulation", receipt.supportedPopulation],
    ["candidateArtifactFingerprint", receipt.candidateArtifactFingerprint],
    ["nativeBaselineFingerprint", receipt.nativeBaselineFingerprint],
  ] as const) {
    requireText(label, value);
  }

  const frozenAt = parseTimestamp("protocol.frozenAt", protocol.frozenAt);
  const startedAt = parseTimestamp("startedAt", receipt.startedAt);
  const completedAt = parseTimestamp("completedAt", receipt.completedAt);
  if (startedAt < frozenAt) {
    throw new CCFPredictiveValidationReceiptError("validation run cannot start before protocol freeze");
  }
  if (completedAt < startedAt) {
    throw new CCFPredictiveValidationReceiptError("completedAt cannot precede startedAt");
  }

  const expectedProtocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);
  const exactIdentityPairs: Array<[string, string, string]> = [
    ["protocolId", receipt.protocolId, protocol.protocolId],
    ["protocolFingerprint", receipt.protocolFingerprint, expectedProtocolFingerprint],
    ["modelVersion", receipt.modelVersion, protocol.modelVersion],
    ["datasetFingerprint", receipt.datasetFingerprint, protocol.datasetFingerprint],
    ["sourcePlanFingerprint", receipt.sourcePlanFingerprint, protocol.sourcePlanFingerprint],
    ["scoringProfileFingerprint", receipt.scoringProfileFingerprint, protocol.scoringProfileFingerprint],
    ["featureSetFingerprint", receipt.featureSetFingerprint, protocol.featureSetFingerprint],
    ["decisionPolicyFingerprint", receipt.decisionPolicyFingerprint, protocol.decisionPolicyFingerprint],
    ["supportedPopulation", receipt.supportedPopulation, protocol.supportedPopulation],
  ];
  for (const [label, actual, expected] of exactIdentityPairs) {
    if (actual !== expected) {
      throw new CCFPredictiveValidationReceiptError(`${label} does not match frozen protocol`);
    }
  }

  requirePositiveInteger("pairedRows", receipt.pairedRows);
  requirePositiveInteger("independentTimeBlocks", receipt.independentTimeBlocks);
  if (receipt.pairedRows < protocol.samplePolicy.minimumOverallPairedRows) {
    throw new CCFPredictiveValidationReceiptError("pairedRows is below frozen sample minimum");
  }
  if (receipt.independentTimeBlocks < protocol.samplePolicy.minimumIndependentTimeBlocks) {
    throw new CCFPredictiveValidationReceiptError(
      "independentTimeBlocks is below frozen sample minimum",
    );
  }

  if (!Number.isInteger(receipt.finalHoldoutAccessCount) || receipt.finalHoldoutAccessCount < 0) {
    throw new CCFPredictiveValidationReceiptError(
      "finalHoldoutAccessCount must be a non-negative integer",
    );
  }
  if (protocol.oneTouchFinalHoldoutRequired && receipt.finalHoldoutAccessCount !== 1) {
    throw new CCFPredictiveValidationReceiptError(
      "one-touch final holdout requires exactly one final holdout access",
    );
  }
  if (receipt.tiberUsedAsAuthority) {
    throw new CCFPredictiveValidationReceiptError(
      "TIBER cannot be recommendation authority in a native CCF certification receipt",
    );
  }

  validateNamedResults(
    "requiredChecks",
    receipt.requiredChecks,
    CCF_REQUIRED_PREDICTIVE_CERTIFICATION_CHECKS,
  );
  validateNamedResults(
    "antiLeakageControls",
    receipt.antiLeakageControls,
    protocol.antiLeakageControls,
  );
  validateNamedResults(
    "negativeControls",
    receipt.negativeControls,
    protocol.negativeControls,
  );

  const expectedCriteria = new Set(protocol.promotionCriteria.map((criterion) => criterion.criterionId));
  const seenCriteria = new Set<string>();
  for (const result of receipt.promotionCriteria) {
    requireText("promotionCriteria.criterionId", result.criterionId);
    requireText(`promotionCriteria.${result.criterionId}.evidenceRef`, result.evidenceRef);
    if (!expectedCriteria.has(result.criterionId)) {
      throw new CCFPredictiveValidationReceiptError(
        `promotionCriteria contains unknown criterion ${result.criterionId}`,
      );
    }
    if (seenCriteria.has(result.criterionId)) {
      throw new CCFPredictiveValidationReceiptError(
        `promotionCriteria contains duplicate criterion ${result.criterionId}`,
      );
    }
    seenCriteria.add(result.criterionId);
  }
  for (const criterion of protocol.promotionCriteria) {
    if (!seenCriteria.has(criterion.criterionId)) {
      throw new CCFPredictiveValidationReceiptError(
        `promotionCriteria is missing required criterion ${criterion.criterionId}`,
      );
    }
  }

  if (receipt.evidenceRefs.length === 0) {
    throw new CCFPredictiveValidationReceiptError("evidenceRefs must not be empty");
  }
  if (new Set(receipt.evidenceRefs).size !== receipt.evidenceRefs.length) {
    throw new CCFPredictiveValidationReceiptError("evidenceRefs must not contain duplicates");
  }
  receipt.evidenceRefs.forEach((reference, index) => requireText(`evidenceRefs[${index}]`, reference));

  if (receipt.releaseStatus === "certified") {
    requireAllPassed("requiredChecks", receipt.requiredChecks);
    requireAllPassed("antiLeakageControls", receipt.antiLeakageControls);
    requireAllPassed("negativeControls", receipt.negativeControls);
    requireAllPassed("promotionCriteria", receipt.promotionCriteria);
  }

  return receipt;
}

export function fingerprintCCFPredictiveValidationReceipt(
  protocol: CCFPredictiveValidationProtocol,
  receipt: CCFPredictiveValidationReceipt,
): string {
  validateCCFPredictiveValidationReceipt(protocol, receipt);
  const canonical = JSON.stringify({
    ...receipt,
    requiredChecks: [...receipt.requiredChecks].sort((left, right) => left.name.localeCompare(right.name)),
    antiLeakageControls: [...receipt.antiLeakageControls].sort((left, right) => left.name.localeCompare(right.name)),
    negativeControls: [...receipt.negativeControls].sort((left, right) => left.name.localeCompare(right.name)),
    promotionCriteria: [...receipt.promotionCriteria].sort((left, right) =>
      left.criterionId.localeCompare(right.criterionId),
    ),
    evidenceRefs: [...receipt.evidenceRefs].sort(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
