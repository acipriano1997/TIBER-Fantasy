import {
  auditCCFHistoricalDatasetManifest,
  fingerprintCCFHistoricalDatasetManifest,
  validateCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "./historicalDatasetManifest";
import {
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export interface CCFHistoricalDatasetProtocolBindingAudit {
  contractVersion: "ccf-historical-dataset-protocol-binding-audit-v1";
  eligible: boolean;
  datasetFingerprint: string | null;
  testRows: number;
  testIndependentTimeBlocks: number;
  blockers: string[];
}

export class CCFHistoricalDatasetProtocolBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFHistoricalDatasetProtocolBindingError";
  }
}

function canonicalSplit(value: CCFPredictiveValidationProtocol["split"]): string {
  return JSON.stringify(value);
}

export function auditCCFHistoricalDatasetProtocolBinding(
  manifestInput: CCFHistoricalDatasetManifest,
  protocolInput: CCFPredictiveValidationProtocol,
): CCFHistoricalDatasetProtocolBindingAudit {
  const blockers = new Set<string>();
  let datasetFingerprint: string | null = null;

  try {
    validateCCFHistoricalDatasetManifest(manifestInput);
    datasetFingerprint = fingerprintCCFHistoricalDatasetManifest(manifestInput);
  } catch (error) {
    blockers.add(`dataset_invalid:${error instanceof Error ? error.message : "unknown"}`);
  }

  let protocol: CCFPredictiveValidationProtocol | null = null;
  try {
    protocol = validateCCFPredictiveValidationProtocol(protocolInput);
  } catch (error) {
    blockers.add(`protocol_invalid:${error instanceof Error ? error.message : "unknown"}`);
  }

  if (protocol && datasetFingerprint) {
    const exactPairs: Array<[string, string, string]> = [
      ["datasetFingerprint", protocol.datasetFingerprint, datasetFingerprint],
      ["sourcePlanFingerprint", protocol.sourcePlanFingerprint, manifestInput.sourcePlanFingerprint],
      ["scoringProfileFingerprint", protocol.scoringProfileFingerprint, manifestInput.scoringProfileFingerprint],
      ["featureSetFingerprint", protocol.featureSetFingerprint, manifestInput.featureSetFingerprint],
      ["decisionPolicyFingerprint", protocol.decisionPolicyFingerprint, manifestInput.decisionPolicyFingerprint],
      ["supportedPopulation", protocol.supportedPopulation, manifestInput.supportedPopulation],
    ];
    for (const [label, actual, expected] of exactPairs) {
      if (actual !== expected) blockers.add(`${label}_mismatch`);
    }

    if (canonicalSplit(protocol.split) !== canonicalSplit(manifestInput.split)) {
      blockers.add("chronological_split_mismatch");
    }

    const manifestFrozenAt = Date.parse(manifestInput.frozenAt);
    const protocolFrozenAt = Date.parse(protocol.frozenAt);
    if (Number.isFinite(manifestFrozenAt) && Number.isFinite(protocolFrozenAt)) {
      if (protocolFrozenAt < manifestFrozenAt) blockers.add("protocol_frozen_before_dataset");
    }
  }

  const datasetAudit = auditCCFHistoricalDatasetManifest(manifestInput);
  const testRows = Array.isArray(manifestInput?.rows)
    ? manifestInput.rows.filter((row) => row.split === "test").length
    : 0;
  const testIndependentTimeBlocks = Array.isArray(manifestInput?.rows)
    ? new Set(
        manifestInput.rows
          .filter((row) => row.split === "test")
          .map((row) => `${row.season}-${row.week}`),
      ).size
    : 0;

  if (protocol && datasetAudit.valid) {
    if (testRows < protocol.samplePolicy.minimumOverallPairedRows) {
      blockers.add("final_test_rows_below_frozen_sample_minimum");
    }
    if (testIndependentTimeBlocks < protocol.samplePolicy.minimumIndependentTimeBlocks) {
      blockers.add("final_test_time_blocks_below_frozen_sample_minimum");
    }
  }

  return {
    contractVersion: "ccf-historical-dataset-protocol-binding-audit-v1",
    eligible: blockers.size === 0,
    datasetFingerprint,
    testRows,
    testIndependentTimeBlocks,
    blockers: [...blockers].sort(),
  };
}

export function assertCCFHistoricalDatasetProtocolBinding(
  manifest: CCFHistoricalDatasetManifest,
  protocol: CCFPredictiveValidationProtocol,
): void {
  const audit = auditCCFHistoricalDatasetProtocolBinding(manifest, protocol);
  if (!audit.eligible) {
    throw new CCFHistoricalDatasetProtocolBindingError(
      `historical dataset/protocol binding blocked: ${audit.blockers.join(", ")}`,
    );
  }
}
