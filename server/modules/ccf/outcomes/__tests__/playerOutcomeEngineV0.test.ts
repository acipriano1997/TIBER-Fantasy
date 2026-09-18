import type { CCFWeeklyNativeFeatureSet } from "../../features/weeklyFeatureEvidence";
import {
  fingerprintCCFPlayerOutcomeModelArtifactV0,
  runCCFPlayerOutcomeEngineV0,
  validateCCFPlayerOutcomeModelArtifactV0,
  type CCFLinearHeadV0,
  type CCFPlayerOutcomeModelArtifactV0,
} from "../playerOutcomeEngineV0";

const TARGETS = "opportunity.targets_per_recorded_game";
const TARGET_SHARE = "opportunity.mean_target_share";
const OPTIONAL_READINESS = "readiness.practice_participation";
const SCORING_FINGERPRINT = "ccf://scoring/league-a-v1";

function coefficients(
  targets = 0,
  targetShare = 0,
): Record<string, number> {
  return {
    [TARGETS]: targets,
    [TARGET_SHARE]: targetShare,
  };
}

function head(
  intercept: number,
  targets = 0,
  targetShare = 0,
): CCFLinearHeadV0 {
  return {
    intercept,
    coefficients: coefficients(targets, targetShare),
  };
}

function artifact(
  overrides: Partial<CCFPlayerOutcomeModelArtifactV0> = {},
): CCFPlayerOutcomeModelArtifactV0 {
  return {
    contractVersion: "ccf-player-outcome-model-artifact-v0",
    modelVersion: "ccf-player-outcome-rb-v0-test",
    position: "RB",
    scoringFormat: "CUSTOM",
    scoringFingerprint: SCORING_FINGERPRINT,
    featureKeys: [TARGETS, TARGET_SHARE],
    criticalFeatureKeys: [TARGETS, TARGET_SHARE],
    coverageRequirements: [
      { key: TARGETS, weight: 1 },
      { key: TARGET_SHARE, weight: 1 },
    ],
    featureFamilies: {
      [TARGETS]: "role_opportunity",
      [TARGET_SHARE]: "role_opportunity",
    },
    heads: {
      meanFpts: head(0.5, 1, 4),
      medianFpts: head(0, 1, 4),
      p10Fpts: head(-4, 1, 4),
      p25Fpts: head(-2, 1, 4),
      p75Fpts: head(2, 1, 4),
      p90Fpts: head(4, 1, 4),
      logVolatility: head(Math.log(3)),
      zeroOrNearZeroProbabilityLogit: head(-2),
      boomProbabilityLogit: head(-1),
      bustProbabilityLogit: head(0.5),
      confidenceLogit: head(1),
    },
    abstainBelowCoverage: 0.75,
    trainingDatasetFingerprint: "dataset-fixture-fingerprint",
    trainingDatasetFrozenAt: "2026-09-09T12:00:00Z",
    validationProtocolFingerprint: "protocol-fixture-fingerprint",
    validationProtocolFrozenAt: "2026-09-10T00:00:00Z",
    sourcePlanFingerprint: "source-plan-fixture-fingerprint",
    featureSetFingerprint: "feature-set-fixture-fingerprint",
    decisionPolicyFingerprint: "decision-policy-fixture-fingerprint",
    supportedPopulation: "synthetic-rb-population",
    trainedAt: "2026-09-10T12:00:00Z",
    frozenAt: "2026-09-13T12:00:00Z",
    trainingDatasetRef: "ccf://historical-dataset/sha256/training-fixture",
    validationProtocolRef: "ccf://predictive-validation/protocol-v1",
    notes: ["synthetic inference-kernel test artifact"],
    ...overrides,
  };
}

function featureSet(
  overrides: Partial<CCFWeeklyNativeFeatureSet> = {},
): CCFWeeklyNativeFeatureSet {
  return {
    playerId: "ccf-player-1",
    position: "RB",
    season: 2026,
    week: 3,
    asOf: "2026-09-17T12:00:00Z",
    features: {
      [TARGETS]: {
        key: TARGETS,
        status: "available",
        value: 8,
        unit: "per_recorded_game",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-16T12:00:00Z",
        sourceRefs: [
          "ccf://game-opportunity-ledger/sha256/a",
          "ccf://game-opportunity-ledger/sha256/b",
        ],
      },
      [TARGET_SHARE]: {
        key: TARGET_SHARE,
        status: "available",
        value: 0.25,
        unit: "share",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-16T12:00:00Z",
        sourceRefs: ["ccf://game-opportunity-ledger/sha256/b"],
      },
    },
    ...overrides,
  };
}

describe("CCF Player Outcome Engine v0 inference kernel", () => {
  it("runs a frozen trained artifact without embedding repository-owned coefficients", () => {
    const result = runCCFPlayerOutcomeEngineV0({
      featureSet: featureSet(),
      artifact: artifact(),
      scoringFormat: "CUSTOM",
      scoringFingerprint: SCORING_FINGERPRINT,
    });

    expect(result).toMatchObject({
      playerId: "ccf-player-1",
      position: "RB",
      season: 2026,
      week: 3,
      scoringFormat: "CUSTOM",
      scoringFingerprint: SCORING_FINGERPRINT,
      meanFpts: 9.5,
      medianFpts: 9,
      p10Fpts: 5,
      p25Fpts: 7,
      p75Fpts: 11,
      p90Fpts: 13,
      volatility: 3,
      coverage: 1,
      abstain: false,
      abstainReasons: [],
      modelVersion: "ccf-player-outcome-rb-v0-test",
      mode: "CCF_NATIVE",
    });
    expect(result.zeroOrNearZeroProbability).toBeCloseTo(0.1192, 4);
    expect(result.boomProbability).toBeCloseTo(0.2689, 4);
    expect(result.bustProbability).toBeCloseTo(0.6225, 4);
    expect(result.confidence).toBeCloseTo(0.7311, 4);
    expect(result.mechanismContributions).toEqual([
      expect.objectContaining({
        family: "role_opportunity",
        direction: "up",
        magnitude: 9,
        evidenceKind: "inferred",
      }),
    ]);
    expect(result.criticalFeatureProvenance).toHaveLength(2);
    expect(result.criticalFeatureProvenance.every((item) => item.critical)).toBe(true);
    expect(
      result.criticalFeatureProvenance.every(
        (item) => item.producerFamily === "ccf_native_derived",
      ),
    ).toBe(true);
  });

  it("can produce a numeric evaluation outcome while explicitly abstaining on incomplete optional coverage", () => {
    const model = artifact({
      coverageRequirements: [
        { key: TARGETS, weight: 1 },
        { key: TARGET_SHARE, weight: 1 },
        { key: OPTIONAL_READINESS, weight: 2 },
      ],
    });

    const result = runCCFPlayerOutcomeEngineV0({
      featureSet: featureSet(),
      artifact: model,
      scoringFormat: "CUSTOM",
      scoringFingerprint: SCORING_FINGERPRINT,
    });

    expect(result.coverage).toBe(0.5);
    expect(result.abstain).toBe(true);
    expect(result.abstainReasons).toEqual(["native_coverage_below_0.75"]);
    expect(result.medianFpts).toBe(9);
  });

  it("fails closed when a required model feature is unavailable rather than imputing it", () => {
    const incomplete = featureSet({
      features: {
        [TARGETS]: featureSet().features[TARGETS],
        [TARGET_SHARE]: {
          key: TARGET_SHARE,
          status: "missing",
          reason: "no_prior_recorded_opportunity_games_in_window",
          producerFamily: "ccf_native_derived",
          evidenceKind: "derived",
          knownAt: "2026-09-16T12:00:00Z",
          sourceRefs: [],
        },
      },
    });

    expect(() =>
      runCCFPlayerOutcomeEngineV0({
        featureSet: incomplete,
        artifact: artifact(),
        scoringFormat: "CUSTOM",
        scoringFingerprint: SCORING_FINGERPRINT,
      }),
    ).toThrow(/required model feature opportunity.mean_target_share is missing/);
  });


  it("rejects required model features that have no traceable source evidence", () => {
    const untraceable = featureSet();
    untraceable.features[TARGETS] = {
      ...untraceable.features[TARGETS],
      sourceRefs: [],
    } as CCFWeeklyNativeFeatureSet["features"][string];

    expect(() =>
      runCCFPlayerOutcomeEngineV0({
        featureSet: untraceable,
        artifact: artifact(),
        scoringFormat: "CUSTOM",
        scoringFingerprint: SCORING_FINGERPRINT,
      }),
    ).toThrow(/must carry unique non-empty sourceRefs/);
  });

  it("rejects scoring mismatch and model artifacts frozen after the inference cutoff", () => {
    expect(() =>
      runCCFPlayerOutcomeEngineV0({
        featureSet: featureSet(),
        artifact: artifact(),
        scoringFormat: "CUSTOM",
        scoringFingerprint: "ccf://scoring/other",
      }),
    ).toThrow(/scoring fingerprint does not match/);

    expect(() =>
      runCCFPlayerOutcomeEngineV0({
        featureSet: featureSet(),
        artifact: artifact({
          trainedAt: "2026-09-17T12:00:00Z",
          frozenAt: "2026-09-18T12:00:00Z",
        }),
        scoringFormat: "CUSTOM",
        scoringFingerprint: SCORING_FINGERPRINT,
      }),
    ).toThrow(/frozen after the feature-set asOf cutoff/);
  });


  it("enforces candidate-artifact chronology before predictive validation can exist", () => {
    expect(() =>
      validateCCFPlayerOutcomeModelArtifactV0(
        artifact({
          trainingDatasetFrozenAt: "2026-09-10T06:00:00Z",
          validationProtocolFrozenAt: "2026-09-10T00:00:00Z",
        }),
      ),
    ).toThrow(/training dataset must be frozen no later than the validation protocol/);

    expect(() =>
      validateCCFPlayerOutcomeModelArtifactV0(
        artifact({
          validationProtocolFrozenAt: "2026-09-10T13:00:00Z",
          trainedAt: "2026-09-10T12:00:00Z",
        }),
      ),
    ).toThrow(/validation protocol must be frozen before model training/);

    expect(() =>
      validateCCFPlayerOutcomeModelArtifactV0(
        artifact({
          trainedAt: "2026-09-13T13:00:00Z",
          frozenAt: "2026-09-13T12:00:00Z",
        }),
      ),
    ).toThrow(/trainedAt must be no later than frozenAt/);
  });

  it("rejects malformed coefficient maps before inference", () => {
    const malformed = artifact();
    malformed.heads.meanFpts = {
      intercept: 0,
      coefficients: { [TARGETS]: 1 },
    };

    expect(() => validateCCFPlayerOutcomeModelArtifactV0(malformed)).toThrow(
      /coefficients must match featureKeys exactly/,
    );
  });

  it("does not silently sort crossed quantiles from a bad trained artifact", () => {
    const crossed = artifact();
    crossed.heads.p10Fpts = head(5, 1, 4);

    expect(() =>
      runCCFPlayerOutcomeEngineV0({
        featureSet: featureSet(),
        artifact: crossed,
        scoringFormat: "CUSTOM",
        scoringFingerprint: SCORING_FINGERPRINT,
      }),
    ).toThrow(/quantiles must satisfy/);
  });

  it("fingerprints the same artifact independent of map and feature-key insertion order", () => {
    const left = artifact();
    const right = artifact({
      featureKeys: [TARGET_SHARE, TARGETS],
      criticalFeatureKeys: [TARGET_SHARE, TARGETS],
      featureFamilies: {
        [TARGET_SHARE]: "role_opportunity",
        [TARGETS]: "role_opportunity",
      },
      heads: Object.fromEntries(
        Object.entries(artifact().heads).map(([label, value]) => [
          label,
          {
            ...value,
            coefficients: {
              [TARGET_SHARE]: value.coefficients[TARGET_SHARE],
              [TARGETS]: value.coefficients[TARGETS],
            },
          },
        ]),
      ) as CCFPlayerOutcomeModelArtifactV0["heads"],
    });

    expect(fingerprintCCFPlayerOutcomeModelArtifactV0(left)).toBe(
      fingerprintCCFPlayerOutcomeModelArtifactV0(right),
    );
  });
});
