import crypto from "crypto";
import {
  fingerprintCCFHistoricalDatasetFreezeReceipt,
  type CCFHistoricalDatasetFreezeReceipt,
} from "./historicalDatasetFreezeReceipt";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";

export interface CCFCandidateParameterArtifact {
  contractVersion: "ccf-candidate-parameter-artifact-v1";
  artifactId: string;
  modelVersion: string;
  modelFamily: string;
  parameterRef: string;
  parameterFormat: "json";
  parameterContentSha256: string;
  trainingRunId: string;
  trainingStartedAt: string;
  trainingCompletedAt: string;
  frozenAt: string;
  trainingCodeFingerprint: string;
  hyperparameterFingerprint: string;
  datasetFreezeReceiptId: string;
  datasetFreezeReceiptFingerprint: string;
  datasetFingerprint: string;
  protocolId: string;
  protocolFingerprint: string;
  scoringProfileFingerprint: string;
  featureSetFingerprint: string;
  evidenceRefs: string[];
  finalHoldoutAccessCountDuringTraining: 0;
  challengerEvidenceUsedForFit: false;
  productionCertificationAuthorized: false;
}

export interface BuildCCFCandidateParameterArtifactInput {
  freezeReceipt: CCFHistoricalDatasetFreezeReceipt;
  protocol: CCFPredictiveValidationProtocol;
  modelFamily: string;
  parameterRef: string;
  parameterContent: string;
  trainingRunId: string;
  trainingStartedAt: string;
  trainingCompletedAt: string;
  frozenAt: string;
  trainingCodeFingerprint: string;
  hyperparameterFingerprint: string;
  evidenceRefs?: string[];
}

export class CCFCandidateParameterArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFCandidateParameterArtifactError";
  }
}

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFCandidateParameterArtifactError(`${label} is required`);
  }
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFCandidateParameterArtifactError(
      `${label} must be a valid timestamp`,
    );
  }
  return parsed;
}

function canonicalPayload(
  artifact: Omit<CCFCandidateParameterArtifact, "artifactId">,
): string {
  return JSON.stringify({
    ...artifact,
    evidenceRefs: [...artifact.evidenceRefs].sort(),
  });
}

function protocolRef(fingerprint: string): string {
  return `ccf://predictive-validation-protocol/sha256/${fingerprint}`;
}

export function buildCCFCandidateParameterArtifact(
  input: BuildCCFCandidateParameterArtifactInput,
): CCFCandidateParameterArtifact {
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const freezeFingerprint =
    fingerprintCCFHistoricalDatasetFreezeReceipt(input.freezeReceipt);
  const protocolFingerprint =
    fingerprintCCFPredictiveValidationProtocol(protocol);

  requireText("modelFamily", input.modelFamily);
  requireText("parameterRef", input.parameterRef);
  requireText("parameterContent", input.parameterContent);
  requireText("trainingRunId", input.trainingRunId);
  requireText("trainingCodeFingerprint", input.trainingCodeFingerprint);
  requireText("hyperparameterFingerprint", input.hyperparameterFingerprint);

  if (!input.freezeReceipt.protocolBinding) {
    throw new CCFCandidateParameterArtifactError(
      "candidate parameter artifact requires a dataset freeze receipt bound to a predictive protocol",
    );
  }
  if (
    input.freezeReceipt.protocolBinding.protocolId !== protocol.protocolId ||
    input.freezeReceipt.protocolBinding.protocolFingerprint !== protocolFingerprint
  ) {
    throw new CCFCandidateParameterArtifactError(
      "dataset freeze receipt protocol binding does not match supplied predictive protocol",
    );
  }
  if (input.freezeReceipt.datasetFingerprint !== protocol.datasetFingerprint) {
    throw new CCFCandidateParameterArtifactError(
      "dataset freeze receipt fingerprint does not match supplied predictive protocol",
    );
  }

  const trainingStartedAtMs = timestamp("trainingStartedAt", input.trainingStartedAt);
  const trainingCompletedAtMs = timestamp(
    "trainingCompletedAt",
    input.trainingCompletedAt,
  );
  const frozenAtMs = timestamp("frozenAt", input.frozenAt);
  const receiptVerifiedAtMs = timestamp(
    "freezeReceipt.verifiedAt",
    input.freezeReceipt.verifiedAt,
  );
  const protocolFrozenAtMs = timestamp("protocol.frozenAt", protocol.frozenAt);

  if (
    trainingStartedAtMs < receiptVerifiedAtMs ||
    trainingStartedAtMs < protocolFrozenAtMs
  ) {
    throw new CCFCandidateParameterArtifactError(
      "training cannot start before both dataset-freeze verification and protocol freeze",
    );
  }
  if (trainingCompletedAtMs < trainingStartedAtMs) {
    throw new CCFCandidateParameterArtifactError(
      "trainingCompletedAt cannot precede trainingStartedAt",
    );
  }
  if (frozenAtMs < trainingCompletedAtMs) {
    throw new CCFCandidateParameterArtifactError(
      "parameter freeze cannot precede training completion",
    );
  }

  const parameterContentSha256 = crypto
    .createHash("sha256")
    .update(input.parameterContent)
    .digest("hex");
  const evidenceRefs = Array.from(
    new Set([
      input.freezeReceipt.receiptId,
      protocolRef(protocolFingerprint),
      input.parameterRef,
      ...(input.evidenceRefs ?? []),
    ].map((ref) => requireText("evidenceRef", ref))),
  ).sort();

  const payload: Omit<CCFCandidateParameterArtifact, "artifactId"> = {
    contractVersion: "ccf-candidate-parameter-artifact-v1",
    modelVersion: protocol.modelVersion,
    modelFamily: input.modelFamily,
    parameterRef: input.parameterRef,
    parameterFormat: "json",
    parameterContentSha256,
    trainingRunId: input.trainingRunId,
    trainingStartedAt: input.trainingStartedAt,
    trainingCompletedAt: input.trainingCompletedAt,
    frozenAt: input.frozenAt,
    trainingCodeFingerprint: input.trainingCodeFingerprint,
    hyperparameterFingerprint: input.hyperparameterFingerprint,
    datasetFreezeReceiptId: input.freezeReceipt.receiptId,
    datasetFreezeReceiptFingerprint: freezeFingerprint,
    datasetFingerprint: input.freezeReceipt.datasetFingerprint,
    protocolId: protocol.protocolId,
    protocolFingerprint,
    scoringProfileFingerprint: protocol.scoringProfileFingerprint,
    featureSetFingerprint: protocol.featureSetFingerprint,
    evidenceRefs,
    finalHoldoutAccessCountDuringTraining: 0,
    challengerEvidenceUsedForFit: false,
    productionCertificationAuthorized: false,
  };
  const hash = crypto
    .createHash("sha256")
    .update(canonicalPayload(payload))
    .digest("hex");

  return {
    ...payload,
    artifactId: `ccf://candidate-parameter-artifact/sha256/${hash}`,
  };
}

export function fingerprintCCFCandidateParameterArtifact(
  artifact: CCFCandidateParameterArtifact,
): string {
  if (artifact.contractVersion !== "ccf-candidate-parameter-artifact-v1") {
    throw new CCFCandidateParameterArtifactError(
      "unsupported candidate parameter artifact version",
    );
  }
  if (!/^ccf:\/\/candidate-parameter-artifact\/sha256\/[a-f0-9]{64}$/.test(
    artifact.artifactId,
  )) {
    throw new CCFCandidateParameterArtifactError(
      "candidate parameter artifactId is invalid",
    );
  }
  if (artifact.finalHoldoutAccessCountDuringTraining !== 0) {
    throw new CCFCandidateParameterArtifactError(
      "candidate training must not access the final holdout",
    );
  }
  if (artifact.challengerEvidenceUsedForFit !== false) {
    throw new CCFCandidateParameterArtifactError(
      "challenger evidence cannot be used to fit the frozen native candidate",
    );
  }
  if (artifact.productionCertificationAuthorized !== false) {
    throw new CCFCandidateParameterArtifactError(
      "candidate parameter artifact cannot authorize production certification",
    );
  }
  if (artifact.evidenceRefs.length === 0) {
    throw new CCFCandidateParameterArtifactError(
      "candidate parameter artifact evidenceRefs must not be empty",
    );
  }
  if (new Set(artifact.evidenceRefs).size !== artifact.evidenceRefs.length) {
    throw new CCFCandidateParameterArtifactError(
      "candidate parameter artifact evidenceRefs must not contain duplicates",
    );
  }
  for (const ref of artifact.evidenceRefs) requireText("evidenceRef", ref);

  const { artifactId: _artifactId, ...payload } = artifact;
  const hash = crypto
    .createHash("sha256")
    .update(canonicalPayload(payload))
    .digest("hex");
  if (artifact.artifactId !== `ccf://candidate-parameter-artifact/sha256/${hash}`) {
    throw new CCFCandidateParameterArtifactError(
      "candidate parameter artifactId does not match artifact contents",
    );
  }
  return hash;
}
