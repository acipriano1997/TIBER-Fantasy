import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';

export const CAP_SCENARIO_SCHEMA_VERSION = 'contract-cap-scenario.v1' as const;

const playerRefSchema = z.object({
  canonicalPlayerId: z.string().trim().min(1).nullable().optional(),
  sourcePlayerName: z.string().trim().min(1).nullable().optional(),
}).superRefine((value, ctx) => {
  if (!value.canonicalPlayerId && !value.sourcePlayerName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Player reference requires canonicalPlayerId or sourcePlayerName.',
    });
  }
});

export const capScenarioAssumptionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('RETAIN_PLAYER'), player: playerRefSchema, throughSeason: z.number().int().min(2000).max(2200).nullable() }),
  z.object({ type: z.literal('TARGET_ACQUISITION'), player: playerRefSchema, annualSalary: z.number().finite().nonnegative(), years: z.number().int().positive(), startSeason: z.number().int().min(2000).max(2200) }),
  z.object({ type: z.literal('RESERVE_BUDGET'), category: z.string().trim().min(1), amount: z.number().finite().nonnegative(), season: z.number().int().min(2000).max(2200) }),
  z.object({ type: z.literal('FUTURE_CAP'), season: z.number().int().min(2000).max(2200), amount: z.number().finite().positive() }),
  z.object({ type: z.literal('ROLLOVER'), season: z.number().int().min(2000).max(2200), amount: z.number().finite().nonnegative() }),
  z.object({ type: z.literal('PRESERVE_RIGHT'), rightType: z.enum(['AMNESTY', 'RE_SIGN', 'RESTRUCTURE', 'TAG']), minimumRemaining: z.number().int().nonnegative() }),
]);

export const capScenarioConstraintSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CAP_COMPLIANT_ALL_ENFORCED_SEASONS') }),
  z.object({ type: z.literal('MINIMUM_CAP_ROOM'), season: z.number().int().min(2000).max(2200), amount: z.number().finite().nonnegative() }),
  z.object({ type: z.literal('PRESERVE_RIGHTS'), rightType: z.enum(['AMNESTY', 'RE_SIGN', 'RESTRUCTURE', 'TAG']), minimumRemaining: z.number().int().nonnegative() }),
  z.object({ type: z.literal('PROTECT_PLAYER'), player: playerRefSchema, disallowActions: z.array(z.enum(['CUT', 'TRADE', 'RESTRUCTURE', 'AMNESTY'])).min(1) }),
  z.object({ type: z.literal('KEEP_PLAYER_THROUGH'), player: playerRefSchema, season: z.number().int().min(2000).max(2200) }),
  z.object({ type: z.literal('MINIMUM_CCF_LINEUP_VALUE'), metricId: z.string().trim().min(1), value: z.number().finite() }),
  z.object({ type: z.literal('MAXIMUM_DEAD_CAP'), amount: z.number().finite().nonnegative(), season: z.number().int().min(2000).max(2200).nullable() }),
  z.object({ type: z.literal('MAXIMUM_GUARANTEED_EXPOSURE'), amount: z.number().finite().nonnegative(), season: z.number().int().min(2000).max(2200).nullable() }),
]);

export const capScenarioObjectiveSchema = z.enum([
  'RECOMMENDED_MINIMUM_TOTAL_REGRET',
  'PRESERVE_CONTENDER_STRENGTH',
  'PROTECT_FUTURE_FLEXIBILITY',
  'MAXIMUM_IMMEDIATE_RELIEF',
  'MINIMUM_DEAD_MONEY',
  'MINIMUM_RIGHTS_CONSUMPTION',
  'MAXIMUM_EXPECTED_ROSTER_SURPLUS',
]);

export const capScenarioInputSchema = z.object({
  schemaVersion: z.literal(CAP_SCENARIO_SCHEMA_VERSION),
  scenarioId: z.string().trim().min(1),
  leagueKey: z.string().trim().min(1),
  baseSnapshotFingerprint: z.string().trim().min(1),
  policyVersion: z.string().trim().min(1),
  rightsStateFingerprint: z.string().trim().min(1).nullable(),
  decisionAsOf: z.string().datetime(),
  ccfEvidenceFingerprint: z.string().trim().min(1).nullable(),
  assumptions: z.array(capScenarioAssumptionSchema),
  proposedActions: z.array(z.object({
    actionId: z.string().trim().min(1),
    engine: z.enum(['TRANSACTION', 'RESTRUCTURE', 'PLANNING_ONLY']),
    payload: z.unknown(),
  })),
  constraints: z.array(capScenarioConstraintSchema),
  objective: capScenarioObjectiveSchema,
  origin: z.object({ createdBy: z.enum(['USER', 'CCF', 'WAR_ROOM', 'IMPORTED']), label: z.string().trim().min(1).nullable() }),
});

export type CapScenarioInput = z.infer<typeof capScenarioInputSchema>;
export type CapScenario = CapScenarioInput & { scenarioFingerprint: string };

function fingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function finalizeCapScenario(input: unknown): CapScenario {
  const parsed = capScenarioInputSchema.parse(input);
  return { ...parsed, scenarioFingerprint: fingerprint(parsed) };
}

export function validateCapScenario(input: unknown) {
  return capScenarioInputSchema.safeParse(input);
}
