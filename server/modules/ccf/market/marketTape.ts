import {
  CCFMarketEvidenceError,
  decimalOddsFromOdds,
  normalizeBookMarketSnapshot,
  type CCFBookQuote,
} from "./marketEvidence";

export interface CCFMarketTapeInput {
  marketId: string;
  selectionId: string;
  quotes: readonly CCFBookQuote[];
  /** Frozen decision/reference time. */
  asOf: string;
  maxAgeMinutes: number;
}

export interface CCFMarketTapeQuote {
  bookmaker: string;
  quoteId: string;
  capturedAt: string;
  knownAt: string;
  ageMinutes: number;
  line: number | null;
  oddsFormat: CCFBookQuote["oddsFormat"];
  odds: number;
  decimalOdds: number;
  rawImpliedProbability: number;
  fairProbability: number;
  overround: number;
  stale: boolean;
}

export interface CCFBookMarketTape {
  bookmaker: string;
  observations: number;
  open: CCFMarketTapeQuote;
  current: CCFMarketTapeQuote;
  lineDelta: number | null;
  fairProbabilityDelta: number;
}

export interface CCFMarketTapeSummary {
  marketId: string;
  selectionId: string;
  asOf: string;
  state: "usable" | "partial" | "unavailable";
  books: CCFBookMarketTape[];
  bestUsableQuote: CCFMarketTapeQuote | null;
  currentFairProbabilityRange: { min: number; max: number; spread: number } | null;
  currentLineRange: { min: number; max: number; spread: number } | null;
  invalidSnapshotCount: number;
  staleBookCount: number;
  ruleId: "ccf-market-tape-v1";
}

function parseTime(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFMarketEvidenceError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function snapshotKey(quote: CCFBookQuote): string {
  return `${quote.bookmaker}\u0000${quote.marketId}\u0000${quote.capturedAt}`;
}

export function summarizeCCFMarketTape(input: CCFMarketTapeInput): CCFMarketTapeSummary {
  if (!input.marketId.trim()) throw new CCFMarketEvidenceError("marketId is required");
  if (!input.selectionId.trim()) throw new CCFMarketEvidenceError("selectionId is required");
  if (!Number.isFinite(input.maxAgeMinutes) || input.maxAgeMinutes < 0) {
    throw new CCFMarketEvidenceError("maxAgeMinutes must be a non-negative finite number");
  }

  const asOfMs = parseTime("asOf", input.asOf);
  const grouped = new Map<string, CCFBookQuote[]>();
  for (const quote of input.quotes) {
    if (quote.marketId !== input.marketId) continue;
    const key = snapshotKey(quote);
    const group = grouped.get(key) ?? [];
    group.push(quote);
    grouped.set(key, group);
  }

  const observationsByBook = new Map<string, CCFMarketTapeQuote[]>();
  let invalidSnapshotCount = 0;

  for (const quotes of grouped.values()) {
    try {
      // Vig removal uses the entire mutually-exclusive snapshot, so every quote
      // participating in normalization must itself be point-in-time eligible.
      for (const quote of quotes) {
        const capturedAtMs = parseTime(`${quote.quoteId}.capturedAt`, quote.capturedAt);
        const retrievedAtMs = parseTime(`${quote.quoteId}.retrievedAt`, quote.retrievedAt);
        const knownAtMs = parseTime(`${quote.quoteId}.knownAt`, quote.knownAt);
        if (capturedAtMs > knownAtMs || retrievedAtMs > knownAtMs || knownAtMs > asOfMs) {
          throw new CCFMarketEvidenceError("market snapshot contains point-in-time ineligible quote");
        }
      }

      const normalized = normalizeBookMarketSnapshot(quotes);
      const normalizedSelection = normalized.selections.find(
        (selection) => selection.selectionId === input.selectionId,
      );
      const rawQuote = quotes.find(
        (quote) => quote.selection.selectionId === input.selectionId,
      );
      if (!normalizedSelection || !rawQuote) {
        invalidSnapshotCount += 1;
        continue;
      }

      const knownAtMs = parseTime(`${rawQuote.quoteId}.knownAt`, rawQuote.knownAt);
      const ageMinutes = (asOfMs - knownAtMs) / 60_000;
      const observation: CCFMarketTapeQuote = {
        bookmaker: rawQuote.bookmaker,
        quoteId: rawQuote.quoteId,
        capturedAt: rawQuote.capturedAt,
        knownAt: rawQuote.knownAt,
        ageMinutes,
        line: rawQuote.selection.line,
        oddsFormat: rawQuote.oddsFormat,
        odds: rawQuote.odds,
        decimalOdds: decimalOddsFromOdds(rawQuote.oddsFormat, rawQuote.odds),
        rawImpliedProbability: normalizedSelection.rawImpliedProbability,
        fairProbability: normalizedSelection.fairProbability,
        overround: normalized.overround,
        stale: ageMinutes > input.maxAgeMinutes,
      };

      const history = observationsByBook.get(rawQuote.bookmaker) ?? [];
      history.push(observation);
      observationsByBook.set(rawQuote.bookmaker, history);
    } catch {
      invalidSnapshotCount += 1;
    }
  }

  const books: CCFBookMarketTape[] = [];
  for (const [bookmaker, history] of observationsByBook.entries()) {
    history.sort((left, right) => parseTime("knownAt", left.knownAt) - parseTime("knownAt", right.knownAt));
    const open = history[0];
    const current = history[history.length - 1];
    books.push({
      bookmaker,
      observations: history.length,
      open,
      current,
      lineDelta:
        open.line == null || current.line == null
          ? null
          : current.line - open.line,
      fairProbabilityDelta: current.fairProbability - open.fairProbability,
    });
  }
  books.sort((left, right) => left.bookmaker.localeCompare(right.bookmaker));

  const usableCurrent = books.map((book) => book.current).filter((quote) => !quote.stale);
  const staleBookCount = books.length - usableCurrent.length;
  const bestUsableQuote = usableCurrent.reduce<CCFMarketTapeQuote | null>((best, quote) => {
    if (!best || quote.decimalOdds > best.decimalOdds) return quote;
    return best;
  }, null);

  const probabilities = usableCurrent.map((quote) => quote.fairProbability);
  const currentFairProbabilityRange = probabilities.length > 0
    ? {
        min: Math.min(...probabilities),
        max: Math.max(...probabilities),
        spread: Math.max(...probabilities) - Math.min(...probabilities),
      }
    : null;

  const lines = usableCurrent
    .map((quote) => quote.line)
    .filter((line): line is number => line != null && Number.isFinite(line));
  const currentLineRange = lines.length > 0
    ? {
        min: Math.min(...lines),
        max: Math.max(...lines),
        spread: Math.max(...lines) - Math.min(...lines),
      }
    : null;

  const state = usableCurrent.length === 0
    ? "unavailable"
    : invalidSnapshotCount > 0 || staleBookCount > 0
      ? "partial"
      : "usable";

  return {
    marketId: input.marketId,
    selectionId: input.selectionId,
    asOf: input.asOf,
    state,
    books,
    bestUsableQuote,
    currentFairProbabilityRange,
    currentLineRange,
    invalidSnapshotCount,
    staleBookCount,
    ruleId: "ccf-market-tape-v1",
  };
}
