import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';

export const CONTRACT_FREE_AGENT_AUCTION_STATE_VERSION = 'contract-free-agent-auction-state.v1' as const;

const auctionYearSchema = z.object({
  season: z.number().int().min(2000).max(2200),
  guaranteed: z.number().finite().nonnegative(),
  optional: z.number().finite().nonnegative(),
  capHit: z.number().finite().nonnegative(),
});

export const freeAgentAuctionStateSchema = z.object({
  schemaVersion: z.literal(CONTRACT_FREE_AGENT_AUCTION_STATE_VERSION),
  leagueKey: z.string().trim().min(1),
  auctionId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  player: z.object({
    sourcePlayerName: z.string().trim().min(1),
    canonicalPlayerId: z.string().trim().min(1).nullable(),
    position: z.enum(['QB', 'RB', 'WR', 'TE']).nullable(),
  }),
  status: z.enum(['NOMINATED', 'OPEN', 'SETTLED', 'CANCELLED']),
  timing: z.object({
    nominatedAt: z.string().datetime(),
    closesAt: z.string().datetime().nullable(),
    lastBidAt: z.string().datetime().nullable(),
  }),
  leadingBid: z.object({
    sourceTeamName: z.string().trim().min(1),
    structureId: z.string().trim().min(1),
    distribution: z.enum(['FRONTLOADED', 'EVEN']),
    years: z.array(auctionYearSchema).min(1),
    submittedAt: z.string().datetime(),
  }).nullable(),
  settlement: z.object({
    sourceTeamName: z.string().trim().min(1),
    structureId: z.string().trim().min(1),
    distribution: z.enum(['FRONTLOADED', 'EVEN']),
    years: z.array(auctionYearSchema).min(1),
    settledAt: z.string().datetime(),
  }).nullable(),
  provenance: z.object({
    sourceKind: z.enum(['platform', 'commissioner_table', 'commissioner_entry', 'manual', 'derived']),
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
  if (value.status === 'SETTLED' && !value.settlement) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['settlement'], message: 'SETTLED auctions require an authoritative settlement.' });
  }
  if (value.status !== 'SETTLED' && value.settlement) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['settlement'], message: 'Only SETTLED auctions may carry settlement terms.' });
  }
  for (const [path, years] of [['leadingBid', value.leadingBid?.years], ['settlement', value.settlement?.years]] as const) {
    if (!years) continue;
    const seen = new Set<number>();
    for (const [index, year] of years.entries()) {
      if (seen.has(year.season)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path, 'years', index, 'season'], message: 'Auction contract seasons must be unique.' });
      seen.add(year.season);
      if (Math.abs(year.capHit - year.guaranteed - year.optional) > 0.000001) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path, 'years', index, 'capHit'], message: 'Auction capHit must equal guaranteed + optional money.' });
    }
  }
});

export type FreeAgentAuctionState = z.infer<typeof freeAgentAuctionStateSchema>;
export type AuctionContractTerms = NonNullable<FreeAgentAuctionState['leadingBid']>;

function parseTime(value: string | null | undefined) { if (!value) return null; const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function fp(value: unknown) { const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null'; return `sha256:${createHash('sha256').update(canonical).digest('hex')}`; }

export type AuctionStateDecisionResult =
  | { status: 'ABSTAIN'; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; state: FreeAgentAuctionState; fingerprint: string };

export function resolveAuctionStateForDecision(
  input: unknown,
  context: { leagueKey: string; decisionAt: string },
): AuctionStateDecisionResult {
  const parsed = freeAgentAuctionStateSchema.safeParse(input);
  if (!parsed.success) return { status: 'ABSTAIN', reasonCodes: ['AUCTION_STATE_INVALID'], details: ['Auction state failed schema validation.'], fingerprint: fp({ input, context }) };
  const state = parsed.data;
  const reasons: { code: string; detail: string }[] = [];
  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Auction decision requires a valid frozen timestamp.' });
  if (state.leagueKey !== context.leagueKey.trim()) reasons.push({ code: 'AUCTION_LEAGUE_MISMATCH', detail: 'Auction state belongs to another internal league key.' });
  if (state.validation.status !== 'VALID') reasons.push({ code: 'AUCTION_STATE_NOT_DECISION_READY', detail: 'Only VALID auction state may drive a decision.' });
  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['auction asOf', state.asOf, 'AUCTION_AS_OF_AFTER_DECISION'],
      ['auction importedAt', state.provenance.importedAt, 'AUCTION_IMPORTED_AFTER_DECISION'],
      ['auction sourceModifiedAt', state.provenance.sourceModifiedAt, 'AUCTION_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp.` });
      else if (evidenceMs > decisionMs) reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp.` });
    }
  }
  if (reasons.length) return { status: 'ABSTAIN', reasonCodes: [...new Set(reasons.map((r) => r.code))], details: reasons.map((r) => r.detail), fingerprint: fp({ state, context, reasons }) };
  return { status: 'READY', state, fingerprint: fp({ state, context }) };
}
