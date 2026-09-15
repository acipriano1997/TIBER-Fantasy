export type ContractGuaranteeStructure = {
  id: 'fully_guaranteed' | 'heavy_guarantees' | 'mid' | 'heavy_option' | 'fully_optional';
  guaranteedPct: number;
  optionalPct: number;
};

export type PositionRateTable = Record<string, number>;

export type ContractLeagueRateSnapshot = {
  season: number;
  sourceWorkbookId: string;
  reSignAavByPositionAndFinishBucket: Record<'QB' | 'RB' | 'WR' | 'TE', PositionRateTable>;
  franchiseTagAav: Record<'QB' | 'RB' | 'WR' | 'TE', number>;
};

export type ContractLeagueRuleProfile = {
  profileVersion: 'contract-league-profile.v1';
  id: '4th-and-long' | 'dynasty-nerds';
  leagueName: string;
  aliases: string[];
  sourceFiles: {
    operationalWorkbook: {
      driveFileId: string;
      fileName: string;
      role: 'live_contract_roster_and_rate_tables';
    };
    writtenConstitution: null | {
      driveFileId: string;
      fileName: string;
      role: 'written_policy';
    };
  };
  sourcePolicy: {
    neverBorrowRulesFromAnotherLeague: true;
    refreshWorkbookBeforeCapOrContractDecision: true;
    workbookOwnsLiveNumericTables: true;
    writtenPolicyOwnsNonNumericPolicyWhenNotInConflict: true;
    failClosedOnMaterialConflict: true;
  };
  verifiedCore: {
    teamCount: number;
    salaryCap: number;
    rookieDraftRounds: number;
  };
  contractEngine: {
    guaranteeStructures: ContractGuaranteeStructure[];
    distributionStyles: Array<'frontloaded' | 'mid_even'>;
    calculatorMaxTotalValue: number;
  };
  leagueSpecificPolicy: Record<string, unknown>;
  currentRateSnapshot: ContractLeagueRateSnapshot;
  knownConflicts: Array<{
    rule: string;
    sources: string[];
    handling: 'abstain_until_resolved';
  }>;
  unknownOrUnverified: string[];
};

const sharedGuaranteeStructures: ContractGuaranteeStructure[] = [
  { id: 'fully_guaranteed', guaranteedPct: 1, optionalPct: 0 },
  { id: 'heavy_guarantees', guaranteedPct: 0.8, optionalPct: 0.2 },
  { id: 'mid', guaranteedPct: 0.5, optionalPct: 0.5 },
  { id: 'heavy_option', guaranteedPct: 0.2, optionalPct: 0.8 },
  { id: 'fully_optional', guaranteedPct: 0, optionalPct: 1 },
];

export const fourthAndLongProfile: ContractLeagueRuleProfile = {
  profileVersion: 'contract-league-profile.v1',
  id: '4th-and-long',
  leagueName: '4th and Long',
  aliases: ['4th & Long', '4th and Long Dynasty Fantasy Football League'],
  sourceFiles: {
    operationalWorkbook: {
      driveFileId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma',
      fileName: '4th and Long 2026 Rosters.xlsx',
      role: 'live_contract_roster_and_rate_tables',
    },
    writtenConstitution: {
      driveFileId: '1XHsLPN2qwbw4DZ_I75hBGEffMvAPRRBXwhWTHxjcrPs',
      fileName: '4th and Long Constitution',
      role: 'written_policy',
    },
  },
  sourcePolicy: {
    neverBorrowRulesFromAnotherLeague: true,
    refreshWorkbookBeforeCapOrContractDecision: true,
    workbookOwnsLiveNumericTables: true,
    writtenPolicyOwnsNonNumericPolicyWhenNotInConflict: true,
    failClosedOnMaterialConflict: true,
  },
  verifiedCore: {
    teamCount: 14,
    salaryCap: 250_000_000,
    rookieDraftRounds: 3,
  },
  contractEngine: {
    guaranteeStructures: sharedGuaranteeStructures,
    distributionStyles: ['frontloaded', 'mid_even'],
    calculatorMaxTotalValue: 312_500_000,
  },
  leagueSpecificPolicy: {
    annualLeagueFee: 25,
    host: ['Sleeper', 'Discord'],
    roster: {
      inSeasonPlayers: 25,
      offseasonPlayers: 30,
      irSlots: 5,
      seasonEndingIrSlots: 2,
      normalIrSlots: 3,
      seasonEndingIrSalarySavingsPct: 0.5,
      irEligibleDesignations: ['PUP', 'COVID', 'IR'],
      outDesignationEligible: false,
      suspensionsEligible: false,
    },
    lineup: {
      QB: 1,
      RB: 2,
      WR: 3,
      TE: 1,
      FLEX: 2,
      SUPER_FLEX: 1,
    },
    scoring: {
      reception: 1,
      tightEndReceptionBonus: 0.75,
      passYardsPerPoint: 25,
      passTd: 4,
      interceptionThrown: -2,
      rushYardsPerPoint: 10,
      rushTd: 6,
      receivingYardsPerPoint: 10,
      receivingTd: 6,
      fumbleLost: -2,
    },
    startupContractSlotLimits: {
      fiveYear: 1,
      fourYear: 3,
      threeYear: 5,
      oneAndTwoYear: 'unlimited',
    },
    freeAgencyContractYears: { min: 1, max: 4 },
    fullyOptionalFreeAgentContractMaxYears: 1,
    maxAnnualContractPctOfCap: 0.25,
    restructures: {
      allowance: 4,
      rollingYears: 5,
      offseasonOnly: true,
      optionalToGuaranteedConversionFactor: 0.67,
      minimumGuaranteedPctAfterRestructure: 0.5,
      minimumPctOfGuaranteedAndOptionalMoneyPerYear: 0.1,
    },
    reSigns: {
      allowance: 8,
      rollingYears: 5,
      constitutionTermYears: { min: 2, max: 4 },
      constitutionAllowedStructures: ['heavy_guarantees', 'fully_guaranteed'],
      historicalRankingWindowSeasons: 3,
    },
    amnesty: {
      lifetimePerTeam: 1,
      rebidLockoutDays: 30,
    },
    tags: {
      franchisePerOffseason: 1,
      transitionPerOffseason: 1,
      franchiseTermYears: 1,
      franchiseGuaranteedPct: 1,
      franchiseFormula: 'average top five contracts at position plus 20 percent',
      transitionMinimumGuaranteedPct: 0.5,
      transitionMatchPremiumPct: 0.1,
    },
    trades: {
      futureRookieDraftYears: 2,
      conditionalPicksAllowed: false,
      deadCapTradeRequiresFullAmount: true,
      maxRetainedGuaranteedSalaryPctPerYear: 0.5,
      optionalMoneyRetentionAllowed: false,
      futureYearFeesRequiredWhenFuturePicksMove: true,
    },
  },
  currentRateSnapshot: {
    season: 2026,
    sourceWorkbookId: '1htufwr5A8L2TB8AFquI8tGnMNZpjyQma',
    reSignAavByPositionAndFinishBucket: {
      QB: { top5: 44_500_000, top10: 37_500_000, top15: 29_000_000, top20: 23_500_000, top25: 20_000_000, top30: 12_000_000, top40: 4_000_000, top50: 1_500_000 },
      RB: { top5: 33_500_000, top10: 26_000_000, top15: 23_000_000, top20: 20_000_000, top25: 15_000_000, top30: 12_500_000, top40: 9_000_000, top50: 5_000_000, top60: 3_500_000, top70: 2_000_000 },
      WR: { top5: 56_000_000, top10: 41_000_000, top15: 35_000_000, top20: 27_000_000, top25: 22_500_000, top30: 19_500_000, top40: 17_000_000, top50: 13_500_000, top60: 8_500_000, top70: 5_000_000, top80: 3_000_000, top90: 2_000_000 },
      TE: { top5: 30_500_000, top10: 16_000_000, top15: 11_000_000, top20: 8_000_000, top25: 5_500_000, top30: 3_000_000 },
    },
    franchiseTagAav: { QB: 53_500_000, RB: 40_000_000, WR: 67_000_000, TE: 36_500_000 },
  },
  knownConflicts: [
    {
      rule: 'contract_re_sign_term_length',
      sources: [
        'Constitution says re-signs may be 2-4 years.',
        '2026 workbook Re-Sign Values tab says 3-5 years using Fully Guaranteed or Heavily Guaranteed structures.',
      ],
      handling: 'abstain_until_resolved',
    },
  ],
  unknownOrUnverified: [],
};

export const dynastyNerdsProfile: ContractLeagueRuleProfile = {
  profileVersion: 'contract-league-profile.v1',
  id: 'dynasty-nerds',
  leagueName: 'Dynasty Nerds',
  aliases: ['Dynasty Nerds Contract League'],
  sourceFiles: {
    operationalWorkbook: {
      driveFileId: '1ooXfcjmikTjeZpHsHG216UvGUveFul9a',
      fileName: 'Dynasty Nerds 2026 Rosters.xlsx',
      role: 'live_contract_roster_and_rate_tables',
    },
    writtenConstitution: null,
  },
  sourcePolicy: {
    neverBorrowRulesFromAnotherLeague: true,
    refreshWorkbookBeforeCapOrContractDecision: true,
    workbookOwnsLiveNumericTables: true,
    writtenPolicyOwnsNonNumericPolicyWhenNotInConflict: true,
    failClosedOnMaterialConflict: true,
  },
  verifiedCore: {
    teamCount: 14,
    salaryCap: 250_000_000,
    rookieDraftRounds: 4,
  },
  contractEngine: {
    guaranteeStructures: sharedGuaranteeStructures,
    distributionStyles: ['frontloaded', 'mid_even'],
    calculatorMaxTotalValue: 312_500_000,
  },
  leagueSpecificPolicy: {
    reSigns: {
      workbookTermYears: { min: 3, max: 5 },
      workbookAllowedStructures: ['fully_guaranteed', 'heavy_guarantees'],
    },
    franchiseTag: {
      termYears: 1,
      guaranteedPct: 1,
    },
    rookieDraft: {
      rounds: 4,
      firstRoundUsesFiveYearScale: true,
      thirdAndFourthRoundPlanValues: {
        A: [2_000_000, 3_000_000, 5_000_000, 10_000_000],
        B: [2_000_000, 3_000_000, 8_000_000],
        C: [1_500_000, 6_000_000],
      },
    },
  },
  currentRateSnapshot: {
    season: 2026,
    sourceWorkbookId: '1ooXfcjmikTjeZpHsHG216UvGUveFul9a',
    reSignAavByPositionAndFinishBucket: {
      QB: { top5: 39_000_000, top10: 27_000_000, top15: 21_000_000, top20: 16_000_000, top25: 11_000_000, top30: 7_500_000, top40: 3_500_000 },
      RB: { top5: 36_500_000, top10: 21_000_000, top15: 17_500_000, top20: 14_000_000, top25: 12_000_000, top30: 10_500_000, top40: 7_000_000, top50: 5_000_000, top60: 2_000_000 },
      WR: { top5: 43_000_000, top10: 32_000_000, top15: 28_500_000, top20: 23_500_000, top25: 19_000_000, top30: 15_500_000, top40: 13_500_000, top50: 9_000_000, top60: 6_500_000, top70: 5_000_000, top80: 2_500_000, top90: 1_000_000 },
      TE: { top5: 25_000_000, top10: 15_500_000, top15: 11_000_000, top20: 8_000_000, top25: 4_500_000, top30: 2_000_000 },
    },
    franchiseTagAav: { QB: 49_000_000, RB: 45_500_000, WR: 54_000_000, TE: 31_500_000 },
  },
  knownConflicts: [],
  unknownOrUnverified: [
    'No separate Dynasty Nerds constitution/rules document was located in connected Drive as of 2026-09-15.',
    'Do not inherit 4th and Long roster, scoring, IR, trade-retention, restructure, amnesty, transition-tag, fee, or re-sign quota rules without Dynasty Nerds-specific evidence.',
    'Sleeper scoring/roster settings should be synced directly when the Dynasty Nerds league identity is resolved.',
  ],
};

export const contractLeagueProfiles = [fourthAndLongProfile, dynastyNerdsProfile] as const;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function resolveContractLeagueRuleProfile(input: {
  leagueName?: string | null;
  workbookId?: string | null;
}): ContractLeagueRuleProfile | null {
  const byWorkbook = input.workbookId
    ? contractLeagueProfiles.find((profile) => profile.sourceFiles.operationalWorkbook.driveFileId === input.workbookId)
    : undefined;

  const nameKey = input.leagueName ? normalizeKey(input.leagueName) : null;
  const byName = nameKey
    ? contractLeagueProfiles.find((profile) =>
        [profile.leagueName, ...profile.aliases].some((name) => normalizeKey(name) === nameKey),
      )
    : undefined;

  if (byWorkbook && byName && byWorkbook.id !== byName.id) {
    throw new Error(
      `Contract league identity conflict: workbook ${input.workbookId} resolves to ${byWorkbook.leagueName}, ` +
        `but league name ${input.leagueName} resolves to ${byName.leagueName}.`,
    );
  }

  return byWorkbook ?? byName ?? null;
}

export function assertContractRuleUsable(profile: ContractLeagueRuleProfile, rule: string): void {
  const conflict = profile.knownConflicts.find((item) => item.rule === rule);
  if (conflict) {
    throw new Error(
      `${profile.leagueName} rule ${rule} is unresolved across authoritative sources; abstain until clarified.`,
    );
  }
}
