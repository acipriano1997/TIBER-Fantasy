// server/data/nflverseTeamTrendClient.ts
//
// NEWS-001 measured team-trend adapter built from nflverse weekly team stats.
// These metrics describe observed offensive/defensive outcomes and tendencies.
// They do NOT claim live personnel, motion, blitz, or coverage-shell knowledge.

import Papa from 'papaparse';
import {
  NewsEvidenceEvent,
  NewsIntelligenceCheck,
  buildNewsIntelligenceCheck,
  deriveTrendRegime,
} from './newsIntelligence';

export const NFLVERSE_TEAM_STATS_SOURCE_ID = 'nflverse-team-stats';

const DEFAULT_BASE_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/stats_team';

export interface NflverseTeamStatRow {
  season?: string;
  week?: string;
  team?: string;
  season_type?: string;
  game_id?: string;
  opponent_team?: string;
  attempts?: string;
  sacks_suffered?: string;
  carries?: string;
  passing_epa?: string;
  rushing_epa?: string;
  passing_20?: string;
  rushing_12?: string;
}

export interface TeamTrendMetrics {
  playsProxy: number | null;
  dropbackRateProxy: number | null;
  passingEpaPerDropback: number | null;
  rushingEpaPerCarry: number | null;
  explosivePassRate20: number | null;
  explosiveRushRate12: number | null;
  sackRateAllowed: number | null;
}

export interface DefensiveTrendMetrics {
  playsFacedProxy: number | null;
  opponentDropbackRateProxy: number | null;
  passingEpaAllowedPerDropback: number | null;
  rushingEpaAllowedPerCarry: number | null;
  explosivePassRateAllowed20: number | null;
  explosiveRushRateAllowed12: number | null;
  sackRateGenerated: number | null;
}

export interface TeamTrendDelta {
  metric: keyof TeamTrendMetrics | keyof DefensiveTrendMetrics;
  current: number;
  baseline: number;
  delta: number;
}

export interface NflverseTeamTrendFetchResult {
  state: 'CURRENT' | 'ERROR';
  retrievedAt: string;
  rows: NflverseTeamStatRow[];
  sourceUpdatedAt?: string;
  error?: string;
}

export interface NflverseTeamTrendClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export interface BuildTeamTrendOptions {
  asOf?: string;
  baselineGames?: number;
  targetWeek?: number;
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

function toWeek(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseTimestamp(value?: string | null): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function round(value: number, digits: number = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function offenseMetricsFromTeamRow(
  row: NflverseTeamStatRow,
): TeamTrendMetrics {
  const attempts = toNumber(row.attempts);
  const sacks = toNumber(row.sacks_suffered);
  const carries = toNumber(row.carries);
  const passingEpa = toNumber(row.passing_epa);
  const rushingEpa = toNumber(row.rushing_epa);
  const passing20 = toNumber(row.passing_20);
  const rushing12 = toNumber(row.rushing_12);

  const dropbacks =
    attempts === null && sacks === null
      ? null
      : (attempts ?? 0) + (sacks ?? 0);
  const plays =
    dropbacks === null && carries === null
      ? null
      : (dropbacks ?? 0) + (carries ?? 0);

  return {
    playsProxy: plays,
    dropbackRateProxy: safeDivide(dropbacks, plays),
    passingEpaPerDropback: safeDivide(passingEpa, dropbacks),
    rushingEpaPerCarry: safeDivide(rushingEpa, carries),
    explosivePassRate20: safeDivide(passing20, attempts),
    explosiveRushRate12: safeDivide(rushing12, carries),
    sackRateAllowed: safeDivide(sacks, dropbacks),
  };
}

export function defenseMetricsFromOpponentRow(
  opponentOffense: NflverseTeamStatRow,
): DefensiveTrendMetrics {
  const offense = offenseMetricsFromTeamRow(opponentOffense);

  return {
    playsFacedProxy: offense.playsProxy,
    opponentDropbackRateProxy: offense.dropbackRateProxy,
    passingEpaAllowedPerDropback: offense.passingEpaPerDropback,
    rushingEpaAllowedPerCarry: offense.rushingEpaPerCarry,
    explosivePassRateAllowed20: offense.explosivePassRate20,
    explosiveRushRateAllowed12: offense.explosiveRushRate12,
    sackRateGenerated: offense.sackRateAllowed,
  };
}

function averageMetric<T extends object>(
  snapshots: T[],
  metric: keyof T,
): number | null {
  const values = snapshots
    .map(snapshot => snapshot[metric])
    .filter((value): value is T[keyof T] & number =>
      typeof value === 'number' && Number.isFinite(value),
    ) as number[];

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const OFFENSE_THRESHOLDS: Partial<Record<keyof TeamTrendMetrics, number>> = {
  playsProxy: 8,
  dropbackRateProxy: 0.08,
  passingEpaPerDropback: 0.1,
  rushingEpaPerCarry: 0.1,
  explosivePassRate20: 0.05,
  explosiveRushRate12: 0.05,
  sackRateAllowed: 0.04,
};

const DEFENSE_THRESHOLDS: Partial<Record<keyof DefensiveTrendMetrics, number>> = {
  playsFacedProxy: 8,
  opponentDropbackRateProxy: 0.08,
  passingEpaAllowedPerDropback: 0.1,
  rushingEpaAllowedPerCarry: 0.1,
  explosivePassRateAllowed20: 0.05,
  explosiveRushRateAllowed12: 0.05,
  sackRateGenerated: 0.04,
};

function computeDeltas<T extends object>(
  current: T,
  baselineSnapshots: T[],
  thresholds: Partial<Record<keyof T, number>>,
): TeamTrendDelta[] {
  const deltas: TeamTrendDelta[] = [];

  for (const metric of Object.keys(thresholds) as Array<keyof T>) {
    const currentValue = current[metric];
    const baseline = averageMetric(baselineSnapshots, metric);
    const threshold = thresholds[metric];

    if (
      currentValue === null ||
      baseline === null ||
      threshold === undefined
    ) {
      continue;
    }

    const delta = currentValue - baseline;
    if (Math.abs(delta) < threshold) continue;

    deltas.push({
      metric: String(metric) as TeamTrendDelta['metric'],
      current: round(currentValue),
      baseline: round(baseline),
      delta: round(delta),
    });
  }

  return deltas;
}

function rowsByTeam(rows: NflverseTeamStatRow[]): Map<string, NflverseTeamStatRow[]> {
  const grouped = new Map<string, NflverseTeamStatRow[]>();

  for (const row of rows) {
    const team = clean(row.team);
    const week = toWeek(row.week);
    if (!team || !week) continue;

    const list = grouped.get(team) ?? [];
    list.push(row);
    grouped.set(team, list);
  }

  for (const [team, teamRows] of Array.from(grouped.entries())) {
    grouped.set(
      team,
      [...teamRows].sort((a, b) => (toWeek(a.week) ?? 0) - (toWeek(b.week) ?? 0)),
    );
  }

  return grouped;
}

function opponentRowIndex(
  rows: NflverseTeamStatRow[],
): Map<string, NflverseTeamStatRow> {
  const index = new Map<string, NflverseTeamStatRow>();

  for (const row of rows) {
    const gameId = clean(row.game_id);
    const team = clean(row.team);
    if (!gameId || !team) continue;
    index.set(`${gameId}:${team}`, row);
  }

  return index;
}

function latestWeek(rows: NflverseTeamStatRow[]): number | undefined {
  return rows.reduce<number | undefined>((max, row) => {
    const week = toWeek(row.week);
    if (!week) return max;
    return max === undefined || week > max ? week : max;
  }, undefined);
}


function buildTrendEvent(args: {
  family: 'OFF_TREND' | 'DEF_TREND';
  team: string;
  season: number;
  week: number;
  sampleGames: number;
  currentState: TeamTrendMetrics | DefensiveTrendMetrics;
  deltas: TeamTrendDelta[];
  retrievedAt: string;
  sourceUpdatedAt?: string;
}): NewsEvidenceEvent {
  const {
    family,
    team,
    season,
    week,
    sampleGames,
    currentState,
    deltas,
    retrievedAt,
    sourceUpdatedAt,
  } = args;
  const label = family === 'OFF_TREND' ? 'offensive' : 'defensive';

  return {
    eventId: `nflverse-team-trend:${family}:${season}:${team}:${week}`,
    schemaVersion: 'news-intel-v0',
    family,
    teamIds: [team],
    headline: `${team} measured ${label} trend update`,
    summary:
      deltas.length > 0
        ? deltas
            .map(delta => `${delta.metric} ${delta.delta >= 0 ? '+' : ''}${delta.delta}`)
            .join(' · ')
        : `No threshold-crossing measured ${label} trend`,
    metric: 'nflverse_weekly_team_trend',
    currentState: {
      metrics: currentState,
      deltas,
    },
    direction:
      deltas.length === 0
        ? 'UNCHANGED'
        : deltas.every(delta => delta.delta >= 0)
          ? 'UP'
          : deltas.every(delta => delta.delta <= 0)
            ? 'DOWN'
            : 'MIXED',
    source: {
      sourceId: NFLVERSE_TEAM_STATS_SOURCE_ID,
      sourceClass: 'measured-team-stats-dataset',
      sourceRole: 'primary-measured-team-outcomes',
      sourceAncestryId: `nflverse-team-trend:${family}:${season}:${team}:${week}`,
    },
    updatedAt: sourceUpdatedAt,
    retrievedAt,
    knownAt: retrievedAt,
    evidenceState: 'CURRENT',
    confirmation: 'CREDIBLE_SINGLE_SOURCE',
    // Derived trend interpretation is intentionally not decision-grade yet.
    // Raw measurements are strong; the thresholds/regime interpretation still
    // requires calibration/backtesting before it may trigger CCF directly.
    recordQuality: 'NORMALIZED',
    sampleGames,
    trendRegime: deriveTrendRegime(sampleGames),
    affectedEntities: [team],
    dependencyTags: [
      family === 'OFF_TREND' ? 'scheme/offense-measured' : 'scheme/defense-measured',
      'matchup/environment',
    ],
    materiality: deltas.length > 0 ? 'M1' : 'M0',
    rawTraceRef: `${NFLVERSE_TEAM_STATS_SOURCE_ID}:${season}:week:${week}:team:${team}`,
    replayEligible: true,
  };
}

export function buildNflverseTeamTrendCheck(
  fetchResult: NflverseTeamTrendFetchResult,
  season: number,
  options: BuildTeamTrendOptions = {},
): NewsIntelligenceCheck {
  const asOf = options.asOf ?? fetchResult.retrievedAt;

  if (fetchResult.state === 'ERROR') {
    return buildNewsIntelligenceCheck([], {
      asOf,
      sourceStates: [
        {
          sourceId: NFLVERSE_TEAM_STATS_SOURCE_ID,
          state: 'ERROR',
          checkedAt: asOf,
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

  const seasonRows = fetchResult.rows.filter(
    row => Number(row.season) === season && clean(row.season_type) !== 'POST',
  );
  const targetWeek = options.targetWeek ?? latestWeek(seasonRows);
  const baselineGames = Math.max(1, options.baselineGames ?? 2);

  if (!targetWeek) {
    return buildNewsIntelligenceCheck([], {
      asOf,
      sourceStates: [
        {
          sourceId: NFLVERSE_TEAM_STATS_SOURCE_ID,
          state: 'CURRENT',
          checkedAt: asOf,
          itemCount: 0,
        },
      ],
      laneStatuses: {
        OFF_TREND: 'COMPLETE',
        DEF_TREND: 'COMPLETE',
        INJURY: 'MISSING',
      },
    });
  }

  const grouped = rowsByTeam(seasonRows);
  const opponentIndex = opponentRowIndex(seasonRows);
  const events: NewsEvidenceEvent[] = [];
  let missingOpponentPairs = 0;

  for (const [team, teamRows] of Array.from(grouped.entries())) {
    const currentRow = teamRows.find(row => toWeek(row.week) === targetWeek);
    if (!currentRow) continue;

    const priorRows = teamRows
      .filter(row => (toWeek(row.week) ?? 0) < targetWeek)
      .slice(-baselineGames);

    const currentOffense = offenseMetricsFromTeamRow(currentRow);
    const baselineOffense = priorRows.map(offenseMetricsFromTeamRow);
    const offenseDeltas = computeDeltas(
      currentOffense,
      baselineOffense,
      OFFENSE_THRESHOLDS,
    );
    const offenseSample = priorRows.length + 1;

    events.push(
      buildTrendEvent({
        family: 'OFF_TREND',
        team,
        season,
        week: targetWeek,
        sampleGames: offenseSample,
        currentState: currentOffense,
        deltas: offenseDeltas,
        retrievedAt: fetchResult.retrievedAt,
        sourceUpdatedAt: fetchResult.sourceUpdatedAt,
      }),
    );

    const gameId = clean(currentRow.game_id);
    const opponent = clean(currentRow.opponent_team);
    const currentOpponentRow =
      gameId && opponent ? opponentIndex.get(`${gameId}:${opponent}`) : undefined;

    const baselineDefenseRows = priorRows
      .map(row => {
        const priorGameId = clean(row.game_id);
        const priorOpponent = clean(row.opponent_team);
        return priorGameId && priorOpponent
          ? opponentIndex.get(`${priorGameId}:${priorOpponent}`)
          : undefined;
      })
      .filter((row): row is NflverseTeamStatRow => Boolean(row));

    if (!currentOpponentRow) {
      missingOpponentPairs++;
      continue;
    }

    const currentDefense = defenseMetricsFromOpponentRow(currentOpponentRow);
    const baselineDefense = baselineDefenseRows.map(defenseMetricsFromOpponentRow);
    const defenseDeltas = computeDeltas(
      currentDefense,
      baselineDefense,
      DEFENSE_THRESHOLDS,
    );

    events.push(
      buildTrendEvent({
        family: 'DEF_TREND',
        team,
        season,
        week: targetWeek,
        sampleGames: baselineDefenseRows.length + 1,
        currentState: currentDefense,
        deltas: defenseDeltas,
        retrievedAt: fetchResult.retrievedAt,
        sourceUpdatedAt: fetchResult.sourceUpdatedAt,
      }),
    );
  }

  const latestWeekRows = seasonRows.filter(row => toWeek(row.week) === targetWeek);
  const sourceState =
    latestWeekRows.length === 0
      ? 'CURRENT'
      : missingOpponentPairs > 0
        ? 'PARTIAL'
        : 'CURRENT';

  // Current-week nflverse stats only cover completed games and do not carry a
  // schedule-completeness proof. Keep the lanes PARTIAL until a separate
  // schedule boundary can certify the week is complete.
  return buildNewsIntelligenceCheck(events, {
    asOf,
    sourceStates: [
      {
        sourceId: NFLVERSE_TEAM_STATS_SOURCE_ID,
        state: sourceState,
        checkedAt: asOf,
        itemCount: latestWeekRows.length,
      },
    ],
    laneStatuses: {
      OFF_TREND: 'PARTIAL',
      DEF_TREND: 'PARTIAL',
      INJURY: 'MISSING',
    },
  });
}

export class NflverseTeamTrendClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: NflverseTeamTrendClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  getSeasonUrl(season: number): string {
    return `${this.baseUrl}/stats_team_week_${season}.csv`;
  }

  async fetchSeason(
    season: number,
    retrievedAt: string = new Date().toISOString(),
  ): Promise<NflverseTeamTrendFetchResult> {
    const url = this.getSeasonUrl(season);

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1',
          'user-agent': 'FFCC-News-Intelligence/NEWS-001',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          state: 'ERROR',
          retrievedAt,
          rows: [],
          error: `HTTP ${response.status} while fetching ${url}`,
        };
      }

      const csv = await response.text();
      const parsed = Papa.parse<NflverseTeamStatRow>(csv, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        return {
          state: 'ERROR',
          retrievedAt,
          rows: [],
          error: parsed.errors.map(error => error.message).join('; '),
        };
      }

      return {
        state: 'CURRENT',
        retrievedAt,
        sourceUpdatedAt: parseTimestamp(response.headers.get('last-modified')),
        rows: parsed.data,
      };
    } catch (error) {
      return {
        state: 'ERROR',
        retrievedAt,
        rows: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const nflverseTeamTrendClient = new NflverseTeamTrendClient();
