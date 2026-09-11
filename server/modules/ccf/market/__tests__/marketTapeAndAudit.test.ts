import { describe, expect, it } from "vitest";
import type { CCFBookQuote } from "../marketEvidence";
import { summarizeCCFMarketTape } from "../marketTape";
import { scoreSettledMarketDecision } from "../marketAudit";

function quote(
  bookmaker: string,
  capturedAt: string,
  selectionId: "over" | "under",
  odds: number,
  line = 64.5,
  knownAt = capturedAt,
): CCFBookQuote {
  return {
    quoteId: `${bookmaker}-${capturedAt}-${selectionId}`,
    bookmaker,
    bookmakerMarketId: `${bookmaker}-receiving-yards-64.5`,
    marketId: "player-123:receiving-yards:64.5",
    marketKind: "player_prop",
    marketScope: "player",
    selection: {
      selectionId,
      label: `${selectionId} ${line}`,
      entityId: "player-123",
      side: selectionId,
      line,
    },
    oddsFormat: "american",
    odds,
    capturedAt,
    retrievedAt: knownAt,
    knownAt,
    status: "open",
    sourceLocator: `fixture://${bookmaker}/${capturedAt}/${selectionId}`,
    rawTraceRef: `sha256:${bookmaker}:${capturedAt}:${selectionId}`,
    notes: [],
  };
}

function snapshot(
  bookmaker: string,
  capturedAt: string,
  overOdds: number,
  underOdds: number,
  line = 64.5,
  knownAt = capturedAt,
): CCFBookQuote[] {
  return [
    quote(bookmaker, capturedAt, "over", overOdds, line, knownAt),
    quote(bookmaker, capturedAt, "under", underOdds, line, knownAt),
  ];
}

describe("CCF market tape", () => {
  it("preserves per-book open/current history, ignores stale prices for best-price selection, and exposes dispersion", () => {
    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards:64.5",
      selectionId: "over",
      maxAgeMinutes: 15,
      asOf: "2026-09-11T20:10:00.000Z",
      quotes: [
        ...snapshot("Book A", "2026-09-11T20:00:00.000Z", -110, -110, 63.5),
        ...snapshot("Book A", "2026-09-11T20:05:00.000Z", -105, -115, 64.5, "2026-09-11T20:06:00.000Z"),
        ...snapshot("Book B", "2026-09-11T20:04:00.000Z", 100, -120, 64.5),
        ...snapshot("Book C", "2026-09-11T19:30:00.000Z", 110, -130, 64.5),
      ],
    });

    expect(result.state).toBe("partial");
    expect(result.asOf).toBe("2026-09-11T20:10:00.000Z");
    expect(result.books).toHaveLength(3);
    const bookA = result.books.find((book) => book.bookmaker === "Book A");
    expect(bookA?.observations).toBe(2);
    expect(bookA?.open.line).toBe(63.5);
    expect(bookA?.current.line).toBe(64.5);
    expect(bookA?.lineDelta).toBe(1);
    expect(result.staleBookCount).toBe(1);
    expect(result.bestUsableQuote?.bookmaker).toBe("Book B");
    expect(result.bestUsableQuote?.odds).toBe(100);
    expect(result.currentFairProbabilityRange?.spread).toBeGreaterThan(0);
    expect(result.currentLineRange).toEqual({ min: 64.5, max: 64.5, spread: 0 });
  });

  it("returns unavailable instead of promoting stale-only evidence", () => {
    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards:64.5",
      selectionId: "over",
      maxAgeMinutes: 5,
      asOf: "2026-09-11T20:10:00.000Z",
      quotes: snapshot("Book A", "2026-09-11T19:50:00.000Z", 100, -120),
    });

    expect(result.state).toBe("unavailable");
    expect(result.bestUsableQuote).toBeNull();
  });

  it("excludes a snapshot that was not yet known at asOf", () => {
    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards:64.5",
      selectionId: "over",
      maxAgeMinutes: 15,
      asOf: "2026-09-11T20:10:00.000Z",
      quotes: snapshot(
        "Book A",
        "2026-09-11T20:05:00.000Z",
        -110,
        -110,
        64.5,
        "2026-09-11T20:11:00.000Z",
      ),
    });

    expect(result.state).toBe("unavailable");
    expect(result.books).toEqual([]);
    expect(result.invalidSnapshotCount).toBe(1);
  });

  it("refuses to de-vig a one-sided book snapshot", () => {
    const result = summarizeCCFMarketTape({
      marketId: "player-123:receiving-yards:64.5",
      selectionId: "over",
      maxAgeMinutes: 15,
      asOf: "2026-09-11T20:10:00.000Z",
      quotes: [quote("Book A", "2026-09-11T20:05:00.000Z", "over", -110)],
    });

    expect(result.state).toBe("unavailable");
    expect(result.invalidSnapshotCount).toBe(1);
  });
});

describe("CCF market audit", () => {
  const decision = {
    decisionId: "decision-1",
    marketId: "player-123:receiving-yards:64.5",
    selectedOutcomeId: "over",
    frozenAt: "2026-09-11T20:00:00.000Z",
    ccfModelVersion: "ccf-test",
    ccfProbability: 0.6,
    decisionMarketFairProbability: 0.5,
    offeredOddsFormat: "american",
    offeredOdds: 100,
    bookmaker: "Book A",
    marketQuoteId: "quote-1",
    marketCapturedAt: "2026-09-11T19:58:00.000Z",
    marketKnownAt: "2026-09-11T19:59:00.000Z",
    marketRawTraceRef: "sha256:decision-quote",
  } as const;

  it("scores calibration, market-relative accuracy, selection return, and closing movement", () => {
    const result = scoreSettledMarketDecision(decision, 1, {
      capturedAt: "2026-09-11T22:00:00.000Z",
      knownAt: "2026-09-11T22:01:00.000Z",
      rawTraceRef: "sha256:closing-quote",
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
    expect(result.closingRawTraceRef).toBe("sha256:closing-quote");
    expect(result.logLoss).toBeGreaterThan(0);
  });

  it("rejects closing evidence that predates the frozen decision", () => {
    expect(() => scoreSettledMarketDecision(decision, 1, {
      capturedAt: "2026-09-11T19:59:00.000Z",
      knownAt: "2026-09-11T19:59:30.000Z",
      rawTraceRef: "sha256:too-early",
      closingFairProbability: 0.58,
    })).toThrow();
  });

  it("rejects decision evidence that was not known by the freeze time", () => {
    expect(() => scoreSettledMarketDecision({
      ...decision,
      marketKnownAt: "2026-09-11T20:01:00.000Z",
    }, 1)).toThrow();
  });

  it("rejects closing evidence with impossible captured/known ordering", () => {
    expect(() => scoreSettledMarketDecision(decision, 1, {
      capturedAt: "2026-09-11T22:00:00.000Z",
      knownAt: "2026-09-11T21:59:00.000Z",
      rawTraceRef: "sha256:invalid-order",
      closingFairProbability: 0.58,
    })).toThrow();
  });

  it("does not call outcome-implied return a realized wager return", () => {
    const result = scoreSettledMarketDecision(decision, 0);
    expect(result.selectionReturnPerUnit).toBe(-1);
    expect(result.returnBasis).toBe("selection_outcome_only");
  });
});
