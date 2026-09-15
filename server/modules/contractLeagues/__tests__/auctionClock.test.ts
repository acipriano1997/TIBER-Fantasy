import { projectAuctionClockAfterBid } from '../auctionClock';
import { makeBoundaryPolicy } from './decisionBoundaryFixtures';

function makePolicy(resetsOnNewBid = true) {
  const base = makeBoundaryPolicy();
  return {
    ...base,
    freeAgency: {
      ...base.freeAgency,
      bidWindowHours: 24,
      resetsOnNewBid,
    },
  };
}

function makeAuction() {
  return {
    schemaVersion: 'contract-free-agent-auction-state.v1' as const,
    leagueKey: 'league-boundary',
    auctionId: 'synthetic-clock',
    asOf: '2026-09-15T11:50:00.000Z',
    player: { sourcePlayerName: 'Clock Player', canonicalPlayerId: 'clock-player', position: 'WR' as const },
    status: 'OPEN' as const,
    timing: {
      nominatedAt: '2026-09-15T10:00:00.000Z',
      closesAt: '2026-09-16T10:00:00.000Z',
      lastBidAt: '2026-09-15T11:00:00.000Z',
    },
    leadingBid: null,
    settlement: null,
    provenance: {
      sourceKind: 'platform' as const,
      sourceDisplayName: 'Synthetic auction source',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T11:50:00.000Z',
      importedAt: '2026-09-15T11:55:00.000Z',
      producerVersion: 'synthetic-clock.v1',
    },
    validation: { status: 'VALID' as const, warnings: [], unresolved: [] },
  };
}

describe('contract auction clock', () => {
  test('resets the close time from an accepted new bid when policy requires it', () => {
    const result = projectAuctionClockAfterBid(makeAuction(), makePolicy(true), {
      leagueKey: 'league-boundary', decisionAt: '2026-09-15T12:30:00.000Z', bidSubmittedAt: '2026-09-15T12:30:00.000Z',
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.accepted).toBe(true);
    expect(result.resetApplied).toBe(true);
    expect(result.projectedClosesAt).toBe('2026-09-16T12:30:00.000Z');
  });

  test('preserves the existing close when bids do not reset the clock', () => {
    const result = projectAuctionClockAfterBid(makeAuction(), makePolicy(false), {
      leagueKey: 'league-boundary', decisionAt: '2026-09-15T12:30:00.000Z', bidSubmittedAt: '2026-09-15T12:30:00.000Z',
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.projectedClosesAt).toBe('2026-09-16T10:00:00.000Z');
    expect(result.resetApplied).toBe(false);
  });

  test('marks a late bid rejected without mutating authoritative state', () => {
    const auction = makeAuction();
    const result = projectAuctionClockAfterBid(auction, makePolicy(true), {
      leagueKey: 'league-boundary', decisionAt: '2026-09-16T10:01:00.000Z', bidSubmittedAt: '2026-09-16T10:01:00.000Z',
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.accepted).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('AUCTION_WINDOW_CLOSED');
    expect(auction.timing.closesAt).toBe('2026-09-16T10:00:00.000Z');
  });

  test('abstains when the league has no authoritative auction clock policy', () => {
    const policy = makeBoundaryPolicy();
    const result = projectAuctionClockAfterBid(makeAuction(), policy, {
      leagueKey: 'league-boundary', decisionAt: '2026-09-15T12:30:00.000Z', bidSubmittedAt: '2026-09-15T12:30:00.000Z',
    });
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('AUCTION_CLOCK_POLICY_UNAVAILABLE');
  });
});
