import {
  nflverseScheduleUrl,
  parseNflverseScheduleCsv,
  CCFNflverseScheduleSourceError,
  type CCFNflverseScheduleGame,
  type CCFNflverseScheduleOptions,
} from "./nflverseSchedule";
import {
  archiveCCFSourceSnapshot,
  type CCFArchivedSourceSnapshot,
} from "./rawSourceArchive";

const SCHEDULE_PARSER_VERSION = "ccf-nflverse-schedule-candidate-v1";
const NFLVERSE_DATA_LICENSE =
  "https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md (CC BY 4.0 repository license; intended-use promotion separately unreviewed)";

export interface CCFArchivedNflverseScheduleOptions extends CCFNflverseScheduleOptions {
  archiveRootDir: string;
}

export interface CCFArchivedNflverseScheduleSnapshot {
  season: number;
  requestedWeek?: number;
  rows: CCFNflverseScheduleGame[];
  retrievedAt: string;
  knownAt: string;
  sourceUrl: string;
  etag: string | null;
  lastModified: string | null;
  kickoffBasis: "nfldata_gameday_plus_documented_eastern_gametime";
  permissionState: "unreviewed";
  archive: CCFArchivedSourceSnapshot;
}

/**
 * Prospective capture for schedule/kickoff evidence.
 *
 * Exact bytes are archived before parsed rows leave this boundary. `knownAt` is
 * always the CCF retrieval time. A changed kickoff is therefore only knowable
 * from a later archived snapshot; Last-Modified never backdates a correction.
 *
 * The release asset carries the nflverse-data repository's CC BY 4.0 license,
 * but this adapter is not a production source promotion. Intended-use review,
 * prospective reliability and operator attestation remain separate gates.
 */
export async function fetchAndArchiveNflverseSchedule(
  options: CCFArchivedNflverseScheduleOptions,
): Promise<CCFArchivedNflverseScheduleSnapshot> {
  if (!Number.isInteger(options.season) || options.season < 1999 || options.season > 2100) {
    throw new CCFNflverseScheduleSourceError("season must be an integer within [1999, 2100]");
  }
  if (options.week != null && (!Number.isInteger(options.week) || options.week < 1 || options.week > 25)) {
    throw new CCFNflverseScheduleSourceError("week must be an integer within [1, 25]");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const sourceUrl = nflverseScheduleUrl();
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
    throw new CCFNflverseScheduleSourceError(
      `nflverse schedule fetch failed: ${response.status} ${response.statusText}`,
    );
  }

  const csv = await response.text();
  const retrievedAt = now().toISOString();
  const rows = parseNflverseScheduleCsv(csv, options);
  if (rows.length === 0) {
    throw new CCFNflverseScheduleSourceError(
      `nflverse returned no eligible ${options.season}${options.week ? ` week ${options.week}` : ""} schedule rows`,
    );
  }

  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const archive = await archiveCCFSourceSnapshot({
    rootDir: options.archiveRootDir,
    provider: "nflverse",
    dataset: "schedules",
    sourceUrl,
    license: NFLVERSE_DATA_LICENSE,
    parserVersion: SCHEDULE_PARSER_VERSION,
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
    kickoffBasis: "nfldata_gameday_plus_documented_eastern_gametime",
    permissionState: "unreviewed",
    archive,
  };
}
