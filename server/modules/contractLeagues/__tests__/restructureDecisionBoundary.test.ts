import { contractLeagueSnapshotSchema } from '../contracts';
import { contractLeaguePolicySchema } from '../policy';
import { contractLeagueRightsStateSchema } from '../rights';
import { simulateKnownAtContractRestructure } from '../restructureDecisionBoundary';

function snapshot() {
  return contractLeagueSnapshotSchema.parse({
    schemaVersion: 'contract-league-snapshot.v1',
    league: {
      sourceLeagueName: 'Synthetic Boundary League',
      platform: 'manual',
      platformLeagueId: null,
      season: 2026,
      salaryCap: 1000,
      scoring: null,
      lineup: [],
    },
    teams: [{
      sourceTeamName: 'Synthetic Team',
      platformRosterId: null,
      contracts: [
        {
          sourcePlayerName: 'Target Player',
          canonicalPlayerId: 'target-1',
          position: 'WR',
          status: 'ACTIVE',
          totalValue: 300,
          aav: 300,
          years: [{ season: 2026, guaranteed: 200, optional: 100, capHit: 300 }],
          metadata: { notes: [] },
        },
        {
          sourcePlayerName: 'Other Player',
          canonicalPlayerId: 'other-1',
          position: 'RB',
          status: 'ACTIVE',
          totalValue: 200,
          aav: 200,
          years: [{ season: 2026, guaranteed: 50, optional: 150, capHit: 200 }],
          metadata: { notes: [] },
        },
      ],
      deadCap: [],
      cap: [{
        season: 2026,
        totalGuaranteed: 250,
        totalCapHit: 500,
        capAfterGuarantees: 750,
        capRemaining: 500,
      }],
    }],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic boundary source',
      sourceLocator: null,
      sourceModifiedAt: '2026-01-02T00:00:00.000Z',
      importedAt: '2026-01-03T00:00:00.000Z',
      importerVersion: 'synthetic-boundary.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function policy() {
  return contractLeaguePolicySchema.parse({
    schemaVersion: 'contract-league-policy.v1',
    effective: { season: 2026, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveUntil: null },
    cap: {
      defaultCeiling: 260,
      seasonCeilings: [],
      salaryFloor: null,
      rollover: { mode: 'NONE', maxAmount: null },
      compliance: [{
        id: 'optional-limit',
        phases: ['OFFSEASON'],
        basis: 'OPTIONAL',
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
        id: 'synthetic-structure',
        displayName: 'Synthetic Structure',
        guaranteedShare: 0.5,
        optionalShare: 0.5,
        allowedDistributions: ['EVEN'],
      }],
      termRules: [{
        acquisitionType: 'FREE_AGENT',
        minYears: 1,
        maxYears: 2,
        allowedStructureIds: ['synthetic-structure'],
        fullyOptionalMaxYears: null,
      }],
      startupTermSlots: [],
      rookieScale: { enabled: false, entries: [] },
      restructure: {
        enabled: true,
        allowance: { maxUses: 2, mode: 'LIFETIME', windowSeasons: null },
        allowedPhases: ['OFFSEASON'],
        optionalToGuaranteedConversionRate: 0.5,
        roundingIncrement: 50,
        minimumGuaranteedShare: 0.4,
        minimumAnnualAllocationShare: null,
        guaranteedToOptionalAllowed: true,
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
    lifecycle: { windows: [{ id: 'restructure', action: 'RESTRUCTURE', opens: null, closes: null }] },
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic boundary rules',
      sourceRef: null,
      sourceModifiedAt: '2026-01-02T00:00:00.000Z',
      importedAt: '2026-01-03T00:00:00.000Z',
      policyVersion: 'synthetic-boundary-policy.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function rights() {
  return contractLeagueRightsStateSchema.parse({
    schemaVersion: 'contract-league-rights-state.v1',
    leagueKey: 'boundary-league',
    asOf: '2026-01-04T00:00:00.000Z',
    usageEvents: [],
    resetEvents: [],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic boundary rights',
      sourceRef: null,
      sourceModifiedAt: '2026-01-04T00:00:00.000Z',
      importedAt: '2026-01-04T00:00:00.000Z',
      importerVersion: 'synthetic-boundary-rights.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

function context() {
  return {
    leagueKey: 'boundary-league',
    decisionAt: '2026-01-10T00:00:00.000Z',
    phase: 'OFFSEASON' as const,
    teamKey: 'boundary-team',
    sourceTeamName: 'Synthetic Team',
    restructureWindowStatus: 'OPEN' as const,
    rightsState: rights(),
  };
}

describe('contract restructure decision boundary', () => {
  it('uses whole-team optional obligations for OPTIONAL compliance', () => {
    const result = simulateKnownAtContractRestructure(snapshot(), policy(), context(), {
      player: { canonicalPlayerId: 'target-1' },
      proposedYears: [{ season: 2026, guaranteed: 120, optional: 130, capHit: 250 }],
    });

    expect(result.status).toBe('READY');
    if (result.status !== 'READY') return;
    expect(result.legal).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain('CAP_CEILING_EXCEEDED');
    expect(result.rightEffect).toBeNull();
  });

  it('abstains when reserve-state multipliers mean snapshot amounts may not be nominal', () => {
    const state = snapshot();
    state.teams[0].contracts[0].status = 'SEASON_ENDING_IR';
    const rules = policy();

    const result = simulateKnownAtContractRestructure(state, rules, context(), {
      player: { canonicalPlayerId: 'target-1' },
      proposedYears: [{ season: 2026, guaranteed: 150, optional: 100, capHit: 250 }],
    });

    expect(result.status).toBe('ABSTAIN');
    if (result.status === 'ABSTAIN') {
      expect(result.reasonCodes).toContain('RESTRUCTURE_NOMINAL_AMOUNT_UNAVAILABLE');
    }
  });

  it('allows identity-treated reserve state to reach the pure restructure primitive', () => {
    const state = snapshot();
    state.teams[0].contracts[0].status = 'IR';
    const rules = policy();

    const result = simulateKnownAtContractRestructure(state, rules, context(), {
      player: { canonicalPlayerId: 'target-1' },
      proposedYears: [{ season: 2026, guaranteed: 150, optional: 100, capHit: 250 }],
    });

    expect(result.status).toBe('READY');
  });
});
