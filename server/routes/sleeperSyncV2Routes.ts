/**
 * Sleeper Sync V2 Routes
 * Manual endpoints for roster synchronization and ownership analytics
 *
 * POST /api/sleeper/sync/run - Run sync for a league
 * GET  /api/sleeper/sync/status - Get sync status for a league
 * GET  /api/sleeper/leagues - Discover all synced leagues
 * GET  /api/sleeper/leagues/live - Discover a user's live Sleeper portfolio
 * GET  /api/ownership/history - Get ownership event history for a player
 * GET  /api/ownership/churn - Get ownership churn analytics (most added/dropped/traded)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { syncLeague, getSyncStatus, getUnresolvedPlayerCount, getStoredLeagues, getSchedulerStatus } from '../services/sleeperSyncV2';
import { db } from '../infra/db';
import { ownershipEvents, sleeperSyncState } from '@shared/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { SleeperApiError, sleeperClient } from '../integrations/sleeperClient';
import { auditSleeperScoringCoverage } from '../services/sleeperScoringCoverageAudit';

const router = Router();

// Validation schemas
const syncRunSchema = z.object({
  leagueId: z.string().min(1, 'leagueId is required'),
  force: z.boolean().optional().default(false),
  week: z.number().int().min(1).max(18).optional(),
  season: z.number().int().min(2020).max(2030).optional()
}).superRefine((value, context) => {
  if ((value.season === undefined) !== (value.week === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'season and week must be provided together, or both omitted',
    });
  }
});

const livePortfolioQuerySchema = z.object({
  username: z.string().trim().min(1, 'username is required'),
  season: z.coerce.number().int().min(2018).max(2030).optional().default(new Date().getFullYear()),
});

/**
 * POST /api/sleeper/sync/run
 * Run roster sync for a Sleeper league
 *
 * Body:
 *   leagueId: string (required) - Sleeper league ID
 *   force: boolean (optional) - Force sync even if no changes detected
 *   week: number (optional) - Current week
 *   season: number (optional) - Current season
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const parseResult = syncRunSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseResult.error.errors
      });
    }

    const { leagueId, force, week, season } = parseResult.data;

    console.log(`[SleeperSyncV2Routes] Sync requested for league ${leagueId} (force=${force})`);

    const result = await syncLeague(leagueId, { force, week, season });

    return res.status(result.success ? 200 : 500).json({
      success: result.success,
      data: {
        leagueId: result.leagueId,
        eventsInserted: result.eventsInserted,
        shortCircuited: result.shortCircuited,
        baseline: result.baseline,
        durationMs: result.durationMs,
        hash: result.hash,
        resolverStats: result.resolverStats
      },
      error: result.error
    });

  } catch (error: any) {
    console.error('[SleeperSyncV2Routes] Sync run error:', error);
    const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/sleeper/sync/status
 * Get sync status for a Sleeper league
 *
 * Query:
 *   leagueId: string (required) - Sleeper league ID
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const leagueId = req.query.leagueId as string;

    if (!leagueId) {
      return res.status(400).json({
        success: false,
        error: 'leagueId query parameter is required'
      });
    }

    const status = await getSyncStatus(leagueId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'No sync state found for this league'
      });
    }

    // Also get unresolved player count
    const unresolvedCount = await getUnresolvedPlayerCount(leagueId);

    return res.json({
      success: true,
      data: {
        leagueId,
        status: status.status,
        lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
        lastDurationMs: status.lastDurationMs,
        lastError: status.lastError,
        lastHash: status.lastHash,
        unresolvedPlayerCount: unresolvedCount
      }
    });

  } catch (error: any) {
    console.error('[SleeperSyncV2Routes] Status check error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
});

// ========================================
// OWNERSHIP ANALYTICS ROUTES
// ========================================

export const ownershipRouter = Router();

// Response types for type safety
interface OwnershipEvent {
  id: number;
  leagueId: string;
  playerKey: string;
  fromTeamId: string | null;
  toTeamId: string | null;
  eventType: string;
  eventAt: string;
  week: number | null;
  season: number | null;
  source: string | null;
}

interface ChurnEntry {
  playerKey: string;
  count: number;
}

interface ChurnResponse {
  mostAdded: ChurnEntry[];
  mostDropped: ChurnEntry[];
  mostTraded: ChurnEntry[];
  since: string;
  leagueId: string;
}

/**
 * GET /api/ownership/history
 * Get ownership event history for a player in a league
 *
 * Query:
 *   leagueId: string (required) - League ID
 *   playerKey: string (required) - Player key (GSIS ID or sleeper:<id>)
 */
ownershipRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const leagueId = req.query.leagueId as string;
    const playerKey = req.query.playerKey as string;

    if (!leagueId) {
      return res.status(400).json({
        success: false,
        error: 'leagueId query parameter is required'
      });
    }

    if (!playerKey) {
      return res.status(400).json({
        success: false,
        error: 'playerKey query parameter is required'
      });
    }

    const events = await db
      .select()
      .from(ownershipEvents)
      .where(
        and(
          eq(ownershipEvents.leagueId, leagueId),
          eq(ownershipEvents.playerKey, playerKey)
        )
      )
      .orderBy(desc(ownershipEvents.eventAt))
      .limit(50);

    const formatted: OwnershipEvent[] = events.map(e => ({
      id: e.id,
      leagueId: e.leagueId,
      playerKey: e.playerKey,
      fromTeamId: e.fromTeamId,
      toTeamId: e.toTeamId,
      eventType: e.eventType,
      eventAt: e.eventAt.toISOString(),
      week: e.week,
      season: e.season,
      source: e.source
    }));

    return res.json({
      success: true,
      data: {
        leagueId,
        playerKey,
        events: formatted,
        count: formatted.length
      }
    });

  } catch (error: any) {
    console.error('[OwnershipRoutes] History error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/ownership/churn
 * Get ownership churn analytics (most added/dropped/traded players)
 *
 * Query:
 *   leagueId: string (required) - League ID
 *   since: string (optional) - ISO timestamp to filter events from (defaults to 7 days ago)
 */
ownershipRouter.get('/churn', async (req: Request, res: Response) => {
  try {
    const leagueId = req.query.leagueId as string;
    const since = req.query.since as string | undefined;

    if (!leagueId) {
      return res.status(400).json({
        success: false,
        error: 'leagueId query parameter is required'
      });
    }

    // Default to 7 days ago if since not provided
    let sinceDate: Date;
    if (since) {
      sinceDate = new Date(since);
      if (isNaN(sinceDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid since timestamp format. Use ISO 8601 format.'
        });
      }
    } else {
      sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // Query for most added players
    const addedResult = await db.execute(sql`
      SELECT player_key, COUNT(*) as count
      FROM ownership_events
      WHERE league_id = ${leagueId}
        AND event_at >= ${sinceDate}
        AND event_type = 'ADD'
      GROUP BY player_key
      ORDER BY count DESC
      LIMIT 20
    `);

    // Query for most dropped players
    const droppedResult = await db.execute(sql`
      SELECT player_key, COUNT(*) as count
      FROM ownership_events
      WHERE league_id = ${leagueId}
        AND event_at >= ${sinceDate}
        AND event_type = 'DROP'
      GROUP BY player_key
      ORDER BY count DESC
      LIMIT 20
    `);

    // Query for most traded players
    const tradedResult = await db.execute(sql`
      SELECT player_key, COUNT(*) as count
      FROM ownership_events
      WHERE league_id = ${leagueId}
        AND event_at >= ${sinceDate}
        AND event_type = 'TRADE'
      GROUP BY player_key
      ORDER BY count DESC
      LIMIT 20
    `);

    const formatEntries = (rows: any[]): ChurnEntry[] =>
      rows.map(r => ({
        playerKey: r.player_key,
        count: parseInt(r.count) || 0
      }));

    const response: ChurnResponse = {
      leagueId,
      since: sinceDate.toISOString(),
      mostAdded: formatEntries(addedResult.rows as any[]),
      mostDropped: formatEntries(droppedResult.rows as any[]),
      mostTraded: formatEntries(tradedResult.rows as any[])
    };

    return res.json({
      success: true,
      data: response
    });

  } catch (error: any) {
    console.error('[OwnershipRoutes] Churn error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
});

// Separate leagues discovery router (mounted at /api/sleeper)
export const leaguesRouter = Router();

/**
 * GET /api/sleeper/leagues
 * Discover all leagues that have been synced/configured
 * Source: sleeper_sync_state table (via shared getStoredLeagues)
 */
leaguesRouter.get('/leagues', async (req: Request, res: Response) => {
  try {
    const leagues = await getStoredLeagues();

    const formatted = leagues.map(l => ({
      leagueId: l.leagueId,
      status: l.status,
      lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
      changeSeq: l.changeSeq,
    }));

    return res.json({
      success: true,
      data: {
        leagues: formatted,
        count: formatted.length
      }
    });

  } catch (error: any) {
    console.error('[SleeperSyncV2Routes] Leagues discovery error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/sleeper/leagues/live?username=<username>&season=<yyyy>
 * Resolve a Sleeper username to its immutable user ID and discover every live
 * NFL league for the requested season. This endpoint is read-only and does not
 * silently fall back to stored/synthetic data when Sleeper is unavailable.
 */
leaguesRouter.get('/leagues/live', async (req: Request, res: Response) => {
  const parseResult = livePortfolioQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_PORTFOLIO_QUERY',
      error: 'Validation failed',
      details: parseResult.error.errors,
    });
  }

  const { username, season } = parseResult.data;

  let user;
  try {
    user = await sleeperClient.getUser(username);
  } catch (error: any) {
    if (error instanceof SleeperApiError && error.status === 404) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        error: 'Sleeper user not found',
        data: { username },
      });
    }

    console.error('[SleeperSyncV2Routes] Live user resolution failed:', error);
    return res.status(502).json({
      success: false,
      code: 'SLEEPER_UPSTREAM_ERROR',
      error: 'Unable to resolve Sleeper user from live upstream data',
      data: { username, stage: 'user' },
    });
  }

  if (!user?.user_id) {
    return res.status(404).json({
      success: false,
      code: 'USER_NOT_FOUND',
      error: 'Sleeper user did not resolve to an immutable user ID',
      data: { username },
    });
  }

  let leagues;
  try {
    leagues = await sleeperClient.getUserLeagues(user.user_id, String(season));
  } catch (error: any) {
    console.error('[SleeperSyncV2Routes] Live league discovery failed:', error);
    return res.status(502).json({
      success: false,
      code: 'SLEEPER_UPSTREAM_ERROR',
      error: 'Unable to discover Sleeper leagues from live upstream data',
      data: { username, userId: user.user_id, season, stage: 'leagues' },
    });
  }

  const fetchedAt = new Date().toISOString();
  const formatted = leagues.map((league) => {
    const scoringSettings = league.scoring_settings ?? {};
    const scoringCoverage = auditSleeperScoringCoverage(scoringSettings);

    return {
      leagueId: league.league_id,
      name: league.name,
      season: league.season,
      status: league.status ?? null,
      totalRosters: league.total_rosters ?? null,
      rosterPositions: league.roster_positions ?? [],
      scoringSettings,
      scoringCoverage,
      settings: league.settings ?? {},
      draftId: league.draft_id ?? null,
      previousLeagueId: league.previous_league_id ?? null,
    };
  });
  const redLeagueIds = formatted
    .filter((league) => league.scoringCoverage.status === 'RED')
    .map((league) => league.leagueId);
  const greenLeagueCount = formatted.length - redLeagueIds.length;

  return res.json({
    success: true,
    data: {
      username: user.username ?? username,
      displayName: user.display_name,
      userId: user.user_id,
      season,
      leagues: formatted,
      count: formatted.length,
      scoringCertification: {
        status: redLeagueIds.length === 0 ? 'GREEN' : 'RED',
        profileId: 'tiber_forecast_xfpg_ppr_v1',
        authority: 'TIBER-Forecast',
        greenLeagueCount,
        redLeagueCount: redLeagueIds.length,
        redLeagueIds,
        productionAuthorityUnlocked: redLeagueIds.length === 0,
      },
      provenance: {
        source: 'sleeper',
        mode: 'live',
        fetchedAt,
        complete: true,
        syntheticFallbackAllowed: false,
      },
    },
  });
});

/**
 * GET /api/sleeper/sync/scheduler
 * Get scheduler status
 */
router.get('/scheduler', async (req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();

    return res.json({
      success: true,
      data: status
    });

  } catch (error: any) {
    console.error('[SleeperSyncV2Routes] Scheduler status error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
});

// Export sync router as default, ownership router and leagues router as named exports
export default router;