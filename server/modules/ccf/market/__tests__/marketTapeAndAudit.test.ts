import { describe, expect, it } from "vitest";
import type { TwoWayMarketSnapshot } from "../marketEvidence";
import { summarizeMarketTape } from "../marketTape";
import { scoreSettledMarketDecision } from "../marketAudit";

function snapshot(
  snapshotId: string,
  sportsbook: string,
  observedAt: string,
  overOdds: number,
  underOdds: number,
  line = 64.5,
  knownAt = observedAt,
): TwoWayMarketSnapshot {
  return {
    snapshotId,
    marketId: `receiving-yards:${line}`,
    marketKind: "player_prop",
    targetId: "player-123",
    line,
    provider: "test-provider",
    sportsbook,
    observedAt,
    knownAt,
    source: `fixture://market/${snapshotId}`,
    outcomes: [
      { outcomeId: "over", americanOdds: overOdds },
      { outcomeId: "under", americanOdds: underOdds },
    ],
  };
}

describe("CCF market tape", () => {
  it("keeps each book's latest eligible quote, ignores stale prices for best-price selection, and exposes dispersion", () => {
    const result = summarizeMarketTape({
      marketSeriesId: "player-123:receiving-yards",
      selectedOutcomeId: "over",
      maxAgeMinutes: 15,
      asOf: new Date("2026-09-11T20:10:00.000Z"),
      snapshots: [
        snapshot("a-old", "Book A", "2026-09-11T20:00:00.000Z", -110, -110, 63.5),
        snapshot("a-new", "Book A", "2026-09-11T20:05:00.000Z", -105, -115, 64.5, "2026-09-11T20:06:00.000Z"),
        snapshot("b-new", "Book B", "2026-09-11T20:04:00.000Z", 100, -120, 64.5),
        snapshot("c-stale", "Book C", "2026-09-11T19:30:00.000Z", 110, -130, 64.5),
      ],
    });

    expect(result.state).toBe("partial");
    expect(result.asOf).toBe("2026-09-11T20:10:00.000Z");
    expect(result.latestBySportsbook).toHaveLength(3);
    expect(result.latestBySportsbook.find((quote) => quote.sportsbook === "Book A")?.snapshotId).toBe("a-new");
    expect(result.latestBySportsbook.find((quote) => quote.sportsbook === "Book A")?.knownAgeMinutes).toBeCloseTo(4, 10);
    expect(result.staleSportsbookCount).toBe(1);
    expect(result.bestUsableQuote?.sportsbook).toBe("Book B");
    expect(result.bestUsableQuote?.americanOdds).toBe(100);
    expect(result.noVigProbabilityRange?.spread).toBeGreaterThan(0);
    expect(result.lineRange).toEqual({ min: 64.5, max: 64.5, spread: 0 });
  });

  it("returns unavailable instead of promoting stale-only evidence", () => {
    const result = summarizeMarketTape({
      marketSeriesId: "player-123:receiving-yards",
      selectedOutcomeId: "over",
      maxAgeMinutes: 5,
      asOf: new Date("2026-09-11T20:10:00.000Z"),
      snapshots: [snapshot("stale", "Book A", "2026-09-11T19:50:00.000Z", 100, -120)],
    });

    expect(result.state).toBe("unavailable");
    expect(result.bestUsableQuote).toBeNull();
  });

  it("excludes a quote that was not yet known at asOf", () => {
    const result = summarizeMarketTape({
      marketSeriesId: "player-123:receiving-yards",
      selectedOutcomeId: "over",
      maxAgeMinutes: 15,
      asOf: new Date("2026-09-11T20:10:00.000Z"),
      snapshots: [
        snapshot(
          "future-known",
          "Book A",
          "2026-09-11T20:05:00.000Z",
          -110,
          -110,
          64.5,
          "2026-09-11T20:11:00.000Z",
        ),
      ],
    });

    expect(result.state).toBe("unavailable");
    expect(result.latestBySportsbook).toEqual([]);
    expect(result.invalidSnapshotCount).toBe(1);
  });
});

describe("CCF market audit", () => {
  const decision = {
    decisionId: "decision-1",
    marketSeriesId: "player-123:receiving-yards",
    selectedOutcomeId: "over",
    frozenAt: "2026-09-11T20:00:00.000Z",
    ccfModelVersion: "ccf-test",
    ccfProbability: 0.6,
    decisionMarketNoVigProbability: 0.5,
    offeredAmericanOdds: 100,
    sportsbook: "Book A",
    marketSnapshotId: "snapshot-1",
    marketObservedAt: "2026-09-11T19:58:00.000Z",
    marketKnownAt: "2026-09-11T19:59:00.000Z",
    marketSource: "fixture://market/snapshot-1",
  } as const;

  it("scores calibration, market-relative accuracy, selection return, and closing movement", () => {
    const result = scoreSettledMarketDecision(decision, 1, {
      observedAt: "2026-09-11T22:00:00.000Z",
      knownAt: "2026-09-11T22:01:00.000Z",
      source: "fixture://market/close-1",
      closingNoVigProbability: 0.58,
      closingAmericanOdds: -120,
    });

    expect(result.brierScore).toBeCloseTo(0.16, 10);
    expect(result.decisionMarketBrierScore).toBeCloseTo(0.25, 10);
    expect(result.brierImprovementVsDecisionMarket).toBeCloseTo(0.09, 10);
    expect(result.selectionReturnPerUnit).toBeCloseTo(1, 10);
    expect(result.returnBasis).toBe("selection_outcome_only");
    expect(result.closingProbabilityMove).toBeCloseTo(0.08, 10);
    expect(result.ccfProbabilityMinusClose).toBeCloseTo(0.02, 10);
    expect(result.offeredVsClosingDecimalPricePct).toBeGreaterThan(0);
    expect(result.closingEvidenceSource).toBe("fixture://market/close-1");
    expect(result.logLoss).toBeGreaterThan(0);
  });

  it("rejects closing evidence that predates the frozen decision", () => {
    expect(() => scoreSettledMarketDecision(decision, 1, {
      observedAt: "2026-09-11T19:59:00.000Z",
      knownAt: "2026-09-11T19:59:30.000Z",
      source: "fixture://market/close-too-early",
      closingNoVigProbability: 0.58,
    })).toThrow();
  });

  it("rejects decision evidence that was not known by the freeze time", () => {
    expect(() => scoreSettledMarketDecision({
      ...decision,
      marketKnownAt: "2026-09-11T20:01:00.000Z",
    }, 1)).toThrow();
  });

  it("rejects closing evidence with impossible observed/known ordering", () => {
    expect(() => scoreSettledMarketDecision(decision, 1, {
      observedAt: "2026-09-11T22:00:00.000Z",
      knownAt: "2026-09-11T21:59:00.000Z",
      source: "fixture://market/close-invalid-order",
      closingNoVigProbability: 0.58,
    })).toThrow();
  });
});
