import crypto from "crypto";
import {
  evaluateCCFPredictivePromotion,
  type CCFPredictivePromotionEvaluation,
  type CCFPromotionCriterionEvidence,
} from "./promotionEvaluation";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import type {
  CCFRollingValidationPromotionEvidenceV1,
} from "./rollingValidationPromotionEvidence";
import type {
  CCFRollingValidationSubgroupPromotionEvidenceV1,
} from "./rollingValidationSubgroupPromotionEvidence";

export interface CCFRollingValidationPromotionEvaluationV1 {
  contractVersion: "ccf-rolling-validation-promotion-evaluation-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  criterionEvidence: CCFPromotionCriterionEvidence[];
  evaluation: CCFPredictivePromotionEvaluation;
  evidenceRefs: string[];
  evidenceRef: string;
  promotionEvaluated: true;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationPromotionEvaluationInput {
  protocol: CCFPredictiveValidationProtocol;
  overallEvidence: CCFRollingValidationPromotionEvidenceV1;
  subgroupEvidence: CCFRollingValidationSubgroupPromotionEvidenceV1;
}

export class CCFRollingValidationPromotionEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationPromotionEvaluationError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function indexOverall(
  evidence: CCFRollingValidationPromotionEvidenceV1,
): Map<string, CCFRollingValidationPromotionEvidenceV1["criterionEvidence"][number]> {
  const result = new Map<
    string,
    CCFRollingValidationPromotionEvidenceV1["criterionEvidence"][number]
  >();
  for (const row of evidence.criterionEvidence) {
    const id = row.criterion.criterionId;
    if (result.has(id)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `duplicate overall criterion evidence ${id}`,
      );
    }
    result.set(id, row);
  }
  return result;
}

function indexSubgroups(
  evidence: CCFRollingValidationSubgroupPromotionEvidenceV1,
): Map<string, CCFRollingValidationSubgroupPromotionEvidenceV1["criterionEvidence"][number]> {
  const result = new Map<
    string,
    CCFRollingValidationSubgroupPromotionEvidenceV1["criterionEvidence"][number]
  >();
  for (const row of evidence.criterionEvidence) {
    if (result.has(row.criterionId)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `duplicate subgroup criterion evidence ${row.criterionId}`,
      );
    }
    result.set(row.criterionId, row);
  }
  return result;
}

function assertBoundInputs(
  input: BuildCCFRollingValidationPromotionEvaluationInput,
  protocolFingerprint: string,
): void {
  const overall = input.overallEvidence;
  const subgroup = input.subgroupEvidence;

  if (
    overall.replayBindingId !== subgroup.replayBindingId ||
    overall.protocolFingerprint !== protocolFingerprint ||
    subgroup.protocolFingerprint !== protocolFingerprint
  ) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "promotion evidence packets do not share one replay binding and frozen protocol",
    );
  }
  if (
    overall.finalHoldoutAccessed !== false ||
    subgroup.finalHoldoutAccessed !== false
  ) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "validation promotion evaluation cannot consume an opened final holdout",
    );
  }
  if (
    overall.certificationOnly !== true ||
    subgroup.certificationOnly !== true ||
    overall.productionInferenceAuthorized !== false ||
    subgroup.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "validation promotion evaluation requires certification-only non-production evidence",
    );
  }
  if (subgroup.promotionEvaluated !== false) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "subgroup packet must remain unevaluated before top-level promotion evaluation",
    );
  }
}

function buildEvidenceRef(
  replayBindingId: string,
  protocolFingerprint: string,
  criterionEvidence: readonly CCFPromotionCriterionEvidence[],
  evaluation: CCFPredictivePromotionEvaluation,
  evidenceRefs: readonly string[],
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-promotion-evaluation-v1",
    replayBindingId,
    protocolFingerprint,
    criterionEvidence,
    evaluation,
    evidenceRefs,
  });
  return `ccf://rolling-validation-promotion-evaluation/sha256/${sha256(canonical)}`;
}

/**
 * Bind overall and supported-subgroup evidence from the same sealed validation
 * replay, then execute the existing frozen promotion evaluator.
 *
 * Overall criteria consume only overall paired evidence. Supported-subgroup
 * criteria consume only subgroup pass/fail evidence. Criteria scoped to both
 * require both packets to pass.
 *
 * This is validation-fold promotion evaluation only. It does not open the
 * one-touch final holdout, create a predictive validation receipt, or grant
 * production inference authority.
 */
export function buildCCFRollingValidationPromotionEvaluation(
  input: BuildCCFRollingValidationPromotionEvaluationInput,
): CCFRollingValidationPromotionEvaluationV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);
  assertBoundInputs(input, protocolFingerprint);

  const overallById = indexOverall(input.overallEvidence);
  const subgroupById = indexSubgroups(input.subgroupEvidence);
  const expectedIds = new Set(
    protocol.promotionCriteria.map((criterion) => criterion.criterionId),
  );

  for (const id of Array.from(overallById.keys())) {
    if (!expectedIds.has(id)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `unexpected overall criterion evidence ${id}`,
      );
    }
  }
  for (const id of Array.from(subgroupById.keys())) {
    if (!expectedIds.has(id)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `unexpected subgroup criterion evidence ${id}`,
      );
    }
  }

  const consumedRefs: string[] = [];
  const criterionEvidence = protocol.promotionCriteria.map(
    (criterion): CCFPromotionCriterionEvidence => {
      const overallRequired = criterion.appliesTo !== "supported_subgroups";
      const subgroupRequired = criterion.appliesTo !== "overall";
      const overall = overallById.get(criterion.criterionId);
      const subgroup = subgroupById.get(criterion.criterionId);

      if (overallRequired && !overall) {
        throw new CCFRollingValidationPromotionEvaluationError(
          `missing overall criterion evidence ${criterion.criterionId}`,
        );
      }
      if (!overallRequired && overall) {
        throw new CCFRollingValidationPromotionEvaluationError(
          `subgroup-only criterion ${criterion.criterionId} must not carry overall promotion evidence`,
        );
      }
      if (subgroupRequired && !subgroup) {
        throw new CCFRollingValidationPromotionEvaluationError(
          `missing subgroup criterion evidence ${criterion.criterionId}`,
        );
      }
      if (!subgroupRequired && subgroup) {
        throw new CCFRollingValidationPromotionEvaluationError(
          `overall-only criterion ${criterion.criterionId} must not carry subgroup promotion evidence`,
        );
      }

      if (overall) consumedRefs.push(overall.evidenceRef);
      if (subgroup) consumedRefs.push(subgroup.evidenceRef);

      if (overall) {
        return {
          ...overall.criterion,
          supportedSubgroupsPassed: subgroupRequired
            ? subgroup!.supportedSubgroupsPassed
            : null,
        };
      }

      return {
        criterionId: criterion.criterionId,
        target: criterion.target,
        metric: criterion.metric,
        comparatorArm: criterion.comparatorArm,
        candidateArm: criterion.candidateArm,
        candidateValue: null,
        comparatorValue: null,
        pairedSampleSize: null,
        independentTimeBlocks: null,
        confidenceLowerBoundForImprovement: null,
        supportedSubgroupsPassed: subgroup!.supportedSubgroupsPassed,
      };
    },
  );

  const evaluation = evaluateCCFPredictivePromotion(
    protocol,
    criterionEvidence,
  );
  const refs = Array.from(new Set(consumedRefs)).sort();

  return {
    contractVersion: "ccf-rolling-validation-promotion-evaluation-v1",
    replayBindingId: input.overallEvidence.replayBindingId,
    protocolFingerprint,
    criterionEvidence,
    evaluation,
    evidenceRefs: refs,
    evidenceRef: buildEvidenceRef(
      input.overallEvidence.replayBindingId,
      protocolFingerprint,
      criterionEvidence,
      evaluation,
      refs,
    ),
    promotionEvaluated: true,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
