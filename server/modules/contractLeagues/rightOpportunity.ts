import { contractLeaguePolicySchema } from './policy';
import {
  contractLeagueRightsStateSchema,
  deriveContractRightAvailability,
  type ContractRightType,
  type UsageAllowance,
} from './rights';
import type {
  CapLiquidityCandidate,
  CapLiquidityCandidateResult,
} from './capIntelligence';

export const CONTRACT_RIGHT_OPPORTUNITY_VERSION = 'contract-right-opportunity.v1' as const;

type SupportedRight = 'AMNESTY' | 'RESTRUCTURE';

type CandidateRight = {
  teamKey: string;
  rightType: SupportedRight;
};

export type RightOpportunityResult =
  | {
    status: 'ABSTAIN';
    version: typeof CONTRACT_RIGHT_OPPORTUNITY_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof CONTRACT_RIGHT_OPPORTUNITY_VERSION;
    items: Array<{
      candidateId: string;
      teamKey: string;
      rightType: SupportedRight;
      quantityConsumed: number;
      remainingBefore: number;
      remainingAfter: number;
      consumesLastAvailableRight: boolean;
      alternativeCandidateIds: string[];
      opportunityCost: 'PRESERVES_SOME_CAPACITY' | 'LAST_RIGHT' | 'FORECLOSES_CERTIFIED_ALTERNATIVES';
    }>;
  };

function candidateRight(candidate: CapLiquidityCandidate): CandidateRight | null {
  if (candidate.kind === 'RESTRUCTURE') {
    return { teamKey: candidate.targetTeamKey, rightType: 'RESTRUCTURE' };
  }
  if (candidate.action.type === 'AMNESTY') {
    return { teamKey: candidate.action.teamKey, rightType: 'AMNESTY' };
  }
  return null;
}

function allowanceFor(
  policy: ReturnType<typeof contractLeaguePolicySchema.parse>,
  rightType: SupportedRight,
): UsageAllowance | null {
  if (rightType === 'AMNESTY') {
    return policy.contracts.amnesty.enabled ? policy.contracts.amnesty.allowance : null;
  }
  return policy.contracts.restructure.enabled ? policy.contracts.restructure.allowance : null;
}

/**
 * Adds opportunity-cost context to already-certified single-action candidates.
 * It does not rank football value. Its job is to expose scarce-right depletion
 * and which other certified alternatives depend on the same right.
 */
export function buildScarceRightOpportunityCost(input: {
  leagueKey: string;
  asOfSeason: number;
  policy: unknown;
  rightsState: unknown;
  candidates: CapLiquidityCandidate[];
  results: CapLiquidityCandidateResult[];
}): RightOpportunityResult {
  const policyResult = contractLeaguePolicySchema.safeParse(input.policy);
  if (!policyResult.success) {
    return { status: 'ABSTAIN', version: CONTRACT_RIGHT_OPPORTUNITY_VERSION, reasonCodes: ['POLICY_INVALID'], details: ['Contract policy failed schema validation.'] };
  }
  const rightsResult = contractLeagueRightsStateSchema.safeParse(input.rightsState);
  if (!rightsResult.success) {
    return { status: 'ABSTAIN', version: CONTRACT_RIGHT_OPPORTUNITY_VERSION, reasonCodes: ['RIGHTS_STATE_INVALID'], details: ['Contract rights state failed schema validation.'] };
  }
  const policy = policyResult.data;
  const rights = rightsResult.data;
  const reasons: Array<{ code: string; detail: string }> = [];
  if (policy.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Scarce-right opportunity cost requires a VALID policy.' });
  if (rights.validation.status !== 'VALID') reasons.push({ code: 'RIGHTS_STATE_NOT_DECISION_READY', detail: 'Scarce-right opportunity cost requires VALID rights state.' });
  if (rights.leagueKey !== input.leagueKey.trim()) reasons.push({ code: 'RIGHTS_LEAGUE_MISMATCH', detail: 'Rights state belongs to a different internal league.' });
  if (!Number.isInteger(input.asOfSeason) || input.asOfSeason < 2000 || input.asOfSeason > 2200) reasons.push({ code: 'AS_OF_SEASON_INVALID', detail: 'asOfSeason must be a calendar season.' });
  if (reasons.length) {
    return {
      status: 'ABSTAIN',
      version: CONTRACT_RIGHT_OPPORTUNITY_VERSION,
      reasonCodes: [...new Set(reasons.map((item) => item.code))],
      details: reasons.map((item) => item.detail),
    };
  }

  const resultById = new Map(input.results.map((result) => [result.candidateId, result]));
  const mapped = input.candidates.flatMap((candidate) => {
    const right = candidateRight(candidate);
    const result = resultById.get(candidate.candidateId);
    if (!right || !result || result.status !== 'READY' || result.rightsConsumed <= 0) return [];
    return [{ candidate, result, right }];
  });

  const items = mapped.flatMap(({ candidate, result, right }) => {
    const allowance = allowanceFor(policy, right.rightType);
    if (!allowance) return [];
    const availability = deriveContractRightAvailability(
      rights,
      { teamKey: right.teamKey, rightType: right.rightType as ContractRightType },
      allowance,
      input.asOfSeason,
    );
    const remainingAfter = Math.max(0, availability.remaining - result.rightsConsumed);
    const alternatives = mapped
      .filter((other) => other.candidate.candidateId !== candidate.candidateId
        && other.right.teamKey === right.teamKey
        && other.right.rightType === right.rightType)
      .map((other) => other.candidate.candidateId)
      .sort();
    const consumesLastAvailableRight = remainingAfter === 0;
    return [{
      candidateId: candidate.candidateId,
      teamKey: right.teamKey,
      rightType: right.rightType,
      quantityConsumed: result.rightsConsumed,
      remainingBefore: availability.remaining,
      remainingAfter,
      consumesLastAvailableRight,
      alternativeCandidateIds: alternatives,
      opportunityCost: consumesLastAvailableRight
        ? alternatives.length > 0 ? 'FORECLOSES_CERTIFIED_ALTERNATIVES' as const : 'LAST_RIGHT' as const
        : 'PRESERVES_SOME_CAPACITY' as const,
    }];
  });

  return {
    status: 'READY',
    version: CONTRACT_RIGHT_OPPORTUNITY_VERSION,
    items,
  };
}
