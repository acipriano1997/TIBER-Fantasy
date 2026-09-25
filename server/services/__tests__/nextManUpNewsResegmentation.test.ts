import {
  buildOpportunityResegmentationRequest,
  type OpportunityResegmentationCandidate,
  type OpportunityResegmentationContext,
} from '../nextManUpService';
import type { NewsEvidenceEvent } from '../../data/newsIntelligence';

function makeInjuryEvent(
  overrides: Partial<NewsEvidenceEvent> = {},
): NewsEvidenceEvent {
  return {
    eventId: 'injury-event-1',
    schemaVersion: 'news-intel-v0',
    family: 'INJURY',
    playerIds: ['player-1'],
    teamIds: ['DET'],
    source: {
      sourceId: 'nflverse-injuries',
      sourceClass: 'official-report-derived-dataset',
      sourceRole: 'primary-injury-state',
      sourceAncestryId: 'root-1',
    },
    retrievedAt: '2026-09-25T16:00:00.000Z',
    knownAt: '2026-09-25T16:00:00.000Z',
    evidenceState: 'CURRENT',
    confirmation: 'CONFIRMED_OFFICIAL',
    recordQuality: 'DECISION_GRADE',
    materiality: 'M3',
    replayEligible: true,
    ...overrides,
  };
}

const injured: OpportunityResegmentationContext = {
  playerId: 'player-1',
  playerName: 'Injured Starter',
  team: 'DET',
  position: 'WR',
  depthOrder: 1,
};

const candidates: OpportunityResegmentationCandidate[] = [
  {
    playerId: 'player-2',
    playerName: 'Next Receiver',
    team: 'DET',
    position: 'WR',
    depthOrder: 2,
    depthSource: 'sleeper',
    depthConfidence: 0.9,
    effectiveDate: '2026-09-24T12:00:00.000Z',
  },
];

test('decision-grade material injury creates a non-destructive opportunity resegmentation request', () => {
  const request = buildOpportunityResegmentationRequest(
    makeInjuryEvent(),
    injured,
    candidates,
    '2026-09-25T16:05:00.000Z',
  );

  expect(request).not.toBeNull();
  expect(request?.state).toBe('READY');
  expect(request?.candidates).toEqual(candidates);
  expect(request?.dependencyTags).toEqual([
    'role/usage',
    'projection/recompute',
    'lineup/reevaluate',
    'waiver/reevaluate',
    'tail-risk/reevaluate',
  ]);
  expect(request?.directMutationAllowed).toBe(false);
});

test('raw, stale, or low-materiality injury evidence cannot create a resegmentation request', () => {
  expect(
    buildOpportunityResegmentationRequest(
      makeInjuryEvent({ recordQuality: 'RAW' }),
      injured,
      candidates,
      '2026-09-25T16:05:00.000Z',
    ),
  ).toBeNull();

  expect(
    buildOpportunityResegmentationRequest(
      makeInjuryEvent({ evidenceState: 'STALE' }),
      injured,
      candidates,
      '2026-09-25T16:05:00.000Z',
    ),
  ).toBeNull();

  expect(
    buildOpportunityResegmentationRequest(
      makeInjuryEvent({ materiality: 'M1' }),
      injured,
      candidates,
      '2026-09-25T16:05:00.000Z',
    ),
  ).toBeNull();
});

test('missing depth context fails closed without inventing an opportunity allocation', () => {
  const request = buildOpportunityResegmentationRequest(
    makeInjuryEvent(),
    {
      ...injured,
      depthOrder: null,
    },
    [],
    '2026-09-25T16:05:00.000Z',
  );

  expect(request?.state).toBe('BLOCKED');
  expect(request?.blockers).toEqual([
    'injured_player_depth_order_missing',
    'no_depth_chart_beneficiary_resolved',
  ]);
  expect(request?.directMutationAllowed).toBe(false);
});
