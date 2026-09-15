import {
  contractLeaguePolicySchema,
  validateContractLeaguePolicy,
  type ContractLeaguePolicy,
} from '../policy';

function makePolicy(): ContractLeaguePolicy {
  return contractLeaguePolicySchema.parse({
    schemaVersion: 'contract-league-policy.v1',
    effective: {
      season: 2034,
      effectiveFrom: '2034-01-01T00:00:00.000Z',
      effectiveUntil: null,
    },
    cap: {
      defaultCeiling: 123_000_000,
      seasonCeilings: [],
      salaryFloor: null,
      rollover: { mode: 'NONE', maxAmount: null },
      compliance: [
        {
          id: 'synthetic-in-season-cap',
          phases: ['REGULAR_SEASON'],
          basis: 'CAP_HIT_PLUS_DEAD_CAP',
          ceilingShare: 0.93,
          reserveAmount: 2_750_000,
          overCeilingAllowed: false,
          enforcement: 'CONTINUOUS',
        },
      ],
      rosterStateTreatments: [
        {
          rosterState: 'ACTIVE',
          guaranteedMultiplier: 1,
          optionalMultiplier: 1,
          capHitMultiplier: 1,
        },
        {
          rosterState: 'SEASON_ENDING_IR',
          guaranteedMultiplier: 0.4,
          optionalMultiplier: 0.4,
          capHitMultiplier: 0.4,
        },
      ],
      maximumAnnualContractShareOfCap: 0.31,
      salaryIncrement: 1_250_000,
    },
    roster: {
      limitsByPhase: [
        { phase: 'REGULAR_SEASON', maxPlayers: 27 },
        { phase: 'OFFSEASON', maxPlayers: 33 },
      ],
      reserveSlots: [
        { state: 'IR', count: 4 },
        { state: 'SEASON_ENDING_IR', count: 1 },
      ],
      viableLineupRequired: true,
    },
    contracts: {
      structures: [
        {
          id: 'synthetic-heavy',
          displayName: 'Synthetic Heavy',
          guaranteedShare: 0.7,
          optionalShare: 0.3,
          allowedDistributions: ['FRONTLOADED', 'EVEN'],
        },
        {
          id: 'synthetic-light',
          displayName: 'Synthetic Light',
          guaranteedShare: 0.35,
          optionalShare: 0.65,
          allowedDistributions: ['EVEN'],
        },
      ],
      termRules: [
        {
          acquisitionType: 'FREE_AGENT',
          minYears: 2,
          maxYears: 5,
          allowedStructureIds: ['synthetic-heavy', 'synthetic-light'],
          fullyOptionalMaxYears: null,
        },
      ],
      startupTermSlots: [],
      rookieScale: { enabled: false, entries: [] },
      restructure: {
        enabled: true,
        allowance: {
          maxUses: 3,
          mode: 'ANCHORED_FROM_FIRST_USE',
          windowSeasons: 4,
        },
        allowedPhases: ['OFFSEASON'],
        optionalToGuaranteedConversionRate: 0.61,
        roundingIncrement: 1_250_000,
        minimumGuaranteedShare: 0.42,
        minimumAnnualAllocationShare: 0.07,
        guaranteedToOptionalAllowed: false,
        tradeAcquisitionImmediateAllowed: true,
        blockedRosterStates: ['SEASON_ENDING_IR'],
      },
      reSign: {
        enabled: true,
        allowance: {
          maxUses: 6,
          mode: 'ANCHORED_FROM_FIRST_USE',
          windowSeasons: 4,
        },
        allowedPhases: ['OFFSEASON'],
        minYears: 1,
        maxYears: 5,
        allowedStructureIds: ['synthetic-heavy'],
        pricing: {
          kind: 'POSITION_RANK_MARKET_BAND_PREMIUM',
          lookbackSeasons: 2,
          premiumRate: 0.11,
          rankBands: [7, 13, 21, 34],
          fullSeasonMinGames: 12,
          partialSeasonMinGames: 4,
          partialSeasonMethod: 'PPG_TO_FULL_SEASON_RANK',
          minAccreditedSeasons: 1,
        },
      },
      amnesty: {
        enabled: true,
        allowance: { maxUses: 2, mode: 'LIFETIME', windowSeasons: null },
        clearsGuaranteedMoney: true,
        clearsOptionalMoney: true,
        sendsPlayerToWaivers: true,
        reacquisitionCooldownHours: 168,
      },
      retirement: {
        optionalMoneyVoided: true,
        guaranteedMoneyStillDue: true,
        guaranteedReallocationAllowed: true,
        allowedPhases: ['OFFSEASON'],
        consumesRestructureUse: false,
      },
      tags: [
        {
          id: 'synthetic-tag',
          type: 'CUSTOM',
          usesPerOffseason: 2,
          contractYears: 2,
          pricing: {
            kind: 'TOP_N_POSITION_AVERAGE_PREMIUM',
            topN: 7,
            premiumRate: 0.08,
          },
          minimumGuaranteedShare: 0.7,
          taggedTeamCanBid: true,
          matchPremiumRate: 0.06,
          repeatBySameTeamAllowed: true,
          noBidFallbackMinimumGuaranteedShare: 0.6,
        },
      ],
    },
    transactions: {
      cuts: {
        releasingOwnerReacquisitionCooldownHours: 240,
        leagueNominationCooldownHours: 18,
      },
      trades: {
        outsideApprovalsRequired: 1,
        approvalPurpose: 'COLLUSION_AND_RULES_ONLY',
        futurePickHorizonSeasons: 3,
        conditionalPicksAllowed: true,
        requiresFutureDuesThroughFurthestPick: false,
        deadCapTransfer: { allowed: true, mode: 'PARTIAL_ALLOWED' },
        retainedGuaranteedMoney: {
          allowed: true,
          maxSharePerYear: 0.35,
          optionalMoneyRetentionAllowed: true,
          appliesToAllRemainingYears: false,
        },
        capSpaceTradeAllowed: true,
      },
    },
    freeAgency: {
      nominationLimitPerDay: 3,
      bidWindowHours: 18,
      resetsOnNewBid: true,
      minContractYears: 2,
      maxContractYears: 5,
      fullyOptionalMaxYears: 2,
      allowedStructureIds: ['synthetic-heavy', 'synthetic-light'],
      maxAnnualValueShareOfCap: 0.31,
      bidCapBasis: 'CAP_HIT_PLUS_DEAD_CAP',
      salaryIncrement: 1_250_000,
      offseasonOverCapAllowed: false,
      fullyOptionalMaxPricing: null,
    },
    lifecycle: {
      windows: [
        {
          id: 'synthetic-trade-deadline',
          action: 'TRADE',
          opens: null,
          closes: { kind: 'END_OF_FANTASY_WEEK', week: 12 },
        },
      ],
    },
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Synthetic Policy Fixture',
      sourceRef: null,
      sourceModifiedAt: null,
      importedAt: '2034-02-03T04:05:06.000Z',
      policyVersion: 'synthetic-policy-1',
    },
    validation: {
      status: 'VALID',
      warnings: [],
      unresolved: [],
    },
  });
}

describe('contract league policy boundary', () => {
  it('represents cap, contract, roster, transaction, auction, and lifecycle rules separately from snapshot state', () => {
    const policy = makePolicy();

    expect(policy.schemaVersion).toBe('contract-league-policy.v1');
    expect(policy.contracts.restructure.allowance?.maxUses).toBe(3);
    expect(policy.transactions.trades.retainedGuaranteedMoney.maxSharePerYear).toBe(0.35);
    expect(policy.cap.rosterStateTreatments.find(
      (item) => item.rosterState === 'SEASON_ENDING_IR',
    )?.capHitMultiplier).toBe(0.4);
  });

  it('rejects contract structures whose guaranteed and optional shares do not sum to one', () => {
    const policy = structuredClone(makePolicy());
    policy.contracts.structures[0].guaranteedShare = 0.8;

    expect(validateContractLeaguePolicy(policy).success).toBe(false);
  });

  it('rejects references to unknown contract structures', () => {
    const policy = structuredClone(makePolicy());
    policy.freeAgency.allowedStructureIds.push('not-defined');

    expect(validateContractLeaguePolicy(policy).success).toBe(false);
  });

  it('rejects a lifetime usage allowance with a rolling window attached', () => {
    const policy = structuredClone(makePolicy());
    policy.contracts.amnesty.allowance = {
      maxUses: 2,
      mode: 'LIFETIME',
      windowSeasons: 4,
    };

    expect(validateContractLeaguePolicy(policy).success).toBe(false);
  });

  it('rejects invalid contract term ranges', () => {
    const policy = structuredClone(makePolicy());
    policy.contracts.termRules[0].minYears = 5;
    policy.contracts.termRules[0].maxYears = 2;

    expect(validateContractLeaguePolicy(policy).success).toBe(false);
  });

  it('allows explicit PARTIAL policy state instead of inventing missing rule values', () => {
    const policy = structuredClone(makePolicy());
    policy.validation = {
      status: 'PARTIAL',
      warnings: ['Synthetic missing rule'],
      unresolved: [
        {
          code: 'RULE_UNAVAILABLE',
          path: 'freeAgency.fullyOptionalMaxPricing',
          detail: 'Authoritative pricing source is not available.',
        },
      ],
    };
    policy.freeAgency.fullyOptionalMaxPricing = null;

    const result = validateContractLeaguePolicy(policy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validation.status).toBe('PARTIAL');
    }
  });
});
