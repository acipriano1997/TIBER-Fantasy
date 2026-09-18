import crypto from "crypto";
import {
  evaluateCCFIntervalCalibration,
  type CCFIntervalCalibrationMetrics,
} from "./calibration";
import {
  evaluateCCFQuantileScoring,
  type CCFQuantileScoringMetrics,
} from "./quantileScoring";
import {
  evaluateCCFRankMetrics,
  type CCFRankMetrics,
} from "./rankMetrics";
import {
  evaluateCCFSelectivePrediction,
  type CCFSelectivePredictionMetrics,
} from "./selectivePrediction";
import type { CCFRollingValidationExecutionV1 } from "./rollingValidationExecution";

export interface CCFRollingValidationForecastQualityV1 {
  contractVersion: "ccf-rolling-validation-forecast-quality-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  pointEstimate: CCFRollingValidationExecutionV1["pointEstimate"];
  sampleSize: number;
  intervalCalibration: CCFIntervalCalibrationMetrics;
  quantileScoring: CCFQuantileScoringMetrics;
  rankQuality: CCFRankMetrics;
  selectivePrediction: CCFSelectivePredictionMetrics;
  evidenceRefs: {
    calibration: string;
    distributionQuality: string;
    rankQuality: string;
    selectivePrediction: string;
  };
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export class CCFRollingValidationForecastQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationForecastQualityError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function evidenceRef(
  kind: keyof CCFRollingValidationForecastQualityV1["evidenceRefs"],
  replayBindingId: string,
  payload: unknown,
): string {
  return `ccf://rolling-validation-${kind}/sha256/${sha256(
    JSON.stringify({ replayBindingId, payload }),
  )}`;
}

function assertExecution(execution: CCFRollingValidationExecutionV1): void {
  if (execution.contractVersion !== "ccf-rolling-validation-execution-v1") {
    throw new CCFRollingValidationForecastQualityError(
      "unsupported rolling validation execution version",
    );
  }
  if (
    execution.finalHoldoutAccessed !== false ||
    execution.certificationOnly !== true ||
    execution.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationForecastQualityError(
      "forecast quality requires certification-only execution with sealed holdout",
    );
  }
  if (execution.predictions.length === 0) {
    throw new CCFRollingValidationForecastQualityError(
      "rolling validation execution must contain predictions",
    );
  }
  const expected = [...execution.replayBinding.evaluationRowIds].sort();
  const actual = execution.predictions.map((row) => row.rowId).sort();
  if (
    expected.length !== actual.length ||
    expected.some((rowId, index) => rowId !== actual[index])
  ) {
    throw new CCFRollingValidationForecastQualityError(
      "forecast quality requires exact replay evaluation-row coverage",
    );
  }
}

export function buildCCFRollingValidationForecastQuality(
  execution: CCFRollingValidationExecutionV1,
): CCFRollingValidationForecastQualityV1 {
  assertExecution(execution);

  const intervalCalibration = evaluateCCFIntervalCalibration(
    execution.predictions.map((row) => ({
      actual: row.actualFantasyPoints,
      p10: row.outcome.p10Fpts,
      p50: row.outcome.medianFpts,
      p90: row.outcome.p90Fpts,
    })),
  );

  const quantileScoring = evaluateCCFQuantileScoring(
    execution.predictions.flatMap((row) => [
      { actual: row.actualFantasyPoints, predicted: row.outcome.p10Fpts, quantile: 0.1 },
      { actual: row.actualFantasyPoints, predicted: row.outcome.p25Fpts, quantile: 0.25 },
      { actual: row.actualFantasyPoints, predicted: row.outcome.medianFpts, quantile: 0.5 },
      { actual: row.actualFantasyPoints, predicted: row.outcome.p75Fpts, quantile: 0.75 },
      { actual: row.actualFantasyPoints, predicted: row.outcome.p90Fpts, quantile: 0.9 },
    ]),
  );

  const rankQuality = evaluateCCFRankMetrics(
    execution.predictions.map((row) => ({
      actual: row.actualFantasyPoints,
      predicted: row.predictedFantasyPoints,
    })),
  );

  const selectivePrediction = evaluateCCFSelectivePrediction(
    execution.predictions.map((row) => ({
      observationId: row.rowId,
      loss: Math.abs(row.predictedFantasyPoints - row.actualFantasyPoints),
      selectionScore: row.outcome.confidenceScore,
    })),
  );

  const replayBindingId = execution.replayBinding.bindingId;
  return {
    contractVersion: "ccf-rolling-validation-forecast-quality-v1",
    replayBindingId,
    protocolFingerprint: execution.replayBinding.protocolFingerprint,
    pointEstimate: execution.pointEstimate,
    sampleSize: execution.predictions.length,
    intervalCalibration,
    quantileScoring,
    rankQuality,
    selectivePrediction,
    evidenceRefs: {
      calibration: evidenceRef("calibration", replayBindingId, intervalCalibration),
      distributionQuality: evidenceRef(
        "distributionQuality",
        replayBindingId,
        quantileScoring,
      ),
      rankQuality: evidenceRef("rankQuality", replayBindingId, rankQuality),
      selectivePrediction: evidenceRef(
        "selectivePrediction",
        replayBindingId,
        selectivePrediction,
      ),
    },
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
