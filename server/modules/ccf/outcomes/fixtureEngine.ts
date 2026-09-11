import {
  assertCCFNativeIndependence,
  type CCFCriticalFeatureProvenance,
  type CCFMechanismContribution,
  type CCFPlayerOutcome,
  type CCFPosition,
  type CCFScoringFormat,
} from "./contract";

/**
 * Certification scaffold only.
 *
 * This is deliberately not a production projection model. It creates a
 * deterministic, CCF-native outcome distribution from explicit fixture inputs
 * so CCF-INDEP-001 can exercise the complete native contract before the real
 * Player Outcome Engine is promoted.
 */
export interface CCFFixtureOutcomeInput {
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  scoringFormat: CCFScoringFormat;
  scoringFingerprint?: string;
  asOf: string;

  neutralBaselineFpts: number;
  adjustments: {
    roleOpportunity: number;
    efficiency: number;
    gameEnvironment: number;
    matchupScheme: number;
    readiness: number;
    weatherVenue: number;
  };
  volatilityFpts: number;
  zeroOrNearZeroProbability: number;
  boomProbability: number;
  bustProbability: number;
  confidence: number;
  coverage: number;
  abstainBelowCoverage?: number;

  mechanismContributions: CCFMechanismContribution[];
  criticalFeatureProvenance: CCFCriticalFeatureProvenance[];
}

const NORMAL_P10_Z = 1.2815515655446004;
const NORMAL_P25_Z = 0.6744897501960817;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function nonNegative(value: number): number {
  return Math.max(0, value);
}

export function buildCCFFixtureNativeOutcome(
  input: CCFFixtureOutcomeInput,
): CCFPlayerOutcome {
  const adjustmentTotal = Object.values(input.adjustments).reduce(
    (sum, value) => sum + value,
    0,
  );

  const median = nonNegative(input.neutralBaselineFpts + adjustmentTotal);
  const sigma = Math.max(0, input.volatilityFpts);
  const p10 = nonNegative(median - NORMAL_P10_Z * sigma);
  const p25 = nonNegative(median - NORMAL_P25_Z * sigma);
  const p75 = nonNegative(median + NORMAL_P25_Z * sigma);
  const p90 = nonNegative(median + NORMAL_P10_Z * sigma);

  const abstainBelowCoverage = input.abstainBelowCoverage ?? 0.5;
  const abstain = input.coverage < abstainBelowCoverage;
  const abstainReasons = abstain
    ? [`native_coverage_below_${abstainBelowCoverage.toFixed(2)}`]
    : [];

  const outcome: CCFPlayerOutcome = {
    playerId: input.playerId,
    position: input.position,
    season: input.season,
    week: input.week,
    scoringFormat: input.scoringFormat,
    scoringFingerprint: input.scoringFingerprint,
    meanFpts: round2(median),
    medianFpts: round2(median),
    p10Fpts: round2(p10),
    p25Fpts: round2(p25),
    p75Fpts: round2(p75),
    p90Fpts: round2(p90),
    zeroOrNearZeroProbability: input.zeroOrNearZeroProbability,
    boomProbability: input.boomProbability,
    bustProbability: input.bustProbability,
    volatility: round2(sigma),
    confidence: input.confidence,
    coverage: input.coverage,
    abstain,
    abstainReasons,
    mechanismContributions: input.mechanismContributions,
    criticalFeatureProvenance: input.criticalFeatureProvenance,
    modelVersion: "ccf-player-outcome-v0-certification-fixture",
    asOf: input.asOf,
    mode: "CCF_NATIVE",
  };

  return assertCCFNativeIndependence(outcome);
}
