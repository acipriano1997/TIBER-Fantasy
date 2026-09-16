import {
  nflversePlayersUrl,
  parseNflversePlayerIdCrosswalkCsv,
  CCFNflversePlayerIdCrosswalkError,
  type CCFNflversePlayerIdCrosswalkRow,
} from "./nflversePlayerIdCrosswalk";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";

const NFLVERSE_DATA_LICENSE =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license; underlying-source intended-use rights remain separately governed)";
const CROSSWALK_PARSER_VERSION = "ccf-nflverse-pfr-gsis-crosswalk-v1";

export interface CCFArchivedNflversePlayerIdCrosswalkOptions {
  archiveRootDir: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface CCFArchivedNflversePlayerIdCrosswalkSnapshot {
  rows: CCFNflversePlayerIdCrosswalkRow[];
  retrievedAt: string;
  knownAt: string;
  sourceUrl: string;
  etag: string | null;
  lastModified: string | null;
  archive: CCFArchivedSourceSnapshot;
}

/**
 * Prospectively archive the complete nflverse players release before exposing
 * exact PFR <-> GSIS identity links. `knownAt` is always CCF retrieval time;
 * provider modification metadata cannot backdate identity knowledge.
 *
 * This is identity candidate infrastructure only. It does not establish
 * intended-use permission for downstream PFR or NFL data and does not create a
 * GSIS -> canonical CCF player binding by itself.
 */
export async function fetchAndArchiveNflversePlayerIdCrosswalk(
  options: CCFArchivedNflversePlayerIdCrosswalkOptions,
): Promise<CCFArchivedNflversePlayerIdCrosswalkSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflversePlayersUrl();
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
    throw new CCFNflversePlayerIdCrosswalkError(
      `nflverse players fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const retrievedAt = now().toISOString();
  const rows = parseNflversePlayerIdCrosswalkCsv(csv);
  if (rows.length === 0) {
    throw new CCFNflversePlayerIdCrosswalkError(
      "nflverse players returned no exact PFR <-> GSIS identity rows",
    );
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const archive = await archiveCCFSourceSnapshot({
    rootDir: options.archiveRootDir,
    provider: "nflverse",
    dataset: "players",
    sourceUrl,
    license: NFLVERSE_DATA_LICENSE,
    parserVersion: CROSSWALK_PARSER_VERSION,
    content: csv,
    retrievedAt,
    knownAt: retrievedAt,
    knownAtBasis: "ccf_capture",
    sourceLastModified: lastModified,
    etag,
  });

  return {
    rows,
    retrievedAt,
    knownAt: retrievedAt,
    sourceUrl,
    etag,
    lastModified,
    archive,
  };
}
