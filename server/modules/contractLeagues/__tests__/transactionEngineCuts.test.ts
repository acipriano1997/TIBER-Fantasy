import { contractLeagueSnapshotSchema } from '../contracts';
import { contractLeaguePolicySchema } from '../policy';
import { simulateContractTransaction } from '../transactionEngine';

function makeSnapshot() {
  return contractLeagueSnapshotSchema.parse({
    schemaVersion: 'contract-league-snapshot.v1',
    league: {
      sourceLeagueName: 'Synthetic Cut Lab',
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
            sourcePlayerName: 'Cut Candidate',
            canonicalPlayerId: 'cut-1',
            position: 'WR',
            status: 'ACTIVE',
            totalValue: 36,
            aav: 12,
            years: [
              { season: 2026, guaranteed: 10, optional: 5, capHit: 15 },
              { season: 2027, guaranteed: 8, optional: 4, capHit: 12 },
              { season: 2028, guaranteed: 6, optional: 3, capHit: 9 },
            ],
            metadata: { notes: [] },
          },
          {
            sourcePlayerName: 'Roster Anchor',
            canonicalPlayerId: 'keep-1',
            position: 'RB',
            status: 'ACTIVE',
            totalValue: 90,
            aav: 30,
            years: [
              { season: 2026, guaranteed: 20, optional: 10, capHit: 30 },
              { season: 2027, guaranteed: 20, optional: 10, capHit: 30 },
              { season: 2028, guaranteed: 20, optional: 10, capHit: 30 },
            ],
            metadata: { notes: [] },
          },
        ],
        deadCap: [],
        cap: [
          {
            season: 2026,
            totalGuaranteed: 30,
            totalCapHit: 45,
            capAfterGuarantees: 970,
            capRemaining: 955,
          },
          {
            season: 2027,
            totalGuaranteed: 28,
            totalCapHit: 42,
            capAfterGuarantees: 972,
            capRemaining: 958,
          },
          {
            season: 2028,
            totalGuaranteed: 26,
            totalCapHit: 39,
            capAfterGuarantees: 974,
            capRemaining: 961,
          },
        ],
      },
    ],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic cut source',
      sourceLocator: null,
      sourceModifiedAt: null,
      importedAt: '2026-09-15T12:00:00.000Z',
      importerVersion: 'synthetic-cut.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

type CutDisposition = 'CLEAR' | 'DEAD_CAP_PRESERVE_SCHEDULE' | 'DEAD_CAP_ACCELERATE_CURRENT_SEASON';

type CutTreatment = {
  guaranteed: CutDisposition;
  optional: CutDisposition;
  deadCapCountsTowardGuaranteedLedger: boolean;
};

function makePolicy(financialTreatment: CutTreatment | null = null) {
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
        { rosterState: 'SEASON_ENDING_IR', guaranteedMultiplier: 1, optionalMultiplier: 1, capHitMultiplier: 1 },
      ],
      maximumAnnualContractShareOfCap: null,
      salaryIncrement: null,
    },
    roster: {
      limitsByPhase: [{ phase: 'REGULAR_SEASON', maxPlayers: 4 }],
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
        releasingOwnerReacquisitionCooldownHours: 11,
        leagueNominationCooldownHours: 7,
        financialTreatment,
      },
      trades: {
        outsideApprovalsRequired: 0,
        approvalPurpose: 'NONE',
        futurePickHorizonSeasons: 3,
        conditionalPicksAllowed: false,
        requiresFutureDuesThroughFurthestPick: false,
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
    lifecycle: { windows: [] },
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic cut rules',
      sourceRef: null,
      sourceModifiedAt: null,
      importedAt: '2026-09-15T12:00:00.000Z',
      policyVersion: 'synthetic-cut-policy-1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function context() {
  return {
    leagueKey: 'league-cut',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'REGULAR_SEASON' as const,
    teamBindings: [{ teamKey: 'alpha-key', sourceTeamName: 'Alpha' }],
  };
}

function simulateCut(snapshot = makeSnapshot(), policy = makePolicy()) {
  return simulateContractTransaction(snapshot, policy, context(), {
    type: 'CUT',
    teamKey: 'alpha-key',
    player: { canonicalPlayerId: 'cut-1' },
  });
}

function alphaSeasons(result: ReturnType<typeof simulateCut>) {
  expect(result.status).toBe('READY');
  if (result.status !== 'READY') throw new Error('Expected READY cut result.');
  const alpha = result.teamEffects.find((item) => item.teamKey === 'alpha-key');
  expect(alpha).toBeDefined();
  return alpha!;
}

describe('contract transaction CUT and dead-cap accounting', () => {
  it('fails closed when authoritative cut financial treatment is unresolved', () => {
    const result = simulateCut();

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CUT_FINANCIAL_POLICY_UNAVAILABLE');
  });

  it('clears released guaranteed and optional money only when policy explicitly says CLEAR', () => {
    const snapshot = makeSnapshot();
    const result = simulateCut(snapshot, makePolicy({
      guaranteed: 'CLEAR',
      optional: 'CLEAR',
      deadCapCountsTowardGuaranteedLedger: false,
    }));
    const alpha = alphaSeasons(result);

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(true);
    expect(result.finality).toBe('REQUIRES_FOLLOW_UP');
    expect(alpha.rosterCountBefore).toBe(2);
    expect(alpha.rosterCountAfter).toBe(1);
    expect(alpha.seasons.map((view) => ({
      season: view.season,
      guaranteed: view.after.ledgerTotalGuaranteed,
      capHit: view.after.ledgerTotalCapHit,
      deadCap: view.after.deadCap,
    }))).toEqual([
      { season: 2026, guaranteed: 20, capHit: 30, deadCap: 0 },
      { season: 2027, guaranteed: 20, capHit: 30, deadCap: 0 },
      { season: 2028, guaranteed: 20, capHit: 30, deadCap: 0 },
    ]);
    expect(result.followUpActions).toEqual(expect.arrayContaining([
      expect.stringContaining('COOLDOWN:'),
      expect.stringContaining('NOMINATION_COOLDOWN:'),
    ]));
    expect(snapshot.teams[0].cap[0].totalCapHit).toBe(45);
  });

  it('preserves guaranteed money as scheduled dead cap while clearing optional salary', () => {
    const result = simulateCut(makeSnapshot(), makePolicy({
      guaranteed: 'DEAD_CAP_PRESERVE_SCHEDULE',
      optional: 'CLEAR',
      deadCapCountsTowardGuaranteedLedger: true,
    }));
    const alpha = alphaSeasons(result);

    expect(alpha.seasons.map((view) => ({
      season: view.season,
      contractCapHit: view.after.contractCapHit,
      deadCap: view.after.deadCap,
      guaranteedLedger: view.after.ledgerTotalGuaranteed,
      totalCapHit: view.after.ledgerTotalCapHit,
    }))).toEqual([
      { season: 2026, contractCapHit: 30, deadCap: 10, guaranteedLedger: 30, totalCapHit: 40 },
      { season: 2027, contractCapHit: 30, deadCap: 8, guaranteedLedger: 28, totalCapHit: 38 },
      { season: 2028, contractCapHit: 30, deadCap: 6, guaranteedLedger: 26, totalCapHit: 36 },
    ]);
  });

  it('keeps scheduled dead cap outside the guaranteed ledger when policy says it does not count there', () => {
    const result = simulateCut(makeSnapshot(), makePolicy({
      guaranteed: 'DEAD_CAP_PRESERVE_SCHEDULE',
      optional: 'DEAD_CAP_PRESERVE_SCHEDULE',
      deadCapCountsTowardGuaranteedLedger: false,
    }));
    const alpha = alphaSeasons(result);

    expect(alpha.seasons.map((view) => ({
      season: view.season,
      guaranteedLedger: view.after.ledgerTotalGuaranteed,
      totalCapHit: view.after.ledgerTotalCapHit,
      deadCap: view.after.deadCap,
    }))).toEqual([
      { season: 2026, guaranteedLedger: 20, totalCapHit: 45, deadCap: 15 },
      { season: 2027, guaranteedLedger: 20, totalCapHit: 42, deadCap: 12 },
      { season: 2028, guaranteedLedger: 20, totalCapHit: 39, deadCap: 9 },
    ]);
  });

  it('accelerates all surviving released money into current-season dead cap and clears future ledgers', () => {
    const result = simulateCut(makeSnapshot(), makePolicy({
      guaranteed: 'DEAD_CAP_ACCELERATE_CURRENT_SEASON',
      optional: 'DEAD_CAP_ACCELERATE_CURRENT_SEASON',
      deadCapCountsTowardGuaranteedLedger: false,
    }));
    const alpha = alphaSeasons(result);

    const bySeason = Object.fromEntries(alpha.seasons.map((view) => [view.season, view]));
    expect(bySeason[2026].after.deadCap).toBe(36);
    expect(bySeason[2026].after.contractCapHit).toBe(30);
    expect(bySeason[2026].after.ledgerTotalCapHit).toBe(66);
    expect(bySeason[2027].after.deadCap).toBe(0);
    expect(bySeason[2027].after.ledgerTotalCapHit).toBe(30);
    expect(bySeason[2028].after.deadCap).toBe(0);
    expect(bySeason[2028].after.ledgerTotalCapHit).toBe(30);
  });

  it('abstains when an affected future season lacks an authoritative cap-ledger row', () => {
    const snapshot = makeSnapshot();
    snapshot.teams[0].cap = snapshot.teams[0].cap.filter((row) => row.season !== 2028);

    const result = simulateCut(snapshot, makePolicy({
      guaranteed: 'DEAD_CAP_ACCELERATE_CURRENT_SEASON',
      optional: 'CLEAR',
      deadCapCountsTowardGuaranteedLedger: false,
    }));

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CAP_LEDGER_SEASON_MISSING');
    expect(result.details.join(' ')).toContain('2028');
  });

  it('abstains rather than inventing release math when cap hit does not decompose to guaranteed plus optional money', () => {
    const snapshot = makeSnapshot();
    const contract = snapshot.teams[0].contracts.find((item) => item.canonicalPlayerId === 'cut-1')!;
    contract.years[1].capHit = 13;

    const result = simulateCut(snapshot, makePolicy({
      guaranteed: 'CLEAR',
      optional: 'CLEAR',
      deadCapCountsTowardGuaranteedLedger: false,
    }));

    expect(result.status).toBe('ABSTAIN');
    if (result.status !== 'ABSTAIN') return;
    expect(result.reasonCodes).toContain('CONTRACT_CAP_HIT_DECOMPOSITION_UNAVAILABLE');
  });
});
