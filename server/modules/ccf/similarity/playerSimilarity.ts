export interface CCFPlayerFeatureVector {
  playerId: string;
  features: Record<string, number | null | undefined>;
}

export interface CCFSimilarityConfig {
  featureWeights?: Record<string, number>;
  minimumSharedFeatures: number;
  minimumSharedWeight?: number;
}

export interface CCFPlayerSimilarityResult {
  leftPlayerId: string;
  rightPlayerId: string;
  comparable: boolean;
  distance: number | null;
  similarity: number | null;
  sharedFeatures: string[];
  missingFromLeft: string[];
  missingFromRight: string[];
  sharedWeight: number;
  reason: string;
}

function validFeature(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function compareCCFPlayerFeatureVectors(
  left: CCFPlayerFeatureVector,
  right: CCFPlayerFeatureVector,
  config: CCFSimilarityConfig,
): CCFPlayerSimilarityResult {
  if (!left.playerId.trim() || !right.playerId.trim()) throw new Error("playerId is required");
  if (!Number.isInteger(config.minimumSharedFeatures) || config.minimumSharedFeatures < 1) {
    throw new Error("minimumSharedFeatures must be a positive integer");
  }
  if (config.minimumSharedWeight != null && (!Number.isFinite(config.minimumSharedWeight) || config.minimumSharedWeight < 0)) {
    throw new Error("minimumSharedWeight must be a non-negative finite number");
  }

  const allFeatures = Array.from(new Set([...Object.keys(left.features), ...Object.keys(right.features)])).sort();
  const sharedFeatures: string[] = [];
  const missingFromLeft: string[] = [];
  const missingFromRight: string[] = [];
  let weightedSquaredDifference = 0;
  let sharedWeight = 0;

  for (const feature of allFeatures) {
    const leftValue = left.features[feature];
    const rightValue = right.features[feature];
    const leftValid = validFeature(leftValue);
    const rightValid = validFeature(rightValue);

    if (!leftValid) missingFromLeft.push(feature);
    if (!rightValid) missingFromRight.push(feature);
    if (!leftValid || !rightValid) continue;

    const weight = config.featureWeights?.[feature] ?? 1;
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`weight for ${feature} must be non-negative and finite`);
    if (weight === 0) continue;

    sharedFeatures.push(feature);
    sharedWeight += weight;
    weightedSquaredDifference += weight * (leftValue - rightValue) ** 2;
  }

  const minimumSharedWeight = config.minimumSharedWeight ?? 0;
  if (sharedFeatures.length < config.minimumSharedFeatures || sharedWeight < minimumSharedWeight) {
    return {
      leftPlayerId: left.playerId,
      rightPlayerId: right.playerId,
      comparable: false,
      distance: null,
      similarity: null,
      sharedFeatures,
      missingFromLeft,
      missingFromRight,
      sharedWeight,
      reason: "insufficient shared governed feature coverage",
    };
  }

  const distance = Math.sqrt(weightedSquaredDifference / sharedWeight);
  return {
    leftPlayerId: left.playerId,
    rightPlayerId: right.playerId,
    comparable: true,
    distance,
    similarity: 1 / (1 + distance),
    sharedFeatures,
    missingFromLeft,
    missingFromRight,
    sharedWeight,
    reason: "comparison uses only shared present features; missing values are never imputed as neutral",
  };
}

export function rankCCFSimilarPlayers(
  target: CCFPlayerFeatureVector,
  candidates: readonly CCFPlayerFeatureVector[],
  config: CCFSimilarityConfig,
): CCFPlayerSimilarityResult[] {
  return candidates
    .filter((candidate) => candidate.playerId !== target.playerId)
    .map((candidate) => compareCCFPlayerFeatureVectors(target, candidate, config))
    .filter((result) => result.comparable)
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.rightPlayerId.localeCompare(b.rightPlayerId));
}
