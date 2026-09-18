import {
  contractLeagueSnapshotSchema,
  type ContractLeagueSnapshot,
} from '../contracts';

export const THREE_ROW_CONTRACT_WORKBOOK_IMPORTER_VERSION = 'three-row-contract-workbook.v1';

export type ContractWorkbookCell = string | number | boolean | null | undefined;

export type ContractWorkbookSheet = {
  name: string;
  rows: ContractWorkbookCell[][];
};

export type ContractWorkbook = {
  sheets: ContractWorkbookSheet[];
};

export type ThreeRowContractWorkbookLayout = {
  leagueNameColumn: number;
  statusColumn: number;
  positionColumn: number;
  playerColumn: number;
  seasonStartColumn: number;
  seasonColumnCount: number;
  aavColumn: number;
  totalValueColumn: number;
  deadCapPlayerColumn: number;
  deadCapSeasonStartColumn: number;
  totalsLabelColumn: number;
};

export type ThreeRowContractWorkbookImportConfig = {
  league: ContractLeagueSnapshot['league'];
  provenance: Omit<ContractLeagueSnapshot['provenance'], 'importerVersion'> & {
    importerVersion?: string;
  };

  /**
   * Explicit source-token -> calendar-season mappings, keyed by sheet name.
   * Example: { "Team A": { "1": 2026, "2": 2027 } }
   *
   * Ordinal headers are never converted by arithmetic or workbook position.
   */
  seasonMapBySheet?: Record<string, Record<string, number>>;

  /**
   * Governed identity mappings supplied by a verified binding layer. Exact
   * source names are normalized for case/whitespace only; fuzzy matching is
   * intentionally forbidden here.
   */
  canonicalPlayerIdsBySourceName?: Record<string, string>;

  /** Optional allow-list when a workbook contains non-team utility sheets. */
  teamSheetNames?: string[];

  /** Parser layout override for the same three-row workbook family. */
  layout?: Partial<ThreeRowContractWorkbookLayout>;
};

export class ContractWorkbookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractWorkbookImportError';
  }
}

const DEFAULT_LAYOUT: ThreeRowContractWorkbookLayout = {
  leagueNameColumn: 0,
  statusColumn: 0,
  positionColumn: 1,
  playerColumn: 2,
  seasonStartColumn: 3,
  seasonColumnCount: 6,
  aavColumn: 9,
  totalValueColumn: 10,
  deadCapPlayerColumn: 12,
  deadCapSeasonStartColumn: 13,
  totalsLabelColumn: 2,
};

const POSITION_VALUES = new Set(['QB', 'RB', 'WR', 'TE']);

function text(value: ContractWorkbookCell): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function key(value: ContractWorkbookCell): string {
  return text(value).replace(/\s+/g, ' ').toLowerCase();
}

function parseFiniteNumber(
  value: ContractWorkbookCell,
  options: { allowNegative: boolean; blankAsZero?: boolean },
): number | null {
  if (value === null || value === undefined || text(value) === '') {
    return options.blankAsZero ? 0 : null;
  }

  if (typeof value === 'boolean') return null;

  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else {
    const normalized = value
      .trim()
      .replace(/[$,]/g, '')
      .replace(/^\((.*)\)$/, '-$1');
    if (!normalized || /^#/.test(normalized)) return null;
    parsed = Number(normalized);
  }

  if (!Number.isFinite(parsed)) return null;
  if (!options.allowNegative && parsed < 0) return null;
  return parsed;
}

function parseMoney(
  value: ContractWorkbookCell,
  path: string,
  unresolved: ContractLeagueSnapshot['validation']['unresolved'],
  options: { allowNegative?: boolean; blankAsZero?: boolean } = {},
): number {
  const parsed = parseFiniteNumber(value, {
    allowNegative: options.allowNegative ?? false,
    blankAsZero: options.blankAsZero ?? true,
  });
  if (parsed !== null) return parsed;

  unresolved.push({
    code: 'INVALID_MONEY_CELL',
    path,
    detail: `Expected a finite${options.allowNegative ? '' : ' non-negative'} numeric money value.`,
  });
  return 0;
}

function resolveSeason(
  token: ContractWorkbookCell,
  explicitMap: Record<string, number> | undefined,
): number | null {
  const raw = text(token);
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 2000 && numeric <= 2200) {
    return numeric;
  }

  const mapped = explicitMap?.[raw];
  if (Number.isInteger(mapped) && mapped! >= 2000 && mapped! <= 2200) {
    return mapped!;
  }

  return null;
}

function normalizeIdentityMap(
  input: Record<string, string> | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [sourceName, canonicalId] of Object.entries(input ?? {})) {
    const sourceKey = key(sourceName);
    const canonical = canonicalId.trim();
    if (sourceKey && canonical) out.set(sourceKey, canonical);
  }
  return out;
}

function statusFromCell(value: ContractWorkbookCell): ContractLeagueSnapshot['teams'][number]['contracts'][number]['status'] {
  const normalized = key(value);
  if (normalized === 'ir') return 'IR';
  if (normalized === 'season ending ir' || normalized === 'season-ending ir') {
    return 'SEASON_ENDING_IR';
  }
  return 'ACTIVE';
}

function hasTeamSheetMarker(
  sheet: ContractWorkbookSheet,
  config: ThreeRowContractWorkbookImportConfig,
  layout: ThreeRowContractWorkbookLayout,
): boolean {
  if (config.teamSheetNames?.length) {
    return config.teamSheetNames.some((name) => key(name) === key(sheet.name));
  }

  const marker = sheet.rows[0]?.[layout.leagueNameColumn];
  return key(marker) === key(config.league.sourceLeagueName);
}

function getSeasonColumns(
  sheet: ContractWorkbookSheet,
  layout: ThreeRowContractWorkbookLayout,
  explicitMap: Record<string, number> | undefined,
) {
  const header = sheet.rows[0] ?? [];
  const seasons: Array<{ column: number; season: number }> = [];
  const unresolvedTokens: Array<{ column: number; token: string }> = [];

  for (let offset = 0; offset < layout.seasonColumnCount; offset += 1) {
    const column = layout.seasonStartColumn + offset;
    const token = header[column];
    if (!text(token)) continue;
    const season = resolveSeason(token, explicitMap);
    if (season === null) {
      unresolvedTokens.push({ column, token: text(token) });
    } else {
      seasons.push({ column, season });
    }
  }

  return { seasons, unresolvedTokens };
}

function getTotalsRow(
  rows: ContractWorkbookCell[][],
  labelColumn: number,
  label: string,
): ContractWorkbookCell[] | null {
  const target = key(label);
  return rows.find((row) => key(row[labelColumn]) === target) ?? null;
}

function importTeamSheet(
  sheet: ContractWorkbookSheet,
  config: ThreeRowContractWorkbookImportConfig,
  layout: ThreeRowContractWorkbookLayout,
  identityMap: Map<string, string>,
  unresolved: ContractLeagueSnapshot['validation']['unresolved'],
  warnings: string[],
): ContractLeagueSnapshot['teams'][number] | null {
  const seasonMap = config.seasonMapBySheet?.[sheet.name];
  const { seasons, unresolvedTokens } = getSeasonColumns(sheet, layout, seasonMap);

  if (unresolvedTokens.length) {
    for (const item of unresolvedTokens) {
      unresolved.push({
        code: 'SEASON_MAPPING_REQUIRED',
        path: `sheets.${sheet.name}.columns.${item.column}`,
        detail: `Season header ${JSON.stringify(item.token)} is not a calendar year and has no explicit mapping.`,
      });
    }
    warnings.push(`Skipped ${sheet.name}: one or more contract-season headers require an explicit calendar mapping.`);
    return null;
  }

  if (!seasons.length) {
    unresolved.push({
      code: 'SEASON_HEADERS_MISSING',
      path: `sheets.${sheet.name}.row.0`,
      detail: 'No usable contract-season headers were found.',
    });
    warnings.push(`Skipped ${sheet.name}: no usable contract-season headers.`);
    return null;
  }

  const contracts: ContractLeagueSnapshot['teams'][number]['contracts'] = [];

  for (let rowIndex = 1; rowIndex < sheet.rows.length - 2; rowIndex += 1) {
    const guaranteedRow = sheet.rows[rowIndex] ?? [];
    const position = text(guaranteedRow[layout.positionColumn]).toUpperCase();
    const sourcePlayerName = text(guaranteedRow[layout.playerColumn]);
    if (!POSITION_VALUES.has(position) || !sourcePlayerName) continue;

    const optionalRow = sheet.rows[rowIndex + 1] ?? [];
    const capHitRow = sheet.rows[rowIndex + 2] ?? [];
    const years = seasons
      .map(({ column, season }) => ({
        season,
        guaranteed: parseMoney(
          guaranteedRow[column],
          `sheets.${sheet.name}.rows.${rowIndex}.season.${season}.guaranteed`,
          unresolved,
        ),
        optional: parseMoney(
          optionalRow[column],
          `sheets.${sheet.name}.rows.${rowIndex + 1}.season.${season}.optional`,
          unresolved,
        ),
        capHit: parseMoney(
          capHitRow[column],
          `sheets.${sheet.name}.rows.${rowIndex + 2}.season.${season}.capHit`,
          unresolved,
        ),
      }))
      .filter((year) => year.guaranteed !== 0 || year.optional !== 0 || year.capHit !== 0);

    if (!years.length) {
      warnings.push(`Skipped contract row for ${sourcePlayerName} on ${sheet.name}: no non-zero contract seasons.`);
      continue;
    }

    const canonicalPlayerId = identityMap.get(key(sourcePlayerName)) ?? null;
    if (!canonicalPlayerId) {
      unresolved.push({
        code: 'PLAYER_ID_UNRESOLVED',
        path: `sheets.${sheet.name}.rows.${rowIndex}.player`,
        detail: `No governed canonical player ID is bound for ${sourcePlayerName}.`,
      });
    }

    const totalValue = parseFiniteNumber(guaranteedRow[layout.totalValueColumn], {
      allowNegative: false,
      blankAsZero: false,
    });
    const aav = parseFiniteNumber(guaranteedRow[layout.aavColumn], {
      allowNegative: false,
      blankAsZero: false,
    });

    contracts.push({
      sourcePlayerName,
      canonicalPlayerId,
      position: position as 'QB' | 'RB' | 'WR' | 'TE',
      status: statusFromCell(guaranteedRow[layout.statusColumn]),
      totalValue,
      aav,
      years,
      metadata: { notes: [] },
    });
  }

  const deadCap: ContractLeagueSnapshot['teams'][number]['deadCap'] = [];
  const deadCapHeaderIndex = sheet.rows.findIndex(
    (row) => key(row[layout.deadCapPlayerColumn]) === 'dead cap',
  );

  if (deadCapHeaderIndex >= 0) {
    const deadCapHeader = sheet.rows[deadCapHeaderIndex] ?? [];
    const deadCapSeasons = seasons.map(({ column, season }) => ({
      season,
      column: layout.deadCapSeasonStartColumn + (column - layout.seasonStartColumn),
    }));

    for (let rowIndex = deadCapHeaderIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const row = sheet.rows[rowIndex] ?? [];
      const sourcePlayerName = text(row[layout.deadCapPlayerColumn]);
      if (!sourcePlayerName) continue;
      if (key(row[layout.totalsLabelColumn]).startsWith('total ')) break;

      const years = deadCapSeasons
        .map(({ column, season }) => ({
          season,
          amount: parseMoney(
            row[column],
            `sheets.${sheet.name}.deadCap.${rowIndex}.season.${season}`,
            unresolved,
          ),
        }))
        .filter((year) => year.amount !== 0);
      if (!years.length) continue;

      deadCap.push({
        sourcePlayerName,
        canonicalPlayerId: identityMap.get(key(sourcePlayerName)) ?? null,
        years,
      });
    }
  }

  const totalGuaranteedRow = getTotalsRow(sheet.rows, layout.totalsLabelColumn, 'Total Guaranteed');
  const totalCapHitRow = getTotalsRow(sheet.rows, layout.totalsLabelColumn, 'Total Cap Hit');
  const capAfterGuaranteesRow = getTotalsRow(sheet.rows, layout.totalsLabelColumn, 'Cap after Guarantees');
  const capRemainingRow = getTotalsRow(sheet.rows, layout.totalsLabelColumn, 'Cap Remaining:')
    ?? getTotalsRow(sheet.rows, layout.totalsLabelColumn, 'Cap Remaining');

  if (!totalGuaranteedRow || !totalCapHitRow || !capAfterGuaranteesRow || !capRemainingRow) {
    unresolved.push({
      code: 'CAP_TOTALS_MISSING',
      path: `sheets.${sheet.name}.capTotals`,
      detail: 'Authoritative team cap-total rows are incomplete or missing.',
    });
    warnings.push(`Skipped ${sheet.name}: authoritative cap-total rows are incomplete.`);
    return null;
  }

  const cap = seasons.map(({ column, season }) => ({
    season,
    totalGuaranteed: parseMoney(
      totalGuaranteedRow[column],
      `sheets.${sheet.name}.cap.${season}.totalGuaranteed`,
      unresolved,
    ),
    totalCapHit: parseMoney(
      totalCapHitRow[column],
      `sheets.${sheet.name}.cap.${season}.totalCapHit`,
      unresolved,
    ),
    capAfterGuarantees: parseMoney(
      capAfterGuaranteesRow[column],
      `sheets.${sheet.name}.cap.${season}.capAfterGuarantees`,
      unresolved,
      { allowNegative: true },
    ),
    capRemaining: parseMoney(
      capRemainingRow[column],
      `sheets.${sheet.name}.cap.${season}.capRemaining`,
      unresolved,
      { allowNegative: true },
    ),
  }));

  for (const seasonCap of cap) {
    const contractCap = contracts.reduce((sum, contract) => (
      sum + (contract.years.find((year) => year.season === seasonCap.season)?.capHit ?? 0)
    ), 0);
    const deadCapAmount = deadCap.reduce((sum, entry) => (
      sum + (entry.years.find((year) => year.season === seasonCap.season)?.amount ?? 0)
    ), 0);
    const derived = contractCap + deadCapAmount;
    if (Math.abs(derived - seasonCap.totalCapHit) > 1) {
      unresolved.push({
        code: 'CAP_RECONCILIATION_MISMATCH',
        path: `sheets.${sheet.name}.cap.${seasonCap.season}.totalCapHit`,
        detail: `Imported contract/dead-cap sum ${derived} does not reconcile to source total cap hit ${seasonCap.totalCapHit}.`,
      });
    }
  }

  return {
    sourceTeamName: sheet.name,
    contracts,
    deadCap,
    cap,
  };
}

export function importThreeRowContractWorkbook(
  workbook: ContractWorkbook,
  config: ThreeRowContractWorkbookImportConfig,
): ContractLeagueSnapshot {
  const layout = { ...DEFAULT_LAYOUT, ...config.layout };
  const unresolved: ContractLeagueSnapshot['validation']['unresolved'] = [];
  const warnings: string[] = [];
  const identityMap = normalizeIdentityMap(config.canonicalPlayerIdsBySourceName);

  const candidateSheets = workbook.sheets.filter((sheet) =>
    hasTeamSheetMarker(sheet, config, layout),
  );

  if (!candidateSheets.length) {
    throw new ContractWorkbookImportError(
      `No team sheets matched league ${JSON.stringify(config.league.sourceLeagueName)}.`,
    );
  }

  const teams = candidateSheets
    .map((sheet) => importTeamSheet(
      sheet,
      config,
      layout,
      identityMap,
      unresolved,
      warnings,
    ))
    .filter((team): team is NonNullable<typeof team> => team !== null);

  if (!teams.length) {
    throw new ContractWorkbookImportError(
      'No team sheet could be imported without guessing unresolved season/cap structure.',
    );
  }

  if (config.league.scoring === null) {
    unresolved.push({
      code: 'SCORING_UNAVAILABLE',
      path: 'league.scoring',
      detail: 'Exact league scoring has not been supplied from an authoritative source.',
    });
  }
  if (!config.league.lineup.length) {
    unresolved.push({
      code: 'LINEUP_RULES_UNAVAILABLE',
      path: 'league.lineup',
      detail: 'Exact lineup-slot rules have not been supplied from an authoritative source.',
    });
  }

  const snapshot: ContractLeagueSnapshot = {
    schemaVersion: 'contract-league-snapshot.v1',
    league: config.league,
    teams,
    provenance: {
      ...config.provenance,
      importerVersion: config.provenance.importerVersion
        ?? THREE_ROW_CONTRACT_WORKBOOK_IMPORTER_VERSION,
    },
    validation: {
      status: unresolved.length ? 'PARTIAL' : 'VALID',
      warnings,
      unresolved,
    },
  };

  return contractLeagueSnapshotSchema.parse(snapshot);
}
