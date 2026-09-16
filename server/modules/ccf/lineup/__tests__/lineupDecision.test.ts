import {
  CCF_LINEUP_DECISION_VERSION,
  evaluateCCFCompleteLegalLineup,
  type CCFLineupDecisionInput,
  type CCFLineupOutcomeEnvelope,
  type CCFLineupRosterPlayer,
  type CCFLineupSlot,
} from "../lineupDecision";
import type { CCFPlayerOutcome, CCFPosition } from "../../outcomes/contract";
import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  type CCFWeeklySourceSpineAudit,
} from "../../sources/weeklySourceSpine";

const AS_OF = "2026-09-15T20:00:00.000Z";
const VALID_UNTIL = "2026-09-16T20:00:00.000Z";
const SCORING = "scoring-fingerprint-6pt-ppr";
const SOURCE_PLAN = "weekly-source-plan-fingerprint";

function readySourceAudit(overrides: Partial<CCFWeeklySourceSpineAudit> = {}): CCFWeeklySourceSpineAudit {
  return {
    contractVersion: "ccf-weekly-source-spine-audit-v1",
    planId: "native-weekly-v1",
    asOf: AS_OF,
    productionReady: true,
    discoveryCoverage: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    productionCoverage: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    requiredCapabilityCount: CCF_WEEKLY_SOURCE_CAPABILITIES.length,
    planFingerprint: SOURCE_PLAN,
    capabilities: CCF_WEEKLY_SOURCE_CAPABILITIES.map((capability) => ({
      capability,
      ready: true,
      sourceId: `source:${capability}`,
      sourceEligibilityReason: "eligible",
      blockers: [],
    })),
    blockers: [],
    ...overrides,
  };
}

function outcome(
  playerId: string,
  position: CCFPosition,
  meanFpts: number,
  overrides: Partial<CCFPlayerOutcome> = {},
): CCFPlayerOutcome {
  return {
    playerId,
    position,
    season: 2026,
    week: 2,
    scoringFormat: "CUSTOM",
    scoringFingerprint: SCORING,
    meanFpts,
    medianFpts: meanFpts,
    p10Fpts: meanFpts - 6,
    p25Fpts: meanFpts - 3,
    p75Fpts: meanFpts + 3,
    p90Fpts: meanFpts + 6,
    zeroOrNearZeroProbability: 0.02,
    boomProbability: 0.2,
    bustProbability: 0.15,
    volatility: 4,
    confidence: 0.8,
    coverage: 0.95,
    abstain: false,
    abstainReasons: [],
    mechanismContributions: [],
    criticalFeatureProvenance: [{
      feature: "native_weekly_features",
      producerFamily: "ccf_native_model",
      critical: true,
      evidenceKind: "inferred",
      sourceRef: "ccf:native-weekly",
      knownAt: AS_OF,
    }],
    modelVersion: "ccf-weekly-v1",
    asOf: AS_OF,
    mode: "CCF_NATIVE",
    ...overrides,
  };
}

function envelope(
  playerId: string,
  position: CCFPosition,
  meanFpts: number,
  outcomeOverrides: Partial<CCFPlayerOutcome> = {},
  envelopeOverrides: Partial<CCFLineupOutcomeEnvelope> = {},
): CCFLineupOutcomeEnvelope {
  return {
    playerId,
    outcome: outcome(playerId, position, meanFpts, outcomeOverrides),
    calibrationVersion: "cal-v1",
    predictiveValidationReceiptFingerprint: "predictive-validation-fingerprint",
    sourcePlanFingerprint: SOURCE_PLAN,
    validUntil: VALID_UNTIL,
    ...envelopeOverrides,
  };
}

function rosterPlayer(
  playerId: string,
  position: CCFPosition,
  overrides: Partial<CCFLineupRosterPlayer> = {},
): CCFLineupRosterPlayer {
  return {
    playerId,
    position,
    identityStatus: "canonical",
    availability: "eligible",
    byeWeek: null,
    byeWeekKnown: true,
    observedStarterSlotId: null,
    lockState: "unlocked",
    lockAt: null,
    ...overrides,
  };
}

function starterSlots(): CCFLineupSlot[] {
  return [
    { slotId: "QB:1", slotType: "QB", eligiblePositions: ["QB"], lockedPlayerId: null },
    { slotId: "RB:1", slotType: "RB", eligiblePositions: ["RB"], lockedPlayerId: null },
    { slotId: "WR:1", slotType: "WR", eligiblePositions: ["WR"], lockedPlayerId: null },
    { slotId: "FLEX:1", slotType: "FLEX", eligiblePositions: ["RB", "WR", "TE"], lockedPlayerId: null },
    { slotId: "SF:1", slotType: "SUPERFLEX", eligiblePositions: ["QB", "RB", "WR", "TE"], lockedPlayerId: null },
  ];
}

function baseInput(): CCFLineupDecisionInput {
  const roster = [
    rosterPlayer("qb-a", "QB", { observedStarterSlotId: "QB:1" }),
    rosterPlayer("qb-b", "QB"),
    rosterPlayer("rb-a", "RB", { observedStarterSlotId: "RB:1" }),
    rosterPlayer("rb-b", "RB", { observedStarterSlotId: "FLEX:1" }),
    rosterPlayer("wr-a", "WR", { observedStarterSlotId: "WR:1" }),
    rosterPlayer("wr-b", "WR", { observedStarterSlotId: "SF:1" }),
    rosterPlayer("te-a", "TE"),
  ];
  const values: Record<string, [CCFPosition, number]> = {
    "qb-a": ["QB", 24],
    "qb-b": ["QB", 20],
    "rb-a": ["RB", 16],
    "rb-b": ["RB", 14],
    "wr-a": ["WR", 17],
    "wr-b": ["WR", 15],
    "te-a": ["TE", 10],
  };

  return {
    contractVersion: CCF_LINEUP_DECISION_VERSION,
    decisionId: "decision-1",
    leagueRef: "league-1",
    teamRef: "team-1",
    season: 2026,
    week: 2,
    asOf: AS_OF,
    scoringFingerprint: SCORING,
    rosterSnapshotFingerprint: "roster-snapshot-fingerprint",
    posture: "balanced",
    slots: starterSlots(),
    roster,
    outcomes: Object.entries(values).map(([playerId, [position, value]]) =>
      envelope(playerId, position, value)),
    weeklySourceSpineAudit: readySourceAudit(),
  };
}

function assignmentMap(result: ReturnType<typeof evaluateCCFCompleteLegalLineup>): Map<string, string> {
  return new Map(result.assignments?.map((assignment) => [assignment.slotId, assignment.playerId]) ?? []);
}

describe("CCF complete legal lineup decision core", () => {
  it("solves the complete lineup across FLEX and SUPERFLEX", () => {
    const result = evaluateCCFCompleteLegalLineup(baseInput());
    expect(result.status).toBe("comparison_available");
    expect(result.assignments).toHaveLength(5);
    expect(assignmentMap(result).get("QB:1")).toBe("qb-a");
    expect(assignmentMap(result).get("SF:1")).toBe("qb-b");
    expect(new Set(result.assignments?.map((assignment) => assignment.playerId)).size).toBe(5);
    expect(result.correlationSensitiveWinProbability).toBeNull();
    expect(result.finalActionAuthority).toBe("human");
  });

  it("honors locked observed starters even when an alternative is stronger", () => {
    const input = baseInput();
    input.slots.find((slot) => slot.slotId === "WR:1")!.lockedPlayerId = "wr-a";
    const wrA = input.roster.find((player) => player.playerId === "wr-a")!;
    wrA.lockState = "locked";
    wrA.lockAt = "2026-09-15T19:00:00.000Z";
    const wrB = input.outcomes.find((candidate) => candidate.playerId === "wr-b")!.outcome;
    Object.assign(wrB, { meanFpts: 50, medianFpts: 50, p10Fpts: 44, p25Fpts: 47, p75Fpts: 53, p90Fpts: 56 });

    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("comparison_available");
    expect(assignmentMap(result).get("WR:1")).toBe("wr-a");
    expect(result.assignments?.find((assignment) => assignment.slotId === "WR:1")?.locked).toBe(true);
  });

  it("fails closed if a locked starter is not bound to its observed slot", () => {
    const input = baseInput();
    const wrA = input.roster.find((player) => player.playerId === "wr-a")!;
    wrA.lockState = "locked";
    wrA.lockAt = "2026-09-15T19:00:00.000Z";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.blockers).toContain("wr-a:locked_starter_not_bound_to_observed_slot");
  });

  it("excludes locked bench players from legal alternatives", () => {
    const input = baseInput();
    const teA = input.roster.find((player) => player.playerId === "te-a")!;
    teA.lockState = "locked";
    teA.lockAt = "2026-09-15T19:00:00.000Z";
    const teOutcome = input.outcomes.find((candidate) => candidate.playerId === "te-a")!.outcome;
    Object.assign(teOutcome, { meanFpts: 100, medianFpts: 100, p10Fpts: 90, p25Fpts: 95, p75Fpts: 105, p90Fpts: 110 });

    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("comparison_available");
    expect(result.assignments?.some((assignment) => assignment.playerId === "te-a")).toBe(false);
  });

  it("fails closed when a playable player's lock state is unknown", () => {
    const input = baseInput();
    input.roster.find((player) => player.playerId === "te-a")!.lockState = "unknown";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("te-a:lock_state");
  });

  it("fails closed when a playable player's bye state is unknown", () => {
    const input = baseInput();
    input.roster.find((player) => player.playerId === "te-a")!.byeWeekKnown = false;
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("te-a:bye_week_state");
  });

  it("excludes bye-week and explicitly ineligible alternatives", () => {
    const input = baseInput();
    input.roster.find((player) => player.playerId === "qb-b")!.byeWeek = 2;
    input.roster.find((player) => player.playerId === "wr-b")!.availability = "ineligible";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("comparison_available");
    const selected = new Set(result.assignments?.map((assignment) => assignment.playerId));
    expect(selected.has("qb-b")).toBe(false);
    expect(selected.has("wr-b")).toBe(false);
  });

  it("treats unknown availability as load-bearing missing evidence", () => {
    const input = baseInput();
    input.roster.find((player) => player.playerId === "te-a")!.availability = "unknown";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("te-a:availability");
  });

  it("requires CCF outcome coverage for every legal alternative", () => {
    const input = baseInput();
    input.outcomes = input.outcomes.filter((candidate) => candidate.playerId !== "te-a");
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("te-a:ccf_outcome");
  });

  it("rejects scoring-profile mismatches rather than using a generic default", () => {
    const input = baseInput();
    input.outcomes.find((candidate) => candidate.playerId === "qb-a")!.outcome.scoringFingerprint = "stale-4pt-pass-td";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("qb-a:outcome_scoring_fingerprint_mismatch");
  });

  it("accepts a scoring change only when the full CCF outcome set is regenerated compatibly", () => {
    const input = baseInput();
    input.scoringFingerprint = "standard-4pt-pass-td";
    input.outcomes.forEach((candidate) => {
      candidate.outcome.scoringFingerprint = input.scoringFingerprint;
    });
    const qbB = input.outcomes.find((candidate) => candidate.playerId === "qb-b")!.outcome;
    Object.assign(qbB, { meanFpts: 5, medianFpts: 5, p10Fpts: 0, p25Fpts: 2, p75Fpts: 8, p90Fpts: 11 });
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("comparison_available");
    expect(assignmentMap(result).get("SF:1")).not.toBe("qb-b");
  });

  it("rejects stale or future-known outcome evidence", () => {
    const stale = baseInput();
    stale.outcomes[0].validUntil = "2026-09-15T19:59:59.000Z";
    const staleResult = evaluateCCFCompleteLegalLineup(stale);
    expect(staleResult.status).toBe("insufficient_evidence");
    expect(staleResult.missingInputs).toContain("qb-a:outcome_stale");

    const future = baseInput();
    future.outcomes[0].outcome.asOf = "2026-09-15T20:00:01.000Z";
    future.outcomes[0].outcome.criticalFeatureProvenance[0].knownAt = "2026-09-15T20:00:01.000Z";
    const futureResult = evaluateCCFCompleteLegalLineup(future);
    expect(futureResult.status).toBe("insufficient_evidence");
    expect(futureResult.missingInputs.some((gap) => gap.includes("outcome_known_after_decision"))).toBe(true);
  });

  it("rejects recommendation-critical TIBER provenance from CCF_NATIVE", () => {
    const input = baseInput();
    input.outcomes[0].outcome.criticalFeatureProvenance[0].producerFamily = "tiber_model";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs.some((gap) => gap.includes("invalid_native_outcome"))).toBe(true);
  });

  it("requires a production-ready native weekly source spine", () => {
    const input = baseInput();
    input.weeklySourceSpineAudit = readySourceAudit({
      productionReady: false,
      productionCoverage: 5,
      blockers: ["game_activation:source:permission_not_cleared"],
    });
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("production_ready_weekly_source_spine");
  });

  it("requires the weekly source spine to be evaluated at the exact decision as-of", () => {
    const input = baseInput();
    input.weeklySourceSpineAudit = readySourceAudit({ asOf: "2026-09-15T20:00:01.000Z" });
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("same_as_of_weekly_source_spine");
  });

  it("refuses tail-posture optimization without a governed joint-lineup distribution", () => {
    for (const posture of ["protect_downside", "chase_spike"] as const) {
      const input = baseInput();
      input.posture = posture;
      const result = evaluateCCFCompleteLegalLineup(input);
      expect(result.status).toBe("insufficient_evidence");
      expect(result.missingInputs).toContain("governed_joint_lineup_distribution");
    }
  });

  it("does not silently infer risk posture", () => {
    const input = baseInput();
    input.posture = "unset";
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("operator_tiebreak_required");
    expect(result.assignments).toBeNull();
  });

  it("returns structural_tie instead of resolving an equal-value lineup by player id", () => {
    const input = baseInput();
    const te = input.outcomes.find((candidate) => candidate.playerId === "te-a")!.outcome;
    Object.assign(te, { meanFpts: 15, medianFpts: 15, p10Fpts: 9, p25Fpts: 12, p75Fpts: 18, p90Fpts: 21 });
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("structural_tie");
    expect(result.tiedAlternativeLineupFingerprint).not.toBeNull();
  });

  it("fails closed when the roster cannot fill the frozen starter geometry", () => {
    const input = baseInput();
    input.roster = input.roster.filter((player) => player.position !== "RB");
    input.outcomes = input.outcomes.filter((candidate) => candidate.outcome.position !== "RB");
    const result = evaluateCCFCompleteLegalLineup(input);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.missingInputs).toContain("RB:1:eligible_player");
  });

  it("replays deterministically for the same frozen packet", () => {
    const first = evaluateCCFCompleteLegalLineup(baseInput());
    const second = evaluateCCFCompleteLegalLineup(baseInput());
    expect(second).toEqual(first);
    expect(second.receipt.inputFingerprint).toBe(first.receipt.inputFingerprint);
  });
});
