import crypto from "crypto";
import {
  compareCCFModelToBenchmark,
  type CCFModelBenchmarkComparison,
} from "./modelComparison";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationArm,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import type {
  CCFHistoricalValidationPredictionV1,
  CCFRollingValidationExecutionV1,
} from "./rollingValidationExecution";

export type CCFNativeBaselineArm =
  | "historical_mean"
  | "recent_mean"
  | "usage_rate";

export interface CCFRollingValidationBaselinePredictionV1 {
  contractVersion: "ccf-rolling-validation-baseline-prediction-v1";
  rowId: string;
  arm: CCFNativeBaselineArm;
  predictedFantasyPoints: number | null;
  evidenceRef: string;
}

export interface CCFRollingValidationArmEvidenceV1 {
  contractVersion: "ccf-rolling-validation-arm-evidence-v1";
  arm: CCFNativeBaselineArm;
  pairedRows: number;
  independentTimeBlocks: number;
  candidateMae: number | null;
  comparatorMae: number | null;
  maeImprovement: number | null;
  candidateRmse: number | null;
  comparatorRmse: number | null;
  rmseImprovement: number | null;
  candidateWins: number;
  comparatorWins: number;
  ties: number;
  evidenceRef: string;
}

export interface CCFRollingValidationBaselineEvidenceV1 {
  contractVersion: "ccf-rolling-validation-baseline-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  pointEstimate: CCFRollingValidationExecutionV1["pointEstimate"];
  evaluationRowIds: string[];
  armEvidence: CCFRollingValidationArmEvidenceV1[];
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationBaselineEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  protocol: CCFPredictiveValidationProtocol;
  baselinePredictions: CCFRollingValidationBaselinePredictionV1[];
}

export class CCFRollingValidationBaselineEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationBaselineEvidenceError";
  }
}

const SUPPORTED_NATIVE_BASELINES: readonly CCFNativeBaselineArm[] = [
  "historical_mean",
  "recent_mean",
  "usage_rate",
];

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireText(label: string, value: string): void {
  if (!value.trim()) {
    throw new CCFRollingValidationBaselineEvidenceError(`${label} is required`);
  }
}

function assertExecution(execution: CCFRollingValidationExecutionV1): void {
  if (execution.contractVersion !== "ccf-rolling-validation-execution-v1") {
    throw new CCFRollingValidationBaselineEvidenceError(
      "unsupported rolling validation execution version",
    );
  }
  if (
    execution.finalHoldoutAccessed !== false ||
    execution.certificationOnly !== true ||
    execution.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationBaselineEvidenceError(
      "rolling validation baseline evidence requires certification-only execution with sealed holdout",
    );
  }
  if (execution.predictions.length === 0) {
    throw new CCFRollingValidationBaselineEvidenceError(
      "rolling validation execution must contain predictions",
    );
  }
}

function expectedBaselineArms(
  protocol: CCFPredictiveValidationProtocol,
): CCFNativeBaselineArm[] {
  const arms = new Set<CCFPredictiveValidationArm>(protocol.arms);
  return SUPPORTED_NATIVE_BASELINES.filter((arm) => arms.has(arm));
}

function validateBaselinePrediction(
  row: CCFRollingValidationBaselinePredictionV1,
): void {
  if (row.contractVersion !== "ccf-rolling-validation-baseline-prediction-v1") {
    throw new CCFRollingValidationBaselineEvidenceError(
      "unsupported rolling validation baseline prediction version",
    );
  }
  requireText("baseline rowId", row.rowId);
  requireText("baseline evidenceRef", row.evidenceRef);
  if (!SUPPORTED_NATIVE_BASELINES.includes(row.arm)) {
    throw new CCFRollingValidationBaselineEvidenceError(
      `unsupported native baseline arm ${row.arm}`,
    );
  }
  if (
    row.predictedFantasyPoints != null &&
    !Number.isFinite(row.predictedFantasyPoints)
  ) {
    throw new CCFRollingValidationBaselineEvidenceError(
      `baseline prediction ${row.rowId}/${row.arm} must be finite or null`,
    );
  }
}

function indexPredictions(
  rows: readonly CCFRollingValidationBaselinePredictionV1[],
): Map<string, CCFRollingValidationBaselinePredictionV1> {
  const indexed = new Map<string, CCFRollingValidationBaselinePredictionV1>();
  for (const row of rows) {
    validateBaselinePrediction(row);
    const key = `${row.rowId}|${row.arm}`;
    if (indexed.has(key)) {
      throw new CCFRollingValidationBaselineEvidenceError(
        `duplicate baseline prediction ${key}`,
      );
    }
    indexed.set(key, row);
  }
  return indexed;
}

function evaluationRef(
  execution: CCFRollingValidationExecutionV1,
  arm: CCFNativeBaselineArm,
  comparison: CCFModelBenchmarkComparison,
  evidenceRefs: readonly string[],
): string {
  const payload = JSON.stringify({
    contractVersion: "ccf-rolling-validation-arm-evidence-v1",
    replayBindingId: execution.replayBinding.bindingId,
    pointEstimate: execution.pointEstimate,
    arm,
    comparison,
    evidenceRefs: [...evidenceRefs].sort(),
  });
  return `ccf://rolling-validation-baseline-evidence/sha256/${sha256(payload)}`;
}

function comparisonRows(
  predictions: readonly CCFHistoricalValidationPredictionV1[],
  arm: CCFNativeBaselineArm,
  indexed: ReadonlyMap<string, CCFRollingValidationBaselinePredictionV1>,
) {
  return predictions.map((prediction) => {
    const baseline = indexed.get(`${prediction.rowId}|${arm}`);
    if (!baseline) {
      throw new CCFRollingValidationBaselineEvidenceError(
        `missing ${arm} baseline prediction for ${prediction.rowId}`,
      );
    }
    return {
      actual: prediction.actualFantasyPoints,
      candidate: prediction.predictedFantasyPoints,
      benchmark: baseline.predictedFantasyPoints,
      blockId: prediction.blockId,
      evidenceRef: baseline.evidenceRef,
    };
  });
}

export function buildCCFRollingValidationBaselineEvidence(
  input: BuildCCFRollingValidationBaselineEvidenceInput,
): CCFRollingValidationBaselineEvidenceV1 {
  assertExecution(input.execution);
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);
  if (protocolFingerprint !== input.execution.replayBinding.protocolFingerprint) {
    throw new CCFRollingValidationBaselineEvidenceError(
      "frozen protocol does not match rolling validation replay binding",
    );
  }

  const expectedRowIds = [...input.execution.replayBinding.evaluationRowIds].sort();
  const actualRowIds = input.execution.predictions.map((row) => row.rowId).sort();
  if (
    expectedRowIds.length !== actualRowIds.length ||
    expectedRowIds.some((rowId, index) => rowId !== actualRowIds[index])
  ) {
    throw new CCFRollingValidationBaselineEvidenceError(
      "rolling validation predictions do not exactly cover the replay evaluation rows",
    );
  }

  const arms = expectedBaselineArms(protocol);
  if (arms.length === 0) {
    throw new CCFRollingValidationBaselineEvidenceError(
      "frozen protocol contains no supported native baseline arms",
    );
  }

  const indexed = indexPredictions(input.baselinePredictions);
  const expectedKeys = new Set(
    expectedRowIds.flatMap((rowId) => arms.map((arm) => `${rowId}|${arm}`)),
  );
  for (const key of Array.from(indexed.keys())) {
    if (!expectedKeys.has(key)) {
      throw new CCFRollingValidationBaselineEvidenceError(
        `unexpected baseline prediction ${key}`,
      );
    }
  }

  const armEvidence = arms.map((arm): CCFRollingValidationArmEvidenceV1 => {
    const rows = comparisonRows(input.execution.predictions, arm, indexed);
    const comparison = compareCCFModelToBenchmark(rows);
    const pairedBlocks = new Set(
      rows
        .filter(
          (row) =>
            row.benchmark != null &&
            Number.isFinite(row.benchmark) &&
            Number.isFinite(row.candidate) &&
            Number.isFinite(row.actual),
        )
        .map((row) => row.blockId),
    );
    const evidenceRefs = rows.map((row) => row.evidenceRef).sort();
    return {
      contractVersion: "ccf-rolling-validation-arm-evidence-v1",
      arm,
      pairedRows: comparison.pairedSampleSize,
      independentTimeBlocks: pairedBlocks.size,
      candidateMae: comparison.candidateMae,
      comparatorMae: comparison.benchmarkMae,
      maeImprovement: comparison.maeImprovement,
      candidateRmse: comparison.candidateRmse,
      comparatorRmse: comparison.benchmarkRmse,
      rmseImprovement: comparison.rmseImprovement,
      candidateWins: comparison.candidateWins,
      comparatorWins: comparison.benchmarkWins,
      ties: comparison.ties,
      evidenceRef: evaluationRef(input.execution, arm, comparison, evidenceRefs),
    };
  });

  return {
    contractVersion: "ccf-rolling-validation-baseline-evidence-v1",
    replayBindingId: input.execution.replayBinding.bindingId,
    protocolFingerprint,
    pointEstimate: input.execution.pointEstimate,
    evaluationRowIds: expectedRowIds,
    armEvidence,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
