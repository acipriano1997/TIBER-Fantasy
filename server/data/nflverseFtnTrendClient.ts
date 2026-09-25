// server/data/nflverseFtnTrendClient.ts
//
// NEWS-001 supplemental scheme/charting adapter.
//
// Source: FTN Data via nflverse (CC-BY-SA 4.0 attribution required).
// FTN charting is joined to nflverse play-by-play by game/play ID so team
// ownership is explicit. This source enriches measured trend evidence with
// quarterback location, motion, play action, RPO/no-huddle, box counts and
// pass-rusher/blitzer counts. It is supplemental evidence only: charting may
// arrive after games and these derived deltas are not calibrated CCF triggers.

import Papa from 'papaparse';
import {
  NewsEvidenceEvent,
  NewsIntelligenceCheck,
  buildNewsIntelligenceCheck,
  deriveTrendRegime,
} from './newsIntelligence';

export const NFLVERSE_FTN_SOURCE_ID = 'ftn-data-via-nflverse-charting';
export const NFLVERSE_PBP_JOIN_SOURCE_ID = 'nflverse-play-by-play-join';

const DEFAULT_FTN_BASE_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/ftn_charting';
const DEFAULT_PBP_BASE_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/pbp';

export interface FtnChartingRow {
  nflverse_game_id?: string;
  season?: string;
  week?: string;
  nflverse_play_id?: string;
  qb_location?: string;
  n_offense_backfield?: string;
  n_defense_box?: string;
  is_no_huddle?: string;
  is_motion?: string;
  is_play_action?: string;
  is_screen_pass?: string;
  is_rpo?: string;
  n_blitzers?: string;
  n_pass_rushers?: string;
  date_pulled?: string;
}

export interface FtnPbpJoinRow {
  game_id?: string;
  play_id?: string;
  posteam?: string;
  defteam?: string;
  qb_dropback?: string;
}

export interface JoinedFtnPlay {
  season: number;
  week: number;
  gameId: string;
  playId: string;
  posteam: string;
  defteam: string;
  qbDropback: boolean;
  charting: FtnChartingRow;
}

export interface FtnOffenseMetrics {
  underCenterRate: number | null;
  shotgunRate: number | null;
  pistolRate: number | null;
  motionRate: number | null;
  playActionRate: number | null;
  noHuddleRate: number | null;
  rpoRate: number | null;
  screenRate: number | null;
  avgBackfieldCount: number | null;
}

export interface FtnDefenseMetrics {
  avgBoxCount: number | null;
  fivePlusPassRusherRate: number | null;
  blitzerPresentRate: number | null;
  fourOrFewerRushRate: number | null;
  avgPassRushers: number | null;
}

export interface FtnMetricCoverage {
  chartedPlays: number;
  qbLocationPlays: number;
  motionPlays: number;
  noHuddlePlays: number;
  backfieldCountPlays: number;
  chartedDropbacks: number;
  playActionDropbacks: number;
  screenDropbacks: number;
  boxCountPlays: number;
  passRusherDropbacks: number;
  blitzerDropbacks: number;
}

export interface FtnTrendFetchResult {
  state: 'CURRENT' | 'PARTIAL' | 'ERROR';
  retrievedAt: string;
  chartingRows: FtnChartingRow[];
  pbpRows: FtnPbpJoinRow[];
  sourceUpdatedAt?: string;
  error?: string;
}

export interface FtnTrendClientOptions {
  fetchImpl?: typeof fetch;
  ftnBaseUrl?: string;
  pbpBaseUrl?: string;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
}

export interface BuildFtnTrendOptions {
  asOf?: string;
  targetWeek?: number;
  baselineWeeks?: number;
}

interface CachedFetch {
  expiresAt: number;
  value: FtnTrendFetchResult;
}

function clean(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toNumber(value?: string): number | null {
  const normalized = clean(value);
  if (normalized === undefined) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toBoolean(value?: string): boolean | null {
  const normalized = clean(value)?.toLowerCase();
  if (normalized === undefined) return null;
  if (normalized === 'true' || normalized === 't' || normalized === '1') return true;
  if (normalized === 'false' || normalized === 'f' || normalized === '0') return false;
  return null;
}

function round(value: number, digits: number = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function rate(values: Array<boolean | null>): number | null {
  const known = values.filter((value): value is boolean => value !== null);
  if (known.length === 0) return null;
  return round(known.filter(Boolean).length / known.length);
}

function average(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  return round(known.reduce((sum, value) => sum + value, 0) / known.length);
}

function latestWeek(rows: FtnChartingRow[]): number | undefined {
  return rows.reduce<number | undefined>((latest, row) => {
    const week = toInteger(row.week);
    if (!week || week <= 0) return latest;
    return latest === undefined || week > latest ? week : latest;
  }, undefined);
}

function maxTimestamp(values: Array<string | undefined>): string | undefined {
  let latest: number | undefined;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) continue;
    if (latest === undefined || parsed > latest) latest = parsed;
  }
  return latest === undefined ? undefined : new Date(latest).toISOString();
}

function joinKey(gameId?: string, playId?: string): string | undefined {
  const game = clean(gameId);
  const play = clean(playId);
  return game && play ? `${game}:${play}` : undefined;
}

export function joinFtnChartingToPbp(
  chartingRows: FtnChartingRow[],
  pbpRows: FtnPbpJoinRow[],
): { joined: JoinedFtnPlay[]; unmatched: number } {
  const pbpIndex = new Map<string, FtnPbpJoinRow>();

  for (const row of pbpRows) {
    const key = joinKey(row.game_id, row.play_id);
    if (key) pbpIndex.set(key, row);
  }

  const joined: JoinedFtnPlay[] = [];
  let unmatched = 0;

  for (const charting of chartingRows) {
    const key = joinKey(charting.nflverse_game_id, charting.nflverse_play_id);
    const pbp = key ? pbpIndex.get(key) : undefined;
    const season = toInteger(charting.season);
    const week = toInteger(charting.week);
    const gameId = clean(charting.nflverse_game_id);
    const playId = clean(charting.nflverse_play_id);
    const posteam = clean(pbp?.posteam);
    const defteam = clean(pbp?.defteam);

    if (!pbp || !season || !week || !gameId || !playId || !posteam || !defteam) {
      unmatched++;
      continue;
    }

    joined.push({
      season,
      week,
      gameId,
      playId,
      posteam,
      defteam,
      qbDropback: toBoolean(pbp.qb_dropback) === true,
      charting,
    });
  }

  return { joined, unmatched };
}

function offenseMetrics(rows: JoinedFtnPlay[]): {
  metrics: FtnOffenseMetrics;
  coverage: FtnMetricCoverage;
} {
  const qbLocations = rows
    .map(row => clean(row.charting.qb_location)?.toUpperCase())
    .filter((value): value is string => Boolean(value));
  const dropbacks = rows.filter(row => row.qbDropback);

  const metrics: FtnOffenseMetrics = {
    underCenterRate:
      qbLocations.length === 0
        ? null
        : round(qbLocations.filter(value => value === 'U').length / qbLocations.length),
    shotgunRate:
      qbLocations.length === 0
        ? null
        : round(qbLocations.filter(value => value === 'S').length / qbLocations.length),
    pistolRate:
      qbLocations.length === 0
        ? null
        : round(qbLocations.filter(value => value === 'P').length / qbLocations.length),
    motionRate: rate(rows.map(row => toBoolean(row.charting.is_motion))),
    playActionRate: rate(
      dropbacks.map(row => toBoolean(row.charting.is_play_action)),
    ),
    noHuddleRate: rate(rows.map(row => toBoolean(row.charting.is_no_huddle))),
    rpoRate: rate(rows.map(row => toBoolean(row.charting.is_rpo))),
    screenRate: rate(
      dropbacks.map(row => toBoolean(row.charting.is_screen_pass)),
    ),
    avgBackfieldCount: average(
      rows.map(row => toNumber(row.charting.n_offense_backfield)),
    ),
  };

  return {
    metrics,
    coverage: {
      chartedPlays: rows.length,
      qbLocationPlays: qbLocations.length,
      motionPlays: rows.filter(row => toBoolean(row.charting.is_motion) !== null).length,
      noHuddlePlays: rows.filter(row => toBoolean(row.charting.is_no_huddle) !== null).length,
      backfieldCountPlays: rows.filter(
        row => toNumber(row.charting.n_offense_backfield) !== null,
      ).length,
      chartedDropbacks: dropbacks.length,
      playActionDropbacks: dropbacks.filter(
        row => toBoolean(row.charting.is_play_action) !== null,
      ).length,
      screenDropbacks: dropbacks.filter(
        row => toBoolean(row.charting.is_screen_pass) !== null,
      ).length,
      boxCountPlays: 0,
      passRusherDropbacks: 0,
      blitzerDropbacks: 0,
    },
  };
}

function defenseMetrics(rows: JoinedFtnPlay[]): {
  metrics: FtnDefenseMetrics;
  coverage: FtnMetricCoverage;
} {
  const dropbacks = rows.filter(row => row.qbDropback);
  const passRushers = dropbacks.map(row => toNumber(row.charting.n_pass_rushers));
  const blitzers = dropbacks.map(row => toNumber(row.charting.n_blitzers));
  const knownRushers = passRushers.filter((value): value is number => value !== null);
  const knownBlitzers = blitzers.filter((value): value is number => value !== null);

  const metrics: FtnDefenseMetrics = {
    avgBoxCount: average(rows.map(row => toNumber(row.charting.n_defense_box))),
    fivePlusPassRusherRate:
      knownRushers.length === 0
        ? null
        : round(knownRushers.filter(value => value >= 5).length / knownRushers.length),
    blitzerPresentRate:
      knownBlitzers.length === 0
        ? null
        : round(knownBlitzers.filter(value => value >= 1).length / knownBlitzers.length),
    fourOrFewerRushRate:
      knownRushers.length === 0
        ? null
        : round(knownRushers.filter(value => value <= 4).length / knownRushers.length),
    avgPassRushers: average(passRushers),
  };

  return {
    metrics,
    coverage: {
      chartedPlays: rows.length,
      qbLocationPlays: 0,
      motionPlays: 0,
      noHuddlePlays: 0,
      backfieldCountPlays: 0,
      chartedDropbacks: dropbacks.length,
      playActionDropbacks: 0,
      screenDropbacks: 0,
      boxCountPlays: rows.filter(
        row => toNumber(row.charting.n_defense_box) !== null,
      ).length,
      passRusherDropbacks: knownRushers.length,
      blitzerDropbacks: knownBlitzers.length,
    },
  };
}

function numericDeltas(
  current: Record<string, number | null>,
  baseline: Record<string, number | null>,
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const key of Object.keys(current)) {
    const currentValue = current[key];
    const baselineValue = baseline[key];
    result[key] =
      currentValue === null || baselineValue === null
        ? null
        : round(currentValue - baselineValue);
  }
  return result;
}

function uniqueGameCount(rows: JoinedFtnPlay[]): number {
  return new Set(rows.map(row => row.gameId)).size;
}

function buildFtnTrendEvent(args: {
  family: 'OFF_TREND' | 'DEF_TREND';
  team: string;
  season: number;
  week: number;
  currentMetrics: FtnOffenseMetrics | FtnDefenseMetrics;
  baselineMetrics: FtnOffenseMetrics | FtnDefenseMetrics;
  coverage: FtnMetricCoverage;
  sampleGames: number;
  retrievedAt: string;
  sourceUpdatedAt?: string;
}): NewsEvidenceEvent {
  const deltas = numericDeltas(
    args.currentMetrics as unknown as Record<string, number | null>,
    args.baselineMetrics as unknown as Record<string, number | null>,
  );
  const hasDelta = Object.values(deltas).some(value => value !== null && value !== 0);
  const label = args.family === 'OFF_TREND' ? 'offensive scheme' : 'defensive front/blitz';

  return {
    eventId: `nflverse-ftn-trend:${args.family}:${args.season}:${args.team}:${args.week}`,
    schemaVersion: 'news-intel-v0',
    family: args.family,
    teamIds: [args.team],
    headline: `${args.team} measured ${label} charting update`,
    summary: hasDelta
      ? `FTN Data via nflverse charted ${label} deltas versus recent baseline`
      : `FTN Data via nflverse charted ${label} snapshot; no comparable baseline delta`,
    metric: 'ftn_charted_team_tendency',
    currentState: {
      metrics: args.currentMetrics,
      baseline: args.baselineMetrics,
      deltas,
      coverage: args.coverage,
    },
    direction: hasDelta ? 'MIXED' : 'UNCHANGED',
    source: {
      sourceId: NFLVERSE_FTN_SOURCE_ID,
      sourceClass: 'manual-play-charting-via-nflverse',
      sourceRole: 'supplemental-measured-scheme',
      sourceAncestryId: `nflverse-ftn-trend:${args.family}:${args.season}:${args.team}:${args.week}`,
    },
    updatedAt: args.sourceUpdatedAt,
    retrievedAt: args.retrievedAt,
    knownAt: args.retrievedAt,
    evidenceState: 'CURRENT',
    confirmation: 'CREDIBLE_SINGLE_SOURCE',
    recordQuality: 'NORMALIZED',
    sampleGames: args.sampleGames,
    trendRegime: deriveTrendRegime(args.sampleGames),
    affectedEntities: [args.team],
    dependencyTags: [
      args.family === 'OFF_TREND'
        ? 'scheme/offense-charted'
        : 'scheme/defense-charted',
      'matchup/environment',
    ],
    // No materiality promotion until historical calibration establishes useful
    // thresholds and incremental predictive value.
    materiality: 'M0',
    rawTraceRef: `FTN Data via nflverse:${args.season}:week:${args.week}:team:${args.team}`,
    replayEligible: true,
  };
}

export function buildFtnTrendCheck(
  fetchResult: FtnTrendFetchResult,
  season: number,
  options: BuildFtnTrendOptions = {},
): NewsIntelligenceCheck {
  const asOf = options.asOf ?? fetchResult.retrievedAt;

  if (fetchResult.state === 'ERROR') {
    return buildNewsIntelligenceCheck([], {
      asOf,
      sourceStates: [
        {
          sourceId: NFLVERSE_FTN_SOURCE_ID,
          state: 'ERROR',
          checkedAt: fetchResult.retrievedAt,
          itemCount: 0,
        },
      ],
      laneStatuses: {
        OFF_TREND: 'ERROR',
        DEF_TREND: 'ERROR',
        INJURY: 'MISSING',
      },
    });
  }

  const seasonRows = fetchResult.chartingRows.filter(
    row => toInteger(row.season) === season,
  );
  const targetWeek = options.targetWeek ?? latestWeek(seasonRows);

  if (!targetWeek) {
    return buildNewsIntelligenceCheck([], {
      asOf,
      sourceStates: [
        {
          sourceId: NFLVERSE_FTN_SOURCE_ID,
          state: fetchResult.state,
          checkedAt: fetchResult.retrievedAt,
          itemCount: 0,
        },
      ],
      laneStatuses: {
        OFF_TREND: 'MISSING',
        DEF_TREND: 'MISSING',
        INJURY: 'MISSING',
      },
    });
  }

  const relevantCharting = seasonRows.filter(
    row => (toInteger(row.week) ?? 0) <= targetWeek,
  );
  const { joined, unmatched } = joinFtnChartingToPbp(
    relevantCharting,
    fetchResult.pbpRows,
  );
  const targetRows = joined.filter(row => row.week === targetWeek);

  if (targetRows.length === 0) {
    return buildNewsIntelligenceCheck([], {
      asOf,
      sourceStates: [
        {
          sourceId: NFLVERSE_FTN_SOURCE_ID,
          state: 'PARTIAL',
          checkedAt: fetchResult.retrievedAt,
          itemCount: 0,
        },
      ],
      laneStatuses: {
        OFF_TREND: 'MISSING',
        DEF_TREND: 'MISSING',
        INJURY: 'MISSING',
      },
    });
  }

  const baselineWeeks = Math.max(1, options.baselineWeeks ?? 2);
  const minimumBaselineWeek = Math.max(1, targetWeek - baselineWeeks);
  const teams = new Set<string>();
  targetRows.forEach(row => {
    teams.add(row.posteam);
    teams.add(row.defteam);
  });

  const events: NewsEvidenceEvent[] = [];

  for (const team of teams) {
    const currentOffenseRows = targetRows.filter(row => row.posteam === team);
    const priorOffenseRows = joined.filter(
      row =>
        row.posteam === team &&
        row.week >= minimumBaselineWeek &&
        row.week < targetWeek,
    );

    if (currentOffenseRows.length > 0) {
      const current = offenseMetrics(currentOffenseRows);
      const baseline = offenseMetrics(priorOffenseRows);
      events.push(
        buildFtnTrendEvent({
          family: 'OFF_TREND',
          team,
          season,
          week: targetWeek,
          currentMetrics: current.metrics,
          baselineMetrics: baseline.metrics,
          coverage: current.coverage,
          sampleGames: uniqueGameCount([...priorOffenseRows, ...currentOffenseRows]),
          retrievedAt: fetchResult.retrievedAt,
          sourceUpdatedAt: fetchResult.sourceUpdatedAt,
        }),
      );
    }

    const currentDefenseRows = targetRows.filter(row => row.defteam === team);
    const priorDefenseRows = joined.filter(
      row =>
        row.defteam === team &&
        row.week >= minimumBaselineWeek &&
        row.week < targetWeek,
    );

    if (currentDefenseRows.length > 0) {
      const current = defenseMetrics(currentDefenseRows);
      const baseline = defenseMetrics(priorDefenseRows);
      events.push(
        buildFtnTrendEvent({
          family: 'DEF_TREND',
          team,
          season,
          week: targetWeek,
          currentMetrics: current.metrics,
          baselineMetrics: baseline.metrics,
          coverage: current.coverage,
          sampleGames: uniqueGameCount([...priorDefenseRows, ...currentDefenseRows]),
          retrievedAt: fetchResult.retrievedAt,
          sourceUpdatedAt: fetchResult.sourceUpdatedAt,
        }),
      );
    }
  }

  return buildNewsIntelligenceCheck(events, {
    asOf,
    sourceStates: [
      {
        sourceId: NFLVERSE_FTN_SOURCE_ID,
        state: fetchResult.state === 'PARTIAL' || unmatched > 0 ? 'PARTIAL' : 'CURRENT',
        checkedAt: asOf,
        itemCount: targetRows.length,
      },
      {
        sourceId: NFLVERSE_PBP_JOIN_SOURCE_ID,
        state: unmatched > 0 ? 'PARTIAL' : 'CURRENT',
        checkedAt: asOf,
        itemCount: targetRows.length,
      },
    ],
    // FTN charting is intentionally supplemental and can lag game completion.
    // It never certifies full trend-lane completeness on its own.
    laneStatuses: {
      OFF_TREND: 'PARTIAL',
      DEF_TREND: 'PARTIAL',
      INJURY: 'MISSING',
    },
  });
}

export class NflverseFtnTrendClient {
  private readonly fetchImpl: typeof fetch;
  private readonly ftnBaseUrl: string;
  private readonly pbpBaseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly cache = new Map<number, CachedFetch>();

  constructor(options: FtnTrendClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.ftnBaseUrl = options.ftnBaseUrl ?? DEFAULT_FTN_BASE_URL;
    this.pbpBaseUrl = options.pbpBaseUrl ?? DEFAULT_PBP_BASE_URL;
    this.cacheTtlMs = options.cacheTtlMs ?? 6 * 60 * 60 * 1000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
  }

  getFtnSeasonUrl(season: number): string {
    return `${this.ftnBaseUrl}/ftn_charting_${season}.csv`;
  }

  getPbpSeasonUrl(season: number): string {
    return `${this.pbpBaseUrl}/play_by_play_${season}.csv`;
  }

  async fetchSeason(
    season: number,
    retrievedAt: string = new Date().toISOString(),
    forceRefresh: boolean = false,
  ): Promise<FtnTrendFetchResult> {
    const now = Date.parse(retrievedAt);
    const cached = this.cache.get(season);
    if (
      !forceRefresh &&
      cached &&
      Number.isFinite(now) &&
      cached.expiresAt > now
    ) {
      return cached.value;
    }

    const ftnUrl = this.getFtnSeasonUrl(season);
    const pbpUrl = this.getPbpSeasonUrl(season);

    try {
      const [ftnResponse, pbpResponse] = await Promise.all([
        this.fetchImpl(ftnUrl, {
          headers: {
            accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1',
            'user-agent': 'FFCC-News-Intelligence/NEWS-001',
          },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        }),
        this.fetchImpl(pbpUrl, {
          headers: {
            accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1',
            'user-agent': 'FFCC-News-Intelligence/NEWS-001',
          },
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        }),
      ]);

      if (!ftnResponse.ok || !pbpResponse.ok) {
        return {
          state: 'ERROR',
          retrievedAt,
          chartingRows: [],
          pbpRows: [],
          error: [
            !ftnResponse.ok ? `FTN HTTP ${ftnResponse.status}` : null,
            !pbpResponse.ok ? `PBP HTTP ${pbpResponse.status}` : null,
          ]
            .filter(Boolean)
            .join('; '),
        };
      }

      const [ftnCsv, pbpCsv] = await Promise.all([
        ftnResponse.text(),
        pbpResponse.text(),
      ]);
      const charting = Papa.parse<FtnChartingRow>(ftnCsv, {
        header: true,
        skipEmptyLines: true,
      });
      const pbp = Papa.parse<FtnPbpJoinRow>(pbpCsv, {
        header: true,
        skipEmptyLines: true,
      });

      if (
        (charting.errors.length > 0 && charting.data.length === 0) ||
        (pbp.errors.length > 0 && pbp.data.length === 0)
      ) {
        return {
          state: 'ERROR',
          retrievedAt,
          chartingRows: [],
          pbpRows: [],
          error: [...charting.errors, ...pbp.errors]
            .map(error => error.message)
            .join('; '),
        };
      }

      const sourceUpdatedAt = maxTimestamp([
        ftnResponse.headers.get('last-modified') ?? undefined,
        pbpResponse.headers.get('last-modified') ?? undefined,
        ...charting.data.map(row => row.date_pulled),
      ]);

      const value: FtnTrendFetchResult = {
        state:
          charting.errors.length > 0 || pbp.errors.length > 0
            ? 'PARTIAL'
            : 'CURRENT',
        retrievedAt,
        sourceUpdatedAt,
        chartingRows: charting.data,
        pbpRows: pbp.data,
      };

      if (Number.isFinite(now)) {
        this.cache.set(season, {
          expiresAt: now + this.cacheTtlMs,
          value,
        });
      }

      return value;
    } catch (error) {
      return {
        state: 'ERROR',
        retrievedAt,
        chartingRows: [],
        pbpRows: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const nflverseFtnTrendClient = new NflverseFtnTrendClient();
