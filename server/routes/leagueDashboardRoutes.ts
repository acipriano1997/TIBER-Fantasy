import express from 'express';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  computeTruthBoundLeagueDashboard,
  ManagementTruthBindingError,
} from '../services/managementTruthService';
import { createPlaybookForgeLogger } from '../utils/playbookForgeLogger';
import { db } from '../infra/db';
import { forgePlayerState, playerIdentityMap } from '@shared/schema';
import { sleeperClient } from '../integrations/sleeperClient';
import { storage } from '../storage';

export function createLeagueDashboardRouter() {
  const router = express.Router();

  router.get('/api/league-dashboard', async (req, res) => {
    try {
      const { user_id, league_id, week, season, refresh } = req.query;
      if (!user_id) {
        return res.status(400).json({ success: false, error: 'user_id is required' });
      }
      if (!league_id) {
        return res.status(400).json({ success: false, error: 'league_id is required' });
      }

      const logger = createPlaybookForgeLogger({
        requestId: (req.headers['x-request-id'] as string) || undefined,
        enabled: process.env.DEBUG_PLAYBOOK_FORGE === '1',
        scope: 'LeagueDashboardRoute',
      });

      const payload = await computeTruthBoundLeagueDashboard({
        userId: user_id as string,
        leagueId: league_id as string,
        week: week ? Number(week) : null,
        season: season ? Number(season) : null,
        refresh: refresh === '1' || refresh === 'true',
      }, undefined, { logger });

      res.setHeader('x-playbook-request-id', logger.requestId);
      res.json({ ...payload, requestId: logger.requestId });
    } catch (error) {
      console.error('[League Dashboard] failed to compute', error);
      if (error instanceof ManagementTruthBindingError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }
      res.status(500).json({ success: false, error: (error as Error).message || 'Failed to load league dashboard' });
    }
  });

  router.get('/api/league-dashboard/forge-sanity', async (req, res) => {
    const debugEnabled = process.env.DEBUG_PLAYBOOK_FORGE === '1';
    const logger = createPlaybookForgeLogger({
      requestId: (req.headers['x-request-id'] as string) || undefined,
      enabled: debugEnabled,
      scope: 'LeagueForgeSanity',
    });

    if (!debugEnabled) {
      return res.status(404).json({ success: false, error: 'Diagnostics disabled', requestId: logger.requestId });
    }

    try {
      const { league_id, season, week } = req.query;

      if (!league_id) {
        return res.status(400).json({ success: false, error: 'league_id is required', requestId: logger.requestId });
      }

      const league = await storage.getLeagueWithTeams(league_id as string);
      if (!league) {
        return res.status(404).json({ success: false, error: 'League not found', requestId: logger.requestId });
      }

      const externalLeagueId = (league as any).leagueIdExternal ?? (league as any).league_id_external;
      if (!externalLeagueId) {
        return res.status(400).json({ success: false, error: 'League missing external id', requestId: logger.requestId });
      }

      const targetSeason = season ? Number(season) : (league as any).season ?? null;
      const targetWeek = week ? Number(week) : null;

      const rosters = await sleeperClient.getLeagueRosters(String(externalLeagueId));
      const rosterPlayerIds = Array.from(new Set(rosters.flatMap((r) => (r.players ?? []).map((pid) => String(pid)))));

      logger.log('sanity-rosters', {
        requestId: logger.requestId,
        roster_count: rosters.length,
        unique_player_ids: rosterPlayerIds.length,
        sample_player_ids: rosterPlayerIds.slice(0, 10),
      });

      const identities = rosterPlayerIds.length
        ? await db.select().from(playerIdentityMap).where(inArray(playerIdentityMap.sleeperId, rosterPlayerIds))
        : [];
      const identityBySleeperId = new Map(identities.map((row) => [String(row.sleeperId), row]));
      const canonicalIds = identities.map((row) => row.canonicalId);

      logger.log('sanity-identity', {
        requestId: logger.requestId,
        identity_rows: identities.length,
        missing_identity_count: rosterPlayerIds.length - identities.length,
        sample_identity: identities.slice(0, 5).map((row) => ({ sleeperId: row.sleeperId, canonicalId: row.canonicalId })),
      });

      const conditions = [inArray(forgePlayerState.playerId, canonicalIds) as any];
      if (targetSeason !== null) conditions.push(eq(forgePlayerState.season, Number(targetSeason)) as any);
      if (targetWeek !== null) conditions.push(eq(forgePlayerState.week, Number(targetWeek)) as any);

      const forgeRows = canonicalIds.length
        ? await db
            .select()
            .from(forgePlayerState)
            .where((conditions.length > 1 ? and(...conditions.filter(Boolean)) : conditions[0]) as any)
            .orderBy(desc(forgePlayerState.season), desc(forgePlayerState.week), desc(forgePlayerState.computedAt))
        : [];

      const alphaByPlayer = new Map<string, { alpha: number | null }>();
      for (const row of forgeRows) {
        if (alphaByPlayer.has(row.playerId)) continue;
        const alphaValue = row.alphaFinal ?? row.alphaRaw;
        alphaByPlayer.set(row.playerId, { alpha: alphaValue === null || alphaValue === undefined ? null : Number(alphaValue) });
      }

      logger.log('sanity-forge', {
        requestId: logger.requestId,
        forge_rows: forgeRows.length,
        canonical_with_alpha: alphaByPlayer.size,
        target_season: targetSeason,
        target_week: targetWeek,
      });

      const sampleIds = rosterPlayerIds.slice(0, 10);
      const sample = sampleIds.map((sleeperId) => {
        const identity = identityBySleeperId.get(sleeperId);
        const canonicalId = identity?.canonicalId ?? `sleeper:${sleeperId}`;
        const alphaEntry = alphaByPlayer.get(canonicalId);
        const hasForge = alphaEntry !== undefined && alphaEntry.alpha !== null && alphaEntry.alpha !== undefined;
        const reason = !identity
          ? 'unmapped_sleeper_id'
          : !alphaEntry
            ? 'missing_forge_row'
            : alphaEntry.alpha === null
              ? 'alpha_null'
              : 'matched';

        return {
          roster_player_id: sleeperId,
          forge_player_id: canonicalId,
          position: identity?.position ?? null,
          forge_match: hasForge,
          alpha: alphaEntry?.alpha ?? null,
          reason,
        };
      });

      const missingReasons = sample.reduce<Record<string, number>>((acc, row) => {
        if (!row.forge_match) {
          acc[row.reason] = (acc[row.reason] ?? 0) + 1;
        }
        return acc;
      }, {});

      logger.log('sanity-merge', {
        requestId: logger.requestId,
        sample_size: sample.length,
        forge_matches: sample.filter((row) => row.forge_match).length,
        missing_reasons: missingReasons,
      });

      res.setHeader('x-playbook-request-id', logger.requestId);
      res.json({
        success: true,
        requestId: logger.requestId,
        meta: {
          league_id: league_id as string,
          season: targetSeason,
          week: targetWeek,
        },
        counts: {
          roster_players: rosterPlayerIds.length,
          identities: identities.length,
          forge_rows: forgeRows.length,
          alpha_entries: alphaByPlayer.size,
        },
        missing_reasons: missingReasons,
        sample,
      });
    } catch (error) {
      console.error('[League Dashboard Sanity] failed', error);
      res.status(500).json({ success: false, error: (error as Error).message || 'Failed to run sanity check', requestId: logger.requestId });
    }
  });

  return router;
}

export const leagueDashboardRouter = createLeagueDashboardRouter();