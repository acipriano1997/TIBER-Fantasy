import crypto from "crypto";
import {
  buildCCFRollingValidationBaselineEvidence,
  type CCFNativeBaselineArm,
  type CCFRollingValidationBaselinePredictionV1,
} from "./rollingValidationBaselineEvidence";
import type {
  CCFRollingValidationExecutionV1,
} from "./rollingValidationExecution";
import {
  evaluateCCFPairedBlockBootstrap,
  type CCFPairedBlockBootstrapResult,
} from "./pairedUncertainty";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictivePromotionCriterion,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import type {
  CCFRollingValidationSubgroupBaselineEvidenceV1,
  CCFRollingValidationSubgroupComparatorRowV1,
} from "./rollingValidationSubgroupBaselineEvidence";

export type CCFRollingValidationSubgroupCriterionStatus =
  | "evaluated"
  | "excluded_underpowered"
  | "report_only_underpowered";

export interface CCFRollingValidationSubgroupCriterionResultV1 {
  contractVersion: "ccf-rolling-validation-subgroup-criterion-result-v1";
  criterionId: string;
  subgroup: string;
  comparatorArm: CCFNativeBaselineArm;
  status: CCFRollingValidationSubgroupCriterionStatus;
  pairedSampleSize: number;
  independentTimeBlocks: number;
  candidateValue: number | null;
  comparatorValue: number | null;
  absoluteImprovement: number | null;
  relativeImprovement: number | null;
  confidenceLowerBoundForImprovement: number | null;
  sampleGatePassed: boolean;
  independentBlockGatePassed: boolean;
  absoluteImprovementGatePassed: boolean;
  relativeImprovementGatePassed: boolean;
  confidenceGatePassed: boolean;
  passed: boolean;
  uncertainty: CCFPairedBlockBootstrapResult | null;
  evidenceRef: string;
}

export interface CCFRollingValidationSubgroupCriterionEvidenceV1 {
  contractVersion: "ccf-rolling-validation-subgroup-criterion-evidence-v1";
  criterionId: string;
  appliesTo: "supported_subgroups" | "both";
  comparatorArm: CCFNativeBaselineArm;
  subgroupResults: CCFRollingValidationSubgroupCriterionResultV1[];
  evaluatedSubgroups: string[];
  underpoweredSubgroups: string[];
  supportedSubgroupsPassed: boolean;
  evidenceRef: string;
}

export interface CCFRollingValidationSubgroupPromotionEvidenceV1 {
  contractVersion: "ccf-rolling-validation-subgroup-promotion-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  dimension: "position";
  criterionEvidence: CCFRollingValidationSubgroupCriterionEvidenceV1[];
  promotionEvaluated: false;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationSubgroupPromotionEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  protocol: CCFPredictiveValidationProtocol;
  baselinePredictions: CCFRollingValidationBaselinePredictionV1[];
  subgroupBaselineEvidence: CCFRollingValidationSubgroupBaselineEvidenceV1;
}

export class CCFRollingValidationSubgroupPromotionEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationSubgroupPromotionEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function supportedComparator(arm: string): arm is CCFNativeBaselineArm {
  return (
    arm === "historical_mean" ||
    arm === "recent_mean" ||
    arm === "usage_rate"
  );
}

function approximatelyEqual(
  left: number | null,
  right: number | null,
  tolerance = 1e-10,
): boolean {
  if (left == null || right == null) return left === right;
  return Math.abs(left - right) <= tolerance;
}

function improvement(
  criterion: CCFPredictivePromotionCriterion,
  candidateValue: number,
  comparatorValue: number,
): number {
  return criterion.direction === "lower_is_better"
    ? comparatorValue - candidateValue
    : candidateValue - comparatorValue;
}

function relativeImprovement(
  absoluteImprovement: number,
  comparatorValue: number,
): number | null {
  const denominator = Math.abs(comparatorValue);
  return denominator > 0 ? absoluteImprovement / denominator : null;
}

function subgroupResultRef(
  replayBindingId: string,
  criterionId: string,
  subgroup: string,
  result: Omit<CCFRollingValidationSubgroupCriterionResultV1, "evidenceRef">,
  sourceEvidenceRef: string,
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-subgroup-criterion-result-v1",
    replayBindingId,
    criterionId,
    subgroup,
    result,
    sourceEvidenceRef,
  });
  return `ccf://rolling-validation-subgroup-criterion-result/sha256/${sha256(canonical)}`;
}

function criterionEvidenceRef(
  replayBindingId: string,
  row: Omit<CCFRollingValidationSubgroupCriterionEvidenceV1, "evidenceRef">,
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-subgroup-criterion-evidence-v1",
    replayBindingId,
    ...row,
  });
  return `ccf://rolling-validation-subgroup-criterion-evidence/sha256/${sha256(canonical)}`;
}

function indexBaselines(
  rows: readonly CCFRollingValidationBaselinePredictionV1[],
): Map<string, CCFRollingValidationBaselinePredictionV1> {
  return new Map(rows.map((row) => [`${row.rowId}|${row.arm}`, row]));
}

function indexSubgroupSummaries(
  evidence: CCFRollingValidationSubgroupBaselineEvidenceV1,
): Map<string, CCFRollingValidationSubgroupComparatorRowV1> {
  const result = new Map<string, CCFRollingValidationSubgroupComparatorRowV1>();
  for (const row of evidence.rows) {
    const key = `${row.subgroup}|${row.arm}`;
    if (result.has(key)) {
      throw new CCFRollingValidationSubgroupPromotionEvidenceError(
        `duplicate subgroup baseline evidence ${key}`,
      );
    }
    result.set(key, row);
  }
  return result;
}

function validateBoundInputs(
  input: BuildCCFRollingValidationSubgroupPromotionEvidenceInput,
  protocolFingerprint: string,
): void {
  const overall = buildCCFRollingValidationBaselineEvidence({
    execution: input.execution,
    protocol: input.protocol,
    baselinePredictions: input.baselinePredictions,
  });

  const subgroup = input.subgroupBaselineEvidence;
  if (
    subgroup.contractVersion !==
      "ccf-rolling-validation-subgroup-baseline-evidence-v1" ||
    subgroup.dimension !== "position" ||
    subgroup.promotionEvaluated !== false
  ) {
    throw new CCFRollingValidationSubgroupPromotionEvidenceError(
      "paired position subgroup baseline evidence is required",
    );
  }
  if (
    subgroup.replayBindingId !== overall.replayBindingId ||
    subgroup.protocolFingerprint !== protocolFingerprint
  ) {
    throw new CCFRollingValidationSubgroupPromotionEvidenceError(
      "subgroup baseline evidence does not match the rolling validation packet",
    );
  }
  if (
    subgroup.finalHoldoutAccessed !== false ||
    subgroup.certificationOnly !== true ||
    subgroup.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationSubgroupPromotionEvidenceError(
      "subgroup promotion evidence requires sealed-holdout certification-only inputs",
    );
  }
}

function buildResult(
  input: BuildCCFRollingValidationSubgroupPromotionEvidenceInput,
  criterion: CCFPredictivePromotionCriterion,
  subgroup: string,
  comparatorArm: CCFNativeBaselineArm,
  summary: CCFRollingValidationSubgroupComparatorRowV1,
  baselineByKey: ReadonlyMap<string, CCFRollingValidationBaselinePredictionV1>,
): CCFRollingValidationSubgroupCriterionResultV1 {
  const predictions = input.execution.predictions.filter(
    (prediction) => prediction.outcome.position === subgroup,
  );
  const pairedRows = predictions.map((prediction) => {
    const baseline = baselineByKey.get(
      `${prediction.rowId}|${comparatorArm}`,
    );
    if (!baseline) {
      throw new CCFRollingValidationSubgroupPromotionEvidenceError(
        `missing ${comparatorArm} baseline prediction for ${prediction.rowId}`,
      );
    }
    return {
      blockId: prediction.blockId,
      candidateLoss: Math.abs(
        prediction.predictedFantasyPoints - prediction.actualFantasyPoints,
      ),
      comparatorLoss:
        baseline.predictedFantasyPoints == null
          ? null
          : Math.abs(
              baseline.predictedFantasyPoints - prediction.actualFantasyPoints,
            ),
    };
  });

  const uncertainty = evaluateCCFPairedBlockBootstrap(pairedRows, {
    iterations: input.protocol.uncertaintyPolicy.iterations,
    confidenceLevel: input.protocol.uncertaintyPolicy.confidenceLevel,
    seed: [
      input.protocol.uncertaintyPolicy.deterministicSeed,
      criterion.criterionId,
      subgroup,
      input.execution.replayBinding.bindingId,
    ].join(":"),
    minimumBlocks: Math.max(
      2,
      input.protocol.samplePolicy.minimumIndependentTimeBlocks,
    ),
  });

  if (
    uncertainty.pairedSampleSize !== summary.pairedRows ||
    uncertainty.independentBlockCount !== summary.independentTimeBlocks ||
    !approximatelyEqual(uncertainty.candidateMeanLoss, summary.candidateMae) ||
    !approximatelyEqual(uncertainty.comparatorMeanLoss, summary.comparatorMae)
  ) {
    throw new CCFRollingValidationSubgroupPromotionEvidenceError(
      `subgroup ${subgroup}/${comparatorArm} paired evidence disagrees with subgroup baseline summary`,
    );
  }

  const sampleGatePassed =
    uncertainty.pairedSampleSize >= input.protocol.samplePolicy.minimumSubgroupRows;
  const independentBlockGatePassed =
    uncertainty.independentBlockCount >=
    input.protocol.samplePolicy.minimumIndependentTimeBlocks;
  const eligible = sampleGatePassed && independentBlockGatePassed;

  if (
    !eligible &&
    input.protocol.samplePolicy.underpoweredSubgroupTreatment === "pool"
  ) {
    throw new CCFRollingValidationSubgroupPromotionEvidenceError(
      "underpowered subgroup pooling semantics are not frozen for rolling promotion evidence",
    );
  }

  const candidateValue = uncertainty.candidateMeanLoss;
  const comparatorValue = uncertainty.comparatorMeanLoss;
  const absolute =
    candidateValue == null || comparatorValue == null
      ? null
      : improvement(criterion, candidateValue, comparatorValue);
  const relative =
    absolute == null || comparatorValue == null
      ? null
      : relativeImprovement(absolute, comparatorValue);

  const absoluteImprovementGatePassed =
    eligible &&
    absolute != null &&
    (criterion.minimumAbsoluteImprovement == null ||
      absolute >= criterion.minimumAbsoluteImprovement);
  const relativeImprovementGatePassed =
    eligible &&
    (criterion.minimumRelativeImprovement == null ||
      (relative != null && relative >= criterion.minimumRelativeImprovement));
  const confidenceGatePassed =
    eligible &&
    (!criterion.confidenceLowerBoundMustBeatZero ||
      (uncertainty.confidenceLower != null &&
        uncertainty.confidenceLower > 0));

  const status: CCFRollingValidationSubgroupCriterionStatus = eligible
    ? "evaluated"
    : input.protocol.samplePolicy.underpoweredSubgroupTreatment ===
        "exclude_from_promotion"
      ? "excluded_underpowered"
      : "report_only_underpowered";
  const passed =
    status === "evaluated" &&
    absoluteImprovementGatePassed &&
    relativeImprovementGatePassed &&
    confidenceGatePassed;

  const withoutRef: Omit<
    CCFRollingValidationSubgroupCriterionResultV1,
    "evidenceRef"
  > = {
    contractVersion: "ccf-rolling-validation-subgroup-criterion-result-v1",
    criterionId: criterion.criterionId,
    subgroup,
    comparatorArm,
    status,
    pairedSampleSize: uncertainty.pairedSampleSize,
    independentTimeBlocks: uncertainty.independentBlockCount,
    candidateValue,
    comparatorValue,
    absoluteImprovement: absolute,
    relativeImprovement: relative,
    confidenceLowerBoundForImprovement: uncertainty.confidenceLower,
    sampleGatePassed,
    independentBlockGatePassed,
    absoluteImprovementGatePassed,
    relativeImprovementGatePassed,
    confidenceGatePassed,
    passed,
    uncertainty,
  };

  return {
    ...withoutRef,
    evidenceRef: subgroupResultRef(
      input.execution.replayBinding.bindingId,
      criterion.criterionId,
      subgroup,
      withoutRef,
      summary.evidenceRef,
    ),
  };
}

/**
 * Evaluate only frozen subgroup promotion criteria against paired native
 * baseline evidence within each observed position. This produces subgroup
 * criterion evidence, not the top-level predictive promotion verdict.
 *
 * Underpowered groups follow the protocol's frozen treatment. Pooling fails
 * closed until an explicit pooling contract exists.
 */
export function buildCCFRollingValidationSubgroupPromotionEvidence(
  input: BuildCCFRollingValidationSubgroupPromotionEvidenceInput,
): CCFRollingValidationSubgroupPromotionEvidenceV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);
  validateBoundInputs(input, protocolFingerprint);

  const criteria = protocol.promotionCriteria.filter(
    (criterion) =>
      criterion.appliesTo !== "overall" &&
      criterion.target === "fantasy_points" &&
      criterion.metric === "mae" &&
      supportedComparator(criterion.comparatorArm),
  );
  if (criteria.length === 0) {
    throw new CCFRollingValidationSubgroupPromotionEvidenceError(
      "frozen protocol contains no supported position subgroup MAE promotion criterion",
    );
  }

  const baselineByKey = indexBaselines(input.baselinePredictions);
  const summaryByKey = indexSubgroupSummaries(
    input.subgroupBaselineEvidence,
  );
  const subgroups = Array.from(
    new Set(
      input.execution.predictions.map(
        (prediction) => prediction.outcome.position,
      ),
    ),
  ).sort();

  const criterionEvidence = criteria.map(
    (criterion): CCFRollingValidationSubgroupCriterionEvidenceV1 => {
      const comparatorArm = criterion.comparatorArm as CCFNativeBaselineArm;
      const subgroupResults = subgroups.map((subgroup) => {
        const summary = summaryByKey.get(
          `${subgroup}|${comparatorArm}`,
        );
        if (!summary) {
          throw new CCFRollingValidationSubgroupPromotionEvidenceError(
            `missing subgroup baseline evidence for ${subgroup}/${comparatorArm}`,
          );
        }
        return buildResult(
          input,
          criterion,
          subgroup,
          comparatorArm,
          summary,
          baselineByKey,
        );
      });

      const evaluated = subgroupResults.filter(
        (row) => row.status === "evaluated",
      );
      const underpowered = subgroupResults.filter(
        (row) => row.status !== "evaluated",
      );
      const reportOnlyUnderpowered = subgroupResults.some(
        (row) => row.status === "report_only_underpowered",
      );
      const supportedSubgroupsPassed =
        evaluated.length > 0 &&
        evaluated.every((row) => row.passed) &&
        !reportOnlyUnderpowered;

      const withoutRef: Omit<
        CCFRollingValidationSubgroupCriterionEvidenceV1,
        "evidenceRef"
      > = {
        contractVersion:
          "ccf-rolling-validation-subgroup-criterion-evidence-v1",
        criterionId: criterion.criterionId,
        appliesTo: criterion.appliesTo as "supported_subgroups" | "both",
        comparatorArm,
        subgroupResults,
        evaluatedSubgroups: evaluated.map((row) => row.subgroup).sort(),
        underpoweredSubgroups: underpowered
          .map((row) => row.subgroup)
          .sort(),
        supportedSubgroupsPassed,
      };

      return {
        ...withoutRef,
        evidenceRef: criterionEvidenceRef(
          input.execution.replayBinding.bindingId,
          withoutRef,
        ),
      };
    },
  );

  return {
    contractVersion:
      "ccf-rolling-validation-subgroup-promotion-evidence-v1",
    replayBindingId: input.execution.replayBinding.bindingId,
    protocolFingerprint,
    dimension: "position",
    criterionEvidence,
    promotionEvaluated: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
