import crypto from "crypto";
import {
  fingerprintCCFHistoricalDatasetManifest,
  validateCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetRowDescriptor,
} from "./historicalDatasetManifest";
import { auditCCFHistoricalDatasetProtocolBinding } from "./historicalDatasetProtocolBinding";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import {
  validateCCFChronologicalSplitConfig,
  type CCFSeasonWeek,
} from "./chronologicalSplit";
import type { CCFRollingBacktestWindow } from "./rollingBacktest";
import {
  fingerprintCCFPlayerOutcomeModelArtifactV0,
  validateCCFPlayerOutcomeModelArtifactV0,
  type CCFPlayerOutcomeModelArtifactV0,
} from "../outcomes/playerOutcomeEngineV0";

export interface CCFRollingReplayBindingV1 {
  contractVersion: "ccf-rolling-replay-binding-v1";
  bindingId: string;
  windowIndex: number;
  manifestFingerprint: string;
  protocolFingerprint: string;
  trainingDatasetFingerprint: string;
  trainingDatasetRef: string;
  trainingRowIds: string[];
  evaluationRowIds: string[];
  trainingEvidenceMaxKnownAt: string;
  earliestEvaluationDecisionAsOf: string;
  modelArtifactFingerprint: string;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingReplayBindingInput {
  manifest: CCFHistoricalDatasetManifest;
  protocol: CCFPredictiveValidationProtocol;
  window: CCFRollingBacktestWindow;
  artifact: CCFPlayerOutcomeModelArtifactV0;
}

export class CCFRollingReplayBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingReplayBindingError";
  }
}

function inWindow(
  row: Pick<CCFHistoricalDatasetRowDescriptor, "season" | "week">,
  start: CCFSeasonWeek,
  end: CCFSeasonWeek,
): boolean {
  const afterStart =
    row.season > start.season ||
    (row.season === start.season && row.week >= start.week);
  const beforeEnd =
    row.season < end.season ||
    (row.season === end.season && row.week <= end.week);
  return afterStart && beforeEnd;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRollingReplayBindingError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function latestTimestamp(values: readonly string[]): string {
  if (values.length === 0) {
    throw new CCFRollingReplayBindingError(
      "rolling replay training rows must not be empty",
    );
  }
  return values.reduce((latest, value) =>
    timestamp("timestamp", value) > timestamp("timestamp", latest)
      ? value
      : latest,
  );
}

function earliestTimestamp(values: readonly string[]): string {
  if (values.length === 0) {
    throw new CCFRollingReplayBindingError(
      "rolling replay evaluation rows must not be empty",
    );
  }
  return values.reduce((earliest, value) =>
    timestamp("timestamp", value) < timestamp("timestamp", earliest)
      ? value
      : earliest,
  );
}

function rollingRows(
  manifest: CCFHistoricalDatasetManifest,
  window: CCFRollingBacktestWindow,
): {
  training: CCFHistoricalDatasetRowDescriptor[];
  evaluation: CCFHistoricalDatasetRowDescriptor[];
} {
  validateCCFChronologicalSplitConfig(window.split);
  if (!window.split.validation) {
    throw new CCFRollingReplayBindingError(
      "rolling replay requires an explicit validation window",
    );
  }
  if (!Number.isInteger(window.index) || window.index < 0) {
    throw new CCFRollingReplayBindingError(
      "rolling replay window index must be a non-negative integer",
    );
  }

  const training = manifest.rows.filter((row) =>
    inWindow(row, window.split.train.start, window.split.train.end),
  );
  const evaluation = manifest.rows.filter((row) =>
    inWindow(
      row,
      window.split.validation!.start,
      window.split.validation!.end,
    ),
  );

  if (training.length === 0 || evaluation.length === 0) {
    throw new CCFRollingReplayBindingError(
      "rolling replay requires non-empty training and validation rows",
    );
  }
  const sealedTraining = training.filter(
    (row) => row.outcomeAccess === "sealed_final_holdout",
  );
  const sealedEvaluation = evaluation.filter(
    (row) => row.outcomeAccess === "sealed_final_holdout",
  );
  if (sealedTraining.length > 0 || sealedEvaluation.length > 0) {
    throw new CCFRollingReplayBindingError(
      "rolling replay cannot consume sealed final-holdout rows",
    );
  }

  return {
    training: [...training].sort((a, b) => a.rowId.localeCompare(b.rowId)),
    evaluation: [...evaluation].sort((a, b) => a.rowId.localeCompare(b.rowId)),
  };
}

export function fingerprintCCFRollingTrainingSubset(
  manifestInput: CCFHistoricalDatasetManifest,
  window: CCFRollingBacktestWindow,
): string {
  const manifest = validateCCFHistoricalDatasetManifest(manifestInput);
  const rows = rollingRows(manifest, window).training;
  const payload = JSON.stringify({
    contractVersion: "ccf-rolling-training-subset-v1",
    manifestFingerprint: fingerprintCCFHistoricalDatasetManifest(manifest),
    windowIndex: window.index,
    trainWindow: window.split.train,
    rows: rows.map((row) => ({
      ...row,
      sourceSnapshotRefs: [...row.sourceSnapshotRefs].sort(),
    })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function bindingPayload(
  binding: Omit<CCFRollingReplayBindingV1, "bindingId">,
): string {
  return JSON.stringify({
    ...binding,
    trainingRowIds: [...binding.trainingRowIds].sort(),
    evaluationRowIds: [...binding.evaluationRowIds].sort(),
  });
}

export function buildCCFRollingReplayBinding(
  input: BuildCCFRollingReplayBindingInput,
): CCFRollingReplayBindingV1 {
  const manifest = validateCCFHistoricalDatasetManifest(input.manifest);
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  const artifact = validateCCFPlayerOutcomeModelArtifactV0(input.artifact);
  const protocolAudit = auditCCFHistoricalDatasetProtocolBinding(
    manifest,
    protocol,
  );
  if (!protocolAudit.eligible || !protocolAudit.datasetFingerprint) {
    throw new CCFRollingReplayBindingError(
      `historical dataset/protocol binding is ineligible: ${protocolAudit.blockers.join(", ") || "unknown"}`,
    );
  }

  const { training, evaluation } = rollingRows(manifest, input.window);
  const manifestFingerprint = fingerprintCCFHistoricalDatasetManifest(manifest);
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(protocol);
  const trainingDatasetFingerprint = fingerprintCCFRollingTrainingSubset(
    manifest,
    input.window,
  );
  const trainingDatasetRef =
    `ccf://rolling-training-subset/sha256/${trainingDatasetFingerprint}`;

  const trainingEvidenceMaxKnownAt = latestTimestamp(
    training.flatMap((row) => [row.maxFeatureKnownAt, row.outcomeKnownAt]),
  );
  const earliestEvaluationDecisionAsOf = earliestTimestamp(
    evaluation.map((row) => row.decisionAsOf),
  );
  if (
    timestamp("trainingEvidenceMaxKnownAt", trainingEvidenceMaxKnownAt) >
    timestamp("earliestEvaluationDecisionAsOf", earliestEvaluationDecisionAsOf)
  ) {
    throw new CCFRollingReplayBindingError(
      "rolling replay training evidence is known after the earliest evaluation decision",
    );
  }

  if (artifact.trainingDatasetFingerprint !== trainingDatasetFingerprint) {
    throw new CCFRollingReplayBindingError(
      "model artifact trainingDatasetFingerprint does not match the rolling training subset",
    );
  }
  if (artifact.trainingDatasetRef !== trainingDatasetRef) {
    throw new CCFRollingReplayBindingError(
      "model artifact trainingDatasetRef does not match the rolling training subset",
    );
  }
  if (artifact.validationProtocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingReplayBindingError(
      "model artifact validationProtocolFingerprint does not match the frozen protocol",
    );
  }
  if (artifact.modelVersion !== protocol.modelVersion) {
    throw new CCFRollingReplayBindingError(
      "model artifact version does not match the frozen protocol",
    );
  }
  for (const [label, artifactValue, expected] of [
    ["scoringFingerprint", artifact.scoringFingerprint, manifest.scoringProfileFingerprint],
    ["sourcePlanFingerprint", artifact.sourcePlanFingerprint, manifest.sourcePlanFingerprint],
    ["featureSetFingerprint", artifact.featureSetFingerprint, manifest.featureSetFingerprint],
    ["decisionPolicyFingerprint", artifact.decisionPolicyFingerprint, manifest.decisionPolicyFingerprint],
    ["supportedPopulation", artifact.supportedPopulation, manifest.supportedPopulation],
  ] as const) {
    if (artifactValue !== expected) {
      throw new CCFRollingReplayBindingError(
        `model artifact ${label} does not match the frozen historical dataset`,
      );
    }
  }

  const payload: Omit<CCFRollingReplayBindingV1, "bindingId"> = {
    contractVersion: "ccf-rolling-replay-binding-v1",
    windowIndex: input.window.index,
    manifestFingerprint,
    protocolFingerprint,
    trainingDatasetFingerprint,
    trainingDatasetRef,
    trainingRowIds: training.map((row) => row.rowId),
    evaluationRowIds: evaluation.map((row) => row.rowId),
    trainingEvidenceMaxKnownAt,
    earliestEvaluationDecisionAsOf,
    modelArtifactFingerprint:
      fingerprintCCFPlayerOutcomeModelArtifactV0(artifact),
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
  const hash = crypto
    .createHash("sha256")
    .update(bindingPayload(payload))
    .digest("hex");

  return {
    ...payload,
    bindingId: `ccf://rolling-replay-binding/sha256/${hash}`,
  };
}
