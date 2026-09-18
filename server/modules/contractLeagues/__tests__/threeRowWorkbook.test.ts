import {
  ContractWorkbookImportError,
  importThreeRowContractWorkbook,
  type ContractWorkbookSheet,
  type ThreeRowContractWorkbookImportConfig,
} from '../importers/threeRowWorkbook';

function makeSheet(
  name: string,
  leagueName: string,
  seasonTokens: Array<number | string>,
  options: { status?: string | number; capRemaining?: number[] } = {},
): ContractWorkbookSheet {
  const rows: Array<Array<string | number | null>> = [];
  const seasonOne = seasonTokens[0];
  const seasonTwo = seasonTokens[1];

  rows.push([
    leagueName, null, null,
    seasonOne, seasonTwo, null, null, null, null,
    null, null, null,
    null,
  ]);

  // Three-row player block: guaranteed -> optional -> cap hit.
  rows.push([
    options.status ?? 1, 'QB', 'Player One',
    10, 5, null, null, null, null,
    7.5, 15, null,
    'Dead Cap', seasonOne, seasonTwo,
  ]);
  rows.push([
    null, null, null,
    2, 3, null, null, null, null,
    null, null, null,
    'Former Player', 1, 2,
  ]);
  rows.push([
    null, null, null,
    12, 8, null, null, null, null,
    null, null, null,
    null,
  ]);

  rows.push([null, null, 'Total Guaranteed', 10, 5]);
  rows.push([null, null, 'Total Cap Hit', 13, 10]);
  rows.push([null, null, 'Cap after Guarantees', 90, 95]);
  rows.push([
    null,
    null,
    'Cap Remaining:',
    ...(options.capRemaining ?? [87, 90]),
  ]);

  // Ensure the player loop has two trailing rows available without creating a
  // false player block.
  rows.push([]);
  rows.push([]);

  return { name, rows };
}

function makeConfig(): ThreeRowContractWorkbookImportConfig {
  return {
    league: {
      sourceLeagueName: 'Synthetic League',
      platform: 'manual',
      platformLeagueId: null,
      season: 2026,
      salaryCap: 100,
      scoring: {
        passYardsPerPoint: 25,
        passTd: 4,
        interceptionThrown: -2,
        rushYardsPerPoint: 10,
        rushTd: 6,
        reception: 1,
        receivingYardsPerPoint: 10,
        receivingTd: 6,
        teReceptionBonus: 0,
        fumbleLost: -2,
        twoPointConversion: 2,
      },
      lineup: [
        { slot: 'QB', count: 1, eligiblePositions: ['QB'] },
      ],
    },
    provenance: {
      sourceKind: 'google_drive_excel',
      sourceDisplayName: 'Private Synthetic Workbook',
      sourceLocator: null,
      sourceModifiedAt: '2026-09-15T12:00:00.000Z',
      importedAt: '2026-09-15T16:00:00.000Z',
    },
    canonicalPlayerIdsBySourceName: {
      'Player One': 'tbr_p_player_one',
    },
  };
}

describe('three-row contract workbook importer', () => {
  it('maps guaranteed, optional, cap-hit, dead-cap, status, and authoritative cap totals', () => {
    const snapshot = importThreeRowContractWorkbook({
      sheets: [makeSheet('Team Alpha', 'Synthetic League', [2026, 2027], {
        status: 'IR',
        capRemaining: [-3, 90],
      })],
    }, makeConfig());

    expect(snapshot.validation.status).toBe('VALID');
    expect(snapshot.teams).toHaveLength(1);
    expect(snapshot.teams[0].contracts[0]).toMatchObject({
      sourcePlayerName: 'Player One',
      canonicalPlayerId: 'tbr_p_player_one',
      status: 'IR',
      totalValue: 15,
      aav: 7.5,
      years: [
        { season: 2026, guaranteed: 10, optional: 2, capHit: 12 },
        { season: 2027, guaranteed: 5, optional: 3, capHit: 8 },
      ],
    });
    expect(snapshot.teams[0].deadCap).toEqual([
      {
        sourcePlayerName: 'Former Player',
        canonicalPlayerId: null,
        years: [
          { season: 2026, amount: 1 },
          { season: 2027, amount: 2 },
        ],
      },
    ]);
    expect(snapshot.teams[0].cap[0].capRemaining).toBe(-3);
  });

  it('quarantines an ordinal-year team tab instead of guessing calendar seasons', () => {
    const snapshot = importThreeRowContractWorkbook({
      sheets: [
        makeSheet('Calendar Team', 'Synthetic League', [2026, 2027]),
        makeSheet('Ordinal Team', 'Synthetic League', [1, 2]),
      ],
    }, makeConfig());

    expect(snapshot.teams.map((team) => team.sourceTeamName)).toEqual(['Calendar Team']);
    expect(snapshot.validation.status).toBe('PARTIAL');
    expect(snapshot.validation.unresolved.some(
      (item) => item.code === 'SEASON_MAPPING_REQUIRED' && item.path.includes('Ordinal Team'),
    )).toBe(true);
  });

  it('accepts ordinal-year headers only when an explicit sheet mapping is supplied', () => {
    const config = makeConfig();
    config.seasonMapBySheet = {
      'Ordinal Team': { '1': 2026, '2': 2027 },
    };

    const snapshot = importThreeRowContractWorkbook({
      sheets: [makeSheet('Ordinal Team', 'Synthetic League', [1, 2])],
    }, config);

    expect(snapshot.validation.status).toBe('VALID');
    expect(snapshot.teams[0].contracts[0].years.map((year) => year.season)).toEqual([2026, 2027]);
  });

  it('marks a workbook partial when canonical player identity is not governed yet', () => {
    const config = makeConfig();
    delete config.canonicalPlayerIdsBySourceName;

    const snapshot = importThreeRowContractWorkbook({
      sheets: [makeSheet('Team Alpha', 'Synthetic League', [2026, 2027])],
    }, config);

    expect(snapshot.validation.status).toBe('PARTIAL');
    expect(snapshot.teams[0].contracts[0].canonicalPlayerId).toBeNull();
    expect(snapshot.validation.unresolved.some((item) => item.code === 'PLAYER_ID_UNRESOLVED')).toBe(true);
  });

  it('marks missing scoring/lineup authority explicitly rather than defaulting', () => {
    const config = makeConfig();
    config.league.scoring = null;
    config.league.lineup = [];

    const snapshot = importThreeRowContractWorkbook({
      sheets: [makeSheet('Team Alpha', 'Synthetic League', [2026, 2027])],
    }, config);

    expect(snapshot.validation.status).toBe('PARTIAL');
    expect(snapshot.validation.unresolved.map((item) => item.code)).toEqual(
      expect.arrayContaining(['SCORING_UNAVAILABLE', 'LINEUP_RULES_UNAVAILABLE']),
    );
  });

  it('fails when every candidate team sheet requires guessed season structure', () => {
    expect(() => importThreeRowContractWorkbook({
      sheets: [makeSheet('Ordinal Team', 'Synthetic League', [1, 2])],
    }, makeConfig())).toThrow(ContractWorkbookImportError);
  });
});
