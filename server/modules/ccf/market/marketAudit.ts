import {
  decimalOddsFromOdds,
  type CCFOddsFormat,
} from "./marketEvidence";

export interface FrozenBinaryMarketDecision {
  decisionId: string;
  marketId: string;
  selectedOutcomeId: string;
  /** Frozen CCF decision timestamp. */
  frozenAt: string;
  ccfModelVersion: string;
  ccfProbability: number;
  decisionMarketFairProbability: number;
  offeredOddsFormat: CCFOddsFormat;
  offeredOdds: number;
  bookmaker: string;
  marketQuoteId: string;
  marketCapturedAt: string;
  marketKnownAt: string;
  marketRawTraceRef: string;
}

export interface ClosingMarketEvidence {
  capturedAt: string;
  knownAt: string;
  rawTraceRef: string;
  closingFairProbability: number;
  closingOddsFormat?: CCFOddsFormat | null;
  closingOdds?: number | null;
}

export interface SettledMarketAudit {
  decisionId: string;
  marketQuoteId: string;
  outcome: 0 | 1;
  brierScore: number;
  logLoss: number;
  decisionMarketBrierScore: number;
  brierImprovementVsDecisionMarket: number;
  /** Outcome-implied return at the frozen offered price; not proof a wager was placed. */
  selectionReturnPerUnit: number;
  returnBasis: "selection_outcome_only";
  closingProbabilityMove: number | null;
  ccfProbabilityMinusClose: number | null;
  offeredVsClosingDecimalPricePct: number | null;
  closingRawTraceRef: string | null;
  ruleId: "ccf-market-audit-v1";
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
  assertText(decision.marketId, "marketId");
  assertText(decision.selectedOutcomeId, "selectedOutcomeId");
  assertText(decision.ccfModelVersion, "ccfModelVersion");
  assertText(decision.bookmaker, "bookmaker");
  assertText(decision.marketQuoteId, "marketQuoteId");
  assertText(decision.marketRawTraceRef, "marketRawTraceRef");

  const frozenAtMs = parseInstant(decision.frozenAt, "frozenAt");
  const capturedAtMs = parseInstant(decision.marketCapturedAt, "marketCapturedAt");
  const knownAtMs = parseInstant(decision.marketKnownAt, "marketKnownAt");

  if (knownAtMs < capturedAtMs) {
    throw new Error("marketKnownAt cannot predate marketCapturedAt");
  }
  if (capturedAtMs > frozenAtMs || knownAtMs > frozenAtMs) {
    throw new Error("decision market evidence must be captured and known by frozenAt");
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
  assertProbability(decision.decisionMarketFairProbability, "decisionMarketFairProbability");

  const offeredDecimal = decimalOddsFromOdds(decision.offeredOddsFormat, decision.offeredOdds);
  const brierScore = binaryBrier(decision.ccfProbability, outcome);
  const decisionMarketBrierScore = binaryBrier(decision.decisionMarketFairProbability, outcome);
  const selectionReturnPerUnit = outcome === 1 ? offeredDecimal - 1 : -1;

  let closingProbabilityMove: number | null = null;
  let ccfProbabilityMinusClose: number | null = null;
  let offeredVsClosingDecimalPricePct: number | null = null;
  let closingRawTraceRef: string | null = null;

  if (closing) {
    assertText(closing.rawTraceRef, "closing.rawTraceRef");
    assertProbability(closing.closingFairProbability, "closingFairProbability");
    const closeCapturedAtMs = parseInstant(closing.capturedAt, "closing.capturedAt");
    const closeKnownAtMs = parseInstant(closing.knownAt, "closing.knownAt");
    if (closeKnownAtMs < closeCapturedAtMs) {
      throw new Error("closing knownAt cannot predate closing capturedAt");
    }
    if (closeCapturedAtMs < frozenAtMs) {
      throw new Error("closing evidence must be captured at or after decision freeze");
    }

    closingProbabilityMove = closing.closingFairProbability - decision.decisionMarketFairProbability;
    ccfProbabilityMinusClose = decision.ccfProbability - closing.closingFairProbability;
    closingRawTraceRef = closing.rawTraceRef;

    if (closing.closingOdds != null || closing.closingOddsFormat != null) {
      if (closing.closingOdds == null || closing.closingOddsFormat == null) {
        throw new Error("closing odds and closing odds format must be supplied together");
      }
      const closingDecimal = decimalOddsFromOdds(closing.closingOddsFormat, closing.closingOdds);
      offeredVsClosingDecimalPricePct = offeredDecimal / closingDecimal - 1;
    }
  }

  return {
    decisionId: decision.decisionId,
    marketQuoteId: decision.marketQuoteId,
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
    closingRawTraceRef,
    ruleId: "ccf-market-audit-v1",
  };
}
