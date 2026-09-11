import {
  americanOddsToDecimal,
  removeTwoWayVig,
} from "./marketMath";
import type { TwoWayMarketSnapshot } from "./marketEvidence";

export interface MarketTapeInput {
  /** Stable normalized series identity supplied by the provider-normalization layer. */
  marketSeriesId: string;
  snapshots: readonly TwoWayMarketSnapshot[];
  selectedOutcomeId: string;
  /** Explicit frozen decision/reference time. */
  asOf: Date;
  maxAgeMinutes: number;
}

export interface MarketTapeBookQuote {
  sportsbook: string;
  provider: string;
  source: string;
  snapshotId: string;
  marketId: string;
  observedAt: string;
  knownAt: string;
  ageMinutes: number;
  knownAgeMinutes: number;
  line: number | null;
  americanOdds: number;
  decimalOdds: number;
  noVigProbability: number;
  hold: number;
  stale: boolean;
}

export interface MarketTapeSummary {
  marketSeriesId: string;
  selectedOutcomeId: string;
  asOf: string;
  state: "usable" | "partial" | "unavailable";
  latestBySportsbook: MarketTapeBookQuote[];
  bestUsableQuote: MarketTapeBookQuote | null;
  noVigProbabilityRange: {
    min: number;
    max: number;
    spread: number;
  } | null;
  lineRange: {
    min: number;
    max: number;
    spread: number;
  } | null;
  invalidSnapshotCount: number;
  staleSportsbookCount: number;
  ruleId: "ccf-market-tape.v1";
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function parseSnapshot(
  snapshot: TwoWayMarketSnapshot,
  selectedOutcomeId: string,
  maxAgeMinutes: number,
  asOf: Date,
): MarketTapeBookQuote | null {
  if (
    !hasText(snapshot.snapshotId) ||
    !hasText(snapshot.marketId) ||
    !hasText(snapshot.targetId) ||
    !hasText(snapshot.provider) ||
    !hasText(snapshot.sportsbook) ||
    !hasText(snapshot.source)
  ) {
    return null;
  }

  if (
    snapshot.marketKind !== "moneyline" &&
    (snapshot.line == null || !Number.isFinite(snapshot.line))
  ) {
    return null;
  }
  if (snapshot.line != null && !Number.isFinite(snapshot.line)) return null;

  const observedAtMs = Date.parse(snapshot.observedAt);
  const knownAtMs = Date.parse(snapshot.knownAt);
  const asOfMs = asOf.getTime();
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(knownAtMs) || !Number.isFinite(asOfMs)) {
    return null;
  }
  if (observedAtMs > asOfMs || knownAtMs > asOfMs || knownAtMs < observedAtMs) {
    return null;
  }

  const ageMinutes = (asOfMs - observedAtMs) / 60_000;
  const knownAgeMinutes = (asOfMs - knownAtMs) / 60_000;
  const [first, second] = snapshot.outcomes;
  if (
    !first?.outcomeId.trim() ||
    !second?.outcomeId.trim() ||
    first.outcomeId === second.outcomeId
  ) {
    return null;
  }

  const selectedIndex = first.outcomeId === selectedOutcomeId
    ? 0
    : second.outcomeId === selectedOutcomeId
      ? 1
      : -1;
  if (selectedIndex < 0) return null;

  try {
    const noVig = removeTwoWayVig(first.americanOdds, second.americanOdds);
    const selected = selectedIndex === 0 ? first : second;
    const noVigProbability = selectedIndex === 0
      ? noVig.firstNoVigProbability
      : noVig.secondNoVigProbability;

    return {
      sportsbook: snapshot.sportsbook,
      provider: snapshot.provider,
      source: snapshot.source,
      snapshotId: snapshot.snapshotId,
      marketId: snapshot.marketId,
      observedAt: snapshot.observedAt,
      knownAt: snapshot.knownAt,
      ageMinutes,
      knownAgeMinutes,
      line: snapshot.line ?? null,
      americanOdds: selected.americanOdds,
      decimalOdds: americanOddsToDecimal(selected.americanOdds),
      noVigProbability,
      hold: noVig.hold,
      stale: ageMinutes > maxAgeMinutes,
    };
  } catch {
    return null;
  }
}

export function summarizeMarketTape(input: MarketTapeInput): MarketTapeSummary {
  if (!input.marketSeriesId.trim()) throw new Error("marketSeriesId is required");
  if (!input.selectedOutcomeId.trim()) throw new Error("selectedOutcomeId is required");
  if (!Number.isFinite(input.maxAgeMinutes) || input.maxAgeMinutes < 0) {
    throw new Error("maxAgeMinutes must be a non-negative finite number");
  }
  if (!Number.isFinite(input.asOf.getTime())) {
    throw new Error("asOf must be a valid Date");
  }

  const latestBySportsbook = new Map<string, MarketTapeBookQuote>();
  let invalidSnapshotCount = 0;

  for (const snapshot of input.snapshots) {
    const quote = parseSnapshot(snapshot, input.selectedOutcomeId, input.maxAgeMinutes, input.asOf);
    if (!quote) {
      invalidSnapshotCount += 1;
      continue;
    }

    const previous = latestBySportsbook.get(quote.sportsbook);
    if (
      !previous ||
      Date.parse(quote.observedAt) > Date.parse(previous.observedAt) ||
      (
        Date.parse(quote.observedAt) === Date.parse(previous.observedAt) &&
        Date.parse(quote.knownAt) > Date.parse(previous.knownAt)
      )
    ) {
      latestBySportsbook.set(quote.sportsbook, quote);
    }
  }

  const latest = [...latestBySportsbook.values()].sort((left, right) =>
    left.sportsbook.localeCompare(right.sportsbook),
  );
  const usable = latest.filter((quote) => !quote.stale);
  const staleSportsbookCount = latest.length - usable.length;

  const bestUsableQuote = usable.reduce<MarketTapeBookQuote | null>((best, quote) => {
    if (!best || quote.decimalOdds > best.decimalOdds) return quote;
    return best;
  }, null);

  const probabilities = usable.map((quote) => quote.noVigProbability);
  const noVigProbabilityRange = probabilities.length > 0
    ? {
        min: Math.min(...probabilities),
        max: Math.max(...probabilities),
        spread: Math.max(...probabilities) - Math.min(...probabilities),
      }
    : null;

  const lines = usable
    .map((quote) => quote.line)
    .filter((line): line is number => line != null && Number.isFinite(line));
  const lineRange = lines.length > 0
    ? {
        min: Math.min(...lines),
        max: Math.max(...lines),
        spread: Math.max(...lines) - Math.min(...lines),
      }
    : null;

  const state = usable.length === 0
    ? "unavailable"
    : invalidSnapshotCount > 0 || staleSportsbookCount > 0
      ? "partial"
      : "usable";

  return {
    marketSeriesId: input.marketSeriesId,
    selectedOutcomeId: input.selectedOutcomeId,
    asOf: input.asOf.toISOString(),
    state,
    latestBySportsbook: latest,
    bestUsableQuote,
    noVigProbabilityRange,
    lineRange,
    invalidSnapshotCount,
    staleSportsbookCount,
    ruleId: "ccf-market-tape.v1",
  };
}
