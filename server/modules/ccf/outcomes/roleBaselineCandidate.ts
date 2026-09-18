import {
  assertCCFNativeIndependence,
  type CCFCriticalFeatureProvenance,
  type CCFMechanismContribution,
  type CCFPlayerOutcome,
  type CCFPosition,
  type CCFScoringFormat,
} from "./contract";
import {
  computeCCFNativeFeatureCoverage,
  requireCCFNativeNumericFeature,
  validateCCFWeeklyNativeFeatureSet,
  type CCFWeeklyNativeFeatureSet,
} from "../features/weeklyFeatureEvidence";
import {
  fingerprintCCFLeagueScoringRules,
  validateCCFLeagueScoringRules,
  type CCFLeagueScoringRules,
} from "../scoring/scoringRules";

export interface CCFRoleBaselineParameters {
  contractVersion: "ccf-role-baseline-parameters-v1";
  modelVersion: string;
  position: CCFPosition;
  frozenAt: string;
  parameterArtifactRef: string;
  trainingDatasetFingerprint: string;
  featureContractRef: string;
  scoringProfileFingerprint: string;
  featureKeys: string[];
  meanIntercept: number;
  meanWeights: Record<string, number>;
  volatilityIntercept: number;
  volatilityWeights: Record<string, number>;
  minimumVolatility: number;
  thresholds: {
    zeroOrNearZeroFpts: number;
    bustFpts: number;
    boomFpts: number;
  };
  parameterConfidence: number;
  certificationState: "uncertified_candidate";
}

export interface BuildCCFRoleBaselineCandidateInput {
  featureSet: CCFWeeklyNativeFeatureSet;
  scoringFormat: CCFScoringFormat;
  scoringRules: CCFLeagueScoringRules;
  parameters: CCFRoleBaselineParameters;
}

export interface CCFRoleBaselineCandidateResult {
  candidateOnly: true;
  parameterArtifactRef: string;
  usedFeatureKeys: string[];
  outcome: CCFPlayerOutcome;
}

export class CCFRoleBaselineModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRoleBaselineModelError";
  }
}

export class CCFRoleBaselineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRoleBaselineUnavailableError";
  }
}

const NORMAL_P10_Z = 1.2815515655446004;
const NORMAL_P25_Z = 0.6744897501960817;

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFRoleBaselineModelError(`${label} is required`);
  }
  return value;
}

function finite(label: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new CCFRoleBaselineModelError(`${label} must be finite`);
  }
  return value;
}

function probability(label: string, value: number): number {
  finite(label, value);
  if (value < 0 || value > 1) {
    throw new CCFRoleBaselineModelError(`${label} must be within [0, 1]`);
  }
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRoleBaselineModelError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function nonNegative(value: number): number {
  return Math.max(0, value);
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-x * x));
  return sign * y;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function thresholdProbability(
  threshold: number,
  mean: number,
  sigma: number,
): number {
  if (sigma === 0) return mean <= threshold ? 1 : 0;
  return Math.min(1, Math.max(0, normalCdf((threshold - mean) / sigma)));
}

function upperThresholdProbability(
  threshold: number,
  mean: number,
  sigma: number,
): number {
  if (sigma === 0) return mean >= threshold ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - normalCdf((threshold - mean) / sigma)));
}

function sameKeys(
  label: string,
  expected: readonly string[],
  record: Record<string, number>,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new CCFRoleBaselineModelError(
      `${label} keys must exactly match featureKeys`,
    );
  }
}

function validateParameters(
  parameters: CCFRoleBaselineParameters,
  asOf: string,
): CCFRoleBaselineParameters {
  if (parameters.contractVersion !== "ccf-role-baseline-parameters-v1") {
    throw new CCFRoleBaselineModelError("unsupported role baseline parameter version");
  }
  if (parameters.certificationState !== "uncertified_candidate") {
    throw new CCFRoleBaselineModelError(
      "role baseline v1 only accepts uncertified candidate parameters",
    );
  }
  requireText("modelVersion", parameters.modelVersion);
  requireText("parameterArtifactRef", parameters.parameterArtifactRef);
  requireText("trainingDatasetFingerprint", parameters.trainingDatasetFingerprint);
  requireText("featureContractRef", parameters.featureContractRef);
  requireText("scoringProfileFingerprint", parameters.scoringProfileFingerprint);
  const frozenAtMs = timestamp("parameters.frozenAt", parameters.frozenAt);
  if (frozenAtMs > timestamp("asOf", asOf)) {
    throw new CCFRoleBaselineModelError(
      "candidate parameters were frozen after the requested asOf",
    );
  }
  if (parameters.featureKeys.length === 0) {
    throw new CCFRoleBaselineModelError("featureKeys must not be empty");
  }
  if (new Set(parameters.featureKeys).size !== parameters.featureKeys.length) {
    throw new CCFRoleBaselineModelError("featureKeys must be unique");
  }
  for (const key of parameters.featureKeys) requireText("featureKey", key);
  sameKeys("meanWeights", parameters.featureKeys, parameters.meanWeights);
  sameKeys("volatilityWeights", parameters.featureKeys, parameters.volatilityWeights);

  finite("meanIntercept", parameters.meanIntercept);
  finite("volatilityIntercept", parameters.volatilityIntercept);
  for (const [key, value] of Object.entries(parameters.meanWeights)) {
    finite(`meanWeights.${key}`, value);
  }
  for (const [key, value] of Object.entries(parameters.volatilityWeights)) {
    finite(`volatilityWeights.${key}`, value);
  }
  finite("minimumVolatility", parameters.minimumVolatility);
  if (parameters.minimumVolatility <= 0) {
    throw new CCFRoleBaselineModelError("minimumVolatility must be positive");
  }

  const { zeroOrNearZeroFpts, bustFpts, boomFpts } = parameters.thresholds;
  for (const [label, value] of [
    ["zeroOrNearZeroFpts", zeroOrNearZeroFpts],
    ["bustFpts", bustFpts],
    ["boomFpts", boomFpts],
  ] as const) {
    finite(`thresholds.${label}`, value);
    if (value < 0) {
      throw new CCFRoleBaselineModelError(`thresholds.${label} must be non-negative`);
    }
  }
  if (!(zeroOrNearZeroFpts <= bustFpts && bustFpts < boomFpts)) {
    throw new CCFRoleBaselineModelError(
      "thresholds must satisfy zeroOrNearZeroFpts <= bustFpts < boomFpts",
    );
  }
  probability("parameterConfidence", parameters.parameterConfidence);
  return parameters;
}

function featureEvidence(
  featureSet: CCFWeeklyNativeFeatureSet,
  featureKeys: readonly string[],
): {
  values: Record<string, number>;
  provenance: CCFCriticalFeatureProvenance[];
  sourceRefs: string[];
} {
  const values: Record<string, number> = {};
  const provenance: CCFCriticalFeatureProvenance[] = [];
  const sourceRefs = new Set<string>();

  for (const key of featureKeys) {
    const feature = featureSet.features[key];
    if (feature == null || feature.status !== "available") {
      const reason =
        feature == null ? "not present" : `${feature.status}: ${feature.reason}`;
      throw new CCFRoleBaselineUnavailableError(
        `required native feature ${key} is ${reason}`,
      );
    }
    const value = requireCCFNativeNumericFeature(featureSet, key);
    values[key] = value;
    if (
      feature.sourceRefs.length === 0 ||
      feature.sourceRefs.some((ref) => !ref.trim()) ||
      new Set(feature.sourceRefs).size !== feature.sourceRefs.length
    ) {
      throw new CCFRoleBaselineModelError(
        `required feature ${key} must carry unique non-empty source references`,
      );
    }
    for (const ref of feature.sourceRefs) sourceRefs.add(ref);
    provenance.push({
      feature: key,
      producerFamily: feature.producerFamily,
      critical: true,
      evidenceKind: feature.evidenceKind,
      sourceRef: [...feature.sourceRefs].sort()[0],
      knownAt: feature.knownAt,
    });
  }

  return { values, provenance, sourceRefs: Array.from(sourceRefs).sort() };
}

function weightedTotal(
  featureKeys: readonly string[],
  values: Record<string, number>,
  weights: Record<string, number>,
): number {
  return featureKeys.reduce(
    (sum, key) => sum + values[key] * weights[key],
    0,
  );
}

export function buildCCFRoleBaselineCandidate(
  input: BuildCCFRoleBaselineCandidateInput,
): CCFRoleBaselineCandidateResult {
  const featureSet = validateCCFWeeklyNativeFeatureSet(input.featureSet);
  const parameters = validateParameters(input.parameters, featureSet.asOf);
  validateCCFLeagueScoringRules(input.scoringRules);

  if (parameters.position !== featureSet.position) {
    throw new CCFRoleBaselineModelError(
      `parameter position ${parameters.position} does not match feature-set position ${featureSet.position}`,
    );
  }

  const scoringFingerprint = fingerprintCCFLeagueScoringRules(input.scoringRules);
  if (parameters.scoringProfileFingerprint !== scoringFingerprint) {
    throw new CCFRoleBaselineModelError(
      "parameter scoring profile does not match supplied league scoring rules",
    );
  }

  const requirements = parameters.featureKeys.map((key) => ({ key, weight: 1 }));
  const coverage = computeCCFNativeFeatureCoverage(featureSet, requirements);
  if (coverage < 1) {
    throw new CCFRoleBaselineUnavailableError(
      `role baseline requires complete feature coverage; observed ${coverage.toFixed(3)}`,
    );
  }

  const evidence = featureEvidence(featureSet, parameters.featureKeys);
  const roleAdjustment = weightedTotal(
    parameters.featureKeys,
    evidence.values,
    parameters.meanWeights,
  );
  const median = nonNegative(parameters.meanIntercept + roleAdjustment);
  const rawVolatility =
    parameters.volatilityIntercept +
    weightedTotal(
      parameters.featureKeys,
      evidence.values,
      parameters.volatilityWeights,
    );
  const sigma = Math.max(parameters.minimumVolatility, rawVolatility);

  const p10 = nonNegative(median - NORMAL_P10_Z * sigma);
  const p25 = nonNegative(median - NORMAL_P25_Z * sigma);
  const p75 = nonNegative(median + NORMAL_P25_Z * sigma);
  const p90 = nonNegative(median + NORMAL_P10_Z * sigma);

  const mechanism: CCFMechanismContribution = {
    family: "role_opportunity_baseline",
    direction:
      roleAdjustment > 0 ? "up" : roleAdjustment < 0 ? "down" : "neutral",
    magnitude: roleAdjustment,
    confidence: parameters.parameterConfidence,
    evidenceKind: "derived",
    evidenceRefs: Array.from(
      new Set([
        parameters.parameterArtifactRef,
        parameters.featureContractRef,
        ...evidence.sourceRefs,
      ]),
    ).sort(),
    note:
      "Uncertified candidate role-only baseline; efficiency, matchup, readiness, weather, and broader game-environment mechanisms are not yet modeled.",
  };

  const outcome: CCFPlayerOutcome = {
    playerId: featureSet.playerId,
    position: featureSet.position,
    season: featureSet.season,
    week: featureSet.week,
    scoringFormat: input.scoringFormat,
    scoringFingerprint,
    meanFpts: round2(median),
    medianFpts: round2(median),
    p10Fpts: round2(p10),
    p25Fpts: round2(p25),
    p75Fpts: round2(p75),
    p90Fpts: round2(p90),
    zeroOrNearZeroProbability: thresholdProbability(
      parameters.thresholds.zeroOrNearZeroFpts,
      median,
      sigma,
    ),
    boomProbability: upperThresholdProbability(
      parameters.thresholds.boomFpts,
      median,
      sigma,
    ),
    bustProbability: thresholdProbability(
      parameters.thresholds.bustFpts,
      median,
      sigma,
    ),
    volatility: round2(sigma),
    confidence: parameters.parameterConfidence * coverage,
    coverage,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [mechanism],
    criticalFeatureProvenance: evidence.provenance,
    modelVersion: parameters.modelVersion,
    asOf: featureSet.asOf,
    mode: "CCF_NATIVE",
  };

  return {
    candidateOnly: true,
    parameterArtifactRef: parameters.parameterArtifactRef,
    usedFeatureKeys: [...parameters.featureKeys],
    outcome: assertCCFNativeIndependence(outcome),
  };
}
