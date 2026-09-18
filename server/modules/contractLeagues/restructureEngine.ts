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

export const CONTRACT_RESTRUCTURE_ENGINE_VERSION = 'contract-restructure-engine.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];

type PlayerSelector = {
  canonicalPlayerId?: string | null;
  sourcePlayerName?: string | null;
};

export type ContractRestructureYear = {
  season: number;
  guaranteed: number;
  optional: number;
  capHit: number;
};

export type ContractRestructureContext = {
  leagueKey: string;
  decisionAt: string;
  phase: ContractLeaguePhase;
  teamKey: string;
  sourceTeamName: string;
  restructureWindowStatus: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  rightsState?: ContractLeagueRightsState | null;
};

export type ContractRestructureAction = {
  player: PlayerSelector;
  proposedYears: ContractRestructureYear[];
};

export type ContractRestructureViolation = {
  code: string;
  detail: string;
  season?: number;
};

export type ContractRestructureSeasonEffect = {
  season: number;
  before: {
    guaranteed: number;
    optional: number;
    capHit: number;
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
    capAfterGuarantees: number;
    capRemaining: number;
  };
  delta: {
    guaranteed: number;
    optional: number;
    capHit: number;
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
  };
  after: {
    guaranteed: number;
    optional: number;
    capHit: number;
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
    capAfterGuarantees: number;
    capRemaining: number;
  };
};

export type ContractRestructureRightEffect = {
  teamKey: string;
  rightType: 'RESTRUCTURE';
  usedBefore: number;
  remainingBefore: number;
  quantityConsumed: number;
  remainingAfter: number;
};

export type ContractRestructureAbstention = {
  status: 'ABSTAIN';
  engineVersion: typeof CONTRACT_RESTRUCTURE_ENGINE_VERSION;
  reasonCodes: string[];
  details: string[];
  fingerprint: string;
};

export type ContractRestructureReadyResult = {
  status: 'READY';
  engineVersion: typeof CONTRACT_RESTRUCTURE_ENGINE_VERSION;
  legal: boolean;
  violations: ContractRestructureViolation[];
  originalEconomicValue: number;
  restructuredEconomicValue: number;
  seasonEffects: ContractRestructureSeasonEffect[];
  rightEffect: ContractRestructureRightEffect | null;
  fingerprint: string;
};

export type ContractRestructureResult = ContractRestructureAbstention | ContractRestructureReadyResult;

type Reason = { code: string; detail: string };

function money(value: number) {
  return Number(value.toFixed(6));
}

function deterministicFingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

function fingerprint(
  snapshot: ContractLeagueSnapshot | null,
  policy: ContractLeaguePolicy | null,
  context: ContractRestructureContext,
  action: ContractRestructureAction,
) {
  return deterministicFingerprint({
    engineVersion: CONTRACT_RESTRUCTURE_ENGINE_VERSION,
    snapshot: snapshot ? canonicalizeContractLeagueSnapshot(snapshot) : null,
    policy,
    context,
    action,
  });
}

function abstain(
  snapshot: ContractLeagueSnapshot | null,
  policy: ContractLeaguePolicy | null,
  context: ContractRestructureContext,
  action: ContractRestructureAction,
  reasons: Reason[],
): ContractRestructureAbstention {
  return {
    status: 'ABSTAIN',
    engineVersion: CONTRACT_RESTRUCTURE_ENGINE_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
    fingerprint: fingerprint(snapshot, policy, context, action),
  };
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}

function futureEvidenceReason(
  decisionMs: number,
  label: string,
  value: string | null | undefined,
  code: string,
): Reason | null {
  if (!value) return null;
  const evidenceMs = parseTime(value);
  if (evidenceMs === null) {
    return { code: `${code}_INVALID`, detail: `${label} must be a valid timestamp when present.` };
  }
  if (evidenceMs > decisionMs) {
    return {
      code,
      detail: `${label} occurs after the frozen decision timestamp and is ineligible for known-at simulation.`,
    };
  }
  return null;
}

function mroundPositive(value: number, increment: number) {
  return money(Math.round(value / increment) * increment);
}

function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}

function rosterState(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  if (contract.status === 'IR') return 'IR';
  if (contract.status === 'SEASON_ENDING_IR') return 'SEASON_ENDING_IR';
  return 'ACTIVE';
}

function resolveContract(
  snapshot: ContractLeagueSnapshot,
  sourceTeamName: string,
  selector: PlayerSelector,
) {
  const teams = snapshot.teams.filter((team) => team.sourceTeamName === sourceTeamName);
  if (teams.length !== 1) return null;
  const canonical = selector.canonicalPlayerId?.trim() || null;
  const source = selector.sourcePlayerName?.trim() || null;
  if (!canonical && !source) return null;
  const matches = teams[0].contracts.filter((contract) => {
    if (!activeContract(contract)) return false;
    if (canonical && contract.canonicalPlayerId !== canonical) return false;
    if (source && contract.sourcePlayerName !== source) return false;
    return true;
  });
  return matches.length === 1 ? { team: teams[0], contract: matches[0] } : null;
}

function policyCeiling(policy: ContractLeaguePolicy, season: number) {
  return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling
    ?? policy.cap.defaultCeiling;
}

function complianceAmount(
  basis: ContractLeaguePolicy['cap']['compliance'][number]['basis'],
  guaranteed: number,
  optional: number,
  capHit: number,
  deadCap: number,
) {
  switch (basis) {
    case 'GUARANTEED': return guaranteed;
    case 'OPTIONAL': return optional;
    case 'CAP_HIT': return capHit;
    case 'GUARANTEED_PLUS_DEAD_CAP': return guaranteed + deadCap;
    case 'CAP_HIT_PLUS_DEAD_CAP': return capHit + deadCap;
  }
}

export function simulateContractRestructure(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractRestructureContext,
  action: ContractRestructureAction,
): ContractRestructureResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;
  const policy = policyResult.success ? policyResult.data : null;
  const reasons: Reason[] = [];

  if (!snapshotResult.success) reasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  if (!policyResult.success) reasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  if (reasons.length) return abstain(snapshot, policy, context, action, reasons);

  const leagueKey = context.leagueKey.trim();
  if (!leagueKey) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Restructure simulation requires an explicit internal league key.' });
  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'decisionAt must be a valid frozen timestamp.' });

  if (snapshot!.validation.status !== 'VALID') {
    reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Only VALID contract snapshots may drive restructure decisions.' });
  }
  if (policy!.validation.status !== 'VALID') {
    reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Only VALID contract policy may drive restructure decisions.' });
  }
  if (snapshot!.league.season !== policy!.effective.season) {
    reasons.push({ code: 'POLICY_SEASON_MISMATCH', detail: 'Snapshot season and policy season do not match.' });
  }

  if (decisionMs !== null) {
    const snapshotImported = futureEvidenceReason(decisionMs, 'snapshot provenance.importedAt', snapshot!.provenance.importedAt, 'SNAPSHOT_IMPORTED_AFTER_DECISION');
    const snapshotModified = futureEvidenceReason(decisionMs, 'snapshot provenance.sourceModifiedAt', snapshot!.provenance.sourceModifiedAt, 'SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION');
    const policyImported = futureEvidenceReason(decisionMs, 'policy provenance.importedAt', policy!.provenance.importedAt, 'POLICY_IMPORTED_AFTER_DECISION');
    const policyModified = futureEvidenceReason(decisionMs, 'policy provenance.sourceModifiedAt', policy!.provenance.sourceModifiedAt, 'POLICY_SOURCE_MODIFIED_AFTER_DECISION');
    for (const reason of [snapshotImported, snapshotModified, policyImported, policyModified]) if (reason) reasons.push(reason);
  }

  const effectiveFrom = parseTime(policy!.effective.effectiveFrom);
  const effectiveUntil = parseTime(policy!.effective.effectiveUntil);
  if (decisionMs !== null && effectiveFrom !== null
    && (decisionMs < effectiveFrom || (effectiveUntil !== null && decisionMs >= effectiveUntil))) {
    reasons.push({ code: 'POLICY_NOT_EFFECTIVE', detail: 'Policy is not effective at the frozen decision timestamp.' });
  }

  if (reasons.length) return abstain(snapshot!, policy!, context, action, reasons);

  const violations: ContractRestructureViolation[] = [];
  const restructurePolicy = policy!.contracts.restructure;
  if (!restructurePolicy.enabled) {
    violations.push({ code: 'RESTRUCTURE_DISABLED', detail: 'League policy disables contract restructures.' });
  }
  if (!restructurePolicy.allowedPhases.includes(context.phase)) {
    violations.push({ code: 'RESTRUCTURE_PHASE_NOT_ALLOWED', detail: `Restructures are not allowed during ${context.phase}.` });
  }
  if (context.restructureWindowStatus === 'UNKNOWN') {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RESTRUCTURE_WINDOW_UNRESOLVED',
      detail: 'The lifecycle layer must resolve whether the restructure window is open.',
    }]);
  }
  if (context.restructureWindowStatus === 'CLOSED') {
    violations.push({ code: 'RESTRUCTURE_WINDOW_CLOSED', detail: 'The restructure lifecycle window is closed.' });
  }

  const resolved = resolveContract(snapshot!, context.sourceTeamName.trim(), action.player);
  if (!resolved) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'PLAYER_UNRESOLVED',
      detail: 'RESTRUCTURE requires exactly one active roster contract on the bound source team.',
    }]);
  }
  const { team, contract } = resolved;
  const state = rosterState(contract);
  if (restructurePolicy.blockedRosterStates.includes(state)) {
    violations.push({ code: 'RESTRUCTURE_ROSTER_STATE_BLOCKED', detail: `Policy blocks restructures for players in ${state}.` });
  }

  if (!restructurePolicy.allowance) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RESTRUCTURE_ALLOWANCE_UNAVAILABLE',
      detail: 'Enabled restructures require an explicit usage allowance.',
    }]);
  }
  if (!context.rightsState) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RIGHTS_STATE_UNAVAILABLE',
      detail: 'Restructure simulation requires the immutable scarce-right usage ledger.',
    }]);
  }
  const rightsResult = contractLeagueRightsStateSchema.safeParse(context.rightsState);
  if (!rightsResult.success || rightsResult.data.validation.status !== 'VALID') {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RIGHTS_STATE_NOT_DECISION_READY',
      detail: 'Restructure simulation requires VALID scarce-right state.',
    }]);
  }
  if (rightsResult.data.leagueKey !== leagueKey) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RIGHTS_LEAGUE_MISMATCH',
      detail: 'Scarce-right state belongs to a different internal league key.',
    }]);
  }
  if (decisionMs !== null) {
    const rightsTimes = [
      futureEvidenceReason(decisionMs, 'rights asOf', rightsResult.data.asOf, 'RIGHTS_AS_OF_AFTER_DECISION'),
      futureEvidenceReason(decisionMs, 'rights provenance.importedAt', rightsResult.data.provenance.importedAt, 'RIGHTS_IMPORTED_AFTER_DECISION'),
      futureEvidenceReason(decisionMs, 'rights provenance.sourceModifiedAt', rightsResult.data.provenance.sourceModifiedAt, 'RIGHTS_SOURCE_MODIFIED_AFTER_DECISION'),
    ].filter((item): item is Reason => item !== null);
    if (rightsTimes.length) return abstain(snapshot!, policy!, context, action, rightsTimes);
  }

  const availability = deriveContractRightAvailability(
    rightsResult.data,
    { teamKey: context.teamKey, rightType: 'RESTRUCTURE' },
    restructurePolicy.allowance,
    snapshot!.league.season,
  );
  if (availability.remaining <= 0) {
    violations.push({ code: 'RESTRUCTURE_EXHAUSTED', detail: 'No restructure uses remain in the applicable policy window.' });
  }

  const currentYears = contract.years
    .filter((year) => year.season >= snapshot!.league.season)
    .sort((a, b) => a.season - b.season);
  const proposedYears = [...action.proposedYears].sort((a, b) => a.season - b.season);

  const currentSeasons = currentYears.map((year) => year.season);
  const proposedSeasons = proposedYears.map((year) => year.season);
  if (new Set(proposedSeasons).size !== proposedSeasons.length
    || currentSeasons.length !== proposedSeasons.length
    || currentSeasons.some((season, index) => proposedSeasons[index] !== season)) {
    violations.push({
      code: 'RESTRUCTURE_TERM_CHANGED',
      detail: 'A restructure must preserve the exact remaining contract seasons; it may reallocate value but not change term.',
    });
  }

  const ledgerMissing = currentSeasons.filter((season) => !team.cap.some((entry) => entry.season === season));
  if (ledgerMissing.length) {
    return abstain(snapshot!, policy!, context, action, ledgerMissing.map((season) => ({
      code: 'CAP_LEDGER_SEASON_MISSING',
      detail: `No authoritative team cap-ledger row exists for affected season ${season}.`,
    })));
  }

  for (const year of currentYears) {
    if (Math.abs(year.capHit - (year.guaranteed + year.optional)) > 0.000001) {
      return abstain(snapshot!, policy!, context, action, [{
        code: 'CONTRACT_CAP_HIT_DECOMPOSITION_UNAVAILABLE',
        detail: 'Restructure simulation requires each current cap hit to reconcile to guaranteed + optional money.',
      }]);
    }
  }
  for (const year of proposedYears) {
    if (![year.guaranteed, year.optional, year.capHit].every((value) => Number.isFinite(value) && value >= 0)) {
      violations.push({ code: 'RESTRUCTURE_PROPOSAL_INVALID', season: year.season, detail: 'Proposed restructure amounts must be finite and non-negative.' });
      continue;
    }
    if (Math.abs(year.capHit - (year.guaranteed + year.optional)) > 0.000001) {
      violations.push({ code: 'RESTRUCTURE_CAP_HIT_MISMATCH', season: year.season, detail: 'Every proposed cap hit must equal proposed guaranteed + optional money.' });
    }
  }

  const rate = restructurePolicy.optionalToGuaranteedConversionRate;
  const increment = restructurePolicy.roundingIncrement;
  if (rate === null || increment === null) {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RESTRUCTURE_CONVERSION_POLICY_UNAVAILABLE',
      detail: 'Restructure simulation requires both an optional-to-guaranteed conversion rate and rounding increment.',
    }]);
  }

  const originalGuaranteed = money(currentYears.reduce((sum, year) => sum + year.guaranteed, 0));
  const originalOptional = money(currentYears.reduce((sum, year) => sum + year.optional, 0));
  const convertedOptionalValue = mroundPositive(originalOptional * rate, increment);
  const originalEconomicValue = money(originalGuaranteed + convertedOptionalValue);

  const proposedGuaranteed = money(proposedYears.reduce((sum, year) => sum + year.guaranteed, 0));
  const proposedOptional = money(proposedYears.reduce((sum, year) => sum + year.optional, 0));
  const proposedCapHit = money(proposedYears.reduce((sum, year) => sum + year.capHit, 0));

  if (Math.abs(proposedCapHit - originalEconomicValue) > 0.000001) {
    violations.push({
      code: 'RESTRUCTURE_VALUE_MISMATCH',
      detail: `Proposed restructured cap-hit total ${proposedCapHit} must equal preserved restructure value ${originalEconomicValue}.`,
    });
  }
  if (!restructurePolicy.guaranteedToOptionalAllowed && proposedGuaranteed + 0.000001 < originalGuaranteed) {
    violations.push({
      code: 'RESTRUCTURE_GUARANTEE_REDUCTION_NOT_ALLOWED',
      detail: 'Policy forbids moving existing guaranteed money into optional money.',
    });
  }
  if (restructurePolicy.minimumGuaranteedShare !== null
    && proposedCapHit > 0
    && proposedGuaranteed / proposedCapHit + 0.000001 < restructurePolicy.minimumGuaranteedShare) {
    violations.push({
      code: 'RESTRUCTURE_MINIMUM_GUARANTEE_SHARE',
      detail: 'Proposed restructure does not satisfy the minimum guaranteed share.',
    });
  }

  if (restructurePolicy.minimumAnnualAllocationShare !== null) {
    const minShare = restructurePolicy.minimumAnnualAllocationShare;
    for (const year of proposedYears) {
      if (proposedGuaranteed > 0 && year.guaranteed + 0.000001 < proposedGuaranteed * minShare) {
        violations.push({
          code: 'RESTRUCTURE_ANNUAL_GUARANTEE_ALLOCATION_TOO_LOW',
          season: year.season,
          detail: `Season ${year.season} contains less than the required share of total guaranteed money.`,
        });
      }
      if (proposedOptional > 0 && year.optional + 0.000001 < proposedOptional * minShare) {
        violations.push({
          code: 'RESTRUCTURE_ANNUAL_OPTIONAL_ALLOCATION_TOO_LOW',
          season: year.season,
          detail: `Season ${year.season} contains less than the required share of total optional money.`,
        });
      }
    }
  }

  const seasonEffects: ContractRestructureSeasonEffect[] = [];
  for (const current of currentYears) {
    const proposed = proposedYears.find((year) => year.season === current.season);
    const ledger = team.cap.find((entry) => entry.season === current.season)!;
    if (!proposed) continue;
    const deltaGuaranteed = money(proposed.guaranteed - current.guaranteed);
    const deltaOptional = money(proposed.optional - current.optional);
    const deltaCapHit = money(proposed.capHit - current.capHit);
    const deadCap = team.deadCap.reduce((sum, entry) => (
      sum + (entry.years.find((year) => year.season === current.season)?.amount ?? 0)
    ), 0);

    seasonEffects.push({
      season: current.season,
      before: {
        guaranteed: current.guaranteed,
        optional: current.optional,
        capHit: current.capHit,
        ledgerTotalGuaranteed: ledger.totalGuaranteed,
        ledgerTotalCapHit: ledger.totalCapHit,
        capAfterGuarantees: ledger.capAfterGuarantees,
        capRemaining: ledger.capRemaining,
      },
      delta: {
        guaranteed: deltaGuaranteed,
        optional: deltaOptional,
        capHit: deltaCapHit,
        ledgerTotalGuaranteed: deltaGuaranteed,
        ledgerTotalCapHit: deltaCapHit,
      },
      after: {
        guaranteed: proposed.guaranteed,
        optional: proposed.optional,
        capHit: proposed.capHit,
        ledgerTotalGuaranteed: money(ledger.totalGuaranteed + deltaGuaranteed),
        ledgerTotalCapHit: money(ledger.totalCapHit + deltaCapHit),
        capAfterGuarantees: money(ledger.capAfterGuarantees - deltaGuaranteed),
        capRemaining: money(ledger.capRemaining - deltaCapHit),
      },
    });

    for (const compliance of policy!.cap.compliance) {
      if (!compliance.phases.includes(context.phase)) continue;
      if (!['TRANSACTION_TIME', 'CONTINUOUS'].includes(compliance.enforcement)) continue;
      if (compliance.overCeilingAllowed) continue;
      const ceiling = policyCeiling(policy!, current.season);
      if (ceiling === null) {
        return abstain(snapshot!, policy!, context, action, [{
          code: 'CAP_CEILING_UNAVAILABLE',
          detail: `No cap ceiling is defined for affected season ${current.season}.`,
        }]);
      }
      const allowed = ceiling * compliance.ceilingShare - (compliance.reserveAmount ?? 0);
      const actual = complianceAmount(
        compliance.basis,
        ledger.totalGuaranteed + deltaGuaranteed,
        proposed.optional,
        ledger.totalCapHit + deltaCapHit,
        deadCap,
      );
      if (actual > allowed + 0.000001) {
        violations.push({
          code: 'CAP_CEILING_EXCEEDED',
          season: current.season,
          detail: `Post-restructure ${compliance.basis} amount ${money(actual)} exceeds allowed amount ${money(allowed)}.`,
        });
      }
    }
  }

  const legal = violations.length === 0;
  const rightEffect: ContractRestructureRightEffect | null = legal ? {
    teamKey: context.teamKey,
    rightType: 'RESTRUCTURE',
    usedBefore: availability.used,
    remainingBefore: availability.remaining,
    quantityConsumed: 1,
    remainingAfter: Math.max(0, availability.remaining - 1),
  } : null;

  return {
    status: 'READY',
    engineVersion: CONTRACT_RESTRUCTURE_ENGINE_VERSION,
    legal,
    violations,
    originalEconomicValue,
    restructuredEconomicValue: proposedCapHit,
    seasonEffects,
    rightEffect,
    fingerprint: fingerprint(snapshot!, policy!, context, action),
  };
}
