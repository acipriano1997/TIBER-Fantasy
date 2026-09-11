export type CCFMarketScope = "game" | "team" | "player" | "future";
export type CCFMarketKind =
  | "moneyline"
  | "spread"
  | "total"
  | "team_total"
  | "player_prop"
  | "anytime_td"
  | "multi_td"
  | "alternate"
  | "other";
export type CCFOddsFormat = "american" | "decimal";
export type CCFMarketQuoteStatus = "open" | "suspended" | "closed";

export interface CCFMarketEvent {
  eventId: string;
  sport: string;
  league: string;
  startAt: string;
  homeTeam: string | null;
  awayTeam: string | null;
  participants: string[];
}

export interface CCFMarketSelection {
  selectionId: string;
  label: string;
  entityId: string | null;
  side: string;
  line: number | null;
}

export interface CCFBookQuote {
  quoteId: string;
  bookmaker: string;
  bookmakerMarketId: string | null;
  marketId: string;
  marketKind: CCFMarketKind;
  marketScope: CCFMarketScope;
  /**
   * Number of mutually exclusive selections expected in the complete bookmaker
   * snapshot. May be null for raw evidence whose completeness is not known yet,
   * but fair-probability/vig normalization is blocked until it is known.
   */
  expectedSelectionCount: number | null;
  selection: CCFMarketSelection;
  oddsFormat: CCFOddsFormat;
  odds: number;
  capturedAt: string;
  retrievedAt: string;
  knownAt: string;
  status: CCFMarketQuoteStatus;
  sourceLocator: string | null;
  rawTraceRef: string;
  notes: string[];
}

export interface CCFMarketEvidenceBundle {
  contractVersion: "ccf-market-evidence-v1";
  generatedAt: string;
  asOf: string;
  availability: "available" | "unavailable";
  event: CCFMarketEvent;
  quotes: CCFBookQuote[];
  warnings: string[];
}

export interface CCFNormalizedMarketSelection {
  selectionId: string;
  rawImpliedProbability: number;
  fairProbability: number;
}

export interface CCFNormalizedBookMarket {
  bookmaker: string;
  marketId: string;
  capturedAt: string;
  expectedSelectionCount: number;
  overround: number;
  selections: CCFNormalizedMarketSelection[];
}

export interface CCFMarketMovement {
  bookmaker: string;
  marketId: string;
  selectionId: string;
  previousKnownAt: string;
  currentKnownAt: string;
  lineDelta: number | null;
  impliedProbabilityDelta: number;
  direction: "toward_selection" | "away_from_selection" | "stable";
}

export class CCFMarketEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFMarketEvidenceError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new CCFMarketEvidenceError(`${label} must be a valid timestamp`);
  return parsed;
}

function requireNonEmpty(label: string, value: string): void {
  if (!value.trim()) throw new CCFMarketEvidenceError(`${label} is required`);
}

function validateExpectedSelectionCount(
  label: string,
  value: number | null,
  allowUnknown: boolean,
): void {
  if (value == null) {
    if (!allowUnknown) {
      throw new CCFMarketEvidenceError(`${label} is required before fair-probability normalization`);
    }
    return;
  }
  if (!Number.isInteger(value) || value < 2) {
    throw new CCFMarketEvidenceError(`${label} must be an integer greater than or equal to 2`);
  }
}

export function decimalOddsFromOdds(format: CCFOddsFormat, odds: number): number {
  if (!Number.isFinite(odds)) throw new CCFMarketEvidenceError("odds must be finite");

  if (format === "decimal") {
    if (odds <= 1) throw new CCFMarketEvidenceError("decimal odds must be greater than 1");
    return odds;
  }

  if (odds === 0 || Math.abs(odds) < 100) {
    throw new CCFMarketEvidenceError("american odds must be <= -100 or >= 100");
  }

  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function impliedProbabilityFromOdds(format: CCFOddsFormat, odds: number): number {
  return 1 / decimalOddsFromOdds(format, odds);
}

export function removeProportionalVig(probabilities: number[]): {
  fairProbabilities: number[];
  overround: number;
} {
  if (probabilities.length < 2) {
    throw new CCFMarketEvidenceError("vig removal requires at least two mutually exclusive selections");
  }

  for (const probability of probabilities) {
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      throw new CCFMarketEvidenceError("raw implied probabilities must be finite and inside (0, 1)");
    }
  }

  const total = probabilities.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new CCFMarketEvidenceError("probability total must be positive and finite");
  }

  return {
    fairProbabilities: probabilities.map((probability) => probability / total),
    overround: total - 1,
  };
}

export function normalizeBookMarketSnapshot(quotes: CCFBookQuote[]): CCFNormalizedBookMarket {
  if (quotes.length < 2) {
    throw new CCFMarketEvidenceError("market normalization requires at least two selections");
  }

  const first = quotes[0];
  validateExpectedSelectionCount(
    "expectedSelectionCount",
    first.expectedSelectionCount,
    false,
  );
  const expectedSelectionCount = first.expectedSelectionCount as number;

  if (quotes.length !== expectedSelectionCount) {
    throw new CCFMarketEvidenceError(
      `market normalization requires the complete selection set: expected ${expectedSelectionCount}, received ${quotes.length}`,
    );
  }

  const selectionIds = new Set<string>();

  for (const quote of quotes) {
    if (quote.bookmaker !== first.bookmaker) {
      throw new CCFMarketEvidenceError("market normalization cannot mix bookmakers");
    }
    if (quote.marketId !== first.marketId) {
      throw new CCFMarketEvidenceError("market normalization cannot mix marketIds");
    }
    if (quote.capturedAt !== first.capturedAt) {
      throw new CCFMarketEvidenceError("market normalization requires one capturedAt snapshot");
    }
    if (quote.expectedSelectionCount !== expectedSelectionCount) {
      throw new CCFMarketEvidenceError("market normalization requires one expectedSelectionCount");
    }
    if (quote.status !== "open") {
      throw new CCFMarketEvidenceError("only open quotes may be normalized into a live market snapshot");
    }
    if (selectionIds.has(quote.selection.selectionId)) {
      throw new CCFMarketEvidenceError("market normalization received a duplicate selectionId");
    }
    selectionIds.add(quote.selection.selectionId);
  }

  const rawProbabilities = quotes.map((quote) => impliedProbabilityFromOdds(quote.oddsFormat, quote.odds));
  const normalized = removeProportionalVig(rawProbabilities);

  return {
    bookmaker: first.bookmaker,
    marketId: first.marketId,
    capturedAt: first.capturedAt,
    expectedSelectionCount,
    overround: normalized.overround,
    selections: quotes.map((quote, index) => ({
      selectionId: quote.selection.selectionId,
      rawImpliedProbability: rawProbabilities[index],
      fairProbability: normalized.fairProbabilities[index],
    })),
  };
}

export function compareQuoteMovement(previous: CCFBookQuote, current: CCFBookQuote): CCFMarketMovement {
  if (
    previous.bookmaker !== current.bookmaker ||
    previous.marketId !== current.marketId ||
    previous.selection.selectionId !== current.selection.selectionId
  ) {
    throw new CCFMarketEvidenceError("quote movement requires the same bookmaker, market, and selection");
  }

  const previousKnownAt = parseTimestamp("previous.knownAt", previous.knownAt);
  const currentKnownAt = parseTimestamp("current.knownAt", current.knownAt);
  if (currentKnownAt <= previousKnownAt) {
    throw new CCFMarketEvidenceError("current quote must be known after previous quote");
  }

  const previousProbability = impliedProbabilityFromOdds(previous.oddsFormat, previous.odds);
  const currentProbability = impliedProbabilityFromOdds(current.oddsFormat, current.odds);
  const impliedProbabilityDelta = currentProbability - previousProbability;
  const epsilon = 1e-12;

  return {
    bookmaker: current.bookmaker,
    marketId: current.marketId,
    selectionId: current.selection.selectionId,
    previousKnownAt: previous.knownAt,
    currentKnownAt: current.knownAt,
    lineDelta:
      previous.selection.line == null || current.selection.line == null
        ? null
        : current.selection.line - previous.selection.line,
    impliedProbabilityDelta,
    direction:
      impliedProbabilityDelta > epsilon
        ? "toward_selection"
        : impliedProbabilityDelta < -epsilon
          ? "away_from_selection"
          : "stable",
  };
}

export function validateCCFMarketEvidenceBundle(bundle: CCFMarketEvidenceBundle): CCFMarketEvidenceBundle {
  if (bundle.contractVersion !== "ccf-market-evidence-v1") {
    throw new CCFMarketEvidenceError("unsupported market contractVersion");
  }

  const asOf = parseTimestamp("asOf", bundle.asOf);
  const generatedAt = parseTimestamp("generatedAt", bundle.generatedAt);
  if (generatedAt < asOf) throw new CCFMarketEvidenceError("generatedAt cannot precede asOf");

  parseTimestamp("event.startAt", bundle.event.startAt);
  requireNonEmpty("event.eventId", bundle.event.eventId);
  requireNonEmpty("event.sport", bundle.event.sport);
  requireNonEmpty("event.league", bundle.event.league);

  if (bundle.availability === "available" && bundle.quotes.length === 0) {
    throw new CCFMarketEvidenceError("available market bundle requires at least one quote");
  }
  if (bundle.availability === "unavailable" && bundle.quotes.length !== 0) {
    throw new CCFMarketEvidenceError("unavailable market bundle must not carry quotes");
  }

  const quoteIds = new Set<string>();
  for (const quote of bundle.quotes) {
    requireNonEmpty("quote.quoteId", quote.quoteId);
    requireNonEmpty(`${quote.quoteId}.bookmaker`, quote.bookmaker);
    requireNonEmpty(`${quote.quoteId}.marketId`, quote.marketId);
    requireNonEmpty(`${quote.quoteId}.selection.selectionId`, quote.selection.selectionId);
    requireNonEmpty(`${quote.quoteId}.rawTraceRef`, quote.rawTraceRef);
    validateExpectedSelectionCount(
      `${quote.quoteId}.expectedSelectionCount`,
      quote.expectedSelectionCount,
      true,
    );

    if (quoteIds.has(quote.quoteId)) {
      throw new CCFMarketEvidenceError(`duplicate quoteId ${quote.quoteId}`);
    }
    quoteIds.add(quote.quoteId);

    decimalOddsFromOdds(quote.oddsFormat, quote.odds);
    if (quote.selection.line != null && !Number.isFinite(quote.selection.line)) {
      throw new CCFMarketEvidenceError(`${quote.quoteId}.selection.line must be finite when present`);
    }

    const capturedAt = parseTimestamp(`${quote.quoteId}.capturedAt`, quote.capturedAt);
    const retrievedAt = parseTimestamp(`${quote.quoteId}.retrievedAt`, quote.retrievedAt);
    const knownAt = parseTimestamp(`${quote.quoteId}.knownAt`, quote.knownAt);

    if (retrievedAt < capturedAt) {
      throw new CCFMarketEvidenceError(`${quote.quoteId} retrievedAt cannot predate capturedAt`);
    }
    if (capturedAt > knownAt) {
      throw new CCFMarketEvidenceError(`${quote.quoteId} capturedAt cannot be later than knownAt`);
    }
    if (retrievedAt > knownAt) {
      throw new CCFMarketEvidenceError(`${quote.quoteId} retrievedAt cannot be later than knownAt`);
    }
    if (knownAt > asOf) {
      throw new CCFMarketEvidenceError(`${quote.quoteId} knownAt is later than bundle asOf`);
    }
  }

  return bundle;
}
