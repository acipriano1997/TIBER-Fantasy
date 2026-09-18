import crypto from "crypto";
import {
  buildCCFRollingValidationBaselineEvidence,
  type CCFNativeBaselineArm,
  type CCFRollingValidationBaselinePredictionV1,
} from "./rollingValidationBaselineEvidence";
import type { CCFRollingValidationExecutionV1 } from "./rollingValidationExecution";
import type { CCFPredictiveValidationProtocol } from "./predictiveValidationProtocol";
import type { CCFRollingValidationSubgroupEvidenceV1 } from "./rollingValidationSubgroupEvidence";
import {
  compareCCFModelToBenchmark,
  type CCFModelBenchmarkComparison,
} from "./modelComparison";

export interface CCFRollingValidationSubgroupComparatorRowV1 {
  contractVersion: "ccf-rolling-validation-subgroup-comparator-row-v1";
  subgroup: string;
  arm: CCFNativeBaselineArm;
  totalRows: number;
  pairedRows: number;
  independentTimeBlocks: number;
  minimumSubgroupRows: number;
  sampleUnderpowered: boolean;
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

export interface CCFRollingValidationSubgroupBaselineEvidenceV1 {
  contractVersion: "ccf-rolling-validation-subgroup-baseline-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  subgroupEvidenceRef: string;
  dimension: "position";
  pointEstimate: CCFRollingValidationExecutionV1["pointEstimate"];
  rows: CCFRollingValidationSubgroupComparatorRowV1[];
  promotionEvaluated: false;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationSubgroupBaselineEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  protocol: CCFPredictiveValidationProtocol;
  baselinePredictions: CCFRollingValidationBaselinePredictionV1[];
  subgroupEvidence: CCFRollingValidationSubgroupEvidenceV1;
}

export class CCFRollingValidationSubgroupBaselineEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationSubgroupBaselineEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function rowRef(
  execution: CCFRollingValidationExecutionV1,
  subgroup: string,
  arm: CCFNativeBaselineArm,
  comparison: CCFModelBenchmarkComparison,
  evidenceRefs: readonly string[],
): string {
  const payload = JSON.stringify({
    contractVersion: "ccf-rolling-validation-subgroup-comparator-row-v1",
    replayBindingId: execution.replayBinding.bindingId,
    pointEstimate: execution.pointEstimate,
    subgroup,
    arm,
    comparison,
    evidenceRefs: [...evidenceRefs].sort(),
  });
  return `ccf://rolling-validation-subgroup-baseline-evidence/sha256/${sha256(payload)}`;
}

function indexBaselines(
  rows: readonly CCFRollingValidationBaselinePredictionV1[],
): Map<string, CCFRollingValidationBaselinePredictionV1> {
  return new Map(rows.map((row) => [`${row.rowId}|${row.arm}`, row]));
}

export function buildCCFRollingValidationSubgroupBaselineEvidence(
  input: BuildCCFRollingValidationSubgroupBaselineEvidenceInput,
): CCFRollingValidationSubgroupBaselineEvidenceV1 {
  const overall = buildCCFRollingValidationBaselineEvidence({
    execution: input.execution,
    protocol: input.protocol,
    baselinePredictions: input.baselinePredictions,
  });

  if (
    input.subgroupEvidence.contractVersion !==
      "ccf-rolling-validation-subgroup-evidence-v1" ||
    input.subgroupEvidence.dimension !== "position" ||
    input.subgroupEvidence.promotionEvaluated !== false
  ) {
    throw new CCFRollingValidationSubgroupBaselineEvidenceError(
      "position subgroup evidence is required before paired subgroup baselines",
    );
  }
  if (
    input.subgroupEvidence.replayBindingId !== overall.replayBindingId ||
    input.subgroupEvidence.protocolFingerprint !== overall.protocolFingerprint
  ) {
    throw new CCFRollingValidationSubgroupBaselineEvidenceError(
      "subgroup evidence does not match the validated rolling baseline packet",
    );
  }
  if (
    input.subgroupEvidence.finalHoldoutAccessed !== false ||
    input.subgroupEvidence.certificationOnly !== true ||
    input.subgroupEvidence.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationSubgroupBaselineEvidenceError(
      "subgroup baseline evidence requires sealed-holdout certification-only inputs",
    );
  }

  const indexed = indexBaselines(input.baselinePredictions);
  const arms = overall.armEvidence.map((row) => row.arm).sort();
  const positions = Array.from(
    new Set(input.execution.predictions.map((prediction) => prediction.outcome.position)),
  ).sort();

  const rows: CCFRollingValidationSubgroupComparatorRowV1[] = [];
  for (const subgroup of positions) {
    const predictions = input.execution.predictions.filter(
      (prediction) => prediction.outcome.position === subgroup,
    );

    for (const arm of arms) {
      const comparisonRows = predictions.map((prediction) => {
        const baseline = indexed.get(`${prediction.rowId}|${arm}`);
        if (!baseline) {
          throw new CCFRollingValidationSubgroupBaselineEvidenceError(
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

      const comparison = compareCCFModelToBenchmark(comparisonRows);
      const pairedBlocks = new Set(
        comparisonRows
          .filter(
            (row) =>
              row.benchmark != null &&
              Number.isFinite(row.benchmark) &&
              Number.isFinite(row.candidate) &&
              Number.isFinite(row.actual),
          )
          .map((row) => row.blockId),
      );
      const evidenceRefs = comparisonRows.map((row) => row.evidenceRef).sort();

      rows.push({
        contractVersion: "ccf-rolling-validation-subgroup-comparator-row-v1",
        subgroup,
        arm,
        totalRows: predictions.length,
        pairedRows: comparison.pairedSampleSize,
        independentTimeBlocks: pairedBlocks.size,
        minimumSubgroupRows: input.protocol.samplePolicy.minimumSubgroupRows,
        sampleUnderpowered:
          comparison.pairedSampleSize < input.protocol.samplePolicy.minimumSubgroupRows,
        candidateMae: comparison.candidateMae,
        comparatorMae: comparison.benchmarkMae,
        maeImprovement: comparison.maeImprovement,
        candidateRmse: comparison.candidateRmse,
        comparatorRmse: comparison.benchmarkRmse,
        rmseImprovement: comparison.rmseImprovement,
        candidateWins: comparison.candidateWins,
        comparatorWins: comparison.benchmarkWins,
        ties: comparison.ties,
        evidenceRef: rowRef(
          input.execution,
          subgroup,
          arm,
          comparison,
          [
            input.subgroupEvidence.evidenceRef,
            ...evidenceRefs,
          ],
        ),
      });
    }
  }

  return {
    contractVersion: "ccf-rolling-validation-subgroup-baseline-evidence-v1",
    replayBindingId: overall.replayBindingId,
    protocolFingerprint: overall.protocolFingerprint,
    subgroupEvidenceRef: input.subgroupEvidence.evidenceRef,
    dimension: "position",
    pointEstimate: overall.pointEstimate,
    rows: rows.sort(
      (left, right) =>
        left.subgroup.localeCompare(right.subgroup) ||
        left.arm.localeCompare(right.arm),
    ),
    promotionEvaluated: false,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
