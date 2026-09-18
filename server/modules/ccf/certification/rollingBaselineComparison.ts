import {
  compareCCFModelToBenchmark,
  type CCFModelBenchmarkComparison,
} from "./modelComparison";
import {
  evaluateCCFPairedBlockBootstrap,
  type CCFPairedBlockBootstrapResult,
} from "./pairedUncertainty";
import {
  predictCCFHistoricalMean,
  predictCCFRecentMean,
  predictCCFUsageRateBaseline,
  type CCFBenchmarkObservation,
} from "./simpleBenchmarks";
import {
  fingerprintCCFHistoricalDatasetManifest,
  validateCCFHistoricalDatasetManifest,
  type CCFHistoricalDatasetManifest,
} from "./historicalDatasetManifest";
import {
  fingerprintCCFPredictiveValidationProtocol,
  validateCCFPredictiveValidationProtocol,
  type CCFPredictiveValidationProtocol,
} from "./predictiveValidationProtocol";
import {
  assertCCFHistoricalFeaturePacketMatches,
  assertCCFHistoricalOutcomeWitnessMatches,
  type CCFHistoricalFeaturePacketV1,
  type CCFHistoricalOutcomeWitnessV1,
  type CCFRollingValidationExecutionV1,
} from "./rollingValidationExecution";

export type CCFRollingBaselineArm =
  | "historical_mean"
  | "recent_mean"
  | "usage_rate";

export interface CCFRollingBaselinePredictionV1 {
  contractVersion: "ccf-rolling-baseline-prediction-v1";
  rowId: string;
  blockId: string;
  arm: CCFRollingBaselineArm;
  predictedFantasyPoints: number | null;
  sampleSize: number;
  note: string | null;
}

export interface CCFRollingBaselineArmEvidenceV1 {
  arm: CCFRollingBaselineArm;
  predictions: CCFRollingBaselinePredictionV1[];
  comparison: CCFModelBenchmarkComparison;
  pairedMaeUncertainty: CCFPairedBlockBootstrapResult;
}

export interface CCFRollingBaselineComparisonV1 {
  contractVersion: "ccf-rolling-baseline-comparison-v1";
  replayBindingId: string;
  protocolFingerprint: string;
  pointEstimate: CCFRollingValidationExecutionV1["pointEstimate"];
  opportunityFeatureKey: string;
  recentGames: number;
  arms: Record<CCFRollingBaselineArm, CCFRollingBaselineArmEvidenceV1>;
  finalHoldoutAccessed: false;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface BuildCCFRollingBaselineComparisonInput {
  manifest: CCFHistoricalDatasetManifest;
  protocol: CCFPredictiveValidationProtocol;
  validation: CCFRollingValidationExecutionV1;
  trainingFeaturePackets: CCFHistoricalFeaturePacketV1[];
  trainingOutcomeWitnesses: CCFHistoricalOutcomeWitnessV1[];
  validationFeaturePackets: CCFHistoricalFeaturePacketV1[];
  opportunityFeatureKey: string;
  recentGames?: number;
}

export class CCFRollingBaselineComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingBaselineComparisonError";
  }
}

function indexByRowId<T extends { rowId: string }>(
  label: string,
  rows: readonly T[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!row.rowId.trim()) {
      throw new CCFRollingBaselineComparisonError(`${label} rowId is required`);
    }
    if (result.has(row.rowId)) {
      throw new CCFRollingBaselineComparisonError(
        `duplicate ${label} rowId ${row.rowId}`,
      );
    }
    result.set(row.rowId, row);
  }
  return result;
}

function opportunityValue(
  packet: CCFHistoricalFeaturePacketV1,
  key: string,
): number | null {
  const feature = packet.featureSet.features[key];
  if (!feature || feature.status !== "available") return null;
  return Number.isFinite(feature.value) && feature.value >= 0
    ? feature.value
    : null;
}

function compareChronology(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  return left.season !== right.season
    ? left.season - right.season
    : left.week - right.week;
}

function validateExecutionIdentity(
  input: BuildCCFRollingBaselineComparisonInput,
): void {
  const manifestFingerprint = fingerprintCCFHistoricalDatasetManifest(
    input.manifest,
  );
  const protocolFingerprint = fingerprintCCFPredictiveValidationProtocol(
    input.protocol,
  );
  if (input.validation.replayBinding.manifestFingerprint !== manifestFingerprint) {
    throw new CCFRollingBaselineComparisonError(
      "validation replay binding does not match the supplied historical manifest",
    );
  }
  if (input.validation.replayBinding.protocolFingerprint !== protocolFingerprint) {
    throw new CCFRollingBaselineComparisonError(
      "validation replay binding does not match the supplied predictive protocol",
    );
  }
  if (input.validation.finalHoldoutAccessed !== false) {
    throw new CCFRollingBaselineComparisonError(
      "baseline comparison cannot consume a validation execution that opened final holdout",
    );
  }
}

export function buildCCFRollingBaselineComparison(
  input: BuildCCFRollingBaselineComparisonInput,
): CCFRollingBaselineComparisonV1 {
  const manifest = validateCCFHistoricalDatasetManifest(input.manifest);
  const protocol = validateCCFPredictiveValidationProtocol(input.protocol);
  validateExecutionIdentity({ ...input, manifest, protocol });

  if (!input.opportunityFeatureKey.trim()) {
    throw new CCFRollingBaselineComparisonError(
      "opportunityFeatureKey is required",
    );
  }
  const recentGames = input.recentGames ?? 4;
  if (!Number.isInteger(recentGames) || recentGames < 1) {
    throw new CCFRollingBaselineComparisonError(
      "recentGames must be a positive integer",
    );
  }

  const descriptorById = new Map(manifest.rows.map((row) => [row.rowId, row]));
  const trainingExpected = new Set(
    input.validation.replayBinding.trainingRowIds,
  );
  const evaluationExpected = new Set(
    input.validation.replayBinding.evaluationRowIds,
  );
  const trainingFeatures = indexByRowId(
    "training feature packet",
    input.trainingFeaturePackets,
  );
  const trainingOutcomes = indexByRowId(
    "training outcome witness",
    input.trainingOutcomeWitnesses,
  );
  const validationFeatures = indexByRowId(
    "validation feature packet",
    input.validationFeaturePackets,
  );

  for (const rowId of trainingFeatures.keys()) {
    if (!trainingExpected.has(rowId)) {
      throw new CCFRollingBaselineComparisonError(
        `training feature packet ${rowId} is outside the replay training fold`,
      );
    }
  }
  for (const rowId of trainingOutcomes.keys()) {
    if (!trainingExpected.has(rowId)) {
      const descriptor = descriptorById.get(rowId);
      if (descriptor?.outcomeAccess === "sealed_final_holdout") {
        throw new CCFRollingBaselineComparisonError(
          `training outcome witness ${rowId} would open the sealed final holdout`,
        );
      }
      throw new CCFRollingBaselineComparisonError(
        `training outcome witness ${rowId} is outside the replay training fold`,
      );
    }
  }
  for (const rowId of validationFeatures.keys()) {
    if (!evaluationExpected.has(rowId)) {
      throw new CCFRollingBaselineComparisonError(
        `validation feature packet ${rowId} is outside the replay validation fold`,
      );
    }
  }

  const trainingByPlayer = new Map<string, CCFBenchmarkObservation[]>();
  for (const rowId of input.validation.replayBinding.trainingRowIds) {
    const descriptor = descriptorById.get(rowId);
    const featurePacket = trainingFeatures.get(rowId);
    const outcomeWitness = trainingOutcomes.get(rowId);
    if (!descriptor || !featurePacket || !outcomeWitness) {
      throw new CCFRollingBaselineComparisonError(
        `training row ${rowId} requires one feature packet and one outcome witness`,
      );
    }
    assertCCFHistoricalFeaturePacketMatches(descriptor, featurePacket);
    assertCCFHistoricalOutcomeWitnessMatches(descriptor, outcomeWitness);
    const history = trainingByPlayer.get(descriptor.canonicalPlayerId) ?? [];
    history.push({
      playerId: descriptor.canonicalPlayerId,
      actualFantasyPoints: outcomeWitness.actualFantasyPoints,
      opportunity: opportunityValue(featurePacket, input.opportunityFeatureKey) ?? undefined,
      season: descriptor.season,
      week: descriptor.week,
    });
    trainingByPlayer.set(descriptor.canonicalPlayerId, history);
  }
  for (const history of trainingByPlayer.values()) {
    history.sort(compareChronology);
  }

  const nativeByRowId = new Map(
    input.validation.predictions.map((row) => [row.rowId, row]),
  );
  const baselineRows: Record<CCFRollingBaselineArm, CCFRollingBaselinePredictionV1[]> = {
    historical_mean: [],
    recent_mean: [],
    usage_rate: [],
  };

  for (const rowId of input.validation.replayBinding.evaluationRowIds) {
    const descriptor = descriptorById.get(rowId);
    const native = nativeByRowId.get(rowId);
    const packet = validationFeatures.get(rowId);
    if (!descriptor || !native || !packet) {
      throw new CCFRollingBaselineComparisonError(
        `validation row ${rowId} requires native prediction and feature packet`,
      );
    }
    assertCCFHistoricalFeaturePacketMatches(descriptor, packet);
    const history = trainingByPlayer.get(descriptor.canonicalPlayerId) ?? [];
    const expectedOpportunity = opportunityValue(
      packet,
      input.opportunityFeatureKey,
    );
    const baselines = [
      predictCCFHistoricalMean(history),
      predictCCFRecentMean(history, recentGames),
      predictCCFUsageRateBaseline(history, expectedOpportunity),
    ];

    for (const baseline of baselines) {
      baselineRows[baseline.model].push({
        contractVersion: "ccf-rolling-baseline-prediction-v1",
        rowId,
        blockId: native.blockId,
        arm: baseline.model,
        predictedFantasyPoints: baseline.predictedFantasyPoints,
        sampleSize: baseline.sampleSize,
        note: baseline.note ?? null,
      });
    }
  }

  const arms = Object.fromEntries(
    (["historical_mean", "recent_mean", "usage_rate"] as const).map((arm) => {
      const rows = baselineRows[arm];
      const byRowId = new Map(rows.map((row) => [row.rowId, row]));
      const pairedRows = input.validation.predictions.map((native) => {
        const baseline = byRowId.get(native.rowId);
        return {
          actual: native.actualFantasyPoints,
          candidate: native.predictedFantasyPoints,
          benchmark: baseline?.predictedFantasyPoints ?? null,
        };
      });
      const comparison = compareCCFModelToBenchmark(pairedRows);
      const uncertaintyRows = input.validation.predictions.map((native) => {
        const baseline = byRowId.get(native.rowId);
        const candidateLoss = Math.abs(
          native.predictedFantasyPoints - native.actualFantasyPoints,
        );
        const benchmarkLoss =
          baseline?.predictedFantasyPoints == null
            ? null
            : Math.abs(
                baseline.predictedFantasyPoints - native.actualFantasyPoints,
              );
        return {
          blockId: native.blockId,
          candidateLoss,
          comparatorLoss: benchmarkLoss,
        };
      });
      const pairedMaeUncertainty = evaluateCCFPairedBlockBootstrap(
        uncertaintyRows,
        {
          iterations: protocol.uncertaintyPolicy.iterations,
          confidenceLevel: protocol.uncertaintyPolicy.confidenceLevel,
          seed: `${protocol.uncertaintyPolicy.deterministicSeed}:${arm}:mae`,
        },
      );
      return [
        arm,
        {
          arm,
          predictions: rows,
          comparison,
          pairedMaeUncertainty,
        },
      ];
    }),
  ) as Record<CCFRollingBaselineArm, CCFRollingBaselineArmEvidenceV1>;

  return {
    contractVersion: "ccf-rolling-baseline-comparison-v1",
    replayBindingId: input.validation.replayBinding.bindingId,
    protocolFingerprint: fingerprintCCFPredictiveValidationProtocol(protocol),
    pointEstimate: input.validation.pointEstimate,
    opportunityFeatureKey: input.opportunityFeatureKey,
    recentGames,
    arms,
    finalHoldoutAccessed: false,
    certificationOnly: true,
    productionInferenceAuthorized: false,
  };
}
