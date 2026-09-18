import {
  contractLeagueSnapshotSchema,
  validateContractLeagueSnapshot,
} from '../contracts';

const validSnapshot = {
  schemaVersion: 'contract-league-snapshot.v1' as const,
  league: {
    sourceLeagueName: 'Synthetic Contract League',
    platform: 'sleeper' as const,
    platformLeagueId: null,
    season: 2026,
    salaryCap: 250_000_000,
    scoring: {
      passYardsPerPoint: 25,
      passTd: 4,
      interceptionThrown: -2,
      rushYardsPerPoint: 10,
      rushTd: 6,
      reception: 1,
      receivingYardsPerPoint: 10,
      receivingTd: 6,
      teReceptionBonus: 0.75,
      fumbleLost: -2,
      twoPointConversion: 2,
    },
    lineup: [
      { slot: 'QB' as const, count: 1, eligiblePositions: ['QB' as const] },
      { slot: 'FLEX' as const, count: 2, eligiblePositions: ['RB' as const, 'WR' as const, 'TE' as const] },
      { slot: 'SUPERFLEX' as const, count: 1, eligiblePositions: ['QB' as const, 'RB' as const, 'WR' as const, 'TE' as const] },
    ],
  },
  teams: [
    {
      sourceTeamName: 'Synthetic Team',
      contracts: [
        {
          sourcePlayerName: 'Example Player',
          canonicalPlayerId: null,
          position: 'TE' as const,
          status: 'ACTIVE' as const,
          totalValue: 30_000_000,
          aav: 10_000_000,
          years: [
            { season: 2026, guaranteed: 6_000_000, optional: 4_000_000, capHit: 10_000_000 },
            { season: 2027, guaranteed: 4_000_000, optional: 6_000_000, capHit: 10_000_000 },
          ],
          metadata: { notes: [] },
        },
      ],
      deadCap: [],
      cap: [
        {
          season: 2026,
          totalGuaranteed: 245_000_000,
          totalCapHit: 250_000_000,
          capAfterGuarantees: 5_000_000,
          capRemaining: 0,
        },
        {
          season: 2027,
          totalGuaranteed: 200_000_000,
          totalCapHit: 271_500_000,
          capAfterGuarantees: 50_000_000,
          capRemaining: -21_500_000,
        },
      ],
    },
  ],
  provenance: {
    sourceKind: 'google_drive_excel' as const,
    sourceDisplayName: 'private-source.xlsx',
    sourceLocator: null,
    sourceModifiedAt: '2026-09-14T01:31:46.709Z',
    importedAt: '2026-09-15T14:30:00.000Z',
    importerVersion: 'contract-league-importer.v1',
  },
  validation: {
    status: 'PARTIAL' as const,
    warnings: ['Synthetic warning'],
    unresolved: [
      {
        code: 'AMBIGUOUS_YEAR_HEADER',
        path: 'teams[0].contracts[0].years',
        detail: 'Source used ordinal year labels and requires explicit season mapping.',
      },
    ],
  },
};

describe('contract league snapshot contract', () => {
  it('accepts a validated snapshot and preserves negative future cap space', () => {
    const parsed = contractLeagueSnapshotSchema.parse(validSnapshot);
    expect(parsed.teams[0].cap[1].capRemaining).toBe(-21_500_000);
    expect(parsed.validation.status).toBe('PARTIAL');
  });

  it('fails closed when a contract year is not mapped to a calendar season', () => {
    const invalid = structuredClone(validSnapshot) as any;
    invalid.teams[0].contracts[0].years[0].season = 1;

    const parsed = validateContractLeagueSnapshot(invalid);
    expect(parsed.success).toBe(false);
  });

  it('does not require a canonical player id when identity resolution is unresolved', () => {
    const parsed = contractLeagueSnapshotSchema.parse(validSnapshot);
    expect(parsed.teams[0].contracts[0].canonicalPlayerId).toBeNull();
  });
});
