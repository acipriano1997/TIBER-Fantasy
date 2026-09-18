import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveMetric,
  type CCFPredictivePromotionCriterion,
  type CCFPredictiveTarget,
  type CCFPredictiveValidationArm,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export interface CCFPromotionCriterionEvidence {
  criterionId: string;
  target: CCFPredictiveTarget;
  metric: CCFPredictiveMetric;
  comparatorArm: CCFPredictiveValidationArm;
  candidateArm: "native_candidate";
  candidateValue: number | null;
  comparatorValue: number | null;
  pairedSampleSize: number | null;
  independentTimeBlocks: number | null;
  confidenceLowerBoundForImprovement: number | null;
  supportedSubgroupsPassed: boolean | null;
}

export interface CCFPromotionCriterionResult {
  criterionId: string;
  absoluteImprovement: number | null;
  relativeImprovement: number | null;
  overallGateApplied: boolean;
  subgroupGateApplied: boolean;
  sampleGatePassed: boolean;
  independentBlockGatePassed: boolean;
  absoluteImprovementGatePassed: boolean;
  relativeImprovementGatePassed: boolean;
  confidenceGatePassed: boolean;
  subgroupGatePassed: boolean;
  passed: boolean;
}

export interface CCFPredictivePromotionEvaluation {
  contractVersion: "ccf-predictive-promotion-evaluation-v1";
  protocolFingerprint: string;
  criterionResults: CCFPromotionCriterionResult[];
  passed: boolean;
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

function assertEvidenceIdentity(
  criterion: CCFPredictivePromotionCriterion,
  row: CCFPromotionCriterionEvidence,
): void {
  if (row.target !== criterion.target) {
    throw new Error(`${criterion.criterionId} target does not match frozen criterion`);
  }
  if (row.metric !== criterion.metric) {
    throw new Error(`${criterion.criterionId} metric does not match frozen criterion`);
  }
  if (row.comparatorArm !== criterion.comparatorArm) {
    throw new Error(`${criterion.criterionId} comparatorArm does not match frozen criterion`);
  }
  if (row.candidateArm !== criterion.candidateArm) {
    throw new Error(`${criterion.criterionId} candidateArm does not match frozen criterion`);
  }
}

function assertOverallEvidence(
  criterion: CCFPredictivePromotionCriterion,
  row: CCFPromotionCriterionEvidence,
): asserts row is CCFPromotionCriterionEvidence & {
  candidateValue: number;
  comparatorValue: number;
  pairedSampleSize: number;
  independentTimeBlocks: number;
} {
  if (
    row.candidateValue == null ||
    row.comparatorValue == null ||
    !Number.isFinite(row.candidateValue) ||
    !Number.isFinite(row.comparatorValue)
  ) {
    throw new Error(
      `${criterion.criterionId} candidate/comparator values must be finite when overall evidence applies`,
    );
  }
  if (
    row.pairedSampleSize == null ||
    !Number.isInteger(row.pairedSampleSize) ||
    row.pairedSampleSize < 0
  ) {
    throw new Error(
      `${criterion.criterionId} pairedSampleSize must be a non-negative integer when overall evidence applies`,
    );
  }
  if (
    row.independentTimeBlocks == null ||
    !Number.isInteger(row.independentTimeBlocks) ||
    row.independentTimeBlocks < 0
  ) {
    throw new Error(
      `${criterion.criterionId} independentTimeBlocks must be a non-negative integer when overall evidence applies`,
    );
  }
  if (
    row.confidenceLowerBoundForImprovement != null &&
    !Number.isFinite(row.confidenceLowerBoundForImprovement)
  ) {
    throw new Error(
      `${criterion.criterionId} confidence lower bound must be finite when provided`,
    );
  }
}

function assertSubgroupOnlyEvidence(
  criterion: CCFPredictivePromotionCriterion,
  row: CCFPromotionCriterionEvidence,
): void {
  if (
    row.candidateValue != null ||
    row.comparatorValue != null ||
    row.pairedSampleSize != null ||
    row.independentTimeBlocks != null ||
    row.confidenceLowerBoundForImprovement != null
  ) {
    throw new Error(
      `${criterion.criterionId} subgroup-only criterion must not carry overall promotion measurements`,
    );
  }
}

function assertSubgroupEvidence(
  criterion: CCFPredictivePromotionCriterion,
  row: CCFPromotionCriterionEvidence,
): void {
  if (typeof row.supportedSubgroupsPassed !== "boolean") {
    throw new Error(
      `${criterion.criterionId} supported subgroup result is required by the frozen criterion`,
    );
  }
}

export function evaluateCCFPredictivePromotion(
  protocol: CCFPredictiveValidationProtocol,
  evidence: readonly CCFPromotionCriterionEvidence[],
): CCFPredictivePromotionEvaluation {
  validateCCFPredictiveValidationProtocol(protocol);
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);

  const evidenceById = new Map<string, CCFPromotionCriterionEvidence>();
  for (const row of evidence) {
    if (!row.criterionId.trim()) throw new Error("criterionId is required");
    if (evidenceById.has(row.criterionId)) {
      throw new Error(`duplicate criterion evidence ${row.criterionId}`);
    }
    evidenceById.set(row.criterionId, row);
  }

  const expectedIds = new Set(
    protocol.promotionCriteria.map((criterion) => criterion.criterionId),
  );
  for (const id of Array.from(evidenceById.keys())) {
    if (!expectedIds.has(id)) {
      throw new Error(`unexpected criterion evidence ${id}`);
    }
  }

  const criterionResults = protocol.promotionCriteria.map((criterion) => {
    const row = evidenceById.get(criterion.criterionId);
    if (!row) throw new Error(`missing criterion evidence ${criterion.criterionId}`);
    assertEvidenceIdentity(criterion, row);

    const overallGateApplied = criterion.appliesTo !== "supported_subgroups";
    const subgroupGateApplied = criterion.appliesTo !== "overall";

    if (overallGateApplied) {
      assertOverallEvidence(criterion, row);
    } else {
      assertSubgroupOnlyEvidence(criterion, row);
    }
    if (subgroupGateApplied) {
      assertSubgroupEvidence(criterion, row);
    } else if (row.supportedSubgroupsPassed != null) {
      throw new Error(
        `${criterion.criterionId} overall-only criterion must not carry subgroup promotion evidence`,
      );
    }

    const candidateValue = overallGateApplied ? row.candidateValue! : null;
    const comparatorValue = overallGateApplied ? row.comparatorValue! : null;
    const pairedSampleSize = overallGateApplied ? row.pairedSampleSize! : null;
    const independentTimeBlocks = overallGateApplied
      ? row.independentTimeBlocks!
      : null;

    const absoluteImprovement = overallGateApplied
      ? improvement(criterion, candidateValue!, comparatorValue!)
      : null;
    const relative = overallGateApplied && absoluteImprovement != null
      ? relativeImprovement(absoluteImprovement, comparatorValue!)
      : null;

    const sampleGatePassed = !overallGateApplied ||
      pairedSampleSize! >= protocol.samplePolicy.minimumOverallPairedRows;
    const independentBlockGatePassed = !overallGateApplied ||
      independentTimeBlocks! >= protocol.samplePolicy.minimumIndependentTimeBlocks;
    const absoluteImprovementGatePassed = !overallGateApplied ||
      criterion.minimumAbsoluteImprovement == null ||
      (absoluteImprovement != null &&
        absoluteImprovement >= criterion.minimumAbsoluteImprovement);
    const relativeImprovementGatePassed = !overallGateApplied ||
      criterion.minimumRelativeImprovement == null ||
      (relative != null && relative >= criterion.minimumRelativeImprovement);
    const confidenceGatePassed = !overallGateApplied ||
      !criterion.confidenceLowerBoundMustBeatZero ||
      (row.confidenceLowerBoundForImprovement != null &&
        row.confidenceLowerBoundForImprovement > 0);
    const subgroupGatePassed = !subgroupGateApplied ||
      row.supportedSubgroupsPassed === true;

    return {
      criterionId: criterion.criterionId,
      absoluteImprovement,
      relativeImprovement: relative,
      overallGateApplied,
      subgroupGateApplied,
      sampleGatePassed,
      independentBlockGatePassed,
      absoluteImprovementGatePassed,
      relativeImprovementGatePassed,
      confidenceGatePassed,
      subgroupGatePassed,
      passed:
        sampleGatePassed &&
        independentBlockGatePassed &&
        absoluteImprovementGatePassed &&
        relativeImprovementGatePassed &&
        confidenceGatePassed &&
        subgroupGatePassed,
    };
  });

  return {
    contractVersion: "ccf-predictive-promotion-evaluation-v1",
    protocolFingerprint,
    criterionResults,
    passed: criterionResults.every((result) => result.passed),
  };
}
