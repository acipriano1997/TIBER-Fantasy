import {
  type NewsEvidenceEvent,
  shouldTriggerCcfReevaluation,
} from '../data/newsIntelligence';

export interface OpportunityResegmentationCandidate {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  depthOrder: number;
  depthSource: string;
  depthConfidence: number | null;
  effectiveDate: string;
}

export interface OpportunityResegmentationRequest {
  schemaVersion: 'opportunity-resegmentation.v0';
  triggerEventId: string;
  asOf: string;
  state: 'READY' | 'PARTIAL' | 'BLOCKED';
  blockers: string[];
  injuredPlayer: {
    playerId: string;
    playerName: string;
    team: string;
    position: string;
    depthOrder: number | null;
  };
  candidates: OpportunityResegmentationCandidate[];
  dependencyTags: [
    'role/usage',
    'projection/recompute',
    'lineup/reevaluate',
    'waiver/reevaluate',
    'tail-risk/reevaluate',
  ];
  directMutationAllowed: false;
}

export interface OpportunityResegmentationContext {
  playerId: string;
  playerName: string;
  team: string;
  position: string;
  depthOrder: number | null;
}

export function buildOpportunityResegmentationRequest(
  event: NewsEvidenceEvent,
  injured: OpportunityResegmentationContext,
  candidates: OpportunityResegmentationCandidate[],
  asOf: string,
): OpportunityResegmentationRequest | null {
  if (event.family !== 'INJURY' || !shouldTriggerCcfReevaluation(event)) {
    return null;
  }

  const blockers: string[] = [];
  if (!injured.team) blockers.push('injured_player_team_missing');
  if (!injured.position) blockers.push('injured_player_position_missing');
  if (injured.depthOrder === null) blockers.push('injured_player_depth_order_missing');
  if (candidates.length === 0) blockers.push('no_depth_chart_beneficiary_resolved');

  const state =
    blockers.length === 0
      ? 'READY'
      : candidates.length > 0
        ? 'PARTIAL'
        : 'BLOCKED';

  return {
    schemaVersion: 'opportunity-resegmentation.v0',
    triggerEventId: event.eventId,
    asOf,
    state,
    blockers,
    injuredPlayer: {
      playerId: injured.playerId,
      playerName: injured.playerName,
      team: injured.team,
      position: injured.position,
      depthOrder: injured.depthOrder,
    },
    candidates,
    dependencyTags: [
      'role/usage',
      'projection/recompute',
      'lineup/reevaluate',
      'waiver/reevaluate',
      'tail-risk/reevaluate',
    ],
    directMutationAllowed: false,
  };
}
