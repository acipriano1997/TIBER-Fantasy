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
  CCFRollingValidationCriterionEvidenceV1,
  CCFRollingValidationPromotionEvidenceV1,
} from "./rollingValidationPromotionEvidence";
import type {
  CCFRollingValidationSubgroupCriterionEvidenceV1,
  CCFRollingValidationSubgroupPromotionEvidenceV1,
} from "./rollingValidationSubgroupPromotionEvidence";

export interface CCFRollingValidationBoundCriterionEvidenceV1 {
  contractVersion: "ccf-rolling-validation-bound-criterion-evidence-v1";
  criterion: CCFPromotionCriterionEvidence;
  overallCriterionEvidenceRef: string;
  subgroupCriterionEvidenceRef: string | null;
  evidenceRef: string;
}

export interface CCFRollingValidationPromotionEvaluationV1 {
  contractVersion: "ccf-rolling-validation-promotion-evaluation-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  boundCriterionEvidence: CCFRollingValidationBoundCriterionEvidenceV1[];
  evaluation: CCFPredictivePromotionEvaluation;
  validationCriteriaEvaluated: true;
  validationCriteriaPassed: boolean;
  finalHoldoutAccessed: false;
  finalHoldoutEvaluationPerformed: false;
  productionCertificationAuthorized: false;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationPromotionEvaluationInput {
  protocol: CCFPredictiveValidationProtocol;
  overallEvidence: CCFRollingValidationPromotionEvidenceV1;
  subgroupEvidence?: CCFRollingValidationSubgroupPromotionEvidenceV1 | null;
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
  rows: readonly CCFRollingValidationCriterionEvidenceV1[],
): Map<string, CCFRollingValidationCriterionEvidenceV1> {
  const result = new Map<string, CCFRollingValidationCriterionEvidenceV1>();
  for (const row of rows) {
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
  rows: readonly CCFRollingValidationSubgroupCriterionEvidenceV1[],
): Map<string, CCFRollingValidationSubgroupCriterionEvidenceV1> {
  const result =
    new Map<string, CCFRollingValidationSubgroupCriterionEvidenceV1>();
  for (const row of rows) {
    if (result.has(row.criterionId)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `duplicate subgroup criterion evidence ${row.criterionId}`,
      );
    }
    result.set(row.criterionId, row);
  }
  return result;
}

function boundEvidenceRef(
  replayBindingId: string,
  criterion: CCFPromotionCriterionEvidence,
  overallCriterionEvidenceRef: string,
  subgroupCriterionEvidenceRef: string | null,
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-bound-criterion-evidence-v1",
    replayBindingId,
    criterion,
    overallCriterionEvidenceRef,
    subgroupCriterionEvidenceRef,
  });
  return `ccf://rolling-validation-bound-criterion-evidence/sha256/${sha256(canonical)}`;
}

function validateOverallEvidence(
  evidence: CCFRollingValidationPromotionEvidenceV1,
  protocolFingerprint: string,
): void {
  if (
    evidence.contractVersion !==
      "ccf-rolling-validation-promotion-evidence-v1" ||
    evidence.finalHoldoutAccessed !== false ||
    evidence.certificationOnly !== true ||
    evidence.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "overall validation evidence must be sealed-holdout certification-only evidence",
    );
  }
  if (evidence.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "overall validation evidence does not match the frozen protocol",
    );
  }
}

function validateSubgroupEvidence(
  evidence: CCFRollingValidationSubgroupPromotionEvidenceV1,
  replayBindingId: string,
  protocolFingerprint: string,
): void {
  if (
    evidence.contractVersion !==
      "ccf-rolling-validation-subgroup-promotion-evidence-v1" ||
    evidence.dimension !== "position" ||
    evidence.promotionEvaluated !== false ||
    evidence.finalHoldoutAccessed !== false ||
    evidence.certificationOnly !== true ||
    evidence.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "subgroup validation evidence must be sealed-holdout report evidence",
    );
  }
  if (
    evidence.replayBindingId !== replayBindingId ||
    evidence.protocolFingerprint !== protocolFingerprint
  ) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "subgroup validation evidence does not match the overall validation packet",
    );
  }
}

/**
 * Bind overall numeric criterion evidence to subgroup criterion evidence when
 * the frozen protocol requires it, then run the existing promotion evaluator
 * on the validation fold only.
 *
 * A passing result here is not a production certification or final-holdout
 * result. It only records whether the already-frozen validation criteria pass.
 */
export function buildCCFRollingValidationPromotionEvaluation(
  input: BuildCCFRollingValidationPromotionEvaluationInput,
): CCFRollingValidationPromotionEvaluationV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);
  validateOverallEvidence(input.overallEvidence, protocolFingerprint);

  const needsSubgroups = protocol.promotionCriteria.some(
    (criterion) => criterion.appliesTo !== "overall",
  );
  if (needsSubgroups && !input.subgroupEvidence) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "frozen subgroup-bound criteria require subgroup promotion evidence",
    );
  }
  if (input.subgroupEvidence) {
    validateSubgroupEvidence(
      input.subgroupEvidence,
      input.overallEvidence.replayBindingId,
      protocolFingerprint,
    );
  }

  const overallById = indexOverall(
    input.overallEvidence.criterionEvidence,
  );
  const subgroupById = indexSubgroups(
    input.subgroupEvidence?.criterionEvidence ?? [],
  );

  const expectedIds = new Set(
    protocol.promotionCriteria.map((criterion) => criterion.criterionId),
  );
  for (const id of overallById.keys()) {
    if (!expectedIds.has(id)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `unexpected overall criterion evidence ${id}`,
      );
    }
  }
  for (const id of subgroupById.keys()) {
    if (!expectedIds.has(id)) {
      throw new CCFRollingValidationPromotionEvaluationError(
        `unexpected subgroup criterion evidence ${id}`,
      );
    }
  }

  const boundCriterionEvidence =
    protocol.promotionCriteria.map(
      (criterion): CCFRollingValidationBoundCriterionEvidenceV1 => {
        const overall = overallById.get(criterion.criterionId);
        if (!overall) {
          throw new CCFRollingValidationPromotionEvaluationError(
            `missing overall criterion evidence ${criterion.criterionId}`,
          );
        }
        if (
          overall.criterion.target !== criterion.target ||
          overall.criterion.metric !== criterion.metric ||
          overall.criterion.comparatorArm !== criterion.comparatorArm ||
          overall.criterion.candidateArm !== criterion.candidateArm
        ) {
          throw new CCFRollingValidationPromotionEvaluationError(
            `overall criterion evidence ${criterion.criterionId} does not match the frozen criterion`,
          );
        }

        let subgroupRef: string | null = null;
        let supportedSubgroupsPassed: boolean | null = null;
        if (criterion.appliesTo !== "overall") {
          const subgroup = subgroupById.get(criterion.criterionId);
          if (!subgroup) {
            throw new CCFRollingValidationPromotionEvaluationError(
              `missing subgroup criterion evidence ${criterion.criterionId}`,
            );
          }
          if (
            subgroup.appliesTo !== criterion.appliesTo ||
            subgroup.comparatorArm !== criterion.comparatorArm
          ) {
            throw new CCFRollingValidationPromotionEvaluationError(
              `subgroup criterion evidence ${criterion.criterionId} does not match the frozen criterion`,
            );
          }
          subgroupRef = subgroup.evidenceRef;
          supportedSubgroupsPassed = subgroup.supportedSubgroupsPassed;
        }

        const bound: CCFPromotionCriterionEvidence = {
          ...overall.criterion,
          supportedSubgroupsPassed,
        };
        return {
          contractVersion:
            "ccf-rolling-validation-bound-criterion-evidence-v1",
          criterion: bound,
          overallCriterionEvidenceRef: overall.evidenceRef,
          subgroupCriterionEvidenceRef: subgroupRef,
          evidenceRef: boundEvidenceRef(
            input.overallEvidence.replayBindingId,
            bound,
            overall.evidenceRef,
            subgroupRef,
          ),
        };
      },
    );

  const evaluation = evaluateCCFPredictivePromotion(
    protocol,
    boundCriterionEvidence.map((row) => row.criterion),
  );

  if (evaluation.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingValidationPromotionEvaluationError(
      "promotion evaluator returned a mismatched protocol fingerprint",
    );
  }

  return {
    contractVersion:
      "ccf-rolling-validation-promotion-evaluation-v1",
    replayBindingId: input.overallEvidence.replayBindingId,
    protocolFingerprint,
    boundCriterionEvidence,
    evaluation,
    validationCriteriaEvaluated: true,
    validationCriteriaPassed: evaluation.passed,
    finalHoldoutAccessed: false,
    finalHoldoutEvaluationPerformed: false,
    productionCertificationAuthorized: false,
    productionInferenceAuthorized: false,
  };
}
