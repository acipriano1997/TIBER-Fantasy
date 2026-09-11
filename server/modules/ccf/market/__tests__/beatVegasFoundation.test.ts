import { describe, expect, it } from "vitest";
import type { CCFBookQuote } from "../marketEvidence";
import {
  betToAmericanOdds,
  evaluateCCFMarketPrice,
  expectedRoiFromProbability,
  fairAmericanOddsFromProbability,
} from "../marketPricing";
import { summarizeCCFMarketTape } from "../marketTape";
import { scoreSettledMarketDecision } from "../marketAudit";
import {
  evaluateBeatVegasCertification,
  type BeatVegasCertificationInputs,
} from "../beatVegasCertification";

function quote(input: {
  quoteId: string;
  bookmaker: string;
  capturedAt: string;
  knownAt: string;
  selectionId: "over" | "under";
  odds: number;
  line: number;
}): CCFBookQuote {
  return {
    quoteId: input.quoteId,
    bookmaker: input.bookmaker,
    bookmakerMarketId: null,
    marketId: "player-123:receiving-yards",
    marketKind: "player_prop",
    marketScope: "player",
    expectedSelectionCount: 2,
    selection: {
      selectionId: input.selectionId,
      label: input.selectionId,
      entityId: "player-123",
      side: input.selectionId,
      line: input.line,
    },
    oddsFormat: "american",
    odds: input.odds,
    capturedAt: input.capturedAt,
    retrievedAt: input.knownAt,
    knownAt: input.knownAt,
    status: "open",
    sourceLocator: null,
    rawTraceRef: `trace:${input.quoteId}`,
    notes: [],
  };
}

function snapshot(
  bookmaker: string,
  prefix: string,
  capturedAt: string,
  knownAt: string,
  overOdds: number,
  underOdds: number,
  line: number,
): CCFBookQuote[] {
  return [
    quote({ quoteId: `${prefix}:over`, bookmaker, capturedAt, knownAt, selectionId: "over", odds: overOdds, line }),
    quote({ quoteId: `${prefix}:under`, bookmaker, capturedAt, knownAt, selectionId: "under", odds: underOdds, line }),
  ];
}

function allPassed(): BeatVegasCertificationInputs {
  return {
    ccfForecastCertified: true,
    ccfTargetDistributionCertified: true,
    pointInTimeProvenance: true,
    immutableAuditLedger: true,
    consumerFailClosed: true,
    uiNonCertifiedLabeling: true,
    marketSourceGatesPassed: true,
    marketFeedValidated: true,
    marketReplayAvailable: true,
    closingLineCapture: true,
    marketCalibrationValidated: true,
    priceIntegrityValidated: true,
    jointOutcomeModelCertified: true,
    ownershipSourceGatesPassed: true,
    ownershipFeedValidated: true,
    contestRulesValidated: true,
    fieldSimulationCertified: true,
    payoutSimulationValidated: true,
    duplicationModelValidated: true,
    portfolioRiskValidated: true,
  };
}

describe("Beat Vegas fair-price math", () => {
  it("computes fair odds, EV, and an internally consistent bet-to threshold", () => {
    expect(fairAmericanOddsFromProbability(0.4)).toBeCloseTo(150, 10);
    expect(expectedRoiFromProbability(0.55, "american", -110)).toBeCloseTo(0.05, 10);

    const betTo = betToAmericanOdds(0.55, 0.02);
    expect(expectedRoiFromProbability(0.55, "american", betTo)).toBeCloseTo(0.02, 10);
  });

  it("centralizes the complete inspectable CCF-versus-market price chain without emitting a pick", () => {
    const evaluation = evaluateCCFMarketPrice({
      ccfProbability: 0.57,
      marketFairProbability: 0.5,
      offeredOddsFormat: "american",
      offeredOdds: -110,
      minimumExpectedRoi: 0.02,
      stakeForExpectedValue: 100,
    });

    expect(evaluation.probabilityEdge).toBeCloseTo(0.07, 10);
    expect(evaluation.ccfFairAmericanOdds).toBeLessThan(-100);
    expect(evaluation.marketFairAmericanOdds).toBeCloseTo(100, 10);
    expect(evaluation.expectedRoi).toBeGreaterThan(0);
    expect(evaluation.expectedValue).toBeCloseTo(100 * evaluation.expectedRoi, 10);
    expect(expectedRoiFromProbability(0.57, "american", evaluation.betToAmericanOdds)).toBeCloseTo(0.02, 10);
    expect(evaluation.ruleId).toBe("ccf-market-price-evaluation-v1");
    expect(evaluation).not.toHaveProperty("recommendation");
  });
});

describe("Beat Vegas market tape", () => {
  it("keeps book histories, excludes stale books from best price, and exposes disagreement", () => {
    const quotes = [
      ...snapshot("Book A", "a-old", "2026-09-11T20:00:00.000Z", "2026-09-11T20:01:00.000Z", -110, -110, 63.5),
      ...snapshot("Book A", "a-new", "2026-09-11T20:05:00.000Z", "2026-09-11T20:06:00.000Z", -105, -115, 64.5),
      ...snapshot("Book B", "b-new", "2026-09-11T20:04:00.000Z", "2026-09-11T20:05:00.000Z", 100, -120, 64.5),
      ...snapshot("Book C", "c-stale", "2026-09-11T19:30:00.000Z", "2026-09-11T19:31:00.000Z", 110, -130, 64.5),
    ];

    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards",
      selectionId: "over",
      quotes,
      asOf: "2026-09-11T20:10:00.000Z",
      maxAgeMinutes: 15,
    });

    expect(result.state).toBe("partial");
    expect(result.books).toHaveLength(3);
    expect(result.books.find((book) => book.bookmaker === "Book A")?.observations).toBe(2);
    expect(result.books.find((book) => book.bookmaker === "Book A")?.lineDelta).toBeCloseTo(1, 10);
    expect(result.staleBookCount).toBe(1);
    expect(result.bestUsableQuote?.bookmaker).toBe("Book B");
    expect(result.bestUsableQuote?.odds).toBe(100);
    expect(result.currentFairProbabilityRange?.spread).toBeGreaterThan(0);
    expect(result.currentLineRange).toEqual({ min: 64.5, max: 64.5, spread: 0 });
  });

  it("rejects an entire de-vig snapshot when any participating side was not known by asOf", () => {
    const leakedSnapshot = snapshot(
      "Book Leak",
      "leak",
      "2026-09-11T20:05:00.000Z",
      "2026-09-11T20:06:00.000Z",
      -110,
      -110,
      64.5,
    );
    leakedSnapshot[1] = {
      ...leakedSnapshot[1],
      retrievedAt: "2026-09-11T20:11:00.000Z",
      knownAt: "2026-09-11T20:11:00.000Z",
    };

    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards",
      selectionId: "over",
      quotes: leakedSnapshot,
      asOf: "2026-09-11T20:10:00.000Z",
      maxAgeMinutes: 15,
    });

    expect(result.state).toBe("unavailable");
    expect(result.books).toEqual([]);
    expect(result.invalidSnapshotCount).toBe(1);
    expect(result.bestUsableQuote).toBeNull();
  });

  it("measures freshness from capture time so delayed ingestion cannot revive an old quote", () => {
    const delayed = snapshot(
      "Book Delay",
      "delay",
      "2026-09-11T19:50:00.000Z",
      "2026-09-11T20:09:00.000Z",
      -110,
      -110,
      64.5,
    );

    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards",
      selectionId: "over",
      quotes: delayed,
      asOf: "2026-09-11T20:10:00.000Z",
      maxAgeMinutes: 5,
    });

    expect(result.state).toBe("unavailable");
    expect(result.staleBookCount).toBe(1);
    expect(result.books[0].current.ageMinutes).toBeCloseTo(20, 10);
    expect(result.bestUsableQuote).toBeNull();
  });
});

describe("Beat Vegas frozen audit", () => {
  const decision = {
    decisionId: "decision-1",
    marketId: "player-123:receiving-yards",
    selectedOutcomeId: "over",
    frozenAt: "2026-09-11T20:10:00.000Z",
    ccfModelVersion: "ccf-test",
    ccfProbability: 0.6,
    decisionMarketFairProbability: 0.5,
    offeredOddsFormat: "american" as const,
    offeredOdds: 100,
    bookmaker: "Book A",
    marketQuoteId: "a-new:over",
    marketCapturedAt: "2026-09-11T20:05:00.000Z",
    marketKnownAt: "2026-09-11T20:06:00.000Z",
    marketRawTraceRef: "trace:a-new:over",
  };

  it("scores CCF calibration versus market and closing evidence without claiming a wager", () => {
    const result = scoreSettledMarketDecision(decision, 1, {
      capturedAt: "2026-09-11T22:00:00.000Z",
      knownAt: "2026-09-11T22:00:30.000Z",
      rawTraceRef: "trace:close",
      closingFairProbability: 0.58,
      closingOddsFormat: "american",
      closingOdds: -120,
    });

    expect(result.brierScore).toBeCloseTo(0.16, 10);
    expect(result.decisionMarketBrierScore).toBeCloseTo(0.25, 10);
    expect(result.brierImprovementVsDecisionMarket).toBeCloseTo(0.09, 10);
    expect(result.selectionReturnPerUnit).toBeCloseTo(1, 10);
    expect(result.returnBasis).toBe("selection_outcome_only");
    expect(result.closingProbabilityMove).toBeCloseTo(0.08, 10);
    expect(result.ccfProbabilityMinusClose).toBeCloseTo(0.02, 10);
    expect(result.offeredVsClosingDecimalPricePct).toBeGreaterThan(0);
  });

  it("rejects closing evidence captured before the decision freeze", () => {
    expect(() => scoreSettledMarketDecision(decision, 1, {
      capturedAt: "2026-09-11T20:09:00.000Z",
      knownAt: "2026-09-11T20:09:30.000Z",
      rawTraceRef: "trace:bad-close",
      closingFairProbability: 0.58,
    })).toThrow();
  });
});

describe("Beat Vegas promotion gate", () => {
  it("keeps incomplete market surfaces in research mode", () => {
    const inputs = allPassed();
    inputs.ccfTargetDistributionCertified = false;
    inputs.marketFeedValidated = false;
    const decision = evaluateBeatVegasCertification("value_props", inputs);
    expect(decision.mode).toBe("research");
    expect(decision.recommendationAllowed).toBe(false);
  });

  it("allows shadow evaluation without recommendation authority", () => {
    const inputs = allPassed();
    inputs.marketReplayAvailable = false;
    inputs.closingLineCapture = false;
    inputs.marketCalibrationValidated = false;
    const decision = evaluateBeatVegasCertification("game_markets", inputs);
    expect(decision.mode).toBe("shadow");
    expect(decision.recommendationAllowed).toBe(false);
  });

  it("requires joint outcome certification for correlated markets and full contest proof for DFS", () => {
    const correlated = allPassed();
    correlated.jointOutcomeModelCertified = false;
    expect(evaluateBeatVegasCertification("correlated_markets", correlated).recommendationAllowed).toBe(false);

    const dfs = allPassed();
    dfs.fieldSimulationCertified = false;
    dfs.duplicationModelValidated = false;
    dfs.portfolioRiskValidated = false;
    const dfsDecision = evaluateBeatVegasCertification("dfs_lab", dfs);
    expect(dfsDecision.mode).toBe("shadow");
    expect(dfsDecision.recommendationAllowed).toBe(false);
  });

  it("unlocks only when every surface-specific gate passes", () => {
    for (const surface of ["value_props", "game_markets", "correlated_markets", "dfs_lab"] as const) {
      const decision = evaluateBeatVegasCertification(surface, allPassed());
      expect(decision.mode).toBe("certified");
      expect(decision.recommendationAllowed).toBe(true);
      expect(decision.blockers).toEqual([]);
    }
  });
});
