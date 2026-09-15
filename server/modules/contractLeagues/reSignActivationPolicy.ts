import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { z } from 'zod';

export const CONTRACT_RE_SIGN_ACTIVATION_POLICY_VERSION = 'contract-re-sign-activation-policy.v1' as const;

export const reSignActivationPolicySchema = z.object({
  schemaVersion: z.literal(CONTRACT_RE_SIGN_ACTIVATION_POLICY_VERSION),
  leagueKey: z.string().trim().min(1),
  effective: z.object({
    season: z.number().int().min(2000).max(2200),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime().nullable(),
  }),
  mode: z.enum([
    'AFTER_CURRENT_CONTRACT',
    'REPLACES_REMAINING_CONTRACT',
  ]),
  provenance: z.object({
    sourceKind: z.enum(['constitution', 'commissioner_entry', 'platform', 'manual', 'derived']),
    sourceDisplayName: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1).nullable(),
    sourceModifiedAt: z.string().datetime().nullable(),
    importedAt: z.string().datetime(),
    policyVersion: z.string().trim().min(1),
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

export type ReSignActivationPolicy = z.infer<typeof reSignActivationPolicySchema>;

export type ReSignActivationPolicyContext = {
  leagueKey: string;
  decisionAt: string;
  season: number;
};

export type ReSignActivationPolicyResult =
  | {
    status: 'READY';
    mode: ReSignActivationPolicy['mode'];
    fingerprint: string;
  }
  | {
    status: 'ABSTAIN';
    reasonCodes: string[];
    details: string[];
    fingerprint: string;
  };

type Reason = { code: string; detail: string };

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}

function fingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function resolveReSignActivationPolicy(
  input: unknown,
  context: ReSignActivationPolicyContext,
): ReSignActivationPolicyResult {
  const parsed = reSignActivationPolicySchema.safeParse(input);
  const reasons: Reason[] = [];
  if (!parsed.success) {
    reasons.push({ code: 'RE_SIGN_ACTIVATION_POLICY_INVALID', detail: 'Re-sign activation policy supplement failed schema validation.' });
  }

  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Re-sign activation requires a valid frozen decision timestamp.' });

  if (parsed.success) {
    const policy = parsed.data;
    if (policy.validation.status !== 'VALID') {
      reasons.push({ code: 'RE_SIGN_ACTIVATION_POLICY_NOT_DECISION_READY', detail: `Activation policy validation status is ${policy.validation.status}; only VALID policy may drive a decision.` });
    }
    if (policy.leagueKey !== context.leagueKey.trim()) {
      reasons.push({ code: 'RE_SIGN_ACTIVATION_LEAGUE_MISMATCH', detail: 'Activation policy belongs to a different internal league key.' });
    }
    if (policy.effective.season !== context.season) {
      reasons.push({ code: 'RE_SIGN_ACTIVATION_SEASON_MISMATCH', detail: 'Activation policy season does not match the economic snapshot season.' });
    }

    if (decisionMs !== null) {
      const from = parseTime(policy.effective.effectiveFrom);
      const until = parseTime(policy.effective.effectiveUntil);
      if (from === null || decisionMs < from || (until !== null && decisionMs >= until)) {
        reasons.push({ code: 'RE_SIGN_ACTIVATION_POLICY_NOT_EFFECTIVE', detail: 'Activation policy is not effective at the frozen decision timestamp.' });
      }

      for (const [label, value, code] of [
        ['activation provenance.importedAt', policy.provenance.importedAt, 'RE_SIGN_ACTIVATION_IMPORTED_AFTER_DECISION'],
        ['activation provenance.sourceModifiedAt', policy.provenance.sourceModifiedAt, 'RE_SIGN_ACTIVATION_SOURCE_MODIFIED_AFTER_DECISION'],
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
  }

  const fp = fingerprint({ version: CONTRACT_RE_SIGN_ACTIVATION_POLICY_VERSION, input, context });
  if (!parsed.success || reasons.length) {
    return {
      status: 'ABSTAIN',
      reasonCodes: [...new Set(reasons.map((item) => item.code))],
      details: reasons.map((item) => item.detail),
      fingerprint: fp,
    };
  }

  return { status: 'READY', mode: parsed.data.mode, fingerprint: fp };
}
