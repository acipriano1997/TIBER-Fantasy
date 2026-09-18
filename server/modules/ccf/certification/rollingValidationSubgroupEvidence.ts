import crypto from "crypto";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import {
  evaluateCCFSubgroupStability,
  type CCFSubgroupStabilityReport,
} from "./subgroupStability";
import type { CCFRollingValidationExecutionV1 } from "./rollingValidationExecution";
import { validateCCFPlayerOutcome } from "../outcomes/contract";

export interface CCFRollingValidationUnderpoweredSubgroupV1 {
  subgroup: string;
  sampleSize: number;
}

export interface CCFRollingValidationSubgroupEvidenceV1 {
  contractVersion: "ccf-rolling-validation-subgroup-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  dimension: "position";
  minimumSubgroupRows: number;
  underpoweredSubgroupTreatment:
    | "report_only"
    | "pool"
    | "exclude_from_promotion";
  report: CCFSubgroupStabilityReport;
  underpoweredSubgroups: CCFRollingValidationUnderpoweredSubgroupV1[];
  evidenceRef: string;
  promotionEvaluated: false;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationSubgroupEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  protocol: CCFPredictiveValidationProtocol;
}

export class CCFRollingValidationSubgroupEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationSubgroupEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validatedPredictions(
  execution: CCFRollingValidationExecutionV1,
  protocol: CCFPredictiveValidationProtocol,
  protocolFingerprint: string,
): CCFRollingValidationExecutionV1["predictions"] {
  if (execution.contractVersion !== "ccf-rolling-validation-execution-v1") {
    throw new CCFRollingValidationSubgroupEvidenceError(
      "unsupported rolling validation execution version",
    );
  }
  if (
    execution.finalHoldoutAccessed !== false ||
    execution.certificationOnly !== true ||
    execution.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationSubgroupEvidenceError(
      "subgroup evidence requires sealed-holdout certification-only execution",
    );
  }
  if (execution.replayBinding.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingValidationSubgroupEvidenceError(
      "rolling validation execution does not match the frozen protocol",
    );
  }
  if (execution.predictions.length === 0) {
    throw new CCFRollingValidationSubgroupEvidenceError(
      "rolling validation execution must contain predictions",
    );
  }

  const seen = new Set<string>();
  const predictions = [...execution.predictions].sort((left, right) =>
    left.rowId.localeCompare(right.rowId),
  );
  for (const prediction of predictions) {
    if (!prediction.rowId.trim()) {
      throw new CCFRollingValidationSubgroupEvidenceError("prediction rowId is required");
    }
    if (seen.has(prediction.rowId)) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `duplicate validation prediction ${prediction.rowId}`,
      );
    }
    seen.add(prediction.rowId);
    if (prediction.replayBindingId !== execution.replayBinding.bindingId) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `prediction ${prediction.rowId} does not match the replay binding`,
      );
    }
    if (!Number.isFinite(prediction.actualFantasyPoints)) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `prediction ${prediction.rowId} actual fantasy points must be finite`,
      );
    }

    const outcome = validateCCFPlayerOutcome(prediction.outcome);
    if (outcome.modelVersion !== protocol.modelVersion) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `prediction ${prediction.rowId} model version does not match the frozen protocol`,
      );
    }
    if (prediction.blockId !== `${outcome.season}-W${outcome.week}`) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `prediction ${prediction.rowId} blockId does not match its outcome season/week`,
      );
    }
    if (prediction.abstained !== outcome.abstain) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `prediction ${prediction.rowId} abstention state does not match its outcome`,
      );
    }
    const expectedPoint =
      execution.pointEstimate === "mean_fpts" ? outcome.meanFpts : outcome.medianFpts;
    if (prediction.predictedFantasyPoints !== expectedPoint) {
      throw new CCFRollingValidationSubgroupEvidenceError(
        `prediction ${prediction.rowId} point estimate does not match its outcome`,
      );
    }
  }
  return predictions;
}

function evidenceRef(
  replayBindingId: string,
  protocolFingerprint: string,
  minimumSubgroupRows: number,
  underpoweredSubgroupTreatment: CCFRollingValidationSubgroupEvidenceV1["underpoweredSubgroupTreatment"],
  report: CCFSubgroupStabilityReport,
  underpoweredSubgroups: readonly CCFRollingValidationUnderpoweredSubgroupV1[],
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-subgroup-evidence-v1",
    replayBindingId,
    protocolFingerprint,
    dimension: "position",
    minimumSubgroupRows,
    underpoweredSubgroupTreatment,
    report,
    underpoweredSubgroups,
    promotionEvaluated: false,
  });
  return `ccf://rolling-validation-subgroup-evidence/sha256/${sha256(canonical)}`;
}

/**
 * Produce report-only position subgroup stability from the same sealed,
 * manifest-bound rolling validation execution used by the primary evidence
 * path. Underpowered positions remain explicit and no subgroup promotion
 * verdict is inferred here.
 */
export function buildCCFRollingValidationSubgroupEvidence(
  input: BuildCCFRollingValidationSubgroupEvidenceInput,
): CCFRollingValidationSubgroupEvidenceV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  if (!protocol.subgroupDimensions.includes("position")) {
    throw new CCFRollingValidationSubgroupEvidenceError(
      "frozen protocol did not predeclare position subgroup analysis",
    );
  }
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);
  const predictions = validatedPredictions(
    input.execution,
    protocol,
    protocolFingerprint,
  );

  const counts = new Map<string, number>();
  const rows = predictions.map((prediction) => {
    const subgroup = prediction.outcome.position;
    counts.set(subgroup, (counts.get(subgroup) ?? 0) + 1);
    return {
      subgroup,
      actual: prediction.actualFantasyPoints,
      predicted: prediction.predictedFantasyPoints,
      p10: prediction.outcome.p10Fpts,
      p90: prediction.outcome.p90Fpts,
    };
  });

  const minimumSubgroupRows = protocol.samplePolicy.minimumSubgroupRows;
  const report = evaluateCCFSubgroupStability(rows, minimumSubgroupRows);
  const underpoweredSubgroups = Array.from(counts.entries())
    .filter(([, sampleSize]) => sampleSize < minimumSubgroupRows)
    .map(([subgroup, sampleSize]) => ({ subgroup, sampleSize }))
    .sort((left, right) => left.subgroup.localeCompare(right.subgroup));

  const underpoweredSubgroupTreatment =
    protocol.samplePolicy.underpoweredSubgroupTreatment;

  return {
    contractVersion: "ccf-rolling-validation-subgroup-evidence-v1",
    replayBindingId: input.execution.replayBinding.bindingId,
    protocolFingerprint,
    dimension: "position",
    minimumSubgroupRows,
    underpoweredSubgroupTreatment,
    report,
    underpoweredSubgroups,
    evidenceRef: evidenceRef(
      input.execution.replayBinding.bindingId,
      protocolFingerprint,
      minimumSubgroupRows,
      underpoweredSubgroupTreatment,
      report,
      underpoweredSubgroups,
    ),
    promotionEvaluated: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
