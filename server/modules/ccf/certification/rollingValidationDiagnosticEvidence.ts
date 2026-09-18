import crypto from "crypto";
import { evaluateCCFIntervalCalibration, type CCFIntervalCalibrationMetrics } from "./calibration";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveMetric,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import { evaluateCCFQuantileScoring, type CCFQuantileScoringMetrics } from "./quantileScoring";
import { evaluateCCFRankMetrics } from "./rankMetrics";
import {
  evaluateCCFSelectivePrediction,
  type CCFSelectivePredictionMetrics,
} from "./selectivePrediction";
import type { CCFRollingValidationExecutionV1 } from "./rollingValidationExecution";
import { validateCCFPlayerOutcome } from "../outcomes/contract";

const SUPPORTED_DIAGNOSTIC_METRICS = new Set<CCFPredictiveMetric>([
  "rank_spearman",
  "rank_kendall",
  "pinball_loss",
  "interval_coverage",
  "abstention_selectivity",
]);

export interface CCFRollingValidationRankBlockEvidenceV1 {
  contractVersion: "ccf-rolling-validation-rank-block-evidence-v1";
  blockId: string;
  sampleSize: number;
  spearman: number | null;
  kendallTauB: number | null;
  concordantPairs: number;
  discordantPairs: number;
}

export interface CCFRollingValidationSelectiveEvidenceV1 {
  contractVersion: "ccf-rolling-validation-selective-evidence-v1";
  selectionScoreField: "outcome.confidence";
  abstainedCount: number;
  metrics: CCFSelectivePredictionMetrics;
}

export interface CCFRollingValidationDiagnosticEvidenceV1 {
  contractVersion: "ccf-rolling-validation-diagnostic-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  declaredMetrics: CCFPredictiveMetric[];
  rankByBlock: CCFRollingValidationRankBlockEvidenceV1[] | null;
  quantileScoring: CCFQuantileScoringMetrics | null;
  intervalCalibration: CCFIntervalCalibrationMetrics | null;
  selectivePrediction: CCFRollingValidationSelectiveEvidenceV1 | null;
  evidenceRef: string;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationDiagnosticEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  protocol: CCFPredictiveValidationProtocol;
}

export class CCFRollingValidationDiagnosticEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationDiagnosticEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function declaredDiagnosticMetrics(
  protocol: CCFPredictiveValidationProtocol,
): CCFPredictiveMetric[] {
  return Array.from(
    new Set([...protocol.primaryMetrics, ...protocol.secondaryMetrics].filter((metric) =>
      SUPPORTED_DIAGNOSTIC_METRICS.has(metric),
    )),
  ).sort();
}

function validateExecution(
  execution: CCFRollingValidationExecutionV1,
  protocol: CCFPredictiveValidationProtocol,
  protocolFingerprint: string,
): CCFRollingValidationExecutionV1["predictions"] {
  if (execution.contractVersion !== "ccf-rolling-validation-execution-v1") {
    throw new CCFRollingValidationDiagnosticEvidenceError(
      "unsupported rolling validation execution version",
    );
  }
  if (
    execution.finalHoldoutAccessed !== false ||
    execution.certificationOnly !== true ||
    execution.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationDiagnosticEvidenceError(
      "diagnostic evidence requires sealed-holdout certification-only execution",
    );
  }
  if (execution.replayBinding.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingValidationDiagnosticEvidenceError(
      "rolling validation execution does not match the frozen protocol",
    );
  }
  if (execution.predictions.length === 0) {
    throw new CCFRollingValidationDiagnosticEvidenceError(
      "rolling validation execution must contain predictions",
    );
  }

  const seen = new Set<string>();
  const predictions = [...execution.predictions].sort((left, right) =>
    left.rowId.localeCompare(right.rowId),
  );
  for (const prediction of predictions) {
    if (!prediction.rowId.trim()) {
      throw new CCFRollingValidationDiagnosticEvidenceError("prediction rowId is required");
    }
    if (seen.has(prediction.rowId)) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `duplicate validation prediction ${prediction.rowId}`,
      );
    }
    seen.add(prediction.rowId);
    if (prediction.replayBindingId !== execution.replayBinding.bindingId) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `prediction ${prediction.rowId} does not match the replay binding`,
      );
    }
    if (!Number.isFinite(prediction.actualFantasyPoints)) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `prediction ${prediction.rowId} actual fantasy points must be finite`,
      );
    }

    const outcome = validateCCFPlayerOutcome(prediction.outcome);
    if (outcome.modelVersion !== protocol.modelVersion) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `prediction ${prediction.rowId} model version does not match the frozen protocol`,
      );
    }
    if (prediction.blockId !== `${outcome.season}-W${outcome.week}`) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `prediction ${prediction.rowId} blockId does not match its outcome season/week`,
      );
    }
    if (prediction.abstained !== outcome.abstain) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `prediction ${prediction.rowId} abstention state does not match its outcome`,
      );
    }
    const expectedPoint =
      execution.pointEstimate === "mean_fpts" ? outcome.meanFpts : outcome.medianFpts;
    if (prediction.predictedFantasyPoints !== expectedPoint) {
      throw new CCFRollingValidationDiagnosticEvidenceError(
        `prediction ${prediction.rowId} point estimate does not match its outcome`,
      );
    }
  }
  return predictions;
}

function buildRankEvidence(
  predictions: CCFRollingValidationExecutionV1["predictions"],
  declared: ReadonlySet<CCFPredictiveMetric>,
): CCFRollingValidationRankBlockEvidenceV1[] | null {
  const wantsSpearman = declared.has("rank_spearman");
  const wantsKendall = declared.has("rank_kendall");
  if (!wantsSpearman && !wantsKendall) return null;

  const byBlock = new Map<string, CCFRollingValidationExecutionV1["predictions"]>();
  for (const prediction of predictions) {
    const rows = byBlock.get(prediction.blockId) ?? [];
    rows.push(prediction);
    byBlock.set(prediction.blockId, rows);
  }

  return Array.from(byBlock.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([blockId, rows]) => {
      const metrics = evaluateCCFRankMetrics(
        rows.map((row) => ({
          actual: row.actualFantasyPoints,
          predicted: row.predictedFantasyPoints,
        })),
      );
      return {
        contractVersion: "ccf-rolling-validation-rank-block-evidence-v1" as const,
        blockId,
        sampleSize: metrics.sampleSize,
        spearman: wantsSpearman ? metrics.spearman : null,
        kendallTauB: wantsKendall ? metrics.kendallTauB : null,
        concordantPairs: metrics.concordantPairs,
        discordantPairs: metrics.discordantPairs,
      };
    });
}

function buildQuantileScoring(
  predictions: CCFRollingValidationExecutionV1["predictions"],
): CCFQuantileScoringMetrics {
  return evaluateCCFQuantileScoring(
    predictions.flatMap((prediction) => [
      { actual: prediction.actualFantasyPoints, predicted: prediction.outcome.p10Fpts, quantile: 0.1 },
      { actual: prediction.actualFantasyPoints, predicted: prediction.outcome.p25Fpts, quantile: 0.25 },
      { actual: prediction.actualFantasyPoints, predicted: prediction.outcome.medianFpts, quantile: 0.5 },
      { actual: prediction.actualFantasyPoints, predicted: prediction.outcome.p75Fpts, quantile: 0.75 },
      { actual: prediction.actualFantasyPoints, predicted: prediction.outcome.p90Fpts, quantile: 0.9 },
    ]),
  );
}

function evidenceRef(
  replayBindingId: string,
  protocolFingerprint: string,
  declaredMetrics: readonly CCFPredictiveMetric[],
  rankByBlock: CCFRollingValidationRankBlockEvidenceV1[] | null,
  quantileScoring: CCFQuantileScoringMetrics | null,
  intervalCalibration: CCFIntervalCalibrationMetrics | null,
  selectivePrediction: CCFRollingValidationSelectiveEvidenceV1 | null,
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-diagnostic-evidence-v1",
    replayBindingId,
    protocolFingerprint,
    declaredMetrics,
    rankByBlock,
    quantileScoring,
    intervalCalibration,
    selectivePrediction,
  });
  return `ccf://rolling-validation-diagnostic-evidence/sha256/${sha256(canonical)}`;
}

/**
 * Derive only diagnostics predeclared by the frozen predictive-validation
 * protocol. The same manifest-bound prediction packet is consumed for every
 * metric, the final holdout remains sealed, and this report cannot authorize
 * production inference or promotion.
 *
 * Probability calibration is deliberately excluded until boom/bust/near-zero
 * realized-event labels are frozen. Lineup regret is deliberately excluded
 * until historical decision/action evidence is frozen.
 */
export function buildCCFRollingValidationDiagnosticEvidence(
  input: BuildCCFRollingValidationDiagnosticEvidenceInput,
): CCFRollingValidationDiagnosticEvidenceV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);
  const declaredMetrics = declaredDiagnosticMetrics(protocol);
  if (declaredMetrics.length === 0) {
    throw new CCFRollingValidationDiagnosticEvidenceError(
      "frozen protocol declares no supported rolling diagnostic metrics",
    );
  }
  const predictions = validateExecution(input.execution, protocol, protocolFingerprint);
  const declared = new Set(declaredMetrics);

  const rankByBlock = buildRankEvidence(predictions, declared);
  const quantileScoring = declared.has("pinball_loss")
    ? buildQuantileScoring(predictions)
    : null;
  const intervalCalibration = declared.has("interval_coverage")
    ? evaluateCCFIntervalCalibration(
        predictions.map((prediction) => ({
          actual: prediction.actualFantasyPoints,
          p10: prediction.outcome.p10Fpts,
          p50: prediction.outcome.medianFpts,
          p90: prediction.outcome.p90Fpts,
        })),
      )
    : null;
  const selectivePrediction = declared.has("abstention_selectivity")
    ? {
        contractVersion: "ccf-rolling-validation-selective-evidence-v1" as const,
        selectionScoreField: "outcome.confidence" as const,
        abstainedCount: predictions.filter((prediction) => prediction.abstained).length,
        metrics: evaluateCCFSelectivePrediction(
          predictions.map((prediction) => ({
            observationId: prediction.rowId,
            loss: Math.abs(
              prediction.predictedFantasyPoints - prediction.actualFantasyPoints,
            ),
            selectionScore: prediction.outcome.confidence,
          })),
        ),
      }
    : null;

  return {
    contractVersion: "ccf-rolling-validation-diagnostic-evidence-v1",
    replayBindingId: input.execution.replayBinding.bindingId,
    protocolFingerprint,
    declaredMetrics,
    rankByBlock,
    quantileScoring,
    intervalCalibration,
    selectivePrediction,
    evidenceRef: evidenceRef(
      input.execution.replayBinding.bindingId,
      protocolFingerprint,
      declaredMetrics,
      rankByBlock,
      quantileScoring,
      intervalCalibration,
      selectivePrediction,
    ),
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
