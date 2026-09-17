import Papa from "papaparse";

export interface CCFNflversePlayerIdCrosswalkRow {
  gsisId: string;
  pfrId: string;
  displayName: string | null;
  position: string | null;
}

export class CCFNflversePlayerIdCrosswalkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflversePlayerIdCrosswalkError";
  }
}

interface RawPlayerRow {
  gsis_id?: string;
  pfr_id?: string;
  display_name?: string;
  position?: string;
}

const REQUIRED_COLUMNS = ["gsis_id", "pfr_id", "display_name", "position"] as const;

export function nflversePlayersUrl(): string {
  return "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv";
}

function normalizedText(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text || text.toLowerCase() === "na") return null;
  return text;
}

/**
 * Parse only exact nflverse-maintained PFR <-> GSIS identity links.
 *
 * Rows missing either identifier are intentionally excluded: this source is an
 * exact external-ID bridge, never a name matcher. Both namespaces are enforced
 * one-to-one so ambiguous upstream identity cannot silently reach CCF.
 */
export function parseNflversePlayerIdCrosswalkCsv(
  csv: string,
): CCFNflversePlayerIdCrosswalkRow[] {
  const parsed = Papa.parse<RawPlayerRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new CCFNflversePlayerIdCrosswalkError(
      `failed to parse nflverse players CSV at row ${first.row ?? "unknown"}: ${first.message}`,
    );
  }

  const fields = new Set(parsed.meta.fields ?? []);
  const missing = REQUIRED_COLUMNS.filter((column) => !fields.has(column));
  if (missing.length > 0) {
    throw new CCFNflversePlayerIdCrosswalkError(
      `nflverse players schema missing required columns: ${missing.join(", ")}`,
    );
  }

  const byPfr = new Map<string, CCFNflversePlayerIdCrosswalkRow>();
  const gsisToPfr = new Map<string, string>();
  for (const raw of parsed.data) {
    const gsisId = normalizedText(raw.gsis_id);
    const pfrId = normalizedText(raw.pfr_id);
    if (!gsisId || !pfrId) continue;

    if (byPfr.has(pfrId)) {
      throw new CCFNflversePlayerIdCrosswalkError(`duplicate PFR player id ${pfrId}`);
    }
    const incumbentPfr = gsisToPfr.get(gsisId);
    if (incumbentPfr) {
      throw new CCFNflversePlayerIdCrosswalkError(
        `duplicate GSIS player id ${gsisId} mapped from ${incumbentPfr} and ${pfrId}`,
      );
    }

    const row: CCFNflversePlayerIdCrosswalkRow = {
      gsisId,
      pfrId,
      displayName: normalizedText(raw.display_name),
      position: normalizedText(raw.position)?.toUpperCase() ?? null,
    };
    byPfr.set(pfrId, row);
    gsisToPfr.set(gsisId, pfrId);
  }

  return Array.from(byPfr.values()).sort((left, right) =>
    left.pfrId.localeCompare(right.pfrId),
  );
}
