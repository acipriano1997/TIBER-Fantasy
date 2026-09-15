import { sleeperClient } from '../integrations/sleeperClient';
import {
  assessLeagueDecisionReadiness,
  buildUnifiedLeagueContextV1,
  summarizeLeagueContextHealth,
  type LeagueDecisionType,
  type UnifiedLeagueContextV1,
} from '../leagueContext';

export type ActiveLeagueContextLike = {
  id?: string | null;
  leagueName?: string | null;
  league_name?: string | null;
  platform?: string | null;
  season?: number | null;
  leagueIdExternal?: string | null;
  league_id_external?: string | null;
};

export type CommandCenterLeagueContextStatus = 'ready' | 'not_connected' | 'source_unavailable';

export type CommandCenterLeagueContextView = {
  schemaVersion: 'command-center-league-context.v1';
  status: CommandCenterLeagueContextStatus;
  league: null | {
    internalLeagueId: string | null;
    externalLeagueId: string | null;
    name: string;
    season: number | null;
    platform: string;
  };
  health: null | ReturnType<typeof summarizeLeagueContextHealth>;
  scoring: null | {
    status: UnifiedLeagueContextV1['scoring']['status'];
    fingerprint: string | null;
    asOf: string | null;
  };
  capabilities: UnifiedLeagueContextV1['capabilities'];
  readiness: Partial<Record<LeagueDecisionType, ReturnType<typeof assessLeagueDecisionReadiness>>>;
  issues: UnifiedLeagueContextV1['issues'];
  sourceError: string | null;
  context: UnifiedLeagueContextV1 | null;
};

type CommandCenterLeagueContextDeps = {
  getSleeperLeague: typeof sleeperClient.getLeague;
  now: () => Date;
};

const defaultDeps: CommandCenterLeagueContextDeps = {
  getSleeperLeague: sleeperClient.getLeague.bind(sleeperClient),
  now: () => new Date(),
};

function leagueName(league: ActiveLeagueContextLike): string {
  return league.leagueName ?? league.league_name ?? 'Unknown league';
}

function externalLeagueId(league: ActiveLeagueContextLike): string | null {
  const value = league.leagueIdExternal ?? league.league_id_external ?? null;
  return value == null ? null : String(value);
}

function buildReadiness(context: UnifiedLeagueContextV1) {
  return {
    lineup: assessLeagueDecisionReadiness(context, { decisionType: 'lineup' }),
    waiver: assessLeagueDecisionReadiness(context, { decisionType: 'waiver' }),
    trade: assessLeagueDecisionReadiness(context, { decisionType: 'trade' }),
    contract: assessLeagueDecisionReadiness(context, { decisionType: 'contract' }),
  };
}

/**
 * Resolves the selected league into the same certified Unified League Context
 * used by Decision Packets. Platform truth is fetched live for the active
 * Sleeper league; supplemental contract/Devy sources remain unavailable unless
 * their normalized snapshots are explicitly supplied by their ingestion path.
 */
export async function resolveCommandCenterLeagueContext(
  activeLeague: ActiveLeagueContextLike | null | undefined,
  deps: CommandCenterLeagueContextDeps = defaultDeps,
): Promise<CommandCenterLeagueContextView> {
  if (!activeLeague) {
    return {
      schemaVersion: 'command-center-league-context.v1',
      status: 'not_connected',
      league: null,
      health: null,
      scoring: null,
      capabilities: [],
      readiness: {},
      issues: [],
      sourceError: null,
      context: null,
    };
  }

  const platform = activeLeague.platform ?? 'sleeper';
  const externalId = externalLeagueId(activeLeague);
  const fallbackName = leagueName(activeLeague);
  const checkedAt = deps.now();
  let sourceError: string | null = null;
  let liveLeague: Awaited<ReturnType<typeof sleeperClient.getLeague>> | null = null;

  if (platform === 'sleeper' && externalId) {
    try {
      liveLeague = await deps.getSleeperLeague(externalId);
      if (String(liveLeague.league_id) !== externalId) {
        throw new Error(`Sleeper identity mismatch: requested ${externalId}, received ${liveLeague.league_id}.`);
      }
    } catch (error) {
      sourceError = error instanceof Error ? error.message : String(error);
    }
  } else {
    sourceError = platform !== 'sleeper'
      ? `Command Center league-context certification is not yet implemented for platform ${platform}.`
      : 'Active league has no external Sleeper league ID.';
  }

  const resolvedSeason = liveLeague ? Number(liveLeague.season) : activeLeague.season ?? 0;
  const context = await buildUnifiedLeagueContextV1({
    platform,
    leagueId: externalId ?? activeLeague.id ?? 'unknown-league',
    leagueName: liveLeague?.name ?? fallbackName,
    season: Number.isFinite(resolvedSeason) ? resolvedSeason : 0,
    rawScoringSettings: liveLeague?.scoring_settings as Record<string, number> | undefined,
    scoringAsOf: liveLeague ? checkedAt : null,
    rosterPositions: liveLeague?.roster_positions ?? [],
    builtAt: checkedAt,
  });

  return {
    schemaVersion: 'command-center-league-context.v1',
    status: sourceError ? 'source_unavailable' : 'ready',
    league: {
      internalLeagueId: activeLeague.id ?? null,
      externalLeagueId: externalId,
      name: context.identity.leagueName,
      season: context.identity.season || activeLeague.season || null,
      platform,
    },
    health: summarizeLeagueContextHealth(context),
    scoring: {
      status: context.scoring.status,
      fingerprint: context.scoring.fingerprint,
      asOf: context.scoring.asOf,
    },
    capabilities: context.capabilities,
    readiness: buildReadiness(context),
    issues: context.issues,
    sourceError,
    context,
  };
}

export function publicCommandCenterLeagueContext(
  resolved: CommandCenterLeagueContextView,
): Omit<CommandCenterLeagueContextView, 'context'> {
  const { context: _context, ...publicView } = resolved;
  return publicView;
}
