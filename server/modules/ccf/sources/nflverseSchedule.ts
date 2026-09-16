import Papa from "papaparse";

export type CCFNflverseGameType = "REG" | "WC" | "DIV" | "CON" | "SB";

export interface CCFNflverseScheduleGame {
  gameId: string;
  season: number;
  gameType: CCFNflverseGameType;
  week: number;
  gameday: string;
  gametimeEt: string;
  kickoffTimeZone: "America/New_York";
  kickoffAt: string;
  awayTeam: string;
  homeTeam: string;
}

export interface CCFNflverseScheduleOptions {
  season: number;
  week?: number;
  gameTypes?: CCFNflverseGameType[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface CCFNflverseScheduleProvenance {
  provider: "nflverse";
  dataset: "schedules";
  license: "CC-BY-4.0";
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  temporalMode: "current_snapshot_only";
  permissionState: "unreviewed";
}

export interface CCFNflverseScheduleSnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflverseScheduleGame[];
  provenance: CCFNflverseScheduleProvenance;
}

export class CCFNflverseScheduleSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseScheduleSourceError";
  }
}

interface RawScheduleRow {
  game_id?: string;
  season?: string;
  game_type?: string;
  week?: string;
  gameday?: string;
  gametime?: string;
  away_team?: string;
  home_team?: string;
}

const REQUIRED_COLUMNS = [
  "game_id",
  "season",
  "game_type",
  "week",
  "gameday",
  "gametime",
  "away_team",
  "home_team",
] as const;

const DEFAULT_GAME_TYPES: CCFNflverseGameType[] = ["REG"];
const EASTERN_TIME_ZONE = "America/New_York" as const;

/**
 * nflverse publishes this asset under the `schedules` release in the
 * CC-BY-4.0 nflverse-data repository. The release notes identify Lee Sharpe's
 * nfldata as the maintained upstream, while nfldata documents `gametime` as
 * 24-hour Eastern time regardless of venue.
 *
 * This is still a candidate source only: the repository license is recorded,
 * but intended-use promotion remains a separate operator/source-state gate.
 */
export function nflverseScheduleUrl(): string {
  return "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
}

function requiredText(row: RawScheduleRow, key: keyof RawScheduleRow): string {
  const value = row[key]?.trim();
  if (!value || value.toLowerCase() === "na") {
    throw new CCFNflverseScheduleSourceError(`required schedule field ${String(key)} is missing`);
  }
  return value;
}

function requiredInteger(row: RawScheduleRow, key: keyof RawScheduleRow): number {
  const raw = requiredText(row, key);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new CCFNflverseScheduleSourceError(`schedule field ${String(key)} must be an integer: ${raw}`);
  }
  return value;
}

function normalizeGameType(value: string): CCFNflverseGameType {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "REG" ||
    normalized === "WC" ||
    normalized === "DIV" ||
    normalized === "CON" ||
    normalized === "SB"
  ) {
    return normalized;
  }
  throw new CCFNflverseScheduleSourceError(`unsupported nflverse game_type: ${value}`);
}

function zonedParts(date: Date): [number, number, number, number, number] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return [
    Number(parts.year),
    Number(parts.month),
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  ];
}

/** Convert nflverse's documented Eastern wall-clock kickoff to an instant. */
export function nflverseEasternKickoffToIso(gameday: string, gametime: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(gametime.trim());
  if (!dateMatch || !timeMatch) {
    throw new CCFNflverseScheduleSourceError(
      `invalid nflverse kickoff fields: gameday=${gameday} gametime=${gametime}`,
    );
  }

  const target: [number, number, number, number, number] = [
    Number(dateMatch[1]),
    Number(dateMatch[2]),
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  ];
  const [year, month, day, hour, minute] = target;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new CCFNflverseScheduleSourceError(
      `invalid nflverse kickoff fields: gameday=${gameday} gametime=${gametime}`,
    );
  }

  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const normalizedTarget = new Date(targetWallMs);
  if (
    normalizedTarget.getUTCFullYear() !== year ||
    normalizedTarget.getUTCMonth() !== month - 1 ||
    normalizedTarget.getUTCDate() !== day
  ) {
    throw new CCFNflverseScheduleSourceError(`invalid nflverse gameday: ${gameday}`);
  }

  let candidateMs = targetWallMs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedParts(new Date(candidateMs));
    const observedWallMs = Date.UTC(
      observed[0],
      observed[1] - 1,
      observed[2],
      observed[3],
      observed[4],
      0,
      0,
    );
    const delta = observedWallMs - targetWallMs;
    if (delta === 0) {
      return new Date(candidateMs).toISOString();
    }
    candidateMs -= delta;
  }

  const finalParts = zonedParts(new Date(candidateMs));
  if (finalParts.some((part, index) => part !== target[index])) {
    throw new CCFNflverseScheduleSourceError(
      `could not resolve Eastern kickoff instant for ${gameday} ${gametime}`,
    );
  }
  return new Date(candidateMs).toISOString();
}

function parseScheduleRow(row: RawScheduleRow): CCFNflverseScheduleGame {
  const gameId = requiredText(row, "game_id");
  const season = requiredInteger(row, "season");
  const week = requiredInteger(row, "week");
  const gameType = normalizeGameType(requiredText(row, "game_type"));
  const gameday = requiredText(row, "gameday");
  const gametimeEt = requiredText(row, "gametime");
  const awayTeam = requiredText(row, "away_team").toUpperCase();
  const homeTeam = requiredText(row, "home_team").toUpperCase();

  if (season < 1999 || season > 2100 || week < 1 || week > 25) {
    throw new CCFNflverseScheduleSourceError(
      `schedule row ${gameId} has invalid season/week ${season}/${week}`,
    );
  }
  if (awayTeam === homeTeam) {
    throw new CCFNflverseScheduleSourceError(`schedule row ${gameId} has identical teams`);
  }

  return {
    gameId,
    season,
    gameType,
    week,
    gameday,
    gametimeEt,
    kickoffTimeZone: EASTERN_TIME_ZONE,
    kickoffAt: nflverseEasternKickoffToIso(gameday, gametimeEt),
    awayTeam,
    homeTeam,
  };
}

export function parseNflverseScheduleCsv(
  csv: string,
  options: Pick<CCFNflverseScheduleOptions, "season" | "week" | "gameTypes">,
): CCFNflverseScheduleGame[] {
  const parsed = Papa.parse<RawScheduleRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflverseScheduleSourceError(
      `failed to parse nflverse schedule CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missing.length > 0) {
    throw new CCFNflverseScheduleSourceError(
      `nflverse schedule schema missing required columns: ${missing.join(", ")}`,
    );
  }

  const allowedTypes = new Set(options.gameTypes ?? DEFAULT_GAME_TYPES);
  const byGameId = new Map<string, CCFNflverseScheduleGame>();

  for (const rawRow of parsed.data) {
    const seasonRaw = rawRow.season?.trim();
    if (!seasonRaw || Number(seasonRaw) !== options.season) continue;
    const game = parseScheduleRow(rawRow);
    if (options.week != null && game.week !== options.week) continue;
    if (!allowedTypes.has(game.gameType)) continue;
    if (byGameId.has(game.gameId)) {
      throw new CCFNflverseScheduleSourceError(`duplicate nflverse schedule game_id: ${game.gameId}`);
    }
    byGameId.set(game.gameId, game);
  }

  return [...byGameId.values()].sort((a, b) => {
    const kickoff = a.kickoffAt.localeCompare(b.kickoffAt);
    return kickoff !== 0 ? kickoff : a.gameId.localeCompare(b.gameId);
  });
}

export async function fetchNflverseSchedule(
  options: CCFNflverseScheduleOptions,
): Promise<CCFNflverseScheduleSnapshot> {
  if (!Number.isInteger(options.season) || options.season < 1999 || options.season > 2100) {
    throw new CCFNflverseScheduleSourceError("season must be an integer within [1999, 2100]");
  }
  if (options.week != null && (!Number.isInteger(options.week) || options.week < 1 || options.week > 25)) {
    throw new CCFNflverseScheduleSourceError("week must be an integer within [1, 25]");
  }

  const sourceUrl = nflverseScheduleUrl();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
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
    throw new CCFNflverseScheduleSourceError(
      `nflverse schedule fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const retrievedAt = now().toISOString();
  const rows = parseNflverseScheduleCsv(csv, options);
  if (rows.length === 0) {
    throw new CCFNflverseScheduleSourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} schedule rows`,
    );
  }

  return {
    season: options.season,
    requestedWeek: options.week,
    rows,
    provenance: {
      provider: "nflverse",
      dataset: "schedules",
      license: "CC-BY-4.0",
      sourceUrl,
      retrievedAt,
      knownAt: retrievedAt,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      temporalMode: "current_snapshot_only",
      permissionState: "unreviewed",
    },
  };
}
