import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { contractLeagueRightsStateSchema, deriveContractRightAvailability, type ContractLeagueRightsState } from './rights';
import { canonicalizeContractLeagueSnapshot } from './persistenceContract';
import { resolveReSignPricingWitness, type ReSignPricingWitness } from './reSignPricingWitness';
import { resolveReSignActivationPolicy, type ReSignActivationPolicy } from './reSignActivationPolicy';

export const CONTRACT_RE_SIGN_ENGINE_VERSION = 'contract-re-sign-engine.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];
type PlayerSelector = { canonicalPlayerId?: string | null; sourcePlayerName?: string | null };

export type ContractReSignYear = {
  season: number;
  guaranteed: number;
  optional: number;
  capHit: number;
};

export type ContractReSignContext = {
  leagueKey: string;
  decisionAt: string;
  phase: ContractLeaguePhase;
  teamKey: string;
  sourceTeamName: string;
  reSignWindowStatus: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  rightsState?: ContractLeagueRightsState | null;
  pricingWitness?: ReSignPricingWitness | null;
  activationPolicy?: ReSignActivationPolicy | null;
};

export type ContractReSignAction = {
  player: PlayerSelector;
  structureId: string;
  distribution: 'FRONTLOADED' | 'EVEN';
  proposedYears: ContractReSignYear[];
};

export type ContractReSignViolation = { code: string; detail: string; season?: number };

export type ContractReSignSeasonEffect = {
  season: number;
  before: {
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
    ledgerTotalGuaranteed: number;
    ledgerTotalCapHit: number;
    capAfterGuarantees: number;
    capRemaining: number;
  };
};

export type ContractReSignResult =
  | {
    status: 'ABSTAIN';
    engineVersion: typeof CONTRACT_RE_SIGN_ENGINE_VERSION;
    reasonCodes: string[];
    details: string[];
    fingerprint: string;
  }
  | {
    status: 'READY';
    engineVersion: typeof CONTRACT_RE_SIGN_ENGINE_VERSION;
    legal: boolean;
    violations: ContractReSignViolation[];
    annualAav: number;
    termYears: number;
    seasonEffects: ContractReSignSeasonEffect[];
    rightEffect: {
      teamKey: string;
      rightType: 'RE_SIGN';
      usedBefore: number;
      remainingBefore: number;
      quantityConsumed: number;
      remainingAfter: number;
    } | null;
    fingerprint: string;
  };

type Reason = { code: string; detail: string };

function money(value: number) { return Number(value.toFixed(6)); }
function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : null;
}
function deterministicFingerprint(value: unknown) {
  const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null';
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
function fp(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: ContractReSignContext, action: ContractReSignAction) {
  return deterministicFingerprint({
    engineVersion: CONTRACT_RE_SIGN_ENGINE_VERSION,
    snapshot: snapshot ? canonicalizeContractLeagueSnapshot(snapshot) : null,
    policy,
    context,
    action,
  });
}
function abstain(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: ContractReSignContext, action: ContractReSignAction, reasons: Reason[]): ContractReSignResult {
  return {
    status: 'ABSTAIN',
    engineVersion: CONTRACT_RE_SIGN_ENGINE_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
    fingerprint: fp(snapshot, policy, context, action),
  };
}
function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}
function resolvePlayer(snapshot: ContractLeagueSnapshot, sourceTeamName: string, selector: PlayerSelector) {
  const teams = snapshot.teams.filter((team) => team.sourceTeamName === sourceTeamName);
  if (teams.length !== 1) return null;
  const canonical = selector.canonicalPlayerId?.trim() || null;
  const source = selector.sourcePlayerName?.trim() || null;
  if (!canonical && !source) return null;
  const contracts = teams[0].contracts.filter((contract) => {
    if (!activeContract(contract)) return false;
    if (canonical && contract.canonicalPlayerId !== canonical) return false;
    if (source && contract.sourcePlayerName !== source) return false;
    return true;
  });
  return contracts.length === 1 ? { team: teams[0], contract: contracts[0] } : null;
}
function policyCeiling(policy: ContractLeaguePolicy, season: number) {
  return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling ?? policy.cap.defaultCeiling;
}
function deadCap(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.deadCap.reduce((sum, item) => sum + (item.years.find((year) => year.season === season)?.amount ?? 0), 0);
}
function currentTeamComponents(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.contracts.filter(activeContract).reduce((sum, contract) => {
    const year = contract.years.find((item) => item.season === season);
    if (!year) return sum;
    return {
      guaranteed: sum.guaranteed + year.guaranteed,
      optional: sum.optional + year.optional,
      capHit: sum.capHit + year.capHit,
    };
  }, { guaranteed: 0, optional: 0, capHit: 0 });
}
function complianceAmount(basis: ContractLeaguePolicy['cap']['compliance'][number]['basis'], guaranteed: number, optional: number, capHit: number, dead: number) {
  switch (basis) {
    case 'GUARANTEED': return guaranteed;
    case 'OPTIONAL': return optional;
    case 'CAP_HIT': return capHit;
    case 'GUARANTEED_PLUS_DEAD_CAP': return guaranteed + dead;
    case 'CAP_HIT_PLUS_DEAD_CAP': return capHit + dead;
  }
}
function multipleOf(value: number, increment: number) {
  const quotient = value / increment;
  return Math.abs(quotient - Math.round(quotient)) <= 0.000001;
}

export function simulateContractReSign(
  snapshotInput: unknown,
  policyInput: unknown,
  context: ContractReSignContext,
  action: ContractReSignAction,
): ContractReSignResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;
  const policy = policyResult.success ? policyResult.data : null;
  const reasons: Reason[] = [];

  if (!snapshotResult.success) reasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  if (!policyResult.success) reasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  if (reasons.length) return abstain(snapshot, policy, context, action, reasons);

  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Re-sign simulation requires a valid frozen decision timestamp.' });
  if (!context.leagueKey.trim()) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Re-sign simulation requires an explicit internal league key.' });
  if (snapshot!.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Only VALID economic snapshots may drive a re-sign decision.' });
  if (policy!.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Only VALID league policy may drive a re-sign decision.' });
  if (snapshot!.league.season !== policy!.effective.season) reasons.push({ code: 'POLICY_SEASON_MISMATCH', detail: 'Snapshot season and policy season do not match.' });

  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['snapshot provenance.importedAt', snapshot!.provenance.importedAt, 'SNAPSHOT_IMPORTED_AFTER_DECISION'],
      ['snapshot provenance.sourceModifiedAt', snapshot!.provenance.sourceModifiedAt, 'SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION'],
      ['policy provenance.importedAt', policy!.provenance.importedAt, 'POLICY_IMPORTED_AFTER_DECISION'],
      ['policy provenance.sourceModifiedAt', policy!.provenance.sourceModifiedAt, 'POLICY_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp when present.` });
      else if (evidenceMs > decisionMs) reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp.` });
    }
  }
  if (reasons.length) return abstain(snapshot!, policy!, context, action, reasons);

  const reSignPolicy = policy!.contracts.reSign;
  const violations: ContractReSignViolation[] = [];
  if (!reSignPolicy.enabled) violations.push({ code: 'RE_SIGN_DISABLED', detail: 'League policy disables contract re-signs.' });
  if (!reSignPolicy.allowedPhases.includes(context.phase)) violations.push({ code: 'RE_SIGN_PHASE_NOT_ALLOWED', detail: `Re-signs are not allowed during ${context.phase}.` });
  if (context.reSignWindowStatus === 'UNKNOWN') {
    return abstain(snapshot!, policy!, context, action, [{ code: 'RE_SIGN_WINDOW_UNRESOLVED', detail: 'Lifecycle state must resolve whether the re-sign window is open.' }]);
  }
  if (context.reSignWindowStatus === 'CLOSED') violations.push({ code: 'RE_SIGN_WINDOW_CLOSED', detail: 'The re-sign lifecycle window is closed.' });
  if (reSignPolicy.minYears === null || reSignPolicy.maxYears === null || !reSignPolicy.allowance || !reSignPolicy.pricing) {
    return abstain(snapshot!, policy!, context, action, [{ code: 'RE_SIGN_POLICY_INCOMPLETE', detail: 'Enabled re-signs require explicit term limits, usage allowance, and pricing policy.' }]);
  }

  const resolved = resolvePlayer(snapshot!, context.sourceTeamName.trim(), action.player);
  if (!resolved) return abstain(snapshot!, policy!, context, action, [{ code: 'PLAYER_UNRESOLVED', detail: 'RE_SIGN requires exactly one active roster contract on the bound team.' }]);
  const { team, contract } = resolved;
  if (!contract.position) return abstain(snapshot!, policy!, context, action, [{ code: 'PLAYER_POSITION_UNRESOLVED', detail: 'Re-sign pricing cannot be verified without an authoritative player position.' }]);
  if (contract.metadata.reSignEligible === false) violations.push({ code: 'RE_SIGN_PLAYER_INELIGIBLE', detail: 'Economic snapshot explicitly marks the contract as not re-sign eligible.' });

  if (!context.pricingWitness) return abstain(snapshot!, policy!, context, action, [{ code: 'RE_SIGN_PRICE_WITNESS_UNAVAILABLE', detail: 'Re-sign simulation requires an authoritative resolved price witness.' }]);
  const pricing = resolveReSignPricingWitness(context.pricingWitness, policy!, {
    leagueKey: context.leagueKey,
    decisionAt: context.decisionAt,
    sourcePlayerName: contract.sourcePlayerName,
    canonicalPlayerId: contract.canonicalPlayerId,
    position: contract.position,
  });
  if (pricing.status === 'ABSTAIN') return abstain(snapshot!, policy!, context, action, pricing.reasonCodes.map((code, index) => ({ code, detail: pricing.details[index] ?? code })));
  if (!pricing.eligible) violations.push({ code: 'RE_SIGN_ELIGIBILITY_UNCONFIRMED', detail: 'Pricing witness does not confirm player eligibility for a re-sign.' });

  if (!context.activationPolicy) return abstain(snapshot!, policy!, context, action, [{ code: 'RE_SIGN_ACTIVATION_POLICY_UNAVAILABLE', detail: 'Re-sign simulation requires an authoritative activation-rule supplement.' }]);
  const activation = resolveReSignActivationPolicy(context.activationPolicy, {
    leagueKey: context.leagueKey,
    decisionAt: context.decisionAt,
    season: snapshot!.league.season,
  });
  if (activation.status === 'ABSTAIN') return abstain(snapshot!, policy!, context, action, activation.reasonCodes.map((code, index) => ({ code, detail: activation.details[index] ?? code })));
  if (activation.mode !== 'AFTER_CURRENT_CONTRACT') {
    return abstain(snapshot!, policy!, context, action, [{
      code: 'RE_SIGN_REPLACEMENT_ACTIVATION_UNMODELED',
      detail: 'The current kernel only models re-signs that begin after the existing contract expires; replacement of remaining years needs separate consequence semantics.',
    }]);
  }

  if (!context.rightsState) return abstain(snapshot!, policy!, context, action, [{ code: 'RIGHTS_STATE_UNAVAILABLE', detail: 'Re-sign simulation requires the immutable scarce-right usage ledger.' }]);
  const rightsResult = contractLeagueRightsStateSchema.safeParse(context.rightsState);
  if (!rightsResult.success || rightsResult.data.validation.status !== 'VALID') return abstain(snapshot!, policy!, context, action, [{ code: 'RIGHTS_STATE_NOT_DECISION_READY', detail: 'Re-sign simulation requires VALID scarce-right state.' }]);
  if (rightsResult.data.leagueKey !== context.leagueKey.trim()) return abstain(snapshot!, policy!, context, action, [{ code: 'RIGHTS_LEAGUE_MISMATCH', detail: 'Scarce-right state belongs to a different internal league key.' }]);
  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['rights asOf', rightsResult.data.asOf, 'RIGHTS_AS_OF_AFTER_DECISION'],
      ['rights provenance.importedAt', rightsResult.data.provenance.importedAt, 'RIGHTS_IMPORTED_AFTER_DECISION'],
      ['rights provenance.sourceModifiedAt', rightsResult.data.provenance.sourceModifiedAt, 'RIGHTS_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) return abstain(snapshot!, policy!, context, action, [{ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp.` }]);
      if (evidenceMs > decisionMs) return abstain(snapshot!, policy!, context, action, [{ code, detail: `${label} occurs after the frozen decision timestamp.` }]);
    }
  }
  const availability = deriveContractRightAvailability(rightsResult.data, { teamKey: context.teamKey, rightType: 'RE_SIGN' }, reSignPolicy.allowance, snapshot!.league.season);
  if (availability.remaining <= 0) violations.push({ code: 'RE_SIGN_EXHAUSTED', detail: 'No re-sign uses remain in the applicable policy window.' });

  const structure = policy!.contracts.structures.find((item) => item.id === action.structureId) ?? null;
  if (!structure || !reSignPolicy.allowedStructureIds.includes(action.structureId)) {
    violations.push({ code: 'RE_SIGN_STRUCTURE_NOT_ALLOWED', detail: 'Selected contract structure is not allowed for re-signs.' });
  } else if (!structure.allowedDistributions.includes(action.distribution)) {
    violations.push({ code: 'RE_SIGN_DISTRIBUTION_NOT_ALLOWED', detail: 'Selected distribution is not allowed for the chosen contract structure.' });
  }

  const currentYears = contract.years.filter((year) => year.season >= snapshot!.league.season).sort((a, b) => a.season - b.season);
  const proposed = [...action.proposedYears].sort((a, b) => a.season - b.season);
  const startSeason = Math.max(...currentYears.map((year) => year.season)) + 1;
  if (proposed.length < reSignPolicy.minYears || proposed.length > reSignPolicy.maxYears) {
    violations.push({ code: 'RE_SIGN_TERM_NOT_ALLOWED', detail: `Proposed ${proposed.length}-year term is outside the policy range.` });
  }
  if (new Set(proposed.map((year) => year.season)).size !== proposed.length
    || proposed.some((year, index) => year.season !== startSeason + index)) {
    violations.push({ code: 'RE_SIGN_SEASONS_INVALID', detail: `After-current-contract re-sign years must be contiguous and begin in ${startSeason}.` });
  }

  const missingLedgers = proposed.filter((year) => !team.cap.some((entry) => entry.season === year.season)).map((year) => year.season);
  if (missingLedgers.length) return abstain(snapshot!, policy!, context, action, missingLedgers.map((season) => ({ code: 'CAP_LEDGER_SEASON_MISSING', detail: `No authoritative cap-ledger row exists for proposed re-sign season ${season}.` })));

  for (const year of proposed) {
    if (![year.guaranteed, year.optional, year.capHit].every((value) => Number.isFinite(value) && value >= 0)) {
      violations.push({ code: 'RE_SIGN_MONEY_INVALID', season: year.season, detail: 'Proposed money values must be finite and non-negative.' });
    }
    if (Math.abs(year.capHit - (year.guaranteed + year.optional)) > 0.000001) {
      violations.push({ code: 'RE_SIGN_CAP_HIT_DECOMPOSITION_INVALID', season: year.season, detail: 'Each proposed cap hit must equal guaranteed + optional money.' });
    }
    const increment = policy!.cap.salaryIncrement;
    if (increment !== null && (![year.guaranteed, year.optional, year.capHit].every((value) => multipleOf(value, increment)))) {
      violations.push({ code: 'RE_SIGN_INCREMENT_INVALID', season: year.season, detail: `Proposed annual money must respect the policy increment of ${increment}.` });
    }
  }

  const totalGuaranteed = proposed.reduce((sum, year) => sum + year.guaranteed, 0);
  const totalOptional = proposed.reduce((sum, year) => sum + year.optional, 0);
  const totalCap = proposed.reduce((sum, year) => sum + year.capHit, 0);
  const annualAav = proposed.length ? totalCap / proposed.length : 0;
  if (Math.abs(annualAav - pricing.annualAav) > 0.01) {
    violations.push({ code: 'RE_SIGN_PRICE_MISMATCH', detail: `Proposed contract AAV ${money(annualAav)} does not match witnessed re-sign price ${money(pricing.annualAav)}.` });
  }
  if (structure && totalCap > 0) {
    if (Math.abs(totalGuaranteed / totalCap - structure.guaranteedShare) > 0.000001
      || Math.abs(totalOptional / totalCap - structure.optionalShare) > 0.000001) {
      violations.push({ code: 'RE_SIGN_STRUCTURE_SHARE_MISMATCH', detail: 'Proposed total guaranteed/optional shares do not match the selected contract structure.' });
    }
  }

  const seasonEffects: ContractReSignSeasonEffect[] = proposed.map((year) => {
    const ledger = team.cap.find((entry) => entry.season === year.season)!;
    return {
      season: year.season,
      before: {
        ledgerTotalGuaranteed: ledger.totalGuaranteed,
        ledgerTotalCapHit: ledger.totalCapHit,
        capAfterGuarantees: ledger.capAfterGuarantees,
        capRemaining: ledger.capRemaining,
      },
      delta: {
        guaranteed: year.guaranteed,
        optional: year.optional,
        capHit: year.capHit,
        ledgerTotalGuaranteed: year.guaranteed,
        ledgerTotalCapHit: year.capHit,
      },
      after: {
        ledgerTotalGuaranteed: money(ledger.totalGuaranteed + year.guaranteed),
        ledgerTotalCapHit: money(ledger.totalCapHit + year.capHit),
        capAfterGuarantees: money(ledger.capAfterGuarantees - year.guaranteed),
        capRemaining: money(ledger.capRemaining - year.capHit),
      },
    };
  });

  for (const rule of policy!.cap.compliance) {
    if (!rule.phases.includes(context.phase) || !['TRANSACTION_TIME', 'CONTINUOUS'].includes(rule.enforcement) || rule.overCeilingAllowed) continue;
    for (const year of proposed) {
      const ceiling = policyCeiling(policy!, year.season);
      if (ceiling === null) return abstain(snapshot!, policy!, context, action, [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling is defined for proposed re-sign season ${year.season}.` }]);
      const current = currentTeamComponents(team, year.season);
      const amount = complianceAmount(rule.basis, current.guaranteed + year.guaranteed, current.optional + year.optional, current.capHit + year.capHit, deadCap(team, year.season));
      const allowed = ceiling * rule.ceilingShare - (rule.reserveAmount ?? 0);
      if (amount > allowed + 0.000001) violations.push({ code: 'CAP_CEILING_EXCEEDED', season: year.season, detail: `Post-re-sign ${rule.basis} amount ${money(amount)} exceeds allowed amount ${money(allowed)}.` });
    }
  }

  const maxShare = policy!.cap.maximumAnnualContractShareOfCap;
  if (maxShare !== null) {
    for (const year of proposed) {
      const ceiling = policyCeiling(policy!, year.season);
      if (ceiling === null) return abstain(snapshot!, policy!, context, action, [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling is defined for proposed re-sign season ${year.season}.` }]);
      if (year.capHit > ceiling * maxShare + 0.000001) violations.push({ code: 'RE_SIGN_MAX_ANNUAL_VALUE_EXCEEDED', season: year.season, detail: 'Proposed annual cap hit exceeds the policy maximum share of the league cap.' });
    }
  }

  return {
    status: 'READY',
    engineVersion: CONTRACT_RE_SIGN_ENGINE_VERSION,
    legal: violations.length === 0,
    violations,
    annualAav: money(annualAav),
    termYears: proposed.length,
    seasonEffects,
    rightEffect: availability.remaining > 0 ? {
      teamKey: context.teamKey,
      rightType: 'RE_SIGN',
      usedBefore: availability.used,
      remainingBefore: availability.remaining,
      quantityConsumed: 1,
      remainingAfter: Math.max(0, availability.remaining - 1),
    } : null,
    fingerprint: fp(snapshot!, policy!, context, action),
  };
}
