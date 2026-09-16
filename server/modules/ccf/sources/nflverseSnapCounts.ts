import Papa from "papaparse";

export type CCFNflverseSnapPosition = "QB" | "RB" | "WR" | "TE";

export interface CCFNflverseSnapCountRow {
  gameId: string;
  pfrGameId: string | null;
  season: number;
  week: number;
  gameType: "REG" | "POST";
  playerName: string;
  pfrPlayerId: string;
  position: string | null;
  team: string;
  opponent: string | null;
  offenseSnaps: number;
  offensePct: number;
  defenseSnaps: number;
  defensePct: number;
  specialTeamsSnaps: number;
  specialTeamsPct: number;
}

export interface CCFNflverseSnapCountProvenance {
  provider: "nflverse";
  upstreamProvider: "Pro Football Reference";
  dataset: "snap_counts";
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  licenseStatus: "candidate_review_required";
  temporalMode: "current_snapshot_only";
  /** Snap counts describe completed-game workload and may only update later decisions. */
  evidenceTiming: "post_game_observed";
}

export interface CCFNflverseSnapCountSnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflverseSnapCountRow[];
  provenance: CCFNflverseSnapCountProvenance;
}

export interface CCFNflverseSnapCountOptions {
  season: number;
  week?: number;
  positions?: CCFNflverseSnapPosition[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class CCFNflverseSnapCountSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseSnapCountSourceError";
  }
}

interface RawSnapRow {
  game_id?: string;
  pfr_game_id?: string;
  season?: string;
  game_type?: string;
  week?: string;
  player?: string;
  pfr_player_id?: string;
  position?: string;
  team?: string;
  opponent?: string;
  offense_snaps?: string;
  offense_pct?: string;
  defense_snaps?: string;
  defense_pct?: string;
  st_snaps?: string;
  st_pct?: string;
}

const REQUIRED_COLUMNS = [
  "game_id",
  "season",
  "game_type",
  "week",
  "player",
  "pfr_player_id",
  "team",
  "offense_snaps",
  "offense_pct",
] as const;

const DEFAULT_POSITIONS: CCFNflverseSnapPosition[] = ["QB", "RB", "WR", "TE"];

export function nflverseSnapCountsUrl(season: number): string {
  if (!Number.isInteger(season) || season < 2012 || season > 2100) {
    throw new CCFNflverseSnapCountSourceError("season must be an integer within [2012, 2100]");
  }
  return `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;
}

function nullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.toLowerCase() === "na") return null;
  return normalized;
}

function numeric(
  row: RawSnapRow,
  key: keyof RawSnapRow,
  required = false,
): number {
  const raw = row[key]?.trim();
  if (!raw || raw.toLowerCase() === "na") {
    if (required) {
      throw new CCFNflverseSnapCountSourceError(`required numeric field ${String(key)} is missing`);
    }
    return 0;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CCFNflverseSnapCountSourceError(`numeric field ${String(key)} is invalid: ${raw}`);
  }
  return value;
}

function snapCount(
  row: RawSnapRow,
  key: "offense_snaps" | "defense_snaps" | "st_snaps",
  required = false,
): number {
  const value = numeric(row, key, required);
  if (value < 0) {
    throw new CCFNflverseSnapCountSourceError(
      `snap count field ${key} cannot be negative`,
    );
  }
  if (!Number.isInteger(value)) {
    throw new CCFNflverseSnapCountSourceError(
      `snap count field ${key} must be an integer`,
    );
  }
  return value;
}

function percentageShare(
  row: RawSnapRow,
  key: keyof RawSnapRow,
  required = false,
): number {
  const raw = row[key]?.trim();
  if (!raw || raw.toLowerCase() === "na") {
    if (required) {
      throw new CCFNflverseSnapCountSourceError(`required percentage field ${String(key)} is missing`);
    }
    return 0;
  }

  if (raw.endsWith("%")) {
    const percent = Number(raw.slice(0, -1));
    if (!Number.isFinite(percent)) {
      throw new CCFNflverseSnapCountSourceError(`percentage field ${String(key)} is invalid: ${raw}`);
    }
    if (percent < 0) {
      throw new CCFNflverseSnapCountSourceError("snap percentage cannot be negative");
    }
    if (percent > 100) {
      throw new CCFNflverseSnapCountSourceError("snap percentage cannot exceed 100%");
    }
    return percent / 100;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CCFNflverseSnapCountSourceError(`percentage field ${String(key)} is invalid: ${raw}`);
  }
  if (value < 0) {
    throw new CCFNflverseSnapCountSourceError("snap percentage cannot be negative");
  }
  if (value <= 1) return value;
  if (value <= 100) return value / 100;
  throw new CCFNflverseSnapCountSourceError("snap percentage cannot exceed 100%");
}

function parseSnapRow(row: RawSnapRow): CCFNflverseSnapCountRow | null {
  const gameId = nullableText(row.game_id);
  const pfrPlayerId = nullableText(row.pfr_player_id);
  const playerName = nullableText(row.player);
  const team = nullableText(row.team);
  const gameTypeRaw = nullableText(row.game_type)?.toUpperCase();
  const gameType = gameTypeRaw === "REG" || gameTypeRaw === "POST" ? gameTypeRaw : null;
  if (!gameId || !pfrPlayerId || !playerName || !team || !gameType) return null;

  const season = numeric(row, "season", true);
  const week = numeric(row, "week", true);
  if (!Number.isInteger(season) || !Number.isInteger(week)) {
    throw new CCFNflverseSnapCountSourceError(`season/week must be integers for ${pfrPlayerId}`);
  }

  return {
    gameId,
    pfrGameId: nullableText(row.pfr_game_id),
    season,
    week,
    gameType,
    playerName,
    pfrPlayerId,
    position: nullableText(row.position)?.toUpperCase() ?? null,
    team,
    opponent: nullableText(row.opponent),
    offenseSnaps: snapCount(row, "offense_snaps", true),
    offensePct: percentageShare(row, "offense_pct", true),
    defenseSnaps: snapCount(row, "defense_snaps"),
    defensePct: percentageShare(row, "defense_pct"),
    specialTeamsSnaps: snapCount(row, "st_snaps"),
    specialTeamsPct: percentageShare(row, "st_pct"),
  };
}

export function parseNflverseSnapCountsCsv(
  csv: string,
  options: Pick<CCFNflverseSnapCountOptions, "season" | "week" | "positions">,
): CCFNflverseSnapCountRow[] {
  const parsed = Papa.parse<RawSnapRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflverseSnapCountSourceError(
      `failed to parse nflverse snap-count CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missing.length > 0) {
    throw new CCFNflverseSnapCountSourceError(
      `nflverse snap-count schema missing required columns: ${missing.join(", ")}`,
    );
  }

  const positions = new Set(options.positions ?? DEFAULT_POSITIONS);
  const rows: CCFNflverseSnapCountRow[] = [];
  for (const raw of parsed.data) {
    const row = parseSnapRow(raw);
    if (!row) continue;
    if (row.season !== options.season || row.gameType !== "REG") continue;
    if (options.week != null && row.week !== options.week) continue;
    // Keep rows with missing position visible so source qualification can measure
    // identity/context missingness instead of silently deleting the evidence.
    if (row.position && !positions.has(row.position as CCFNflverseSnapPosition)) continue;
    rows.push(row);
  }

  rows.sort((left, right) => {
    if (left.week !== right.week) return left.week - right.week;
    const game = left.gameId.localeCompare(right.gameId);
    return game !== 0 ? game : left.pfrPlayerId.localeCompare(right.pfrPlayerId);
  });
  return rows;
}

export async function fetchNflverseSnapCounts(
  options: CCFNflverseSnapCountOptions,
): Promise<CCFNflverseSnapCountSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflverseSnapCountsUrl(options.season);
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
    throw new CCFNflverseSnapCountSourceError(
      `nflverse snap-count fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const rows = parseNflverseSnapCountsCsv(csv, options);
  const retrievedAt = now().toISOString();
  if (rows.length === 0) {
    throw new CCFNflverseSnapCountSourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} snap-count rows`,
    );
  }

  return {
    season: options.season,
    requestedWeek: options.week,
    rows,
    provenance: {
      provider: "nflverse",
      upstreamProvider: "Pro Football Reference",
      dataset: "snap_counts",
      sourceUrl,
      retrievedAt,
      knownAt: retrievedAt,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      licenseStatus: "candidate_review_required",
      temporalMode: "current_snapshot_only",
      evidenceTiming: "post_game_observed",
    },
  };
}
