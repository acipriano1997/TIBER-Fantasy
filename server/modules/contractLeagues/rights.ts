import { z } from 'zod';
import { usageAllowanceSchema } from './policy';

export const CONTRACT_LEAGUE_RIGHTS_STATE_SCHEMA_VERSION = 'contract-league-rights-state.v1' as const;

export const contractRightTypeSchema = z.enum([
  'AMNESTY',
  'RE_SIGN',
  'RESTRUCTURE',
  'FRANCHISE_TAG',
  'TRANSITION_TAG',
  'RFA',
  'CUSTOM',
]);

export const contractRightUsageEventSchema = z.object({
  eventId: z.string().trim().min(1),
  teamKey: z.string().trim().min(1),
  rightType: contractRightTypeSchema,
  customRightId: z.string().trim().min(1).nullable().default(null),
  season: z.number().int().min(2000).max(2200),
  occurredAt: z.string().datetime().nullable(),
  sourcePlayerName: z.string().trim().min(1).nullable(),
  canonicalPlayerId: z.string().trim().min(1).nullable(),
  quantity: z.number().int().positive().default(1),
  sourceNote: z.string().trim().min(1).nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.rightType === 'CUSTOM' && !value.customRightId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customRightId'],
      message: 'CUSTOM right usage requires customRightId.',
    });
  }
  if (value.rightType !== 'CUSTOM' && value.customRightId !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customRightId'],
      message: 'customRightId is only valid for CUSTOM right usage.',
    });
  }
});

export const contractRightResetEventSchema = z.object({
  eventId: z.string().trim().min(1),
  teamKey: z.string().trim().min(1),
  rightType: contractRightTypeSchema,
  customRightId: z.string().trim().min(1).nullable().default(null),
  effectiveSeason: z.number().int().min(2000).max(2200),
  occurredAt: z.string().datetime().nullable(),
  reason: z.enum(['POLICY_WINDOW_RESET', 'COMMISSIONER_CORRECTION', 'LEAGUE_MIGRATION', 'OTHER']),
  sourceNote: z.string().trim().min(1).nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.rightType === 'CUSTOM' && !value.customRightId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customRightId'],
      message: 'CUSTOM right reset requires customRightId.',
    });
  }
  if (value.rightType !== 'CUSTOM' && value.customRightId !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customRightId'],
      message: 'customRightId is only valid for CUSTOM right reset.',
    });
  }
});

export const contractLeagueRightsStateSchema = z.object({
  schemaVersion: z.literal(CONTRACT_LEAGUE_RIGHTS_STATE_SCHEMA_VERSION),
  leagueKey: z.string().trim().min(1),
  asOf: z.string().datetime(),
  usageEvents: z.array(contractRightUsageEventSchema),
  resetEvents: z.array(contractRightResetEventSchema),
  provenance: z.object({
    sourceKind: z.enum(['workbook', 'platform', 'commissioner_entry', 'manual', 'derived']),
    sourceDisplayName: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1).nullable(),
    sourceModifiedAt: z.string().datetime().nullable(),
    importedAt: z.string().datetime(),
    importerVersion: z.string().trim().min(1),
  }),
  validation: z.object({
    status: z.enum(['VALID', 'PARTIAL', 'REJECTED']),
    warnings: z.array(z.string()).default([]),
    unresolved: z.array(z.object({
      code: z.string().trim().min(1),
      path: z.string().trim().min(1),
      detail: z.string().trim().min(1),
    })).default([]),
  }),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const [index, event] of [...value.usageEvents, ...value.resetEvents].entries()) {
    if (ids.has(event.eventId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events', index, 'eventId'],
        message: `Duplicate right event ID ${event.eventId}.`,
      });
    }
    ids.add(event.eventId);
  }
});

export type ContractRightType = z.infer<typeof contractRightTypeSchema>;
export type ContractRightUsageEvent = z.infer<typeof contractRightUsageEventSchema>;
export type ContractRightResetEvent = z.infer<typeof contractRightResetEventSchema>;
export type ContractLeagueRightsState = z.infer<typeof contractLeagueRightsStateSchema>;
export type UsageAllowance = z.infer<typeof usageAllowanceSchema>;

export type ContractRightKey = {
  teamKey: string;
  rightType: ContractRightType;
  customRightId?: string | null;
};

export type ContractRightAvailability = {
  allowance: UsageAllowance;
  used: number;
  remaining: number;
  windowStartSeason: number | null;
  windowEndSeason: number | null;
  contributingEventIds: string[];
  resetEventId: string | null;
};

function matchesRight(
  event: Pick<ContractRightUsageEvent | ContractRightResetEvent, 'teamKey' | 'rightType' | 'customRightId'>,
  key: ContractRightKey,
) {
  return event.teamKey === key.teamKey
    && event.rightType === key.rightType
    && (event.customRightId ?? null) === (key.customRightId ?? null);
}

function latestReset(
  state: ContractLeagueRightsState,
  key: ContractRightKey,
  asOfSeason: number,
): ContractRightResetEvent | null {
  return state.resetEvents
    .filter((event) => matchesRight(event, key) && event.effectiveSeason <= asOfSeason)
    .sort((a, b) => b.effectiveSeason - a.effectiveSeason
      || (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))[0] ?? null;
}

/**
 * Derives remaining scarce-right availability from immutable usage/reset events.
 * The source ledger records history; policy owns allowance semantics.
 *
 * For ANCHORED_FROM_FIRST_USE, the policy window begins at the first qualifying
 * usage after the latest explicit reset. Once that window expires, the next
 * usage begins a new window. This avoids storing a mutable "remaining" counter.
 */
export function deriveContractRightAvailability(
  stateInput: unknown,
  key: ContractRightKey,
  allowanceInput: unknown,
  asOfSeason: number,
): ContractRightAvailability {
  const state = contractLeagueRightsStateSchema.parse(stateInput);
  const allowance = usageAllowanceSchema.parse(allowanceInput);
  if (!Number.isInteger(asOfSeason) || asOfSeason < 2000 || asOfSeason > 2200) {
    throw new Error('asOfSeason must be a calendar season.');
  }

  const reset = latestReset(state, key, asOfSeason);
  const afterReset = state.usageEvents
    .filter((event) => matchesRight(event, key) && event.season <= asOfSeason)
    .filter((event) => !reset || event.season >= reset.effectiveSeason)
    .sort((a, b) => a.season - b.season || (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''));

  if (allowance.mode === 'LIFETIME') {
    const used = afterReset.reduce((sum, event) => sum + event.quantity, 0);
    return {
      allowance,
      used,
      remaining: Math.max(0, allowance.maxUses - used),
      windowStartSeason: null,
      windowEndSeason: null,
      contributingEventIds: afterReset.map((event) => event.eventId),
      resetEventId: reset?.eventId ?? null,
    };
  }

  const width = allowance.windowSeasons!;

  if (allowance.mode === 'ROLLING') {
    const windowStartSeason = asOfSeason - width + 1;
    const contributing = afterReset.filter((event) => event.season >= windowStartSeason);
    const used = contributing.reduce((sum, event) => sum + event.quantity, 0);
    return {
      allowance,
      used,
      remaining: Math.max(0, allowance.maxUses - used),
      windowStartSeason,
      windowEndSeason: asOfSeason,
      contributingEventIds: contributing.map((event) => event.eventId),
      resetEventId: reset?.eventId ?? null,
    };
  }

  let windowStartSeason: number | null = null;
  let windowEndSeason: number | null = null;
  let contributing: ContractRightUsageEvent[] = [];

  for (const event of afterReset) {
    if (windowStartSeason === null || event.season > windowEndSeason!) {
      windowStartSeason = event.season;
      windowEndSeason = event.season + width - 1;
      contributing = [event];
    } else {
      contributing.push(event);
    }
  }

  if (windowStartSeason !== null && asOfSeason > windowEndSeason!) {
    windowStartSeason = null;
    windowEndSeason = null;
    contributing = [];
  }

  const used = contributing.reduce((sum, event) => sum + event.quantity, 0);
  return {
    allowance,
    used,
    remaining: Math.max(0, allowance.maxUses - used),
    windowStartSeason,
    windowEndSeason,
    contributingEventIds: contributing.map((event) => event.eventId),
    resetEventId: reset?.eventId ?? null,
  };
}
