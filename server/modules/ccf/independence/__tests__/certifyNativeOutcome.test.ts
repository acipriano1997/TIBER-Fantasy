import type { CCFPlayerOutcome } from "../../outcomes/contract";
import { certifyCCFNativeOutcome } from "../certifyNativeOutcome";
import type { CCFWeeklyDependencyRecord } from "../weeklyDependencyCensus";

function nativeOutcome(): CCFPlayerOutcome {
  return {
    playerId: "player-1",
    position: "WR",
    season: 2026,
    week: 1,
    scoringFormat: "PPR",
    meanFpts: 16,
    medianFpts: 16,
    p10Fpts: 7,
    p25Fpts: 11,
    p75Fpts: 21,
    p90Fpts: 26,
    zeroOrNearZeroProbability: 0.04,
    boomProbability: 0.2,
    bustProbability: 0.18,
    volatility: 6,
    confidence: 0.7,
    coverage: 0.8,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [],
    criticalFeatureProvenance: [
      {
        feature: "role_state",
        producerFamily: "ccf_native_model",
        critical: true,
        evidenceKind: "inferred",
        knownAt: "2026-09-10T20:00:00Z",
      },
    ],
    modelVersion: "ccf-player-outcome-v0-test",
    asOf: "2026-09-11T12:00:00Z",
    mode: "CCF_NATIVE",
  };
}

function nativeDependency(): CCFWeeklyDependencyRecord {
  return {
    surface: "weekly_outcome",
    fieldOrMechanism: "role_state",
    producerPath: "server/modules/ccf/role",
    producerFamily: "ccf_native_model",
    recommendationCritical: true,
    nativeStatus: "eligible_native",
    fallbackBehavior: "none",
    replacementOwner: "CCF",
    note: "test fixture",
  };
}

describe("certifyCCFNativeOutcome", () => {
  it("returns NATIVE_READY for a valid native outcome with a fully native scoped dependency graph", () => {
    const result = certifyCCFNativeOutcome(nativeOutcome(), {
      dependencies: [nativeDependency()],
    });

    expect(result).toMatchObject({
      gate: "CCF-INDEP-001",
      passed: true,
      state: "NATIVE_READY",
      findings: [],
    });
  });

  it("does not claim readiness while the default weekly census has unresolved blockers", () => {
    const result = certifyCCFNativeOutcome(nativeOutcome());

    expect(result.passed).toBe(false);
    expect(result.state).toBe("UNCERTIFIED");
    expect(
      result.findings.some((finding) => finding.code === "UNRESOLVED_CRITICAL_DEPENDENCY"),
    ).toBe(true);
  });

  it("reports a non-native critical outcome input", () => {
    const outcome = nativeOutcome();
    outcome.criticalFeatureProvenance = [
      {
        feature: "forecast_projection",
        producerFamily: "tiber_model",
        critical: true,
        evidenceKind: "external_challenger",
        knownAt: "2026-09-10T20:00:00Z",
      },
    ];

    const result = certifyCCFNativeOutcome(outcome, {
      dependencies: [nativeDependency()],
    });

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "NON_NATIVE_CRITICAL_INPUT" }),
      ]),
    );
  });

  it("reports invalid contract/temporal evidence separately from producer-family failures", () => {
    const outcome = nativeOutcome();
    outcome.criticalFeatureProvenance = [
      {
        feature: "late_usage",
        producerFamily: "ccf_native_fact",
        critical: true,
        evidenceKind: "observed",
        knownAt: "2026-09-11T13:00:00Z",
      },
    ];

    const result = certifyCCFNativeOutcome(outcome, {
      dependencies: [nativeDependency()],
    });

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "OUTCOME_CONTRACT_INVALID" }),
      ]),
    );
  });

  it("reports a pending dependency even when the outcome payload itself is native", () => {
    const dependency: CCFWeeklyDependencyRecord = {
      ...nativeDependency(),
      fieldOrMechanism: "injury_status",
      nativeStatus: "pending_verification",
    };

    const result = certifyCCFNativeOutcome(nativeOutcome(), {
      dependencies: [dependency],
    });

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual([
      expect.objectContaining({
        code: "UNRESOLVED_CRITICAL_DEPENDENCY",
        fieldOrMechanism: "injury_status",
        nativeStatus: "pending_verification",
      }),
    ]);
  });
});
