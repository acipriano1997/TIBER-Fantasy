import {
  buildCCFRollingValidationLineupRegretEvidence,
  fingerprintCCFHistoricalLineupDecisionWitness,
  type CCFHistoricalLineupDecisionWitnessV1,
} from "../rollingValidationLineupRegretEvidence";
import type { CCFPredictiveValidationProtocol } from "../predictiveValidationProtocol";

function protocol(): CCFPredictiveValidationProtocol {
  return {
    contractVersion: "ccf-predictive-validation-protocol-v1",
    protocolId: "lineup-regret-v1",
    frozenAt: "2026-09-18T16:00:00Z",
    modelVersion: "ccf-player-outcome-v0",
    datasetFingerprint: "dataset-v1",
    sourcePlanFingerprint: "source-plan-v1",
    scoringProfileFingerprint: "scoring-v1",
    featureSetFingerprint: "features-v1",
    decisionPolicyFingerprint: "decision-v1",
    supportedPopulation: "QB/RB/WR/TE weekly fantasy decisions",
    split: {
      train: {
        start: { season: 2024, week: 1 },
        end: { season: 2024, week: 2 },
      },
      validation: {
        start: { season: 2024, week: 3 },
        end: { season: 2024, week: 4 },
      },
      test: {
        start: { season: 2024, week: 5 },
        end: { season: 2024, week: 5 },
      },
    },
    targets: ["fantasy_points", "lineup_utility"],
    arms: ["native_candidate", "historical_mean", "recent_mean", "usage_rate"],
    primaryMetrics: ["mae", "lineup_regret"],
    secondaryMetrics: ["rmse"],
    subgroupDimensions: ["position"],
    featureFamilies: ["role"],
    ablationModes: ["leave_one_family_out"],
    antiLeakageControls: [
      "post_cutoff_evidence_rejected",
      "future_correction_rejected",
      "current_depth_chart_backfill_rejected",
      "closing_market_leakage_rejected",
      "outcome_field_mutation_invariant",
      "identity_join_leakage_rejected",
      "missing_outcome_not_negative",
    ],
    negativeControls: ["label_permutation", "future_feature_canary"],
    samplePolicy: {
      minimumOverallPairedRows: 2,
      minimumSubgroupRows: 2,
      minimumIndependentTimeBlocks: 2,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    uncertaintyPolicy: {
      method: "paired_block_bootstrap",
      blockUnit: "season_week",
      iterations: 1000,
      confidenceLevel: 0.95,
      deterministicSeed: "lineup-regret",
      multiplicityPolicy: "primary_metrics_only",
    },
    promotionCriteria: [
      {
        criterionId: "fantasy-mae-vs-usage",
        target: "fantasy_points",
        metric: "mae",
        comparatorArm: "usage_rate",
        candidateArm: "native_candidate",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0,
        minimumRelativeImprovement: null,
        confidenceLowerBoundMustBeatZero: false,
        appliesTo: "overall",
      },
    ],
    outcomeAccessedBeforeFreeze: false,
    oneTouchFinalHoldoutRequired: true,
    freezeNativeBeforeChallengerRequired: true,
    tiberOffRequired: true,
    failedCandidateRetentionRequired: true,
    appendOnlyLedgerRequired: true,
    externalEvidenceCannotMutateFrozenPacket: true,
    notes: [],
  };
}

function witness(
  decisionId: string,
  chosen: number,
  best: number,
  overrides: Partial<CCFHistoricalLineupDecisionWitnessV1> = {},
): CCFHistoricalLineupDecisionWitnessV1 {
  return {
    contractVersion: "ccf-historical-lineup-decision-witness-v1",
    decisionId,
    leagueRef: "league-1",
    teamRef: "team-1",
    season: 2024,
    week: decisionId === "decision-1" ? 3 : 4,
    decisionAsOf:
      decisionId === "decision-1"
        ? "2024-09-22T16:00:00Z"
        : "2024-09-29T16:00:00Z",
    rosterSnapshotFingerprint: `roster-${decisionId}`,
    feasibleSetFingerprint: `feasible-${decisionId}`,
    feasibleSetBuilderVersion: "ccf-lineup-feasible-set-v1",
    feasibleSetComplete: true,
    feasibleLineupCount: 12,
    chosenLineupFingerprint: `chosen-${decisionId}`,
    chosenRealizedUtility: chosen,
    bestFeasibleLineupFingerprint:
      best === chosen ? `chosen-${decisionId}` : `best-${decisionId}`,
    bestFeasibleRealizedUtility: best,
    outcomeKnownAt:
      decisionId === "decision-1"
        ? "2024-09-23T03:00:00Z"
        : "2024-09-30T03:00:00Z",
    frozenAt: "2026-09-18T16:30:00Z",
    outcomeAccess: "available_for_validation",
    evidenceRefs: [
      `ccf://roster/${decisionId}`,
      `ccf://feasible-set/${decisionId}`,
      `ccf://realized-outcomes/${decisionId}`,
    ],
    ...overrides,
  };
}

describe("CCF rolling validation lineup regret evidence", () => {
  it("derives regret only from frozen complete feasible-set witnesses", () => {
    const result = buildCCFRollingValidationLineupRegretEvidence({
      protocol: protocol(),
      replayBindingId: "ccf://rolling-replay-binding/sha256/lineup-regret",
      witnesses: [
        witness("decision-1", 20, 20),
        witness("decision-2", 12, 22),
      ],
    });

    expect(result).toMatchObject({
      decisionCount: 2,
      catastrophicRegretThreshold: 10,
      metrics: {
        totalDecisionCount: 2,
        evaluatedDecisionCount: 2,
        meanRegret: 5,
        medianRegret: 0,
        maxRegret: 10,
        zeroRegretRate: 0.5,
        catastrophicRegretRate: 0.5,
      },
      finalHoldoutAccessed: false,
      certificationOnly: true,
      productionInferenceAuthorized: false,
    });
    expect(result.decisionEvidenceRefs).toHaveLength(2);
    expect(result.evidenceRef).toMatch(
      /^ccf:\/\/rolling-validation-lineup-regret-evidence\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("requires lineup utility and lineup regret to be predeclared by the frozen protocol", () => {
    const frozen = protocol();
    frozen.targets = ["fantasy_points"];
    frozen.primaryMetrics = ["mae"];

    expect(() =>
      buildCCFRollingValidationLineupRegretEvidence({
        protocol: frozen,
        replayBindingId:
          "ccf://rolling-replay-binding/sha256/lineup-regret",
        witnesses: [witness("decision-1", 20, 20)],
      }),
    ).toThrow(/must predeclare lineup_utility and lineup_regret/);
  });

  it("rejects a witness whose realized outcome was known before the decision cutoff", () => {
    expect(() =>
      fingerprintCCFHistoricalLineupDecisionWitness(
        witness("decision-1", 20, 20, {
          outcomeKnownAt: "2024-09-22T15:59:59Z",
        }),
      ),
    ).toThrow(/must become known after the historical decision cutoff/);
  });

  it("rejects a witness that claims an incomplete feasible set", () => {
    const bad = witness("decision-1", 20, 20) as any;
    bad.feasibleSetComplete = false;

    expect(() =>
      buildCCFRollingValidationLineupRegretEvidence({
        protocol: protocol(),
        replayBindingId:
          "ccf://rolling-replay-binding/sha256/lineup-regret",
        witnesses: [bad],
      }),
    ).toThrow(/complete feasible-set witness/);
  });

  it("rejects final-holdout decision outcomes", () => {
    const bad = witness("decision-1", 20, 20) as any;
    bad.outcomeAccess = "sealed_final_holdout";

    expect(() =>
      buildCCFRollingValidationLineupRegretEvidence({
        protocol: protocol(),
        replayBindingId:
          "ccf://rolling-replay-binding/sha256/lineup-regret",
        witnesses: [bad],
      }),
    ).toThrow(/cannot consume sealed final-holdout outcomes/);
  });

  it("rejects impossible best-feasible claims", () => {
    expect(() =>
      buildCCFRollingValidationLineupRegretEvidence({
        protocol: protocol(),
        replayBindingId:
          "ccf://rolling-replay-binding/sha256/lineup-regret",
        witnesses: [witness("decision-1", 20, 19)],
      }),
    ).toThrow(/best feasible realized utility cannot be below/);
  });

  it("rejects duplicate historical decisions", () => {
    const row = witness("decision-1", 20, 20);
    expect(() =>
      buildCCFRollingValidationLineupRegretEvidence({
        protocol: protocol(),
        replayBindingId:
          "ccf://rolling-replay-binding/sha256/lineup-regret",
        witnesses: [row, row],
      }),
    ).toThrow(/duplicate historical lineup decision/);
  });

  it("fingerprints identical witnesses and evidence deterministically", () => {
    const row = witness("decision-1", 20, 20);
    expect(fingerprintCCFHistoricalLineupDecisionWitness(row)).toBe(
      fingerprintCCFHistoricalLineupDecisionWitness(row),
    );

    const input = {
      protocol: protocol(),
      replayBindingId:
        "ccf://rolling-replay-binding/sha256/lineup-regret",
      witnesses: [row],
    };
    expect(
      buildCCFRollingValidationLineupRegretEvidence(input).evidenceRef,
    ).toBe(
      buildCCFRollingValidationLineupRegretEvidence(input).evidenceRef,
    );
  });
});
