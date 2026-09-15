import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';

export const CONTRACT_TAG_OFFER_WITNESS_VERSION = 'contract-tag-offer-witness.v1' as const;

export const tagOfferWitnessSchema = z.object({
  schemaVersion: z.literal(CONTRACT_TAG_OFFER_WITNESS_VERSION),
  leagueKey: z.string().trim().min(1),
  tagPolicyId: z.string().trim().min(1),
  asOf: z.string().datetime(),
  player: z.object({
    sourcePlayerName: z.string().trim().min(1),
    canonicalPlayerId: z.string().trim().min(1).nullable(),
    position: z.enum(['QB', 'RB', 'WR', 'TE']),
  }),
  eligibility: z.object({
    confirmed: z.boolean(),
    basisNotes: z.array(z.string().trim().min(1)).default([]),
  }),
  terms: z.object({
    startSeason: z.number().int().min(2000).max(2200),
    resolvedAnnualAav: z.number().finite().positive(),
    appliedRankBandCeiling: z.number().int().positive().nullable().default(null),
    accreditedSeasons: z.array(z.object({
      season: z.number().int().min(2000).max(2200),
      gamesPlayed: z.number().int().nonnegative(),
      rankMethod: z.enum(['TOTAL_POINTS_RANK', 'PPG_TO_FULL_SEASON_RANK']),
      resolvedPositionRank: z.number().int().positive(),
    })).default([]),
    marketBand: z.object({
      baseAav: z.number().finite().nonnegative(),
      premiumRate: z.number().finite(),
      finalAav: z.number().finite().positive(),
    }).nullable().default(null),
    sourceNote: z.string().trim().min(1).nullable().default(null),
  }),
  provenance: z.object({
    sourceKind: z.enum(['league_calculator', 'commissioner_table', 'commissioner_entry', 'platform', 'manual', 'derived']),
    sourceDisplayName: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1).nullable(),
    sourceModifiedAt: z.string().datetime().nullable(),
    importedAt: z.string().datetime(),
    producerVersion: z.string().trim().min(1),
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
});

export type TagOfferWitness = z.infer<typeof tagOfferWitnessSchema>;
export type TagOfferWitnessResult =
  | { status: 'ABSTAIN'; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; annualAav: number; startSeason: number; eligible: boolean; tagPolicy: ContractLeaguePolicy['contracts']['tags'][number]; fingerprint: string };

type Reason = { code: string; detail: string };

function fingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
function time(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}
function abstain(witnessInput: unknown, policyInput: unknown, context: { leagueKey: string; decisionAt: string }, reasons: Reason[]): TagOfferWitnessResult {
  return {
    status: 'ABSTAIN',
    reasonCodes: [...new Set(reasons.map((reason) => reason.code))],
    details: reasons.map((reason) => reason.detail),
    fingerprint: fingerprint({ version: CONTRACT_TAG_OFFER_WITNESS_VERSION, witnessInput, policyInput, context, reasons }),
  };
}

export function resolveTagOfferWitness(
  witnessInput: unknown,
  policyInput: unknown,
  context: { leagueKey: string; decisionAt: string; sourcePlayerName?: string | null; canonicalPlayerId?: string | null; position?: 'QB' | 'RB' | 'WR' | 'TE' | null },
): TagOfferWitnessResult {
  const witnessResult = tagOfferWitnessSchema.safeParse(witnessInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const reasons: Reason[] = [];
  if (!witnessResult.success) reasons.push({ code: 'TAG_OFFER_WITNESS_INVALID', detail: 'Tag offer witness failed schema validation.' });
  if (!policyResult.success) reasons.push({ code: 'POLICY_INVALID', detail: 'Contract league policy failed schema validation.' });
  if (!witnessResult.success || !policyResult.success) return abstain(witnessInput, policyInput, context, reasons);

  const witness = witnessResult.data;
  const policy = policyResult.data;
  const decisionMs = time(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Tag pricing requires a valid frozen decision timestamp.' });
  if (witness.leagueKey !== context.leagueKey.trim()) reasons.push({ code: 'TAG_OFFER_LEAGUE_MISMATCH', detail: 'Tag offer witness belongs to a different internal league key.' });
  if (witness.validation.status !== 'VALID') reasons.push({ code: 'TAG_OFFER_WITNESS_NOT_DECISION_READY', detail: 'Only VALID tag offer evidence may drive a decision.' });
  if (policy.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Only VALID policy may drive a tag decision.' });

  const tagPolicy = policy.contracts.tags.find((tag) => tag.id === witness.tagPolicyId) ?? null;
  if (!tagPolicy) reasons.push({ code: 'TAG_POLICY_UNRESOLVED', detail: 'Witness tagPolicyId does not resolve to exactly one policy tag.' });

  if (context.canonicalPlayerId && witness.player.canonicalPlayerId !== context.canonicalPlayerId) reasons.push({ code: 'TAG_OFFER_PLAYER_MISMATCH', detail: 'Witness canonical player identity does not match the decision subject.' });
  if (context.sourcePlayerName && witness.player.sourcePlayerName !== context.sourcePlayerName) reasons.push({ code: 'TAG_OFFER_PLAYER_MISMATCH', detail: 'Witness source player name does not match the decision subject.' });
  if (context.position && witness.player.position !== context.position) reasons.push({ code: 'TAG_OFFER_POSITION_MISMATCH', detail: 'Witness player position does not match the decision subject.' });

  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['witness asOf', witness.asOf, 'TAG_OFFER_AS_OF_AFTER_DECISION'],
      ['witness provenance.importedAt', witness.provenance.importedAt, 'TAG_OFFER_IMPORTED_AFTER_DECISION'],
      ['witness provenance.sourceModifiedAt', witness.provenance.sourceModifiedAt, 'TAG_OFFER_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = time(value);
      if (evidenceMs === null) reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp when present.` });
      else if (evidenceMs > decisionMs) reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp.` });
    }
  }

  if (tagPolicy) {
    const pricing = tagPolicy.pricing;
    const aav = witness.terms.resolvedAnnualAav;
    if (pricing.kind === 'FIXED_AMOUNT' && Math.abs(aav - pricing.amount) > 0.000001) {
      reasons.push({ code: 'TAG_FIXED_PRICE_MISMATCH', detail: 'Resolved tag AAV does not match the fixed policy amount.' });
    }
    if (pricing.kind === 'TOP_N_POSITION_AVERAGE_PREMIUM' || pricing.kind === 'POSITION_RANK_MARKET_BAND_PREMIUM') {
      const market = witness.terms.marketBand;
      if (!market) reasons.push({ code: 'TAG_MARKET_EVIDENCE_MISSING', detail: 'Premium tag pricing requires market-band evidence.' });
      else {
        if (Math.abs(market.premiumRate - pricing.premiumRate) > 0.000001) reasons.push({ code: 'TAG_PREMIUM_RATE_MISMATCH', detail: 'Witness premium rate does not match tag policy.' });
        const expected = market.baseAav * (1 + pricing.premiumRate);
        if (Math.abs(market.finalAav - expected) > 0.01 || Math.abs(aav - market.finalAav) > 0.01) reasons.push({ code: 'TAG_PRICE_ARITHMETIC_MISMATCH', detail: 'Resolved tag AAV does not reconcile to market base plus policy premium.' });
      }
    }
    if (pricing.kind === 'POSITION_RANK_MARKET_BAND_PREMIUM') {
      const band = witness.terms.appliedRankBandCeiling;
      if (band === null || !pricing.rankBands.includes(band)) reasons.push({ code: 'TAG_RANK_BAND_INVALID', detail: 'Witness must use a policy-defined position-rank band.' });
      if (witness.terms.accreditedSeasons.length < pricing.minAccreditedSeasons) reasons.push({ code: 'TAG_ACCREDITED_SEASONS_INSUFFICIENT', detail: 'Witness does not include enough accredited seasons.' });
      if (witness.terms.accreditedSeasons.length > pricing.lookbackSeasons) reasons.push({ code: 'TAG_LOOKBACK_EXCEEDED', detail: 'Witness exceeds the policy lookback.' });
      for (const season of witness.terms.accreditedSeasons) {
        if (season.gamesPlayed < pricing.partialSeasonMinGames) reasons.push({ code: 'TAG_UNACCREDITED_SEASON_INCLUDED', detail: `Season ${season.season} has too few games to be accredited.` });
        else if (season.gamesPlayed < pricing.fullSeasonMinGames && season.rankMethod !== pricing.partialSeasonMethod) reasons.push({ code: 'TAG_PARTIAL_SEASON_METHOD_MISMATCH', detail: `Season ${season.season} must use ${pricing.partialSeasonMethod}.` });
      }
    }
  }

  if (reasons.length || !tagPolicy) return abstain(witness, policy, context, reasons);
  return {
    status: 'READY',
    annualAav: witness.terms.resolvedAnnualAav,
    startSeason: witness.terms.startSeason,
    eligible: witness.eligibility.confirmed,
    tagPolicy,
    fingerprint: fingerprint({ version: CONTRACT_TAG_OFFER_WITNESS_VERSION, witness, policy, context }),
  };
}
