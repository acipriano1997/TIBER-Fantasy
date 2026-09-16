import {
  nflverseSnapCountsUrl,
  parseNflverseSnapCountsCsv,
  CCFNflverseSnapCountSourceError,
  type CCFNflverseSnapCountOptions,
  type CCFNflverseSnapCountRow,
  type CCFNflverseSnapPosition,
} from "./nflverseSnapCounts";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";

const NFLVERSE_DATA_LICENSE =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license; Pro Football Reference intended-use rights remain separately governed)";
const SNAP_PARSER_VERSION = "ccf-nflverse-snap-counts-candidate-v2";
const DEFAULT_POSITIONS: CCFNflverseSnapPosition[] = ["QB", "RB", "WR", "TE"];

export interface CCFArchivedNflverseSnapCountOptions
  extends CCFNflverseSnapCountOptions {
  archiveRootDir: string;
}

export interface CCFArchivedNflverseSnapCountSnapshot {
  season: number;
  requestedWeek?: number;
  positions: CCFNflverseSnapPosition[];
  rows: CCFNflverseSnapCountRow[];
  retrievedAt: string;
  knownAt: string;
  sourceUrl: string;
  etag: string | null;
  lastModified: string | null;
  evidenceTiming: "post_game_observed";
  archive: CCFArchivedSourceSnapshot;
}

/**
 * Fetch and archive the exact nflverse snap-count bytes before returning parsed
 * workload evidence. This is a prospective point-in-time capture path: knownAt
 * is the CCF retrieval time and HTTP Last-Modified never backdates it.
 *
 * The requested position scope is persisted with the parsed snapshot so source
 * qualification cannot mistake a filtered capture for complete QB/RB/WR/TE
 * coverage. It does not certify upstream reliability, PFR intended-use rights,
 * historical replay, or recommendation authority.
 */
export async function fetchAndArchiveNflverseSnapCounts(
  options: CCFArchivedNflverseSnapCountOptions,
): Promise<CCFArchivedNflverseSnapCountSnapshot> {
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
  const retrievedAt = now().toISOString();
  const rows = parseNflverseSnapCountsCsv(csv, options);
  if (rows.length === 0) {
    throw new CCFNflverseSnapCountSourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} snap-count rows`,
    );
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const archive = await archiveCCFSourceSnapshot({
    rootDir: options.archiveRootDir,
    provider: "nflverse",
    dataset: "snap_counts",
    sourceUrl,
    license: NFLVERSE_DATA_LICENSE,
    parserVersion: SNAP_PARSER_VERSION,
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
    positions: [...(options.positions ?? DEFAULT_POSITIONS)],
    rows,
    retrievedAt,
    knownAt: retrievedAt,
    sourceUrl,
    etag,
    lastModified,
    evidenceTiming: "post_game_observed",
    archive,
  };
}
