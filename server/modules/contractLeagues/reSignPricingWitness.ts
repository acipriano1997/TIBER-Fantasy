import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';

export const CONTRACT_RE_SIGN_PRICING_WITNESS_VERSION = 'contract-re-sign-pricing-witness.v1' as const;

const witnessFormulaKindSchema = z.enum([
  'FIXED_AMOUNT',
  'TOP_N_POSITION_AVERAGE_PREMIUM',
  'POSITION_RANK_MARKET_BAND_PREMIUM',
  'MARKET_AUCTION',
]);

export const reSignPricingWitnessSchema = z.object({
  schemaVersion: z.literal(CONTRACT_RE_SIGN_PRICING_WITNESS_VERSION),
  leagueKey: z.string().trim().min(1),
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
  pricing: z.object({
    formulaKind: witnessFormulaKindSchema,
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

export type ReSignPricingWitness = z.infer<typeof reSignPricingWitnessSchema>;

export type ReSignPricingWitnessDecisionContext = {
  leagueKey: string;
  decisionAt: string;
  sourcePlayerName?: string | null;
  canonicalPlayerId?: string | null;
  position?: 'QB' | 'RB' | 'WR' | 'TE' | null;
};

export type ReSignPricingWitnessAbstention = {
  status: 'ABSTAIN';
  reasonCodes: string[];
  details: string[];
  fingerprint: string;
};

export type ReSignPricingWitnessReady = {
  status: 'READY';
  annualAav: number;
  eligible: boolean;
  formulaKind: ReSignPricingWitness['pricing']['formulaKind'];
  appliedRankBandCeiling: number | null;
  fingerprint: string;
};

export type ReSignPricingWitnessResult = ReSignPricingWitnessAbstention | ReSignPricingWitnessReady;

type Reason = { code: string; detail: string };

function deterministicFingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}

function abstain(
  witnessInput: unknown,
  policyInput: unknown,
  context: ReSignPricingWitnessDecisionContext,
  reasons: Reason[],
): ReSignPricingWitnessAbstention {
  return {
    status: 'ABSTAIN',
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
    fingerprint: deterministicFingerprint({
      version: CONTRACT_RE_SIGN_PRICING_WITNESS_VERSION,
      witnessInput,
      policyInput,
      context,
      reasons,
    }),
  };
}

function pricingKind(policy: ContractLeaguePolicy) {
  return policy.contracts.reSign.pricing?.kind ?? null;
}

/**
 * Validates an externally resolved re-sign price for use at a frozen decision time.
 *
 * This module intentionally does not scrape market salaries, calculate fantasy
 * position ranks, or invent a league price. Those are evidence-production jobs.
 * Its responsibility is to prove that a supplied witness is decision-eligible,
 * policy-compatible, and internally coherent before another layer may consume it.
 */
export function resolveReSignPricingWitness(
  witnessInput: unknown,
  policyInput: unknown,
  context: ReSignPricingWitnessDecisionContext,
): ReSignPricingWitnessResult {
  const witnessResult = reSignPricingWitnessSchema.safeParse(witnessInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);

  if (!witnessResult.success || !policyResult.success) {
    const parseReasons: Reason[] = [];
    if (!witnessResult.success) {
      parseReasons.push({ code: 'RE_SIGN_PRICE_WITNESS_INVALID', detail: 'Re-sign pricing witness failed schema validation.' });
    }
    if (!policyResult.success) {
      parseReasons.push({ code: 'POLICY_INVALID', detail: 'Contract league policy failed schema validation.' });
    }
    return abstain(witnessInput, policyInput, context, parseReasons);
  }

  const witness = witnessResult.data;
  const policy = policyResult.data;
  const reasons: Reason[] = [];
  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Re-sign pricing requires a valid frozen decision timestamp.' });
  if (!context.leagueKey.trim()) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Re-sign pricing requires an explicit internal league key.' });
  if (witness.leagueKey !== context.leagueKey.trim()) reasons.push({ code: 'RE_SIGN_PRICE_LEAGUE_MISMATCH', detail: 'Pricing witness belongs to a different internal league key.' });
  if (witness.validation.status !== 'VALID') reasons.push({ code: 'RE_SIGN_PRICE_WITNESS_NOT_DECISION_READY', detail: `Pricing witness validation status is ${witness.validation.status}; only VALID evidence may drive a decision.` });
  if (policy.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: `Contract policy validation status is ${policy.validation.status}; only VALID policy may drive a decision.` });
  if (!policy.contracts.reSign.enabled) reasons.push({ code: 'RE_SIGN_DISABLED', detail: 'League policy disables contract re-signs.' });
  if (!policy.contracts.reSign.pricing) reasons.push({ code: 'RE_SIGN_PRICING_POLICY_UNAVAILABLE', detail: 'Enabled re-signs require an explicit pricing formula.' });

  const expectedKind = pricingKind(policy);
  if (expectedKind && witness.pricing.formulaKind !== expectedKind) {
    reasons.push({ code: 'RE_SIGN_PRICE_FORMULA_MISMATCH', detail: `Pricing witness uses ${witness.pricing.formulaKind}, but policy requires ${expectedKind}.` });
  }

  if (context.canonicalPlayerId && witness.player.canonicalPlayerId !== context.canonicalPlayerId) {
    reasons.push({ code: 'RE_SIGN_PRICE_PLAYER_MISMATCH', detail: 'Pricing witness canonical player identity does not match the decision subject.' });
  }
  if (context.sourcePlayerName && witness.player.sourcePlayerName !== context.sourcePlayerName) {
    reasons.push({ code: 'RE_SIGN_PRICE_PLAYER_MISMATCH', detail: 'Pricing witness source player name does not match the decision subject.' });
  }
  if (context.position && witness.player.position !== context.position) {
    reasons.push({ code: 'RE_SIGN_PRICE_POSITION_MISMATCH', detail: 'Pricing witness position does not match the contract subject.' });
  }

  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['witness asOf', witness.asOf, 'RE_SIGN_PRICE_AS_OF_AFTER_DECISION'],
      ['witness provenance.importedAt', witness.provenance.importedAt, 'RE_SIGN_PRICE_IMPORTED_AFTER_DECISION'],
      ['witness provenance.sourceModifiedAt', witness.provenance.sourceModifiedAt, 'RE_SIGN_PRICE_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) {
        reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp when present.` });
      } else if (evidenceMs > decisionMs) {
        reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp and is ineligible for known-at use.` });
      }
    }
  }

  const pricing = policy.contracts.reSign.pricing;
  if (pricing?.kind === 'FIXED_AMOUNT') {
    if (Math.abs(witness.pricing.resolvedAnnualAav - pricing.amount) > 0.000001) {
      reasons.push({ code: 'RE_SIGN_FIXED_PRICE_MISMATCH', detail: 'Resolved annual AAV does not match the fixed policy amount.' });
    }
  }

  if (pricing?.kind === 'TOP_N_POSITION_AVERAGE_PREMIUM' || pricing?.kind === 'POSITION_RANK_MARKET_BAND_PREMIUM') {
    const marketBand = witness.pricing.marketBand;
    if (!marketBand) {
      reasons.push({ code: 'RE_SIGN_MARKET_BAND_EVIDENCE_MISSING', detail: 'Premium-based re-sign pricing requires the resolved market-band evidence used to produce the final AAV.' });
    } else {
      if (Math.abs(marketBand.premiumRate - pricing.premiumRate) > 0.000001) {
        reasons.push({ code: 'RE_SIGN_PREMIUM_RATE_MISMATCH', detail: 'Pricing witness premium rate does not match league policy.' });
      }
      const expectedFinal = marketBand.baseAav * (1 + pricing.premiumRate);
      if (Math.abs(marketBand.finalAav - expectedFinal) > 0.01) {
        reasons.push({ code: 'RE_SIGN_MARKET_PRICE_ARITHMETIC_MISMATCH', detail: 'Pricing witness market-band final AAV does not reconcile to base AAV plus the policy premium.' });
      }
      if (Math.abs(witness.pricing.resolvedAnnualAav - marketBand.finalAav) > 0.01) {
        reasons.push({ code: 'RE_SIGN_RESOLVED_PRICE_MISMATCH', detail: 'Resolved annual AAV does not match the witnessed market-band final AAV.' });
      }
    }
  }

  if (pricing?.kind === 'POSITION_RANK_MARKET_BAND_PREMIUM') {
    const band = witness.pricing.appliedRankBandCeiling;
    if (band === null || !pricing.rankBands.includes(band)) {
      reasons.push({ code: 'RE_SIGN_RANK_BAND_INVALID', detail: 'Pricing witness must identify one of the policy-defined position-rank band ceilings.' });
    }
    if (witness.pricing.accreditedSeasons.length < pricing.minAccreditedSeasons) {
      reasons.push({ code: 'RE_SIGN_ACCREDITED_SEASONS_INSUFFICIENT', detail: 'Pricing witness does not contain enough accredited seasons for the policy formula.' });
    }
    if (witness.pricing.accreditedSeasons.length > pricing.lookbackSeasons) {
      reasons.push({ code: 'RE_SIGN_LOOKBACK_EXCEEDED', detail: 'Pricing witness includes more accredited seasons than the policy lookback permits.' });
    }
    for (const season of witness.pricing.accreditedSeasons) {
      if (season.gamesPlayed < pricing.partialSeasonMinGames) {
        reasons.push({ code: 'RE_SIGN_UNACCREDITED_SEASON_INCLUDED', detail: `Season ${season.season} has too few games to be accredited under policy.` });
      } else if (season.gamesPlayed < pricing.fullSeasonMinGames && season.rankMethod !== pricing.partialSeasonMethod) {
        reasons.push({ code: 'RE_SIGN_PARTIAL_SEASON_METHOD_MISMATCH', detail: `Season ${season.season} must use ${pricing.partialSeasonMethod} under policy.` });
      }
    }
  }

  if (reasons.length) return abstain(witness, policy, context, reasons);

  return {
    status: 'READY',
    annualAav: witness.pricing.resolvedAnnualAav,
    eligible: witness.eligibility.confirmed,
    formulaKind: witness.pricing.formulaKind,
    appliedRankBandCeiling: witness.pricing.appliedRankBandCeiling,
    fingerprint: deterministicFingerprint({
      version: CONTRACT_RE_SIGN_PRICING_WITNESS_VERSION,
      witness,
      policy,
      context,
    }),
  };
}
