import { createHash } from 'node:crypto';
import { storage, type IStorage } from '../storage';
import { sleeperClient, type SleeperRoster } from '../integrations/sleeperClient';
import {
  computeLeagueDashboard as computeLegacyLeagueDashboard,
  type LeagueDashboardPayload,
} from './leagueDashboardService';
import type { PlaybookForgeLogger } from '../utils/playbookForgeLogger';

export const MANAGEMENT_TRUTH_VERSION = 'management_truth_v1';

export type ManagementTruthBindingErrorCode =
  | 'league_missing_external_id'
  | 'team_missing_external_roster_id'
  | 'duplicate_sleeper_roster_id'
  | 'sleeper_roster_not_found'
  | 'dashboard_team_not_found'
  | 'dashboard_roster_identity_missing'
  | 'dashboard_roster_mismatch';

export class ManagementTruthBindingError extends Error {
  readonly code: ManagementTruthBindingErrorCode;
  readonly statusCode = 409;

  constructor(code: ManagementTruthBindingErrorCode, message: string) {
    super(message);
    this.name = 'ManagementTruthBindingError';
    this.code = code;
  }
}

export type ManagementTruthParams = {
  userId: string;
  leagueId: string;
  week?: number | null;
  season?: number | null;
  refresh?: boolean;
  upsertCache?: boolean;
};

type ManagementTruthDebugOptions = {
  logger?: PlaybookForgeLogger;
};

type ManagementTruthDeps = {
  storage: Pick<IStorage, 'getLeagueWithTeams'>;
  sleeperClient: Pick<typeof sleeperClient, 'getLeagueRosters'>;
  computeLeagueDashboard: typeof computeLegacyLeagueDashboard;
};

const defaultDeps: ManagementTruthDeps = {
  storage,
  sleeperClient,
  computeLeagueDashboard: computeLegacyLeagueDashboard,
};

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function sortedUnique(values: unknown[]): string[] {
  return Array.from(
    new Set(values.map(normalizeId).filter((value): value is string => Boolean(value))),
  ).sort();
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function rosterFingerprint(playerIds: string[], starterIds: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ players: playerIds, starters: starterIds }))
    .digest('hex');
}

function indexSleeperRostersByRosterId(rosters: SleeperRoster[]): Map<string, SleeperRoster> {
  const result = new Map<string, SleeperRoster>();
  for (const roster of rosters) {
    const rosterId = normalizeId(roster.roster_id);
    if (!rosterId) continue;
    if (result.has(rosterId)) {
      throw new ManagementTruthBindingError(
        'duplicate_sleeper_roster_id',
        `Sleeper returned duplicate roster_id ${rosterId}; refusing ambiguous Management binding.`,
      );
    }
    result.set(rosterId, roster);
  }
  return result;
}

function isPlayerSpecificForgeRow(player: any): boolean {
  return typeof player?.alpha === 'number' && player?.forgeScoreSource === 'player_specific';
}

function observedPositionTotals(starters: any[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    const atPosition = starters.filter((player) => String(player?.pos ?? '').toUpperCase() === position);
    if (atPosition.length === 0) {
      totals[position] = 0;
      continue;
    }
    if (!atPosition.every(isPlayerSpecificForgeRow)) continue;
    totals[position] = atPosition.reduce((sum, player) => sum + Number(player.alpha), 0);
  }
  return totals;
}

function truthEnforceTeam(
  team: any,
  dashboardTeam: any,
  sleeperRoster: SleeperRoster,
  externalRosterId: string,
) {
  const sleeperPlayerIds = sortedUnique(sleeperRoster.players ?? []);
  const sleeperStarterIds = sortedUnique(sleeperRoster.starters ?? []);
  const dashboardRoster = Array.isArray(dashboardTeam?.roster) ? dashboardTeam.roster : [];

  const dashboardSleeperIds: string[] = [];
  for (const player of dashboardRoster) {
    const sleeperId = normalizeId(player?.sleeperId ?? player?.providerPlayerId);
    if (!sleeperId) {
      throw new ManagementTruthBindingError(
        'dashboard_roster_identity_missing',
        `Team ${team.id} contains a dashboard roster row without a Sleeper player id; refusing to infer roster identity.`,
      );
    }
    dashboardSleeperIds.push(sleeperId);
  }

  const normalizedDashboardSleeperIds = sortedUnique(dashboardSleeperIds);
  if (!sameMembers(sleeperPlayerIds, normalizedDashboardSleeperIds)) {
    throw new ManagementTruthBindingError(
      'dashboard_roster_mismatch',
      `Team ${team.id} dashboard roster does not match external_roster_id ${externalRosterId}; refusing owner-id fallback or stale roster display.`,
    );
  }

  const starterSet = new Set(sleeperStarterIds);
  const roster = dashboardRoster.map((player: any) => {
    const sleeperId = normalizeId(player?.sleeperId ?? player?.providerPlayerId)!;
    return {
      ...player,
      usedAsStarter: starterSet.has(sleeperId),
    };
  });
  const startersUsed = roster.filter((player: any) => player.usedAsStarter);
  const bench = roster.filter((player: any) => !player.usedAsStarter);

  const starterSpecificCount = startersUsed.filter(isPlayerSpecificForgeRow).length;
  const rosterSpecificCount = roster.filter(isPlayerSpecificForgeRow).length;
  const benchFullyCovered = bench.every(isPlayerSpecificForgeRow);
  const startersFullyCovered = startersUsed.every(isPlayerSpecificForgeRow);
  const overallAvailable = startersFullyCovered && benchFullyCovered;

  const benchContribution = benchFullyCovered
    ? 0.15 * bench.reduce((sum: number, player: any) => sum + Number(player.alpha), 0)
    : null;
  const starterTotal = startersFullyCovered
    ? startersUsed.reduce((sum: number, player: any) => sum + Number(player.alpha), 0)
    : null;
  const overallTotal = starterTotal !== null && benchContribution !== null
    ? starterTotal + benchContribution
    : null;

  return {
    ...dashboardTeam,
    totals: observedPositionTotals(startersUsed),
    bench_contribution: benchContribution,
    overall_total: overallTotal,
    starters_used: startersUsed,
    roster,
    binding: {
      status: 'verified',
      strategy: 'external_roster_id',
      team_id: String(team.id),
      external_roster_id: externalRosterId,
      sleeper_roster_id: normalizeId(sleeperRoster.roster_id),
      sleeper_owner_id: normalizeId(sleeperRoster.owner_id),
      roster_player_count: sleeperPlayerIds.length,
      observed_starter_count: sleeperStarterIds.length,
      roster_fingerprint: rosterFingerprint(sleeperPlayerIds, sleeperStarterIds),
    },
    evaluation: {
      status: overallAvailable ? 'available' : 'insufficient_evidence',
      overall_available: overallAvailable,
      reason: overallAvailable ? null : 'overall_requires_player_specific_forge_coverage_for_starters_and_bench',
      observed_starter_count: startersUsed.length,
      player_specific_starter_count: starterSpecificCount,
      roster_player_count: roster.length,
      player_specific_roster_count: rosterSpecificCount,
      player_specific_roster_coverage: roster.length === 0 ? 0 : rosterSpecificCount / roster.length,
    },
  };
}

/**
 * Truth boundary for the Management dashboard.
 *
 * The legacy dashboard may still synthesize a model lineup and historically
 * joined Sleeper rosters by owner id. This wrapper makes neither behavior
 * authoritative. A response is returned only when each local team can be bound
 * by its canonical external_roster_id and the legacy roster membership exactly
 * matches the corresponding Sleeper roster. Starter flags are then overwritten
 * from Sleeper's observed `starters[]` list.
 */
export async function computeTruthBoundLeagueDashboard(
  params: ManagementTruthParams,
  deps: ManagementTruthDeps = defaultDeps,
  debug?: ManagementTruthDebugOptions,
): Promise<LeagueDashboardPayload & Record<string, any>> {
  const league = await deps.storage.getLeagueWithTeams(params.leagueId);
  if (!league || ((league as any).userId !== params.userId && (league as any).user_id !== params.userId)) {
    throw new Error('League not found');
  }

  const externalLeagueId = normalizeId((league as any).leagueIdExternal ?? (league as any).league_id_external);
  if (!externalLeagueId) {
    throw new ManagementTruthBindingError(
      'league_missing_external_id',
      'League is missing its external Sleeper league id.',
    );
  }

  const [legacyPayload, sleeperRosters] = await Promise.all([
    deps.computeLeagueDashboard(params as any, undefined, debug?.logger ? { logger: debug.logger } : undefined),
    deps.sleeperClient.getLeagueRosters(externalLeagueId),
  ]);

  const rosterByRosterId = indexSleeperRostersByRosterId(sleeperRosters);
  const dashboardTeamById = new Map(
    (legacyPayload.teams ?? []).map((team: any) => [String(team.team_id), team]),
  );

  const teams = (league.teams ?? []).map((team: any) => {
    const teamId = String(team.id);
    const externalRosterId = normalizeId(team.externalRosterId ?? team.external_roster_id);
    if (!externalRosterId) {
      throw new ManagementTruthBindingError(
        'team_missing_external_roster_id',
        `Team ${teamId} is missing external_roster_id; refusing owner-id fallback.`,
      );
    }

    const sleeperRoster = rosterByRosterId.get(externalRosterId);
    if (!sleeperRoster) {
      throw new ManagementTruthBindingError(
        'sleeper_roster_not_found',
        `No Sleeper roster matches external_roster_id ${externalRosterId} for team ${teamId}.`,
      );
    }

    const dashboardTeam = dashboardTeamById.get(teamId);
    if (!dashboardTeam) {
      throw new ManagementTruthBindingError(
        'dashboard_team_not_found',
        `Legacy dashboard omitted team ${teamId}; refusing partial Management response.`,
      );
    }

    return truthEnforceTeam(team, dashboardTeam, sleeperRoster, externalRosterId);
  });

  debug?.logger?.log('management-truth-boundary', {
    requestId: debug.logger.requestId,
    version: MANAGEMENT_TRUTH_VERSION,
    league_id: params.leagueId,
    external_league_id: externalLeagueId,
    team_count: teams.length,
    binding_strategy: 'external_roster_id',
  });

  return {
    ...legacyPayload,
    meta: {
      ...legacyPayload.meta,
      management_truth_version: MANAGEMENT_TRUTH_VERSION,
      truth_enforced_at: new Date().toISOString(),
      user_id: params.userId,
      external_league_id: externalLeagueId,
      roster_binding: 'external_roster_id',
    },
    teams,
  } as LeagueDashboardPayload & Record<string, any>;
}
