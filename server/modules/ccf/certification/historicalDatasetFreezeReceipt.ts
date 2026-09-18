import crypto from "crypto";
import {
  auditCCFHistoricalDatasetManifest,
  fingerprintCCFHistoricalDatasetManifest,
  validateCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "./historicalDatasetManifest";
import {
  auditCCFHistoricalDatasetProtocolBinding,
} from "./historicalDatasetProtocolBinding";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export interface CCFHistoricalDatasetProtocolBindingReceipt {
  protocolId: string;
  protocolFingerprint: string;
  testRows: number;
  testIndependentTimeBlocks: number;
}

export interface CCFHistoricalDatasetFreezeReceipt {
  contractVersion: "ccf-historical-dataset-freeze-receipt-v1";
  receiptId: string;
  verifiedAt: string;
  datasetId: string;
  datasetFingerprint: string;
  manifestFrozenAt: string;
  candidateRowCount: number;
  admittedRowCount: number;
  excludedRowCount: number;
  splitCounts: {
    train: number;
    validation: number;
    test: number;
  };
  independentSeasonWeeks: number;
  finalHoldoutOutcomesSealed: true;
  finalHoldoutAccessCountAtFreeze: 0;
  outcomeValuesEmbeddedInManifest: false;
  protocolBinding: CCFHistoricalDatasetProtocolBindingReceipt | null;
  productionCertificationAuthorized: false;
}

export interface BuildCCFHistoricalDatasetFreezeReceiptInput {
  manifest: CCFHistoricalDatasetManifest;
  protocol?: CCFPredictiveValidationProtocol | null;
  verifiedAt: string;
}

export class CCFHistoricalDatasetFreezeReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFHistoricalDatasetFreezeReceiptError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFHistoricalDatasetFreezeReceiptError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function canonicalReceiptPayload(
  receipt: Omit<CCFHistoricalDatasetFreezeReceipt, "receiptId">,
): string {
  return JSON.stringify({
    ...receipt,
    splitCounts: { ...receipt.splitCounts },
    protocolBinding: receipt.protocolBinding
      ? { ...receipt.protocolBinding }
      : null,
  });
}

export function buildCCFHistoricalDatasetFreezeReceipt(
  input: BuildCCFHistoricalDatasetFreezeReceiptInput,
): CCFHistoricalDatasetFreezeReceipt {
  const manifest = validateCCFHistoricalDatasetManifest(input.manifest);
  const verifiedAtMs = parseTimestamp("verifiedAt", input.verifiedAt);
  const manifestFrozenAtMs = parseTimestamp("manifest.frozenAt", manifest.frozenAt);
  if (verifiedAtMs < manifestFrozenAtMs) {
    throw new CCFHistoricalDatasetFreezeReceiptError(
      "verifiedAt cannot precede the historical dataset freeze",
    );
  }

  const audit = auditCCFHistoricalDatasetManifest(manifest);
  if (!audit.valid || !audit.fingerprint) {
    throw new CCFHistoricalDatasetFreezeReceiptError(
      `historical dataset manifest audit failed: ${audit.blockers.join(", ") || "unknown"}`,
    );
  }
  const datasetFingerprint = fingerprintCCFHistoricalDatasetManifest(manifest);
  if (datasetFingerprint !== audit.fingerprint) {
    throw new CCFHistoricalDatasetFreezeReceiptError(
      "historical dataset fingerprint does not match manifest audit",
    );
  }

  let protocolBinding: CCFHistoricalDatasetProtocolBindingReceipt | null = null;
  if (input.protocol) {
    const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
    const protocolFrozenAtMs = parseTimestamp("protocol.frozenAt", protocol.frozenAt);
    if (verifiedAtMs < protocolFrozenAtMs) {
      throw new CCFHistoricalDatasetFreezeReceiptError(
        "verifiedAt cannot precede the predictive validation protocol freeze",
      );
    }
    const binding = auditCCFHistoricalDatasetProtocolBinding(manifest, protocol);
    if (!binding.eligible || !binding.datasetFingerprint) {
      throw new CCFHistoricalDatasetFreezeReceiptError(
        `historical dataset/protocol binding blocked: ${binding.blockers.join(", ") || "unknown"}`,
      );
    }
    protocolBinding = {
      protocolId: protocol.protocolId,
      protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(protocol),
      testRows: binding.testRows,
      testIndependentTimeBlocks: binding.testIndependentTimeBlocks,
    };
  }

  const payload: Omit<CCFHistoricalDatasetFreezeReceipt, "receiptId"> = {
    contractVersion: "ccf-historical-dataset-freeze-receipt-v1",
    verifiedAt: input.verifiedAt,
    datasetId: manifest.datasetId,
    datasetFingerprint,
    manifestFrozenAt: manifest.frozenAt,
    candidateRowCount: manifest.candidateRowCount,
    admittedRowCount: audit.admittedRowCount,
    excludedRowCount: audit.excludedRowCount,
    splitCounts: { ...audit.splitCounts },
    independentSeasonWeeks: audit.independentSeasonWeeks,
    finalHoldoutOutcomesSealed: true,
    finalHoldoutAccessCountAtFreeze: 0,
    outcomeValuesEmbeddedInManifest: false,
    protocolBinding,
    productionCertificationAuthorized: false,
  };
  const receiptHash = crypto
    .createHash("sha256")
    .update(canonicalReceiptPayload(payload))
    .digest("hex");

  return {
    ...payload,
    receiptId: `ccf-historical-dataset-freeze:${receiptHash}`,
  };
}

export function fingerprintCCFHistoricalDatasetFreezeReceipt(
  receipt: CCFHistoricalDatasetFreezeReceipt,
): string {
  if (receipt.contractVersion !== "ccf-historical-dataset-freeze-receipt-v1") {
    throw new CCFHistoricalDatasetFreezeReceiptError(
      "unsupported historical dataset freeze receipt version",
    );
  }
  if (!/^ccf-historical-dataset-freeze:[a-f0-9]{64}$/.test(receipt.receiptId)) {
    throw new CCFHistoricalDatasetFreezeReceiptError(
      "historical dataset freeze receiptId is invalid",
    );
  }
  const { receiptId: _receiptId, ...payload } = receipt;
  const expected = crypto
    .createHash("sha256")
    .update(canonicalReceiptPayload(payload))
    .digest("hex");
  if (receipt.receiptId !== `ccf-historical-dataset-freeze:${expected}`) {
    throw new CCFHistoricalDatasetFreezeReceiptError(
      "historical dataset freeze receiptId does not match receipt contents",
    );
  }
  return expected;
}
