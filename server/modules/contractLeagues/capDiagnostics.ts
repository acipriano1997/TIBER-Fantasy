import { contractLeagueSnapshotSchema, type ContractLeagueSnapshot } from './contracts';
import type { ContractValueComparisonResult } from './contractValue';

export const CAP_DIAGNOSTICS_VERSION = 'contract-cap-diagnostics.v1' as const;

type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'OTHER';

type PositionSpend = {
  position: Position;
  capHit: number;
  guaranteed: number;
  optional: number;
  playerCount: number;
  shareOfContractCapHit: number | null;
};

export type CapConcentrationSeason = {
  season: number;
  ledgerTotalCapHit: number;
  contractCapHit: number;
  deadCap: number;
  deadCapShareOfLedger: number | null;
  topPlayerCapHitShare: number | null;
  topThreePlayerCapHitShare: number | null;
  topPlayerGuaranteedShare: number | null;
  topThreeGuaranteedShare: number | null;
  expiringContractCapHit: number;
  expiringContractShare: number | null;
  optionalMoney: number;
  optionalShareOfContractCapHit: number | null;
  byPosition: PositionSpend[];
  largestPlayerCommitments: Array<{
    canonicalPlayerId: string | null;
    sourcePlayerName: string;
    position: Position;
    capHit: number;
    guaranteed: number;
    optional: number;
    shareOfContractCapHit: number | null;
  }>;
};

export type CapConcentrationResult =
  | {
    status: 'ABSTAIN';
    version: typeof CAP_DIAGNOSTICS_VERSION;
    reasonCodes: string[];
    details: string[];
  }
  | {
    status: 'READY';
    version: typeof CAP_DIAGNOSTICS_VERSION;
    sourceTeamName: string;
    seasons: CapConcentrationSeason[];
  };

function money(value: number) {
  return Number(value.toFixed(6));
}

function share(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(6)) : null;
}

function positionOf(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]): Position {
  return contract.position ?? 'OTHER';
}

function activeContract(contract: ContractLeagueSnapshot['teams'][number]['contracts'][number]) {
  return contract.status !== 'CUT' && contract.status !== 'EXPIRED';
}

function deadCapForSeason(team: ContractLeagueSnapshot['teams'][number], season: number) {
  return money(team.deadCap.reduce((sum, entry) => (
    sum + (entry.years.find((year) => year.season === season)?.amount ?? 0)
  ), 0));
}

export function buildCapConcentrationDiagnostics(
  snapshotInput: unknown,
  sourceTeamName: string,
): CapConcentrationResult {
  const snapshotResult = contractLeagueSnapshotSchema.safeParse(snapshotInput);
  if (!snapshotResult.success) {
    return { status: 'ABSTAIN', version: CAP_DIAGNOSTICS_VERSION, reasonCodes: ['SNAPSHOT_INVALID'], details: ['Contract snapshot failed schema validation.'] };
  }
  const snapshot = snapshotResult.data;
  if (snapshot.validation.status !== 'VALID') {
    return { status: 'ABSTAIN', version: CAP_DIAGNOSTICS_VERSION, reasonCodes: ['SNAPSHOT_NOT_DECISION_READY'], details: ['Cap diagnostics require a VALID contract snapshot.'] };
  }
  const teams = snapshot.teams.filter((team) => team.sourceTeamName === sourceTeamName.trim());
  if (teams.length !== 1 || !teams[0]) {
    return { status: 'ABSTAIN', version: CAP_DIAGNOSTICS_VERSION, reasonCodes: ['TEAM_BINDING_UNRESOLVED'], details: ['Cap diagnostics require exactly one bound source team.'] };
  }
  const team = teams[0];
  const active = team.contracts.filter(activeContract);

  const seasons = [...team.cap].sort((a, b) => a.season - b.season).map((ledger): CapConcentrationSeason => {
    const commitments = active.flatMap((contract) => {
      const year = contract.years.find((item) => item.season === ledger.season);
      if (!year) return [];
      const finalSeason = Math.max(...contract.years.filter((item) => item.season >= snapshot.league.season).map((item) => item.season));
      return [{
        canonicalPlayerId: contract.canonicalPlayerId,
        sourcePlayerName: contract.sourcePlayerName,
        position: positionOf(contract),
        capHit: money(year.capHit),
        guaranteed: money(year.guaranteed),
        optional: money(year.optional),
        expiresThisSeason: finalSeason === ledger.season,
      }];
    });
    const contractCapHit = money(commitments.reduce((sum, item) => sum + item.capHit, 0));
    const guaranteed = money(commitments.reduce((sum, item) => sum + item.guaranteed, 0));
    const optional = money(commitments.reduce((sum, item) => sum + item.optional, 0));
    const deadCap = deadCapForSeason(team, ledger.season);
    const sortedCap = [...commitments].sort((a, b) => b.capHit - a.capHit);
    const sortedGuaranteed = [...commitments].sort((a, b) => b.guaranteed - a.guaranteed);
    const expiringContractCapHit = money(commitments.filter((item) => item.expiresThisSeason).reduce((sum, item) => sum + item.capHit, 0));

    const byPositionMap = new Map<Position, { capHit: number; guaranteed: number; optional: number; count: number }>();
    for (const item of commitments) {
      const current = byPositionMap.get(item.position) ?? { capHit: 0, guaranteed: 0, optional: 0, count: 0 };
      current.capHit += item.capHit;
      current.guaranteed += item.guaranteed;
      current.optional += item.optional;
      current.count += 1;
      byPositionMap.set(item.position, current);
    }
    const byPosition = [...byPositionMap.entries()].map(([position, totals]): PositionSpend => ({
      position,
      capHit: money(totals.capHit),
      guaranteed: money(totals.guaranteed),
      optional: money(totals.optional),
      playerCount: totals.count,
      shareOfContractCapHit: share(totals.capHit, contractCapHit),
    })).sort((a, b) => b.capHit - a.capHit);

    return {
      season: ledger.season,
      ledgerTotalCapHit: money(ledger.totalCapHit),
      contractCapHit,
      deadCap,
      deadCapShareOfLedger: share(deadCap, ledger.totalCapHit),
      topPlayerCapHitShare: share(sortedCap[0]?.capHit ?? 0, contractCapHit),
      topThreePlayerCapHitShare: share(sortedCap.slice(0, 3).reduce((sum, item) => sum + item.capHit, 0), contractCapHit),
      topPlayerGuaranteedShare: share(sortedGuaranteed[0]?.guaranteed ?? 0, guaranteed),
      topThreeGuaranteedShare: share(sortedGuaranteed.slice(0, 3).reduce((sum, item) => sum + item.guaranteed, 0), guaranteed),
      expiringContractCapHit,
      expiringContractShare: share(expiringContractCapHit, contractCapHit),
      optionalMoney: optional,
      optionalShareOfContractCapHit: share(optional, contractCapHit),
      byPosition,
      largestPlayerCommitments: sortedCap.slice(0, 5).map((item) => ({
        canonicalPlayerId: item.canonicalPlayerId,
        sourcePlayerName: item.sourcePlayerName,
        position: item.position,
        capHit: item.capHit,
        guaranteed: item.guaranteed,
        optional: item.optional,
        shareOfContractCapHit: share(item.capHit, contractCapHit),
      })),
    };
  });

  return {
    status: 'READY',
    version: CAP_DIAGNOSTICS_VERSION,
    sourceTeamName: team.sourceTeamName,
    seasons,
  };
}

export type PositionalSpendEfficiencyResult =
  | {
    status: 'UNAVAILABLE';
    version: typeof CAP_DIAGNOSTICS_VERSION;
    reasonCode: string;
    detail: string;
  }
  | {
    status: 'READY';
    version: typeof CAP_DIAGNOSTICS_VERSION;
    groups: Array<{
      position: Position;
      metricId: string;
      playerCount: number;
      currentCapHit: number;
      rosterMarginalValue: number;
      marginalValuePerCapUnit: number | null;
    }>;
  };

/**
 * Diagnostic only. It groups CCF roster-marginal value by position and cap hit;
 * it does not prescribe a target positional spend percentage.
 */
export function buildPositionalSpendEfficiency(
  valueComparison: ContractValueComparisonResult,
): PositionalSpendEfficiencyResult {
  if (valueComparison.status !== 'READY') {
    return {
      status: 'UNAVAILABLE',
      version: CAP_DIAGNOSTICS_VERSION,
      reasonCode: 'CONTRACT_VALUE_COMPARISON_UNAVAILABLE',
      detail: 'Positional spend efficiency requires a READY contract-value comparison.',
    };
  }

  const groups = new Map<string, { position: Position; metricId: string; playerCount: number; capHit: number; value: number }>();
  for (const row of valueComparison.rows) {
    const position: Position = row.position ?? 'OTHER';
    const metricId = row.rosterMarginalValue.metricId;
    const key = `${position}:${metricId}`;
    const current = groups.get(key) ?? { position, metricId, playerCount: 0, capHit: 0, value: 0 };
    current.playerCount += 1;
    current.capHit += row.contractCost.currentSeason?.capHit ?? 0;
    current.value += row.rosterMarginalValue.value;
    groups.set(key, current);
  }

  return {
    status: 'READY',
    version: CAP_DIAGNOSTICS_VERSION,
    groups: [...groups.values()].map((group) => ({
      position: group.position,
      metricId: group.metricId,
      playerCount: group.playerCount,
      currentCapHit: money(group.capHit),
      rosterMarginalValue: money(group.value),
      marginalValuePerCapUnit: group.capHit > 0 ? money(group.value / group.capHit) : null,
    })).sort((a, b) => b.currentCapHit - a.currentCapHit),
  };
}
