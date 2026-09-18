import type { CCFWeeklyNativeFeatureSet } from "../../features/weeklyFeatureEvidence";
import {
  CCF_BASE_HALF_PPR_RULES,
  CCF_BASE_PPR_RULES,
  fingerprintCCFLeagueScoringRules,
} from "../../scoring/scoringRules";
import {
  buildCCFRoleBaselineCandidate,
  type CCFRoleBaselineParameters,
} from "../roleBaselineCandidate";

const TARGETS = "opportunity.prior_up_to_3.targets_mean";
const CARRIES = "opportunity.prior_up_to_3.carries_mean";
const TARGET_SHARE = "opportunity.prior_up_to_3.target_share_mean";

function featureSet(): CCFWeeklyNativeFeatureSet {
  return {
    playerId: "ccf-player-1",
    position: "WR",
    season: 2026,
    week: 3,
    asOf: "2026-09-20T12:00:00Z",
    features: {
      [TARGETS]: {
        key: TARGETS,
        status: "available",
        value: 7,
        unit: "opportunities",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-19T12:00:00Z",
        sourceRefs: ["ccf://rolling-opportunity/targets"],
      },
      [CARRIES]: {
        key: CARRIES,
        status: "available",
        value: 2,
        unit: "opportunities",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-19T12:00:00Z",
        sourceRefs: ["ccf://rolling-opportunity/carries"],
      },
      [TARGET_SHARE]: {
        key: TARGET_SHARE,
        status: "available",
        value: 0.25,
        unit: "share",
        producerFamily: "ccf_native_derived",
        evidenceKind: "derived",
        knownAt: "2026-09-19T12:00:00Z",
        sourceRefs: ["ccf://rolling-opportunity/target-share"],
      },
    },
  };
}

function parameters(
  overrides: Partial<CCFRoleBaselineParameters> = {},
): CCFRoleBaselineParameters {
  const featureKeys = [TARGETS, CARRIES, TARGET_SHARE];
  return {
    contractVersion: "ccf-role-baseline-parameters-v1",
    modelVersion: "ccf-player-outcome-v0-role-baseline-candidate",
    position: "WR",
    frozenAt: "2026-09-19T18:00:00Z",
    parameterArtifactRef: "ccf://model-parameters/role-baseline/test-v1",
    trainingDatasetFingerprint: "fixture-training-dataset-sha256",
    featureContractRef: "ccf://feature-contract/rolling-opportunity-v1",
    scoringProfileFingerprint: fingerprintCCFLeagueScoringRules(CCF_BASE_PPR_RULES),
    featureKeys,
    meanIntercept: 2,
    meanWeights: {
      [TARGETS]: 1,
      [CARRIES]: 0.5,
      [TARGET_SHARE]: 4,
    },
    volatilityIntercept: 3,
    volatilityWeights: {
      [TARGETS]: 0,
      [CARRIES]: 0,
      [TARGET_SHARE]: 0,
    },
    minimumVolatility: 2,
    thresholds: {
      zeroOrNearZeroFpts: 2,
      bustFpts: 7,
      boomFpts: 18,
    },
    parameterConfidence: 0.7,
    certificationState: "uncertified_candidate",
    ...overrides,
  };
}

describe("CCF role baseline outcome candidate", () => {
  it("builds a deterministic native candidate from frozen role features and parameters", () => {
    const input = {
      featureSet: featureSet(),
      scoringFormat: "PPR" as const,
      scoringRules: CCF_BASE_PPR_RULES,
      parameters: parameters(),
    };

    const first = buildCCFRoleBaselineCandidate(input);
    const second = buildCCFRoleBaselineCandidate(input);

    expect(first).toEqual(second);
    expect(first.candidateOnly).toBe(true);
    expect(first.outcome).toMatchObject({
      playerId: "ccf-player-1",
      position: "WR",
      season: 2026,
      week: 3,
      scoringFormat: "PPR",
      meanFpts: 11,
      medianFpts: 11,
      volatility: 3,
      confidence: 0.7,
      coverage: 1,
      abstain: false,
      modelVersion: "ccf-player-outcome-v0-role-baseline-candidate",
      mode: "CCF_NATIVE",
    });
    expect(first.outcome.p10Fpts).toBeLessThan(first.outcome.p25Fpts);
    expect(first.outcome.p25Fpts).toBeLessThan(first.outcome.medianFpts);
    expect(first.outcome.p75Fpts).toBeGreaterThan(first.outcome.medianFpts);
    expect(first.outcome.p90Fpts).toBeGreaterThan(first.outcome.p75Fpts);
    expect(first.outcome.zeroOrNearZeroProbability).toBeGreaterThanOrEqual(0);
    expect(first.outcome.zeroOrNearZeroProbability).toBeLessThanOrEqual(1);
    expect(first.outcome.bustProbability).toBeGreaterThanOrEqual(0);
    expect(first.outcome.bustProbability).toBeLessThanOrEqual(1);
    expect(first.outcome.boomProbability).toBeGreaterThanOrEqual(0);
    expect(first.outcome.boomProbability).toBeLessThanOrEqual(1);
    expect(first.outcome.criticalFeatureProvenance).toHaveLength(3);
    expect(first.outcome.mechanismContributions[0]).toMatchObject({
      family: "role_opportunity_baseline",
      direction: "up",
      confidence: 0.7,
      evidenceKind: "derived",
    });
    expect(first.outcome.mechanismContributions[0].evidenceRefs).toEqual(
      expect.arrayContaining([
        "ccf://model-parameters/role-baseline/test-v1",
        "ccf://feature-contract/rolling-opportunity-v1",
        "ccf://rolling-opportunity/targets",
      ]),
    );
  });

  it("rejects a scoring profile that does not match the frozen parameter artifact", () => {
    expect(() =>
      buildCCFRoleBaselineCandidate({
        featureSet: featureSet(),
        scoringFormat: "HALF_PPR",
        scoringRules: CCF_BASE_HALF_PPR_RULES,
        parameters: parameters(),
      }),
    ).toThrow(/scoring profile does not match/);
  });

  it("rejects model parameters frozen after the requested asOf", () => {
    expect(() =>
      buildCCFRoleBaselineCandidate({
        featureSet: featureSet(),
        scoringFormat: "PPR",
        scoringRules: CCF_BASE_PPR_RULES,
        parameters: parameters({ frozenAt: "2026-09-21T00:00:00Z" }),
      }),
    ).toThrow(/frozen after the requested asOf/);
  });

  it("fails closed when any required native feature is unavailable", () => {
    const features = featureSet();
    features.features[TARGET_SHARE] = {
      key: TARGET_SHARE,
      status: "missing",
      reason: "no_nonzero_team_denominator_in_window",
      producerFamily: "ccf_native_derived",
      evidenceKind: "derived",
      knownAt: "2026-09-19T12:00:00Z",
      sourceRefs: ["ccf://rolling-opportunity/target-share"],
    };

    expect(() =>
      buildCCFRoleBaselineCandidate({
        featureSet: features,
        scoringFormat: "PPR",
        scoringRules: CCF_BASE_PPR_RULES,
        parameters: parameters(),
      }),
    ).toThrow(/complete feature coverage|required native feature/);
  });

  it("rejects parameter weights that do not exactly bind the declared feature keys", () => {
    const bad = parameters();
    delete bad.volatilityWeights[TARGET_SHARE];

    expect(() =>
      buildCCFRoleBaselineCandidate({
        featureSet: featureSet(),
        scoringFormat: "PPR",
        scoringRules: CCF_BASE_PPR_RULES,
        parameters: bad,
      }),
    ).toThrow(/volatilityWeights keys must exactly match featureKeys/);
  });

  it("rejects position-mismatched parameter artifacts", () => {
    expect(() =>
      buildCCFRoleBaselineCandidate({
        featureSet: featureSet(),
        scoringFormat: "PPR",
        scoringRules: CCF_BASE_PPR_RULES,
        parameters: parameters({ position: "RB" }),
      }),
    ).toThrow(/parameter position RB does not match/);
  });
});
