import {
  compareQuoteMovement,
  impliedProbabilityFromOdds,
  normalizeBookMarketSnapshot,
  removeProportionalVig,
  validateCCFMarketEvidenceBundle,
  type CCFBookQuote,
  type CCFMarketEvidenceBundle,
} from "../marketEvidence";

function quote(overrides: Partial<CCFBookQuote> = {}): CCFBookQuote {
  return {
    quoteId: "q-home",
    bookmaker: "book-a",
    bookmakerMarketId: "provider-123",
    marketId: "game-1-moneyline",
    marketKind: "moneyline",
    marketScope: "game",
    selection: {
      selectionId: "home",
      label: "AAA",
      entityId: "AAA",
      side: "home",
      line: null,
    },
    oddsFormat: "american",
    odds: -110,
    capturedAt: "2026-09-11T15:55:00Z",
    retrievedAt: "2026-09-11T15:55:05Z",
    knownAt: "2026-09-11T15:55:05Z",
    status: "open",
    sourceLocator: "provider://book-a/game-1-moneyline/home",
    rawTraceRef: "sha256:home",
    notes: [],
    ...overrides,
  };
}

function bundle(): CCFMarketEvidenceBundle {
  return {
    contractVersion: "ccf-market-evidence-v1",
    generatedAt: "2026-09-11T16:00:05Z",
    asOf: "2026-09-11T16:00:00Z",
    availability: "available",
    event: {
      eventId: "game-1",
      sport: "football",
      league: "NFL",
      startAt: "2026-09-13T17:00:00Z",
      homeTeam: "AAA",
      awayTeam: "BBB",
      participants: ["AAA", "BBB"],
    },
    quotes: [quote()],
    warnings: [],
  };
}

describe("CCF market evidence", () => {
  it("validates temporally eligible sportsbook evidence without assigning fantasy impact", () => {
    expect(validateCCFMarketEvidenceBundle(bundle())).toEqual(bundle());
  });

  it("converts American and decimal prices to raw implied probability", () => {
    expect(impliedProbabilityFromOdds("american", -110)).toBeCloseTo(0.5238095);
    expect(impliedProbabilityFromOdds("american", 150)).toBeCloseTo(0.4);
    expect(impliedProbabilityFromOdds("decimal", 2)).toBeCloseTo(0.5);
  });

  it("removes proportional vig without treating the bookmaker margin as probability mass", () => {
    const result = removeProportionalVig([0.55, 0.55]);
    expect(result.overround).toBeCloseTo(0.1);
    expect(result.fairProbabilities[0]).toBeCloseTo(0.5);
    expect(result.fairProbabilities[1]).toBeCloseTo(0.5);
  });

  it("normalizes one bookmaker snapshot and refuses to mix books", () => {
    const home = quote();
    const away = quote({
      quoteId: "q-away",
      selection: {
        selectionId: "away",
        label: "BBB",
        entityId: "BBB",
        side: "away",
        line: null,
      },
      odds: -110,
      rawTraceRef: "sha256:away",
    });

    const normalized = normalizeBookMarketSnapshot([home, away]);
    expect(normalized.overround).toBeGreaterThan(0);
    expect(normalized.selections[0].fairProbability).toBeCloseTo(0.5);
    expect(normalized.selections[1].fairProbability).toBeCloseTo(0.5);

    const otherBook = quote({ ...away, bookmaker: "book-b" });
    expect(() => normalizeBookMarketSnapshot([home, otherBook])).toThrow(/mix bookmakers/);
  });

  it("computes price and line movement without labeling the movement as sharp", () => {
    const previous = quote({
      selection: {
        selectionId: "over",
        label: "Over 47.5",
        entityId: null,
        side: "over",
        line: 47.5,
      },
      marketId: "game-1-total",
      marketKind: "total",
      odds: -105,
      knownAt: "2026-09-11T15:00:00Z",
      capturedAt: "2026-09-11T15:00:00Z",
      retrievedAt: "2026-09-11T15:00:00Z",
    });
    const current = quote({
      selection: {
        selectionId: "over",
        label: "Over 48.5",
        entityId: null,
        side: "over",
        line: 48.5,
      },
      marketId: "game-1-total",
      marketKind: "total",
      odds: -120,
      knownAt: "2026-09-11T16:00:00Z",
      capturedAt: "2026-09-11T16:00:00Z",
      retrievedAt: "2026-09-11T16:00:00Z",
    });

    const movement = compareQuoteMovement(previous, current);
    expect(movement.lineDelta).toBe(1);
    expect(movement.impliedProbabilityDelta).toBeGreaterThan(0);
    expect(movement.direction).toBe("toward_selection");
  });

  it("rejects future-known evidence and preserves explicit unavailable semantics", () => {
    const future = bundle();
    future.quotes[0].knownAt = "2026-09-11T16:00:01Z";
    expect(() => validateCCFMarketEvidenceBundle(future)).toThrow(/later than bundle asOf/);

    const unavailable = bundle();
    unavailable.availability = "unavailable";
    unavailable.quotes = [];
    unavailable.warnings = ["market provider unavailable"];
    expect(() => validateCCFMarketEvidenceBundle(unavailable)).not.toThrow();
  });

  it("rejects malformed odds rather than fabricating a neutral probability", () => {
    expect(() => impliedProbabilityFromOdds("american", -50)).toThrow(/american odds/);
    expect(() => impliedProbabilityFromOdds("decimal", 1)).toThrow(/decimal odds/);
  });
});
