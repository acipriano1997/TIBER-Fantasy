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
  candidateValue: number;
  comparatorValue: number;
  pairedSampleSize: number;
  independentTimeBlocks: number;
  confidenceLowerBoundForImprovement: number | null;
  supportedSubgroupsPassed: boolean | null;
}

export interface CCFPromotionCriterionResult {
  criterionId: string;
  absoluteImprovement: number;
  relativeImprovement: number | null;
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

function relativeImprovement(absoluteImprovement: number, comparatorValue: number): number | null {
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

export function evaluateCCFPredictivePromotion(
  protocol: CCFPredictiveValidationProtocol,
  evidence: readonly CCFPromotionCriterionEvidence[],
): CCFPredictivePromotionEvaluation {
  validateCCFPredictiveValidationProtocol(protocol);
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);

  const evidenceById = new Map<string, CCFPromotionCriterionEvidence>();
  for (const row of evidence) {
    if (!row.criterionId.trim()) throw new Error("criterionId is required");
    if (evidenceById.has(row.criterionId)) throw new Error(`duplicate criterion evidence ${row.criterionId}`);
    if (!Number.isFinite(row.candidateValue) || !Number.isFinite(row.comparatorValue)) {
      throw new Error(`${row.criterionId} candidate/comparator values must be finite`);
    }
    if (!Number.isInteger(row.pairedSampleSize) || row.pairedSampleSize < 0) {
      throw new Error(`${row.criterionId} pairedSampleSize must be a non-negative integer`);
    }
    if (!Number.isInteger(row.independentTimeBlocks) || row.independentTimeBlocks < 0) {
      throw new Error(`${row.criterionId} independentTimeBlocks must be a non-negative integer`);
    }
    if (
      row.confidenceLowerBoundForImprovement != null &&
      !Number.isFinite(row.confidenceLowerBoundForImprovement)
    ) {
      throw new Error(`${row.criterionId} confidence lower bound must be finite when provided`);
    }
    evidenceById.set(row.criterionId, row);
  }

  const expectedIds = new Set(protocol.promotionCriteria.map((criterion) => criterion.criterionId));
  for (const id of evidenceById.keys()) {
    if (!expectedIds.has(id)) throw new Error(`unexpected criterion evidence ${id}`);
  }

  const criterionResults = protocol.promotionCriteria.map((criterion) => {
    const row = evidenceById.get(criterion.criterionId);
    if (!row) throw new Error(`missing criterion evidence ${criterion.criterionId}`);
    assertEvidenceIdentity(criterion, row);

    const absoluteImprovement = improvement(criterion, row.candidateValue, row.comparatorValue);
    const relative = relativeImprovement(absoluteImprovement, row.comparatorValue);
    const sampleGatePassed =
      row.pairedSampleSize >= protocol.samplePolicy.minimumOverallPairedRows;
    const independentBlockGatePassed =
      row.independentTimeBlocks >= protocol.samplePolicy.minimumIndependentTimeBlocks;
    const absoluteImprovementGatePassed =
      criterion.minimumAbsoluteImprovement == null ||
      absoluteImprovement >= criterion.minimumAbsoluteImprovement;
    const relativeImprovementGatePassed =
      criterion.minimumRelativeImprovement == null ||
      (relative != null && relative >= criterion.minimumRelativeImprovement);
    const confidenceGatePassed =
      !criterion.confidenceLowerBoundMustBeatZero ||
      (row.confidenceLowerBoundForImprovement != null &&
        row.confidenceLowerBoundForImprovement > 0);
    const subgroupGatePassed =
      criterion.appliesTo === "overall" || row.supportedSubgroupsPassed === true;

    return {
      criterionId: criterion.criterionId,
      absoluteImprovement,
      relativeImprovement: relative,
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
