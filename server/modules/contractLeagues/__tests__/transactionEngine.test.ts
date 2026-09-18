import { contractLeagueSnapshotSchema } from '../contracts';
import { contractLeaguePolicySchema } from '../policy';
import { contractLeagueRightsStateSchema } from '../rights';
import { simulateContractTransaction } from '../transactionEngine';

function makeSnapshot() {
  return contractLeagueSnapshotSchema.parse({
    schemaVersion: 'contract-league-snapshot.v1',
    league: {
      sourceLeagueName: 'Synthetic Contract Lab',
      platform: 'manual',
      platformLeagueId: null,
      season: 2026,
      salaryCap: 1000,
      scoring: null,
      lineup: [],
    },
    teams: [
      {
        sourceTeamName: 'Alpha',
        platformRosterId: null,
        contracts: [
          {
            sourcePlayerName: 'Player One',
            canonicalPlayerId: 'p1',
            position: 'WR',
            status: 'ACTIVE',
            totalValue: 15,
            aav: 15,
            years: [{ season: 2026, guaranteed: 10, optional: 5, capHit: 15 }],
            metadata: { notes: [] },
          },
          {
            sourcePlayerName: 'Reserve One',
            canonicalPlayerId: 'p2',
            position: 'RB',
            status: 'ACTIVE',
            totalValue: 8,
            aav: 8,
            years: [{ season: 2026, guaranteed: 6, optional: 2, capHit: 8 }],
            metadata: { notes: [] },
          },
        ],
        deadCap: [],
        cap: [{
          season: 2026,
          totalGuaranteed: 16,
          totalCapHit: 23,
          capAfterGuarantees: 984,
          capRemaining: 977,
        }],
      },
      {
        sourceTeamName: 'Beta',
        platformRosterId: null,
        contracts: [
          {
            sourcePlayerName: 'Player Two',
            canonicalPlayerId: 'p3',
            position: 'QB',
            status: 'ACTIVE',
            totalValue: 2,
            aav: 2,
            years: [{ season: 2026, guaranteed: 1, optional: 1, capHit: 2 }],
            metadata: { notes: [] },
          },
        ],
        deadCap: [],
        cap: [{
          season: 2026,
          totalGuaranteed: 1,
          totalCapHit: 2,
          capAfterGuarantees: 999,
          capRemaining: 998,
        }],
      },
    ],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic source',
      sourceLocator: null,
      sourceModifiedAt: null,
      importedAt: '2026-09-15T12:00:00.000Z',
      importerVersion: 'synthetic.v1',
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
      defaultCeiling: 1000,
      seasonCeilings: [],
      salaryFloor: null,
      rollover: { mode: 'NONE', maxAmount: null },
      compliance: [{
        id: 'transaction-cap',
        phases: ['REGULAR_SEASON'],
        basis: 'CAP_HIT_PLUS_DEAD_CAP',
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
      limitsByPhase: [{ phase: 'REGULAR_SEASON', maxPlayers: 3 }],
      reserveSlots: [
        { state: 'IR', count: 1 },
        { state: 'SEASON_ENDING_IR', count: 1 },
      ],
      viableLineupRequired: false,
    },
    contracts: {
      structures: [{
        id: 'synthetic-split',
        displayName: 'Synthetic Split',
        guaranteedShare: 0.6,
        optionalShare: 0.4,
        allowedDistributions: ['EVEN'],
      }],
      termRules: [{
        acquisitionType: 'FREE_AGENT',
        minYears: 1,
        maxYears: 3,
        allowedStructureIds: ['synthetic-split'],
        fullyOptionalMaxYears: null,
      }],
      startupTermSlots: [],
      rookieScale: { enabled: false, entries: [] },
      restructure: {
        enabled: false,
        allowance: null,
        allowedPhases: [],
        optionalToGuaranteedConversionRate: null,
        roundingIncrement: null,
        minimumGuaranteedShare: null,
        minimumAnnualAllocationShare: null,
        guaranteedToOptionalAllowed: false,
        tradeAcquisitionImmediateAllowed: false,
        blockedRosterStates: [],
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
        enabled: true,
        allowance: { maxUses: 2, mode: 'LIFETIME', windowSeasons: null },
        clearsGuaranteedMoney: true,
        clearsOptionalMoney: true,
        sendsPlayerToWaivers: true,
        reacquisitionCooldownHours: 13,
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
        releasingOwnerReacquisitionCooldownHours: 11,
        leagueNominationCooldownHours: 7,
      },
      trades: {
        outsideApprovalsRequired: 1,
        approvalPurpose: 'COLLUSION_AND_RULES_ONLY',
        futurePickHorizonSeasons: 3,
        conditionalPicksAllowed: false,
        requiresFutureDuesThroughFurthestPick: false,
        deadCapTransfer: { allowed: false, mode: null },
        retainedGuaranteedMoney: {
          allowed: true,
          maxSharePerYear: 0.4,
          optionalMoneyRetentionAllowed: false,
          appliesToAllRemainingYears: true,
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
      windows: [{ id: 'trade-window', action: 'TRADE', opens: null, closes: null }],
    },
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic rules',
      sourceRef: null,
      sourceModifiedAt: null,
      importedAt: '2026-09-15T12:00:00.000Z',
      policyVersion: 'synthetic-transaction-1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function makeRights() {
  return contractLeagueRightsStateSchema.parse({
    schemaVersion: 'contract-league-rights-state.v1',
    leagueKey: 'league-1',
    asOf: '2026-09-15T12:00:00.000Z',
    usageEvents: [],
    resetEvents: [],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic rights',
      sourceRef: null,
      sourceModifiedAt: null,
      importedAt: '2026-09-15T12:00:00.000Z',
      importerVersion: 'synthetic-rights-1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function context() {
  return {
    leagueKey: 'league-1',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'REGULAR_SEASON' as const,
    teamBindings: [
      { teamKey: 'alpha-key', sourceTeamName: 'Alpha' },
      { teamKey: 'beta-key', sourceTeamName: 'Beta' },
    ],
    actionWindowStatus: { TRADE: 'OPEN' as const },
    rightsState: makeRights(),
  };
}

describe('contract transaction engine', () => {
  it('keeps authoritative state unchanged for KEEP and returns a replay fingerprint', () => {
    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'KEEP',
      teamKey: 'alpha-key',
      player: { canonicalPlayerId: 'p1' },
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.teamEffects).toEqual([]);
    expect(result.fingerprint).toMatch(/^sha256:/);
  });

  it('moves contract obligations and roster count without mutating source state', () => {
    const snapshot = makeSnapshot();
    const result = simulateContractTransaction(snapshot, makePolicy(), context(), {
      type: 'TRADE',
      fromTeamKey: 'alpha-key',
      toTeamKey: 'beta-key',
      player: { canonicalPlayerId: 'p1' },
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.finality).toBe('REQUIRES_APPROVAL');
    const alpha = result.teamEffects.find((item) => item.teamKey === 'alpha-key')!;
    const beta = result.teamEffects.find((item) => item.teamKey === 'beta-key')!;
    expect(alpha.rosterCountAfter).toBe(1);
    expect(alpha.seasons[0].after.ledgerTotalCapHit).toBe(8);
    expect(beta.rosterCountAfter).toBe(2);
    expect(beta.seasons[0].after.ledgerTotalCapHit).toBe(17);
    expect(snapshot.teams[0].cap[0].totalCapHit).toBe(23);
  });

  it('retains only policy-legal guaranteed salary and keeps optional money with the acquiring team', () => {
    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'TRADE',
      fromTeamKey: 'alpha-key',
      toTeamKey: 'beta-key',
      player: { canonicalPlayerId: 'p1' },
      retainedGuaranteedBySeason: { 2026: 4 },
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    const alpha = result.teamEffects.find((item) => item.teamKey === 'alpha-key')!;
    const beta = result.teamEffects.find((item) => item.teamKey === 'beta-key')!;
    expect(alpha.seasons[0].after.retainedGuaranteed).toBe(4);
    expect(alpha.seasons[0].after.ledgerTotalCapHit).toBe(12);
    expect(beta.seasons[0].after.guaranteedObligation).toBe(7);
    expect(beta.seasons[0].after.optionalObligation).toBe(6);
    expect(beta.seasons[0].after.ledgerTotalCapHit).toBe(13);
  });

  it('marks a retained-salary trade illegal when the per-year policy share is exceeded', () => {
    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'TRADE',
      fromTeamKey: 'alpha-key',
      toTeamKey: 'beta-key',
      player: { canonicalPlayerId: 'p1' },
      retainedGuaranteedBySeason: { 2026: 5 },
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('RETAINED_SALARY_LIMIT_EXCEEDED');
  });

  it('applies explicit reserve-state cap treatment and requires an external eligibility witness', () => {
    const missing = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'PLACE_RESERVE',
      teamKey: 'alpha-key',
      player: { canonicalPlayerId: 'p2' },
      targetState: 'SEASON_ENDING_IR',
      externalEligibilityConfirmed: false,
    });
    expect(missing.status).toBe('ABSTAIN');
    if (missing.status === 'ABSTAIN') {
      expect(missing.reasonCodes).toContain('RESERVE_ELIGIBILITY_UNCONFIRMED');
    }

    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'PLACE_RESERVE',
      teamKey: 'alpha-key',
      player: { canonicalPlayerId: 'p2' },
      targetState: 'SEASON_ENDING_IR',
      externalEligibilityConfirmed: true,
    });
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    const alpha = result.teamEffects[0];
    expect(alpha.seasons[0].after.ledgerTotalCapHit).toBe(19);
    expect(alpha.reserveCountsAfter.SEASON_ENDING_IR).toBe(1);
  });

  it('consumes an immutable amnesty right and clears the contract only when policy explicitly says so', () => {
    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'AMNESTY',
      teamKey: 'alpha-key',
      player: { canonicalPlayerId: 'p1' },
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.rightEffects[0]).toMatchObject({
      teamKey: 'alpha-key',
      rightType: 'AMNESTY',
      remainingBefore: 2,
      remainingAfter: 1,
    });
    expect(result.teamEffects[0].seasons[0].after.ledgerTotalCapHit).toBe(8);
    expect(result.followUpActions[0]).toContain('COOLDOWN:');
  });

  it('fails closed for cuts because release dead-cap treatment is not yet encoded in the policy boundary', () => {
    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), context(), {
      type: 'CUT',
      teamKey: 'alpha-key',
      player: { canonicalPlayerId: 'p1' },
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') {
      expect(result.reasonCodes).toContain('CUT_FINANCIAL_POLICY_UNAVAILABLE');
    }
  });

  it('fails closed when the lifecycle layer has not resolved whether trades are open', () => {
    const unresolvedContext = context();
    unresolvedContext.actionWindowStatus = { TRADE: 'UNKNOWN' };
    const result = simulateContractTransaction(makeSnapshot(), makePolicy(), unresolvedContext, {
      type: 'TRADE',
      fromTeamKey: 'alpha-key',
      toTeamKey: 'beta-key',
      player: { canonicalPlayerId: 'p1' },
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') {
      expect(result.reasonCodes).toContain('TRADE_WINDOW_UNRESOLVED');
    }
  });
});
