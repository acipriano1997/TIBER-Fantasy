import crypto from "crypto";
import {
  evaluateCCFPairedBlockBootstrap,
  type CCFPairedBlockBootstrapResult,
} from "./pairedUncertainty";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import type { CCFPromotionCriterionEvidence } from "./promotionEvaluation";
import type {
  CCFRollingValidationBaselineEvidenceV1,
  CCFRollingValidationBaselinePredictionV1,
  CCFNativeBaselineArm,
} from "./rollingValidationBaselineEvidence";
import type { CCFRollingValidationExecutionV1 } from "./rollingValidationExecution";

export interface CCFRollingValidationCriterionEvidenceV1 {
  contractVersion: "ccf-rolling-validation-criterion-evidence-v1";
  criterion: CCFPromotionCriterionEvidence;
  uncertainty: CCFPairedBlockBootstrapResult;
  evidenceRef: string;
}

export interface CCFRollingValidationPromotionEvidenceV1 {
  contractVersion: "ccf-rolling-validation-promotion-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  criterionEvidence: CCFRollingValidationCriterionEvidenceV1[];
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationPromotionEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  baselineEvidence: CCFRollingValidationBaselineEvidenceV1;
  baselinePredictions: CCFRollingValidationBaselinePredictionV1[];
  protocol: CCFPredictiveValidationProtocol;
}

export class CCFRollingValidationPromotionEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationPromotionEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function supportedComparator(
  arm: string,
): arm is CCFNativeBaselineArm {
  return (
    arm === "historical_mean" ||
    arm === "recent_mean" ||
    arm === "usage_rate"
  );
}

function indexBaselines(
  rows: readonly CCFRollingValidationBaselinePredictionV1[],
): Map<string, CCFRollingValidationBaselinePredictionV1> {
  const indexed = new Map<string, CCFRollingValidationBaselinePredictionV1>();
  for (const row of rows) {
    const key = `${row.rowId}|${row.arm}`;
    if (indexed.has(key)) {
      throw new CCFRollingValidationPromotionEvidenceError(
        `duplicate baseline prediction ${key}`,
      );
    }
    indexed.set(key, row);
  }
  return indexed;
}

function assertBoundInputs(
  input: BuildCCFRollingValidationPromotionEvidenceInput,
  protocolFingerprint: string,
): void {
  if (
    input.execution.finalHoldoutAccessed !== false ||
    input.baselineEvidence.finalHoldoutAccessed !== false
  ) {
    throw new CCFRollingValidationPromotionEvidenceError(
      "promotion evidence cannot consume an opened final holdout",
    );
  }
  if (
    input.execution.certificationOnly !== true ||
    input.baselineEvidence.certificationOnly !== true ||
    input.execution.productionInferenceAuthorized !== false ||
    input.baselineEvidence.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationPromotionEvidenceError(
      "promotion evidence requires certification-only non-production inputs",
    );
  }
  if (
    input.baselineEvidence.replayBindingId !== input.execution.replayBinding.bindingId
  ) {
    throw new CCFRollingValidationPromotionEvidenceError(
      "baseline evidence does not match rolling validation replay binding",
    );
  }
  if (
    input.execution.replayBinding.protocolFingerprint !== protocolFingerprint ||
    input.baselineEvidence.protocolFingerprint !== protocolFingerprint
  ) {
    throw new CCFRollingValidationPromotionEvidenceError(
      "promotion evidence inputs do not match the frozen protocol",
    );
  }
}

function criterionRef(
  replayBindingId: string,
  criterion: CCFPromotionCriterionEvidence,
  uncertainty: CCFPairedBlockBootstrapResult,
): string {
  const payload = JSON.stringify({
    contractVersion: "ccf-rolling-validation-criterion-evidence-v1",
    replayBindingId,
    criterion,
    uncertainty,
  });
  return `ccf://rolling-validation-criterion-evidence/sha256/${sha256(payload)}`;
}

export function buildCCFRollingValidationPromotionEvidence(
  input: BuildCCFRollingValidationPromotionEvidenceInput,
): CCFRollingValidationPromotionEvidenceV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);
  assertBoundInputs(input, protocolFingerprint);

  const baselineByKey = indexBaselines(input.baselinePredictions);
  const armEvidence = new Map(
    input.baselineEvidence.armEvidence.map((row) => [row.arm, row]),
  );

  const supportedCriteria = protocol.promotionCriteria.filter(
    (criterion) =>
      criterion.target === "fantasy_points" &&
      criterion.metric === "mae" &&
      criterion.appliesTo === "overall" &&
      supportedComparator(criterion.comparatorArm),
  );
  if (supportedCriteria.length === 0) {
    throw new CCFRollingValidationPromotionEvidenceError(
      "frozen protocol contains no supported overall fantasy-points MAE criterion",
    );
  }

  const criterionEvidence = supportedCriteria.map(
    (criterion): CCFRollingValidationCriterionEvidenceV1 => {
      const comparatorArm = criterion.comparatorArm as CCFNativeBaselineArm;
      const summary = armEvidence.get(comparatorArm);
      if (!summary) {
        throw new CCFRollingValidationPromotionEvidenceError(
          `baseline evidence is missing arm ${comparatorArm}`,
        );
      }

      const rows = input.execution.predictions.map((prediction) => {
        const baseline = baselineByKey.get(
          `${prediction.rowId}|${comparatorArm}`,
        );
        if (!baseline) {
          throw new CCFRollingValidationPromotionEvidenceError(
            `missing ${comparatorArm} prediction for ${prediction.rowId}`,
          );
        }
        const comparator =
          baseline.predictedFantasyPoints == null
            ? null
            : Math.abs(
                baseline.predictedFantasyPoints - prediction.actualFantasyPoints,
              );
        return {
          blockId: prediction.blockId,
          candidateLoss: Math.abs(
            prediction.predictedFantasyPoints - prediction.actualFantasyPoints,
          ),
          comparatorLoss: comparator,
        };
      });

      const uncertainty = evaluateCCFPairedBlockBootstrap(rows, {
        iterations: protocol.uncertaintyPolicy.iterations,
        confidenceLevel: protocol.uncertaintyPolicy.confidenceLevel,
        seed: [
          protocol.uncertaintyPolicy.deterministicSeed,
          criterion.criterionId,
          input.execution.replayBinding.bindingId,
        ].join(":"),
        minimumBlocks: Math.max(
          2,
          protocol.samplePolicy.minimumIndependentTimeBlocks,
        ),
      });

      if (
        uncertainty.candidateMeanLoss == null ||
        uncertainty.comparatorMeanLoss == null
      ) {
        throw new CCFRollingValidationPromotionEvidenceError(
          `criterion ${criterion.criterionId} has no paired finite observations`,
        );
      }
      if (
        uncertainty.pairedSampleSize !== summary.pairedRows ||
        uncertainty.independentBlockCount !== summary.independentTimeBlocks
      ) {
        throw new CCFRollingValidationPromotionEvidenceError(
          `criterion ${criterion.criterionId} paired evidence disagrees with baseline summary`,
        );
      }

      const row: CCFPromotionCriterionEvidence = {
        criterionId: criterion.criterionId,
        target: criterion.target,
        metric: criterion.metric,
        comparatorArm,
        candidateArm: "native_candidate",
        candidateValue: uncertainty.candidateMeanLoss,
        comparatorValue: uncertainty.comparatorMeanLoss,
        pairedSampleSize: uncertainty.pairedSampleSize,
        independentTimeBlocks: uncertainty.independentBlockCount,
        confidenceLowerBoundForImprovement: uncertainty.confidenceLower,
        supportedSubgroupsPassed: null,
      };

      return {
        contractVersion: "ccf-rolling-validation-criterion-evidence-v1",
        criterion: row,
        uncertainty,
        evidenceRef: criterionRef(
          input.execution.replayBinding.bindingId,
          row,
          uncertainty,
        ),
      };
    },
  );

  return {
    contractVersion: "ccf-rolling-validation-promotion-evidence-v1",
    replayBindingId: input.execution.replayBinding.bindingId,
    protocolFingerprint,
    criterionEvidence,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
