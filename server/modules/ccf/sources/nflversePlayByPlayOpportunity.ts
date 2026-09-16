import Papa from "papaparse";

export const CCF_NFLVERSE_PBP_OPPORTUNITY_SOURCE_VERSION = "ccf-nflverse-pbp-opportunity-v1" as const;
export const CCF_NFLVERSE_PBP_RELEASE_TAG = "pbp" as const;

export function nflversePlayByPlayCsvUrl(season: number): string {
  return `https://github.com/nflverse/nflverse-data/releases/download/${CCF_NFLVERSE_PBP_RELEASE_TAG}/play_by_play_${season}.csv`;
}

export interface CCFNflversePbpOpportunityPlay {
  gameId: string;
  playId: number;
  season: number;
  seasonType: "REG";
  week: number;
  playType: string | null;
  possessionTeam: string | null;
  passerSourcePlayerId: string | null;
  targetedReceiverSourcePlayerId: string | null;
  rusherSourcePlayerId: string | null;
  passAttempt: boolean | null;
  rushAttempt: boolean | null;
  completePass: boolean | null;
  qbDropback: boolean | null;
  twoPointAttempt: boolean | null;
}

export interface CCFNflversePbpOpportunityProvenance {
  provider: "nflverse";
  dataset: "nflfastR_play_by_play";
  releaseTag: typeof CCF_NFLVERSE_PBP_RELEASE_TAG;
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  temporalMode: "current_snapshot_only";
  identityNamespace: "nflverse_source_player_id";
}

export interface CCFNflversePbpOpportunitySnapshot {
  contractVersion: typeof CCF_NFLVERSE_PBP_OPPORTUNITY_SOURCE_VERSION;
  season: number;
  week: number;
  coverageState: "observed" | "no_rows";
  gameIds: string[];
  plays: CCFNflversePbpOpportunityPlay[];
  provenance: CCFNflversePbpOpportunityProvenance;
}

export interface CCFNflversePbpPlayerOpportunitySummary {
  sourcePlayerId: string;
  teams: string[];
  carries: number;
  targets: number;
  receptions: number;
  twoPointCarries: number;
  twoPointTargets: number;
}

export interface CCFNflversePbpOpportunityOptions {
  season: number;
  week: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class CCFNflversePbpOpportunityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflversePbpOpportunityError";
  }
}

interface RawPbpRow {
  game_id?: string;
  play_id?: string;
  season?: string;
  season_type?: string;
  week?: string;
  play_type?: string;
  posteam?: string;
  passer_player_id?: string;
  receiver_player_id?: string;
  rusher_player_id?: string;
  pass_attempt?: string;
  rush_attempt?: string;
  complete_pass?: string;
  qb_dropback?: string;
  two_point_attempt?: string;
}

const REQUIRED_COLUMNS = [
  "game_id",
  "play_id",
  "season",
  "season_type",
  "week",
  "play_type",
  "posteam",
  "passer_player_id",
  "receiver_player_id",
  "rusher_player_id",
  "pass_attempt",
  "rush_attempt",
  "complete_pass",
  "qb_dropback",
  "two_point_attempt",
] as const;

function validateSeasonWeek(season: number, week: number): void {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) {
    throw new CCFNflversePbpOpportunityError("season must be an integer within [1999, 2100]");
  }
  if (!Number.isInteger(week) || week < 1 || week > 25) {
    throw new CCFNflversePbpOpportunityError("week must be an integer within [1, 25]");
  }
}

function requiredText(value: string | undefined, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new CCFNflversePbpOpportunityError(`${field} is required`);
  return normalized;
}

function nullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function requiredInteger(value: string | undefined, field: string): number {
  const normalized = value?.trim();
  if (!normalized || !/^-?\d+$/.test(normalized)) {
    throw new CCFNflversePbpOpportunityError(`${field} must be an integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new CCFNflversePbpOpportunityError(`${field} must be a safe integer`);
  }
  return parsed;
}

function nullableBinary(value: string | undefined, field: string): boolean | null {
  const normalized = value?.trim();
  if (!normalized || normalized.toUpperCase() === "NA") return null;
  if (normalized === "1" || normalized === "1.0") return true;
  if (normalized === "0" || normalized === "0.0") return false;
  throw new CCFNflversePbpOpportunityError(`${field} must be binary when present`);
}

export function parseNflversePbpOpportunityCsv(
  csv: string,
  season: number,
  week: number,
): CCFNflversePbpOpportunityPlay[] {
  validateSeasonWeek(season, week);
  const parsed = Papa.parse<RawPbpRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflversePbpOpportunityError(
      `failed to parse nflverse PBP CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missingColumns.length > 0) {
    throw new CCFNflversePbpOpportunityError(
      `nflverse PBP schema missing required columns: ${missingColumns.join(", ")}`,
    );
  }

  const plays: CCFNflversePbpOpportunityPlay[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.data) {
    const rowSeason = Number(raw.season?.trim());
    const rowWeek = Number(raw.week?.trim());
    const seasonType = raw.season_type?.trim().toUpperCase();
    if (rowSeason !== season || rowWeek !== week || seasonType !== "REG") continue;

    const gameId = requiredText(raw.game_id, "game_id");
    const playId = requiredInteger(raw.play_id, "play_id");
    const uniquePlayRef = `${gameId}:${playId}`;
    if (seen.has(uniquePlayRef)) {
      throw new CCFNflversePbpOpportunityError(`duplicate play ${uniquePlayRef}`);
    }

    plays.push({
      gameId,
      playId,
      season: rowSeason,
      seasonType: "REG",
      week: rowWeek,
      playType: nullableText(raw.play_type)?.toLowerCase() ?? null,
      possessionTeam: nullableText(raw.posteam)?.toUpperCase() ?? null,
      passerSourcePlayerId: nullableText(raw.passer_player_id),
      targetedReceiverSourcePlayerId: nullableText(raw.receiver_player_id),
      rusherSourcePlayerId: nullableText(raw.rusher_player_id),
      passAttempt: nullableBinary(raw.pass_attempt, "pass_attempt"),
      rushAttempt: nullableBinary(raw.rush_attempt, "rush_attempt"),
      completePass: nullableBinary(raw.complete_pass, "complete_pass"),
      qbDropback: nullableBinary(raw.qb_dropback, "qb_dropback"),
      twoPointAttempt: nullableBinary(raw.two_point_attempt, "two_point_attempt"),
    });
    seen.add(uniquePlayRef);
  }

  plays.sort((left, right) => {
    const gameOrder = left.gameId.localeCompare(right.gameId);
    return gameOrder !== 0 ? gameOrder : left.playId - right.playId;
  });
  return plays;
}

export function buildNflversePbpOpportunitySnapshot(args: {
  season: number;
  week: number;
  plays: readonly CCFNflversePbpOpportunityPlay[];
  retrievedAt: string;
  etag?: string | null;
  lastModified?: string | null;
}): CCFNflversePbpOpportunitySnapshot {
  validateSeasonWeek(args.season, args.week);
  if (!Number.isFinite(Date.parse(args.retrievedAt))) {
    throw new CCFNflversePbpOpportunityError("retrievedAt must be a valid timestamp");
  }
  if (args.plays.some((play) => (
    play.season !== args.season || play.week !== args.week || play.seasonType !== "REG"
  ))) {
    throw new CCFNflversePbpOpportunityError("PBP snapshot contains incompatible season/week rows");
  }

  const sourceUrl = nflversePlayByPlayCsvUrl(args.season);
  return {
    contractVersion: CCF_NFLVERSE_PBP_OPPORTUNITY_SOURCE_VERSION,
    season: args.season,
    week: args.week,
    coverageState: args.plays.length > 0 ? "observed" : "no_rows",
    gameIds: Array.from(new Set(args.plays.map((play) => play.gameId))).sort(),
    plays: args.plays.map((play) => ({ ...play })),
    provenance: {
      provider: "nflverse",
      dataset: "nflfastR_play_by_play",
      releaseTag: CCF_NFLVERSE_PBP_RELEASE_TAG,
      sourceUrl,
      retrievedAt: args.retrievedAt,
      knownAt: args.retrievedAt,
      etag: args.etag ?? null,
      lastModified: args.lastModified ?? null,
      temporalMode: "current_snapshot_only",
      identityNamespace: "nflverse_source_player_id",
    },
  };
}

interface MutableSummary {
  sourcePlayerId: string;
  teams: Set<string>;
  carries: number;
  targets: number;
  receptions: number;
  twoPointCarries: number;
  twoPointTargets: number;
}

function summaryFor(map: Map<string, MutableSummary>, sourcePlayerId: string): MutableSummary {
  const current = map.get(sourcePlayerId);
  if (current) return current;
  const created: MutableSummary = {
    sourcePlayerId,
    teams: new Set<string>(),
    carries: 0,
    targets: 0,
    receptions: 0,
    twoPointCarries: 0,
    twoPointTargets: 0,
  };
  map.set(sourcePlayerId, created);
  return created;
}

/**
 * Summarize only directly documented PBP opportunity facts. `receiver_player_id`
 * is the targeted receiver and `rusher_player_id` is the runner. Nullified
 * `play_type=no_play` rows are excluded. Two-point opportunities are kept
 * separate from standard carries/targets so downstream feature policy does not
 * silently mix unlike stat concepts. Source player IDs remain in their native
 * namespace until a separately governed identity-binding witness maps them.
 */
export function summarizeNflversePbpOpportunities(
  snapshot: CCFNflversePbpOpportunitySnapshot,
): CCFNflversePbpPlayerOpportunitySummary[] {
  const summaries = new Map<string, MutableSummary>();
  for (const play of snapshot.plays) {
    if (play.playType === "no_play") continue;
    const isTwoPoint = play.twoPointAttempt === true;

    if (play.rushAttempt === true && play.rusherSourcePlayerId) {
      const summary = summaryFor(summaries, play.rusherSourcePlayerId);
      if (play.possessionTeam) summary.teams.add(play.possessionTeam);
      if (isTwoPoint) summary.twoPointCarries += 1;
      else summary.carries += 1;
    }

    if (play.targetedReceiverSourcePlayerId) {
      const summary = summaryFor(summaries, play.targetedReceiverSourcePlayerId);
      if (play.possessionTeam) summary.teams.add(play.possessionTeam);
      if (isTwoPoint) summary.twoPointTargets += 1;
      else {
        summary.targets += 1;
        if (play.completePass === true) summary.receptions += 1;
      }
    }
  }

  return Array.from(summaries.values())
    .map((summary) => ({
      sourcePlayerId: summary.sourcePlayerId,
      teams: Array.from(summary.teams).sort(),
      carries: summary.carries,
      targets: summary.targets,
      receptions: summary.receptions,
      twoPointCarries: summary.twoPointCarries,
      twoPointTargets: summary.twoPointTargets,
    }))
    .sort((left, right) => left.sourcePlayerId.localeCompare(right.sourcePlayerId));
}

export async function fetchNflversePbpOpportunity(
  options: CCFNflversePbpOpportunityOptions,
): Promise<CCFNflversePbpOpportunitySnapshot> {
  validateSeasonWeek(options.season, options.week);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflversePlayByPlayCsvUrl(options.season);
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
    throw new CCFNflversePbpOpportunityError(
      `nflverse PBP fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const plays = parseNflversePbpOpportunityCsv(csv, options.season, options.week);
  return buildNflversePbpOpportunitySnapshot({
    season: options.season,
    week: options.week,
    plays,
    retrievedAt: now().toISOString(),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  });
}
