import {
  nflverseWeeklyPlayerStatsUrl,
  parseNflverseWeeklyPlayerStatsCsv,
  CCFNflverseSourceError,
  type CCFNflverseWeeklyPlayerStatsOptions,
  type CCFNflverseWeeklyPlayerStat,
  type CCFNflversePosition,
} from "./nflverseWeeklyPlayerStats";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";

const NFLVERSE_DATA_LICENSE =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license; intended-use rights remain separately governed)";
const PLAYER_STATS_PARSER_VERSION = "ccf-nflverse-player-stats-v1";

export interface CCFArchivedNflverseWeeklyPlayerStatsOptions
  extends CCFNflverseWeeklyPlayerStatsOptions {
  archiveRootDir: string;
}

export interface CCFArchivedNflverseWeeklyPlayerStatsSnapshot {
  season: number;
  requestedWeek?: number;
  positions: CCFNflversePosition[];
  rows: CCFNflverseWeeklyPlayerStat[];
  retrievedAt: string;
  knownAt: string;
  sourceUrl: string;
  etag: string | null;
  lastModified: string | null;
  archive: CCFArchivedSourceSnapshot;
}

/**
 * Fetch and immutably archive the exact nflverse weekly player-stat bytes
 * before exposing parsed box-score evidence to CCF consumers.
 *
 * This creates only a prospective point-in-time witness. `knownAt` is the CCF
 * retrieval instant; HTTP Last-Modified never backdates what CCF knew. The
 * nflverse repository license is recorded for provenance, while intended-use
 * permission, empirical reliability, critical-field policy, and production
 * promotion remain separate fail-closed gates.
 */
export async function fetchAndArchiveNflverseWeeklyPlayerStats(
  options: CCFArchivedNflverseWeeklyPlayerStatsOptions,
): Promise<CCFArchivedNflverseWeeklyPlayerStatsSnapshot> {
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
  const retrievedAt = now().toISOString();
  const rows = parseNflverseWeeklyPlayerStatsCsv(csv, options);
  if (rows.length === 0) {
    throw new CCFNflverseSourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} QB/RB/WR/TE rows`,
    );
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const archive = await archiveCCFSourceSnapshot({
    rootDir: options.archiveRootDir,
    provider: "nflverse",
    dataset: "stats_player_week",
    sourceUrl,
    license: NFLVERSE_DATA_LICENSE,
    parserVersion: PLAYER_STATS_PARSER_VERSION,
    content: csv,
    retrievedAt,
    knownAt: retrievedAt,
    knownAtBasis: "ccf_capture",
    sourceLastModified: lastModified,
    etag,
  });

  return {
    season: options.season,
    requestedWeek: options.week,
    positions: [...(options.positions ?? ["QB", "RB", "WR", "TE"])],
    rows,
    retrievedAt,
    knownAt: retrievedAt,
    sourceUrl,
    etag,
    lastModified,
    archive,
  };
}
