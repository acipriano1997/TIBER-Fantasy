import Papa from "papaparse";

export const CCF_NFLVERSE_PBP_BINARY_FIELDS = [
  "play",
  "pass_attempt",
  "rush_attempt",
  "qb_dropback",
  "qb_scramble",
  "qb_kneel",
  "qb_spike",
  "sack",
  "complete_pass",
  "two_point_attempt",
  "touchdown",
  "goal_to_go",
] as const;

export type CCFNflversePbpBinaryField =
  (typeof CCF_NFLVERSE_PBP_BINARY_FIELDS)[number];

export interface CCFNflversePlayByPlayRow {
  playId: number;
  gameId: string;
  season: number;
  week: number;
  seasonType: "REG" | "POST";
  playType: string | null;
  offenseTeam: string | null;
  normalPlay: boolean;
  passerPlayerId: string | null;
  rusherPlayerId: string | null;
  receiverPlayerId: string | null;
  passAttempt: boolean;
  rushAttempt: boolean;
  qbDropback: boolean;
  qbScramble: boolean;
  qbKneel: boolean;
  qbSpike: boolean;
  sack: boolean;
  completePass: boolean;
  twoPointAttempt: boolean;
  touchdown: boolean;
  airYards: number | null;
  yardsAfterCatch: number | null;
  yardsGained: number | null;
  down: number | null;
  goalToGo: boolean;
  yardline100: number | null;
  halfSecondsRemaining: number | null;
  gameSecondsRemaining: number | null;
  scoreDifferential: number | null;
  /**
   * Binary fields that were blank/NA in the provider row. Their computation
   * value remains false for backward-compatible aggregation, while reliability
   * can distinguish source missingness from an observed zero.
   */
  missingBinaryFields: CCFNflversePbpBinaryField[];
}

export interface CCFNflversePlayerOpportunitySummary {
  season: number;
  week: number;
  team: string;
  playerId: string;
  dropbacks: number;
  passAttempts: number;
  sacks: number;
  opportunityCarries: number;
  targets: number;
  receptions: number;
  receivingAirYards: number;
  redZoneCarries: number;
  redZoneTargets: number;
  inside10Carries: number;
  inside10Targets: number;
  goalLineCarries: number;
  goalLineTargets: number;
  twoPointOpportunities: number;
  teamOpportunityCarries: number;
  teamTargets: number;
  carryShare: number | null;
  targetShare: number | null;
}

export interface CCFNflversePlayByPlayProvenance {
  provider: "nflverse";
  dataset: "play_by_play";
  license: "CC-BY-4.0";
  licenseRef: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md";
  sourceUrl: string;
  retrievedAt: string;
  knownAt: string;
  etag: string | null;
  lastModified: string | null;
  /** Current release state only; historical certification must use an immutable CCF archive. */
  temporalMode: "current_snapshot_only";
  evidenceTiming: "post_play_observed";
}

export interface CCFNflversePlayByPlaySnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflversePlayByPlayRow[];
  opportunities: CCFNflversePlayerOpportunitySummary[];
  provenance: CCFNflversePlayByPlayProvenance;
}

export interface CCFNflversePlayByPlayOptions {
  season: number;
  week?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class CCFNflversePlayByPlaySourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflversePlayByPlaySourceError";
  }
}

interface RawPbpRow {
  play_id?: string;
  game_id?: string;
  season?: string;
  season_type?: string;
  week?: string;
  play_type?: string;
  posteam?: string;
  play?: string;
  passer_player_id?: string;
  rusher_player_id?: string;
  receiver_player_id?: string;
  pass_attempt?: string;
  rush_attempt?: string;
  qb_dropback?: string;
  qb_scramble?: string;
  qb_kneel?: string;
  qb_spike?: string;
  sack?: string;
  complete_pass?: string;
  two_point_attempt?: string;
  touchdown?: string;
  air_yards?: string;
  yards_after_catch?: string;
  yards_gained?: string;
  down?: string;
  goal_to_go?: string;
  yardline_100?: string;
  half_seconds_remaining?: string;
  game_seconds_remaining?: string;
  score_differential?: string;
}

const REQUIRED_COLUMNS = [
  "play_id",
  "game_id",
  "season",
  "season_type",
  "week",
  "play_type",
  "posteam",
  "play",
  "passer_player_id",
  "rusher_player_id",
  "receiver_player_id",
  ...CCF_NFLVERSE_PBP_BINARY_FIELDS,
  "air_yards",
  "yards_after_catch",
  "yards_gained",
  "down",
  "yardline_100",
  "half_seconds_remaining",
  "game_seconds_remaining",
  "score_differential",
] as const;

function nullableText(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.toLowerCase() === "na") return null;
  return normalized;
}

function requiredInteger(row: RawPbpRow, key: "play_id" | "season" | "week"): number {
  const raw = row[key]?.trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value)) {
    throw new CCFNflversePlayByPlaySourceError(
      `required integer field ${key} is invalid: ${raw ?? "missing"}`,
    );
  }
  return value;
}

function nullableNumber(row: RawPbpRow, key: keyof RawPbpRow): number | null {
  const raw = row[key]?.trim();
  if (!raw || raw.toLowerCase() === "na") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CCFNflversePlayByPlaySourceError(
      `numeric field ${String(key)} is invalid: ${raw}`,
    );
  }
  return value;
}

function nullableNonNegativeNumber(
  row: RawPbpRow,
  key: keyof RawPbpRow,
): number | null {
  const value = nullableNumber(row, key);
  if (value != null && value < 0) {
    throw new CCFNflversePlayByPlaySourceError(
      `numeric field ${String(key)} must be non-negative: ${value}`,
    );
  }
  return value;
}

function binaryFlag(
  row: RawPbpRow,
  key: CCFNflversePbpBinaryField,
): { value: boolean; missing: boolean } {
  const raw = row[key]?.trim();
  if (!raw || raw.toLowerCase() === "na") {
    return { value: false, missing: true };
  }
  if (raw === "1" || raw.toLowerCase() === "true") {
    return { value: true, missing: false };
  }
  if (raw === "0" || raw.toLowerCase() === "false") {
    return { value: false, missing: false };
  }
  const numeric = Number(raw);
  if (numeric === 1) return { value: true, missing: false };
  if (numeric === 0) return { value: false, missing: false };
  throw new CCFNflversePlayByPlaySourceError(
    `binary field ${String(key)} is invalid: ${raw}`,
  );
}

function parsePbpRow(row: RawPbpRow): CCFNflversePlayByPlayRow | null {
  const gameId = nullableText(row.game_id);
  const seasonTypeRaw = nullableText(row.season_type)?.toUpperCase();
  const seasonType = seasonTypeRaw === "REG" || seasonTypeRaw === "POST"
    ? seasonTypeRaw
    : null;
  if (!gameId || !seasonType) return null;

  const missingBinaryFields: CCFNflversePbpBinaryField[] = [];
  const flag = (key: CCFNflversePbpBinaryField): boolean => {
    const parsed = binaryFlag(row, key);
    if (parsed.missing) missingBinaryFields.push(key);
    return parsed.value;
  };

  return {
    playId: requiredInteger(row, "play_id"),
    gameId,
    season: requiredInteger(row, "season"),
    week: requiredInteger(row, "week"),
    seasonType,
    playType: nullableText(row.play_type)?.toLowerCase() ?? null,
    offenseTeam: nullableText(row.posteam),
    normalPlay: flag("play"),
    passerPlayerId: nullableText(row.passer_player_id),
    rusherPlayerId: nullableText(row.rusher_player_id),
    receiverPlayerId: nullableText(row.receiver_player_id),
    passAttempt: flag("pass_attempt"),
    rushAttempt: flag("rush_attempt"),
    qbDropback: flag("qb_dropback"),
    qbScramble: flag("qb_scramble"),
    qbKneel: flag("qb_kneel"),
    qbSpike: flag("qb_spike"),
    sack: flag("sack"),
    completePass: flag("complete_pass"),
    twoPointAttempt: flag("two_point_attempt"),
    touchdown: flag("touchdown"),
    airYards: nullableNumber(row, "air_yards"),
    yardsAfterCatch: nullableNumber(row, "yards_after_catch"),
    yardsGained: nullableNumber(row, "yards_gained"),
    down: nullableNumber(row, "down"),
    goalToGo: flag("goal_to_go"),
    yardline100: nullableNumber(row, "yardline_100"),
    halfSecondsRemaining: nullableNonNegativeNumber(row, "half_seconds_remaining"),
    gameSecondsRemaining: nullableNonNegativeNumber(row, "game_seconds_remaining"),
    scoreDifferential: nullableNumber(row, "score_differential"),
    missingBinaryFields,
  };
}

export function nflversePlayByPlayUrl(season: number): string {
  if (!Number.isInteger(season) || season < 1999 || season > 2100) {
    throw new CCFNflversePlayByPlaySourceError(
      "season must be an integer within [1999, 2100]",
    );
  }
  return `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv`;
}

export function parseNflversePlayByPlayCsv(
  csv: string,
  options: Pick<CCFNflversePlayByPlayOptions, "season" | "week">,
): CCFNflversePlayByPlayRow[] {
  const parsed = Papa.parse<RawPbpRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflversePlayByPlaySourceError(
      `failed to parse nflverse play-by-play CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missing.length > 0) {
    throw new CCFNflversePlayByPlaySourceError(
      `nflverse play-by-play schema missing required columns: ${missing.join(", ")}`,
    );
  }

  const rows: CCFNflversePlayByPlayRow[] = [];
  for (const raw of parsed.data) {
    const row = parsePbpRow(raw);
    if (!row) continue;
    if (row.season !== options.season || row.seasonType !== "REG") continue;
    if (options.week != null && row.week !== options.week) continue;
    rows.push(row);
  }
  rows.sort((left, right) => {
    const game = left.gameId.localeCompare(right.gameId);
    return game !== 0 ? game : left.playId - right.playId;
  });
  return rows;
}

interface MutableOpportunity {
  season: number;
  week: number;
  team: string;
  playerId: string;
  dropbacks: number;
  passAttempts: number;
  sacks: number;
  opportunityCarries: number;
  targets: number;
  receptions: number;
  receivingAirYards: number;
  redZoneCarries: number;
  redZoneTargets: number;
  inside10Carries: number;
  inside10Targets: number;
  goalLineCarries: number;
  goalLineTargets: number;
  twoPointOpportunities: number;
}

function createMutableOpportunity(
  row: CCFNflversePlayByPlayRow,
  playerId: string,
): MutableOpportunity {
  return {
    season: row.season,
    week: row.week,
    team: row.offenseTeam!,
    playerId,
    dropbacks: 0,
    passAttempts: 0,
    sacks: 0,
    opportunityCarries: 0,
    targets: 0,
    receptions: 0,
    receivingAirYards: 0,
    redZoneCarries: 0,
    redZoneTargets: 0,
    inside10Carries: 0,
    inside10Targets: 0,
    goalLineCarries: 0,
    goalLineTargets: 0,
    twoPointOpportunities: 0,
  };
}

export function aggregateNflverseFantasyOpportunity(
  rows: readonly CCFNflversePlayByPlayRow[],
): CCFNflversePlayerOpportunitySummary[] {
  const byPlayer = new Map<string, MutableOpportunity>();
  const teamCarries = new Map<string, number>();
  const teamTargets = new Map<string, number>();

  const player = (row: CCFNflversePlayByPlayRow, playerId: string): MutableOpportunity => {
    const key = `${row.season}|${row.week}|${row.offenseTeam}|${playerId}`;
    let value = byPlayer.get(key);
    if (!value) {
      value = createMutableOpportunity(row, playerId);
      byPlayer.set(key, value);
    }
    return value;
  };
  const teamKey = (row: CCFNflversePlayByPlayRow) =>
    `${row.season}|${row.week}|${row.offenseTeam}`;

  for (const row of rows) {
    if (!row.offenseTeam) continue;
    const isTwoPoint = row.twoPointAttempt;
    const isOpportunityCarry = row.rushAttempt && !row.qbKneel && !isTwoPoint;
    const isTarget = row.passAttempt && row.receiverPlayerId != null && !isTwoPoint;
    const yardline = row.yardline100;

    if (row.passerPlayerId) {
      const passer = player(row, row.passerPlayerId);
      if (row.qbDropback) passer.dropbacks += 1;
      if (row.passAttempt && !isTwoPoint) passer.passAttempts += 1;
      if (row.sack) passer.sacks += 1;
      if (isTwoPoint) passer.twoPointOpportunities += 1;
    }

    if (isOpportunityCarry && row.rusherPlayerId) {
      const rusher = player(row, row.rusherPlayerId);
      rusher.opportunityCarries += 1;
      teamCarries.set(teamKey(row), (teamCarries.get(teamKey(row)) ?? 0) + 1);
      if (yardline != null && yardline <= 20) rusher.redZoneCarries += 1;
      if (yardline != null && yardline <= 10) rusher.inside10Carries += 1;
      if (yardline != null && yardline <= 5) rusher.goalLineCarries += 1;
    } else if (isTwoPoint && row.rusherPlayerId) {
      player(row, row.rusherPlayerId).twoPointOpportunities += 1;
    }

    if (isTarget && row.receiverPlayerId) {
      const receiver = player(row, row.receiverPlayerId);
      receiver.targets += 1;
      if (row.completePass) receiver.receptions += 1;
      if (row.airYards != null) receiver.receivingAirYards += row.airYards;
      teamTargets.set(teamKey(row), (teamTargets.get(teamKey(row)) ?? 0) + 1);
      if (yardline != null && yardline <= 20) receiver.redZoneTargets += 1;
      if (yardline != null && yardline <= 10) receiver.inside10Targets += 1;
      if (yardline != null && yardline <= 5) receiver.goalLineTargets += 1;
    } else if (isTwoPoint && row.receiverPlayerId) {
      player(row, row.receiverPlayerId).twoPointOpportunities += 1;
    }
  }

  return Array.from(byPlayer.values())
    .map((value): CCFNflversePlayerOpportunitySummary => {
      const key = `${value.season}|${value.week}|${value.team}`;
      const carries = teamCarries.get(key) ?? 0;
      const targets = teamTargets.get(key) ?? 0;
      return {
        ...value,
        teamOpportunityCarries: carries,
        teamTargets: targets,
        carryShare: carries > 0 ? value.opportunityCarries / carries : null,
        targetShare: targets > 0 ? value.targets / targets : null,
      };
    })
    .sort((left, right) => {
      if (left.season !== right.season) return left.season - right.season;
      if (left.week !== right.week) return left.week - right.week;
      const team = left.team.localeCompare(right.team);
      return team !== 0 ? team : left.playerId.localeCompare(right.playerId);
    });
}

export async function fetchNflversePlayByPlay(
  options: CCFNflversePlayByPlayOptions,
): Promise<CCFNflversePlayByPlaySnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflversePlayByPlayUrl(options.season);
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
    throw new CCFNflversePlayByPlaySourceError(
      `nflverse play-by-play fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const rows = parseNflversePlayByPlayCsv(csv, options);
  const retrievedAt = now().toISOString();
  if (rows.length === 0) {
    throw new CCFNflversePlayByPlaySourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} play-by-play rows`,
    );
  }

  return {
    season: options.season,
    requestedWeek: options.week,
    rows,
    opportunities: aggregateNflverseFantasyOpportunity(rows),
    provenance: {
      provider: "nflverse",
      dataset: "play_by_play",
      license: "CC-BY-4.0",
      licenseRef: "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md",
      sourceUrl,
      retrievedAt,
      knownAt: retrievedAt,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      temporalMode: "current_snapshot_only",
      evidenceTiming: "post_play_observed",
    },
  };
}
