import {
  CCFMarketEvidenceError,
  decimalOddsFromOdds,
  type CCFOddsFormat,
} from "./marketEvidence";

function assertProbability(probability: number, label = "probability"): void {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
    throw new CCFMarketEvidenceError(`${label} must be finite and strictly inside (0, 1)`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new CCFMarketEvidenceError(`${label} must be a non-negative finite number`);
  }
}

export function decimalOddsToAmerican(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new CCFMarketEvidenceError("decimal odds must be greater than 1");
  }

  return decimalOdds >= 2
    ? (decimalOdds - 1) * 100
    : -100 / (decimalOdds - 1);
}

export function fairDecimalOddsFromProbability(probability: number): number {
  assertProbability(probability);
  return 1 / probability;
}

export function fairAmericanOddsFromProbability(probability: number): number {
  return decimalOddsToAmerican(fairDecimalOddsFromProbability(probability));
}

export function expectedRoiFromProbability(
  modelProbability: number,
  oddsFormat: CCFOddsFormat,
  offeredOdds: number,
): number {
  assertProbability(modelProbability, "modelProbability");
  return modelProbability * decimalOddsFromOdds(oddsFormat, offeredOdds) - 1;
}

export function expectedValueAtStake(
  stake: number,
  modelProbability: number,
  oddsFormat: CCFOddsFormat,
  offeredOdds: number,
): number {
  assertNonNegativeFinite(stake, "stake");
  return stake * expectedRoiFromProbability(modelProbability, oddsFormat, offeredOdds);
}

export function minimumDecimalOddsForExpectedRoi(
  modelProbability: number,
  minimumExpectedRoi = 0,
): number {
  assertProbability(modelProbability, "modelProbability");
  assertNonNegativeFinite(minimumExpectedRoi, "minimumExpectedRoi");
  return (1 + minimumExpectedRoi) / modelProbability;
}

/**
 * Exact worst acceptable American price for a caller-specified minimum EV/ROI.
 * This is a mathematical threshold, not a betting recommendation.
 */
export function betToAmericanOdds(
  modelProbability: number,
  minimumExpectedRoi = 0,
): number {
  return decimalOddsToAmerican(
    minimumDecimalOddsForExpectedRoi(modelProbability, minimumExpectedRoi),
  );
}
