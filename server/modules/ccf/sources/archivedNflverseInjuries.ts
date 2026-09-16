import {
  nflverseInjuriesUrl,
  parseNflverseInjuriesCsv,
  CCFNflverseInjurySourceError,
  type CCFNflverseInjuryOptions,
  type CCFNflverseInjuryReportRow,
} from "./nflverseInjuries";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";

const NFLVERSE_DATA_LICENSE =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license; intended-use rights remain separately governed)";
const INJURY_PARSER_VERSION = "ccf-nflverse-injuries-candidate-v2";

export interface CCFArchivedNflverseInjuryOptions extends CCFNflverseInjuryOptions {
  archiveRootDir: string;
}

export interface CCFArchivedNflverseInjurySnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflverseInjuryReportRow[];
  retrievedAt: string;
  knownAt: string;
  sourceUrl: string;
  etag: string | null;
  lastModified: string | null;
  archive: CCFArchivedSourceSnapshot;
}

/**
 * Fetch and archive the exact nflverse injury/practice bytes before returning
 * parsed evidence. This creates a prospective CCF point-in-time witness only:
 * knownAt is the moment CCF retrieved the response. Neither HTTP Last-Modified
 * nor row-level date_modified is allowed to backdate what CCF knew.
 *
 * This function does not clear intended-use rights, certify reliability, infer
 * game activation, or grant recommendation authority.
 */
export async function fetchAndArchiveNflverseInjuries(
  options: CCFArchivedNflverseInjuryOptions,
): Promise<CCFArchivedNflverseInjurySnapshot> {
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
  const retrievedAt = now().toISOString();
  const rows = parseNflverseInjuriesCsv(csv, options);
  if (rows.length === 0) {
    throw new CCFNflverseInjurySourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} injury rows`,
    );
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const archive = await archiveCCFSourceSnapshot({
    rootDir: options.archiveRootDir,
    provider: "nflverse",
    dataset: "injuries",
    sourceUrl,
    license: NFLVERSE_DATA_LICENSE,
    parserVersion: INJURY_PARSER_VERSION,
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
    retrievedAt,
    knownAt: retrievedAt,
    sourceUrl,
    etag,
    lastModified,
    archive,
  };
}
