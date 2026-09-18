import { contractLeagueSnapshotSchema } from '../contracts';
import { contractLeaguePolicySchema } from '../policy';
import { contractLeagueRightsStateSchema } from '../rights';

export function makeBoundarySnapshot() {
  return contractLeagueSnapshotSchema.parse({
    schemaVersion: 'contract-league-snapshot.v1',
    league: {
      sourceLeagueName: 'Boundary Lab',
      platform: 'manual',
      platformLeagueId: null,
      season: 2026,
      salaryCap: 500,
      scoring: null,
      lineup: [],
    },
    teams: [{
      sourceTeamName: 'Synthetic Team',
      platformRosterId: null,
      contracts: [{
        sourcePlayerName: 'Synthetic Player',
        canonicalPlayerId: 'synthetic-player',
        position: 'WR',
        status: 'ACTIVE',
        totalValue: 12,
        aav: 12,
        years: [{ season: 2026, guaranteed: 7, optional: 5, capHit: 12 }],
        metadata: { notes: [] },
      }],
      deadCap: [],
      cap: [{
        season: 2026,
        totalGuaranteed: 7,
        totalCapHit: 12,
        capAfterGuarantees: 493,
        capRemaining: 488,
      }],
    }],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic snapshot source',
      sourceLocator: null,
      sourceModifiedAt: '2026-09-15T11:40:00.000Z',
      importedAt: '2026-09-15T12:00:00.000Z',
      importerVersion: 'boundary-fixture.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

export function makeBoundaryPolicy() {
  return contractLeaguePolicySchema.parse({
    schemaVersion: 'contract-league-policy.v1',
    effective: {
      season: 2026,
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: null,
    },
    cap: {
      defaultCeiling: 500,
      seasonCeilings: [],
      salaryFloor: null,
      rollover: { mode: 'NONE', maxAmount: null },
      compliance: [{
        id: 'synthetic-cap',
        phases: ['REGULAR_SEASON'],
        basis: 'CAP_HIT_PLUS_DEAD_CAP',
        ceilingShare: 1,
        reserveAmount: null,
        overCeilingAllowed: false,
        enforcement: 'TRANSACTION_TIME',
      }],
      rosterStateTreatments: [
        { rosterState: 'ACTIVE', guaranteedMultiplier: 1, optionalMultiplier: 1, capHitMultiplier: 1 },
      ],
      maximumAnnualContractShareOfCap: null,
      salaryIncrement: null,
    },
    roster: {
      limitsByPhase: [{ phase: 'REGULAR_SEASON', maxPlayers: 5 }],
      reserveSlots: [],
      viableLineupRequired: false,
    },
    contracts: {
      structures: [{
        id: 'synthetic',
        displayName: 'Synthetic',
        guaranteedShare: 0.5,
        optionalShare: 0.5,
        allowedDistributions: ['EVEN'],
      }],
      termRules: [{
        acquisitionType: 'FREE_AGENT',
        minYears: 1,
        maxYears: 2,
        allowedStructureIds: ['synthetic'],
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
        optionalMoneyVoided: false,
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
    lifecycle: { windows: [] },
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic policy source',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T11:45:00.000Z',
      importedAt: '2026-09-15T12:05:00.000Z',
      policyVersion: 'boundary-fixture-policy.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

export function makeBoundaryRights() {
  return contractLeagueRightsStateSchema.parse({
    schemaVersion: 'contract-league-rights-state.v1',
    leagueKey: 'league-boundary',
    asOf: '2026-09-15T12:10:00.000Z',
    usageEvents: [],
    resetEvents: [],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic rights source',
      sourceRef: null,
      sourceModifiedAt: '2026-09-15T11:50:00.000Z',
      importedAt: '2026-09-15T12:12:00.000Z',
      importerVersion: 'boundary-rights.v1',
    },
    validation: { status: 'VALID', warnings: [], unresolved: [] },
  });
}

export function makeBoundaryContext() {
  return {
    leagueKey: 'league-boundary',
    decisionAt: '2026-09-15T12:30:00.000Z',
    phase: 'REGULAR_SEASON' as const,
    teamBindings: [{ teamKey: 'team-boundary', sourceTeamName: 'Synthetic Team' }],
    rightsState: makeBoundaryRights(),
  };
}
