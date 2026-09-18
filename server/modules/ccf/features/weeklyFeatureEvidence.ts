import {
  isCCFNativeProducerFamily,
  type CCFEvidenceKind,
  type CCFPosition,
  type CCFProducerFamily,
} from "../outcomes/contract";

export type CCFWeeklyFeatureStatus = "available" | "missing" | "ineligible";

export interface CCFAvailableWeeklyFeature {
  key: string;
  status: "available";
  value: number;
  unit?: string;
  producerFamily: CCFProducerFamily;
  evidenceKind: CCFEvidenceKind;
  knownAt: string;
  sourceRefs: string[];
}

export interface CCFUnavailableWeeklyFeature {
  key: string;
  status: "missing" | "ineligible";
  reason: string;
  producerFamily?: CCFProducerFamily;
  evidenceKind?: CCFEvidenceKind;
  knownAt?: string;
  sourceRefs: string[];
}

export type CCFWeeklyFeatureEvidence =
  | CCFAvailableWeeklyFeature
  | CCFUnavailableWeeklyFeature;

export interface CCFWeeklyNativeFeatureSet {
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  asOf: string;
  features: Record<string, CCFWeeklyFeatureEvidence>;
}

export interface CCFWeightedFeatureRequirement {
  key: string;
  weight: number;
}

export class CCFWeeklyFeatureContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFWeeklyFeatureContractError";
  }
}

export class CCFNativeFeatureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNativeFeatureUnavailableError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFWeeklyFeatureContractError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

export function validateCCFWeeklyNativeFeatureSet(
  featureSet: CCFWeeklyNativeFeatureSet,
): CCFWeeklyNativeFeatureSet {
  if (!featureSet.playerId.trim()) {
    throw new CCFWeeklyFeatureContractError("playerId is required");
  }
  if (!Number.isInteger(featureSet.season) || featureSet.season < 2000) {
    throw new CCFWeeklyFeatureContractError("season must be a valid integer season");
  }
  if (!Number.isInteger(featureSet.week) || featureSet.week < 1 || featureSet.week > 25) {
    throw new CCFWeeklyFeatureContractError("week must be an integer within [1, 25]");
  }

  const asOfMs = parseTimestamp("asOf", featureSet.asOf);

  for (const [recordKey, feature] of Object.entries(featureSet.features)) {
    if (!feature.key.trim()) {
      throw new CCFWeeklyFeatureContractError("feature key is required");
    }
    if (recordKey !== feature.key) {
      throw new CCFWeeklyFeatureContractError(
        `feature map key ${recordKey} does not match evidence key ${feature.key}`,
      );
    }

    if (feature.status === "available") {
      if (!Number.isFinite(feature.value)) {
        throw new CCFWeeklyFeatureContractError(`${feature.key} value must be finite`);
      }
      if (!isCCFNativeProducerFamily(feature.producerFamily)) {
        throw new CCFWeeklyFeatureContractError(
          `${feature.key} is available from non-native producer ${feature.producerFamily}`,
        );
      }
      const knownAtMs = parseTimestamp(`${feature.key}.knownAt`, feature.knownAt);
      if (knownAtMs > asOfMs) {
        throw new CCFWeeklyFeatureContractError(
          `${feature.key} violates temporal eligibility: knownAt > asOf`,
        );
      }
    } else {
      if (!feature.reason.trim()) {
        throw new CCFWeeklyFeatureContractError(
          `${feature.key} ${feature.status} evidence requires a reason`,
        );
      }
      if (feature.knownAt != null) {
        parseTimestamp(`${feature.key}.knownAt`, feature.knownAt);
      }
    }
  }

  return featureSet;
}

/**
 * Read a recommendation-critical feature without inventing a neutral/default
 * value. Missing, ineligible, non-native, or temporally invalid evidence fails
 * closed and must be handled through uncertainty/abstention by the caller.
 */
export function requireCCFNativeNumericFeature(
  featureSet: CCFWeeklyNativeFeatureSet,
  key: string,
): number {
  validateCCFWeeklyNativeFeatureSet(featureSet);
  const feature = featureSet.features[key];

  if (feature == null) {
    throw new CCFNativeFeatureUnavailableError(`${key} is not present in the native feature set`);
  }
  if (feature.status !== "available") {
    throw new CCFNativeFeatureUnavailableError(
      `${key} is ${feature.status}: ${feature.reason}`,
    );
  }

  return feature.value;
}

/**
 * Calculate explicit feature coverage from a caller-versioned requirement set.
 * Weighting belongs to that requirement policy; the feature contract never
 * guesses importance or silently substitutes a missing value.
 */
export function computeCCFNativeFeatureCoverage(
  featureSet: CCFWeeklyNativeFeatureSet,
  requirements: readonly CCFWeightedFeatureRequirement[],
): number {
  validateCCFWeeklyNativeFeatureSet(featureSet);

  if (requirements.length === 0) {
    return 1;
  }

  let totalWeight = 0;
  let availableWeight = 0;

  for (const requirement of requirements) {
    if (!requirement.key.trim()) {
      throw new CCFWeeklyFeatureContractError("coverage requirement key is required");
    }
    if (!Number.isFinite(requirement.weight) || requirement.weight < 0) {
      throw new CCFWeeklyFeatureContractError(
        `coverage weight for ${requirement.key} must be finite and non-negative`,
      );
    }

    totalWeight += requirement.weight;
    const feature = featureSet.features[requirement.key];
    if (feature?.status === "available") {
      availableWeight += requirement.weight;
    }
  }

  if (totalWeight === 0) {
    throw new CCFWeeklyFeatureContractError("coverage requirements must have positive total weight");
  }

  return availableWeight / totalWeight;
}
