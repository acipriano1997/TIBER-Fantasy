import Papa from "papaparse";

export type CCFNflversePosition = "QB" | "RB" | "WR" | "TE";

export interface CCFNflverseWeeklyPlayerStat {
  playerId: string;
  playerName: string;
  position: CCFNflversePosition;
  season: number;
  week: number;
  seasonType: "REG" | "POST";
  team: string | null;
  opponentTeam: string | null;

  completions: number;
  passingAttempts: number;
  passingYards: number;
  passingTouchdowns: number;
  passingInterceptions: number;
  sacksTaken: number;
  passingAirYards: number;
  passingEpa: number;
  passingCpoe: number | null;
  passingTwoPointConversions: number;

  carries: number;
  rushingYards: number;
  rushingTouchdowns: number;
  rushingFumblesLost: number;
  rushingFirstDowns: number;
  rushingEpa: number;
  rushingTwoPointConversions: number;

  receptions: number;
  targets: number;
  receivingYards: number;
  receivingTouchdowns: number;
  receivingFumblesLost: number;
  receivingAirYards: number;
  receivingYardsAfterCatch: number;
  receivingFirstDowns: number;
  receivingEpa: number;
  receivingTwoPointConversions: number;

  /**
   * Provider aggregate across all fumble-lost contexts. FFCC scoring must use
   * this field instead of reconstructing the total from rushing/receiving
   * components, which would miss sack and other turnover contexts.
   */
  fumblesLostTotal: number;
  specialTeamsTouchdowns: number;

  fantasyPoints: number | null;
  fantasyPointsPpr: number | null;
}

export interface CCFNflverseSourceProvenance {
  provider: "nflverse";
  dataset: "stats_player_week";
  license: "CC-BY-4.0";
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  /**
   * The latest release is safe for current-state inference after `knownAt`.
   * It is not a point-in-time historical snapshot. Historical certification
   * must use a CCF-archived immutable copy captured at the target as-of time.
   */
  temporalMode: "current_snapshot_only";
}

export interface CCFNflverseWeeklyPlayerStatsSnapshot {
  season: number;
  requestedWeek?: number;
  positions: CCFNflversePosition[];
  rows: CCFNflverseWeeklyPlayerStat[];
  provenance: CCFNflverseSourceProvenance;
}

export interface CCFNflverseWeeklyPlayerStatsOptions {
  season: number;
  week?: number;
  positions?: CCFNflversePosition[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class CCFNflverseSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseSourceError";
  }
}

interface RawPlayerStatRow {
  player_id?: string;
  player_display_name?: string;
  player_name?: string;
  position?: string;
  season?: string;
  week?: string;
  season_type?: string;
  team?: string;
  opponent_team?: string;
  completions?: string;
  attempts?: string;
  passing_yards?: string;
  passing_tds?: string;
  passing_interceptions?: string;
  sacks_suffered?: string;
  passing_air_yards?: string;
  passing_epa?: string;
  passing_cpoe?: string;
  passing_2pt_conversions?: string;
  carries?: string;
  rushing_yards?: string;
  rushing_tds?: string;
  rushing_fumbles_lost?: string;
  rushing_first_downs?: string;
  rushing_epa?: string;
  rushing_2pt_conversions?: string;
  receptions?: string;
  targets?: string;
  receiving_yards?: string;
  receiving_tds?: string;
  receiving_fumbles_lost?: string;
  receiving_air_yards?: string;
  receiving_yards_after_catch?: string;
  receiving_first_downs?: string;
  receiving_epa?: string;
  receiving_2pt_conversions?: string;
  fumbles_lost_total?: string;
  special_teams_tds?: string;
  fantasy_points?: string;
  fantasy_points_ppr?: string;
}

/**
 * Official box-score counting fields that FFCC depends on directly for scoring
 * or source-quality evaluation. nflverse emits these as numeric counts; blank
 * or NA values must therefore fail closed rather than be silently coerced to 0.
 */
const REQUIRED_COLUMNS = [
  "player_id",
  "position",
  "season",
  "week",
  "season_type",
  "team",
  "opponent_team",
  "completions",
  "attempts",
  "passing_yards",
  "passing_tds",
  "passing_interceptions",
  "sacks_suffered",
  "passing_2pt_conversions",
  "carries",
  "rushing_yards",
  "rushing_tds",
  "rushing_2pt_conversions",
  "receptions",
  "targets",
  "receiving_yards",
  "receiving_tds",
  "receiving_2pt_conversions",
  "fumbles_lost_total",
  "special_teams_tds",
] as const;

const DEFAULT_POSITIONS: CCFNflversePosition[] = ["QB", "RB", "WR", "TE"];

export function nflverseWeeklyPlayerStatsUrl(season: number): string {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) {
    throw new CCFNflverseSourceError("season must be an integer within [1999, 2100]");
  }
  return `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
}

function nullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numeric(
  row: RawPlayerStatRow,
  key: keyof RawPlayerStatRow,
  options: { required?: boolean; defaultValue?: number } = {},
): number {
  const raw = row[key]?.trim();
  if (raw == null || raw === "" || raw.toLowerCase() === "na") {
    if (options.required) {
      throw new CCFNflverseSourceError(`required numeric field ${String(key)} is missing`);
    }
    return options.defaultValue ?? 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CCFNflverseSourceError(`numeric field ${String(key)} is invalid: ${raw}`);
  }
  return value;
}

function requiredCount(row: RawPlayerStatRow, key: keyof RawPlayerStatRow): number {
  return numeric(row, key, { required: true });
}

function nullableNumeric(row: RawPlayerStatRow, key: keyof RawPlayerStatRow): number | null {
  const raw = row[key]?.trim();
  if (raw == null || raw === "" || raw.toLowerCase() === "na") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CCFNflverseSourceError(`numeric field ${String(key)} is invalid: ${raw}`);
  }
  return value;
}

function normalizePosition(position: string | undefined): CCFNflversePosition | null {
  const value = position?.trim().toUpperCase();
  return value === "QB" || value === "RB" || value === "WR" || value === "TE"
    ? value
    : null;
}

function normalizeSeasonType(value: string | undefined): "REG" | "POST" | null {
  const normalized = value?.trim().toUpperCase();
  return normalized === "REG" || normalized === "POST" ? normalized : null;
}

function parsePlayerStatRow(row: RawPlayerStatRow): CCFNflverseWeeklyPlayerStat | null {
  const position = normalizePosition(row.position);
  const seasonType = normalizeSeasonType(row.season_type);
  const playerId = row.player_id?.trim();
  if (!position || !seasonType || !playerId) {
    return null;
  }

  const season = requiredCount(row, "season");
  const week = requiredCount(row, "week");
  if (!Number.isInteger(season) || !Number.isInteger(week)) {
    throw new CCFNflverseSourceError(`season/week must be integers for player ${playerId}`);
  }

  return {
    playerId,
    playerName: row.player_display_name?.trim() || row.player_name?.trim() || playerId,
    position,
    season,
    week,
    seasonType,
    team: nullableText(row.team),
    opponentTeam: nullableText(row.opponent_team),
    completions: requiredCount(row, "completions"),
    passingAttempts: requiredCount(row, "attempts"),
    passingYards: requiredCount(row, "passing_yards"),
    passingTouchdowns: requiredCount(row, "passing_tds"),
    passingInterceptions: requiredCount(row, "passing_interceptions"),
    sacksTaken: requiredCount(row, "sacks_suffered"),
    passingAirYards: numeric(row, "passing_air_yards"),
    passingEpa: numeric(row, "passing_epa"),
    passingCpoe: nullableNumeric(row, "passing_cpoe"),
    passingTwoPointConversions: requiredCount(row, "passing_2pt_conversions"),
    carries: requiredCount(row, "carries"),
    rushingYards: requiredCount(row, "rushing_yards"),
    rushingTouchdowns: requiredCount(row, "rushing_tds"),
    rushingFumblesLost: numeric(row, "rushing_fumbles_lost"),
    rushingFirstDowns: numeric(row, "rushing_first_downs"),
    rushingEpa: numeric(row, "rushing_epa"),
    rushingTwoPointConversions: requiredCount(row, "rushing_2pt_conversions"),
    receptions: requiredCount(row, "receptions"),
    targets: requiredCount(row, "targets"),
    receivingYards: requiredCount(row, "receiving_yards"),
    receivingTouchdowns: requiredCount(row, "receiving_tds"),
    receivingFumblesLost: numeric(row, "receiving_fumbles_lost"),
    receivingAirYards: numeric(row, "receiving_air_yards"),
    receivingYardsAfterCatch: numeric(row, "receiving_yards_after_catch"),
    receivingFirstDowns: numeric(row, "receiving_first_downs"),
    receivingEpa: numeric(row, "receiving_epa"),
    receivingTwoPointConversions: requiredCount(row, "receiving_2pt_conversions"),
    fumblesLostTotal: requiredCount(row, "fumbles_lost_total"),
    specialTeamsTouchdowns: requiredCount(row, "special_teams_tds"),
    fantasyPoints: nullableNumeric(row, "fantasy_points"),
    fantasyPointsPpr: nullableNumeric(row, "fantasy_points_ppr"),
  };
}

export function parseNflverseWeeklyPlayerStatsCsv(
  csv: string,
  options: Pick<CCFNflverseWeeklyPlayerStatsOptions, "season" | "week" | "positions">,
): CCFNflverseWeeklyPlayerStat[] {
  const parsed = Papa.parse<RawPlayerStatRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflverseSourceError(
      `failed to parse nflverse player stats CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missingColumns.length > 0) {
    throw new CCFNflverseSourceError(
      `nflverse player stats schema missing required columns: ${missingColumns.join(", ")}`,
    );
  }

  const allowedPositions = new Set(options.positions ?? DEFAULT_POSITIONS);
  const rows: CCFNflverseWeeklyPlayerStat[] = [];

  for (const rawRow of parsed.data) {
    const row = parsePlayerStatRow(rawRow);
    if (!row) continue;
    if (row.season !== options.season) continue;
    if (row.seasonType !== "REG") continue;
    if (options.week != null && row.week !== options.week) continue;
    if (!allowedPositions.has(row.position)) continue;
    rows.push(row);
  }

  rows.sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week;
    const position = a.position.localeCompare(b.position);
    if (position !== 0) return position;
    return a.playerId.localeCompare(b.playerId);
  });

  return rows;
}

export async function fetchNflverseWeeklyPlayerStats(
  options: CCFNflverseWeeklyPlayerStatsOptions,
): Promise<CCFNflverseWeeklyPlayerStatsSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflverseWeeklyPlayerStatsUrl(options.season);

  const response = await fetchImpl(sourceUrl, {
    method: "GET",
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
      "User-Agent": "CCF/1.0 (+Fantasy Football Command Center)",
    },
    signal: options.signal,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new CCFNflverseSourceError(
      `nflverse player stats fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const rows = parseNflverseWeeklyPlayerStatsCsv(csv, options);
  const retrievedAt = now().toISOString();

  if (rows.length === 0) {
    throw new CCFNflverseSourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} QB/RB/WR/TE rows`,
    );
  }

  return {
    season: options.season,
    requestedWeek: options.week,
    positions: [...(options.positions ?? DEFAULT_POSITIONS)],
    rows,
    provenance: {
      provider: "nflverse",
      dataset: "stats_player_week",
      license: "CC-BY-4.0",
      sourceUrl,
      retrievedAt,
      knownAt: retrievedAt,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      temporalMode: "current_snapshot_only",
    },
  };
}
