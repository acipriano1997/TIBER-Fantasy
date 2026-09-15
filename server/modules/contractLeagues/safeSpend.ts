import { contractLeagueSnapshotSchema } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { buildMultiYearCapHealth, type CapHealthContext } from './capIntelligence';

export const SAFE_SPEND_ENVELOPE_VERSION = 'contract-safe-spend-envelope.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];

type SafeSpendConstraint = {
  season: number;
  minimumRemainingCapRoom: number;
};

type CapacityFactor = {
  season: number | null;
  ruleId: string;
  capacity: number;
  detail: string;
};

export type SafeSpendResult =
  | {
    status: 'ABSTAIN';
    version: typeof SAFE_SPEND_ENVELOPE_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof SAFE_SPEND_ENVELOPE_VERSION;
    structureId: string;
    years: number;
    startSeason: number;
    capCapacityMaximumAnnualValue: number;
    constraintSafeMaximumAnnualValue: number;
    salaryIncrement: number | null;
    limitingFactors: CapacityFactor[];
    legalMaximum: {
      status: 'UNAVAILABLE';
      reasonCode: 'FREE_AGENT_TRANSACTION_ENGINE_REQUIRED';
      detail: string;
    };
    ccfRecommendedRange: {
      status: 'UNAVAILABLE';
      reasonCode: 'CCF_VALUE_DECISION_REQUIRED';
      detail: string;
    };
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

function abstain(reasons: Array<{ code: string; detail: string }>): SafeSpendResult {
  return {
    status: 'ABSTAIN',
    version: SAFE_SPEND_ENVELOPE_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
  };
}

function floorToIncrement(value: number, increment: number | null) {
  if (increment === null) return money(Math.max(0, value));
  return money(Math.max(0, Math.floor((value + 0.0000001) / increment) * increment));
}

function basisShare(
  basis: ContractLeaguePolicy['cap']['compliance'][number]['basis'],
  guaranteedShare: number,
  optionalShare: number,
) {
  switch (basis) {
    case 'GUARANTEED': return guaranteedShare;
    case 'OPTIONAL': return optionalShare;
    case 'CAP_HIT': return 1;
    case 'GUARANTEED_PLUS_DEAD_CAP': return guaranteedShare;
    case 'CAP_HIT_PLUS_DEAD_CAP': return 1;
  }
}

/**
 * Computes a cap-capacity envelope for a hypothetical equal annual-value
 * free-agent contract. It does not certify bid legality: nomination windows,
 * roster mutation, award-time validation, and other transaction semantics stay
 * gated on the future deterministic FREE_AGENT/AUCTION action kernel.
 */
export function calculateSafeSpendEnvelope(input: {
  snapshot: unknown;
  policy: unknown;
  teamKey: string;
  sourceTeamName: string;
  phase: ContractLeaguePhase;
  startSeason: number;
  years: number;
  structureId: string;
  constraints?: SafeSpendConstraint[];
}): SafeSpendResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(input.snapshot);
  if (!snapshotResult.success) return abstain([{ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' }]);
  const policyResult = contractLeaguePolicySchema.safeParse(input.policy);
  if (!policyResult.success) return abstain([{ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' }]);

  const snapshot = snapshotResult.data;
  const policy = policyResult.data;
  const reasons: Array<{ code: string; detail: string }> = [];
  if (snapshot.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Safe-spend planning requires a VALID contract snapshot.' });
  if (policy.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Safe-spend planning requires a VALID contract policy.' });
  if (!Number.isInteger(input.years) || input.years <= 0) reasons.push({ code: 'TERM_INVALID', detail: 'Contract years must be a positive integer.' });

  const structure = policy.contracts.structures.find((item) => item.id === input.structureId) ?? null;
  if (!structure) reasons.push({ code: 'CONTRACT_STRUCTURE_UNAVAILABLE', detail: 'Requested contract structure is not defined by league policy.' });
  if (policy.freeAgency.allowedStructureIds.length > 0 && !policy.freeAgency.allowedStructureIds.includes(input.structureId)) {
    reasons.push({ code: 'FREE_AGENT_STRUCTURE_NOT_ALLOWED', detail: 'Requested structure is not allowed for free-agent contracts.' });
  }
  if (policy.freeAgency.minContractYears !== null && input.years < policy.freeAgency.minContractYears) {
    reasons.push({ code: 'FREE_AGENT_TERM_TOO_SHORT', detail: 'Requested term is below the policy minimum.' });
  }
  if (policy.freeAgency.maxContractYears !== null && input.years > policy.freeAgency.maxContractYears) {
    reasons.push({ code: 'FREE_AGENT_TERM_TOO_LONG', detail: 'Requested term exceeds the policy maximum.' });
  }
  if (reasons.length || !structure) return abstain(reasons);

  const healthContext: CapHealthContext = {
    teamKey: input.teamKey,
    sourceTeamName: input.sourceTeamName,
    phase: input.phase,
  };
  const health = buildMultiYearCapHealth(snapshot, policy, healthContext);
  if (health.status === 'ABSTAIN') {
    return abstain(health.reasonCodes.map((code, index) => ({ code, detail: health.details[index] ?? code })));
  }

  const affectedSeasons = Array.from({ length: input.years }, (_, index) => input.startSeason + index);
  const constraints = new Map((input.constraints ?? []).map((constraint) => [constraint.season, constraint.minimumRemainingCapRoom]));
  const baseFactors: CapacityFactor[] = [];
  const safeFactors: CapacityFactor[] = [];

  for (const season of affectedSeasons) {
    const seasonHealth = health.seasons.find((item) => item.season === season);
    if (!seasonHealth) {
      reasons.push({ code: 'CAP_LEDGER_SEASON_MISSING', detail: `No authoritative cap-health row exists for proposed contract season ${season}.` });
      continue;
    }

    const selectedReserve = constraints.get(season) ?? 0;
    if (!Number.isFinite(selectedReserve) || selectedReserve < 0) {
      reasons.push({ code: 'SAFE_SPEND_CONSTRAINT_INVALID', detail: `Minimum remaining cap room for ${season} must be non-negative.` });
      continue;
    }
    baseFactors.push({
      season,
      ruleId: 'SOURCE_CAP_REMAINING',
      capacity: money(Math.max(0, seasonHealth.sourceCapRemaining)),
      detail: 'Authoritative source cap remaining before user-selected reserve.',
    });
    safeFactors.push({
      season,
      ruleId: 'SOURCE_CAP_REMAINING_AFTER_SELECTED_RESERVE',
      capacity: money(Math.max(0, seasonHealth.sourceCapRemaining - selectedReserve)),
      detail: `Source cap remaining after preserving ${money(selectedReserve)} of selected room.`,
    });

    for (const rule of seasonHealth.compliance) {
      if (rule.overCeilingAllowed) continue;
      if (rule.headroom === null) {
        reasons.push({ code: 'CAP_COMPLIANCE_HEADROOM_UNAVAILABLE', detail: `Compliance headroom is unavailable for rule ${rule.ruleId} in ${season}.` });
        continue;
      }
      const share = basisShare(rule.basis, structure.guaranteedShare, structure.optionalShare);
      if (share <= 0) continue;
      const factor: CapacityFactor = {
        season,
        ruleId: rule.ruleId,
        capacity: money(Math.max(0, rule.headroom / share)),
        detail: `${rule.basis} headroom translated through contract structure ${structure.id}.`,
      };
      baseFactors.push(factor);
      safeFactors.push(factor);
    }
  }

  if (reasons.length) return abstain(reasons);
  if (baseFactors.length === 0 || safeFactors.length === 0) {
    return abstain([{ code: 'SAFE_SPEND_CAPACITY_UNAVAILABLE', detail: 'No authoritative capacity constraint could be derived.' }]);
  }

  const firstSeasonCeiling = policy.cap.seasonCeilings.find((item) => item.season === input.startSeason)?.ceiling
    ?? policy.cap.defaultCeiling;
  if (policy.freeAgency.maxAnnualValueShareOfCap !== null) {
    if (firstSeasonCeiling === null) {
      return abstain([{ code: 'CAP_CEILING_UNAVAILABLE', detail: 'Maximum annual contract share requires a defined cap ceiling.' }]);
    }
    const maxAnnualFactor: CapacityFactor = {
      season: input.startSeason,
      ruleId: 'FREE_AGENT_MAX_ANNUAL_SHARE',
      capacity: money(firstSeasonCeiling * policy.freeAgency.maxAnnualValueShareOfCap),
      detail: 'League free-agency maximum annual-value share of cap.',
    };
    baseFactors.push(maxAnnualFactor);
    safeFactors.push(maxAnnualFactor);
  }

  const increment = policy.freeAgency.salaryIncrement ?? policy.cap.salaryIncrement;
  const baseMinimum = Math.min(...baseFactors.map((item) => item.capacity));
  const safeMinimum = Math.min(...safeFactors.map((item) => item.capacity));
  const capCapacityMaximumAnnualValue = floorToIncrement(baseMinimum, increment);
  const constraintSafeMaximumAnnualValue = floorToIncrement(safeMinimum, increment);
  const limitingFactors = safeFactors.filter((factor) => Math.abs(factor.capacity - safeMinimum) <= 0.000001);

  return {
    status: 'READY',
    version: SAFE_SPEND_ENVELOPE_VERSION,
    structureId: structure.id,
    years: input.years,
    startSeason: input.startSeason,
    capCapacityMaximumAnnualValue,
    constraintSafeMaximumAnnualValue,
    salaryIncrement: increment,
    limitingFactors,
    legalMaximum: {
      status: 'UNAVAILABLE',
      reasonCode: 'FREE_AGENT_TRANSACTION_ENGINE_REQUIRED',
      detail: 'Cap capacity is known, but exact legal maximum requires the deterministic free-agent/auction transaction action and lifecycle validation.',
    },
    ccfRecommendedRange: {
      status: 'UNAVAILABLE',
      reasonCode: 'CCF_VALUE_DECISION_REQUIRED',
      detail: 'A recommended bid range requires frozen CCF player value, replacement alternatives, and opportunity-cost evaluation.',
    },
  };
}
