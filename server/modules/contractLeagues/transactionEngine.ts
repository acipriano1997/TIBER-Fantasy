import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import {
  contractLeagueSnapshotSchema,
  type ContractLeagueSnapshot,
} from './contracts';
import {
  contractLeaguePolicySchema,
  type ContractLeaguePolicy,
} from './policy';
import {
  contractLeagueRightsStateSchema,
  deriveContractRightAvailability,
  type ContractLeagueRightsState,
} from './rights';
import { canonicalizeContractLeagueSnapshot } from './persistenceContract';

export const CONTRACT_TRANSACTION_ENGINE_VERSION = 'contract-transaction-engine.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];
type PolicyWindowAction = ContractLeaguePolicy['lifecycle']['windows'][number]['action'];

type PlayerSelector = {
  canonicalPlayerId?: string | null;
  sourcePlayerName?: string | null;
};

export type ContractTeamBinding = {
  teamKey: string;
  sourceTeamName: string;
};

export type ContractTransactionContext = {
  leagueKey: string;
  decisionAt: string;
  phase: ContractLeaguePhase;
  teamBindings: ContractTeamBinding[];
  actionWindowStatus?: Partial<Record<PolicyWindowAction, 'OPEN' | 'CLOSED' | 'UNKNOWN'>>;
  rightsState?: ContractLeagueRightsState | null;
};

export type ContractTransactionAction =
  | {
    type: 'KEEP';
    teamKey: string;
    player: PlayerSelector;
  }
  | {
    type: 'CUT';
    teamKey: string;
    player: PlayerSelector;
  }
  | {
    type: 'TRADE';
    fromTeamKey: string;
    toTeamKey: string;
    player: PlayerSelector;
    retainedGuaranteedBySeason?: Record<number, number>;
  }
  | {
    type: 'AMNESTY';
    teamKey: string;
    player: PlayerSelector;
  }
  | {
    type: 'PLACE_RESERVE';
    teamKey: string;
    player: PlayerSelector;
    targetState: 'IR' | 'SEASON_ENDING_IR';
    externalEligibilityConfirmed: boolean;
  };

export type ContractTransactionRuleViolation = {
  code: string;
  detail: string;
  teamKey?: string;
  season?: number;
  ruleId?: string;
};

export type ContractTransactionAbstention = {
  status: 'ABSTAIN';
  engineVersion: typeof CONTRACT_TRANSACTION_ENGINE_VERSION;
  reasonCodes: string[];
  details: string[];
  fingerprint: string;
};

export type ContractSeasonEconomicView = {
  season: number;
  before: {
    guaranteedObligation: number;
    optionalObligation: number;
    contractCapHit: number;
    retainedGuaranteed: number;
    retainedCapHit: number;
    deadCap: number;
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
    capAfterGuarantees: number;
    capRemaining: number;
  };
  delta: {
    guaranteedObligation: number;
    optionalObligation: number;
    contractCapHit: number;
    retainedGuaranteed: number;
    retainedCapHit: number;
    deadCap: number;
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
  };
  after: {
    guaranteedObligation: number;
    optionalObligation: number;
    contractCapHit: number;
    retainedGuaranteed: number;
    retainedCapHit: number;
    deadCap: number;
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
    capAfterGuarantees: number;
    capRemaining: number;
  };
};

export type ContractTeamEconomicEffect = {
  teamKey: string;
  sourceTeamName: string;
  rosterCountBefore: number;
  rosterCountDelta: number;
  rosterCountAfter: number;
  reserveCountsBefore: Partial<Record<'IR' | 'SEASON_ENDING_IR', number>>;
  reserveCountsAfter: Partial<Record<'IR' | 'SEASON_ENDING_IR', number>>;
  seasons: ContractSeasonEconomicView[];
};

export type ContractRightEffect = {
  teamKey: string;
  rightType: 'AMNESTY';
  usedBefore: number;
  remainingBefore: number;
  quantityConsumed: number;
  remainingAfter: number;
};

export type ContractTransactionReadyResult = {
  status: 'READY';
  engineVersion: typeof CONTRACT_TRANSACTION_ENGINE_VERSION;
  legal: boolean;
  finality: 'FINAL' | 'REQUIRES_APPROVAL' | 'REQUIRES_FOLLOW_UP';
  violations: ContractTransactionRuleViolation[];
  teamEffects: ContractTeamEconomicEffect[];
  rightEffects: ContractRightEffect[];
  followUpActions: string[];
  fingerprint: string;
};

export type ContractTransactionResult = ContractTransactionAbstention | ContractTransactionReadyResult;

type SeasonDelta = {
  guaranteedObligation: number;
  optionalObligation: number;
  contractCapHit: number;
  retainedGuaranteed: number;
  retainedCapHit: number;
  deadCap: number;
  ledgerTotalGuaranteed: number;
  ledgerTotalCapHit: number;
};

type TeamWorkingState = {
  teamKey: string;
  team: ContractLeagueSnapshot['teams'][number];
  rosterCountBefore: number;
  rosterCountDelta: number;
  reserveCountsBefore: Partial<Record<'IR' | 'SEASON_ENDING_IR', number>>;
  reserveCountsAfter: Partial<Record<'IR' | 'SEASON_ENDING_IR', number>>;
  deltas: Map<number, SeasonDelta>;
};

const ZERO_DELTA: SeasonDelta = {
  guaranteedObligation: 0,
  optionalObligation: 0,
  contractCapHit: 0,
  retainedGuaranteed: 0,
  retainedCapHit: 0,
  deadCap: 0,
  ledgerTotalGuaranteed: 0,
  ledgerTotalCapHit: 0,
};

function money(value: number) {
  return Number(value.toFixed(6));
}

function fingerprint(value: unknown): string {
  const canonical = stableStringify(value) ?? JSON.stringify(value);
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function inputFingerprint(
  snapshot: ContractLeagueSnapshot | null,
  policy: ContractLeaguePolicy | null,
  context: ContractTransactionContext,
  action: ContractTransactionAction,
) {
  return fingerprint({
    engineVersion: CONTRACT_TRANSACTION_ENGINE_VERSION,
    snapshot: snapshot ? canonicalizeContractLeagueSnapshot(snapshot) : null,
    policy,
    context,
    action,
  });
}

function abstain(
  snapshot: ContractLeagueSnapshot | null,
  policy: ContractLeaguePolicy | null,
  context: ContractTransactionContext,
  action: ContractTransactionAction,
  reasons: Array<{ code: string; detail: string }>,
): ContractTransactionAbstention {
  return {
    status: 'ABSTAIN',
    engineVersion: CONTRACT_TRANSACTION_ENGINE_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
    fingerprint: inputFingerprint(snapshot, policy, context, action),
  };
}

function activeRosterContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}

function buildBindings(
  snapshot: ContractLeagueSnapshot,
  bindings: ContractTeamBinding[],
): { states: Map<string, TeamWorkingState>; reasons: Array<{ code: string; detail: string }> } {
  const reasons: Array<{ code: string; detail: string }> = [];
  const states = new Map<string, TeamWorkingState>();
  const seenSources = new Set<string>();

  for (const binding of bindings) {
    const teamKey = binding.teamKey.trim();
    const sourceTeamName = binding.sourceTeamName.trim();
    if (!teamKey || !sourceTeamName) {
      reasons.push({
        code: 'TEAM_BINDING_INVALID',
        detail: 'Every team binding requires a non-empty internal teamKey and exact sourceTeamName.',
      });
      continue;
    }
    if (states.has(teamKey) || seenSources.has(sourceTeamName)) {
      reasons.push({
        code: 'TEAM_BINDING_DUPLICATE',
        detail: `Duplicate team binding detected for ${teamKey} / ${sourceTeamName}.`,
      });
      continue;
    }

    const matches = snapshot.teams.filter((team) => team.sourceTeamName === sourceTeamName);
    if (matches.length !== 1) {
      reasons.push({
        code: 'TEAM_BINDING_UNRESOLVED',
        detail: `Team binding ${teamKey} must resolve to exactly one snapshot team named ${sourceTeamName}.`,
      });
      continue;
    }

    const team = matches[0];
    const rosterContracts = team.contracts.filter(activeRosterContract);
    const reserveCountsBefore = {
      IR: rosterContracts.filter((contract) => contract.status === 'IR').length,
      SEASON_ENDING_IR: rosterContracts.filter((contract) => contract.status === 'SEASON_ENDING_IR').length,
    };
    states.set(teamKey, {
      teamKey,
      team,
      rosterCountBefore: rosterContracts.length,
      rosterCountDelta: 0,
      reserveCountsBefore,
      reserveCountsAfter: { ...reserveCountsBefore },
      deltas: new Map(),
    });
    seenSources.add(sourceTeamName);
  }

  return { states, reasons };
}

function getTeam(
  states: Map<string, TeamWorkingState>,
  teamKey: string,
): TeamWorkingState | null {
  return states.get(teamKey) ?? null;
}

function resolvePlayer(
  state: TeamWorkingState,
  selector: PlayerSelector,
): ContractLeagueSnapshot['teams'][number]['contracts'][number] | null {
  const canonical = selector.canonicalPlayerId?.trim() || null;
  const source = selector.sourcePlayerName?.trim() || null;
  if (!canonical && !source) return null;

  const matches = state.team.contracts.filter((contract) => {
    if (canonical && contract.canonicalPlayerId !== canonical) return false;
    if (source && contract.sourcePlayerName !== source) return false;
    return activeRosterContract(contract);
  });
  return matches.length === 1 ? matches[0] : null;
}

function deltaFor(state: TeamWorkingState, season: number): SeasonDelta {
  const existing = state.deltas.get(season);
  if (existing) return existing;
  const created = { ...ZERO_DELTA };
  state.deltas.set(season, created);
  return created;
}

function applySeasonDelta(
  state: TeamWorkingState,
  season: number,
  patch: Partial<SeasonDelta>,
) {
  const target = deltaFor(state, season);
  for (const key of Object.keys(patch) as Array<keyof SeasonDelta>) {
    target[key] = money(target[key] + (patch[key] ?? 0));
  }
}

function contractSums(team: TeamWorkingState['team'], season: number) {
  return team.contracts.filter(activeRosterContract).reduce((sum, contract) => {
    const year = contract.years.find((item) => item.season === season);
    if (!year) return sum;
    return {
      guaranteed: sum.guaranteed + year.guaranteed,
      optional: sum.optional + year.optional,
      capHit: sum.capHit + year.capHit,
    };
  }, { guaranteed: 0, optional: 0, capHit: 0 });
}

function deadCapSum(team: TeamWorkingState['team'], season: number) {
  return team.deadCap.reduce((sum, entry) => (
    sum + (entry.years.find((year) => year.season === season)?.amount ?? 0)
  ), 0);
}

function teamEffect(state: TeamWorkingState): ContractTeamEconomicEffect {
  const seasons = [...new Set([
    ...state.team.cap.map((item) => item.season),
    ...state.deltas.keys(),
  ])].sort((a, b) => a - b);

  const seasonViews = seasons.map((season): ContractSeasonEconomicView | null => {
    const ledger = state.team.cap.find((item) => item.season === season);
    if (!ledger) return null;
    const components = contractSums(state.team, season);
    const deadCap = deadCapSum(state.team, season);
    const delta = state.deltas.get(season) ?? ZERO_DELTA;
    const before = {
      guaranteedObligation: money(components.guaranteed),
      optionalObligation: money(components.optional),
      contractCapHit: money(components.capHit),
      retainedGuaranteed: 0,
      retainedCapHit: 0,
      deadCap: money(deadCap),
      ledgerTotalGuaranteed: money(ledger.totalGuaranteed),
      ledgerTotalCapHit: money(ledger.totalCapHit),
      capAfterGuarantees: money(ledger.capAfterGuarantees),
      capRemaining: money(ledger.capRemaining),
    };
    const after = {
      guaranteedObligation: money(before.guaranteedObligation + delta.guaranteedObligation),
      optionalObligation: money(before.optionalObligation + delta.optionalObligation),
      contractCapHit: money(before.contractCapHit + delta.contractCapHit),
      retainedGuaranteed: money(delta.retainedGuaranteed),
      retainedCapHit: money(delta.retainedCapHit),
      deadCap: money(before.deadCap + delta.deadCap),
      ledgerTotalGuaranteed: money(before.ledgerTotalGuaranteed + delta.ledgerTotalGuaranteed),
      ledgerTotalCapHit: money(before.ledgerTotalCapHit + delta.ledgerTotalCapHit),
      capAfterGuarantees: money(before.capAfterGuarantees - delta.ledgerTotalGuaranteed),
      capRemaining: money(before.capRemaining - delta.ledgerTotalCapHit),
    };
    return { season, before, delta: { ...delta }, after };
  }).filter((item): item is ContractSeasonEconomicView => item !== null);

  return {
    teamKey: state.teamKey,
    sourceTeamName: state.team.sourceTeamName,
    rosterCountBefore: state.rosterCountBefore,
    rosterCountDelta: state.rosterCountDelta,
    rosterCountAfter: state.rosterCountBefore + state.rosterCountDelta,
    reserveCountsBefore: { ...state.reserveCountsBefore },
    reserveCountsAfter: { ...state.reserveCountsAfter },
    seasons: seasonViews,
  };
}

function affectedTeamEffects(states: Map<string, TeamWorkingState>) {
  return [...states.values()]
    .filter((state) => state.rosterCountDelta !== 0 || state.deltas.size > 0
      || JSON.stringify(state.reserveCountsAfter) !== JSON.stringify(state.reserveCountsBefore))
    .map(teamEffect)
    .sort((a, b) => a.teamKey.localeCompare(b.teamKey));
}

function policyCeiling(policy: ContractLeaguePolicy, season: number) {
  return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling
    ?? policy.cap.defaultCeiling;
}

function basisAmount(
  view: ContractSeasonEconomicView,
  basis: ContractLeaguePolicy['cap']['compliance'][number]['basis'],
) {
  const guaranteed = view.after.guaranteedObligation + view.after.retainedGuaranteed;
  const optional = view.after.optionalObligation;
  const capHit = view.after.contractCapHit + view.after.retainedCapHit;
  switch (basis) {
    case 'GUARANTEED': return guaranteed;
    case 'OPTIONAL': return optional;
    case 'CAP_HIT': return capHit;
    case 'GUARANTEED_PLUS_DEAD_CAP': return guaranteed + view.after.deadCap;
    case 'CAP_HIT_PLUS_DEAD_CAP': return capHit + view.after.deadCap;
  }
}

function validateCapAndRoster(
  policy: ContractLeaguePolicy,
  context: ContractTransactionContext,
  effects: ContractTeamEconomicEffect[],
) {
  const violations: ContractTransactionRuleViolation[] = [];
  const reasons: Array<{ code: string; detail: string }> = [];
  const rosterLimit = policy.roster.limitsByPhase.find((item) => item.phase === context.phase)?.maxPlayers ?? null;

  for (const effect of effects) {
    if (rosterLimit !== null && effect.rosterCountAfter > rosterLimit) {
      violations.push({
        code: 'ROSTER_LIMIT_EXCEEDED',
        teamKey: effect.teamKey,
        detail: `Roster would contain ${effect.rosterCountAfter} players with a phase limit of ${rosterLimit}.`,
      });
    }

    for (const rule of policy.cap.compliance) {
      if (!rule.phases.includes(context.phase)) continue;
      if (!['TRANSACTION_TIME', 'CONTINUOUS'].includes(rule.enforcement)) continue;
      if (rule.overCeilingAllowed) continue;

      for (const view of effect.seasons) {
        const ceiling = policyCeiling(policy, view.season);
        if (ceiling === null) {
          reasons.push({
            code: 'CAP_CEILING_UNAVAILABLE',
            detail: `No cap ceiling is defined for season ${view.season} under compliance rule ${rule.id}.`,
          });
          continue;
        }
        const allowed = ceiling * rule.ceilingShare - (rule.reserveAmount ?? 0);
        const actual = basisAmount(view, rule.basis);
        if (actual > allowed + 0.000001) {
          violations.push({
            code: 'CAP_CEILING_EXCEEDED',
            teamKey: effect.teamKey,
            season: view.season,
            ruleId: rule.id,
            detail: `Post-transaction ${rule.basis} amount ${money(actual)} exceeds allowed amount ${money(allowed)}.`,
          });
        }
      }
    }
  }

  return { violations, reasons };
}

function requireOpenWindow(
  context: ContractTransactionContext,
  action: PolicyWindowAction,
): { violation?: ContractTransactionRuleViolation; reason?: { code: string; detail: string } } {
  const status = context.actionWindowStatus?.[action] ?? 'UNKNOWN';
  if (status === 'OPEN') return {};
  if (status === 'CLOSED') {
    return {
      violation: {
        code: `${action}_WINDOW_CLOSED`,
        detail: `${action} lifecycle window is closed at the frozen decision time.`,
      },
    };
  }
  return {
    reason: {
      code: `${action}_WINDOW_UNRESOLVED`,
      detail: `${action} lifecycle window must be resolved by the calendar/lifecycle layer before simulation.`,
    },
  };
}

function currentRosterState(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  if (contract.status === 'IR') return 'IR' as const;
  if (contract.status === 'SEASON_ENDING_IR') return 'SEASON_ENDING_IR' as const;
  return 'ACTIVE' as const;
}

function treatment(
  policy: ContractLeaguePolicy,
  rosterState: 'ACTIVE' | 'IR' | 'SEASON_ENDING_IR',
) {
  return policy.cap.rosterStateTreatments.find((item) => item.rosterState === rosterState) ?? null;
}

function scaledAmount(
  currentAmount: number,
  currentMultiplier: number,
  targetMultiplier: number,
): number | null {
  if (currentMultiplier === 0) {
    if (currentAmount === 0 && targetMultiplier === 0) return 0;
    return null;
  }
  return money((currentAmount / currentMultiplier) * targetMultiplier);
}

function finishReady(
  snapshot: ContractLeagueSnapshot,
  policy: ContractLeaguePolicy,
  context: ContractTransactionContext,
  action: ContractTransactionAction,
  states: Map<string, TeamWorkingState>,
  violations: ContractTransactionRuleViolation[],
  rightEffects: ContractRightEffect[],
  followUpActions: string[],
): ContractTransactionResult {
  const teamEffects = affectedTeamEffects(states);
  const checks = validateCapAndRoster(policy, context, teamEffects);
  if (checks.reasons.length) {
    return abstain(snapshot, policy, context, action, checks.reasons);
  }
  violations.push(...checks.violations);

  const finality = followUpActions.length > 0
    ? (followUpActions.some((item) => item.startsWith('APPROVAL:'))
      ? 'REQUIRES_APPROVAL'
      : 'REQUIRES_FOLLOW_UP')
    : 'FINAL';

  return {
    status: 'READY',
    engineVersion: CONTRACT_TRANSACTION_ENGINE_VERSION,
    legal: violations.length === 0,
    finality,
    violations,
    teamEffects,
    rightEffects,
    followUpActions,
    fingerprint: inputFingerprint(snapshot, policy, context, action),
  };
}

export function simulateContractTransaction(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractTransactionContext,
  action: ContractTransactionAction,
): ContractTransactionResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;
  const policy = policyResult.success ? policyResult.data : null;

  const earlyReasons: Array<{ code: string; detail: string }> = [];
  if (!snapshotResult.success) {
    earlyReasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  }
  if (!policyResult.success) {
    earlyReasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  }
  if (earlyReasons.length) return abstain(snapshot, policy, context, action, earlyReasons);

  if (snapshot!.validation.status !== 'VALID') {
    earlyReasons.push({
      code: 'SNAPSHOT_NOT_DECISION_READY',
      detail: `Contract snapshot validation status is ${snapshot!.validation.status}; only VALID state may drive transaction decisions.`,
    });
  }
  if (policy!.validation.status !== 'VALID') {
    earlyReasons.push({
      code: 'POLICY_NOT_DECISION_READY',
      detail: `Contract policy validation status is ${policy!.validation.status}; only VALID policy may drive transaction decisions.`,
    });
  }
  if (snapshot!.league.season !== policy!.effective.season) {
    earlyReasons.push({
      code: 'POLICY_SEASON_MISMATCH',
      detail: `Snapshot season ${snapshot!.league.season} does not match policy season ${policy!.effective.season}.`,
    });
  }

  const decisionAt = new Date(context.decisionAt);
  const effectiveFrom = new Date(policy!.effective.effectiveFrom);
  const effectiveUntil = policy!.effective.effectiveUntil ? new Date(policy!.effective.effectiveUntil) : null;
  if (!Number.isFinite(decisionAt.valueOf())) {
    earlyReasons.push({ code: 'DECISION_TIME_INVALID', detail: 'decisionAt must be an ISO timestamp.' });
  } else if (decisionAt < effectiveFrom || (effectiveUntil && decisionAt >= effectiveUntil)) {
    earlyReasons.push({
      code: 'POLICY_NOT_EFFECTIVE',
      detail: 'Policy is not effective at the frozen decision timestamp.',
    });
  }
  if (earlyReasons.length) return abstain(snapshot!, policy!, context, action, earlyReasons);

  const bound = buildBindings(snapshot!, context.teamBindings);
  if (bound.reasons.length) return abstain(snapshot!, policy!, context, action, bound.reasons);
  const states = bound.states;
  const violations: ContractTransactionRuleViolation[] = [];
  const rightEffects: ContractRightEffect[] = [];
  const followUpActions: string[] = [];

  if (action.type === 'KEEP') {
    const state = getTeam(states, action.teamKey);
    if (!state || !resolvePlayer(state, action.player)) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'PLAYER_UNRESOLVED',
        detail: 'KEEP requires exactly one active roster contract on the bound team.',
      }]);
    }
    return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
  }

  if (action.type === 'CUT') {
    const state = getTeam(states, action.teamKey);
    if (!state || !resolvePlayer(state, action.player)) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'PLAYER_UNRESOLVED',
        detail: 'CUT requires exactly one active roster contract on the bound team.',
      }]);
    }
    return abstain(snapshot!, policy!, context, action, [{
      code: 'CUT_FINANCIAL_POLICY_UNAVAILABLE',
      detail: 'The current policy schema does not yet encode whether released guaranteed/optional money becomes dead cap, clears, or accelerates. CUT must abstain rather than assume NFL-style treatment.',
    }]);
  }

  if (action.type === 'TRADE') {
    const window = requireOpenWindow(context, 'TRADE');
    if (window.reason) return abstain(snapshot!, policy!, context, action, [window.reason]);
    if (window.violation) violations.push(window.violation);

    if (action.fromTeamKey === action.toTeamKey) {
      violations.push({ code: 'TRADE_SAME_TEAM', detail: 'A trade requires distinct source and destination teams.' });
      return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
    }

    const source = getTeam(states, action.fromTeamKey);
    const target = getTeam(states, action.toTeamKey);
    if (!source || !target) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'TRADE_TEAM_UNRESOLVED',
        detail: 'Both trade teams must have explicit internal-to-source bindings.',
      }]);
    }
    const contract = resolvePlayer(source, action.player);
    if (!contract) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'PLAYER_UNRESOLVED',
        detail: 'TRADE requires exactly one active roster contract on the source team.',
      }]);
    }

    const retainedBySeason = action.retainedGuaranteedBySeason ?? {};
    const retainedPolicy = policy!.transactions.trades.retainedGuaranteedMoney;
    const retaining = Object.values(retainedBySeason).some((amount) => amount > 0);
    if (retaining && !retainedPolicy.allowed) {
      violations.push({ code: 'RETAINED_SALARY_NOT_ALLOWED', detail: 'Policy forbids retained guaranteed salary in trades.' });
    }
    if (retaining && retainedPolicy.maxSharePerYear === null) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'RETAINED_SALARY_LIMIT_UNAVAILABLE',
        detail: 'A retained-salary trade requires an explicit per-year retention limit.',
      }]);
    }

    for (const year of contract.years) {
      const retained = Number(retainedBySeason[year.season] ?? 0);
      if (!Number.isFinite(retained) || retained < 0) {
        violations.push({
          code: 'RETAINED_SALARY_INVALID',
          season: year.season,
          detail: 'Retained guaranteed salary must be a finite non-negative amount.',
        });
        continue;
      }
      if (retained > year.guaranteed + 0.000001) {
        violations.push({
          code: 'RETAINED_SALARY_EXCEEDS_GUARANTEE',
          season: year.season,
          detail: 'Retained guaranteed salary cannot exceed that season\'s guaranteed money.',
        });
      }
      if (retainedPolicy.maxSharePerYear !== null
        && retained > year.guaranteed * retainedPolicy.maxSharePerYear + 0.000001) {
        violations.push({
          code: 'RETAINED_SALARY_LIMIT_EXCEEDED',
          season: year.season,
          detail: 'Retained guaranteed salary exceeds the policy maximum share for that season.',
        });
      }
      if (retaining && Math.abs(year.capHit - (year.guaranteed + year.optional)) > 0.000001) {
        return abstain(snapshot!, policy!, context, action, [{
          code: 'CONTRACT_CAP_HIT_DECOMPOSITION_UNAVAILABLE',
          detail: 'Retained-salary simulation requires capHit to reconcile to guaranteed + optional for every affected contract year.',
        }]);
      }

      applySeasonDelta(source, year.season, {
        guaranteedObligation: -year.guaranteed,
        optionalObligation: -year.optional,
        contractCapHit: -year.capHit,
        retainedGuaranteed: retained,
        retainedCapHit: retained,
        ledgerTotalGuaranteed: -(year.guaranteed - retained),
        ledgerTotalCapHit: -(year.capHit - retained),
      });
      applySeasonDelta(target, year.season, {
        guaranteedObligation: year.guaranteed - retained,
        optionalObligation: year.optional,
        contractCapHit: year.capHit - retained,
        ledgerTotalGuaranteed: year.guaranteed - retained,
        ledgerTotalCapHit: year.capHit - retained,
      });
    }

    source.rosterCountDelta -= 1;
    target.rosterCountDelta += 1;
    if ((policy!.transactions.trades.outsideApprovalsRequired ?? 0) > 0) {
      followUpActions.push(`APPROVAL:${policy!.transactions.trades.outsideApprovalsRequired} outside approval(s) required before finality.`);
    }

    return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
  }

  if (action.type === 'AMNESTY') {
    const state = getTeam(states, action.teamKey);
    const contract = state ? resolvePlayer(state, action.player) : null;
    if (!state || !contract) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'PLAYER_UNRESOLVED',
        detail: 'AMNESTY requires exactly one active roster contract on the bound team.',
      }]);
    }
    const amnesty = policy!.contracts.amnesty;
    if (!amnesty.enabled) {
      violations.push({ code: 'AMNESTY_DISABLED', teamKey: action.teamKey, detail: 'Policy disables amnesty transactions.' });
      return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
    }
    if (!amnesty.allowance) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'AMNESTY_ALLOWANCE_UNAVAILABLE',
        detail: 'Amnesty is enabled but the policy does not define its usage allowance.',
      }]);
    }
    if (!context.rightsState) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'RIGHTS_STATE_UNAVAILABLE',
        detail: 'Amnesty simulation requires the immutable scarce-right usage ledger.',
      }]);
    }
    const rightsParsed = contractLeagueRightsStateSchema.safeParse(context.rightsState);
    if (!rightsParsed.success || rightsParsed.data.validation.status !== 'VALID') {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'RIGHTS_STATE_NOT_DECISION_READY',
        detail: 'Amnesty simulation requires VALID scarce-right state.',
      }]);
    }
    const availability = deriveContractRightAvailability(
      rightsParsed.data,
      { teamKey: action.teamKey, rightType: 'AMNESTY' },
      amnesty.allowance,
      snapshot!.league.season,
    );
    if (availability.remaining <= 0) {
      violations.push({ code: 'AMNESTY_EXHAUSTED', teamKey: action.teamKey, detail: 'No amnesty uses remain in the applicable policy window.' });
      return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
    }

    if (!amnesty.clearsGuaranteedMoney || !amnesty.clearsOptionalMoney || !amnesty.sendsPlayerToWaivers) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'AMNESTY_FINANCIAL_TREATMENT_UNMODELED',
        detail: 'This kernel currently simulates amnesty only when policy explicitly clears all guaranteed/optional money and sends the player to waivers; surviving obligations need a separately modeled destination.',
      }]);
    }

    for (const year of contract.years) {
      applySeasonDelta(state, year.season, {
        guaranteedObligation: -year.guaranteed,
        optionalObligation: -year.optional,
        contractCapHit: -year.capHit,
        ledgerTotalGuaranteed: -year.guaranteed,
        ledgerTotalCapHit: -year.capHit,
      });
    }
    state.rosterCountDelta -= 1;
    rightEffects.push({
      teamKey: action.teamKey,
      rightType: 'AMNESTY',
      usedBefore: availability.used,
      remainingBefore: availability.remaining,
      quantityConsumed: 1,
      remainingAfter: Math.max(0, availability.remaining - 1),
    });
    if (amnesty.reacquisitionCooldownHours !== null && amnesty.reacquisitionCooldownHours > 0) {
      followUpActions.push(`COOLDOWN: releasing team cannot reacquire the player for ${amnesty.reacquisitionCooldownHours} hour(s).`);
    }

    return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
  }

  const state = getTeam(states, action.teamKey);
  const contract = state ? resolvePlayer(state, action.player) : null;
  if (!state || !contract) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'PLAYER_UNRESOLVED',
      detail: 'Reserve placement requires exactly one active roster contract on the bound team.',
    }]);
  }
  if (!action.externalEligibilityConfirmed) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RESERVE_ELIGIBILITY_UNCONFIRMED',
      detail: 'Reserve placement requires a separately verified injury/eligibility witness; the economic engine does not infer medical or platform eligibility.',
    }]);
  }

  const currentState = currentRosterState(contract);
  const currentTreatment = treatment(policy!, currentState);
  const targetTreatment = treatment(policy!, action.targetState);
  if (!currentTreatment || !targetTreatment) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'ROSTER_STATE_CAP_TREATMENT_UNAVAILABLE',
      detail: `Policy must explicitly define cap treatment for both ${currentState} and ${action.targetState}.`,
    }]);
  }

  const targetSlot = policy!.roster.reserveSlots.find((slot) => slot.state === action.targetState);
  if (!targetSlot) {
    violations.push({
      code: 'RESERVE_STATE_NOT_ALLOWED',
      teamKey: action.teamKey,
      detail: `Policy does not define any ${action.targetState} slots.`,
    });
    return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
  }
  const occupied = state.reserveCountsAfter[action.targetState] ?? 0;
  if (currentState !== action.targetState && occupied >= targetSlot.count) {
    violations.push({
      code: 'RESERVE_SLOTS_FULL',
      teamKey: action.teamKey,
      detail: `${action.targetState} already has ${occupied}/${targetSlot.count} occupied slots.`,
    });
    return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
  }

  for (const year of contract.years) {
    const nextGuaranteed = scaledAmount(year.guaranteed, currentTreatment.guaranteedMultiplier, targetTreatment.guaranteedMultiplier);
    const nextOptional = scaledAmount(year.optional, currentTreatment.optionalMultiplier, targetTreatment.optionalMultiplier);
    const nextCapHit = scaledAmount(year.capHit, currentTreatment.capHitMultiplier, targetTreatment.capHitMultiplier);
    if (nextGuaranteed === null || nextOptional === null || nextCapHit === null) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'ROSTER_STATE_NOMINAL_AMOUNT_UNRECOVERABLE',
        detail: 'Current roster-state multiplier is zero, so the nominal obligation cannot be reconstructed safely for the target state.',
      }]);
    }
    applySeasonDelta(state, year.season, {
      guaranteedObligation: nextGuaranteed - year.guaranteed,
      optionalObligation: nextOptional - year.optional,
      contractCapHit: nextCapHit - year.capHit,
      ledgerTotalGuaranteed: nextGuaranteed - year.guaranteed,
      ledgerTotalCapHit: nextCapHit - year.capHit,
    });
  }

  if (currentState === 'IR' || currentState === 'SEASON_ENDING_IR') {
    state.reserveCountsAfter[currentState] = Math.max(0, (state.reserveCountsAfter[currentState] ?? 0) - 1);
  }
  state.reserveCountsAfter[action.targetState] = (state.reserveCountsAfter[action.targetState] ?? 0) + 1;

  return finishReady(snapshot!, policy!, context, action, states, violations, rightEffects, followUpActions);
}
