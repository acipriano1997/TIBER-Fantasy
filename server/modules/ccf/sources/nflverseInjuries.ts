import Papa from "papaparse";

export type CCFNflverseInjuryPosition = "QB" | "RB" | "WR" | "TE";

export interface CCFNflverseInjuryReportRow {
  season: number;
  week: number;
  seasonType: "REG" | "POST";
  team: string;
  playerId: string;
  playerName: string;
  position: string | null;
  reportPrimaryInjury: string | null;
  reportSecondaryInjury: string | null;
  reportStatus: string | null;
  practicePrimaryInjury: string | null;
  practiceSecondaryInjury: string | null;
  practiceStatus: string | null;
  /**
   * Timestamp supplied by the upstream injury dataset. It is preserved as
   * evidence for later temporal audit, but is NOT automatically promoted to
   * CCF knownAt. CCF knownAt remains the actual retrieval time unless an
   * archived point-in-time binding is separately certified.
   */
  upstreamDateModified: string | null;
}

export interface CCFNflverseInjurySourceProvenance {
  provider: "nflverse";
  dataset: "injuries";
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  licenseStatus: "candidate_review_required";
  licenseRef: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
  availability: "historical_through_2024";
  temporalMode: "current_snapshot_only";
}

export interface CCFNflverseInjurySnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflverseInjuryReportRow[];
  provenance: CCFNflverseInjurySourceProvenance;
}

export interface CCFNflverseInjuryOptions {
  season: number;
  week?: number;
  positions?: CCFNflverseInjuryPosition[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class CCFNflverseInjurySourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseInjurySourceError";
  }
}

interface RawInjuryRow {
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

const REQUIRED_COLUMNS = [
  "season",
  "team",
  "week",
  "gsis_id",
  "report_status",
  "practice_status",
  "date_modified",
] as const;

const DEFAULT_POSITIONS: CCFNflverseInjuryPosition[] = ["QB", "RB", "WR", "TE"];
const NFLVERSE_INJURY_FIRST_SEASON = 2009;
const NFLVERSE_INJURY_LAST_AVAILABLE_SEASON = 2024;

export function nflverseInjuriesUrl(season: number): string {
  if (!Number.isInteger(season) || season < NFLVERSE_INJURY_FIRST_SEASON || season > 2100) {
    throw new CCFNflverseInjurySourceError("season must be an integer within [2009, 2100]");
  }
  if (season > NFLVERSE_INJURY_LAST_AVAILABLE_SEASON) {
    throw new CCFNflverseInjurySourceError(
      `nflverse injury coverage is unavailable after ${NFLVERSE_INJURY_LAST_AVAILABLE_SEASON}; upstream documents that the injury data source died after the 2024 season`,
    );
  }
  return `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
}

function nullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.toLowerCase() === "na") return null;
  return normalized;
}

function requiredInteger(row: RawInjuryRow, key: "season" | "week"): number {
  const raw = row[key]?.trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value)) {
    throw new CCFNflverseInjurySourceError(`required integer field ${key} is invalid: ${raw ?? "missing"}`);
  }
  return value;
}

function normalizeSeasonType(row: RawInjuryRow): "REG" | "POST" | null {
  const raw = (row.season_type ?? row.game_type)?.trim().toUpperCase();
  return raw === "REG" || raw === "POST" ? raw : null;
}

function normalizePlayerName(row: RawInjuryRow, playerId: string): string {
  const full = nullableText(row.full_name);
  if (full) return full;
  const composite = [nullableText(row.first_name), nullableText(row.last_name)]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .trim();
  return composite || playerId;
}

function parseInjuryRow(row: RawInjuryRow): CCFNflverseInjuryReportRow | null {
  const playerId = nullableText(row.gsis_id);
  const team = nullableText(row.team);
  const seasonType = normalizeSeasonType(row);
  if (!playerId || !team || !seasonType) return null;

  return {
    season: requiredInteger(row, "season"),
    week: requiredInteger(row, "week"),
    seasonType,
    team,
    playerId,
    playerName: normalizePlayerName(row, playerId),
    position: nullableText(row.position)?.toUpperCase() ?? null,
    reportPrimaryInjury: nullableText(row.report_primary_injury),
    reportSecondaryInjury: nullableText(row.report_secondary_injury),
    reportStatus: nullableText(row.report_status),
    practicePrimaryInjury: nullableText(row.practice_primary_injury),
    practiceSecondaryInjury: nullableText(row.practice_secondary_injury),
    practiceStatus: nullableText(row.practice_status),
    upstreamDateModified: nullableText(row.date_modified),
  };
}

export function parseNflverseInjuriesCsv(
  csv: string,
  options: Pick<CCFNflverseInjuryOptions, "season" | "week" | "positions">,
): CCFNflverseInjuryReportRow[] {
  const parsed = Papa.parse<RawInjuryRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflverseInjurySourceError(
      `failed to parse nflverse injuries CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missing: string[] = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (!fields.has("season_type") && !fields.has("game_type")) {
    missing.push("season_type|game_type");
  }
  if (missing.length > 0) {
    throw new CCFNflverseInjurySourceError(
      `nflverse injury schema missing required columns: ${missing.join(", ")}`,
    );
  }

  const allowedPositions = new Set(options.positions ?? DEFAULT_POSITIONS);
  const rows: CCFNflverseInjuryReportRow[] = [];
  for (const raw of parsed.data) {
    const row = parseInjuryRow(raw);
    if (!row) continue;
    if (row.season !== options.season || row.seasonType !== "REG") continue;
    if (options.week != null && row.week !== options.week) continue;
    if (row.position && !allowedPositions.has(row.position as CCFNflverseInjuryPosition)) continue;
    rows.push(row);
  }

  rows.sort((left, right) => {
    if (left.week !== right.week) return left.week - right.week;
    const team = left.team.localeCompare(right.team);
    return team !== 0 ? team : left.playerId.localeCompare(right.playerId);
  });
  return rows;
}

export async function fetchNflverseInjuries(
  options: CCFNflverseInjuryOptions,
): Promise<CCFNflverseInjurySnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflverseInjuriesUrl(options.season);
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
    throw new CCFNflverseInjurySourceError(
      `nflverse injury fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const rows = parseNflverseInjuriesCsv(csv, options);
  const retrievedAt = now().toISOString();
  if (rows.length === 0) {
    throw new CCFNflverseInjurySourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} injury rows`,
    );
  }

  return {
    season: options.season,
    requestedWeek: options.week,
    rows,
    provenance: {
      provider: "nflverse",
      dataset: "injuries",
      sourceUrl,
      retrievedAt,
      knownAt: retrievedAt,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      licenseStatus: "candidate_review_required",
      licenseRef: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
      availability: "historical_through_2024",
      temporalMode: "current_snapshot_only",
    },
  };
}
