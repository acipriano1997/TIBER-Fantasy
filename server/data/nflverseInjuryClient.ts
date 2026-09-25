// server/data/nflverseInjuryClient.ts
//
// NEWS-001 official-report-derived injury adapter.
//
// nflverse publishes season-level injury/practice-report files sourced from
// weekly NFL injury reporting. This adapter keeps retrieval, parsing, identity
// resolution, and evidence promotion explicit and fail-closed.

import Papa from 'papaparse';
import {
  BuildNewsCheckOptions,
  InjuryState,
  NewsEvidenceEvent,
  NewsIntelligenceCheck,
  NewsSourceCheckState,
  buildNewsIntelligenceCheck,
  deriveInjuryMateriality,
} from './newsIntelligence';

export const NFLVERSE_INJURY_SOURCE_ID = 'nflverse-injuries';
export const NFLVERSE_INJURY_SCHEMA_VERSION = 'nflverse-injuries-v0';

export interface NflverseInjuryRow {
  season?: string;
  season_type?: string;
  game_type?: string;
  team?: string;
  week?: string;
  gsis_id?: string;
  position?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  report_primary_injury?: string;
  report_secondary_injury?: string;
  report_status?: string;
  practice_primary_injury?: string;
  practice_secondary_injury?: string;
  practice_status?: string;
  date_modified?: string;
}

export interface NflverseInjuryFetchResult {
  state: 'CURRENT' | 'ERROR';
  retrievedAt: string;
  sourceUpdatedAt?: string;
  rows: NflverseInjuryRow[];
  error?: string;
}

export interface GsisIdentityResolution {
  resolved: Map<string, string>;
  ambiguous: Set<string>;
  lookupStatus: 'available' | 'unavailable';
}

export interface NflverseInjuryBuildOptions extends BuildNewsCheckOptions {
  week?: number;
  identityResolution?: GsisIdentityResolution;
}

export interface NflverseInjuryClientOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/injuries';

function clean(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseIsoDate(value?: string): string | undefined {
  const normalized = clean(value);
  if (!normalized) return undefined;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function parseWeek(value?: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function normalizePracticeParticipation(
  value?: string,
): InjuryState['practiceParticipation'] {
  const normalized = clean(value)?.toLowerCase();
  if (!normalized) return null;

  if (
    normalized === 'dnp' ||
    normalized.includes('did not participate') ||
    normalized.includes('did not practice')
  ) {
    return 'DNP';
  }

  if (normalized === 'lp' || normalized.includes('limited')) return 'LP';
  if (normalized === 'fp' || normalized.includes('full')) return 'FP';
  return null;
}

export function normalizeGameDesignation(
  value?: string,
): InjuryState['gameDesignation'] {
  const normalized = clean(value)?.toLowerCase();
  if (!normalized) return null;

  if (normalized.includes('out')) return 'OUT';
  if (normalized.includes('doubtful')) return 'DOUBTFUL';
  if (normalized.includes('questionable')) return 'QUESTIONABLE';
  if (
    normalized === 'none' ||
    normalized.includes('no status') ||
    normalized.includes('not listed')
  ) {
    return 'NONE';
  }

  return null;
}

export function injuryStateFromNflverseRow(row: NflverseInjuryRow): InjuryState {
  return {
    injuryEvent: clean(row.report_primary_injury) ?? clean(row.practice_primary_injury) ?? null,
    bodyArea: clean(row.report_primary_injury) ?? clean(row.practice_primary_injury) ?? null,
    practiceParticipation: normalizePracticeParticipation(row.practice_status),
    gameDesignation: normalizeGameDesignation(row.report_status),
    availability: null,
    procedureOrImaging: null,
    expectedReturnWindow: null,
    workloadRestriction: null,
  };
}

export function latestRowsByPlayerWeek(
  rows: NflverseInjuryRow[],
): NflverseInjuryRow[] {
  const latest = new Map<string, NflverseInjuryRow>();

  for (const row of rows) {
    const gsisId = clean(row.gsis_id);
    const week = parseWeek(row.week);
    if (!gsisId || !week) continue;

    const key = `${gsisId}:${week}`;
    const existing = latest.get(key);
    if (!existing) {
      latest.set(key, row);
      continue;
    }

    const currentTime = Date.parse(clean(row.date_modified) ?? '');
    const existingTime = Date.parse(clean(existing.date_modified) ?? '');
    const safeCurrent = Number.isFinite(currentTime) ? currentTime : 0;
    const safeExisting = Number.isFinite(existingTime) ? existingTime : 0;

    if (safeCurrent >= safeExisting) latest.set(key, row);
  }

  return [...latest.values()];
}

function latestWeek(rows: NflverseInjuryRow[]): number | undefined {
  return rows.reduce<number | undefined>((max, row) => {
    const week = parseWeek(row.week);
    if (!week) return max;
    return max === undefined || week > max ? week : max;
  }, undefined);
}

function hasStructuredInjuryState(state: InjuryState): boolean {
  return Boolean(
    state.injuryEvent ||
      state.practiceParticipation ||
      state.gameDesignation ||
      state.availability,
  );
}

function injuryRowKey(row: NflverseInjuryRow): string {
  return [
    clean(row.season) ?? 'unknown-season',
    clean(row.week) ?? 'unknown-week',
    clean(row.gsis_id) ?? clean(row.full_name) ?? 'unknown-player',
  ].join(':');
}

export function nflverseInjuryRowToEvent(
  row: NflverseInjuryRow,
  canonicalPlayerId: string | undefined,
  identityState: 'resolved' | 'not_found' | 'ambiguous' | 'unavailable',
  retrievedAt: string,
): NewsEvidenceEvent {
  const injuryState = injuryStateFromNflverseRow(row);
  const sourceUpdatedAt = parseIsoDate(row.date_modified);
  const gsisId = clean(row.gsis_id);
  const team = clean(row.team);
  const hasState = hasStructuredInjuryState(injuryState);
  const identityResolved = Boolean(canonicalPlayerId) && identityState === 'resolved';

  const recordQuality =
    identityResolved && sourceUpdatedAt && hasState ? 'DECISION_GRADE' : 'QUARANTINED';

  const evidenceState =
    identityState === 'ambiguous' || identityState === 'unavailable'
      ? 'CONFLICTED'
      : hasState
        ? 'CURRENT'
        : 'MISSING';

  return {
    eventId: `nflverse-injury-${injuryRowKey(row)}-${sourceUpdatedAt ?? retrievedAt}`,
    schemaVersion: 'news-intel-v0',
    family: 'INJURY',
    playerIds: canonicalPlayerId ? [canonicalPlayerId] : undefined,
    teamIds: team ? [team] : undefined,
    headline: clean(row.full_name)
      ? `${clean(row.full_name)} injury/practice report`
      : 'NFL injury/practice report',
    summary: [
      clean(row.practice_status),
      clean(row.report_status),
      clean(row.report_primary_injury) ?? clean(row.practice_primary_injury),
    ]
      .filter(Boolean)
      .join(' · '),
    currentState: injuryState,
    direction: 'UNKNOWN',
    source: {
      sourceId: NFLVERSE_INJURY_SOURCE_ID,
      sourceClass: 'official-report-derived-dataset',
      sourceRole: 'primary-injury-state',
      sourceAncestryId: `nflverse-injury-${injuryRowKey(row)}`,
    },
    observedAt: sourceUpdatedAt,
    updatedAt: sourceUpdatedAt,
    retrievedAt,
    // knownAt is when FFCC actually learned the row, not the upstream edit time.
    knownAt: retrievedAt,
    evidenceState,
    confirmation: 'CONFIRMED_OFFICIAL',
    recordQuality,
    confidence: recordQuality === 'DECISION_GRADE' ? 0.98 : 0,
    conflictState:
      identityState === 'ambiguous'
        ? 'AMBIGUOUS_GSIS_IDENTITY'
        : identityState === 'unavailable'
          ? 'IDENTITY_LOOKUP_UNAVAILABLE'
          : identityState === 'not_found'
            ? 'GSIS_IDENTITY_NOT_FOUND'
            : undefined,
    affectedEntities: [
      ...(canonicalPlayerId ? [canonicalPlayerId] : []),
      ...(team ? [team] : []),
    ],
    dependencyTags: ['health/readiness', 'role/usage', 'opportunity/resegmentation'],
    materiality: hasState ? deriveInjuryMateriality(null, injuryState) : 'M0',
    rawTraceRef: gsisId
      ? `${NFLVERSE_INJURY_SOURCE_ID}:gsis:${gsisId}:week:${clean(row.week) ?? 'unknown'}`
      : `${NFLVERSE_INJURY_SOURCE_ID}:row:${injuryRowKey(row)}`,
    replayEligible: Boolean(sourceUpdatedAt),
  };
}

export function buildNflverseInjuryCheck(
  fetchResult: NflverseInjuryFetchResult,
  options: NflverseInjuryBuildOptions = {},
): NewsIntelligenceCheck {
  const asOf = options.asOf ?? fetchResult.retrievedAt;

  if (fetchResult.state === 'ERROR') {
    const sourceStates: NewsSourceCheckState[] = [
      {
        sourceId: NFLVERSE_INJURY_SOURCE_ID,
        state: 'ERROR',
        checkedAt: asOf,
        itemCount: 0,
      },
    ];

    return buildNewsIntelligenceCheck([], {
      ...options,
      asOf,
      sourceStates,
      laneStatuses: {
        OFF_TREND: 'MISSING',
        DEF_TREND: 'MISSING',
        INJURY: 'ERROR',
        ...options.laneStatuses,
      },
    });
  }

  const deduped = latestRowsByPlayerWeek(fetchResult.rows);
  const targetWeek = options.week ?? latestWeek(deduped);
  const rows = targetWeek
    ? deduped.filter(row => parseWeek(row.week) === targetWeek)
    : [];

  const resolution = options.identityResolution;
  const events = rows.map(row => {
    const gsisId = clean(row.gsis_id);

    if (!gsisId || !resolution) {
      return nflverseInjuryRowToEvent(
        row,
        undefined,
        resolution ? 'not_found' : 'unavailable',
        fetchResult.retrievedAt,
      );
    }

    if (resolution.lookupStatus === 'unavailable') {
      return nflverseInjuryRowToEvent(
        row,
        undefined,
        'unavailable',
        fetchResult.retrievedAt,
      );
    }

    if (resolution.ambiguous.has(gsisId)) {
      return nflverseInjuryRowToEvent(
        row,
        undefined,
        'ambiguous',
        fetchResult.retrievedAt,
      );
    }

    const canonicalId = resolution.resolved.get(gsisId);
    return nflverseInjuryRowToEvent(
      row,
      canonicalId,
      canonicalId ? 'resolved' : 'not_found',
      fetchResult.retrievedAt,
    );
  });

  const allIdentityResolved =
    events.length > 0 && events.every(event => event.recordQuality === 'DECISION_GRADE');

  return buildNewsIntelligenceCheck(events, {
    ...options,
    asOf,
    sourceStates: [
      {
        sourceId: NFLVERSE_INJURY_SOURCE_ID,
        state: 'CURRENT',
        checkedAt: asOf,
        itemCount: rows.length,
      },
      ...(options.sourceStates ?? []),
    ],
    laneStatuses: {
      OFF_TREND: 'MISSING',
      DEF_TREND: 'MISSING',
      INJURY:
        rows.length === 0
          ? 'COMPLETE'
          : allIdentityResolved
            ? 'COMPLETE'
            : 'PARTIAL',
      ...options.laneStatuses,
    },
  });
}

export class NflverseInjuryClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: NflverseInjuryClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  getSeasonUrl(season: number): string {
    return `${this.baseUrl}/injuries_${season}.csv`;
  }

  async fetchSeason(
    season: number,
    retrievedAt: string = new Date().toISOString(),
  ): Promise<NflverseInjuryFetchResult> {
    const url = this.getSeasonUrl(season);

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1',
          'user-agent': 'FFCC-News-Intelligence/NEWS-001',
        },
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
      const parsed = Papa.parse<NflverseInjuryRow>(csv, {
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
        sourceUpdatedAt: response.headers.get('last-modified') ?? undefined,
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

export const nflverseInjuryClient = new NflverseInjuryClient();
