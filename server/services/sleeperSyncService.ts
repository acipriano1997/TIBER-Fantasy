/**
 * Sleeper Sync Service with Cache Fallback
 * Handles real-time sync with Sleeper API and graceful fallback to cached data.
 */

import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getNewestCacheTimestamp, warnIfCacheStale } from '../config/season';

// Centralized axios instance. League-context requests intentionally do not
// fall back to synthetic/cached league truth: production preflight must fail
// closed when the live Sleeper resources cannot be proven complete.
const http = axios.create({
  baseURL: 'https://api.sleeper.app/v1',
  timeout: 8000,
  validateStatus: (s) => s >= 200 && s < 500,
});

export interface SleeperPlayer {
  player_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string;
  age: number;
  years_exp: number;
  status: string;
  fantasy_positions: string[];
  injury_status?: string;
  search_full_name?: string;
  news_updated?: number | null;
}

export interface SleeperProjection {
  player_id: string;
  week: number;
  season: string;
  projection_data: {
    pass_yds?: number;
    pass_tds?: number;
    pass_int?: number;
    rush_yds?: number;
    rush_tds?: number;
    rec_yds?: number;
    rec_tds?: number;
    receptions?: number;
    fantasy_points?: number;
    fantasy_points_ppr?: number;
  };
}

export interface SleeperSyncResult {
  success: boolean;
  source: 'live' | 'cache';
  timestamp: string;
  players_count: number;
  projections_count: number;
  error?: string;
}

export interface SleeperLeagueContext {
  league_id: string;
  week: number;
  league: any;
  leagues: any[];
  rosters: any[] | null;
  matchups: any[] | null;
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  settings: Record<string, any>;
  provenance: {
    source: 'sleeper';
    mode: 'live';
    fetched_at: string;
    complete: boolean;
    endpoints: {
      league: string;
      rosters: string;
      matchups: string;
    };
  };
}

// Standard error helper
function err(code: string, message: string, details?: any, status?: number) {
  const e: any = new Error(message);
  e.code = code;
  if (details !== undefined) e.details = details;
  if (status) e.status = status;
  return e;
}

// JSON-structured log helpers
function logInfo(msg: string, meta?: Record<string, any>) {
  console.log(JSON.stringify({ level: 'info', src: 'SleeperSync', msg, ...(meta || {}) }));
}

function logError(msg: string, error: any, meta?: Record<string, any>) {
  console.error(
    JSON.stringify({
      level: 'error',
      src: 'SleeperSync',
      msg,
      error: error?.message || String(error),
      stack: error?.stack,
      ...(meta || {}),
    }),
  );
}

class SleeperSyncService {
  private readonly CACHE_DIR = path.join(process.cwd(), 'server', 'data', 'sleeper_cache');
  private readonly PLAYERS_CACHE_FILE = path.join(this.CACHE_DIR, 'players.json');
  private readonly CACHE_EXPIRY_HOURS = 6;
  private playersCache = { data: null as SleeperPlayer[] | null, updatedAt: null as Date | null };

  constructor() {
    this.ensureCacheDirectory();
  }

  private async ensureCacheDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.CACHE_DIR, { recursive: true });
    } catch (error) {
      logError('Failed to create cache directory', error);
    }
  }

  private async isCacheStale(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      return ageHours > this.CACHE_EXPIRY_HOURS;
    } catch {
      return true;
    }
  }

  private async readCache<T>(filePath: string): Promise<T | null> {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async writeCache<T>(filePath: string, data: T): Promise<void> {
    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      if (filePath === this.PLAYERS_CACHE_FILE && Array.isArray(data)) {
        this.playersCache.data = data as SleeperPlayer[];
        this.playersCache.updatedAt = new Date();
      }
    } catch (error) {
      logError(`Failed to write cache file ${filePath}`, error);
    }
  }

  private warnIfPlayersCacheIsStale(players: SleeperPlayer[]): void {
    if (!Array.isArray(players)) return;
    const newestTimestamp = getNewestCacheTimestamp(players.map((player) => player?.news_updated));
    warnIfCacheStale(this.PLAYERS_CACHE_FILE, newestTimestamp);
  }

  /**
   * Fetch one live Sleeper resource with typed error semantics.
   */
  private async fetchLiveResource<T>(
    endpoint: string,
    resource: string,
    notFoundCode?: string,
  ): Promise<T> {
    try {
      const response = await http.get(endpoint, {
        headers: { 'User-Agent': 'TIBER-Fantasy/1.0' },
      });

      if (response.status === 404 && notFoundCode) {
        throw err(notFoundCode, `${resource} not found`, { endpoint, resource }, 404);
      }
      if (response.status >= 400) {
        throw err(
          'API_ERROR',
          `Sleeper ${resource} request returned ${response.status}`,
          { endpoint, resource, status: response.status },
          502,
        );
      }
      return response.data as T;
    } catch (error: any) {
      if (error?.code === notFoundCode || error?.code === 'API_ERROR') throw error;

      const status = error?.response?.status;
      if (status === 404 && notFoundCode) {
        throw err(notFoundCode, `${resource} not found`, { endpoint, resource }, 404);
      }

      throw err(
        'API_ERROR',
        `Sleeper ${resource} request failed`,
        {
          endpoint,
          resource,
          status: status ?? null,
          original_error: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }
  }

  /**
   * Sync all NFL players from Sleeper API.
   */
  async syncPlayers(): Promise<SleeperSyncResult> {
    const startTime = new Date().toISOString();

    try {
      logInfo('Attempting live Sleeper players sync');
      const response = await http.get('/players/nfl', {
        headers: { 'User-Agent': 'OnTheClock/1.0' },
      });

      if (response.status >= 400) {
        throw err('UPSTREAM_ERROR', `Sleeper API returned ${response.status}`, { status: response.status }, 502);
      }

      const players: SleeperPlayer[] = Object.values(response.data);
      const filteredPlayers = players.filter(
        (p) => p.position && ['QB', 'RB', 'WR', 'TE'].includes(p.position),
      );

      await this.writeCache(this.PLAYERS_CACHE_FILE, filteredPlayers);

      logInfo('Live sync successful', { players_count: filteredPlayers.length });
      return {
        success: true,
        source: 'live',
        timestamp: startTime,
        players_count: filteredPlayers.length,
        projections_count: 0,
      };
    } catch (error) {
      logError('Live sync failed, falling back to cache', error);

      const cachedPlayers = await this.readCache<SleeperPlayer[]>(this.PLAYERS_CACHE_FILE);

      if (cachedPlayers) {
        this.warnIfPlayersCacheIsStale(cachedPlayers);
        logInfo('Using cached players', { players_count: cachedPlayers.length });
        return {
          success: true,
          source: 'cache',
          timestamp: startTime,
          players_count: cachedPlayers.length,
          projections_count: 0,
        };
      }

      throw err(
        'NO_DATA',
        'No cache available and live sync failed',
        { original_error: error instanceof Error ? error.message : String(error) },
        502,
      );
    }
  }

  /** Get all cached players. */
  async getPlayers(): Promise<SleeperPlayer[]> {
    if (this.playersCache.data) return this.playersCache.data;

    const players = await this.readCache<SleeperPlayer[]>(this.PLAYERS_CACHE_FILE);
    if (players) {
      this.warnIfPlayersCacheIsStale(players);
      this.playersCache.data = players;
      try {
        const stats = await fs.stat(this.PLAYERS_CACHE_FILE);
        this.playersCache.updatedAt = stats.mtime;
      } catch {}
    }
    return players || [];
  }

  /** Get player by ID. */
  async getPlayerById(playerId: string): Promise<SleeperPlayer | null> {
    if (!playerId) throw err('MISSING_PARAM', 'playerId is required', null, 400);

    const players = await this.getPlayers();
    const player = players.find((p) => p.player_id === playerId);
    if (!player) {
      throw err('PLAYER_NOT_FOUND', `Player with ID ${playerId} not found`, { playerId }, 404);
    }
    return player;
  }

  /** Search players by name. */
  async searchPlayers(query: string): Promise<SleeperPlayer[]> {
    if (!query || typeof query !== 'string') {
      throw err('MISSING_PARAM', 'Search query is required', null, 400);
    }

    const players = await this.getPlayers();
    const searchTerm = query.toLowerCase();
    return players.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(searchTerm) ||
        p.search_full_name?.toLowerCase().includes(searchTerm) ||
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm),
    );
  }

  /** Get players by position. */
  async getPlayersByPosition(position: string): Promise<SleeperPlayer[]> {
    if (!position || typeof position !== 'string') {
      throw err('MISSING_PARAM', 'Position is required', null, 400);
    }

    const validPositions = ['QB', 'RB', 'WR', 'TE'];
    const pos = position.toUpperCase();
    if (!validPositions.includes(pos)) {
      throw err(
        'INVALID_POSITION',
        'Invalid position. Must be QB, RB, WR, or TE',
        { position, validPositions },
        422,
      );
    }

    const players = await this.getPlayers();
    return players.filter((p) => p.position === pos);
  }

  /** Force refresh player cache. */
  async forceRefresh(): Promise<SleeperSyncResult> {
    try {
      await fs.unlink(this.PLAYERS_CACHE_FILE);
    } catch {}
    return this.syncPlayers();
  }

  /** Get sync status and cache information. */
  async getSyncStatus(): Promise<{
    cache_exists: boolean;
    cache_stale: boolean;
    last_sync: string | null;
    players_count: number;
  }> {
    const cacheExists = (await this.readCache(this.PLAYERS_CACHE_FILE)) !== null;
    const cacheStale = await this.isCacheStale(this.PLAYERS_CACHE_FILE);

    let lastSync = null;
    let playersCount = 0;

    if (cacheExists) {
      try {
        const stats = await fs.stat(this.PLAYERS_CACHE_FILE);
        lastSync = stats.mtime.toISOString();
        const players = await this.getPlayers();
        playersCount = players.length;
      } catch {}
    }

    return {
      cache_exists: cacheExists,
      cache_stale: cacheStale,
      last_sync: lastSync,
      players_count: playersCount,
    };
  }

  /**
   * Materialize a live, auditable league context from a league ID.
   *
   * The previous implementation accepted an already-materialized object even
   * though the public route passed a string league ID. This method now owns
   * the live assembly contract and never fabricates missing league truth.
   */
  async materializeLeagueContext(leagueId: string): Promise<SleeperLeagueContext> {
    if (!leagueId || typeof leagueId !== 'string' || !leagueId.trim()) {
      throw err('INVALID_LEAGUE_ID', 'League ID parameter is required', { leagueId }, 400);
    }

    const normalizedLeagueId = leagueId.trim();
    const leagueEndpoint = `/league/${encodeURIComponent(normalizedLeagueId)}`;
    const rostersEndpoint = `${leagueEndpoint}/rosters`;

    // A missing league is not a partial context: it is a typed 404.
    const league = await this.fetchLiveResource<any>(
      leagueEndpoint,
      'league',
      'LEAGUE_NOT_FOUND',
    );

    let week = Number(league?.settings?.leg);
    if (!Number.isInteger(week) || week < 1) {
      const nflState = await this.fetchLiveResource<any>('/state/nfl', 'NFL state');
      week = Number(nflState?.week);
    }
    if (!Number.isInteger(week) || week < 1) {
      throw err(
        'API_ERROR',
        'Sleeper did not provide a valid current matchup week',
        { leagueId: normalizedLeagueId, week },
        502,
      );
    }

    const matchupsEndpoint = `${leagueEndpoint}/matchups/${week}`;
    const fetchedAt = new Date().toISOString();

    const [rostersResult, matchupsResult] = await Promise.allSettled([
      this.fetchLiveResource<any[]>(rostersEndpoint, 'rosters'),
      this.fetchLiveResource<any[]>(matchupsEndpoint, 'matchups'),
    ]);

    const rosters = rostersResult.status === 'fulfilled' ? rostersResult.value : null;
    const matchups = matchupsResult.status === 'fulfilled' ? matchupsResult.value : null;
    const missing: string[] = [];
    if (rosters === null) missing.push('rosters');
    if (matchups === null) missing.push('matchups');

    const context: SleeperLeagueContext = {
      league_id: normalizedLeagueId,
      week,
      league,
      // Keep the legacy plural key so existing consumers do not break.
      leagues: [league],
      rosters,
      matchups,
      // Preserve raw league scoring and roster rules as canonical inputs.
      scoring_settings: league?.scoring_settings ?? {},
      roster_positions: Array.isArray(league?.roster_positions) ? league.roster_positions : [],
      settings: league?.settings ?? {},
      provenance: {
        source: 'sleeper',
        mode: 'live',
        fetched_at: fetchedAt,
        complete: missing.length === 0,
        endpoints: {
          league: leagueEndpoint,
          rosters: rostersEndpoint,
          matchups: matchupsEndpoint,
        },
      },
    };

    if (missing.length > 0) {
      const failures: Record<string, string> = {};
      if (rostersResult.status === 'rejected') {
        failures.rosters = rostersResult.reason?.message || String(rostersResult.reason);
      }
      if (matchupsResult.status === 'rejected') {
        failures.matchups = matchupsResult.reason?.message || String(matchupsResult.reason);
      }

      throw err(
        'PARTIAL_UPSTREAM',
        'Some required Sleeper league resources failed',
        { missing, failures, context },
        206,
      );
    }

    return context;
  }

  /** Get cache metadata for API responses. */
  getCacheMetadata(): { updatedAt: string | null; count: number } {
    const count = this.playersCache.data ? this.playersCache.data.length : 0;
    return {
      updatedAt: this.playersCache.updatedAt ? this.playersCache.updatedAt.toISOString() : null,
      count,
    };
  }
}

export function getPlayersCacheMeta(): { updatedAt: string | null; count: number } {
  return sleeperSyncService.getCacheMetadata();
}

export const getCacheMetadata = getPlayersCacheMeta;
export const sleeperSyncService = new SleeperSyncService();
