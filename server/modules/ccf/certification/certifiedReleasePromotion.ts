import {
  validateCCFBacktestProgressHistory,
  type CCFBacktestMetricSet,
  type CCFBacktestProgressRecord,
} from "./backtestProgressHistory";
import {
  fingerprintCCFPredictiveValidationReceipt,
  validateCCFPredictiveValidationReceipt,
  type CCFPredictiveValidationReceipt,
} from "./predictiveValidationReceipt";
import {
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export interface CCFCertifiedReleasePromotionInput {
  calibrationArtifactFingerprint: string;
  metrics: CCFBacktestMetricSet;
  simpleBaselineMetrics: CCFBacktestMetricSet;
  challengerMetrics: CCFBacktestMetricSet | null;
  tiberRole: "none" | "challenger_only";
  evidenceRefs: string[];
  claim: string;
}

export interface CCFCertifiedModelIdentity {
  modelVersion: string;
  calibrationVersion: string;
  certificationRunId: string;
}

export class CCFCertifiedReleasePromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFCertifiedReleasePromotionError";
  }
}

function requireText(label: string, value: string): void {
  if (!value.trim()) throw new CCFCertifiedReleasePromotionError(`${label} is required`);
  if (/^(unknown|unavailable|tbd|todo|placeholder|null|none|n\/a)$/i.test(value.trim())) {
    throw new CCFCertifiedReleasePromotionError(`${label} cannot be an unresolved placeholder`);
  }
}

function finiteOrNull(label: string, value: number | null): void {
  if (value !== null && !Number.isFinite(value)) {
    throw new CCFCertifiedReleasePromotionError(`${label} must be finite or null`);
  }
}

function validateMetricSet(label: string, metrics: CCFBacktestMetricSet): void {
  for (const [name, value] of Object.entries(metrics)) finiteOrNull(`${label}.${name}`, value);
  for (const name of ["mae", "rmse", "lineupRegret"] as const) {
    const value = metrics[name];
    if (value !== null && value < 0) {
      throw new CCFCertifiedReleasePromotionError(`${label}.${name} must be non-negative`);
    }
  }
  if (metrics.spearman !== null && (metrics.spearman < -1 || metrics.spearman > 1)) {
    throw new CCFCertifiedReleasePromotionError(`${label}.spearman must be between -1 and 1`);
  }
  for (const name of ["central50Coverage", "central80Coverage", "brier", "abstentionRate"] as const) {
    const value = metrics[name];
    if (value !== null && (value < 0 || value > 1)) {
      throw new CCFCertifiedReleasePromotionError(`${label}.${name} must be between 0 and 1`);
    }
  }
}

function requireAuthorityMetrics(label: string, metrics: CCFBacktestMetricSet): void {
  for (const name of ["mae", "rmse"] as const) {
    const value = metrics[name];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new CCFCertifiedReleasePromotionError(
        `${label}.${name} is required for authority-eligible certification`,
      );
    }
  }
}

function testWindow(protocol: CCFPredictiveValidationProtocol): string {
  const window = protocol.split.test;
  if (!window) throw new CCFCertifiedReleasePromotionError("protocol final test window is required");
  return `${window.start.season}-W${window.start.week}..${window.end.season}-W${window.end.week}`;
}

function uniqueEvidenceRefs(refs: readonly string[]): string[] {
  refs.forEach((reference, index) => requireText(`evidenceRefs[${index}]`, reference));
  const deduped = Array.from(new Set(refs));
  if (deduped.length !== refs.length) {
    throw new CCFCertifiedReleasePromotionError("evidenceRefs must not contain duplicates");
  }
  return deduped;
}

export function promoteCCFPredictiveReceiptToCertifiedRelease(
  protocolInput: CCFPredictiveValidationProtocol,
  receiptInput: CCFPredictiveValidationReceipt,
  input: CCFCertifiedReleasePromotionInput,
): CCFBacktestProgressRecord {
  const protocol = validateCCFPredictiveValidationProtocol(protocolInput);
  const receipt = validateCCFPredictiveValidationReceipt(protocol, receiptInput);
  if (receipt.releaseStatus !== "certified") {
    throw new CCFCertifiedReleasePromotionError(
      "only a certified predictive validation receipt can mint a certified release",
    );
  }
  if (receipt.finalHoldoutAccessCount !== 1) {
    throw new CCFCertifiedReleasePromotionError(
      "certified release requires exactly one final holdout access",
    );
  }
  if (receipt.tiberUsedAsAuthority) {
    throw new CCFCertifiedReleasePromotionError("TIBER cannot be recommendation authority");
  }

  requireText("calibrationArtifactFingerprint", input.calibrationArtifactFingerprint);
  requireText("claim", input.claim);
  validateMetricSet("metrics", input.metrics);
  validateMetricSet("simpleBaselineMetrics", input.simpleBaselineMetrics);
  if (input.challengerMetrics) validateMetricSet("challengerMetrics", input.challengerMetrics);
  requireAuthorityMetrics("metrics", input.metrics);
  requireAuthorityMetrics("simpleBaselineMetrics", input.simpleBaselineMetrics);

  const receiptFingerprint = fingerprintCCFPredictiveValidationReceipt(protocol, receipt);
  const generatedEvidenceRefs = [
    `ccf-predictive-receipt:${receiptFingerprint}`,
    `ccf-predictive-protocol:${receipt.protocolFingerprint}`,
    `ccf-dataset:${receipt.datasetFingerprint}`,
    `ccf-candidate:${receipt.candidateArtifactFingerprint}`,
    `ccf-native-baseline:${receipt.nativeBaselineFingerprint}`,
    `ccf-calibration:${input.calibrationArtifactFingerprint}`,
  ];
  const evidenceRefs = uniqueEvidenceRefs(generatedEvidenceRefs.concat(input.evidenceRefs));

  const record: CCFBacktestProgressRecord = {
    id: receipt.runId,
    recordedAt: receipt.completedAt,
    stage: "certified_release",
    status: "certified",
    modelVersion: receipt.modelVersion,
    calibrationVersion: input.calibrationArtifactFingerprint,
    comparisonIdentity: {
      protocolVersion: protocol.contractVersion,
      scoringProfileHash: receipt.scoringProfileFingerprint,
      supportedPopulation: receipt.supportedPopulation,
      testWindow: testWindow(protocol),
      datasetFingerprint: receipt.datasetFingerprint,
    },
    metrics: { ...input.metrics },
    simpleBaselineMetrics: { ...input.simpleBaselineMetrics },
    challengerMetrics: input.challengerMetrics ? { ...input.challengerMetrics } : null,
    tiberRole: input.tiberRole,
    evidenceRefs,
    claim: input.claim.trim(),
    certificationBinding: {
      receiptFingerprint,
      protocolFingerprint: receipt.protocolFingerprint,
      candidateArtifactFingerprint: receipt.candidateArtifactFingerprint,
      nativeBaselineFingerprint: receipt.nativeBaselineFingerprint,
      calibrationArtifactFingerprint: input.calibrationArtifactFingerprint,
      sourcePlanFingerprint: receipt.sourcePlanFingerprint,
      featureSetFingerprint: receipt.featureSetFingerprint,
      decisionPolicyFingerprint: receipt.decisionPolicyFingerprint,
      finalHoldoutAccessCount: 1,
    },
  };
  validateCCFBacktestProgressHistory([record]);
  return record;
}

export function certifiedModelIdentityFromRelease(
  record: CCFBacktestProgressRecord,
): CCFCertifiedModelIdentity {
  try {
    validateCCFBacktestProgressHistory([record]);
  } catch (error) {
    throw new CCFCertifiedReleasePromotionError(
      `model identity requires a valid certified release: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
  if (record.stage !== "certified_release" || record.status !== "certified") {
    throw new CCFCertifiedReleasePromotionError(
      "model identity can only be minted from a certified_release record",
    );
  }
  if (!record.modelVersion) {
    throw new CCFCertifiedReleasePromotionError("certified release modelVersion is required");
  }
  if (!record.calibrationVersion) {
    throw new CCFCertifiedReleasePromotionError("certified release calibrationVersion is required");
  }
  requireText("certificationRunId", record.id);

  return {
    modelVersion: record.modelVersion,
    calibrationVersion: record.calibrationVersion,
    certificationRunId: record.id,
  };
}
