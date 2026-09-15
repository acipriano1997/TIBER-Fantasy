import type {
  CapHealthResult,
  CapLiquidityCandidateResult,
} from './capIntelligence';
import type { RightOpportunityResult } from './rightOpportunity';

export const CONTRACT_BRANCH_IMPACT_VERSION = 'contract-branch-impact.v1' as const;

export type FutureCapCommitment = {
  commitmentId: string;
  label: string;
  season: number;
  minimumRemainingCapRoom: number;
};

export type ContractBranchImpactResult =
  | {
    status: 'UNAVAILABLE';
    version: typeof CONTRACT_BRANCH_IMPACT_VERSION;
    reasonCode: string;
    detail: string;
  }
  | {
    status: 'READY';
    version: typeof CONTRACT_BRANCH_IMPACT_VERSION;
    candidateId: string;
    capCommitments: Array<{
      commitmentId: string;
      label: string;
      season: number;
      baselineCapRemaining: number;
      actionCapRoomDelta: number;
      postActionCapRemaining: number;
      minimumRemainingCapRoom: number;
      marginAfterCommitment: number;
      status: 'PRESERVED' | 'AT_RISK';
    }>;
    scarceRightImpact: {
      rightType: 'AMNESTY' | 'RESTRUCTURE';
      remainingBefore: number;
      remainingAfter: number;
      consumesLastAvailableRight: boolean;
      alternativeCandidateIds: string[];
      opportunityCost: 'PRESERVES_SOME_CAPACITY' | 'LAST_RIGHT' | 'FORECLOSES_CERTIFIED_ALTERNATIVES';
    } | null;
    scopeNote: string;
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

/**
 * Explains explicit future cap/rights branches weakened by one already-certified
 * action. It does not infer extension prices or simulate a second move.
 */
export function buildSingleActionBranchImpact(input: {
  capHealth: CapHealthResult;
  candidate: CapLiquidityCandidateResult;
  commitments?: FutureCapCommitment[];
  rightOpportunity?: RightOpportunityResult | null;
}): ContractBranchImpactResult {
  if (input.capHealth.status !== 'READY') {
    return {
      status: 'UNAVAILABLE',
      version: CONTRACT_BRANCH_IMPACT_VERSION,
      reasonCode: 'CAP_HEALTH_UNAVAILABLE',
      detail: 'Branch impact requires READY multi-year cap health.',
    };
  }
  if (input.candidate.status !== 'READY') {
    return {
      status: 'UNAVAILABLE',
      version: CONTRACT_BRANCH_IMPACT_VERSION,
      reasonCode: 'CANDIDATE_NOT_CERTIFIED',
      detail: 'Branch impact only evaluates a READY certified single-action candidate.',
    };
  }

  const capCommitments = (input.commitments ?? []).map((commitment) => {
    const baseline = input.capHealth.status === 'READY'
      ? input.capHealth.seasons.find((season) => season.season === commitment.season)
      : null;
    if (!baseline) return null;
    const delta = input.candidate.reliefBySeason.find((item) => item.season === commitment.season)?.capRoomDelta ?? 0;
    const postActionCapRemaining = money(baseline.sourceCapRemaining + delta);
    const marginAfterCommitment = money(postActionCapRemaining - commitment.minimumRemainingCapRoom);
    return {
      commitmentId: commitment.commitmentId,
      label: commitment.label,
      season: commitment.season,
      baselineCapRemaining: baseline.sourceCapRemaining,
      actionCapRoomDelta: money(delta),
      postActionCapRemaining,
      minimumRemainingCapRoom: money(commitment.minimumRemainingCapRoom),
      marginAfterCommitment,
      status: marginAfterCommitment >= -0.000001 ? 'PRESERVED' as const : 'AT_RISK' as const,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const rightItem = input.rightOpportunity?.status === 'READY'
    ? input.rightOpportunity.items.find((item) => item.candidateId === input.candidate.candidateId) ?? null
    : null;
  const scarceRightImpact = rightItem ? {
    rightType: rightItem.rightType,
    remainingBefore: rightItem.remainingBefore,
    remainingAfter: rightItem.remainingAfter,
    consumesLastAvailableRight: rightItem.consumesLastAvailableRight,
    alternativeCandidateIds: rightItem.alternativeCandidateIds,
    opportunityCost: rightItem.opportunityCost,
  } : null;

  return {
    status: 'READY',
    version: CONTRACT_BRANCH_IMPACT_VERSION,
    candidateId: input.candidate.candidateId,
    capCommitments,
    scarceRightImpact,
    scopeNote: 'This view proves single-action cap-room and scarce-right consequences only. Full multi-action branch closure remains gated on certified hypothetical state sequencing.',
  };
}
