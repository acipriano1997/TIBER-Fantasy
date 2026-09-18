/**
 * HELD PREWORK ONLY.
 *
 * Deep analytics evidence vocabulary for future FFCC research lanes.
 * This module is intentionally inert:
 * - no runtime imports
 * - no recommendation weights
 * - no fantasy-point modifiers
 * - no source promotion
 * - no final-holdout access
 */

export const DEEP_ANALYTICS_PREWORK_DOCTRINE_V1 = {
  id: "ffcc-deep-analytics-evidence-v1",
  runtimeActivation: false,
  recommendationAuthority: "none",
  finalHoldoutAccess: false,
  scoringWeights: false,
} as const;

export const DEEP_ANALYTICS_FAMILIES_V1 = [
  "TEAM_PLAY_VOLUME",
  "PASS_RUN_TENDENCY",
  "PLAYER_PARTICIPATION",
  "OFFENSIVE_INTENT",
  "TARGET_ALLOCATION",
  "RUSH_ALLOCATION",
  "HIGH_VALUE_OPPORTUNITY",
  "ROUTE_COVERAGE_INTERACTION",
  "RUN_SCHEME_BLOCKING",
  "PASS_PROTECTION_PRESSURE",
  "PLAYER_EXECUTION",
  "ROLE_STATE",
  "INJURY_AVAILABILITY",
  "GAME_ENVIRONMENT",
  "MARKET_CHALLENGER",
  "JOINT_DEPENDENCE",
  "DECISION_OPTIONALITY",
] as const;

export type DeepAnalyticsFamilyV1 =
  (typeof DEEP_ANALYTICS_FAMILIES_V1)[number];

export type DeepAnalyticsCoverageV1 =
  | "observed"
  | "partial"
  | "unavailable";

export type DeepAnalyticsProducerV1 =
  | "TIBER_DATA"
  | "TIBER_TEAMSTATE"
  | "TIBER_ROLE_OPPORTUNITY"
  | "TIBER_FORECAST"
  | "CCF"
  | "EXTERNAL_CHALLENGER";

export interface DeepAnalyticsEvidenceV1 {
  evidenceId: string;
  family: DeepAnalyticsFamilyV1;
  producer: DeepAnalyticsProducerV1;
  producerVersion: string;
  subjectId: string;
  season: number;
  week: number;
  knownAt: string;
  observedAt?: string | null;
  coverage: DeepAnalyticsCoverageV1;
  sampleSize?: number | null;
  featureKeys: string[];
  evidenceRefs: string[];
}

export interface DeepAnalyticsEligibilityV1 {
  eligibleForDiagnosticUse: boolean;
  eligibleForRuntimeInfluence: false;
  reasons: string[];
}

function isFiniteNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateDeepAnalyticsEvidenceV1(
  evidence: DeepAnalyticsEvidenceV1,
  decisionCutoff: string,
): DeepAnalyticsEligibilityV1 {
  const reasons: string[] = [];
  const cutoff = parseInstant(decisionCutoff);
  const knownAt = parseInstant(evidence.knownAt);
  const observedAt =
    evidence.observedAt == null ? null : parseInstant(evidence.observedAt);

  if (cutoff == null) reasons.push("invalid_decision_cutoff");
  if (knownAt == null) reasons.push("invalid_known_at");
  if (observedAt === null && evidence.observedAt != null) {
    reasons.push("invalid_observed_at");
  }

  if (knownAt != null && cutoff != null && knownAt > cutoff) {
    reasons.push("future_known_at");
  }

  if (
    observedAt != null &&
    knownAt != null &&
    knownAt < observedAt
  ) {
    reasons.push("known_before_observed");
  }

  if (!evidence.evidenceId.trim()) reasons.push("missing_evidence_id");
  if (!evidence.subjectId.trim()) reasons.push("missing_subject_id");
  if (!evidence.producerVersion.trim()) {
    reasons.push("missing_producer_version");
  }
  if (!isFiniteNonNegativeInteger(evidence.season)) {
    reasons.push("invalid_season");
  }
  if (!isFiniteNonNegativeInteger(evidence.week)) {
    reasons.push("invalid_week");
  }

  if (evidence.coverage === "unavailable") {
    if (evidence.featureKeys.length > 0) {
      reasons.push("unavailable_has_features");
    }
    if (evidence.sampleSize != null && evidence.sampleSize !== 0) {
      reasons.push("unavailable_has_sample");
    }
  }

  if (
    evidence.sampleSize != null &&
    !isFiniteNonNegativeInteger(evidence.sampleSize)
  ) {
    reasons.push("invalid_sample_size");
  }

  if (evidence.coverage !== "unavailable" && evidence.evidenceRefs.length === 0) {
    reasons.push("missing_evidence_refs");
  }

  return {
    eligibleForDiagnosticUse: reasons.length === 0,
    eligibleForRuntimeInfluence: false,
    reasons,
  };
}

export const DEEP_ANALYTICS_PRIORITY_LANES_V1 = [
  {
    lane: "RECEIVING_INTERACTION",
    families: [
      "OFFENSIVE_INTENT",
      "TARGET_ALLOCATION",
      "ROUTE_COVERAGE_INTERACTION",
      "PLAYER_EXECUTION",
    ] as DeepAnalyticsFamilyV1[],
  },
  {
    lane: "RUSHING_TRENCH_INTERACTION",
    families: [
      "RUSH_ALLOCATION",
      "RUN_SCHEME_BLOCKING",
      "PLAYER_EXECUTION",
    ] as DeepAnalyticsFamilyV1[],
  },
  {
    lane: "CONDITIONAL_OPPORTUNITY_REDISTRIBUTION",
    families: [
      "PLAYER_PARTICIPATION",
      "TARGET_ALLOCATION",
      "RUSH_ALLOCATION",
      "ROLE_STATE",
      "INJURY_AVAILABILITY",
    ] as DeepAnalyticsFamilyV1[],
  },
  {
    lane: "JOINT_OUTCOME_DECISION_UTILITY",
    families: [
      "JOINT_DEPENDENCE",
      "DECISION_OPTIONALITY",
      "GAME_ENVIRONMENT",
    ] as DeepAnalyticsFamilyV1[],
  },
] as const;
