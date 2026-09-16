import { sql } from "drizzle-orm";
import { db } from "../../../infra/db";
import {
  materializeCCFNFLPlayerIdentityRegistrySnapshot,
  type CCFNFLPlayerIdentityRegistrySnapshot,
  type CCFNFLPlayerIdentityRegistrySourceRow,
} from "./nflPlayerIdentityRegistrySnapshot";

export interface CaptureCCFNFLPlayerIdentityRegistryInput {
  archiveRootDir: string;
  now?: () => Date;
}

export async function readCCFNFLPlayerIdentityRegistryRows(): Promise<
  CCFNFLPlayerIdentityRegistrySourceRow[]
> {
  // This deliberately reads only exact identity columns. Names, teams, fantasy
  // positions and other heuristic fields are excluded so this capture cannot
  // silently become a fuzzy identity resolver.
  const result = await db.execute(sql`
    SELECT
      canonical_id,
      tiber_player_id,
      gsis_id,
      merged_into
    FROM player_identity_map
    WHERE gsis_id IS NOT NULL
    ORDER BY gsis_id ASC, canonical_id ASC
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    canonicalId: String(row.canonical_id ?? ""),
    tiberPlayerId:
      row.tiber_player_id == null ? null : String(row.tiber_player_id),
    gsisId: row.gsis_id == null ? null : String(row.gsis_id),
    mergedInto: row.merged_into == null ? null : String(row.merged_into),
  }));
}

/**
 * Capture the authoritative *current* GSIS→TIBER registry state and archive it
 * prospectively. The query result is materialized first; only after the query
 * completes do we assign capturedAt/knownAt. This is intentionally conservative
 * and never backdates knowledge to player_identity_map.updated_at or migration
 * time.
 */
export async function captureCCFNFLPlayerIdentityRegistry(
  input: CaptureCCFNFLPlayerIdentityRegistryInput,
): Promise<CCFNFLPlayerIdentityRegistrySnapshot> {
  const rows = await readCCFNFLPlayerIdentityRegistryRows();
  const capturedAt = (input.now ?? (() => new Date()))().toISOString();
  return materializeCCFNFLPlayerIdentityRegistrySnapshot({
    sourceRows: rows,
    archiveRootDir: input.archiveRootDir,
    capturedAt,
  });
}
