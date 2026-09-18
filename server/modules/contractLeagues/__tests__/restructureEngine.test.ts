import { contractLeagueSnapshotSchema } from '../contracts';
import { contractLeaguePolicySchema } from '../policy';
import { contractLeagueRightsStateSchema } from '../rights';
import { simulateContractRestructure } from '../restructureEngine';

function makeSnapshot() {
  return contractLeagueSnapshotSchema.parse({
    schemaVersion: 'contract-league-snapshot.v1',
    league: {
      sourceLeagueName: 'Synthetic Restructure Lab',
      platform: 'manual',
      platformLeagueId: null,
      season: 2026,
      salaryCap: 5000,
      scoring: null,
      lineup: [],
    },
    teams: [{
      sourceTeamName: 'Synthetic Alpha',
      platformRosterId: null,
      contracts: [{
        sourcePlayerName: 'Synthetic Player',
        canonicalPlayerId: 'synthetic-p1',
        position: 'WR',
        status: 'ACTIVE',
        totalValue: 1000,
        aav: 500,
        years: [
          { season: 2026, guaranteed: 300, optional: 200, capHit: 500 },
          { season: 2027, guaranteed: 200, optional: 300, capHit: 500 },
        ],
        metadata: { notes: [] },
      }],
      deadCap: [],
      cap: [
        { season: 2026, totalGuaranteed: 300, totalCapHit: 500, capAfterGuarantees: 4700, capRemaining: 4500 },
        { season: 2027, totalGuaranteed: 200, totalCapHit: 500, capAfterGuarantees: 4800, capRemaining: 4500 },
      ],
    }],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic restructure source',
      sourceLocator: null,
      sourceModifiedAt: '2026-02-01T00:00:00.000Z',
      importedAt: '2026-02-02T00:00:00.000Z',
      importerVersion: 'synthetic-restructure.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function makePolicy() {
  return contractLeaguePolicySchema.parse({
    schemaVersion: 'contract-league-policy.v1',
    effective: {
      season: 2026,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: null,
    },
    cap: {
      defaultCeiling: 5000,
      seasonCeilings: [],
      salaryFloor: null,
      rollover: { mode: 'NONE', maxAmount: null },
      compliance: [{
        id: 'synthetic-cap',
        phases: ['OFFSEASON'],
        basis: 'CAP_HIT',
        ceilingShare: 1,
        reserveAmount: null,
        overCeilingAllowed: false,
        enforcement: 'TRANSACTION_TIME',
      }],
      rosterStateTreatments: [
        { rosterState: 'ACTIVE', guaranteedMultiplier: 1, optionalMultiplier: 1, capHitMultiplier: 1 },
        { rosterState: 'IR', guaranteedMultiplier: 1, optionalMultiplier: 1, capHitMultiplier: 1 },
        { rosterState: 'SEASON_ENDING_IR', guaranteedMultiplier: 0.5, optionalMultiplier: 0.5, capHitMultiplier: 0.5 },
      ],
      maximumAnnualContractShareOfCap: null,
      salaryIncrement: null,
    },
    roster: {
      limitsByPhase: [{ phase: 'OFFSEASON', maxPlayers: 30 }],
      reserveSlots: [
        { state: 'IR', count: 2 },
        { state: 'SEASON_ENDING_IR', count: 1 },
      ],
      viableLineupRequired: false,
    },
    contracts: {
      structures: [{
        id: 'synthetic-mid',
        displayName: 'Synthetic Mid',
        guaranteedShare: 0.55,
        optionalShare: 0.45,
        allowedDistributions: ['EVEN'],
      }],
      termRules: [{
        acquisitionType: 'FREE_AGENT',
        minYears: 1,
        maxYears: 4,
        allowedStructureIds: ['synthetic-mid'],
        fullyOptionalMaxYears: null,
      }],
      startupTermSlots: [],
      rookieScale: { enabled: false, entries: [] },
      restructure: {
        enabled: true,
        allowance: { maxUses: 2, mode: 'ANCHORED_FROM_FIRST_USE', windowSeasons: 3 },
        allowedPhases: ['OFFSEASON'],
        optionalToGuaranteedConversionRate: 0.6,
        roundingIncrement: 100,
        minimumGuaranteedShare: 0.55,
        minimumAnnualAllocationShare: 0.2,
        guaranteedToOptionalAllowed: false,
        tradeAcquisitionImmediateAllowed: true,
        blockedRosterStates: ['SEASON_ENDING_IR'],
      },
      reSign: {
        enabled: false,
        allowance: null,
        allowedPhases: [],
        minYears: null,
        maxYears: null,
        allowedStructureIds: [],
        pricing: null,
      },
      amnesty: {
        enabled: false,
        allowance: null,
        clearsGuaranteedMoney: false,
        clearsOptionalMoney: false,
        sendsPlayerToWaivers: false,
        reacquisitionCooldownHours: null,
      },
      retirement: {
        optionalMoneyVoided: true,
        guaranteedMoneyStillDue: true,
        guaranteedReallocationAllowed: false,
        allowedPhases: [],
        consumesRestructureUse: false,
      },
      tags: [],
    },
    transactions: {
      cuts: {
        releasingOwnerReacquisitionCooldownHours: null,
        leagueNominationCooldownHours: null,
        financialTreatment: null,
      },
      trades: {
        outsideApprovalsRequired: 0,
        approvalPurpose: 'NONE',
        futurePickHorizonSeasons: null,
        conditionalPicksAllowed: null,
        requiresFutureDuesThroughFurthestPick: null,
        deadCapTransfer: { allowed: false, mode: null },
        retainedGuaranteedMoney: {
          allowed: false,
          maxSharePerYear: null,
          optionalMoneyRetentionAllowed: false,
          appliesToAllRemainingYears: null,
        },
        capSpaceTradeAllowed: false,
      },
    },
    freeAgency: {
      nominationLimitPerDay: null,
      bidWindowHours: null,
      resetsOnNewBid: null,
      minContractYears: null,
      maxContractYears: null,
      fullyOptionalMaxYears: null,
      allowedStructureIds: [],
      maxAnnualValueShareOfCap: null,
      bidCapBasis: null,
      salaryIncrement: null,
      offseasonOverCapAllowed: null,
      fullyOptionalMaxPricing: null,
    },
    lifecycle: {
      windows: [{ id: 'synthetic-restructure-window', action: 'RESTRUCTURE', opens: null, closes: null }],
    },
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic restructure rules',
      sourceRef: null,
      sourceModifiedAt: '2026-02-01T00:00:00.000Z',
      importedAt: '2026-02-02T00:00:00.000Z',
      policyVersion: 'synthetic-restructure-policy.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function makeRights(uses = 0) {
  return contractLeagueRightsStateSchema.parse({
    schemaVersion: 'contract-league-rights-state.v1',
    leagueKey: 'synthetic-league',
    asOf: '2026-02-03T00:00:00.000Z',
    usageEvents: Array.from({ length: uses }, (_, index) => ({
      eventId: `synthetic-restructure-${index + 1}`,
      teamKey: 'synthetic-team',
      rightType: 'RESTRUCTURE',
      customRightId: null,
      season: 2026,
      occurredAt: `2026-02-0${index + 1}T00:00:00.000Z`,
      sourcePlayerName: `Synthetic Prior ${index + 1}`,
      canonicalPlayerId: `prior-${index + 1}`,
      quantity: 1,
      sourceNote: null,
    })),
    resetEvents: [],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic restructure rights',
      sourceRef: null,
      sourceModifiedAt: '2026-02-03T00:00:00.000Z',
      importedAt: '2026-02-03T00:00:00.000Z',
      importerVersion: 'synthetic-restructure-rights.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function context() {
  return {
    leagueKey: 'synthetic-league',
    decisionAt: '2026-02-10T00:00:00.000Z',
    phase: 'OFFSEASON' as const,
    teamKey: 'synthetic-team',
    sourceTeamName: 'Synthetic Alpha',
    restructureWindowStatus: 'OPEN' as const,
    rightsState: makeRights(),
  };
}

function validProposal() {
  return [
    { season: 2026, guaranteed: 280, optional: 120, capHit: 400 },
    { season: 2027, guaranteed: 280, optional: 120, capHit: 400 },
  ];
}

describe('contract restructure engine', () => {
  it('preserves discounted restructure value, updates cap ledgers, and consumes one right without mutating source state', () => {
    const snapshot = makeSnapshot();
    const result = simulateContractRestructure(snapshot, makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.originalEconomicValue).toBe(800);
    expect(result.restructuredEconomicValue).toBe(800);
    expect(result.seasonEffects.map((effect) => effect.after.capHit)).toEqual([400, 400]);
    expect(result.seasonEffects.map((effect) => effect.after.capRemaining)).toEqual([4600, 4600]);
    expect(result.rightEffect).toMatchObject({
      teamKey: 'synthetic-team',
      rightType: 'RESTRUCTURE',
      remainingBefore: 2,
      remainingAfter: 1,
    });
    expect(snapshot.teams[0].contracts[0].years[0].capHit).toBe(500);
    expect(snapshot.teams[0].cap[0].totalCapHit).toBe(500);
  });

  it('fails closed when the restructure lifecycle window is unresolved', () => {
    const unresolved = context();
    unresolved.restructureWindowStatus = 'UNKNOWN';
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), unresolved, {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });
    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') expect(result.reasonCodes).toContain('RESTRUCTURE_WINDOW_UNRESOLVED');
  });

  it('fails closed without an immutable scarce-right ledger', () => {
    const missing = context();
    missing.rightsState = null;
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), missing, {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });
    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') expect(result.reasonCodes).toContain('RIGHTS_STATE_UNAVAILABLE');
  });

  it('marks the proposal illegal when restructure rights are exhausted', () => {
    const exhausted = context();
    exhausted.rightsState = makeRights(2);
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), exhausted, {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RESTRUCTURE_EXHAUSTED');
    expect(result.rightEffect).toBeNull();
  });

  it('rejects a proposal that changes preserved restructure value', () => {
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: [
        { season: 2026, guaranteed: 300, optional: 150, capHit: 450 },
        { season: 2027, guaranteed: 300, optional: 150, capHit: 450 },
      ],
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RESTRUCTURE_VALUE_MISMATCH');
  });

  it('enforces no guarantee-to-option conversion and the minimum guaranteed share', () => {
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: [
        { season: 2026, guaranteed: 200, optional: 200, capHit: 400 },
        { season: 2027, guaranteed: 200, optional: 200, capHit: 400 },
      ],
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    const codes = result.violations.map((item) => item.code);
    expect(codes).toContain('RESTRUCTURE_GUARANTEE_REDUCTION_NOT_ALLOWED');
    expect(codes).toContain('RESTRUCTURE_MINIMUM_GUARANTEE_SHARE');
  });

  it('enforces per-year minimum allocations for both guaranteed and optional pools', () => {
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: [
        { season: 2026, guaranteed: 500, optional: 0, capHit: 500 },
        { season: 2027, guaranteed: 60, optional: 240, capHit: 300 },
      ],
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    const codes = result.violations.map((item) => item.code);
    expect(codes).toContain('RESTRUCTURE_ANNUAL_GUARANTEE_ALLOCATION_TOO_LOW');
    expect(codes).toContain('RESTRUCTURE_ANNUAL_OPTIONAL_ALLOCATION_TOO_LOW');
  });

  it('rejects cap-hit decomposition errors in the proposed schedule', () => {
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: [
        { season: 2026, guaranteed: 280, optional: 120, capHit: 401 },
        { season: 2027, guaranteed: 280, optional: 120, capHit: 399 },
      ],
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.violations.map((item) => item.code)).toContain('RESTRUCTURE_CAP_HIT_MISMATCH');
  });

  it('fails closed when an affected future season lacks authoritative ledger coverage', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].cap = snapshot.teams[0].cap.filter((entry) => entry.season !== 2027);
    const result = simulateContractRestructure(snapshot, makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });
    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
  });

  it('blocks a player in a policy-forbidden reserve state', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].contracts[0].status = 'SEASON_ENDING_IR';
    const result = simulateContractRestructure(snapshot, makePolicy(), context(), {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RESTRUCTURE_ROSTER_STATE_BLOCKED');
  });

  it('rejects future rights evidence at a frozen historical decision time', () => {
    const future = context();
    const rights = makeRights();
    rights.asOf = '2026-03-01T00:00:00.000Z';
    future.rightsState = rights;
    const result = simulateContractRestructure(makeSnapshot(), makePolicy(), future, {
      player: { canonicalPlayerId: 'synthetic-p1' },
      proposedYears: validProposal(),
    });
    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') expect(result.reasonCodes).toContain('RIGHTS_AS_OF_AFTER_DECISION');
  });
});
