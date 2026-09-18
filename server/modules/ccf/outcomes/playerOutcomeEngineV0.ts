import crypto from "crypto";
import type {
  CCFCriticalFeatureProvenance,
  CCFMechanismContribution,
  CCFPlayerOutcome,
  CCFPosition,
  CCFScoringFormat,
} from "./contract";
import { assertCCFNativeIndependence } from "./contract";
import {
  computeCCFNativeFeatureCoverage,
  validateCCFWeeklyNativeFeatureSet,
  type CCFAvailableWeeklyFeature,
  type CCFWeightedFeatureRequirement,
  type CCFWeeklyNativeFeatureSet,
} from "../features/weeklyFeatureEvidence";

export interface CCFLinearHeadV0 {
  intercept: number;
  coefficients: Record<string, number>;
}

export interface CCFPlayerOutcomeModelArtifactV0 {
  contractVersion: "ccf-player-outcome-model-artifact-v0";
  modelVersion: string;
  position: CCFPosition;
  scoringFormat: CCFScoringFormat;
  scoringFingerprint: string;
  featureKeys: string[];
  criticalFeatureKeys: string[];
  coverageRequirements: CCFWeightedFeatureRequirement[];
  featureFamilies: Record<string, string>;
  heads: {
    meanFpts: CCFLinearHeadV0;
    medianFpts: CCFLinearHeadV0;
    p10Fpts: CCFLinearHeadV0;
    p25Fpts: CCFLinearHeadV0;
    p75Fpts: CCFLinearHeadV0;
    p90Fpts: CCFLinearHeadV0;
    logVolatility: CCFLinearHeadV0;
    zeroOrNearZeroProbabilityLogit: CCFLinearHeadV0;
    boomProbabilityLogit: CCFLinearHeadV0;
    bustProbabilityLogit: CCFLinearHeadV0;
    confidenceLogit: CCFLinearHeadV0;
  };
  abstainBelowCoverage: number;
  trainingDatasetFingerprint: string;
  trainingDatasetFrozenAt: string;
  validationProtocolFingerprint: string;
  validationProtocolFrozenAt: string;
  sourcePlanFingerprint: string;
  featureSetFingerprint: string;
  decisionPolicyFingerprint: string;
  supportedPopulation: string;
  trainedAt: string;
  frozenAt: string;
  trainingDatasetRef: string;
  validationProtocolRef: string;
  notes: string[];
}

export interface RunCCFPlayerOutcomeEngineV0Input {
  featureSet: CCFWeeklyNativeFeatureSet;
  artifact: CCFPlayerOutcomeModelArtifactV0;
  scoringFormat: CCFScoringFormat;
  scoringFingerprint: string;
}

export interface CCFPlayerOutcomeHistoricalReplayAuthorizationV1 {
  contractVersion: "ccf-player-outcome-historical-replay-authorization-v1";
  targetDecisionAsOf: string;
  trainingEvidenceMaxKnownAt: string;
  trainingDatasetFingerprint: string;
  validationProtocolFingerprint: string;
  certificationOnly: true;
  productionInferenceAuthorized: false;
}

export interface RunCCFPlayerOutcomeEngineV0HistoricalReplayInput
  extends RunCCFPlayerOutcomeEngineV0Input {
  replayAuthorization: CCFPlayerOutcomeHistoricalReplayAuthorizationV1;
}

export class CCFPlayerOutcomeModelArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFPlayerOutcomeModelArtifactError";
  }
}

export class CCFPlayerOutcomeInferenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFPlayerOutcomeInferenceUnavailableError";
  }
}

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFPlayerOutcomeModelArtifactError(`${label} is required`);
  }
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFPlayerOutcomeModelArtifactError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function finite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new CCFPlayerOutcomeModelArtifactError(`${label} must be finite`);
  }
}

function probability(label: string, value: number): void {
  finite(label, value);
  if (value < 0 || value > 1) {
    throw new CCFPlayerOutcomeModelArtifactError(`${label} must be within [0, 1]`);
  }
}

function uniqueNonEmpty(label: string, values: readonly string[]): string[] {
  if (values.some((value) => !value.trim())) {
    throw new CCFPlayerOutcomeModelArtifactError(`${label} must not contain blank values`);
  }
  if (new Set(values).size !== values.length) {
    throw new CCFPlayerOutcomeModelArtifactError(`${label} must contain unique values`);
  }
  return [...values];
}

function headEntries(
  artifact: CCFPlayerOutcomeModelArtifactV0,
): Array<[string, CCFLinearHeadV0]> {
  return Object.entries(artifact.heads) as Array<[string, CCFLinearHeadV0]>;
}

function validateHead(
  label: string,
  head: CCFLinearHeadV0,
  featureKeys: readonly string[],
): void {
  finite(`${label}.intercept`, head.intercept);
  const coefficientKeys = Object.keys(head.coefficients).sort();
  const expected = [...featureKeys].sort();
  if (
    coefficientKeys.length !== expected.length ||
    coefficientKeys.some((key, index) => key !== expected[index])
  ) {
    throw new CCFPlayerOutcomeModelArtifactError(
      `${label}.coefficients must match featureKeys exactly`,
    );
  }
  for (const key of expected) {
    finite(`${label}.coefficients.${key}`, head.coefficients[key]);
  }
}

export function validateCCFPlayerOutcomeModelArtifactV0(
  artifact: CCFPlayerOutcomeModelArtifactV0,
): CCFPlayerOutcomeModelArtifactV0 {
  if (artifact.contractVersion !== "ccf-player-outcome-model-artifact-v0") {
    throw new CCFPlayerOutcomeModelArtifactError("unsupported model artifact version");
  }
  requireText("modelVersion", artifact.modelVersion);
  requireText("scoringFingerprint", artifact.scoringFingerprint);
  requireText("trainingDatasetFingerprint", artifact.trainingDatasetFingerprint);
  requireText("validationProtocolFingerprint", artifact.validationProtocolFingerprint);
  requireText("sourcePlanFingerprint", artifact.sourcePlanFingerprint);
  requireText("featureSetFingerprint", artifact.featureSetFingerprint);
  requireText("decisionPolicyFingerprint", artifact.decisionPolicyFingerprint);
  requireText("supportedPopulation", artifact.supportedPopulation);
  requireText("trainingDatasetRef", artifact.trainingDatasetRef);
  requireText("validationProtocolRef", artifact.validationProtocolRef);

  if (!["QB", "RB", "WR", "TE"].includes(artifact.position)) {
    throw new CCFPlayerOutcomeModelArtifactError("position must be QB, RB, WR, or TE");
  }
  if (!["PPR", "HALF_PPR", "STANDARD", "CUSTOM"].includes(artifact.scoringFormat)) {
    throw new CCFPlayerOutcomeModelArtifactError("unsupported scoring format");
  }

  const featureKeys = uniqueNonEmpty("featureKeys", artifact.featureKeys);
  if (featureKeys.length === 0) {
    throw new CCFPlayerOutcomeModelArtifactError("featureKeys must not be empty");
  }
  const critical = uniqueNonEmpty("criticalFeatureKeys", artifact.criticalFeatureKeys);
  const featureSet = new Set(featureKeys);
  for (const key of critical) {
    if (!featureSet.has(key)) {
      throw new CCFPlayerOutcomeModelArtifactError(
        `critical feature ${key} must also appear in featureKeys`,
      );
    }
  }

  const familyKeys = Object.keys(artifact.featureFamilies).sort();
  const sortedFeatures = [...featureKeys].sort();
  if (
    familyKeys.length !== sortedFeatures.length ||
    familyKeys.some((key, index) => key !== sortedFeatures[index])
  ) {
    throw new CCFPlayerOutcomeModelArtifactError(
      "featureFamilies must match featureKeys exactly",
    );
  }
  for (const key of sortedFeatures) {
    requireText(`featureFamilies.${key}`, artifact.featureFamilies[key]);
  }

  for (const [label, head] of headEntries(artifact)) {
    validateHead(`heads.${label}`, head, featureKeys);
  }

  const coverageKeys = new Set<string>();
  let totalCoverageWeight = 0;
  for (const requirement of artifact.coverageRequirements) {
    requireText("coverageRequirements.key", requirement.key);
    if (coverageKeys.has(requirement.key)) {
      throw new CCFPlayerOutcomeModelArtifactError(
        `duplicate coverage requirement ${requirement.key}`,
      );
    }
    coverageKeys.add(requirement.key);
    finite(`coverageRequirements.${requirement.key}.weight`, requirement.weight);
    if (requirement.weight < 0) {
      throw new CCFPlayerOutcomeModelArtifactError(
        `coverage weight for ${requirement.key} must be non-negative`,
      );
    }
    totalCoverageWeight += requirement.weight;
  }
  if (artifact.coverageRequirements.length > 0 && totalCoverageWeight <= 0) {
    throw new CCFPlayerOutcomeModelArtifactError(
      "coverage requirements must have positive total weight",
    );
  }

  probability("abstainBelowCoverage", artifact.abstainBelowCoverage);
  const datasetFrozenAtMs = timestamp(
    "trainingDatasetFrozenAt",
    artifact.trainingDatasetFrozenAt,
  );
  const protocolFrozenAtMs = timestamp(
    "validationProtocolFrozenAt",
    artifact.validationProtocolFrozenAt,
  );
  const trainedAtMs = timestamp("trainedAt", artifact.trainedAt);
  const frozenAtMs = timestamp("frozenAt", artifact.frozenAt);
  if (datasetFrozenAtMs > protocolFrozenAtMs) {
    throw new CCFPlayerOutcomeModelArtifactError(
      "training dataset must be frozen no later than the validation protocol",
    );
  }
  if (protocolFrozenAtMs > trainedAtMs) {
    throw new CCFPlayerOutcomeModelArtifactError(
      "validation protocol must be frozen before model training",
    );
  }
  if (trainedAtMs > frozenAtMs) {
    throw new CCFPlayerOutcomeModelArtifactError(
      "trainedAt must be no later than frozenAt",
    );
  }

  uniqueNonEmpty("notes", artifact.notes);
  return artifact;
}

function canonicalHead(head: CCFLinearHeadV0): object {
  return {
    intercept: head.intercept,
    coefficients: Object.fromEntries(
      Object.entries(head.coefficients).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export function fingerprintCCFPlayerOutcomeModelArtifactV0(
  artifact: CCFPlayerOutcomeModelArtifactV0,
): string {
  validateCCFPlayerOutcomeModelArtifactV0(artifact);
  const canonical = JSON.stringify({
    ...artifact,
    featureKeys: [...artifact.featureKeys].sort(),
    criticalFeatureKeys: [...artifact.criticalFeatureKeys].sort(),
    coverageRequirements: [...artifact.coverageRequirements].sort((left, right) =>
      left.key.localeCompare(right.key),
    ),
    featureFamilies: Object.fromEntries(
      Object.entries(artifact.featureFamilies).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    heads: Object.fromEntries(
      headEntries(artifact)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([label, head]) => [label, canonicalHead(head)]),
    ),
    notes: [...artifact.notes].sort(),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function linear(head: CCFLinearHeadV0, values: ReadonlyMap<string, number>): number {
  let result = head.intercept;
  for (const [key, coefficient] of Object.entries(head.coefficients)) {
    result += coefficient * values.get(key)!;
  }
  return result;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function featureEvidenceRef(feature: CCFAvailableWeeklyFeature): string {
  if (feature.sourceRefs.length === 1) return feature.sourceRefs[0];
  const canonical = JSON.stringify({
    key: feature.key,
    knownAt: feature.knownAt,
    sourceRefs: [...feature.sourceRefs].sort(),
  });
  const hash = crypto.createHash("sha256").update(canonical).digest("hex");
  return `ccf://weekly-feature-evidence/sha256/${hash}`;
}

function resolveModelFeatures(
  featureSet: CCFWeeklyNativeFeatureSet,
  artifact: CCFPlayerOutcomeModelArtifactV0,
): {
  values: Map<string, number>;
  features: Map<string, CCFAvailableWeeklyFeature>;
} {
  const values = new Map<string, number>();
  const features = new Map<string, CCFAvailableWeeklyFeature>();

  for (const key of artifact.featureKeys) {
    const feature = featureSet.features[key];
    if (!feature) {
      throw new CCFPlayerOutcomeInferenceUnavailableError(
        `required model feature ${key} is not present`,
      );
    }
    if (feature.status !== "available") {
      throw new CCFPlayerOutcomeInferenceUnavailableError(
        `required model feature ${key} is ${feature.status}: ${feature.reason}`,
      );
    }
    if (
      feature.sourceRefs.length === 0 ||
      feature.sourceRefs.some((reference) => !reference.trim()) ||
      new Set(feature.sourceRefs).size !== feature.sourceRefs.length
    ) {
      throw new CCFPlayerOutcomeInferenceUnavailableError(
        `required model feature ${key} must carry unique non-empty sourceRefs`,
      );
    }
    values.set(key, feature.value);
    features.set(key, feature);
  }
  return { values, features };
}

function mechanismContributions(
  artifact: CCFPlayerOutcomeModelArtifactV0,
  values: ReadonlyMap<string, number>,
  features: ReadonlyMap<string, CCFAvailableWeeklyFeature>,
  confidence: number,
  artifactRef: string,
): CCFMechanismContribution[] {
  const byFamily = new Map<
    string,
    { magnitude: number; evidenceRefs: Set<string> }
  >();

  for (const key of artifact.featureKeys) {
    const family = artifact.featureFamilies[key];
    const contribution =
      artifact.heads.medianFpts.coefficients[key] * values.get(key)!;
    const entry = byFamily.get(family) ?? {
      magnitude: 0,
      evidenceRefs: new Set<string>(),
    };
    entry.magnitude += contribution;
    for (const ref of features.get(key)!.sourceRefs) entry.evidenceRefs.add(ref);
    entry.evidenceRefs.add(artifactRef);
    byFamily.set(family, entry);
  }

  return Array.from(byFamily.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([family, entry]): CCFMechanismContribution => ({
      family,
      direction:
        Math.abs(entry.magnitude) < 1e-12
          ? "neutral"
          : entry.magnitude > 0
            ? "up"
            : "down",
      magnitude: round4(entry.magnitude),
      confidence,
      evidenceKind: "inferred",
      evidenceRefs: Array.from(entry.evidenceRefs).sort(),
    }));
}

function criticalFeatureProvenance(
  artifact: CCFPlayerOutcomeModelArtifactV0,
  features: ReadonlyMap<string, CCFAvailableWeeklyFeature>,
): CCFCriticalFeatureProvenance[] {
  const critical = new Set(artifact.criticalFeatureKeys);
  return artifact.featureKeys
    .map((key): CCFCriticalFeatureProvenance => {
      const feature = features.get(key)!;
      return {
        feature: key,
        producerFamily: feature.producerFamily,
        critical: critical.has(key),
        evidenceKind: feature.evidenceKind,
        sourceRef: featureEvidenceRef(feature),
        knownAt: feature.knownAt,
      };
    })
    .sort((left, right) => left.feature.localeCompare(right.feature));
}

function validateHistoricalReplayAuthorization(
  authorization: CCFPlayerOutcomeHistoricalReplayAuthorizationV1,
  artifact: CCFPlayerOutcomeModelArtifactV0,
  featureSet: CCFWeeklyNativeFeatureSet,
): void {
  if (
    authorization.contractVersion !==
    "ccf-player-outcome-historical-replay-authorization-v1"
  ) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "unsupported historical replay authorization version",
    );
  }
  if (
    authorization.certificationOnly !== true ||
    authorization.productionInferenceAuthorized !== false
  ) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "historical replay authorization cannot grant production inference authority",
    );
  }
  const targetDecisionAsOfMs = Date.parse(authorization.targetDecisionAsOf);
  const trainingEvidenceMaxKnownAtMs = Date.parse(
    authorization.trainingEvidenceMaxKnownAt,
  );
  if (
    !Number.isFinite(targetDecisionAsOfMs) ||
    !Number.isFinite(trainingEvidenceMaxKnownAtMs)
  ) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "historical replay authorization timestamps must be valid",
    );
  }
  if (authorization.targetDecisionAsOf !== featureSet.asOf) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "historical replay targetDecisionAsOf must exactly match feature-set asOf",
    );
  }
  if (trainingEvidenceMaxKnownAtMs > targetDecisionAsOfMs) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "historical replay training evidence cannot be known after the target decision",
    );
  }
  if (
    authorization.trainingDatasetFingerprint !==
    artifact.trainingDatasetFingerprint
  ) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "historical replay training dataset fingerprint does not match the model artifact",
    );
  }
  if (
    authorization.validationProtocolFingerprint !==
    artifact.validationProtocolFingerprint
  ) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "historical replay validation protocol fingerprint does not match the model artifact",
    );
  }
}

function runCCFPlayerOutcomeEngineV0Validated(
  input: RunCCFPlayerOutcomeEngineV0Input,
  replayAuthorization?: CCFPlayerOutcomeHistoricalReplayAuthorizationV1,
): CCFPlayerOutcome {
  const artifact = validateCCFPlayerOutcomeModelArtifactV0(input.artifact);
  const featureSet = validateCCFWeeklyNativeFeatureSet(input.featureSet);

  if (featureSet.position !== artifact.position) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      `model position ${artifact.position} does not match feature-set position ${featureSet.position}`,
    );
  }
  if (input.scoringFormat !== artifact.scoringFormat) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      `model scoring format ${artifact.scoringFormat} does not match requested ${input.scoringFormat}`,
    );
  }
  requireText("scoringFingerprint", input.scoringFingerprint);
  if (input.scoringFingerprint !== artifact.scoringFingerprint) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "requested scoring fingerprint does not match the model artifact",
    );
  }

  if (replayAuthorization) {
    validateHistoricalReplayAuthorization(
      replayAuthorization,
      artifact,
      featureSet,
    );
  } else {
    const asOfMs = Date.parse(featureSet.asOf);
    const artifactFrozenAtMs = Date.parse(artifact.frozenAt);
    if (artifactFrozenAtMs > asOfMs) {
      throw new CCFPlayerOutcomeInferenceUnavailableError(
        "model artifact was frozen after the feature-set asOf cutoff",
      );
    }
  }

  const { values, features } = resolveModelFeatures(featureSet, artifact);
  const coverage = computeCCFNativeFeatureCoverage(
    featureSet,
    artifact.coverageRequirements,
  );

  const meanFpts = linear(artifact.heads.meanFpts, values);
  const medianFpts = linear(artifact.heads.medianFpts, values);
  const p10Fpts = linear(artifact.heads.p10Fpts, values);
  const p25Fpts = linear(artifact.heads.p25Fpts, values);
  const p75Fpts = linear(artifact.heads.p75Fpts, values);
  const p90Fpts = linear(artifact.heads.p90Fpts, values);
  const volatility = Math.exp(linear(artifact.heads.logVolatility, values));
  if (!Number.isFinite(volatility)) {
    throw new CCFPlayerOutcomeInferenceUnavailableError(
      "model volatility head produced a non-finite result",
    );
  }

  const zeroProbability = sigmoid(
    linear(artifact.heads.zeroOrNearZeroProbabilityLogit, values),
  );
  const boomProbability = sigmoid(
    linear(artifact.heads.boomProbabilityLogit, values),
  );
  const bustProbability = sigmoid(
    linear(artifact.heads.bustProbabilityLogit, values),
  );
  const confidence = sigmoid(linear(artifact.heads.confidenceLogit, values));

  const abstain = coverage < artifact.abstainBelowCoverage;
  const abstainReasons = abstain
    ? [`native_coverage_below_${artifact.abstainBelowCoverage.toFixed(2)}`]
    : [];
  const artifactFingerprint = fingerprintCCFPlayerOutcomeModelArtifactV0(artifact);
  const artifactRef =
    `ccf://player-outcome-model-artifact/sha256/${artifactFingerprint}`;

  const outcome: CCFPlayerOutcome = {
    playerId: featureSet.playerId,
    position: featureSet.position,
    season: featureSet.season,
    week: featureSet.week,
    scoringFormat: input.scoringFormat,
    scoringFingerprint: input.scoringFingerprint,
    meanFpts: round4(meanFpts),
    medianFpts: round4(medianFpts),
    p10Fpts: round4(p10Fpts),
    p25Fpts: round4(p25Fpts),
    p75Fpts: round4(p75Fpts),
    p90Fpts: round4(p90Fpts),
    zeroOrNearZeroProbability: round4(zeroProbability),
    boomProbability: round4(boomProbability),
    bustProbability: round4(bustProbability),
    volatility: round4(volatility),
    confidence: round4(confidence),
    coverage: round4(coverage),
    abstain,
    abstainReasons,
    mechanismContributions: mechanismContributions(
      artifact,
      values,
      features,
      round4(confidence),
      artifactRef,
    ),
    criticalFeatureProvenance: criticalFeatureProvenance(artifact, features),
    modelVersion: artifact.modelVersion,
    asOf: featureSet.asOf,
    mode: "CCF_NATIVE",
  };

  return assertCCFNativeIndependence(outcome);
}

export function runCCFPlayerOutcomeEngineV0(
  input: RunCCFPlayerOutcomeEngineV0Input,
): CCFPlayerOutcome {
  return runCCFPlayerOutcomeEngineV0Validated(input);
}

/**
 * Certification-only historical replay.
 *
 * Operational artifact creation timestamps may occur after a historical target
 * decision because the replay is executed later. The caller must instead
 * provide an explicit authorization binding the artifact to the fold-specific
 * training dataset/protocol and prove that all training evidence was known no
 * later than the historical decision. This path never grants live inference
 * authority.
 */
export function runCCFPlayerOutcomeEngineV0HistoricalReplay(
  input: RunCCFPlayerOutcomeEngineV0HistoricalReplayInput,
): CCFPlayerOutcome {
  return runCCFPlayerOutcomeEngineV0Validated(
    input,
    input.replayAuthorization,
  );
}
