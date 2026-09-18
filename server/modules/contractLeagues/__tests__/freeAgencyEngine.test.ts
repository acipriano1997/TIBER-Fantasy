import { evaluateFreeAgentBid, simulateFreeAgentAcquisition } from '../freeAgencyEngine';
import { makeBoundaryPolicy, makeBoundarySnapshot } from './decisionBoundaryFixtures';

function makePolicy() {
  const base = makeBoundaryPolicy();
  return {
    ...base,
    cap: { ...base.cap, salaryIncrement: 0.5 },
    freeAgency: {
      ...base.freeAgency,
      bidWindowHours: 24,
      resetsOnNewBid: true,
      minContractYears: 1,
      maxContractYears: 2,
      fullyOptionalMaxYears: 1,
      allowedStructureIds: ['synthetic'],
      maxAnnualValueShareOfCap: 0.25,
      bidCapBasis: 'CAP_HIT' as const,
      salaryIncrement: 0.5,
      offseasonOverCapAllowed: false,
    },
  };
}

function makeSnapshot() {
  const base = makeBoundarySnapshot();
  const team = base.teams[0];
  return {
    ...base,
    teams: [{
      ...team,
      cap: [
        ...team.cap,
        { season: 2027, totalGuaranteed: 0, totalCapHit: 0, capAfterGuarantees: 500, capRemaining: 500 },
      ],
    }],
  };
}

function makeYears() {
  return [
    { season: 2026, guaranteed: 10, optional: 10, capHit: 20 },
    { season: 2027, guaranteed: 10, optional: 10, capHit: 20 },
  ];
}

function makeAuction(status: 'OPEN' | 'SETTLED' = 'OPEN') {
  const settlement = status === 'SETTLED' ? {
    sourceTeamName: 'Synthetic Team',
    structureId: 'synthetic',
    distribution: 'EVEN' as const,
    years: makeYears(),
    settledAt: '2026-09-15T12:25:00.000Z',
  } : null;
  return {
    schemaVersion: 'contract-free-agent-auction-state.v1' as const,
    leagueKey: 'league-boundary',
    auctionId: 'auction-synthetic-fa',
    asOf: status === 'SETTLED' ? '2026-09-15T12:26:00.000Z' : '2026-09-15T12:15:00.000Z',
    player: { sourcePlayerName: 'Synthetic Free Agent', canonicalPlayerId: 'synthetic-free-agent', position: 'RB' as const },
    status,
    timing: {
      nominatedAt: '2026-09-15T10:00:00.000Z',
      closesAt: '2026-09-16T10:00:00.000Z',
      lastBidAt: '2026-09-15T11:30:00.000Z',
    },
    leadingBid: status === 'OPEN' ? {
      sourceTeamName: 'Other Synthetic Team',
      structureId: 'synthetic',
      distribution: 'EVEN' as const,
      years: makeYears(),
      submittedAt: '2026-09-15T11:30:00.000Z',
    } : null,
    settlement,
    provenance: {
      sourceKind: 'platform' as const,
      sourceDisplayName: 'Synthetic auction platform',
      sourceRef: null,
      sourceModifiedAt: status === 'SETTLED' ? '2026-09-15T12:26:00.000Z' : '2026-09-15T12:15:00.000Z',
      importedAt: status === 'SETTLED' ? '2026-09-15T12:27:00.000Z' : '2026-09-15T12:20:00.000Z',
      producerVersion: 'synthetic-auction.v1',
    },
    validation: { status: 'VALID' as const, warnings: [], unresolved: [] },
  };
}

function makeContext(status: 'OPEN' | 'SETTLED' = 'OPEN') {
  return {
    leagueKey: 'league-boundary',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'REGULAR_SEASON' as const,
    sourceTeamName: 'Synthetic Team',
    contractStartSeason: 2026,
    auctionState: makeAuction(status),
  };
}

function makeBid() {
  return { structureId: 'synthetic', distribution: 'EVEN' as const, years: makeYears() };
}

describe('contract free-agency engine', () => {
  test('validates a legal bid without deciding whether it beats the market leader', () => {
    const result = evaluateFreeAgentBid(makeSnapshot(), makePolicy(), makeContext(), makeBid());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.annualAav).toBe(20);
    expect(result.totalValue).toBe(40);
  });

  test('marks a bid illegal after the authoritative auction close', () => {
    const context = makeContext();
    context.decisionAt = '2026-09-16T10:01:00.000Z';
    context.auctionState = {
      ...makeAuction(),
      asOf: '2026-09-16T09:59:00.000Z',
      provenance: {
        ...makeAuction().provenance,
        sourceModifiedAt: '2026-09-16T09:59:00.000Z',
        importedAt: '2026-09-16T09:59:30.000Z',
      },
    };
    const result = evaluateFreeAgentBid(makeSnapshot(), makePolicy(), context, makeBid());
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('AUCTION_WINDOW_CLOSED');
  });

  test('rejects contract terms that do not match the selected guarantee structure', () => {
    const bid = makeBid();
    bid.years[0] = { season: 2026, guaranteed: 15, optional: 5, capHit: 20 };
    const result = evaluateFreeAgentBid(makeSnapshot(), makePolicy(), makeContext(), bid);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('FREE_AGENT_STRUCTURE_SHARE_MISMATCH');
  });

  test('applies an authoritative settled auction to cap and roster consequences', () => {
    const result = simulateFreeAgentAcquisition(makeSnapshot(), makePolicy(), makeContext('SETTLED'));
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.seasonEffects.map((item) => item.after.capRemaining)).toEqual([468, 480]);
    expect(result.rosterEffect).toEqual({ sourceTeamName: 'Synthetic Team', sourcePlayerName: 'Synthetic Free Agent', canonicalPlayerId: 'synthetic-free-agent', action: 'ADD' });
  });

  test('abstains when the bound team is not the authoritative auction winner', () => {
    const context = makeContext('SETTLED');
    context.auctionState = {
      ...makeAuction('SETTLED'),
      settlement: { ...makeAuction('SETTLED').settlement!, sourceTeamName: 'Other Synthetic Team' },
    };
    const result = simulateFreeAgentAcquisition(makeSnapshot(), makePolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('AUCTION_WINNER_MISMATCH');
  });

  test('marks settlement illegal when the player is already under an active contract', () => {
    const context = makeContext('SETTLED');
    context.auctionState = {
      ...makeAuction('SETTLED'),
      player: { sourcePlayerName: 'Synthetic Player', canonicalPlayerId: 'synthetic-player', position: 'WR' as const },
    };
    const result = simulateFreeAgentAcquisition(makeSnapshot(), makePolicy(), context);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('PLAYER_NOT_FREE_AGENT');
  });

  test('abstains rather than guessing a missing future cap ledger', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].cap = snapshot.teams[0].cap.filter((item) => item.season !== 2027);
    const result = evaluateFreeAgentBid(snapshot, makePolicy(), makeContext(), makeBid());
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
  });

  test('abstains when settled auction evidence is newer than the frozen decision', () => {
    const context = makeContext('SETTLED');
    context.decisionAt = '2026-09-15T12:20:00.000Z';
    const result = simulateFreeAgentAcquisition(makeSnapshot(), makePolicy(), context);
    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('AUCTION_AS_OF_AFTER_DECISION');
  });
});
