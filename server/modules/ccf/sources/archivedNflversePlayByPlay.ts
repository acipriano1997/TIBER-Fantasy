import {
  aggregateNflverseFantasyOpportunity,
  nflversePlayByPlayUrl,
  parseNflversePlayByPlayCsv,
  CCFNflversePlayByPlaySourceError,
  type CCFNflversePlayByPlayOptions,
  type CCFNflversePlayByPlayRow,
  type CCFNflversePlayerOpportunitySummary,
} from "./nflversePlayByPlay";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";

const NFLVERSE_DATA_LICENSE =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license; intended-use rights remain separately governed)";
const PBP_PARSER_VERSION = "ccf-nflverse-play-by-play-candidate-v1";

export interface CCFArchivedNflversePlayByPlayOptions
  extends CCFNflversePlayByPlayOptions {
  archiveRootDir: string;
}

export interface CCFArchivedNflversePlayByPlaySnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflversePlayByPlayRow[];
  opportunities: CCFNflversePlayerOpportunitySummary[];
  retrievedAt: string;
  knownAt: string;
  sourceUrl: string;
  etag: string | null;
  lastModified: string | null;
  evidenceTiming: "post_play_observed";
  archive: CCFArchivedSourceSnapshot;
}

/**
 * Fetch and immutably archive exact nflverse play-by-play bytes before derived
 * opportunity evidence is returned to CCF consumers.
 *
 * `knownAt` is always the CCF retrieval instant; source Last-Modified metadata
 * cannot backdate what CCF knew. This is candidate/evaluation infrastructure
 * only and does not clear intended-use rights or source promotion.
 */
export async function fetchAndArchiveNflversePlayByPlay(
  options: CCFArchivedNflversePlayByPlayOptions,
): Promise<CCFArchivedNflversePlayByPlaySnapshot> {
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
  const retrievedAt = now().toISOString();
  const rows = parseNflversePlayByPlayCsv(csv, options);
  if (rows.length === 0) {
    throw new CCFNflversePlayByPlaySourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} play-by-play rows`,
    );
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const archive = await archiveCCFSourceSnapshot({
    rootDir: options.archiveRootDir,
    provider: "nflverse",
    dataset: "play_by_play",
    sourceUrl,
    license: NFLVERSE_DATA_LICENSE,
    parserVersion: PBP_PARSER_VERSION,
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
    rows,
    opportunities: aggregateNflverseFantasyOpportunity(rows),
    retrievedAt,
    knownAt: retrievedAt,
    sourceUrl,
    etag,
    lastModified,
    evidenceTiming: "post_play_observed",
    archive,
  };
}
