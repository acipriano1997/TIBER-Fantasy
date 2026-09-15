import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { canonicalizeContractLeagueSnapshot } from './persistenceContract';
import { resolveAuctionStateForDecision, type FreeAgentAuctionState } from './freeAgentAuctionState';

export const CONTRACT_FREE_AGENCY_ENGINE_VERSION = 'contract-free-agency-engine.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];
type AuctionTerms = NonNullable<FreeAgentAuctionState['leadingBid']>;
type OfferYear = AuctionTerms['years'][number];

export type FreeAgentDecisionContext = {
  leagueKey: string;
  decisionAt: string;
  phase: ContractLeaguePhase;
  sourceTeamName: string;
  contractStartSeason: number;
  auctionState: FreeAgentAuctionState;
};
export type FreeAgentBidAction = {
  structureId: string;
  distribution: 'FRONTLOADED' | 'EVEN';
  years: OfferYear[];
};
export type FreeAgentViolation = { code: string; detail: string; season?: number };
export type FreeAgentSeasonEffect = {
  season: number;
  before: { totalGuaranteed: number; totalCapHit: number; capAfterGuarantees: number; capRemaining: number };
  delta: { guaranteed: number; optional: number; capHit: number };
  after: { totalGuaranteed: number; totalCapHit: number; capAfterGuarantees: number; capRemaining: number };
};
export type FreeAgentBidResult =
  | { status: 'ABSTAIN'; engineVersion: typeof CONTRACT_FREE_AGENCY_ENGINE_VERSION; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; engineVersion: typeof CONTRACT_FREE_AGENCY_ENGINE_VERSION; legal: boolean; violations: FreeAgentViolation[]; annualAav: number; totalValue: number; fingerprint: string };
export type FreeAgentSettlementResult =
  | { status: 'ABSTAIN'; engineVersion: typeof CONTRACT_FREE_AGENCY_ENGINE_VERSION; reasonCodes: string[]; details: string[]; fingerprint: string }
  | { status: 'READY'; engineVersion: typeof CONTRACT_FREE_AGENCY_ENGINE_VERSION; legal: boolean; violations: FreeAgentViolation[]; annualAav: number; totalValue: number; seasonEffects: FreeAgentSeasonEffect[]; rosterEffect: { sourceTeamName: string; sourcePlayerName: string; canonicalPlayerId: string | null; action: 'ADD' }; fingerprint: string };

type Reason = { code: string; detail: string };
type ParsedBase = { snapshot: ContractLeagueSnapshot; policy: ContractLeaguePolicy; team: ContractLeagueSnapshot['teams'][number]; auction: FreeAgentAuctionState };
function money(value: number) { return Number(value.toFixed(6)); }
function time(value: string | null | undefined) { if (!value) return null; const parsed = new Date(value).valueOf(); return Number.isFinite(parsed) ? parsed : null; }
function hash(value: unknown) { const canonical = stableStringify(value) ?? JSON.stringify(value) ?? 'null'; return `sha256:${createHash('sha256').update(canonical).digest('hex')}`; }
function active(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) { return contract.status !== 'CUT' && contract.status !== 'EXPIRED'; }
function fp(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: FreeAgentDecisionContext, action?: FreeAgentBidAction | null) {
  return hash({ engineVersion: CONTRACT_FREE_AGENCY_ENGINE_VERSION, snapshot: snapshot ? canonicalizeContractLeagueSnapshot(snapshot) : null, policy, context, action: action ?? null });
}
function abstain(snapshot: ContractLeagueSnapshot | null, policy: ContractLeaguePolicy | null, context: FreeAgentDecisionContext, reasons: Reason[], action?: FreeAgentBidAction | null) {
  return { status: 'ABSTAIN' as const, engineVersion: CONTRACT_FREE_AGENCY_ENGINE_VERSION, reasonCodes: [...new Set(reasons.map((r) => r.code))], details: reasons.map((r) => r.detail), fingerprint: fp(snapshot, policy, context, action) };
}
function policyCeiling(policy: ContractLeaguePolicy, season: number) { return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling ?? policy.cap.defaultCeiling; }
function deadCap(team: ContractLeagueSnapshot['teams'][number], season: number) { return team.deadCap.reduce((sum, item) => sum + (item.years.find((year) => year.season === season)?.amount ?? 0), 0); }
function teamComponents(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.contracts.filter(active).reduce((sum, contract) => {
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

function parseBase(snapshotInput: unknown, policyInput: unknown, context: FreeAgentDecisionContext, action?: FreeAgentBidAction | null): { ready: ParsedBase } | { stop: ReturnType<typeof abstain> } {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  const snapshot = snapshotResult.success ? snapshotResult.data : null;
  const policy = policyResult.success ? policyResult.data : null;
  const reasons: Reason[] = [];
  if (!snapshotResult.success) reasons.push({ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' });
  if (!policyResult.success) reasons.push({ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' });
  if (!snapshotResult.success || !policyResult.success) return { stop: abstain(snapshot, policy, context, reasons, action) };
  if (snapshot!.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Only VALID snapshots may drive free-agency decisions.' });
  if (policy!.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Only VALID policy may drive free-agency decisions.' });
  if (snapshot!.league.season !== policy!.effective.season) reasons.push({ code: 'POLICY_SEASON_MISMATCH', detail: 'Snapshot season and policy season do not match.' });
  const decisionMs = time(context.decisionAt);
  if (decisionMs === null) reasons.push({ code: 'DECISION_TIME_INVALID', detail: 'Free-agency decision requires a valid frozen timestamp.' });
  if (!context.leagueKey.trim()) reasons.push({ code: 'LEAGUE_KEY_REQUIRED', detail: 'Free-agency decision requires an explicit internal league key.' });
  if (decisionMs !== null) {
    for (const [label, value, code] of [
      ['snapshot importedAt', snapshot!.provenance.importedAt, 'SNAPSHOT_IMPORTED_AFTER_DECISION'],
      ['snapshot sourceModifiedAt', snapshot!.provenance.sourceModifiedAt, 'SNAPSHOT_SOURCE_MODIFIED_AFTER_DECISION'],
      ['policy importedAt', policy!.provenance.importedAt, 'POLICY_IMPORTED_AFTER_DECISION'],
      ['policy sourceModifiedAt', policy!.provenance.sourceModifiedAt, 'POLICY_SOURCE_MODIFIED_AFTER_DECISION'],
    ] as const) {
      if (!value) continue;
      const evidenceMs = time(value);
      if (evidenceMs === null) reasons.push({ code: `${code}_INVALID`, detail: `${label} must be a valid timestamp.` });
      else if (evidenceMs > decisionMs) reasons.push({ code, detail: `${label} occurs after the frozen decision timestamp.` });
    }
  }
  const auctionResult = resolveAuctionStateForDecision(context.auctionState, { leagueKey: context.leagueKey, decisionAt: context.decisionAt });
  if (auctionResult.status === 'ABSTAIN') reasons.push(...auctionResult.reasonCodes.map((code, index) => ({ code, detail: auctionResult.details[index] ?? code })));
  const teams = snapshot!.teams.filter((team) => team.sourceTeamName === context.sourceTeamName.trim());
  if (teams.length !== 1) reasons.push({ code: 'TEAM_UNRESOLVED', detail: 'Free-agency decision requires exactly one bound source team.' });
  if (reasons.length || auctionResult.status !== 'READY' || teams.length !== 1) return { stop: abstain(snapshot!, policy!, context, reasons, action) };
  return { ready: { snapshot: snapshot!, policy: policy!, team: teams[0], auction: auctionResult.state } };
}

function validateTerms(base: ParsedBase, context: FreeAgentDecisionContext, action: FreeAgentBidAction): { violations: FreeAgentViolation[]; annualAav: number; totalValue: number } | { reasons: Reason[] } {
  const { snapshot, policy, team } = base;
  const violations: FreeAgentViolation[] = [];
  const structure = policy.contracts.structures.find((item) => item.id === action.structureId) ?? null;
  if (!structure) return { reasons: [{ code: 'FREE_AGENT_STRUCTURE_UNRESOLVED', detail: 'Proposed contract structure does not resolve to policy.' }] };
  if (!policy.freeAgency.allowedStructureIds.includes(action.structureId)) violations.push({ code: 'FREE_AGENT_STRUCTURE_NOT_ALLOWED', detail: 'Structure is not allowed for free-agent contracts.' });
  if (!structure.allowedDistributions.includes(action.distribution)) violations.push({ code: 'FREE_AGENT_DISTRIBUTION_NOT_ALLOWED', detail: 'Distribution is not allowed for the selected structure.' });

  const years = [...action.years].sort((a, b) => a.season - b.season);
  if (!years.length) return { reasons: [{ code: 'FREE_AGENT_TERM_EMPTY', detail: 'Free-agent contract must contain at least one season.' }] };
  if (new Set(years.map((year) => year.season)).size !== years.length || years.some((year, index) => year.season !== context.contractStartSeason + index)) violations.push({ code: 'FREE_AGENT_SEASONS_INVALID', detail: `Contract seasons must be unique, contiguous, and begin in ${context.contractStartSeason}.` });
  if (policy.freeAgency.minContractYears !== null && years.length < policy.freeAgency.minContractYears) violations.push({ code: 'FREE_AGENT_TERM_TOO_SHORT', detail: 'Contract term is shorter than free-agency policy allows.' });
  if (policy.freeAgency.maxContractYears !== null && years.length > policy.freeAgency.maxContractYears) violations.push({ code: 'FREE_AGENT_TERM_TOO_LONG', detail: 'Contract term is longer than free-agency policy allows.' });
  const termRule = policy.contracts.termRules.find((rule) => rule.acquisitionType === 'FREE_AGENT') ?? null;
  if (termRule) {
    if (years.length < termRule.minYears || years.length > termRule.maxYears) violations.push({ code: 'FREE_AGENT_TERM_RULE_VIOLATION', detail: 'Contract term violates the generic FREE_AGENT term rule.' });
    if (!termRule.allowedStructureIds.includes(action.structureId)) violations.push({ code: 'FREE_AGENT_TERM_STRUCTURE_NOT_ALLOWED', detail: 'Structure is not allowed by the generic FREE_AGENT term rule.' });
  }
  if (structure.guaranteedShare === 0) {
    const limits = [policy.freeAgency.fullyOptionalMaxYears, termRule?.fullyOptionalMaxYears ?? null].filter((value): value is number => value !== null);
    if (limits.length && years.length > Math.min(...limits)) violations.push({ code: 'FREE_AGENT_FULLY_OPTIONAL_TERM_EXCEEDED', detail: 'Fully optional contract exceeds the permitted term.' });
  }

  for (const year of years) {
    if (Math.abs(year.capHit - year.guaranteed - year.optional) > 0.000001) violations.push({ code: 'FREE_AGENT_CAP_HIT_DECOMPOSITION_INVALID', season: year.season, detail: 'Each cap hit must equal guaranteed + optional money.' });
    for (const increment of [policy.freeAgency.salaryIncrement, policy.cap.salaryIncrement]) {
      if (increment !== null && ![year.guaranteed, year.optional, year.capHit].every((value) => multipleOf(value, increment))) violations.push({ code: 'FREE_AGENT_INCREMENT_INVALID', season: year.season, detail: `Contract money must respect increment ${increment}.` });
    }
    if (!team.cap.some((entry) => entry.season === year.season)) return { reasons: [{ code: 'CAP_LEDGER_SEASON_MISSING', detail: `No authoritative cap-ledger row exists for free-agent season ${year.season}.` }] };
  }

  const totalValue = money(years.reduce((sum, year) => sum + year.capHit, 0));
  const annualAav = money(totalValue / years.length);
  const totalGuaranteed = years.reduce((sum, year) => sum + year.guaranteed, 0);
  const totalOptional = years.reduce((sum, year) => sum + year.optional, 0);
  if (totalValue > 0) {
    if (Math.abs(totalGuaranteed / totalValue - structure.guaranteedShare) > 0.000001 || Math.abs(totalOptional / totalValue - structure.optionalShare) > 0.000001) violations.push({ code: 'FREE_AGENT_STRUCTURE_SHARE_MISMATCH', detail: 'Total guaranteed/optional shares do not match the selected contract structure.' });
  }
  if (policy.freeAgency.maxAnnualValueShareOfCap !== null) {
    const ceiling = policyCeiling(policy, context.contractStartSeason);
    if (ceiling === null) return { reasons: [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling exists for contract start season ${context.contractStartSeason}.` }] };
    if (annualAav > ceiling * policy.freeAgency.maxAnnualValueShareOfCap + 0.000001) violations.push({ code: 'FREE_AGENT_MAX_AAV_EXCEEDED', detail: 'Contract AAV exceeds the free-agency maximum share of league cap.' });
  }

  const rosterLimit = policy.roster.limitsByPhase.find((item) => item.phase === context.phase)?.maxPlayers ?? null;
  if (rosterLimit !== null && team.contracts.filter(active).length + 1 > rosterLimit) violations.push({ code: 'ROSTER_LIMIT_EXCEEDED', detail: 'Adding this free agent would exceed the roster limit for the current phase.' });

  const allowOffseasonOverCap = context.phase === 'OFFSEASON' && policy.freeAgency.offseasonOverCapAllowed === true;
  if (!allowOffseasonOverCap && policy.freeAgency.bidCapBasis !== null) {
    for (const year of years) {
      const ceiling = policyCeiling(policy, year.season);
      if (ceiling === null) return { reasons: [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling exists for free-agent season ${year.season}.` }] };
      const current = teamComponents(team, year.season);
      const amount = complianceAmount(policy.freeAgency.bidCapBasis, current.guaranteed + year.guaranteed, current.optional + year.optional, current.capHit + year.capHit, deadCap(team, year.season));
      if (amount > ceiling + 0.000001) violations.push({ code: 'FREE_AGENT_BID_CAP_EXCEEDED', season: year.season, detail: `Post-bid ${policy.freeAgency.bidCapBasis} amount ${money(amount)} exceeds cap ${money(ceiling)}.` });
    }
  }
  for (const rule of policy.cap.compliance) {
    if (!rule.phases.includes(context.phase) || !['TRANSACTION_TIME', 'CONTINUOUS'].includes(rule.enforcement) || rule.overCeilingAllowed) continue;
    for (const year of years) {
      const ceiling = policyCeiling(policy, year.season);
      if (ceiling === null) return { reasons: [{ code: 'CAP_CEILING_UNAVAILABLE', detail: `No cap ceiling exists for free-agent season ${year.season}.` }] };
      const current = teamComponents(team, year.season);
      const amount = complianceAmount(rule.basis, current.guaranteed + year.guaranteed, current.optional + year.optional, current.capHit + year.capHit, deadCap(team, year.season));
      const allowed = ceiling * rule.ceilingShare - (rule.reserveAmount ?? 0);
      if (amount > allowed + 0.000001) violations.push({ code: 'CAP_CEILING_EXCEEDED', season: year.season, detail: `Post-acquisition ${rule.basis} amount ${money(amount)} exceeds allowed amount ${money(allowed)}.` });
    }
  }
  return { violations, annualAav, totalValue };
}

export function evaluateFreeAgentBid(snapshotInput: unknown, policyInput: unknown, context: FreeAgentDecisionContext, action: FreeAgentBidAction): FreeAgentBidResult {
  const baseResult = parseBase(snapshotInput, policyInput, context, action);
  if ('stop' in baseResult) return baseResult.stop;
  const base = baseResult.ready;
  const violations: FreeAgentViolation[] = [];
  if (base.auction.status !== 'OPEN') violations.push({ code: 'AUCTION_NOT_OPEN', detail: `Auction status is ${base.auction.status}; new bids require OPEN state.` });
  const decisionMs = time(context.decisionAt)!;
  const closesMs = time(base.auction.timing.closesAt);
  if (base.auction.status === 'OPEN' && closesMs === null) return abstain(base.snapshot, base.policy, context, [{ code: 'AUCTION_CLOSE_TIME_UNAVAILABLE', detail: 'Open auction requires an authoritative closesAt timestamp before bid legality can be determined.' }], action);
  if (closesMs !== null && decisionMs > closesMs) violations.push({ code: 'AUCTION_WINDOW_CLOSED', detail: 'Frozen bid time occurs after the authoritative auction close.' });
  const terms = validateTerms(base, context, action);
  if ('reasons' in terms) return abstain(base.snapshot, base.policy, context, terms.reasons, action);
  violations.push(...terms.violations);
  return { status: 'READY', engineVersion: CONTRACT_FREE_AGENCY_ENGINE_VERSION, legal: violations.length === 0, violations, annualAav: terms.annualAav, totalValue: terms.totalValue, fingerprint: fp(base.snapshot, base.policy, context, action) };
}

export function simulateFreeAgentAcquisition(snapshotInput: unknown, policyInput: unknown, context: FreeAgentDecisionContext): FreeAgentSettlementResult {
  const baseResult = parseBase(snapshotInput, policyInput, context, null);
  if ('stop' in baseResult) return baseResult.stop;
  const base = baseResult.ready;
  if (base.auction.status !== 'SETTLED' || !base.auction.settlement) return abstain(base.snapshot, base.policy, context, [{ code: 'AUCTION_NOT_SETTLED', detail: 'Free-agent acquisition requires authoritative SETTLED auction state.' }]);
  const settlement = base.auction.settlement;
  const decisionMs = time(context.decisionAt)!;
  const settledMs = time(settlement.settledAt);
  if (settledMs === null) return abstain(base.snapshot, base.policy, context, [{ code: 'AUCTION_SETTLEMENT_TIME_INVALID', detail: 'Auction settlement timestamp is invalid.' }]);
  if (settledMs > decisionMs) return abstain(base.snapshot, base.policy, context, [{ code: 'AUCTION_SETTLED_AFTER_DECISION', detail: 'Auction settlement occurs after the frozen decision timestamp.' }]);
  if (settlement.sourceTeamName !== context.sourceTeamName.trim()) return abstain(base.snapshot, base.policy, context, [{ code: 'AUCTION_WINNER_MISMATCH', detail: 'Bound team is not the authoritative auction winner.' }]);

  const playerAlreadyRostered = base.snapshot.teams.some((team) => team.contracts.some((contract) => active(contract)
    && ((base.auction.player.canonicalPlayerId && contract.canonicalPlayerId === base.auction.player.canonicalPlayerId)
      || contract.sourcePlayerName === base.auction.player.sourcePlayerName)));
  const action: FreeAgentBidAction = { structureId: settlement.structureId, distribution: settlement.distribution, years: settlement.years };
  const terms = validateTerms(base, context, action);
  if ('reasons' in terms) return abstain(base.snapshot, base.policy, context, terms.reasons, action);
  const violations = [...terms.violations];
  if (playerAlreadyRostered) violations.push({ code: 'PLAYER_NOT_FREE_AGENT', detail: 'Authoritative snapshot already contains an active contract for this player.' });

  const seasonEffects = settlement.years.map((year): FreeAgentSeasonEffect => {
    const ledger = base.team.cap.find((entry) => entry.season === year.season)!;
    return {
      season: year.season,
      before: { totalGuaranteed: ledger.totalGuaranteed, totalCapHit: ledger.totalCapHit, capAfterGuarantees: ledger.capAfterGuarantees, capRemaining: ledger.capRemaining },
      delta: { guaranteed: year.guaranteed, optional: year.optional, capHit: year.capHit },
      after: {
        totalGuaranteed: money(ledger.totalGuaranteed + year.guaranteed),
        totalCapHit: money(ledger.totalCapHit + year.capHit),
        capAfterGuarantees: money(ledger.capAfterGuarantees - year.guaranteed),
        capRemaining: money(ledger.capRemaining - year.capHit),
      },
    };
  });
  return {
    status: 'READY', engineVersion: CONTRACT_FREE_AGENCY_ENGINE_VERSION, legal: violations.length === 0, violations,
    annualAav: terms.annualAav, totalValue: terms.totalValue, seasonEffects,
    rosterEffect: { sourceTeamName: context.sourceTeamName, sourcePlayerName: base.auction.player.sourcePlayerName, canonicalPlayerId: base.auction.player.canonicalPlayerId, action: 'ADD' },
    fingerprint: fp(base.snapshot, base.policy, context, action),
  };
}
