import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import { contractLeaguePolicySchema, type ContractLeaguePolicy } from './policy';
import { simulateKnownAtContractTransaction } from './transactionDecisionBoundary';
import type {
  ContractTransactionAction,
  ContractTransactionContext,
} from './transactionEngine';
import { simulateKnownAtContractRestructure } from './restructureDecisionBoundary';
import type {
  ContractRestructureAction,
  ContractRestructureContext,
} from './restructureEngine';

export const CAP_INTELLIGENCE_VERSION = 'contract-cap-intelligence.v1' as const;

type ContractLeaguePhase = ContractLeaguePolicy['roster']['limitsByPhase'][number]['phase'];
type ComplianceBasis = ContractLeaguePolicy['cap']['compliance'][number]['basis'];
type Reason = { code: string; detail: string };

export type CapHealthContext = {
  teamKey: string;
  sourceTeamName: string;
  phase: ContractLeaguePhase;
};

export type CapComplianceView = {
  ruleId: string;
  basis: ComplianceBasis;
  enforcement: ContractLeaguePolicy['cap']['compliance'][number]['enforcement'];
  overCeilingAllowed: boolean;
  reserveAmount: number;
  ceiling: number | null;
  allowedAmount: number | null;
  measuredAmount: number;
  headroom: number | null;
  status: 'COMPLIANT' | 'VIOLATION' | 'OVERAGE_ALLOWED' | 'UNAVAILABLE';
};

export type CapHealthSeason = {
  season: number;
  sourceCapRemaining: number;
  sourceCapAfterGuarantees: number;
  ledgerTotalGuaranteed: number;
  ledgerTotalCapHit: number;
  guaranteedObligation: number;
  optionalObligation: number;
  contractCapHit: number;
  deadCap: number;
  committedRosterSpots: number;
  minimumFillCost: null;
  policyCeiling: number | null;
  compliance: CapComplianceView[];
  strictestHardHeadroom: number | null;
};

export type CapHealthResult =
  | {
    status: 'ABSTAIN';
    version: typeof CAP_INTELLIGENCE_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof CAP_INTELLIGENCE_VERSION;
    teamKey: string;
    sourceTeamName: string;
    phase: ContractLeaguePhase;
    sourceSalaryCap: number | null;
    seasons: CapHealthSeason[];
    currentViolation: boolean;
    knownFutureViolation: boolean;
    firstViolationSeason: number | null;
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

function capHealthAbstention(reasons: Reason[]): CapHealthResult {
  return {
    status: 'ABSTAIN',
    version: CAP_INTELLIGENCE_VERSION,
    reasonCodes: [...new Set(reasons.map((item) => item.code))],
    details: reasons.map((item) => item.detail),
  };
}

function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}

function policyCeiling(policy: ContractLeaguePolicy, season: number) {
  return policy.cap.seasonCeilings.find((item) => item.season === season)?.ceiling
    ?? policy.cap.defaultCeiling;
}

function teamComponents(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.contracts.filter(activeContract).reduce((sum, contract) => {
    const year = contract.years.find((item) => item.season === season);
    if (!year) return sum;
    return {
      guaranteed: sum.guaranteed + year.guaranteed,
      optional: sum.optional + year.optional,
      capHit: sum.capHit + year.capHit,
      rosterSpots: sum.rosterSpots + 1,
    };
  }, { guaranteed: 0, optional: 0, capHit: 0, rosterSpots: 0 });
}

function teamDeadCap(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return team.deadCap.reduce((sum, entry) => (
    sum + (entry.years.find((year) => year.season === season)?.amount ?? 0)
  ), 0);
}

function complianceAmount(
  basis: ComplianceBasis,
  components: ReturnType<typeof teamComponents>,
  deadCap: number,
) {
  switch (basis) {
    case 'GUARANTEED': return components.guaranteed;
    case 'OPTIONAL': return components.optional;
    case 'CAP_HIT': return components.capHit;
    case 'GUARANTEED_PLUS_DEAD_CAP': return components.guaranteed + deadCap;
    case 'CAP_HIT_PLUS_DEAD_CAP': return components.capHit + deadCap;
  }
}

export function buildMultiYearCapHealth(
  snapshotInput: unknown,
  policyInput: unknown,
  context: CapHealthContext,
): CapHealthResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  if (!snapshotResult.success) {
    return capHealthAbstention([{ code: 'SNAPSHOT_INVALID', detail: 'Contract snapshot failed schema validation.' }]);
  }
  const policyResult = contractLeaguePolicySchema.safeParse(policyInput);
  if (!policyResult.success) {
    return capHealthAbstention([{ code: 'POLICY_INVALID', detail: 'Contract policy failed schema validation.' }]);
  }

  const snapshot = snapshotResult.data;
  const policy = policyResult.data;
  const reasons: Reason[] = [];
  if (snapshot.validation.status !== 'VALID') reasons.push({ code: 'SNAPSHOT_NOT_DECISION_READY', detail: 'Cap health requires a VALID frozen snapshot.' });
  if (policy.validation.status !== 'VALID') reasons.push({ code: 'POLICY_NOT_DECISION_READY', detail: 'Cap health requires a VALID league policy.' });
  if (snapshot.league.season !== policy.effective.season) reasons.push({ code: 'POLICY_SEASON_MISMATCH', detail: 'Snapshot season and policy season do not match.' });
  if (!context.teamKey.trim()) reasons.push({ code: 'TEAM_KEY_REQUIRED', detail: 'Cap health requires an explicit internal team key.' });
  if (!context.sourceTeamName.trim()) reasons.push({ code: 'SOURCE_TEAM_NAME_REQUIRED', detail: 'Cap health requires an exact source team name.' });
  if (reasons.length) return capHealthAbstention(reasons);

  const teamMatches = snapshot.teams.filter((team) => team.sourceTeamName === context.sourceTeamName.trim());
  if (teamMatches.length !== 1) {
    return capHealthAbstention([{
      code: 'TEAM_BINDING_UNRESOLVED',
      detail: 'Cap health requires exactly one snapshot team matching sourceTeamName.',
    }]);
  }
  const team = teamMatches[0];
  if (!team) {
    return capHealthAbstention([{ code: 'TEAM_BINDING_UNRESOLVED', detail: 'Bound source team is unavailable.' }]);
  }

  const applicableRules = policy.cap.compliance.filter((rule) => rule.phases.includes(context.phase));
  const seasons = [...team.cap]
    .sort((a, b) => a.season - b.season)
    .map((ledger): CapHealthSeason => {
      const components = teamComponents(team, ledger.season);
      const deadCap = money(teamDeadCap(team, ledger.season));
      const ceiling = policyCeiling(policy, ledger.season);
      const compliance = applicableRules.map((rule): CapComplianceView => {
        const measuredAmount = money(complianceAmount(rule.basis, components, deadCap));
        const reserveAmount = money(rule.reserveAmount ?? 0);
        if (ceiling === null) {
          return {
            ruleId: rule.id,
            basis: rule.basis,
            enforcement: rule.enforcement,
            overCeilingAllowed: rule.overCeilingAllowed,
            reserveAmount,
            ceiling: null,
            allowedAmount: null,
            measuredAmount,
            headroom: null,
            status: 'UNAVAILABLE',
          };
        }
        const allowedAmount = money(ceiling * rule.ceilingShare - reserveAmount);
        const headroom = money(allowedAmount - measuredAmount);
        return {
          ruleId: rule.id,
          basis: rule.basis,
          enforcement: rule.enforcement,
          overCeilingAllowed: rule.overCeilingAllowed,
          reserveAmount,
          ceiling: money(ceiling),
          allowedAmount,
          measuredAmount,
          headroom,
          status: headroom >= -0.000001
            ? 'COMPLIANT'
            : rule.overCeilingAllowed ? 'OVERAGE_ALLOWED' : 'VIOLATION',
        };
      });
      const hardHeadrooms = compliance
        .filter((item) => !item.overCeilingAllowed && item.headroom !== null)
        .map((item) => item.headroom as number);
      return {
        season: ledger.season,
        sourceCapRemaining: money(ledger.capRemaining),
        sourceCapAfterGuarantees: money(ledger.capAfterGuarantees),
        ledgerTotalGuaranteed: money(ledger.totalGuaranteed),
        ledgerTotalCapHit: money(ledger.totalCapHit),
        guaranteedObligation: money(components.guaranteed),
        optionalObligation: money(components.optional),
        contractCapHit: money(components.capHit),
        deadCap,
        committedRosterSpots: components.rosterSpots,
        minimumFillCost: null,
        policyCeiling: ceiling === null ? null : money(ceiling),
        compliance,
        strictestHardHeadroom: hardHeadrooms.length ? money(Math.min(...hardHeadrooms)) : null,
      };
    });

  const violationSeasons = seasons
    .filter((season) => season.compliance.some((rule) => rule.status === 'VIOLATION'))
    .map((season) => season.season);

  return {
    status: 'READY',
    version: CAP_INTELLIGENCE_VERSION,
    teamKey: context.teamKey,
    sourceTeamName: team.sourceTeamName,
    phase: context.phase,
    sourceSalaryCap: snapshot.league.salaryCap,
    seasons,
    currentViolation: violationSeasons.includes(snapshot.league.season),
    knownFutureViolation: violationSeasons.some((season) => season > snapshot.league.season),
    firstViolationSeason: violationSeasons.length ? Math.min(...violationSeasons) : null,
  };
}

export type CapLiquidityCandidate =
  | {
    candidateId: string;
    targetTeamKey: string;
    kind: 'TRANSACTION';
    context: ContractTransactionContext;
    action: ContractTransactionAction;
  }
  | {
    candidateId: string;
    targetTeamKey: string;
    kind: 'RESTRUCTURE';
    context: ContractRestructureContext;
    action: ContractRestructureAction;
  };

export type CapLiquidityCandidateResult = {
  candidateId: string;
  kind: CapLiquidityCandidate['kind'];
  status: 'READY' | 'ILLEGAL' | 'ABSTAIN';
  sourceFingerprint: string;
  reasonCodes: string[];
  reliefBySeason: Array<{ season: number; capRoomDelta: number; deadCapDelta: number }>;
  currentSeasonRelief: number | null;
  totalPositiveRelief: number;
  firstPositiveReliefSeason: number | null;
  rightsConsumed: number;
  followUpActions: string[];
  ccfValueLost: null;
};

function unavailableLiquidity(
  candidate: CapLiquidityCandidate,
  status: 'ILLEGAL' | 'ABSTAIN',
  sourceFingerprint: string,
  reasonCodes: string[],
): CapLiquidityCandidateResult {
  return {
    candidateId: candidate.candidateId,
    kind: candidate.kind,
    status,
    sourceFingerprint,
    reasonCodes,
    reliefBySeason: [],
    currentSeasonRelief: null,
    totalPositiveRelief: 0,
    firstPositiveReliefSeason: null,
    rightsConsumed: 0,
    followUpActions: [],
    ccfValueLost: null,
  };
}

function finalizeLiquidity(
  candidate: CapLiquidityCandidate,
  currentSeason: number | null,
  sourceFingerprint: string,
  reliefBySeason: Array<{ season: number; capRoomDelta: number; deadCapDelta: number }>,
  rightsConsumed: number,
  followUpActions: string[],
): CapLiquidityCandidateResult {
  const positive = reliefBySeason.filter((item) => item.capRoomDelta > 0.000001);
  return {
    candidateId: candidate.candidateId,
    kind: candidate.kind,
    status: 'READY',
    sourceFingerprint,
    reasonCodes: [],
    reliefBySeason,
    currentSeasonRelief: currentSeason === null
      ? null
      : reliefBySeason.find((item) => item.season === currentSeason)?.capRoomDelta ?? 0,
    totalPositiveRelief: money(positive.reduce((sum, item) => sum + item.capRoomDelta, 0)),
    firstPositiveReliefSeason: positive.length ? Math.min(...positive.map((item) => item.season)) : null,
    rightsConsumed,
    followUpActions,
    ccfValueLost: null,
  };
}

export function certifyCapLiquidityCandidates(
  snapshotInput: unknown,
  policyInput: unknown,
  candidates: CapLiquidityCandidate[],
): CapLiquidityCandidateResult[] {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  const currentSeason = snapshotResult.success ? snapshotResult.data.league.season : null;

  const results = candidates.map((candidate): CapLiquidityCandidateResult => {
    if (candidate.kind === 'TRANSACTION') {
      const result = simulateKnownAtContractTransaction(
        snapshotInput,
        policyInput,
        candidate.context,
        candidate.action,
      );
      if (result.status === 'ABSTAIN') {
        return unavailableLiquidity(candidate, 'ABSTAIN', result.fingerprint, result.reasonCodes);
      }
      if (!result.legal) {
        return unavailableLiquidity(
          candidate,
          'ILLEGAL',
          result.fingerprint,
          result.violations.map((item) => item.code),
        );
      }
      const reliefBySeason = (result.teamEffects
        .find((effect) => effect.teamKey === candidate.targetTeamKey)?.seasons ?? [])
        .map((season) => ({
          season: season.season,
          capRoomDelta: money(season.after.capRemaining - season.before.capRemaining),
          deadCapDelta: money(season.after.deadCap - season.before.deadCap),
        }));
      return finalizeLiquidity(
        candidate,
        currentSeason,
        result.fingerprint,
        reliefBySeason,
        result.rightEffects.reduce((sum, item) => sum + item.quantityConsumed, 0),
        result.followUpActions,
      );
    }

    const result = simulateKnownAtContractRestructure(
      snapshotInput,
      policyInput,
      candidate.context,
      candidate.action,
    );
    if (result.status === 'ABSTAIN') {
      return unavailableLiquidity(candidate, 'ABSTAIN', result.fingerprint, result.reasonCodes);
    }
    if (!result.legal) {
      return unavailableLiquidity(
        candidate,
        'ILLEGAL',
        result.fingerprint,
        result.violations.map((item) => item.code),
      );
    }
    const reliefBySeason = result.seasonEffects.map((season) => ({
      season: season.season,
      capRoomDelta: money(season.after.capRemaining - season.before.capRemaining),
      deadCapDelta: 0,
    }));
    return finalizeLiquidity(
      candidate,
      currentSeason,
      result.fingerprint,
      reliefBySeason,
      result.rightEffect?.quantityConsumed ?? 0,
      [],
    );
  });

  return results.sort((a, b) => {
    const currentA = a.currentSeasonRelief ?? Number.NEGATIVE_INFINITY;
    const currentB = b.currentSeasonRelief ?? Number.NEGATIVE_INFINITY;
    if (currentA !== currentB) return currentB - currentA;
    return b.totalPositiveRelief - a.totalPositiveRelief;
  });
}
