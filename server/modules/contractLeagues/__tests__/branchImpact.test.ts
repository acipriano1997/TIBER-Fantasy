import { buildSingleActionBranchImpact } from '../branchImpact';
import { buildMultiYearCapHealth, type CapLiquidityCandidateResult } from '../capIntelligence';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

describe('single-action contract branch impact', () => {
  it('shows when an explicit future cap reserve would be put at risk', () => {
    const health = buildMultiYearCapHealth(makeBoundarySnapshot(), makeBoundaryPolicy(), {
      teamKey: 'team-boundary',
      sourceTeamName: 'Synthetic Team',
      phase: 'REGULAR_SEASON',
    });
    const candidate: CapLiquidityCandidateResult = {
      candidateId: 'expensive-action',
      kind: 'TRANSACTION',
      status: 'READY',
      sourceFingerprint: 'sha256:action',
      reasonCodes: [],
      reliefBySeason: [{ season: 2026, capRoomDelta: -100, deadCapDelta: 0 }],
      currentSeasonRelief: -100,
      totalPositiveRelief: 0,
      firstPositiveReliefSeason: null,
      rightsConsumed: 0,
      followUpActions: [],
      ccfValueLost: null,
    };

    const result = buildSingleActionBranchImpact({
      capHealth: health,
      candidate,
      commitments: [{
        commitmentId: 'preserve-in-season-room',
        label: 'Keep emergency room',
        season: 2026,
        minimumRemainingCapRoom: 400,
      }],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.capCommitments).toEqual([{
      commitmentId: 'preserve-in-season-room',
      label: 'Keep emergency room',
      season: 2026,
      baselineCapRemaining: 488,
      actionCapRoomDelta: -100,
      postActionCapRemaining: 388,
      minimumRemainingCapRoom: 400,
      marginAfterCommitment: -12,
      status: 'AT_RISK',
    }]);
    expect(result.scopeNote).toContain('multi-action');
  });
});
