import type {
  CapHealthResult,
  CapLiquidityCandidateResult,
} from './capIntelligence';

export const COMPLIANCE_RESCUE_VERSION = 'contract-compliance-rescue.v1' as const;

export type ComplianceRescueResult =
  | {
    status: 'UNAVAILABLE';
    version: typeof COMPLIANCE_RESCUE_VERSION;
    reasonCode: string;
    detail: string;
  }
  | {
    status: 'NOT_REQUIRED';
    version: typeof COMPLIANCE_RESCUE_VERSION;
    detail: string;
  }
  | {
    status: 'READY';
    version: typeof COMPLIANCE_RESCUE_VERSION;
    scope: 'SINGLE_ACTION_CURRENT_ENFORCEMENT';
    violationRuleIds: string[];
    options: Array<{
      candidateId: string;
      kind: CapLiquidityCandidateResult['kind'];
      currentSeasonRelief: number;
      totalPositiveRelief: number;
      rightsConsumed: number;
      sourceFingerprint: string;
    }>;
    scopeNote: string;
  }
  | {
    status: 'MULTI_ACTION_GATED';
    version: typeof COMPLIANCE_RESCUE_VERSION;
    violationRuleIds: string[];
    reasonCode: 'HYPOTHETICAL_BRANCH_STATE_REQUIRED';
    detail: string;
  };

/**
 * Finds single actions already certified legal by their owning deterministic
 * engine that resolve an active TRANSACTION_TIME/CONTINUOUS cap violation.
 * Multi-action rescue remains gated until action sequencing has branch state.
 */
export function findCertifiedSingleActionComplianceRescue(
  capHealth: CapHealthResult,
  currentSeason: number,
  candidates: CapLiquidityCandidateResult[],
): ComplianceRescueResult {
  if (capHealth.status !== 'READY') {
    return {
      status: 'UNAVAILABLE',
      version: COMPLIANCE_RESCUE_VERSION,
      reasonCode: 'CAP_HEALTH_UNAVAILABLE',
      detail: 'Compliance rescue requires READY multi-year cap health.',
    };
  }
  if (!Number.isInteger(currentSeason) || currentSeason < 2000 || currentSeason > 2200) {
    return {
      status: 'UNAVAILABLE',
      version: COMPLIANCE_RESCUE_VERSION,
      reasonCode: 'CURRENT_SEASON_INVALID',
      detail: 'Compliance rescue requires an explicit current calendar season.',
    };
  }
  const current = capHealth.seasons.find((season) => season.season === currentSeason) ?? null;
  if (!current) {
    return {
      status: 'UNAVAILABLE',
      version: COMPLIANCE_RESCUE_VERSION,
      reasonCode: 'CURRENT_CAP_SEASON_UNAVAILABLE',
      detail: 'No cap-health row exists for the explicit current season.',
    };
  }
  const activeViolationRules = current.compliance.filter((rule) =>
    rule.status === 'VIOLATION'
    && !rule.overCeilingAllowed
    && (rule.enforcement === 'TRANSACTION_TIME' || rule.enforcement === 'CONTINUOUS'));
  if (activeViolationRules.length === 0) {
    return {
      status: 'NOT_REQUIRED',
      version: COMPLIANCE_RESCUE_VERSION,
      detail: 'No current hard cap violation enforced at transaction time or continuously is present.',
    };
  }

  const options = candidates
    .filter((candidate) => candidate.status === 'READY'
      && candidate.currentSeasonRelief !== null
      && candidate.currentSeasonRelief > 0.000001)
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      kind: candidate.kind,
      currentSeasonRelief: candidate.currentSeasonRelief as number,
      totalPositiveRelief: candidate.totalPositiveRelief,
      rightsConsumed: candidate.rightsConsumed,
      sourceFingerprint: candidate.sourceFingerprint,
    }))
    .sort((a, b) => b.currentSeasonRelief - a.currentSeasonRelief
      || a.rightsConsumed - b.rightsConsumed
      || a.candidateId.localeCompare(b.candidateId));

  const violationRuleIds = activeViolationRules.map((rule) => rule.ruleId).sort();
  if (options.length === 0) {
    return {
      status: 'MULTI_ACTION_GATED',
      version: COMPLIANCE_RESCUE_VERSION,
      violationRuleIds,
      reasonCode: 'HYPOTHETICAL_BRANCH_STATE_REQUIRED',
      detail: 'No supplied single action is certified as a current compliance rescue. Multi-action combinations require sequential hypothetical branch state and must not be inferred by adding independent deltas.',
    };
  }

  return {
    status: 'READY',
    version: COMPLIANCE_RESCUE_VERSION,
    scope: 'SINGLE_ACTION_CURRENT_ENFORCEMENT',
    violationRuleIds,
    options,
    scopeNote: 'These options are certified single-action rescues only. CCF has not yet ranked football/economic regret, and multi-action plans remain gated.',
  };
}
