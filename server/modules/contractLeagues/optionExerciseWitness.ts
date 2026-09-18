import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';

export const CONTRACT_OPTION_EXERCISE_WITNESS_VERSION = 'contract-option-exercise-witness.v1' as const;

const optionYearSchema = z.object({
  season: z.number().int().min(2000).max(2200),
  guaranteed: z.number().finite().nonnegative(),
  optional: z.number().finite().nonnegative(),
  capHit: z.number().finite().nonnegative(),
});

export const optionExerciseWitnessSchema = z.object({
  schemaVersion: z.literal(CONTRACT_OPTION_EXERCISE_WITNESS_VERSION),
  leagueKey: z.string().trim().min(1),
  optionId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  player: z.object({
    sourcePlayerName: z.string().trim().min(1),
    canonicalPlayerId: z.string().trim().min(1).nullable(),
  }),
  eligibility: z.object({
    confirmed: z.boolean(),
    basisNotes: z.array(z.string().trim().min(1)).default([]),
  }),
  decisionWindow: z.object({
    opensAt: z.string().datetime().nullable(),
    closesAt: z.string().datetime().nullable(),
  }),
  outcomes: z.object({
    exercise: z.object({ resultingYears: z.array(optionYearSchema).min(1) }).nullable(),
    decline: z.object({ resultingYears: z.array(optionYearSchema).min(1) }).nullable(),
  }),
  provenance: z.object({
    sourceKind: z.enum(['constitution', 'league_calculator', 'commissioner_table', 'commissioner_entry', 'platform', 'manual', 'derived']),
    sourceDisplayName: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1).nullable(),
    sourceModifiedAt: z.string().datetime().nullable(),
    importedAt: z.string().datetime(),
    producerVersion: z.string().trim().min(1),
  }),
  validation: z.object({
    status: z.enum(['VALID', 'PARTIAL', 'REJECTED']),
    warnings: z.array(z.string()).default([]),
    unresolved: z.array(z.object({ code: z.string().trim().min(1), path: z.string().trim().min(1), detail: z.string().trim().min(1) })).default([]),
  }),
}).superRefine((value, ctx) => {
  if (!value.outcomes.exercise && !value.outcomes.decline) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcomes'], message: 'At least one authoritative option outcome is required.' });
  }
  for (const [outcome, years] of [['exercise', value.outcomes.exercise?.resultingYears], ['decline', value.outcomes.decline?.resultingYears]] as const) {
    if (!years) continue;
    const seen = new Set<number>();
    for (const [index, year] of years.entries()) {
      if (seen.has(year.season)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcomes', outcome, 'resultingYears', index, 'season'], message: 'Option outcome seasons must be unique.' });
      seen.add(year.season);
      if (Math.abs(year.capHit - year.guaranteed - year.optional) > 0.000001) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['outcomes', outcome, 'resultingYears', index, 'capHit'], message: 'Option outcome capHit must equal guaranteed + optional money.' });
    }
  }
});

export type OptionExerciseWitness = z.infer<typeof optionExerciseWitnessSchema>;
export type OptionDecision = 'EXERCISE' | 'DECLINE';
export type OptionWitnessResult =
  | { status: 'ABSTAIN'; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; optionId: string; eligible: boolean; resultingYears: z.infer<typeof optionYearSchema>[]; fingerprint: string };

type Reason = { code: string; detail: string };
function parseTime(value: string | null | undefined) { if (!value) return null; const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function fp(value: unknown) { const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null'; return `sha256:${createHash('sha256').update(canonical).digest('hex')}`; }

export function resolveOptionExerciseWitness(
  witnessInput: unknown,
  context: { leagueKey: string; decisionAt: string; decision: OptionDecision; sourcePlayerName?: string | null; canonicalPlayerId?: string | null },
): OptionWitnessResult {
  const parsed = optionExerciseWitnessSchema.safeParse(witnessInput);
  const reasons: Reason[] = [];
  if (!parsed.success) return { status: 'ABSTAIN', reasonCodes: ['OPTION_WITNESS_INVALID'], details: ['Option witness failed schema validation.'], fingerprint: fp({ witnessInput, context }) };
  const witness = parsed.data;
  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Option decision requires a valid frozen decision timestamp.' });
  if (witness.leagueKey !== context.leagueKey.trim()) reasons.push({ code: 'OPTION_WITNESS_LEAGUE_MISMATCH', detail: 'Option witness belongs to a different internal league key.' });
  if (witness.validation.status !== 'VALID') reasons.push({ code: 'OPTION_WITNESS_NOT_DECISION_READY', detail: 'Only VALID option evidence may drive a decision.' });
  if (context.canonicalPlayerId && witness.player.canonicalPlayerId !== context.canonicalPlayerId) reasons.push({ code: 'OPTION_PLAYER_MISMATCH', detail: 'Option witness canonical player identity does not match the decision subject.' });
  if (context.sourcePlayerName && witness.player.sourcePlayerName !== context.sourcePlayerName) reasons.push({ code: 'OPTION_PLAYER_MISMATCH', detail: 'Option witness source player name does not match the decision subject.' });

  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['witness asOf', witness.asOf, 'OPTION_AS_OF_AFTER_DECISION'],
      ['witness importedAt', witness.provenance.importedAt, 'OPTION_IMPORTED_AFTER_DECISION'],
      ['witness sourceModifiedAt', witness.provenance.sourceModifiedAt, 'OPTION_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp.` });
      else if (evidenceMs > decisionMs) reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp.` });
    }
    const opens = parseTime(witness.decisionWindow.opensAt);
    const closes = parseTime(witness.decisionWindow.closesAt);
    if (witness.decisionWindow.opensAt && opens === null) reasons.push({ code: 'OPTION_WINDOW_INVALID', detail: 'Option opensAt is invalid.' });
    if (witness.decisionWindow.closesAt && closes === null) reasons.push({ code: 'OPTION_WINDOW_INVALID', detail: 'Option closesAt is invalid.' });
    if (opens !== null && decisionMs < opens) reasons.push({ code: 'OPTION_WINDOW_NOT_OPEN', detail: 'Frozen decision time is before the option window opens.' });
    if (closes !== null && decisionMs > closes) reasons.push({ code: 'OPTION_WINDOW_CLOSED', detail: 'Frozen decision time is after the option window closes.' });
  }

  const outcome = context.decision === 'EXERCISE' ? witness.outcomes.exercise : witness.outcomes.decline;
  if (!outcome) reasons.push({ code: 'OPTION_OUTCOME_UNAVAILABLE', detail: `No authoritative ${context.decision.toLowerCase()} consequence is present in the witness.` });
  if (reasons.length || !outcome) return {
    status: 'ABSTAIN', reasonCodes: [...new Set(reasons.map((r) => r.code))], details: reasons.map((r) => r.detail), fingerprint: fp({ witness, context, reasons }),
  };
  return { status: 'READY', optionId: witness.optionId, eligible: witness.eligibility.confirmed, resultingYears: outcome.resultingYears, fingerprint: fp({ witness, context }) };
}
