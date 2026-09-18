import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { contractLeagueRightsStateSchema, deriveContractRightAvailability, type ContractLeagueRightsState, type ContractRightType } from './rights';
import { canonicalizeContractLeagueSnapshot } from './persistenceContract';
import { resolveTagOfferWitness, type TagOfferWitness } from './tagOfferWitness';

export const CONTRACT_TAG_ENGINE_VERSION = 'contract-tag-engine.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];
type PlayerSelector = { canonicalPlayerId?: string | null; sourcePlayerName?: string | null };
export type ContractTagYear = { season: number; guaranteed: number; optional: number; capHit: number };

export type ContractTagContext = {
  leagueKey: string;
  decisionAt: string;
  phase: ContractLeaguePhase;
  teamKey: string;
  sourceTeamName: string;
  tagWindowStatus: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  rightsState?: ContractLeagueRightsState | null;
  offerWitness?: TagOfferWitness | null;
};
export type ContractTagAction = {
  player: PlayerSelector;
  tagPolicyId: string;
  proposedYears: ContractTagYear[];
};
export type ContractTagViolation = { code: string; detail: string; season?: number };
export type ContractTagSeasonEffect = {
  season: number;
  before: { ledgerTotalGuaranteed: number; ledgerTotalCapHit: number; capAfterGuarantees: number; capRemaining: number };
  delta: { guaranteed: number; optional: number; capHit: number; ledgerTotalGuaranteed: number; ledgerTotalCapHit: number };
  after: { ledgerTotalGuaranteed: number; ledgerTotalCapHit: number; capAfterGuarantees: number; capRemaining: number };
};
export type ContractTagResult =
  | { status: 'ABSTAIN'; engineVersion: typeof CONTRACT_TAG_ENGINE_VERSION; reasonCodes: string[]; details: string[]; fingerprint: string }
  | {
    status: 'READY'; engineVersion: typeof CONTRACT_TAG_ENGINE_VERSION; legal: boolean; violations: ContractTagViolation[];
    tagType: 'FRANCHISE' | 'TRANSITION' | 'RFA' | 'CUSTOM'; annualAav: number; termYears: number;
    seasonEffects: ContractTagSeasonEffect[];
    rightEffect: { teamKey: string; rightType: ContractRightType; customRightId: string | null; usedBefore: number; remainingBefore: number; quantityConsumed: number; remainingAfter: number } | null;
    fingerprint: string;
  };

type Reason = { code: string; detail: string };
function money(value: number) { return Number(value.toFixed(6)); }
function parseTime(value: string | null | undefined) { if (!value) return null; const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function fingerprint(value: unknown) { const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null'; return `sha256:${createHash('sha256').update(canonical).digest('hex')}`; }
function fp(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: ContractTagContext, action: ContractTagAction) {
  return fingerprint({ engineVersion: CONTRACT_TAG_ENGINE_VERSION, snapshot: snapshot ? canonicalizeContractLeagueSnapshot(snapshot) : null, policy, context, action });
}
function abstain(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: ContractTagContext, action: ContractTagAction, reasons: Reason[]): ContractTagResult {
  return { status: 'ABSTAIN', engineVersion: CONTRACT_TAG_ENGINE_VERSION, reasonCodes: [...new Set(reasons.map((r) => r.code))], details: reasons.map((r) => r.detail), fingerprint: fp(snapshot, policy, context, action) };
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
function deadCap(team: ContractLeagueSnapshot['teams'][number], season: number) { return team.deadCap.reduce((sum, item) => sum + (item.years.find((year) => year.season === season)?.amount ?? 0), 0); }
function currentTeamComponents(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.contracts.filter(activeContract).reduce((sum, contract) => {
    const year = contract.years.find((item) => item.season === season);
    return year ? { guaranteed: sum.guaranteed + year.guaranteed, optional: sum.optional + year.optional, capHit: sum.capHit + year.capHit } : sum;
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
function multipleOf(value: number, increment: number) { const q = value / increment; return Math.abs(q - Math.round(q)) <= 0.000001; }
function rightKey(tag: ContractLeaguePolicy['contracts']['tags'][number]) {
  if (tag.type === 'FRANCHISE') return { rightType: 'FRANCHISE_TAG' as const, customRightId: null };
  if (tag.type === 'TRANSITION') return { rightType: 'TRANSITION_TAG' as const, customRightId: null };
  if (tag.type === 'RFA') return { rightType: 'RFA' as const, customRightId: null };
  return { rightType: 'CUSTOM' as const, customRightId: `tag:${tag.id}` };
}

export function simulateContractTag(snapshotInput: unknown, policyInput: unknown, context: ContractTagContext, action: ContractTagAction): ContractTagResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;
  const policy = policyResult.success ? policyResult.data : null;
  const reasons: Reason[] = [];
  if (!snapshotResult.success) reasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  if (!policyResult.success) reasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  if (!snapshotResult.success || !policyResult.success) return abstain(snapshot, policy, context, action, reasons);

  const decisionMs = parseTime(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Tag simulation requires a valid frozen decision timestamp.' });
  if (!context.leagueKey.trim()) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Tag simulation requires an explicit internal league key.' });
  if (snapshot!.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Only VALID snapshots may drive a tag decision.' });
  if (policy!.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Only VALID policy may drive a tag decision.' });
  if (snapshot!.league.season !== policy!.effective.season) reasons.push({ code: 'POLICY_SEASON_MISMATCH', detail: 'Snapshot season and policy season do not match.' });
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

  if (context.tagWindowStatus === 'UNKNOWN') return abstain(snapshot!, policy!, context, action, [{ code: 'TAG_WINDOW_UNRESOLVED', detail: 'Lifecycle state must resolve whether the tag window is open.' }]);
  const violations: ContractTagViolation[] = [];
  if (context.tagWindowStatus === 'CLOSED') violations.push({ code: 'TAG_WINDOW_CLOSED', detail: 'The tag lifecycle window is closed.' });

  const tagPolicy = policy!.contracts.tags.find((tag) => tag.id === action.tagPolicyId) ?? null;
  if (!tagPolicy) return abstain(snapshot!, policy!, context, action, [{ code: 'TAG_POLICY_UNRESOLVED', detail: 'Action tagPolicyId does not resolve to an authoritative tag policy.' }]);
  if (tagPolicy.contractYears === null) return abstain(snapshot!, policy!, context, action, [{ code: 'TAG_TERM_POLICY_UNAVAILABLE', detail: 'Tag policy must define contractYears before cap consequences can be simulated.' }]);

  const resolved = resolvePlayer(snapshot!, context.sourceTeamName.trim(), action.player);
  if (!resolved) return abstain(snapshot!, policy!, context, action, [{ code: 'PLAYER_UNRESOLVED', detail: 'TAG requires exactly one current roster contract on the bound team.' }]);
  const { team, contract } = resolved;
  if (!contract.position) return abstain(snapshot!, policy!, context, action, [{ code: 'PLAYER_POSITION_UNRESOLVED', detail: 'Tag pricing cannot be verified without an authoritative player position.' }]);

  if (!context.offerWitness) return abstain(snapshot!, policy!, context, action, [{ code: 'TAG_OFFER_WITNESS_UNAVAILABLE', detail: 'Tag simulation requires an authoritative offer witness.' }]);
  const offer = resolveTagOfferWitness(context.offerWitness, policy!, {
    leagueKey: context.leagueKey,
    decisionAt: context.decisionAt,
    sourcePlayerName: contract.sourcePlayerName,
    canonicalPlayerId: contract.canonicalPlayerId,
    position: contract.position,
  });
  if (offer.status === 'ABSTAIN') return abstain(snapshot!, policy!, context, action, offer.reasonCodes.map((code, i) => ({ code, detail: offer.details[i] ?? code })));
  if (offer.tagPolicy.id !== action.tagPolicyId) violations.push({ code: 'TAG_POLICY_WITNESS_MISMATCH', detail: 'Offer witness references a different tag policy.' });
  if (!offer.eligible) violations.push({ code: 'TAG_ELIGIBILITY_UNCONFIRMED', detail: 'Offer witness does not confirm player eligibility for this tag.' });

  if (!context.rightsState) return abstain(snapshot!, policy!, context, action, [{ code: 'RIGHTS_STATE_UNAVAILABLE', detail: 'Tag simulation requires the immutable scarce-right ledger.' }]);
  const rightsResult = contractLeagueRightsStateSchema.safeParse(context.rightsState);
  if (!rightsResult.success || rightsResult.data.validation.status !== 'VALID') return abstain(snapshot!, policy!, context, action, [{ code: 'RIGHTS_STATE_NOT_DECISION_READY', detail: 'Tag simulation requires VALID scarce-right state.' }]);
  if (rightsResult.data.leagueKey !== context.leagueKey.trim()) return abstain(snapshot!, policy!, context, action, [{ code: 'RIGHTS_LEAGUE_MISMATCH', detail: 'Scarce-right state belongs to another internal league key.' }]);
  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['rights asOf', rightsResult.data.asOf, 'RIGHTS_AS_OF_AFTER_DECISION'],
      ['rights importedAt', rightsResult.data.provenance.importedAt, 'RIGHTS_IMPORTED_AFTER_DECISION'],
      ['rights sourceModifiedAt', rightsResult.data.provenance.sourceModifiedAt, 'RIGHTS_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = parseTime(value);
      if (evidenceMs === null) return abstain(snapshot!, policy!, context, action, [{ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp.` }]);
      if (evidenceMs > decisionMs) return abstain(snapshot!, policy!, context, action, [{ code, detail: `${label} occurs after the frozen decision timestamp.` }]);
    }
  }
  const rk = rightKey(tagPolicy);
  let availability: ReturnType<typeof deriveContractRightAvailability> | null = null;
  if (tagPolicy.usesPerOffseason <= 0) violations.push({ code: 'TAG_USE_UNAVAILABLE', detail: 'Tag policy allows zero uses per offseason.' });
  else {
    availability = deriveContractRightAvailability(rightsResult.data, { teamKey: context.teamKey, rightType: rk.rightType, customRightId: rk.customRightId }, { maxUses: tagPolicy.usesPerOffseason, mode: 'ROLLING', windowSeasons: 1 }, snapshot!.league.season);
    if (availability.remaining <= 0) violations.push({ code: 'TAG_EXHAUSTED', detail: 'No tag uses remain for this offseason.' });
  }
  if (tagPolicy.repeatBySameTeamAllowed === false) {
    const repeated = rightsResult.data.usageEvents.some((event) => event.teamKey === context.teamKey
      && event.rightType === rk.rightType && (event.customRightId ?? null) === rk.customRightId
      && ((contract.canonicalPlayerId && event.canonicalPlayerId === contract.canonicalPlayerId) || event.sourcePlayerName === contract.sourcePlayerName));
    if (repeated) violations.push({ code: 'TAG_REPEAT_NOT_ALLOWED', detail: 'Policy does not allow this team to apply the same tag to this player again.' });
  }

  const proposed = [...action.proposedYears].sort((a, b) => a.season - b.season);
  if (proposed.length !== tagPolicy.contractYears) violations.push({ code: 'TAG_TERM_NOT_ALLOWED', detail: `Tag requires exactly ${tagPolicy.contractYears} contract year(s).` });
  if (new Set(proposed.map((year) => year.season)).size !== proposed.length || proposed.some((year, index) => year.season !== offer.startSeason + index)) {
    violations.push({ code: 'TAG_SEASONS_INVALID', detail: `Tag contract years must be contiguous and begin in witnessed season ${offer.startSeason}.` });
  }
  const currentEnd = Math.max(...contract.years.map((year) => year.season));
  if (offer.startSeason <= currentEnd) violations.push({ code: 'TAG_START_OVERLAPS_CURRENT_CONTRACT', detail: 'Witnessed tag start season overlaps the existing authoritative contract.' });
  const missingLedgers = proposed.filter((year) => !team.cap.some((entry) => entry.season === year.season));
  if (missingLedgers.length) return abstain(snapshot!, policy!, context, action, missingLedgers.map((year) => ({ code: 'CAP_LEDGER_SEASON_MISSING', detail: `No authoritative cap-ledger row exists for tag season ${year.season}.` })));

  for (const year of proposed) {
    if (![year.guaranteed, year.optional, year.capHit].every((value) => Number.isFinite(value) && value >= 0)) violations.push({ code: 'TAG_MONEY_INVALID', season: year.season, detail: 'Tag money values must be finite and non-negative.' });
    if (Math.abs(year.capHit - year.guaranteed - year.optional) > 0.000001) violations.push({ code: 'TAG_CAP_HIT_DECOMPOSITION_INVALID', season: year.season, detail: 'Each cap hit must equal guaranteed + optional money.' });
    if (policy!.cap.salaryIncrement !== null && ![year.guaranteed, year.optional, year.capHit].every((value) => multipleOf(value, policy!.cap.salaryIncrement!))) violations.push({ code: 'TAG_INCREMENT_INVALID', season: year.season, detail: `Tag money must respect increment ${policy!.cap.salaryIncrement}.` });
  }
  const totalCap = proposed.reduce((sum, year) => sum + year.capHit, 0);
  const totalGuaranteed = proposed.reduce((sum, year) => sum + year.guaranteed, 0);
  const annualAav = proposed.length ? totalCap / proposed.length : 0;
  if (Math.abs(annualAav - offer.annualAav) > 0.01) violations.push({ code: 'TAG_PRICE_MISMATCH', detail: `Proposed tag AAV ${money(annualAav)} does not match witnessed AAV ${money(offer.annualAav)}.` });
  if (tagPolicy.minimumGuaranteedShare !== null && totalCap > 0 && totalGuaranteed / totalCap + 0.000001 < tagPolicy.minimumGuaranteedShare) violations.push({ code: 'TAG_MINIMUM_GUARANTEE_NOT_MET', detail: 'Proposed contract does not meet the tag minimum guaranteed share.' });

  const seasonEffects = proposed.map((year): ContractTagSeasonEffect => {
    const ledger = team.cap.find((entry) => entry.season === year.season)!;
    return {
      season: year.season,
      before: { ledgerTotalGuaranteed: ledger.totalGuaranteed, ledgerTotalCapHit: ledger.totalCapHit, capAfterGuarantees: ledger.capAfterGuarantees, capRemaining: ledger.capRemaining },
      delta: { guaranteed: year.guaranteed, optional: year.optional, capHit: year.capHit, ledgerTotalGuaranteed: year.guaranteed, ledgerTotalCapHit: year.capHit },
      after: { ledgerTotalGuaranteed: money(ledger.totalGuaranteed + year.guaranteed), ledgerTotalCapHit: money(ledger.totalCapHit + year.capHit), capAfterGuarantees: money(ledger.capAfterGuarantees - year.guaranteed), capRemaining: money(ledger.capRemaining - year.capHit) },
    };
  });

  for (const rule of policy!.cap.compliance) {
    if (!rule.phases.includes(context.phase) || !['TRANSACTION_TIME', 'CONTINUOUS'].includes(rule.enforcement) || rule.overCeilingAllowed) continue;
    for (const year of proposed) {
      const ceiling = policyCeiling(policy!, year.season);
      if (ceiling === null) return abstain(snapshot!, policy!, context, action, [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling is defined for tag season ${year.season}.` }]);
      const current = currentTeamComponents(team, year.season);
      const amount = complianceAmount(rule.basis, current.guaranteed + year.guaranteed, current.optional + year.optional, current.capHit + year.capHit, deadCap(team, year.season));
      const allowed = ceiling * rule.ceilingShare - (rule.reserveAmount ?? 0);
      if (amount > allowed + 0.000001) violations.push({ code: 'CAP_CEILING_EXCEEDED', season: year.season, detail: `Post-tag ${rule.basis} amount ${money(amount)} exceeds allowed amount ${money(allowed)}.` });
    }
  }
  if (policy!.cap.maximumAnnualContractShareOfCap !== null) {
    for (const year of proposed) {
      const ceiling = policyCeiling(policy!, year.season);
      if (ceiling === null) return abstain(snapshot!, policy!, context, action, [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling is defined for tag season ${year.season}.` }]);
      if (year.capHit > ceiling * policy!.cap.maximumAnnualContractShareOfCap! + 0.000001) violations.push({ code: 'TAG_MAX_ANNUAL_VALUE_EXCEEDED', season: year.season, detail: 'Tag annual cap hit exceeds the policy maximum share of league cap.' });
    }
  }

  return {
    status: 'READY', engineVersion: CONTRACT_TAG_ENGINE_VERSION, legal: violations.length === 0, violations,
    tagType: tagPolicy.type, annualAav: money(annualAav), termYears: proposed.length, seasonEffects,
    rightEffect: availability && availability.remaining > 0 ? { teamKey: context.teamKey, rightType: rk.rightType, customRightId: rk.customRightId, usedBefore: availability.used, remainingBefore: availability.remaining, quantityConsumed: 1, remainingAfter: Math.max(0, availability.remaining - 1) } : null,
    fingerprint: fp(snapshot!, policy!, context, action),
  };
}
