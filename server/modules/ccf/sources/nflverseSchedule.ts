import Papa from "papaparse";

export const CCF_NFLVERSE_SCHEDULE_SOURCE_VERSION = "ccf-nflverse-schedule-v1" as const;
export const CCF_NFLVERSE_SCHEDULE_URL =
  "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv" as const;
export const CCF_NFLVERSE_SCHEDULE_TIME_ZONE = "America/New_York" as const;

export type CCFNflverseScheduleGameType = "REG" | "WC" | "DIV" | "CON" | "SB";

export interface CCFNflverseScheduleGame {
  gameId: string;
  season: number;
  gameType: CCFNflverseScheduleGameType;
  week: number;
  gameday: string;
  gametimeEastern: string;
  kickoffAt: string;
  awayTeam: string;
  homeTeam: string;
}

export interface CCFNflverseScheduleProvenance {
  provider: "nflverse";
  dataset: "nfldata_games";
  sourceUrl: typeof CCF_NFLVERSE_SCHEDULE_URL;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  temporalMode: "current_snapshot_only";
  kickoffTimeBasis: typeof CCF_NFLVERSE_SCHEDULE_TIME_ZONE;
}

export interface CCFNflverseScheduleSnapshot {
  contractVersion: typeof CCF_NFLVERSE_SCHEDULE_SOURCE_VERSION;
  season: number;
  games: CCFNflverseScheduleGame[];
  teams: string[];
  weeks: number[];
  provenance: CCFNflverseScheduleProvenance;
}

export interface CCFNflverseScheduleOptions {
  season: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export type CCFTeamWeekScheduleState =
  | {
      state: "scheduled";
      team: string;
      week: number;
      game: CCFNflverseScheduleGame;
    }
  | {
      state: "bye";
      team: string;
      week: number;
      game: null;
    }
  | {
      state: "unknown";
      team: string;
      week: number;
      game: null;
      reason: "unknown_team" | "week_not_present" | "invalid_week";
    }
  | {
      state: "conflict";
      team: string;
      week: number;
      games: CCFNflverseScheduleGame[];
    };

export type CCFNflverseScheduleLockState = "locked" | "unlocked" | "unknown";

export class CCFNflverseScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseScheduleError";
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

function integer(value: string | undefined, field: string): number {
  const parsed = Number(value?.trim());
  if (!Number.isInteger(parsed)) {
    throw new CCFNflverseScheduleError(`${field} must be an integer`);
  }
  return parsed;
}

function text(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new CCFNflverseScheduleError(`${field} is required`);
  return normalized;
}

function normalizeGameType(value: string | undefined): CCFNflverseScheduleGameType | null {
  const normalized = value?.trim().toUpperCase();
  return normalized === "REG" || normalized === "WC" || normalized === "DIV"
    || normalized === "CON" || normalized === "SB"
    ? normalized
    : null;
}

function parseLocalDateTime(gameday: string, gametime: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(gametime);
  if (!dateMatch) throw new CCFNflverseScheduleError(`invalid gameday ${gameday}`);
  if (!timeMatch) throw new CCFNflverseScheduleError(`invalid gametime ${gametime}`);

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new CCFNflverseScheduleError(`invalid Eastern kickoff ${gameday} ${gametime}`);
  }
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year
    || calendarCheck.getUTCMonth() !== month - 1
    || calendarCheck.getUTCDate() !== day
  ) {
    throw new CCFNflverseScheduleError(`invalid gameday ${gameday}`);
  }
  return { year, month, day, hour, minute };
}

function easternParts(epochMs: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CCF_NFLVERSE_SCHEDULE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

/**
 * Convert nflverse's documented Eastern local kickoff to an absolute instant.
 * Iteration avoids hard-coding EST/EDT and therefore respects daylight-saving
 * transitions through the runtime IANA time-zone database.
 */
export function nflverseEasternKickoffToUtc(gameday: string, gametime: string): string {
  const desired = parseLocalDateTime(gameday, gametime);
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  let candidate = desiredAsUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = easternParts(candidate);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    candidate += desiredAsUtc - observedAsUtc;
  }

  const verified = easternParts(candidate);
  if (
    verified.year !== desired.year
    || verified.month !== desired.month
    || verified.day !== desired.day
    || verified.hour !== desired.hour
    || verified.minute !== desired.minute
  ) {
    throw new CCFNflverseScheduleError(
      `could not resolve Eastern kickoff ${gameday} ${gametime}`,
    );
  }
  return new Date(candidate).toISOString();
}

export function parseNflverseScheduleCsv(
  csv: string,
  season: number,
): CCFNflverseScheduleGame[] {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) {
    throw new CCFNflverseScheduleError("season must be an integer within [1999, 2100]");
  }
  const parsed = Papa.parse<RawScheduleRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflverseScheduleError(
      `failed to parse nflverse schedule CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missingColumns.length > 0) {
    throw new CCFNflverseScheduleError(
      `nflverse schedule schema missing required columns: ${missingColumns.join(", ")}`,
    );
  }

  const games: CCFNflverseScheduleGame[] = [];
  const seenGameIds = new Set<string>();
  for (const raw of parsed.data) {
    const rowSeason = Number(raw.season?.trim());
    if (rowSeason !== season) continue;
    const gameType = normalizeGameType(raw.game_type);
    if (gameType !== "REG") continue;

    const gameId = text(raw.game_id, "game_id");
    if (seenGameIds.has(gameId)) {
      throw new CCFNflverseScheduleError(`duplicate game_id ${gameId}`);
    }
    const week = integer(raw.week, "week");
    if (week < 1 || week > 25) throw new CCFNflverseScheduleError(`invalid week ${week}`);
    const gameday = text(raw.gameday, "gameday");
    const gametimeEastern = text(raw.gametime, "gametime");
    const awayTeam = text(raw.away_team, "away_team").toUpperCase();
    const homeTeam = text(raw.home_team, "home_team").toUpperCase();
    if (awayTeam === homeTeam) {
      throw new CCFNflverseScheduleError(`${gameId} has identical home and away team`);
    }

    games.push({
      gameId,
      season: rowSeason,
      gameType,
      week,
      gameday,
      gametimeEastern,
      kickoffAt: nflverseEasternKickoffToUtc(gameday, gametimeEastern),
      awayTeam,
      homeTeam,
    });
    seenGameIds.add(gameId);
  }

  games.sort((left, right) => {
    if (left.week !== right.week) return left.week - right.week;
    const kickoff = left.kickoffAt.localeCompare(right.kickoffAt);
    return kickoff !== 0 ? kickoff : left.gameId.localeCompare(right.gameId);
  });
  return games;
}

export function buildNflverseScheduleSnapshot(args: {
  season: number;
  games: readonly CCFNflverseScheduleGame[];
  retrievedAt: string;
  etag?: string | null;
  lastModified?: string | null;
}): CCFNflverseScheduleSnapshot {
  if (!Number.isFinite(Date.parse(args.retrievedAt))) {
    throw new CCFNflverseScheduleError("retrievedAt must be a valid timestamp");
  }
  if (args.games.length === 0) {
    throw new CCFNflverseScheduleError(`nflverse returned no regular-season games for ${args.season}`);
  }
  if (args.games.some((game) => game.season !== args.season || game.gameType !== "REG")) {
    throw new CCFNflverseScheduleError("schedule snapshot contains incompatible season/game type rows");
  }

  const teams = Array.from(new Set(args.games.flatMap((game) => [game.awayTeam, game.homeTeam]))).sort();
  const weeks = Array.from(new Set(args.games.map((game) => game.week))).sort((a, b) => a - b);
  return {
    contractVersion: CCF_NFLVERSE_SCHEDULE_SOURCE_VERSION,
    season: args.season,
    games: args.games.map((game) => ({ ...game })),
    teams,
    weeks,
    provenance: {
      provider: "nflverse",
      dataset: "nfldata_games",
      sourceUrl: CCF_NFLVERSE_SCHEDULE_URL,
      retrievedAt: args.retrievedAt,
      knownAt: args.retrievedAt,
      etag: args.etag ?? null,
      lastModified: args.lastModified ?? null,
      temporalMode: "current_snapshot_only",
      kickoffTimeBasis: CCF_NFLVERSE_SCHEDULE_TIME_ZONE,
    },
  };
}

export function resolveNflverseTeamWeekSchedule(
  snapshot: CCFNflverseScheduleSnapshot,
  teamInput: string,
  week: number,
): CCFTeamWeekScheduleState {
  const team = teamInput.trim().toUpperCase();
  if (!Number.isInteger(week) || week < 1 || week > 25) {
    return { state: "unknown", team, week, game: null, reason: "invalid_week" };
  }
  if (!snapshot.teams.includes(team)) {
    return { state: "unknown", team, week, game: null, reason: "unknown_team" };
  }
  if (!snapshot.weeks.includes(week)) {
    return { state: "unknown", team, week, game: null, reason: "week_not_present" };
  }
  const matches = snapshot.games.filter(
    (game) => game.week === week && (game.homeTeam === team || game.awayTeam === team),
  );
  if (matches.length === 0) return { state: "bye", team, week, game: null };
  if (matches.length === 1) return { state: "scheduled", team, week, game: matches[0] };
  return { state: "conflict", team, week, games: matches.map((game) => ({ ...game })) };
}

export function deriveNflverseScheduleLockState(
  state: CCFTeamWeekScheduleState,
  asOf: string,
): CCFNflverseScheduleLockState {
  if (state.state !== "scheduled" || !Number.isFinite(Date.parse(asOf))) return "unknown";
  return Date.parse(asOf) >= Date.parse(state.game.kickoffAt) ? "locked" : "unlocked";
}

export async function fetchNflverseSchedule(
  options: CCFNflverseScheduleOptions,
): Promise<CCFNflverseScheduleSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const response = await fetchImpl(CCF_NFLVERSE_SCHEDULE_URL, {
    method: "GET",
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.1",
      "User-Agent": "CCF/1.0 (+Fantasy Football Command Center)",
    },
    signal: options.signal,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new CCFNflverseScheduleError(
      `nflverse schedule fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const csv = await response.text();
  const games = parseNflverseScheduleCsv(csv, options.season);
  return buildNflverseScheduleSnapshot({
    season: options.season,
    games,
    retrievedAt: now().toISOString(),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  });
}
