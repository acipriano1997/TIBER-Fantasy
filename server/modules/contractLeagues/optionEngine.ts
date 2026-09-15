import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { canonicalizeContractLeagueSnapshot } from './persistenceContract';
import { resolveOptionExerciseWitness, type OptionDecision, type OptionExerciseWitness } from './optionExerciseWitness';

export const CONTRACT_OPTION_ENGINE_VERSION = 'contract-option-engine.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];
type PlayerSelector = { canonicalPlayerId?: string | null; sourcePlayerName?: string | null };
export type ContractOptionContext = {
  leagueKey: string;
  decisionAt: string;
  phase: ContractLeaguePhase;
  sourceTeamName: string;
  optionWindowStatus: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  witness?: OptionExerciseWitness | null;
};
export type ContractOptionAction = { player: PlayerSelector; optionId: string; decision: OptionDecision };
export type ContractOptionViolation = { code: string; detail: string; season?: number };
export type ContractOptionSeasonEffect = {
  season: number;
  beforeContract: { guaranteed: number; optional: number; capHit: number };
  afterContract: { guaranteed: number; optional: number; capHit: number };
  delta: { guaranteed: number; optional: number; capHit: number };
  beforeLedger: { totalGuaranteed: number; totalCapHit: number; capAfterGuarantees: number; capRemaining: number };
  afterLedger: { totalGuaranteed: number; totalCapHit: number; capAfterGuarantees: number; capRemaining: number };
};
export type ContractOptionResult =
  | { status: 'ABSTAIN'; engineVersion: typeof CONTRACT_OPTION_ENGINE_VERSION; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; engineVersion: typeof CONTRACT_OPTION_ENGINE_VERSION; legal: boolean; violations: ContractOptionViolation[]; optionId: string; decision: OptionDecision; seasonEffects: ContractOptionSeasonEffect[]; fingerprint: string };

type Reason = { code: string; detail: string };
function money(value: number) { return Number(value.toFixed(6)); }
function parseTime(value: string | null | undefined) { if (!value) return null; const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function hash(value: unknown) { const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null'; return `sha256:${createHash('sha256').update(canonical).digest('hex')}`; }
function fp(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: ContractOptionContext, action: ContractOptionAction) {
  return hash({ engineVersion: CONTRACT_OPTION_ENGINE_VERSION, snapshot: snapshot ? canonicalizeContractLeagueSnapshot(snapshot) : null, policy, context, action });
}
function abstain(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: ContractOptionContext, action: ContractOptionAction, reasons: Reason[]): ContractOptionResult {
  return { status: 'ABSTAIN', engineVersion: CONTRACT_OPTION_ENGINE_VERSION, reasonCodes: [...new Set(reasons.map((r) => r.code))], details: reasons.map((r) => r.detail), fingerprint: fp(snapshot, policy, context, action) };
}
function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) { return contract.status !== 'CUT' && contract.status !== 'EXPIRED'; }
function resolvePlayer(snapshot: ContractLeagueSnapshot, sourceTeamName: string, selector: PlayerSelector) {
  const teams = snapshot.teams.filter((team) => team.sourceTeamName === sourceTeamName);
  if (teams.length !== 1) return null;
  const canonical = selector.canonicalPlayerId?.trim() || null;
  const source = selector.sourcePlayerName?.trim() || null;
  if (!canonical && !source) return null;
  const contracts = teams[0].contracts.filter((contract) => activeContract(contract)
    && (!canonical || contract.canonicalPlayerId === canonical)
    && (!source || contract.sourcePlayerName === source));
  return contracts.length === 1 ? { team: teams[0], contract: contracts[0] } : null;
}
function policyCeiling(policy: ContractLeaguePolicy, season: number) { return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling ?? policy.cap.defaultCeiling; }
function teamComponents(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.contracts.filter(activeContract).reduce((sum, contract) => {
    const year = contract.years.find((item) => item.season === season);
    return year ? { guaranteed: sum.guaranteed + year.guaranteed, optional: sum.optional + year.optional, capHit: sum.capHit + year.capHit } : sum;
  }, { guaranteed: 0, optional: 0, capHit: 0 });
}
function deadCap(team: ContractLeagueSnapshot['teams'][number], season: number) { return team.deadCap.reduce((sum, item) => sum + (item.years.find((year) => year.season === season)?.amount ?? 0), 0); }
function complianceAmount(basis: ContractLeaguePolicy['cap']['compliance'][number]['basis'], guaranteed: number, optional: number, capHit: number, dead: number) {
  switch (basis) {
    case 'GUARANTEED': return guaranteed;
    case 'OPTIONAL': return optional;
    case 'CAP_HIT': return capHit;
    case 'GUARANTEED_PLUS_DEAD_CAP': return guaranteed + dead;
    case 'CAP_HIT_PLUS_DEAD_CAP': return capHit + dead;
  }
}
function multipleOf(value: number, increment: number) { const q = value / increment; return Math.abs(q - Math.round(q)) <= 0.000001; }

export function simulateContractOption(snapshotInput: unknown, policyInput: unknown, context: ContractOptionContext, action: ContractOptionAction): ContractOptionResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;
  const policy = policyResult.success ? policyResult.data : null;
  const reasons: Reason[] = [];
  if (!snapshotResult.success) reasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  if (!policyResult.success) reasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  if (!snapshotResult.success || !policyResult.success) return abstain(snapshot, policy, context, action, reasons);
  if (snapshot!.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Only VALID snapshots may drive an option decision.' });
  if (policy!.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Only VALID policy may drive an option decision.' });
  if (snapshot!.league.season !== policy!.effective.season) reasons.push({ code: 'POLICY_SEASON_MISMATCH', detail: 'Snapshot season and policy season do not match.' });
  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Option simulation requires a valid frozen decision timestamp.' });
  if (!context.leagueKey.trim()) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Option simulation requires an explicit internal league key.' });
  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['snapshot importedAt', snapshot!.provenance.importedAt, 'SNAPSHOT_IMPORTED_AFTER_DECISION'],
      ['snapshot sourceModifiedAt', snapshot!.provenance.sourceModifiedAt, 'SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION'],
      ['policy importedAt', policy!.provenance.importedAt, 'POLICY_IMPORTED_AFTER_DECISION'],
      ['policy sourceModifiedAt', policy!.provenance.sourceModifiedAt, 'POLICY_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp.` });
      else if (evidenceMs > decisionMs) reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp.` });
    }
  }
  if (reasons.length) return abstain(snapshot!, policy!, context, action, reasons);
  if (context.optionWindowStatus === 'UNKNOWN') return abstain(snapshot!, policy!, context, action, [{ code: 'OPTION_WINDOW_UNRESOLVED', detail: 'Lifecycle state must resolve whether the option window is open.' }]);

  const violations: ContractOptionViolation[] = [];
  if (context.optionWindowStatus === 'CLOSED') violations.push({ code: 'OPTION_WINDOW_CLOSED', detail: 'The option decision window is closed.' });
  const resolved = resolvePlayer(snapshot!, context.sourceTeamName.trim(), action.player);
  if (!resolved) return abstain(snapshot!, policy!, context, action, [{ code: 'PLAYER_UNRESOLVED', detail: 'Option decision requires exactly one current roster contract on the bound team.' }]);
  const { team, contract } = resolved;
  if (!context.witness) return abstain(snapshot!, policy!, context, action, [{ code: 'OPTION_WITNESS_UNAVAILABLE', detail: 'Option decision requires an authoritative option consequence witness.' }]);
  if (context.witness.optionId !== action.optionId) violations.push({ code: 'OPTION_ID_MISMATCH', detail: 'Action optionId does not match the authoritative witness.' });

  const witness = resolveOptionExerciseWitness(context.witness, {
    leagueKey: context.leagueKey, decisionAt: context.decisionAt, decision: action.decision,
    sourcePlayerName: contract.sourcePlayerName, canonicalPlayerId: contract.canonicalPlayerId,
  });
  if (witness.status === 'ABSTAIN') return abstain(snapshot!, policy!, context, action, witness.reasonCodes.map((code, index) => ({ code, detail: witness.details[index] ?? code })));
  if (!witness.eligible) violations.push({ code: 'OPTION_ELIGIBILITY_UNCONFIRMED', detail: 'Authoritative witness does not confirm this player is eligible for the option decision.' });

  const seasons = witness.resultingYears.map((year) => year.season);
  const missingLedgers = seasons.filter((season) => !team.cap.some((entry) => entry.season === season));
  if (missingLedgers.length) return abstain(snapshot!, policy!, context, action, missingLedgers.map((season) => ({ code: 'CAP_LEDGER_SEASON_MISSING', detail: `No authoritative cap-ledger row exists for option season ${season}.` })));
  for (const year of witness.resultingYears) {
    if (policy!.cap.salaryIncrement !== null && ![year.guaranteed, year.optional, year.capHit].every((value) => multipleOf(value, policy!.cap.salaryIncrement!))) violations.push({ code: 'OPTION_INCREMENT_INVALID', season: year.season, detail: `Option money must respect increment ${policy!.cap.salaryIncrement}.` });
  }

  const seasonEffects = witness.resultingYears.map((afterYear): ContractOptionSeasonEffect => {
    const currentYear = contract.years.find((year) => year.season === afterYear.season) ?? { season: afterYear.season, guaranteed: 0, optional: 0, capHit: 0 };
    const ledger = team.cap.find((entry) => entry.season === afterYear.season)!;
    const delta = {
      guaranteed: money(afterYear.guaranteed - currentYear.guaranteed),
      optional: money(afterYear.optional - currentYear.optional),
      capHit: money(afterYear.capHit - currentYear.capHit),
    };
    return {
      season: afterYear.season,
      beforeContract: { guaranteed: currentYear.guaranteed, optional: currentYear.optional, capHit: currentYear.capHit },
      afterContract: { guaranteed: afterYear.guaranteed, optional: afterYear.optional, capHit: afterYear.capHit },
      delta,
      beforeLedger: { totalGuaranteed: ledger.totalGuaranteed, totalCapHit: ledger.totalCapHit, capAfterGuarantees: ledger.capAfterGuarantees, capRemaining: ledger.capRemaining },
      afterLedger: {
        totalGuaranteed: money(ledger.totalGuaranteed + delta.guaranteed),
        totalCapHit: money(ledger.totalCapHit + delta.capHit),
        capAfterGuarantees: money(ledger.capAfterGuarantees - delta.guaranteed),
        capRemaining: money(ledger.capRemaining - delta.capHit),
      },
    };
  });

  for (const rule of policy!.cap.compliance) {
    if (!rule.phases.includes(context.phase) || !['TRANSACTION_TIME', 'CONTINUOUS'].includes(rule.enforcement) || rule.overCeilingAllowed) continue;
    for (const effect of seasonEffects) {
      const ceiling = policyCeiling(policy!, effect.season);
      if (ceiling === null) return abstain(snapshot!, policy!, context, action, [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling is defined for option season ${effect.season}.` }]);
      const current = teamComponents(team, effect.season);
      const amount = complianceAmount(rule.basis, current.guaranteed + effect.delta.guaranteed, current.optional + effect.delta.optional, current.capHit + effect.delta.capHit, deadCap(team, effect.season));
      const allowed = ceiling * rule.ceilingShare - (rule.reserveAmount ?? 0);
      if (amount > allowed + 0.000001) violations.push({ code: 'CAP_CEILING_EXCEEDED', season: effect.season, detail: `Post-option ${rule.basis} amount ${money(amount)} exceeds allowed amount ${money(allowed)}.` });
    }
  }

  return { status: 'READY', engineVersion: CONTRACT_OPTION_ENGINE_VERSION, legal: violations.length === 0, violations, optionId: action.optionId, decision: action.decision, seasonEffects, fingerprint: fp(snapshot!, policy!, context, action) };
}
