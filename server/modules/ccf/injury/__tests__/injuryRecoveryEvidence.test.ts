import {
  compareObservedRecoveryWorkload,
  defaultCCFRecoveryCredibilityBand,
  validateCCFInjuryRecoveryEvidenceBundle,
  validateCCFRecoveryAssessment,
  type CCFInjuryRecoveryEvidenceBundle,
  type CCFParticipationRecoveryEvidence,
  type CCFPerformanceRecoveryEvidence,
  type CCFRecoveryAssessment,
  type CCFWorkloadRecoveryEvidence,
} from "../injuryRecoveryEvidence";

function participationEvidence(
  overrides: Partial<CCFParticipationRecoveryEvidence> = {},
): CCFParticipationRecoveryEvidence {
  return {
    evidenceId: "participation-1",
    injuryEpisodeId: "injury-1",
    dimension: "participation",
    factStatus: "confirmed",
    sourceClass: "official_game_activation",
    sourceId: "nfl-official",
    sourceLocator: "source://nfl/game-status",
    occurredAt: "2026-09-13T16:00:00Z",
    publishedAt: "2026-09-13T16:00:00Z",
    retrievedAt: "2026-09-13T16:00:05Z",
    knownAt: "2026-09-13T16:00:05Z",
    recheckAt: null,
    modelTreatment: "partial_update",
    statement: "Player is active.",
    rawTraceRef: "sha256:participation",
    notes: [],
    participationState: "active",
    metric: null,
    ...overrides,
  };
}

function workloadEvidence(
  overrides: Partial<CCFWorkloadRecoveryEvidence> = {},
): CCFWorkloadRecoveryEvidence {
  return {
    evidenceId: "workload-1",
    injuryEpisodeId: "injury-1",
    dimension: "workload",
    factStatus: "observed",
    sourceClass: "observed_game_usage",
    sourceId: "ccf-direct-usage",
    sourceLocator: "source://gamebook/player",
    occurredAt: "2026-09-13T20:00:00Z",
    publishedAt: null,
    retrievedAt: "2026-09-13T20:05:00Z",
    knownAt: "2026-09-13T20:05:00Z",
    recheckAt: null,
    modelTreatment: "immediate_update",
    statement: "Observed snap share after return.",
    rawTraceRef: "sha256:workload",
    notes: [],
    metric: {
      key: "snap_share",
      value: 0.82,
      unit: "share",
      window: "game",
    },
    ...overrides,
  };
}

function performanceEvidence(
  overrides: Partial<CCFPerformanceRecoveryEvidence> = {},
): CCFPerformanceRecoveryEvidence {
  return {
    evidenceId: "performance-1",
    injuryEpisodeId: "injury-1",
    dimension: "performance",
    factStatus: "observed",
    sourceClass: "observed_performance",
    sourceId: "ccf-football-observation",
    sourceLocator: "source://tracking/player",
    occurredAt: "2026-09-13T20:00:00Z",
    publishedAt: null,
    retrievedAt: "2026-09-13T20:06:00Z",
    knownAt: "2026-09-13T20:06:00Z",
    recheckAt: null,
    modelTreatment: "partial_update",
    statement: "Observed explosive-play rate after return.",
    rawTraceRef: "sha256:performance",
    notes: [],
    metric: {
      key: "explosive_play_rate",
      value: 0.14,
      unit: "share",
      window: "game",
    },
    ...overrides,
  };
}

function bundle(
  evidence = [participationEvidence(), workloadEvidence(), performanceEvidence()],
): CCFInjuryRecoveryEvidenceBundle {
  return {
    contractVersion: "ccf-injury-recovery-evidence-v1",
    generatedAt: "2026-09-13T20:10:00Z",
    asOf: "2026-09-13T20:10:00Z",
    availability: "available",
    unavailableReason: null,
    player: {
      playerId: "player-1",
      position: "WR",
      team: "AAA",
    },
    evidence,
    warnings: [],
  };
}

function assessment(
  overrides: Partial<CCFRecoveryAssessment> = {},
): CCFRecoveryAssessment {
  return {
    assessmentVersion: "ccf-recovery-assessment-fixture-v1",
    playerId: "player-1",
    asOf: "2026-09-13T20:10:00Z",
    producerFamily: "ccf_native_derived",
    returnStage: "return_to_previous_performance",
    setbackUncertainty: "limited_evidence",
    confidence: 0.6,
    evidenceRefs: ["workload-1", "performance-1"],
    uncertaintyReasons: ["single post-return game"],
    notes: [],
    ...overrides,
  };
}

describe("CCF injury and recovery evidence", () => {
  it("keeps participation, workload, and performance as distinct evidence dimensions", () => {
    const validated = validateCCFInjuryRecoveryEvidenceBundle(bundle());
    expect(validated.evidence.map((row) => row.dimension)).toEqual([
      "participation",
      "workload",
      "performance",
    ]);
  });

  it("rejects evidence that became known after the frozen decision as-of", () => {
    const future = workloadEvidence({ knownAt: "2026-09-13T20:11:00Z" });
    expect(() => validateCCFInjuryRecoveryEvidenceBundle(bundle([future]))).toThrow(
      /later than bundle asOf/,
    );
  });

  it("prevents speculation from directly updating the native model", () => {
    const speculative = participationEvidence({
      factStatus: "speculative",
      sourceClass: "analyst_medical_inference",
      modelTreatment: "partial_update",
    });
    expect(() => validateCCFInjuryRecoveryEvidenceBundle(bundle([speculative]))).toThrow(
      /speculative evidence cannot directly update/,
    );
  });

  it("forces social-media speculation to no-model-weight", () => {
    const rumor = participationEvidence({
      factStatus: "speculative",
      sourceClass: "social_media_speculation",
      modelTreatment: "watch_only",
    });
    expect(() => validateCCFInjuryRecoveryEvidenceBundle(bundle([rumor]))).toThrow(
      /must carry no model weight/,
    );
  });

  it("does not allow active status alone to prove return to previous performance", () => {
    const activeOnly = bundle([participationEvidence()]);
    expect(() =>
      validateCCFRecoveryAssessment(
        assessment({ evidenceRefs: ["participation-1"] }),
        activeOnly,
      ),
    ).toThrow(/requires both workload and performance evidence/);
  });

  it("allows a native assessment to express previous-performance return only with workload and performance evidence", () => {
    const evidenceBundle = bundle();
    expect(validateCCFRecoveryAssessment(assessment(), evidenceBundle)).toEqual(assessment());
  });

  it("blocks an external or challenger producer from becoming recovery authority", () => {
    expect(() =>
      validateCCFRecoveryAssessment(
        assessment({ producerFamily: "challenger_only" }),
        bundle(),
      ),
    ).toThrow(/must be CCF-native/);
  });

  it("compares workload changes without asserting medical causality", () => {
    const comparison = compareObservedRecoveryWorkload(
      { key: "snap_share", value: 0.35, unit: "share", window: "week-1" },
      { key: "snap_share", value: 0.82, unit: "share", window: "week-2" },
    );
    expect(comparison.absoluteChange).toBeCloseTo(0.47);
    expect(comparison.interpretation).toBe("increase");
    expect(comparison.medicalCausalityClaimed).toBe(false);
  });

  it("keeps credibility ordinal and source-role aware without inventing weights", () => {
    expect(defaultCCFRecoveryCredibilityBand("observed_game_usage")).toBe(
      "A_OBJECTIVE_OR_OFFICIAL",
    );
    expect(defaultCCFRecoveryCredibilityBand("credible_independent_reporting")).toBe(
      "D_CREDIBLE_REPORTING",
    );
    expect(defaultCCFRecoveryCredibilityBand("social_media_speculation")).toBe(
      "F_UNVERIFIED",
    );
  });

  it("requires explicit unavailable semantics instead of silently assuming health", () => {
    const unavailable: CCFInjuryRecoveryEvidenceBundle = {
      ...bundle([]),
      availability: "unavailable",
      unavailableReason: "No eligible point-in-time recovery evidence was available.",
    };
    expect(validateCCFInjuryRecoveryEvidenceBundle(unavailable)).toEqual(unavailable);

    expect(() =>
      validateCCFInjuryRecoveryEvidenceBundle({
        ...unavailable,
        unavailableReason: null,
      }),
    ).toThrow(/requires unavailableReason/);
  });
});
