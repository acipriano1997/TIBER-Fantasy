import { z } from 'zod';

export const CONTRACT_LEAGUE_POLICY_SCHEMA_VERSION = 'contract-league-policy.v1' as const;

export const contractLeaguePhaseSchema = z.enum([
  'STARTUP_AUCTION',
  'OFFSEASON',
  'ROOKIE_DRAFT',
  'POST_ROOKIE_DRAFT',
  'PRESEASON',
  'REGULAR_SEASON',
  'PLAYOFFS',
  'POSTSEASON_CLOSED',
]);

export const contractLeagueMoneyBasisSchema = z.enum([
  'GUARANTEED',
  'OPTIONAL',
  'CAP_HIT',
  'GUARANTEED_PLUS_DEAD_CAP',
  'CAP_HIT_PLUS_DEAD_CAP',
]);

export const contractDistributionSchema = z.enum(['FRONTLOADED', 'EVEN']);

export const contractAcquisitionTypeSchema = z.enum([
  'STARTUP_AUCTION',
  'FREE_AGENT',
  'ROOKIE_DRAFT',
  'RE_SIGN',
  'FRANCHISE_TAG',
  'TRANSITION_TAG',
  'TRADE_INHERITED',
]);

export const policyUnresolvedItemSchema = z.object({
  code: z.string().trim().min(1),
  path: z.string().trim().min(1),
  detail: z.string().trim().min(1),
});

export const usageAllowanceSchema = z.object({
  maxUses: z.number().int().positive(),
  mode: z.enum(['LIFETIME', 'ROLLING', 'ANCHORED_FROM_FIRST_USE']),
  windowSeasons: z.number().int().positive().nullable(),
}).superRefine((value, ctx) => {
  if (value.mode === 'LIFETIME' && value.windowSeasons !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['windowSeasons'],
      message: 'Lifetime allowances cannot have a season window.',
    });
  }
  if (value.mode !== 'LIFETIME' && value.windowSeasons === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['windowSeasons'],
      message: 'Windowed allowances require windowSeasons.',
    });
  }
});

export const contractStructurePolicySchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  guaranteedShare: z.number().min(0).max(1),
  optionalShare: z.number().min(0).max(1),
  allowedDistributions: z.array(contractDistributionSchema).min(1),
}).superRefine((value, ctx) => {
  if (Math.abs(value.guaranteedShare + value.optionalShare - 1) > 0.000001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['guaranteedShare'],
      message: 'guaranteedShare + optionalShare must equal 1.',
    });
  }
});

export const capComplianceRuleSchema = z.object({
  id: z.string().trim().min(1),
  phases: z.array(contractLeaguePhaseSchema).min(1),
  basis: contractLeagueMoneyBasisSchema,
  ceilingShare: z.number().positive().max(1).default(1),
  reserveAmount: z.number().nonnegative().nullable().default(null),
  overCeilingAllowed: z.boolean(),
  enforcement: z.enum(['BID_TIME', 'TRANSACTION_TIME', 'PHASE_DEADLINE', 'CONTINUOUS']),
});

export const capTreatmentSchema = z.object({
  rosterState: z.enum([
    'ACTIVE',
    'BENCH',
    'IR',
    'SEASON_ENDING_IR',
    'TAXI',
    'PRACTICE_SQUAD',
    'PUP',
    'SUSPENDED',
  ]),
  guaranteedMultiplier: z.number().min(0).max(1),
  optionalMultiplier: z.number().min(0).max(1),
  capHitMultiplier: z.number().min(0).max(1),
});

export const pricingFormulaSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FIXED_AMOUNT'),
    amount: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('TOP_N_POSITION_AVERAGE_PREMIUM'),
    topN: z.number().int().positive(),
    premiumRate: z.number().finite(),
  }),
  z.object({
    kind: z.literal('POSITION_RANK_MARKET_BAND_PREMIUM'),
    lookbackSeasons: z.number().int().positive(),
    premiumRate: z.number().finite(),
    rankBands: z.array(z.number().int().positive()).min(1),
    fullSeasonMinGames: z.number().int().nonnegative(),
    partialSeasonMinGames: z.number().int().nonnegative(),
    partialSeasonMethod: z.enum(['PPG_TO_FULL_SEASON_RANK', 'TOTAL_POINTS_RANK']),
    minAccreditedSeasons: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('MARKET_AUCTION'),
  }),
]);

export const contractTermRuleSchema = z.object({
  acquisitionType: contractAcquisitionTypeSchema,
  minYears: z.number().int().positive(),
  maxYears: z.number().int().positive(),
  allowedStructureIds: z.array(z.string().trim().min(1)).min(1),
  fullyOptionalMaxYears: z.number().int().positive().nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.maxYears < value.minYears) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxYears'],
      message: 'maxYears must be greater than or equal to minYears.',
    });
  }
});

export const rookieContractYearSchema = z.object({
  year: z.number().int().positive(),
  guaranteed: z.number().nonnegative(),
  optional: z.number().nonnegative(),
});

export const rookieContractOptionSchema = z.object({
  id: z.string().trim().min(1),
  years: z.array(rookieContractYearSchema).min(1),
});

export const rookieScaleEntrySchema = z.object({
  round: z.number().int().positive(),
  pickStart: z.number().int().positive().nullable(),
  pickEnd: z.number().int().positive().nullable(),
  options: z.array(rookieContractOptionSchema).min(1),
}).superRefine((value, ctx) => {
  if ((value.pickStart === null) !== (value.pickEnd === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pickStart'],
      message: 'pickStart and pickEnd must either both be null or both be set.',
    });
  }
  if (value.pickStart !== null && value.pickEnd !== null && value.pickEnd < value.pickStart) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pickEnd'],
      message: 'pickEnd must be greater than or equal to pickStart.',
    });
  }
});

export const restructurePolicySchema = z.object({
  enabled: z.boolean(),
  allowance: usageAllowanceSchema.nullable(),
  allowedPhases: z.array(contractLeaguePhaseSchema),
  optionalToGuaranteedConversionRate: z.number().positive().max(1).nullable(),
  roundingIncrement: z.number().positive().nullable(),
  minimumGuaranteedShare: z.number().min(0).max(1).nullable(),
  minimumAnnualAllocationShare: z.number().min(0).max(1).nullable(),
  guaranteedToOptionalAllowed: z.boolean(),
  tradeAcquisitionImmediateAllowed: z.boolean(),
  blockedRosterStates: z.array(z.string().trim().min(1)).default([]),
});

export const reSignPolicySchema = z.object({
  enabled: z.boolean(),
  allowance: usageAllowanceSchema.nullable(),
  allowedPhases: z.array(contractLeaguePhaseSchema),
  minYears: z.number().int().positive().nullable(),
  maxYears: z.number().int().positive().nullable(),
  allowedStructureIds: z.array(z.string().trim().min(1)),
  pricing: pricingFormulaSchema.nullable(),
});

export const amnestyPolicySchema = z.object({
  enabled: z.boolean(),
  allowance: usageAllowanceSchema.nullable(),
  clearsGuaranteedMoney: z.boolean(),
  clearsOptionalMoney: z.boolean(),
  sendsPlayerToWaivers: z.boolean(),
  reacquisitionCooldownHours: z.number().nonnegative().nullable(),
});

export const retirementPolicySchema = z.object({
  optionalMoneyVoided: z.boolean(),
  guaranteedMoneyStillDue: z.boolean(),
  guaranteedReallocationAllowed: z.boolean(),
  allowedPhases: z.array(contractLeaguePhaseSchema),
  consumesRestructureUse: z.boolean(),
});

export const cutMoneyDispositionSchema = z.enum([
  'CLEAR',
  'DEAD_CAP_PRESERVE_SCHEDULE',
  'DEAD_CAP_ACCELERATE_CURRENT_SEASON',
]);

export const cutFinancialTreatmentSchema = z.object({
  guaranteed: cutMoneyDispositionSchema,
  optional: cutMoneyDispositionSchema,
  deadCapCountsTowardGuaranteedLedger: z.boolean(),
});

export const tagPolicySchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(['FRANCHISE', 'TRANSITION', 'RFA', 'CUSTOM']),
  usesPerOffseason: z.number().int().nonnegative(),
  contractYears: z.number().int().positive().nullable(),
  pricing: pricingFormulaSchema,
  minimumGuaranteedShare: z.number().min(0).max(1).nullable(),
  taggedTeamCanBid: z.boolean().nullable(),
  matchPremiumRate: z.number().finite().nullable(),
  repeatBySameTeamAllowed: z.boolean().nullable(),
  noBidFallbackMinimumGuaranteedShare: z.number().min(0).max(1).nullable(),
});

export const policyEventTriggerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('DATE'),
    date: z.string().date(),
  }),
  z.object({
    kind: z.literal('END_OF_FANTASY_WEEK'),
    week: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('END_OF_NFL_WEEK'),
    week: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('NFL_EVENT'),
    event: z.enum(['NFL_DRAFT_END', 'NFL_FREE_AGENCY_OPEN', 'NFL_REGULAR_SEASON_START', 'NFL_SEASON_END']),
  }),
  z.object({
    kind: z.literal('COMMISSIONER_ANNOUNCEMENT'),
    eventKey: z.string().trim().min(1),
  }),
]);

export const contractLeaguePolicySchema = z.object({
  schemaVersion: z.literal(CONTRACT_LEAGUE_POLICY_SCHEMA_VERSION),
  effective: z.object({
    season: z.number().int().min(2000).max(2200),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime().nullable(),
  }),

  cap: z.object({
    defaultCeiling: z.number().positive().nullable(),
    seasonCeilings: z.array(z.object({
      season: z.number().int().min(2000).max(2200),
      ceiling: z.number().positive(),
    })).default([]),
    salaryFloor: z.number().nonnegative().nullable(),
    rollover: z.object({
      mode: z.enum(['NONE', 'FULL', 'CAPPED']),
      maxAmount: z.number().nonnegative().nullable(),
    }),
    compliance: z.array(capComplianceRuleSchema).min(1),
    rosterStateTreatments: z.array(capTreatmentSchema),
    maximumAnnualContractShareOfCap: z.number().positive().max(1).nullable(),
    salaryIncrement: z.number().positive().nullable(),
  }),

  roster: z.object({
    limitsByPhase: z.array(z.object({
      phase: contractLeaguePhaseSchema,
      maxPlayers: z.number().int().positive(),
    })),
    reserveSlots: z.array(z.object({
      state: z.enum(['IR', 'SEASON_ENDING_IR', 'TAXI', 'PRACTICE_SQUAD']),
      count: z.number().int().nonnegative(),
    })),
    viableLineupRequired: z.boolean(),
  }),

  contracts: z.object({
    structures: z.array(contractStructurePolicySchema).min(1),
    termRules: z.array(contractTermRuleSchema).min(1),
    startupTermSlots: z.array(z.object({
      years: z.number().int().positive(),
      count: z.number().int().nonnegative().nullable(),
    })).default([]),
    rookieScale: z.object({
      enabled: z.boolean(),
      entries: z.array(rookieScaleEntrySchema),
    }),
    restructure: restructurePolicySchema,
    reSign: reSignPolicySchema,
    amnesty: amnestyPolicySchema,
    retirement: retirementPolicySchema,
    tags: z.array(tagPolicySchema),
  }),

  transactions: z.object({
    cuts: z.object({
      releasingOwnerReacquisitionCooldownHours: z.number().nonnegative().nullable(),
      leagueNominationCooldownHours: z.number().nonnegative().nullable(),
      financialTreatment: cutFinancialTreatmentSchema.nullable().default(null),
    }),
    trades: z.object({
      outsideApprovalsRequired: z.number().int().nonnegative().nullable(),
      approvalPurpose: z.enum(['COLLUSION_AND_RULES_ONLY', 'VALUE_VETO_ALLOWED', 'NONE']).nullable(),
      futurePickHorizonSeasons: z.number().int().nonnegative().nullable(),
      conditionalPicksAllowed: z.boolean().nullable(),
      requiresFutureDuesThroughFurthestPick: z.boolean().nullable(),
      deadCapTransfer: z.object({
        allowed: z.boolean(),
        mode: z.enum(['FULL_ONLY', 'PARTIAL_ALLOWED']).nullable(),
      }),
      retainedGuaranteedMoney: z.object({
        allowed: z.boolean(),
        maxSharePerYear: z.number().min(0).max(1).nullable(),
        optionalMoneyRetentionAllowed: z.boolean(),
        appliesToAllRemainingYears: z.boolean().nullable(),
      }),
      capSpaceTradeAllowed: z.boolean(),
    }),
  }),

  freeAgency: z.object({
    nominationLimitPerDay: z.number().int().nonnegative().nullable(),
    bidWindowHours: z.number().positive().nullable(),
    resetsOnNewBid: z.boolean().nullable(),
    minContractYears: z.number().int().positive().nullable(),
    maxContractYears: z.number().int().positive().nullable(),
    fullyOptionalMaxYears: z.number().int().positive().nullable(),
    allowedStructureIds: z.array(z.string().trim().min(1)),
    maxAnnualValueShareOfCap: z.number().positive().max(1).nullable(),
    bidCapBasis: contractLeagueMoneyBasisSchema.nullable(),
    salaryIncrement: z.number().positive().nullable(),
    offseasonOverCapAllowed: z.boolean().nullable(),
    fullyOptionalMaxPricing: pricingFormulaSchema.nullable(),
  }),

  lifecycle: z.object({
    windows: z.array(z.object({
      id: z.string().trim().min(1),
      action: z.enum([
        'TRADE',
        'FREE_AGENCY',
        'RESTRUCTURE',
        'RE_SIGN',
        'TAG',
        'ROOKIE_DRAFT',
        'CAP_COMPLIANCE',
      ]),
      opens: policyEventTriggerSchema.nullable(),
      closes: policyEventTriggerSchema.nullable(),
    })),
  }),

  provenance: z.object({
    sourceKind: z.enum(['constitution', 'platform_settings', 'commissioner_entry', 'manual']),
    sourceDisplayName: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1).nullable(),
    sourceModifiedAt: z.string().datetime().nullable(),
    importedAt: z.string().datetime(),
    policyVersion: z.string().trim().min(1),
  }),

  validation: z.object({
    status: z.enum(['VALID', 'PARTIAL', 'REJECTED']),
    warnings: z.array(z.string()).default([]),
    unresolved: z.array(policyUnresolvedItemSchema).default([]),
  }),
}).superRefine((value, ctx) => {
  const structureIds = new Set(value.contracts.structures.map((item) => item.id));

  for (const [index, rule] of value.contracts.termRules.entries()) {
    for (const structureId of rule.allowedStructureIds) {
      if (!structureIds.has(structureId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contracts', 'termRules', index, 'allowedStructureIds'],
          message: `Unknown contract structure ${structureId}.`,
        });
      }
    }
  }

  for (const [index, structureId] of value.contracts.reSign.allowedStructureIds.entries()) {
    if (!structureIds.has(structureId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contracts', 'reSign', 'allowedStructureIds', index],
        message: `Unknown contract structure ${structureId}.`,
      });
    }
  }

  for (const [index, structureId] of value.freeAgency.allowedStructureIds.entries()) {
    if (!structureIds.has(structureId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['freeAgency', 'allowedStructureIds', index],
        message: `Unknown contract structure ${structureId}.`,
      });
    }
  }

  if (value.freeAgency.minContractYears !== null
    && value.freeAgency.maxContractYears !== null
    && value.freeAgency.maxContractYears < value.freeAgency.minContractYears) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['freeAgency', 'maxContractYears'],
      message: 'maxContractYears must be greater than or equal to minContractYears.',
    });
  }
});

export type ContractLeaguePolicy = z.infer<typeof contractLeaguePolicySchema>;

export function validateContractLeaguePolicy(input: unknown) {
  return contractLeaguePolicySchema.safeParse(input);
}
