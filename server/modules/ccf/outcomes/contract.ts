export type CCFPosition = "QB" | "RB" | "WR" | "TE";

export type CCFScoringFormat = "PPR" | "HALF_PPR" | "STANDARD" | "CUSTOM";

export type CCFProducerFamily =
  | "ccf_native_fact"
  | "ccf_native_derived"
  | "ccf_native_model"
  | "legacy_internal_heuristic"
  | "tiber_model"
  | "external_consensus"
  | "external_projection"
  | "challenger_only"
  | "unknown";

export type CCFEvidenceKind =
  | "observed"
  | "derived"
  | "inferred"
  | "external_challenger";

export interface CCFCriticalFeatureProvenance {
  feature: string;
  producerFamily: CCFProducerFamily;
  critical: boolean;
  evidenceKind: CCFEvidenceKind;
  sourceRef?: string;
  knownAt: string;
}

export interface CCFMechanismContribution {
  family: string;
  direction: "up" | "down" | "neutral";
  magnitude?: number;
  confidence: number;
  evidenceKind: CCFEvidenceKind;
  evidenceRefs: string[];
  note?: string;
}

export interface CCFPlayerOutcome {
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  scoringFormat: CCFScoringFormat;
  scoringFingerprint?: string;

  meanFpts: number;
  medianFpts: number;
  p10Fpts: number;
  p25Fpts: number;
  p75Fpts: number;
  p90Fpts: number;

  zeroOrNearZeroProbability: number;
  boomProbability: number;
  bustProbability: number;
  volatility: number;
  confidence: number;
  coverage: number;

  abstain: boolean;
  abstainReasons: string[];
  mechanismContributions: CCFMechanismContribution[];
  criticalFeatureProvenance: CCFCriticalFeatureProvenance[];

  modelVersion: string;
  asOf: string;
  mode: "CCF_NATIVE";
}

export class CCFOutcomeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFOutcomeContractError";
  }
}

export class CCFIndependenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFIndependenceError";
  }
}

/**
 * Native authority is intentionally narrower than "code that lives in this repo".
 * Only explicitly CCF-owned, provenance-aware producer families may influence a
 * CCF_NATIVE result. Legacy heuristics, unknown producers, TIBER outputs, and
 * external consensus/projections remain blocked even when they are locally
 * accessible.
 */
const NATIVE_PRODUCER_FAMILIES = new Set<CCFProducerFamily>([
  "ccf_native_fact",
  "ccf_native_derived",
  "ccf_native_model",
]);

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new CCFOutcomeContractError(`${label} must be finite`);
  }
}

function assertProbability(label: string, value: number): void {
  assertFinite(label, value);
  if (value < 0 || value > 1) {
    throw new CCFOutcomeContractError(`${label} must be within [0, 1]`);
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFOutcomeContractError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

export function validateCCFPlayerOutcome(outcome: CCFPlayerOutcome): CCFPlayerOutcome {
  if (!outcome.playerId.trim()) {
    throw new CCFOutcomeContractError("playerId is required");
  }
  if (!outcome.modelVersion.trim()) {
    throw new CCFOutcomeContractError("modelVersion is required");
  }
  if (!Number.isInteger(outcome.season) || outcome.season < 2000) {
    throw new CCFOutcomeContractError("season must be a valid integer season");
  }
  if (!Number.isInteger(outcome.week) || outcome.week < 1 || outcome.week > 25) {
    throw new CCFOutcomeContractError("week must be an integer within [1, 25]");
  }
  if (outcome.mode !== "CCF_NATIVE") {
    throw new CCFOutcomeContractError("native outcome contract requires mode CCF_NATIVE");
  }

  const distributionValues: Array<[string, number]> = [
    ["meanFpts", outcome.meanFpts],
    ["medianFpts", outcome.medianFpts],
    ["p10Fpts", outcome.p10Fpts],
    ["p25Fpts", outcome.p25Fpts],
    ["p75Fpts", outcome.p75Fpts],
    ["p90Fpts", outcome.p90Fpts],
    ["volatility", outcome.volatility],
  ];
  for (const [label, value] of distributionValues) {
    assertFinite(label, value);
  }

  if (
    !(
      outcome.p10Fpts <= outcome.p25Fpts &&
      outcome.p25Fpts <= outcome.medianFpts &&
      outcome.medianFpts <= outcome.p75Fpts &&
      outcome.p75Fpts <= outcome.p90Fpts
    )
  ) {
    throw new CCFOutcomeContractError(
      "quantiles must satisfy p10 <= p25 <= median <= p75 <= p90",
    );
  }

  if (outcome.volatility < 0) {
    throw new CCFOutcomeContractError("volatility must be non-negative");
  }

  assertProbability("zeroOrNearZeroProbability", outcome.zeroOrNearZeroProbability);
  assertProbability("boomProbability", outcome.boomProbability);
  assertProbability("bustProbability", outcome.bustProbability);
  assertProbability("confidence", outcome.confidence);
  assertProbability("coverage", outcome.coverage);

  const asOfMs = parseTimestamp("asOf", outcome.asOf);

  if (outcome.abstain && outcome.abstainReasons.length === 0) {
    throw new CCFOutcomeContractError("abstaining outcomes require at least one abstain reason");
  }
  if (!outcome.abstain && outcome.abstainReasons.length > 0) {
    throw new CCFOutcomeContractError("non-abstaining outcomes must not carry abstain reasons");
  }

  for (const contribution of outcome.mechanismContributions) {
    assertProbability(`mechanism ${contribution.family} confidence`, contribution.confidence);
    if (contribution.magnitude != null) {
      assertFinite(`mechanism ${contribution.family} magnitude`, contribution.magnitude);
    }
  }

  for (const feature of outcome.criticalFeatureProvenance) {
    if (!feature.feature.trim()) {
      throw new CCFOutcomeContractError("critical feature provenance requires a feature name");
    }
    const knownAtMs = parseTimestamp(`knownAt for ${feature.feature}`, feature.knownAt);
    if (knownAtMs > asOfMs) {
      throw new CCFOutcomeContractError(
        `feature ${feature.feature} violates temporal eligibility: knownAt > asOf`,
      );
    }
  }

  return outcome;
}

export function assertCCFNativeIndependence(outcome: CCFPlayerOutcome): CCFPlayerOutcome {
  validateCCFPlayerOutcome(outcome);

  const blockedCriticalFeatures = outcome.criticalFeatureProvenance.filter(
    (feature) => feature.critical && !NATIVE_PRODUCER_FAMILIES.has(feature.producerFamily),
  );

  if (blockedCriticalFeatures.length > 0) {
    const details = blockedCriticalFeatures
      .map((feature) => `${feature.feature}:${feature.producerFamily}`)
      .join(", ");
    throw new CCFIndependenceError(
      `CCF_NATIVE contains recommendation-critical non-native producers: ${details}`,
    );
  }

  return outcome;
}

export function isCCFNativeProducerFamily(family: CCFProducerFamily): boolean {
  return NATIVE_PRODUCER_FAMILIES.has(family);
}
