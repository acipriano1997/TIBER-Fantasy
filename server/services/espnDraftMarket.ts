export type EspnDraftScoring = 'PPR' | 'HALF_PPR' | 'STANDARD';
export type EspnDraftPosition = 'QB' | 'RB' | 'WR' | 'TE';

export type EspnDraftMarketRow = {
  espnPlayerId: string;
  playerName: string;
  team: string | null;
  position: EspnDraftPosition;
  proTeamId: number | null;
  averageDraftPosition: number | null;
  draftRank: number | null;
  auctionValueAverage: number | null;
  percentOwned: number | null;
};

export type EspnDraftMarketSnapshot = {
  schemaVersion: 'espn_draft_market_v1';
  provider: 'espn';
  season: number;
  scoring: EspnDraftScoring;
  fetchedAt: string;
  sourceEndpoint: string;
  sourceView: 'kona_player_info';
  identityStatus: 'provider_typed';
  rows: EspnDraftMarketRow[];
  warnings: string[];
};

type FetchLike = typeof fetch;

type CacheEntry = { expiresAt: number; snapshot: EspnDraftMarketSnapshot };
const cache = new Map<string, CacheEntry>();
const CACHE_MS = 30_000;

const PRO_TEAM_MAP: Record<number, string> = {
  1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
  9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
  17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
  25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU',
};

const POSITION_MAP: Record<number, EspnDraftPosition | undefined> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
};

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
}

function positiveInt(value: unknown): number | null {
  const number = positiveNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function readDraftRank(player: any, scoring: EspnDraftScoring): number | null {
  const ranks = player?.draftRanksByRankType;
  const candidates = [
    ranks?.[scoring]?.rank,
    ranks?.[scoring]?.overallRank,
    player?.draftRank,
  ];
  for (const candidate of candidates) {
    const value = positiveNumber(candidate);
    if (value !== null) return value;
  }
  return null;
}

function ownershipObject(entry: any) {
  return entry?.player?.ownership ?? entry?.playerPoolEntry?.ownership ?? null;
}

function buildFilter(scoring: EspnDraftScoring) {
  return {
    players: {
      filterSlotIds: { value: [0, 2, 4, 6] },
      filterRanksForScoringPeriodIds: { value: [1] },
      filterRanksForRankTypes: { value: [scoring] },
      filterRanksForSlotIds: { value: [0, 2, 4, 6, 17, 16] },
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: scoring },
      sortPercOwned: { sortPriority: 4, sortAsc: false },
      limit: 500,
      offset: 0,
    },
  };
}

export function parseEspnDraftMarketPayload(payload: any, options: {
  season: number;
  scoring: EspnDraftScoring;
  fetchedAt: string;
  sourceEndpoint: string;
}): EspnDraftMarketSnapshot {
  const sourcePlayers = Array.isArray(payload?.players) ? payload.players : [];
  const warnings: string[] = [];
  const rows: EspnDraftMarketRow[] = [];
  const seen = new Set<string>();

  for (const entry of sourcePlayers) {
    const player = entry?.player;
    const position = POSITION_MAP[Number(player?.defaultPositionId)];
    if (!position || player?.active === false) continue;

    const espnPlayerId = String(entry?.id ?? player?.id ?? '').trim();
    const playerName = cleanName(player?.fullName);
    if (!espnPlayerId || !playerName || seen.has(espnPlayerId)) continue;

    const ownership = ownershipObject(entry);
    const averageDraftPosition = positiveNumber(ownership?.averageDraftPosition);
    const draftRank = readDraftRank(player, options.scoring);

    // Never convert response order into ADP/rank. A row without either truthful
    // market field is not useful for the draft board and fails closed here.
    if (averageDraftPosition === null && draftRank === null) continue;

    const proTeamId = positiveInt(player?.proTeamId);
    rows.push({
      espnPlayerId,
      playerName,
      team: proTeamId === null ? null : PRO_TEAM_MAP[proTeamId] ?? null,
      position,
      proTeamId,
      averageDraftPosition,
      draftRank,
      auctionValueAverage: positiveNumber(ownership?.auctionValueAverage),
      percentOwned: finiteNumber(ownership?.percentOwned),
    });
    seen.add(espnPlayerId);
  }

  rows.sort((left, right) => {
    const leftKey = left.draftRank ?? left.averageDraftPosition ?? Number.POSITIVE_INFINITY;
    const rightKey = right.draftRank ?? right.averageDraftPosition ?? Number.POSITIVE_INFINITY;
    return leftKey - rightKey
      || (left.averageDraftPosition ?? Number.POSITIVE_INFINITY) - (right.averageDraftPosition ?? Number.POSITIVE_INFINITY)
      || left.playerName.localeCompare(right.playerName);
  });

  if (sourcePlayers.length > 0 && rows.length === 0) {
    warnings.push('ESPN returned players but no truthful draft-rank/ADP fields; market board withheld.');
  }
  if (rows.some((row) => row.team === null)) {
    warnings.push('Some ESPN pro-team IDs could not be mapped; provider player IDs remain authoritative.');
  }

  return {
    schemaVersion: 'espn_draft_market_v1',
    provider: 'espn',
    season: options.season,
    scoring: options.scoring,
    fetchedAt: options.fetchedAt,
    sourceEndpoint: options.sourceEndpoint,
    sourceView: 'kona_player_info',
    identityStatus: 'provider_typed',
    rows,
    warnings,
  };
}

export async function fetchEspnDraftMarket(options: {
  season: number;
  scoring?: EspnDraftScoring;
  fetchImpl?: FetchLike;
  now?: () => number;
  bypassCache?: boolean;
}): Promise<EspnDraftMarketSnapshot> {
  const season = options.season;
  const scoring = options.scoring ?? 'PPR';
  if (!Number.isInteger(season) || season < 2020 || season > 2100) throw new Error('Invalid ESPN draft market season.');
  if (!['PPR', 'HALF_PPR', 'STANDARD'].includes(scoring)) throw new Error('Invalid ESPN draft scoring type.');

  const now = options.now?.() ?? Date.now();
  const cacheKey = `${season}:${scoring}`;
  const cached = cache.get(cacheKey);
  if (!options.bypassCache && cached && cached.expiresAt > now) return cached.snapshot;

  const sourceEndpoint = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=0&view=kona_player_info`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(sourceEndpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TIBER-Command-Center/1.0',
      'X-Fantasy-Source': 'kona',
      'X-Fantasy-Filter': JSON.stringify(buildFilter(scoring)),
    },
  });
  if (!response.ok) throw new Error(`ESPN draft market returned HTTP ${response.status}.`);

  const payload = await response.json();
  const snapshot = parseEspnDraftMarketPayload(payload, {
    season,
    scoring,
    fetchedAt: new Date(now).toISOString(),
    sourceEndpoint,
  });
  if (snapshot.rows.length < 20) {
    throw new Error(`ESPN draft market coverage is insufficient (${snapshot.rows.length} usable rows).`);
  }

  cache.set(cacheKey, { expiresAt: now + CACHE_MS, snapshot });
  return snapshot;
}
