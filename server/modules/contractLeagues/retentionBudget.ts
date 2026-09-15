import { contractLeagueSnapshotSchema } from './contracts';
import { buildMultiYearCapHealth, type CapHealthContext } from './capIntelligence';
import { contractLeaguePolicySchema } from './policy';
import type { ContractValueComparisonResult } from './contractValue';

export const RETENTION_BUDGET_VERSION = 'contract-retention-budget.v1' as const;

type RetentionTarget = {
  canonicalPlayerId: string;
  label: string;
  priceSource: 'USER_ASSUMPTION' | 'MARKET_EVIDENCE';
  sourceFingerprint: string | null;
  reserveBySeason: Array<{
    season: number;
    amount: number;
  }>;
};

export type RetentionBudgetResult =
  | {
    status: 'ABSTAIN';
    version: typeof RETENTION_BUDGET_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof RETENTION_BUDGET_VERSION;
    targets: Array<{
      canonicalPlayerId: string;
      sourcePlayerName: string;
      label: string;
      priceSource: RetentionTarget['priceSource'];
      sourceFingerprint: string | null;
      ccfRosterMarginalValue: { metricId: string; value: number } | null;
      reserveBySeason: RetentionTarget['reserveBySeason'];
    }>;
    seasons: Array<{
      season: number;
      baselineCapRemaining: number;
      retentionReserve: number;
      capRemainingForOtherMoves: number;
    }>;
    legalExecution: {
      status: 'UNAVAILABLE';
      reasonCode: 'RE_SIGN_TRANSACTION_ENGINE_REQUIRED';
      detail: string;
    };
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

function abstain(reasons: Array<{ code: string; detail: string }>): RetentionBudgetResult {
  return {
    status: 'ABSTAIN',
    version: RETENTION_BUDGET_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
  };
}

/**
 * Reserves explicit re-sign/extension budgets against the authoritative cap
 * trajectory. It never predicts a contract price or claims re-sign legality.
 */
export function buildRetentionBudgetPlan(input: {
  snapshot: unknown;
  policy: unknown;
  healthContext: CapHealthContext;
  targets: RetentionTarget[];
  valueComparison?: ContractValueComparisonResult | null;
}): RetentionBudgetResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(input.snapshot);
  if (!snapshotResult.success) return abstain([{ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' }]);
  const policyResult = contractLeaguePolicySchema.safeParse(input.policy);
  if (!policyResult.success) return abstain([{ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' }]);
  const snapshot = snapshotResult.data;
  const policy = policyResult.data;
  const health = buildMultiYearCapHealth(snapshot, policy, input.healthContext);
  if (health.status === 'ABSTAIN') {
    return abstain(health.reasonCodes.map((code, index) => ({ code, detail: health.details[index] ?? code })));
  }

  const teams = snapshot.teams.filter((team) => team.sourceTeamName === input.healthContext.sourceTeamName.trim());
  if (teams.length !== 1 || !teams[0]) return abstain([{ code: 'TEAM_BINDING_UNRESOLVED', detail: 'Retention planner requires exactly one bound source team.' }]);
  const team = teams[0];
  const activeById = new Map(team.contracts
    .filter((contract) => contract.status !== 'CUT' && contract.status !== 'EXPIRED' && contract.canonicalPlayerId !== null)
    .map((contract) => [contract.canonicalPlayerId as string, contract]));
  const ccfRows = input.valueComparison?.status === 'READY'
    ? new Map(input.valueComparison.rows.map((row) => [row.canonicalPlayerId, row]))
    : new Map();
  const reasons: Array<{ code: string; detail: string }> = [];
  const seen = new Set<string>();

  const targets = input.targets.flatMap((target) => {
    if (!target.canonicalPlayerId.trim() || seen.has(target.canonicalPlayerId)) {
      reasons.push({ code: 'RETENTION_TARGET_INVALID', detail: `Retention target ${target.canonicalPlayerId || '<blank>'} is blank or duplicated.` });
      return [];
    }
    seen.add(target.canonicalPlayerId);
    const contract = activeById.get(target.canonicalPlayerId);
    if (!contract) {
      reasons.push({ code: 'RETENTION_TARGET_NOT_ROSTERED', detail: `Retention target ${target.canonicalPlayerId} is not an active canonical contract on the bound team.` });
      return [];
    }
    for (const reserve of target.reserveBySeason) {
      if (!Number.isInteger(reserve.season) || reserve.season < snapshot.league.season || !Number.isFinite(reserve.amount) || reserve.amount < 0) {
        reasons.push({ code: 'RETENTION_RESERVE_INVALID', detail: `Retention reserve for ${target.canonicalPlayerId} contains an invalid season or amount.` });
      }
      if (!health.seasons.some((season) => season.season === reserve.season)) {
        reasons.push({ code: 'CAP_LEDGER_SEASON_MISSING', detail: `No authoritative cap-health row exists for retention reserve season ${reserve.season}.` });
      }
    }
    const ccf = ccfRows.get(target.canonicalPlayerId);
    return [{
      canonicalPlayerId: target.canonicalPlayerId,
      sourcePlayerName: contract.sourcePlayerName,
      label: target.label,
      priceSource: target.priceSource,
      sourceFingerprint: target.sourceFingerprint,
      ccfRosterMarginalValue: ccf ? ccf.rosterMarginalValue : null,
      reserveBySeason: target.reserveBySeason.map((item) => ({ season: item.season, amount: money(item.amount) })),
    }];
  });

  if (reasons.length) return abstain(reasons);

  const seasons = health.seasons.map((season) => {
    const retentionReserve = money(targets.reduce((sum, target) => (
      sum + target.reserveBySeason
        .filter((reserve) => reserve.season === season.season)
        .reduce((subtotal, reserve) => subtotal + reserve.amount, 0)
    ), 0));
    return {
      season: season.season,
      baselineCapRemaining: season.sourceCapRemaining,
      retentionReserve,
      capRemainingForOtherMoves: money(season.sourceCapRemaining - retentionReserve),
    };
  });

  return {
    status: 'READY',
    version: RETENTION_BUDGET_VERSION,
    targets,
    seasons,
    legalExecution: {
      status: 'UNAVAILABLE',
      reasonCode: 'RE_SIGN_TRANSACTION_ENGINE_REQUIRED',
      detail: 'The budget reservation is usable for planning, but exact re-sign/extension legality and cap transformation require the deterministic re-sign transaction engine.',
    },
  };
}
