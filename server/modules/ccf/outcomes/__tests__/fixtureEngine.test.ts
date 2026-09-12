import { CCFIndependenceError } from "../contract";
import { buildCCFFixtureNativeOutcome } from "../fixtureEngine";

function nativeProvenance() {
  return [
    {
      feature: "neutral_baseline",
      producerFamily: "ccf_native_model" as const,
      critical: true,
      evidenceKind: "inferred" as const,
      sourceRef: "fixture-native-baseline",
      knownAt: "2026-09-10T20:00:00Z",
    },
    {
      feature: "role_opportunity",
      producerFamily: "ccf_native_derived" as const,
      critical: true,
      evidenceKind: "derived" as const,
      sourceRef: "fixture-role",
      knownAt: "2026-09-10T20:00:00Z",
    },
  ];
}

describe("buildCCFFixtureNativeOutcome", () => {
  it("builds a deterministic ordered native distribution", () => {
    const input = {
      playerId: "player-1",
      position: "WR" as const,
      season: 2026,
      week: 1,
      scoringFormat: "PPR" as const,
      asOf: "2026-09-11T12:00:00Z",
      neutralBaselineFpts: 14,
      adjustments: {
        roleOpportunity: 1.5,
        efficiency: 0.2,
        gameEnvironment: 0.6,
        matchupScheme: -0.3,
        readiness: -0.5,
        weatherVenue: 0,
      },
      volatilityFpts: 6,
      zeroOrNearZeroProbability: 0.04,
      boomProbability: 0.23,
      bustProbability: 0.17,
      confidence: 0.7,
      coverage: 0.82,
      mechanismContributions: [],
      criticalFeatureProvenance: nativeProvenance(),
    };

    const a = buildCCFFixtureNativeOutcome(input);
    const b = buildCCFFixtureNativeOutcome(input);

    expect(a).toEqual(b);
    expect(a.mode).toBe("CCF_NATIVE");
    expect(a.p10Fpts).toBeLessThanOrEqual(a.p25Fpts);
    expect(a.p25Fpts).toBeLessThanOrEqual(a.medianFpts);
    expect(a.medianFpts).toBeLessThanOrEqual(a.p75Fpts);
    expect(a.p75Fpts).toBeLessThanOrEqual(a.p90Fpts);
    expect(a.abstain).toBe(false);
  });

  it("abstains rather than fabricating confidence when native coverage is sparse", () => {
    const outcome = buildCCFFixtureNativeOutcome({
      playerId: "sparse-player",
      position: "TE",
      season: 2026,
      week: 1,
      scoringFormat: "HALF_PPR",
      asOf: "2026-09-11T12:00:00Z",
      neutralBaselineFpts: 7,
      adjustments: {
        roleOpportunity: 0,
        efficiency: 0,
        gameEnvironment: 0,
        matchupScheme: 0,
        readiness: 0,
        weatherVenue: 0,
      },
      volatilityFpts: 5,
      zeroOrNearZeroProbability: 0.15,
      boomProbability: 0.08,
      bustProbability: 0.42,
      confidence: 0.25,
      coverage: 0.3,
      mechanismContributions: [],
      criticalFeatureProvenance: nativeProvenance(),
    });

    expect(outcome.abstain).toBe(true);
    expect(outcome.abstainReasons).toEqual(["native_coverage_below_0.50"]);
  });

  it("refuses a TIBER-derived critical baseline", () => {
    expect(() =>
      buildCCFFixtureNativeOutcome({
        playerId: "player-1",
        position: "RB",
        season: 2026,
        week: 1,
        scoringFormat: "PPR",
        asOf: "2026-09-11T12:00:00Z",
        neutralBaselineFpts: 15,
        adjustments: {
          roleOpportunity: 0,
          efficiency: 0,
          gameEnvironment: 0,
          matchupScheme: 0,
          readiness: 0,
          weatherVenue: 0,
        },
        volatilityFpts: 5,
        zeroOrNearZeroProbability: 0.03,
        boomProbability: 0.2,
        bustProbability: 0.16,
        confidence: 0.75,
        coverage: 0.9,
        mechanismContributions: [],
        criticalFeatureProvenance: [
          {
            feature: "baseline_projection",
            producerFamily: "tiber_model",
            critical: true,
            evidenceKind: "external_challenger",
            sourceRef: "tiber-forecast",
            knownAt: "2026-09-10T20:00:00Z",
          },
        ],
      }),
    ).toThrow(CCFIndependenceError);
  });
});
