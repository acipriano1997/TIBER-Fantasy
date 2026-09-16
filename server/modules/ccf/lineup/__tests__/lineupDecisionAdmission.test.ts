import {
  CCF_LINEUP_DECISION_VERSION,
  evaluateCCFCompleteLegalLineup,
  type CCFLineupDecisionInput,
  type CCFLineupOutcomeEnvelope,
} from "../lineupDecision";
import type { CCFPlayerOutcome } from "../../outcomes/contract";
import {
  CCF_WEEKLY_SOURCE_CAPABILITIES,
  type CCFWeeklySourceSpineAudit,
} from "../../sources/weeklySourceSpine";

const AS_OF = "2026-09-15T20:00:00.000Z";
const SOURCE_PLAN = "weekly-source-plan-fingerprint";
const SCORING = "scoring-fingerprint";

function sourceAudit(asOf: string = AS_OF): CCFWeeklySourceSpineAudit {
  return {
    contractVersion: "ccf-weekly-source-spine-audit-v1",
    planId: "native-weekly-v1",
    asOf,
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
  };
}

function playerOutcome(playerId: string, meanFpts: number): CCFPlayerOutcome {
  return {
    playerId,
    position: "WR",
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
  };
}

function envelope(playerId: string, meanFpts: number): CCFLineupOutcomeEnvelope {
  return {
    playerId,
    outcome: playerOutcome(playerId, meanFpts),
    calibrationVersion: "cal-v1",
    predictiveValidationReceiptFingerprint: "predictive-validation-fingerprint",
    sourcePlanFingerprint: SOURCE_PLAN,
    validUntil: "2026-09-16T20:00:00.000Z",
  };
}

function input(): CCFLineupDecisionInput {
  return {
    contractVersion: CCF_LINEUP_DECISION_VERSION,
    decisionId: "admission-1",
    leagueRef: "league-1",
    teamRef: "team-1",
    season: 2026,
    week: 2,
    asOf: AS_OF,
    scoringFingerprint: SCORING,
    rosterSnapshotFingerprint: "roster-fingerprint",
    posture: "balanced",
    slots: [{
      slotId: "WR:1",
      slotType: "WR",
      eligiblePositions: ["WR"],
      lockedPlayerId: null,
    }],
    roster: [
      {
        playerId: "wr-a",
        position: "WR",
        identityStatus: "canonical",
        availability: "eligible",
        byeWeek: null,
        observedStarterSlotId: "WR:1",
        lockAt: null,
      },
      {
        playerId: "wr-b",
        position: "WR",
        identityStatus: "canonical",
        availability: "eligible",
        byeWeek: null,
        observedStarterSlotId: null,
        lockAt: null,
      },
    ],
    outcomes: [envelope("wr-a", 18), envelope("wr-b", 14)],
    weeklySourceSpineAudit: sourceAudit(),
  };
}

describe("CCF lineup admission hardening", () => {
  it("requires the weekly source-spine audit to share the exact frozen decision as-of", () => {
    const stale = input();
    stale.weeklySourceSpineAudit = sourceAudit("2026-09-15T19:59:59.000Z");
    const staleResult = evaluateCCFCompleteLegalLineup(stale);
    expect(staleResult.status).toBe("insufficient_evidence");
    expect(staleResult.missingInputs).toContain("same_as_of_weekly_source_spine");

    const future = input();
    future.weeklySourceSpineAudit = sourceAudit("2026-09-15T20:00:01.000Z");
    const futureResult = evaluateCCFCompleteLegalLineup(future);
    expect(futureResult.status).toBe("insufficient_evidence");
    expect(futureResult.missingInputs).toContain("same_as_of_weekly_source_spine");

    expect(evaluateCCFCompleteLegalLineup(input()).status).toBe("comparison_available");
  });

  it("rejects outcome envelopes that are not bound to the frozen roster snapshot", () => {
    const decision = input();
    decision.outcomes.push(envelope("not-on-roster", 30));
    const result = evaluateCCFCompleteLegalLineup(decision);
    expect(result.status).toBe("insufficient_evidence");
    expect(result.blockers).toContain("Outcome envelopes must be bound to the frozen roster snapshot.");
    expect(result.missingInputs).toContain("not-on-roster:orphan_outcome_envelope");
  });
});
