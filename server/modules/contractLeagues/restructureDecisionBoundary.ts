import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import {
  simulateContractRestructure,
  type ContractRestructureAction,
  type ContractRestructureContext,
  type ContractRestructureReadyResult,
  type ContractRestructureResult,
} from './restructureEngine';

export const CONTRACT_RESTRUCTURE_DECISION_BOUNDARY_VERSION = 'contract-restructure-decision-boundary.v1' as const;

type BoundaryReason = { code: string; detail: string };

type BoundaryAbstention = {
  status: 'ABSTAIN';
  engineVersion: typeof CONTRACT_RESTRUCTURE_DECISION_BOUNDARY_VERSION;
  reasonCodes: string[];
  details: string[];
  fingerprint: string;
};

export type ContractRestructureDecisionResult = ContractRestructureResult | BoundaryAbstention;

function money(value: number) {
  return Number(value.toFixed(6));
}

function deterministicFingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function abstain(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractRestructureContext,
  action: ContractRestructureAction,
  reasons: BoundaryReason[],
): BoundaryAbstention {
  return {
    status: 'ABSTAIN',
    engineVersion: CONTRACT_RESTRUCTURE_DECISION_BOUNDARY_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
    fingerprint: deterministicFingerprint({
      boundaryVersion: CONTRACT_RESTRUCTURE_DECISION_BOUNDARY_VERSION,
      snapshotInput,
      policyInput,
      context,
      action,
      reasons,
    }),
  };
}

function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}

function rosterState(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  if (contract.status === 'IR') return 'IR' as const;
  if (contract.status === 'SEASON_ENDING_IR') return 'SEASON_ENDING_IR' as const;
  return 'ACTIVE' as const;
}

function resolve(
  snapshot: ContractLeagueSnapshot,
  sourceTeamName: string,
  action: ContractRestructureAction,
) {
  const teamMatches = snapshot.teams.filter((team) => team.sourceTeamName === sourceTeamName);
  if (teamMatches.length !== 1) return null;
  const canonical = action.player.canonicalPlayerId?.trim() || null;
  const source = action.player.sourcePlayerName?.trim() || null;
  if (!canonical && !source) return null;
  const playerMatches = teamMatches[0].contracts.filter((contract) => {
    if (!activeContract(contract)) return false;
    if (canonical && contract.canonicalPlayerId !== canonical) return false;
    if (source && contract.sourcePlayerName !== source) return false;
    return true;
  });
  if (playerMatches.length !== 1) return null;
  return { team: teamMatches[0], contract: playerMatches[0] };
}

function teamOptionalForSeason(
  team: ContractLeagueSnapshot['teams'][number],
  season: number,
) {
  return money(team.contracts.filter(activeContract).reduce((sum, contract) => (
    sum + (contract.years.find((year) => year.season === season)?.optional ?? 0)
  ), 0));
}

function policyCeiling(policy: ContractLeaguePolicy, season: number) {
  return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling
    ?? policy.cap.defaultCeiling;
}

function hardenOptionalCompliance(
  result: ContractRestructureReadyResult,
  snapshot: ContractLeagueSnapshot,
  policy: ContractLeaguePolicy,
  context: ContractRestructureContext,
  action: ContractRestructureAction,
): ContractRestructureReadyResult | BoundaryAbstention {
  const resolved = resolve(snapshot, context.sourceTeamName.trim(), action);
  if (!resolved) return result;

  const additionalViolations = [...result.violations];
  const existingOptionalCapViolations = new Set(
    additionalViolations
      .filter((item) => item.code === 'CAP_CEILING_EXCEEDED')
      .map((item) => item.season),
  );

  for (const compliance of policy.cap.compliance) {
    if (compliance.basis !== 'OPTIONAL') continue;
    if (!compliance.phases.includes(context.phase)) continue;
    if (!['TRANSACTION_TIME', 'CONTINUOUS'].includes(compliance.enforcement)) continue;
    if (compliance.overCeilingAllowed) continue;

    for (const effect of result.seasonEffects) {
      if (existingOptionalCapViolations.has(effect.season)) continue;
      const currentPlayerOptional = resolved.contract.years.find((year) => year.season === effect.season)?.optional ?? 0;
      const currentTeamOptional = teamOptionalForSeason(resolved.team, effect.season);
      const postTeamOptional = money(currentTeamOptional - currentPlayerOptional + effect.after.optional);
      const ceiling = policyCeiling(policy, effect.season);
      if (ceiling === null) {
        return abstain(snapshot, policy, context, action, [{
          code: 'CAP_CEILING_UNAVAILABLE',
          detail: `No cap ceiling is defined for affected season ${effect.season} under OPTIONAL compliance.`,
        }]);
      }
      const allowed = ceiling * compliance.ceilingShare - (compliance.reserveAmount ?? 0);
      if (postTeamOptional > allowed + 0.000001) {
        additionalViolations.push({
          code: 'CAP_CEILING_EXCEEDED',
          season: effect.season,
          detail: `Post-restructure OPTIONAL amount ${postTeamOptional} exceeds allowed amount ${money(allowed)}.`,
        });
      }
    }
  }

  return {
    ...result,
    legal: additionalViolations.length === 0,
    violations: additionalViolations,
    rightEffect: additionalViolations.length === 0 ? result.rightEffect : null,
  };
}

/**
 * Consumer-facing restructure boundary.
 *
 * The pure restructure primitive owns deterministic conversion/reallocation math.
 * This boundary adds source-state safety that depends on the surrounding league
 * snapshot: nominal-value recoverability for reserve states and whole-team
 * OPTIONAL cap compliance.
 */
export function simulateKnownAtContractRestructure(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractRestructureContext,
  action: ContractRestructureAction,
): ContractRestructureDecisionResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  if (!snapshotResult.success || !policyResult.success) {
    return simulateContractRestructure(snapshotInput, policyInput, context, action);
  }

  const resolved = resolve(snapshotResult.data, context.sourceTeamName.trim(), action);
  if (resolved) {
    const state = rosterState(resolved.contract);
    if (state !== 'ACTIVE') {
      const treatment = policyResult.data.cap.rosterStateTreatments.find((item) => item.rosterState === state) ?? null;
      if (!treatment) {
        return abstain(snapshotInput, policyInput, context, action, [{
          code: 'ROSTER_STATE_CAP_TREATMENT_UNAVAILABLE',
          detail: `Policy does not define cap treatment for ${state}; nominal restructure value cannot be established safely.`,
        }]);
      }
      if (treatment.guaranteedMultiplier !== 1
        || treatment.optionalMultiplier !== 1
        || treatment.capHitMultiplier !== 1) {
        return abstain(snapshotInput, policyInput, context, action, [{
          code: 'RESTRUCTURE_NOMINAL_AMOUNT_UNAVAILABLE',
          detail: `Player is in ${state} with non-identity cap treatment; the snapshot may contain discounted rather than nominal contract amounts.`,
        }]);
      }
    }
  }

  const result = simulateContractRestructure(snapshotResult.data, policyResult.data, context, action);
  if (result.status !== 'READY') return result;
  return hardenOptionalCompliance(result, snapshotResult.data, policyResult.data, context, action);
}
