import { americanOddsToDecimal } from "./marketMath";

export interface FrozenBinaryMarketDecision {
  decisionId: string;
  marketSeriesId: string;
  selectedOutcomeId: string;
  /** Frozen CCF decision timestamp. */
  frozenAt: string;
  ccfModelVersion: string;
  ccfProbability: number;
  decisionMarketNoVigProbability: number;
  offeredAmericanOdds: number;
  sportsbook: string;
  marketSnapshotId: string;
  marketObservedAt: string;
  marketKnownAt: string;
  marketSource: string;
}

export interface ClosingMarketEvidence {
  observedAt: string;
  knownAt: string;
  source: string;
  closingNoVigProbability: number;
  closingAmericanOdds?: number | null;
}

export interface SettledMarketAudit {
  decisionId: string;
  marketSnapshotId: string;
  outcome: 0 | 1;
  brierScore: number;
  logLoss: number;
  decisionMarketBrierScore: number;
  brierImprovementVsDecisionMarket: number;
  /** Outcome-implied return at the recorded offered price; not proof a wager was placed. */
  selectionReturnPerUnit: number;
  returnBasis: "selection_outcome_only";
  closingProbabilityMove: number | null;
  ccfProbabilityMinusClose: number | null;
  offeredVsClosingDecimalPricePct: number | null;
  closingEvidenceSource: string | null;
  ruleId: "ccf-market-audit.v1";
}

function assertText(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
}

function assertProbability(probability: number, label: string): void {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new Error(`${label} must be strictly between 0 and 1`);
  }
}

function parseInstant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function binaryBrier(probability: number, outcome: 0 | 1): number {
  return (probability - outcome) ** 2;
}

function binaryLogLoss(probability: number, outcome: 0 | 1): number {
  return -(outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability));
}

function validateFrozenDecisionProvenance(decision: FrozenBinaryMarketDecision): number {
  assertText(decision.decisionId, "decisionId");
  assertText(decision.marketSeriesId, "marketSeriesId");
  assertText(decision.selectedOutcomeId, "selectedOutcomeId");
  assertText(decision.ccfModelVersion, "ccfModelVersion");
  assertText(decision.sportsbook, "sportsbook");
  assertText(decision.marketSnapshotId, "marketSnapshotId");
  assertText(decision.marketSource, "marketSource");

  const frozenAtMs = parseInstant(decision.frozenAt, "frozenAt");
  const observedAtMs = parseInstant(decision.marketObservedAt, "marketObservedAt");
  const knownAtMs = parseInstant(decision.marketKnownAt, "marketKnownAt");

  if (knownAtMs < observedAtMs) {
    throw new Error("marketKnownAt cannot predate marketObservedAt");
  }
  if (observedAtMs > frozenAtMs || knownAtMs > frozenAtMs) {
    throw new Error("decision market evidence must be observed and known by frozenAt");
  }

  return frozenAtMs;
}

export function scoreSettledMarketDecision(
  decision: FrozenBinaryMarketDecision,
  outcome: 0 | 1,
  closing: ClosingMarketEvidence | null = null,
): SettledMarketAudit {
  const frozenAtMs = validateFrozenDecisionProvenance(decision);
  assertProbability(decision.ccfProbability, "ccfProbability");
  assertProbability(decision.decisionMarketNoVigProbability, "decisionMarketNoVigProbability");

  const offeredDecimal = americanOddsToDecimal(decision.offeredAmericanOdds);
  const brierScore = binaryBrier(decision.ccfProbability, outcome);
  const decisionMarketBrierScore = binaryBrier(decision.decisionMarketNoVigProbability, outcome);
  const selectionReturnPerUnit = outcome === 1 ? offeredDecimal - 1 : -1;

  let closingProbabilityMove: number | null = null;
  let ccfProbabilityMinusClose: number | null = null;
  let offeredVsClosingDecimalPricePct: number | null = null;
  let closingEvidenceSource: string | null = null;

  if (closing) {
    assertText(closing.source, "closing.source");
    assertProbability(closing.closingNoVigProbability, "closingNoVigProbability");
    const closeObservedAtMs = parseInstant(closing.observedAt, "closing.observedAt");
    const closeKnownAtMs = parseInstant(closing.knownAt, "closing.knownAt");
    if (closeKnownAtMs < closeObservedAtMs) {
      throw new Error("closing knownAt cannot predate closing observedAt");
    }
    if (closeObservedAtMs < frozenAtMs) {
      throw new Error("closing evidence must be observed at or after decision freeze");
    }

    closingProbabilityMove = closing.closingNoVigProbability - decision.decisionMarketNoVigProbability;
    ccfProbabilityMinusClose = decision.ccfProbability - closing.closingNoVigProbability;
    closingEvidenceSource = closing.source;

    if (closing.closingAmericanOdds != null) {
      const closingDecimal = americanOddsToDecimal(closing.closingAmericanOdds);
      offeredVsClosingDecimalPricePct = offeredDecimal / closingDecimal - 1;
    }
  }

  return {
    decisionId: decision.decisionId,
    marketSnapshotId: decision.marketSnapshotId,
    outcome,
    brierScore,
    logLoss: binaryLogLoss(decision.ccfProbability, outcome),
    decisionMarketBrierScore,
    brierImprovementVsDecisionMarket: decisionMarketBrierScore - brierScore,
    selectionReturnPerUnit,
    returnBasis: "selection_outcome_only",
    closingProbabilityMove,
    ccfProbabilityMinusClose,
    offeredVsClosingDecimalPricePct,
    closingEvidenceSource,
    ruleId: "ccf-market-audit.v1",
  };
}
