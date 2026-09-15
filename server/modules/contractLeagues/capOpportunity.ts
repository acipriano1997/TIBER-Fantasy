import type { ContractValueComparisonResult } from './contractValue';

export const CAP_OPPORTUNITY_FRONTIER_VERSION = 'contract-cap-opportunity-frontier.v1' as const;

export type CapOpportunityFrontierResult =
  | {
    status: 'UNAVAILABLE';
    version: typeof CAP_OPPORTUNITY_FRONTIER_VERSION;
    reasonCode: string;
    detail: string;
  }
  | {
    status: 'READY';
    version: typeof CAP_OPPORTUNITY_FRONTIER_VERSION;
    availableCap: number;
    pricedCandidateCount: number;
    unpricedCandidateIds: string[];
    affordable: Array<{
      canonicalPlayerId: string;
      acquisitionPrice: number;
      rosterMarginalValue: number;
      metricId: string;
      marginalValuePerCapUnit: number | null;
      capRemainingAfterAcquisition: number;
    }>;
    nextUnlocks: Array<{
      canonicalPlayerId: string;
      acquisitionPrice: number;
      extraCapRequired: number;
      rosterMarginalValue: number;
      metricId: string;
      marginalValuePerAdditionalCapRequired: number | null;
    }>;
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

/**
 * Describes what current or additional cap can buy from the frozen replacement
 * frontier. It does not convert cap into a universal fantasy-points currency.
 */
export function buildCapOpportunityFrontier(
  valueComparison: ContractValueComparisonResult,
  availableCap: number,
): CapOpportunityFrontierResult {
  if (valueComparison.status !== 'READY') {
    return {
      status: 'UNAVAILABLE',
      version: CAP_OPPORTUNITY_FRONTIER_VERSION,
      reasonCode: 'CONTRACT_VALUE_COMPARISON_UNAVAILABLE',
      detail: 'Cap opportunity frontier requires a READY contract-value comparison.',
    };
  }
  if (!Number.isFinite(availableCap) || availableCap < 0) {
    return {
      status: 'UNAVAILABLE',
      version: CAP_OPPORTUNITY_FRONTIER_VERSION,
      reasonCode: 'AVAILABLE_CAP_INVALID',
      detail: 'Available cap must be a finite non-negative amount.',
    };
  }

  const unpricedCandidateIds = valueComparison.replacementFrontier
    .filter((candidate) => candidate.marketAcquisitionPrice === null)
    .map((candidate) => candidate.canonicalPlayerId)
    .sort();
  const priced = valueComparison.replacementFrontier.filter(
    (candidate): candidate is typeof candidate & { marketAcquisitionPrice: number } => candidate.marketAcquisitionPrice !== null,
  );

  if (priced.length === 0) {
    return {
      status: 'UNAVAILABLE',
      version: CAP_OPPORTUNITY_FRONTIER_VERSION,
      reasonCode: 'PRICED_REPLACEMENT_FRONTIER_UNAVAILABLE',
      detail: 'No replacement candidate has point-in-time market acquisition-price evidence; cap usefulness cannot be priced without guessing.',
    };
  }

  const affordable = priced
    .filter((candidate) => candidate.marketAcquisitionPrice <= availableCap + 0.000001)
    .map((candidate) => ({
      canonicalPlayerId: candidate.canonicalPlayerId,
      acquisitionPrice: money(candidate.marketAcquisitionPrice),
      rosterMarginalValue: candidate.rosterMarginalValue,
      metricId: candidate.metricId,
      marginalValuePerCapUnit: candidate.marketAcquisitionPrice > 0
        ? money(candidate.rosterMarginalValue / candidate.marketAcquisitionPrice)
        : null,
      capRemainingAfterAcquisition: money(availableCap - candidate.marketAcquisitionPrice),
    }))
    .sort((a, b) => {
      if (a.metricId === b.metricId) return b.rosterMarginalValue - a.rosterMarginalValue;
      return a.metricId.localeCompare(b.metricId);
    });

  const nextUnlocks = priced
    .filter((candidate) => candidate.marketAcquisitionPrice > availableCap + 0.000001)
    .map((candidate) => {
      const extraCapRequired = money(candidate.marketAcquisitionPrice - availableCap);
      return {
        canonicalPlayerId: candidate.canonicalPlayerId,
        acquisitionPrice: money(candidate.marketAcquisitionPrice),
        extraCapRequired,
        rosterMarginalValue: candidate.rosterMarginalValue,
        metricId: candidate.metricId,
        marginalValuePerAdditionalCapRequired: extraCapRequired > 0
          ? money(candidate.rosterMarginalValue / extraCapRequired)
          : null,
      };
    })
    .sort((a, b) => a.extraCapRequired - b.extraCapRequired
      || (a.metricId === b.metricId ? b.rosterMarginalValue - a.rosterMarginalValue : a.metricId.localeCompare(b.metricId)));

  return {
    status: 'READY',
    version: CAP_OPPORTUNITY_FRONTIER_VERSION,
    availableCap: money(availableCap),
    pricedCandidateCount: priced.length,
    unpricedCandidateIds,
    affordable,
    nextUnlocks,
  };
}
