import crypto from "crypto";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import type {
  CCFRollingValidationExecutionV1,
} from "./rollingValidationExecution";
import {
  assertCCFNativeIndependence,
  isCCFNativeProducerFamily,
} from "../outcomes/contract";

export interface CCFRollingValidationTiberOffEvidenceV1 {
  contractVersion: "ccf-rolling-validation-tiber-off-evidence-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  auditedPredictionCount: number;
  auditedModelFeatureCount: number;
  producerFamilies: string[];
  tiberUsedAsAuthority: false;
  tiberUsedAsModelInput: false;
  evidenceRefs: string[];
  evidenceRef: string;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingValidationTiberOffEvidenceInput {
  execution: CCFRollingValidationExecutionV1;
  protocol: CCFPredictiveValidationProtocol;
}

export class CCFRollingValidationTiberOffEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationTiberOffEvidenceError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFRollingValidationTiberOffEvidenceError(`${label} is required`);
  }
  return value;
}

function buildEvidenceRef(
  replayBindingId: string,
  protocolFingerprint: string,
  auditedPredictionCount: number,
  auditedModelFeatureCount: number,
  producerFamilies: readonly string[],
  evidenceRefs: readonly string[],
): string {
  const canonical = JSON.stringify({
    contractVersion: "ccf-rolling-validation-tiber-off-evidence-v1",
    replayBindingId,
    protocolFingerprint,
    auditedPredictionCount,
    auditedModelFeatureCount,
    producerFamilies,
    tiberUsedAsAuthority: false,
    tiberUsedAsModelInput: false,
    evidenceRefs,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  });
  return `ccf://rolling-validation-tiber-off-evidence/sha256/${sha256(canonical)}`;
}

/**
 * Prove that one sealed rolling-validation replay used only CCF-native model
 * feature producers.
 *
 * This does not trust the protocol's tiberOffRequired flag by itself. Every
 * replayed outcome is revalidated as CCF_NATIVE and every model-feature
 * provenance row must belong to a CCF-native producer family. A TIBER,
 * external, challenger, legacy, or unknown producer anywhere in the model
 * feature provenance fails the audit.
 *
 * The result is certification evidence only. It cannot open the final holdout
 * or grant production inference/recommendation authority.
 */
export function buildCCFRollingValidationTiberOffEvidence(
  input: BuildCCFRollingValidationTiberOffEvidenceInput,
): CCFRollingValidationTiberOffEvidenceV1 {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  if (!protocol.tiberOffRequired) {
    throw new CCFRollingValidationTiberOffEvidenceError(
      "frozen protocol must require TIBER-off replay",
    );
  }
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);
  const execution = input.execution;

  if (
    execution.finalHoldoutAccessed !== false ||
    execution.certificationOnly !== true ||
    execution.productionInferenceAuthorized !== false
  ) {
    throw new CCFRollingValidationTiberOffEvidenceError(
      "TIBER-off evidence requires sealed-holdout certification-only execution",
    );
  }
  if (execution.replayBinding.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingValidationTiberOffEvidenceError(
      "rolling execution does not match the frozen validation protocol",
    );
  }
  requireText("replayBindingId", execution.replayBinding.bindingId);
  if (execution.predictions.length === 0) {
    throw new CCFRollingValidationTiberOffEvidenceError(
      "TIBER-off evidence requires at least one rolling validation prediction",
    );
  }

  const producerFamilies = new Set<string>();
  const refs = new Set<string>([
    execution.replayBinding.bindingId,
    `ccf://predictive-validation-protocol/sha256/${protocolFingerprint}`,
  ]);
  let auditedModelFeatureCount = 0;

  for (const prediction of execution.predictions) {
    if (prediction.replayBindingId !== execution.replayBinding.bindingId) {
      throw new CCFRollingValidationTiberOffEvidenceError(
        `prediction ${prediction.rowId} does not match the rolling replay binding`,
      );
    }
    if (
      prediction.modelArtifactFingerprint !==
      execution.replayBinding.modelArtifactFingerprint
    ) {
      throw new CCFRollingValidationTiberOffEvidenceError(
        `prediction ${prediction.rowId} model artifact does not match replay binding`,
      );
    }

    try {
      assertCCFNativeIndependence(prediction.outcome);
    } catch (error) {
      throw new CCFRollingValidationTiberOffEvidenceError(
        `prediction ${prediction.rowId} is not CCF-native: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }

    if (prediction.outcome.criticalFeatureProvenance.length === 0) {
      throw new CCFRollingValidationTiberOffEvidenceError(
        `prediction ${prediction.rowId} has no model-feature provenance to audit`,
      );
    }

    for (const feature of prediction.outcome.criticalFeatureProvenance) {
      auditedModelFeatureCount += 1;
      producerFamilies.add(feature.producerFamily);
      if (!isCCFNativeProducerFamily(feature.producerFamily)) {
        throw new CCFRollingValidationTiberOffEvidenceError(
          `prediction ${prediction.rowId} feature ${feature.feature} uses non-native producer ${feature.producerFamily}`,
        );
      }
      if (!feature.sourceRef?.trim()) {
        throw new CCFRollingValidationTiberOffEvidenceError(
          `prediction ${prediction.rowId} feature ${feature.feature} is missing provenance ref`,
        );
      }
      refs.add(feature.sourceRef);
    }
    refs.add(
      `ccf://player-outcome-model-artifact/sha256/${prediction.modelArtifactFingerprint}`,
    );
  }

  const sortedFamilies = Array.from(producerFamilies).sort();
  const evidenceRefs = Array.from(refs).sort();

  return {
    contractVersion: "ccf-rolling-validation-tiber-off-evidence-v1",
    replayBindingId: execution.replayBinding.bindingId,
    protocolFingerprint,
    auditedPredictionCount: execution.predictions.length,
    auditedModelFeatureCount,
    producerFamilies: sortedFamilies,
    tiberUsedAsAuthority: false,
    tiberUsedAsModelInput: false,
    evidenceRefs,
    evidenceRef: buildEvidenceRef(
      execution.replayBinding.bindingId,
      protocolFingerprint,
      execution.predictions.length,
      auditedModelFeatureCount,
      sortedFamilies,
      evidenceRefs,
    ),
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
