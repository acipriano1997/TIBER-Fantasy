import crypto from "crypto";
import {
  validateCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetRowDescriptor,
} from "./historicalDatasetManifest";
import type { CCFPredictiveValidationProtocol } from "./predictiveValidationProtocol";
import type { CCFRollingBacktestWindow } from "./rollingBacktest";
import {
  buildCCFRollingReplayBinding,
  type CCFRollingReplayBindingV1,
} from "./rollingReplayBinding";
import {
  runCCFPlayerOutcomeEngineV0HistoricalReplay,
  type CCFPlayerOutcomeModelArtifactV0,
} from "../outcomes/playerOutcomeEngineV0";
import type {
  CCFPlayerOutcome,
  CCFScoringFormat,
} from "../outcomes/contract";
import {
  validateCCFWeeklyNativeFeatureSet,
  type CCFWeeklyNativeFeatureSet,
} from "../features/weeklyFeatureEvidence";

export type CCFCertificationPointEstimate = "mean_fpts" | "median_fpts";

export interface CCFHistoricalFeaturePacketV1 {
  contractVersion: "ccf-historical-feature-packet-v1";
  rowId: string;
  featureSet: CCFWeeklyNativeFeatureSet;
}

export interface CCFHistoricalOutcomeWitnessV1 {
  contractVersion: "ccf-historical-outcome-witness-v1";
  rowId: string;
  canonicalPlayerId: string;
  gameId: string;
  season: number;
  week: number;
  outcomeKnownAt: string;
  actualFantasyPoints: number;
}

export interface CCFHistoricalValidationPredictionV1 {
  contractVersion: "ccf-historical-validation-prediction-v1";
  rowId: string;
  blockId: string;
  actualFantasyPoints: number;
  predictedFantasyPoints: number;
  pointEstimate: CCFCertificationPointEstimate;
  abstained: boolean;
  replayBindingId: string;
  featureSnapshotFingerprint: string;
  outcomeArtifactFingerprint: string;
  modelArtifactFingerprint: string;
  outcome: CCFPlayerOutcome;
}

export interface ExecuteCCFRollingValidationInput {
  manifest: CCFHistoricalDatasetManifest;
  protocol: CCFPredictiveValidationProtocol;
  window: CCFRollingBacktestWindow;
  artifact: CCFPlayerOutcomeModelArtifactV0;
  scoringFormat: CCFScoringFormat;
  scoringFingerprint: string;
  pointEstimate: CCFCertificationPointEstimate;
  featurePackets: CCFHistoricalFeaturePacketV1[];
  outcomeWitnesses: CCFHistoricalOutcomeWitnessV1[];
}

export interface CCFRollingValidationExecutionV1 {
  contractVersion: "ccf-rolling-validation-execution-v1";
  replayBinding: CCFRollingReplayBindingV1;
  pointEstimate: CCFCertificationPointEstimate;
  predictions: CCFHistoricalValidationPredictionV1[];
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export class CCFRollingValidationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingValidationExecutionError";
  }
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRollingValidationExecutionError(
      `${label} must be a valid timestamp`,
    );
  }
  return parsed;
}

function canonicalFeature(feature: CCFWeeklyNativeFeatureSet["features"][string]) {
  if (feature.status === "available") {
    return {
      key: feature.key,
      status: feature.status,
      value: feature.value,
      unit: feature.unit ?? null,
      producerFamily: feature.producerFamily,
      evidenceKind: feature.evidenceKind,
      knownAt: feature.knownAt,
      sourceRefs: [...feature.sourceRefs].sort(),
    };
  }
  return {
    key: feature.key,
    status: feature.status,
    reason: feature.reason,
    producerFamily: feature.producerFamily ?? null,
    evidenceKind: feature.evidenceKind ?? null,
    knownAt: feature.knownAt ?? null,
    sourceRefs: [...feature.sourceRefs].sort(),
  };
}

export function fingerprintCCFWeeklyNativeFeatureSnapshot(
  input: CCFWeeklyNativeFeatureSet,
): string {
  const featureSet = validateCCFWeeklyNativeFeatureSet(input);
  const canonical = {
    playerId: featureSet.playerId,
    position: featureSet.position,
    season: featureSet.season,
    week: featureSet.week,
    asOf: featureSet.asOf,
    features: Object.fromEntries(
      Object.entries(featureSet.features)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, feature]) => [key, canonicalFeature(feature)]),
    ),
  };
  return sha256(JSON.stringify(canonical));
}

export function fingerprintCCFHistoricalOutcomeWitness(
  witness: CCFHistoricalOutcomeWitnessV1,
): string {
  if (witness.contractVersion !== "ccf-historical-outcome-witness-v1") {
    throw new CCFRollingValidationExecutionError(
      "unsupported historical outcome witness version",
    );
  }
  for (const [label, value] of [
    ["rowId", witness.rowId],
    ["canonicalPlayerId", witness.canonicalPlayerId],
    ["gameId", witness.gameId],
  ] as const) {
    if (!value.trim()) {
      throw new CCFRollingValidationExecutionError(`${label} is required`);
    }
  }
  if (!Number.isInteger(witness.season) || witness.season < 1900) {
    throw new CCFRollingValidationExecutionError(
      "outcome witness season is invalid",
    );
  }
  if (!Number.isInteger(witness.week) || witness.week < 1 || witness.week > 25) {
    throw new CCFRollingValidationExecutionError(
      "outcome witness week is invalid",
    );
  }
  timestamp("outcomeKnownAt", witness.outcomeKnownAt);
  if (!Number.isFinite(witness.actualFantasyPoints)) {
    throw new CCFRollingValidationExecutionError(
      "actualFantasyPoints must be finite",
    );
  }
  return sha256(JSON.stringify(witness));
}

function maxFeatureKnownAt(featureSet: CCFWeeklyNativeFeatureSet): string {
  const values = Object.values(featureSet.features)
    .map((feature) => feature.knownAt)
    .filter((value): value is string => value != null);
  if (values.length === 0) {
    throw new CCFRollingValidationExecutionError(
      "historical feature packet must contain at least one knownAt timestamp",
    );
  }
  return values.reduce((latest, value) =>
    timestamp("feature.knownAt", value) > timestamp("feature.knownAt", latest)
      ? value
      : latest,
  );
}

function indexByRowId<T extends { rowId: string }>(
  label: string,
  rows: readonly T[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.rowId.trim()) {
      throw new CCFRollingValidationExecutionError(`${label} rowId is required`);
    }
    if (result.has(row.rowId)) {
      throw new CCFRollingValidationExecutionError(
        `duplicate ${label} rowId ${row.rowId}`,
      );
    }
    result.set(row.rowId, row);
  }
  return result;
}

function descriptorMap(
  manifest: CCFHistoricalDatasetManifest,
): Map<string, CCFHistoricalDatasetRowDescriptor> {
  return new Map(manifest.rows.map((row) => [row.rowId, row]));
}

function assertFeaturePacketMatches(
  descriptor: CCFHistoricalDatasetRowDescriptor,
  packet: CCFHistoricalFeaturePacketV1,
): string {
  if (packet.contractVersion !== "ccf-historical-feature-packet-v1") {
    throw new CCFRollingValidationExecutionError(
      "unsupported historical feature packet version",
    );
  }
  const featureSet = validateCCFWeeklyNativeFeatureSet(packet.featureSet);
  if (
    featureSet.playerId !== descriptor.canonicalPlayerId ||
    featureSet.season !== descriptor.season ||
    featureSet.week !== descriptor.week ||
    featureSet.asOf !== descriptor.decisionAsOf
  ) {
    throw new CCFRollingValidationExecutionError(
      `feature packet ${packet.rowId} does not match the frozen historical row identity/cutoff`,
    );
  }
  const fingerprint = fingerprintCCFWeeklyNativeFeatureSnapshot(featureSet);
  if (fingerprint !== descriptor.featureSnapshotFingerprint) {
    throw new CCFRollingValidationExecutionError(
      `feature packet ${packet.rowId} fingerprint does not match the frozen historical row`,
    );
  }
  const observedMaxKnownAt = maxFeatureKnownAt(featureSet);
  if (
    timestamp("feature max knownAt", observedMaxKnownAt) !==
    timestamp("descriptor.maxFeatureKnownAt", descriptor.maxFeatureKnownAt)
  ) {
    throw new CCFRollingValidationExecutionError(
      `feature packet ${packet.rowId} max knownAt does not match the frozen historical row`,
    );
  }
  return fingerprint;
}

function assertOutcomeWitnessMatches(
  descriptor: CCFHistoricalDatasetRowDescriptor,
  witness: CCFHistoricalOutcomeWitnessV1,
): string {
  if (
    witness.rowId !== descriptor.rowId ||
    witness.canonicalPlayerId !== descriptor.canonicalPlayerId ||
    witness.gameId !== descriptor.gameId ||
    witness.season !== descriptor.season ||
    witness.week !== descriptor.week ||
    timestamp("witness.outcomeKnownAt", witness.outcomeKnownAt) !==
      timestamp("descriptor.outcomeKnownAt", descriptor.outcomeKnownAt)
  ) {
    throw new CCFRollingValidationExecutionError(
      `outcome witness ${witness.rowId} does not match the frozen historical row`,
    );
  }
  const fingerprint = fingerprintCCFHistoricalOutcomeWitness(witness);
  if (fingerprint !== descriptor.outcomeArtifactFingerprint) {
    throw new CCFRollingValidationExecutionError(
      `outcome witness ${witness.rowId} fingerprint does not match the frozen historical row`,
    );
  }
  return fingerprint;
}

export function executeCCFRollingValidation(
  input: ExecuteCCFRollingValidationInput,
): CCFRollingValidationExecutionV1 {
  const manifest = validateCCFHistoricalDatasetManifest(input.manifest);
  if (input.pointEstimate !== "mean_fpts" && input.pointEstimate !== "median_fpts") {
    throw new CCFRollingValidationExecutionError(
      "pointEstimate must be mean_fpts or median_fpts",
    );
  }
  const replayBinding = buildCCFRollingReplayBinding({
    manifest,
    protocol: input.protocol,
    window: input.window,
    artifact: input.artifact,
  });
  const descriptors = descriptorMap(manifest);
  const featurePackets = indexByRowId("feature packet", input.featurePackets);
  const witnesses = indexByRowId("outcome witness", input.outcomeWitnesses);
  const expected = new Set(replayBinding.evaluationRowIds);

  for (const rowId of Array.from(featurePackets.keys())) {
    if (!expected.has(rowId)) {
      throw new CCFRollingValidationExecutionError(
        `feature packet ${rowId} is outside the rolling validation window`,
      );
    }
  }
  for (const rowId of Array.from(witnesses.keys())) {
    if (!expected.has(rowId)) {
      const descriptor = descriptors.get(rowId);
      if (descriptor?.outcomeAccess === "sealed_final_holdout") {
        throw new CCFRollingValidationExecutionError(
          `outcome witness ${rowId} would open the sealed final holdout`,
        );
      }
      throw new CCFRollingValidationExecutionError(
        `outcome witness ${rowId} is outside the rolling validation window`,
      );
    }
  }

  const predictions = replayBinding.evaluationRowIds.map(
    (rowId): CCFHistoricalValidationPredictionV1 => {
      const descriptor = descriptors.get(rowId);
      const packet = featurePackets.get(rowId);
      const witness = witnesses.get(rowId);
      if (!descriptor || !packet || !witness) {
        throw new CCFRollingValidationExecutionError(
          `rolling validation row ${rowId} requires one feature packet and one outcome witness`,
        );
      }
      if (descriptor.outcomeAccess === "sealed_final_holdout") {
        throw new CCFRollingValidationExecutionError(
          `rolling validation row ${rowId} cannot open the sealed final holdout`,
        );
      }

      const featureSnapshotFingerprint = assertFeaturePacketMatches(
        descriptor,
        packet,
      );
      const outcomeArtifactFingerprint = assertOutcomeWitnessMatches(
        descriptor,
        witness,
      );
      const outcome = runCCFPlayerOutcomeEngineV0HistoricalReplay({
        featureSet: packet.featureSet,
        artifact: input.artifact,
        scoringFormat: input.scoringFormat,
        scoringFingerprint: input.scoringFingerprint,
        replayAuthorization: {
          contractVersion:
            "ccf-player-outcome-historical-replay-authorization-v1",
          targetDecisionAsOf: descriptor.decisionAsOf,
          trainingEvidenceMaxKnownAt: replayBinding.trainingEvidenceMaxKnownAt,
          trainingDatasetFingerprint: replayBinding.trainingDatasetFingerprint,
          validationProtocolFingerprint: replayBinding.protocolFingerprint,
          certificationOnly: true,
          productionInferenceAuthorized: false,
        },
      });

      return {
        contractVersion: "ccf-historical-validation-prediction-v1",
        rowId,
        blockId: `${descriptor.season}-W${descriptor.week}`,
        actualFantasyPoints: witness.actualFantasyPoints,
        predictedFantasyPoints:
          input.pointEstimate === "mean_fpts"
            ? outcome.meanFpts
            : outcome.medianFpts,
        pointEstimate: input.pointEstimate,
        abstained: outcome.abstain,
        replayBindingId: replayBinding.bindingId,
        featureSnapshotFingerprint,
        outcomeArtifactFingerprint,
        modelArtifactFingerprint: replayBinding.modelArtifactFingerprint,
        outcome,
      };
    },
  );

  return {
    contractVersion: "ccf-rolling-validation-execution-v1",
    replayBinding,
    pointEstimate: input.pointEstimate,
    predictions,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
