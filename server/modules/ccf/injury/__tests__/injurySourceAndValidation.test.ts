import {
  assertCCFRecoveryMinimumSourceCoverage,
  fingerprintCCFRecoverySourceBindingPlan,
  validateCCFRecoverySourceBinding,
  type CCFRecoverySourceBinding,
  type CCFRecoverySourceBindingPlan,
} from "../injurySourceBinding";
import {
  fingerprintCCFRecoveryValidationProtocol,
  validateCCFRecoveryValidationProtocol,
  type CCFRecoveryValidationProtocol,
} from "../injuryRecoveryValidationProtocol";

function binding(
  overrides: Partial<CCFRecoverySourceBinding> = {},
): CCFRecoverySourceBinding {
  return {
    bindingVersion: "ccf-recovery-source-binding-v1",
    bindingId: "official-designation",
    sourceClass: "official_injury_designation",
    provider: "fixture-provider",
    datasetOrProduct: "fixture-dataset",
    dimensions: ["participation"],
    authority: "raw_fact",
    status: "production_eligible",
    temporalMode: "archived_point_in_time",
    archiveStrategy: "immutable_snapshot",
    licenseOrTermsRef: "terms://fixture",
    permissionStatus: "permitted_for_intended_use",
    parserVersion: "fixture-parser-v1",
    sourceLocatorTemplate: "source://fixture/{id}",
    pointInTimeSemanticsDocumented: true,
    rawTraceSupported: true,
    reliabilityReviewRef: "review://fixture",
    reliabilityStatus: "passed",
    notes: [],
    ...overrides,
  };
}

function bindingPlan(): CCFRecoverySourceBindingPlan {
  return {
    contractVersion: "ccf-recovery-source-binding-plan-v1",
    asOf: "2026-09-14T20:00:00Z",
    bindings: [
      binding(),
      binding({
        bindingId: "official-practice",
        sourceClass: "official_practice_participation",
      }),
      binding({
        bindingId: "official-activation",
        sourceClass: "official_game_activation",
      }),
      binding({
        bindingId: "observed-workload",
        sourceClass: "observed_game_usage",
        authority: "observed_football_evidence",
        dimensions: ["workload"],
      }),
    ],
  };
}

function protocol(
  overrides: Partial<CCFRecoveryValidationProtocol> = {},
): CCFRecoveryValidationProtocol {
  return {
    contractVersion: "ccf-recovery-validation-protocol-v1",
    protocolId: "recovery-validation-fixture-v1",
    frozenAt: "2026-09-14T20:00:00Z",
    datasetFingerprint: "dataset-sha256-fixture",
    sourceBindingPlanFingerprint: fingerprintCCFRecoverySourceBindingPlan(bindingPlan()),
    scoringProfileFingerprint: "scoring-sha256-fixture",
    split: {
      train: {
        start: { season: 2022, week: 1 },
        end: { season: 2024, week: 18 },
      },
      validation: {
        start: { season: 2025, week: 1 },
        end: { season: 2025, week: 18 },
      },
      test: {
        start: { season: 2026, week: 1 },
        end: { season: 2026, week: 18 },
      },
    },
    questions: [
      "active_vs_workload_readiness",
      "practice_progression_to_workload",
      "role_evidence_vs_time_since_injury",
    ],
    arms: [
      "native_baseline_no_recovery_features",
      "eligible_raw_recovery_evidence",
      "learned_recovery_features",
      "legacy_or_external_challenger",
    ],
    primaryMetrics: ["fantasy_points_mae", "lineup_regret"],
    secondaryMetrics: ["snap_share_mae", "abstention_selectivity"],
    subgroupDimensions: ["position", "return_stage", "week_since_return"],
    samplePolicy: {
      minimumOverallPairedRows: 10,
      minimumSubgroupRows: 5,
      underpoweredSubgroupTreatment: "exclude_from_promotion",
    },
    promotionCriteria: [
      {
        criterionId: "mae-vs-native-baseline",
        metric: "fantasy_points_mae",
        comparatorArm: "native_baseline_no_recovery_features",
        candidateArm: "learned_recovery_features",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0.01,
        minimumRelativeImprovement: null,
        appliesTo: "both",
      },
      {
        criterionId: "regret-vs-raw-evidence",
        metric: "lineup_regret",
        comparatorArm: "eligible_raw_recovery_evidence",
        candidateArm: "learned_recovery_features",
        direction: "lower_is_better",
        minimumAbsoluteImprovement: 0,
        minimumRelativeImprovement: null,
        appliesTo: "supported_subgroups",
      },
    ],
    outcomeAccessedBeforeFreeze: false,
    tiberOffRequired: true,
    failedCandidateRetentionRequired: true,
    notes: [],
    ...overrides,
  };
}

describe("CCF recovery source binding", () => {
  it("requires full point-in-time provenance before a source can be production eligible", () => {
    expect(() =>
      validateCCFRecoverySourceBinding(
        binding({ temporalMode: "current_snapshot_only" }),
      ),
    ).toThrow(/archived_point_in_time/);

    expect(() =>
      validateCCFRecoverySourceBinding(binding({ rawTraceSupported: false })),
    ).toThrow(/raw-trace support/);
  });

  it("requires explicit intended-use permission rather than a terms URL alone", () => {
    expect(() =>
      validateCCFRecoverySourceBinding(
        binding({ permissionStatus: "evaluation_only" }),
      ),
    ).toThrow(/permission cleared for the intended use/);
  });

  it("requires a passed reliability review rather than a review reference alone", () => {
    expect(() =>
      validateCCFRecoverySourceBinding(
        binding({ reliabilityStatus: "incomplete" }),
      ),
    ).toThrow(/passed reliability review/);
  });

  it("prevents challenger inference from becoming production evidence", () => {
    expect(() =>
      validateCCFRecoverySourceBinding(binding({ authority: "challenger_inference" })),
    ).toThrow(/challenger inference cannot be production-eligible/);
  });

  it("requires official status, practice, activation, and observed workload coverage", () => {
    expect(assertCCFRecoveryMinimumSourceCoverage(bindingPlan())).toEqual(bindingPlan());

    const missingWorkload: CCFRecoverySourceBindingPlan = {
      ...bindingPlan(),
      bindings: bindingPlan().bindings.filter((row) => row.bindingId !== "observed-workload"),
    };
    expect(() => assertCCFRecoveryMinimumSourceCoverage(missingWorkload)).toThrow(
      /observed workload evidence/,
    );
  });

  it("fingerprints equivalent binding sets deterministically regardless of binding order", () => {
    const original = bindingPlan();
    const reversed = { ...original, bindings: [...original.bindings].reverse() };
    expect(fingerprintCCFRecoverySourceBindingPlan(original)).toBe(
      fingerprintCCFRecoverySourceBindingPlan(reversed),
    );
  });
});

describe("CCF recovery historical validation protocol", () => {
  it("requires a held-out chronological test window", () => {
    expect(() =>
      validateCCFRecoveryValidationProtocol(
        protocol({
          split: {
            train: {
              start: { season: 2022, week: 1 },
              end: { season: 2024, week: 18 },
            },
          },
        }),
      ),
    ).toThrow(/held-out test window/);
  });

  it("requires baseline, raw-evidence, and learned-feature arms", () => {
    expect(() =>
      validateCCFRecoveryValidationProtocol(
        protocol({
          arms: ["native_baseline_no_recovery_features", "eligible_raw_recovery_evidence"],
        }),
      ),
    ).toThrow(/learned-recovery-features arm/);
  });

  it("requires promotion thresholds to be frozen before evaluation", () => {
    const p = protocol();
    p.promotionCriteria = [
      {
        ...p.promotionCriteria[0],
        minimumAbsoluteImprovement: null,
        minimumRelativeImprovement: null,
      },
    ];
    expect(() => validateCCFRecoveryValidationProtocol(p)).toThrow(
      /predeclare at least one promotion threshold/,
    );
  });

  it("requires TIBER-off replay and retention of failed candidates", () => {
    expect(() =>
      validateCCFRecoveryValidationProtocol(protocol({ tiberOffRequired: false })),
    ).toThrow(/TIBER-off replay/);
    expect(() =>
      validateCCFRecoveryValidationProtocol(
        protocol({ failedCandidateRetentionRequired: false }),
      ),
    ).toThrow(/retain failed candidates/);
  });

  it("produces a deterministic frozen protocol fingerprint", () => {
    const first = protocol();
    const reordered = {
      ...first,
      questions: [...first.questions].reverse(),
      arms: [...first.arms].reverse(),
      primaryMetrics: [...first.primaryMetrics].reverse(),
      secondaryMetrics: [...first.secondaryMetrics].reverse(),
      subgroupDimensions: [...first.subgroupDimensions].reverse(),
      promotionCriteria: [...first.promotionCriteria].reverse(),
    };
    expect(fingerprintCCFRecoveryValidationProtocol(first)).toBe(
      fingerprintCCFRecoveryValidationProtocol(reordered),
    );
  });
});
