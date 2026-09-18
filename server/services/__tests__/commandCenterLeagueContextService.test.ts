import {
  resolveCommandCenterLeagueContext,
} from '../commandCenterLeagueContextService';
import {
  clearContractLeagueRuleProfiles,
  registerContractLeagueRuleProfile,
} from '../../leagueRules/contractLeagueRegistry';

const NOW = new Date('2026-09-15T19:30:00.000Z');
const sixPointScoring = {
  pass_yd: 0.04,
  pass_td: 6,
  int: -1,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

function sleeperLeague(overrides: Record<string, unknown> = {}) {
  return {
    league_id: 'league-123',
    name: 'Ordinary Dynasty',
    season: '2026',
    scoring_settings: sixPointScoring,
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN'],
    ...overrides,
  } as any;
}

function registerSyntheticContractLeague() {
  registerContractLeagueRuleProfile({
    id: 'synthetic-contract-league',
    leagueName: 'Synthetic Contract League',
    aliases: [],
    sourceFiles: {
      operationalWorkbook: {
        driveFileId: 'synthetic-private-workbook-ref',
        displayName: 'Synthetic private workbook',
      },
      rulesSource: {
        sourceId: 'synthetic-rules-source',
        displayName: 'Synthetic rules source',
      },
    },
    verifiedCore: {
      salaryCap: 250,
      rookieDraftRounds: 4,
    },
    knownConflicts: [],
    unknownOrUnverified: [],
    leagueSpecificPolicy: {},
  });
}

describe('resolveCommandCenterLeagueContext', () => {
  beforeEach(() => clearContractLeagueRuleProfiles());
  afterAll(() => clearContractLeagueRuleProfiles());

  test('preserves live six-point passing TD scoring and certifies decision context', async () => {
    const resolved = await resolveCommandCenterLeagueContext(
      {
        id: 'internal-1',
        leagueName: 'Ordinary Dynasty',
        platform: 'sleeper',
        season: 2026,
        leagueIdExternal: 'league-123',
      },
      {
        getSleeperLeague: async () => sleeperLeague(),
        now: () => NOW,
      },
    );

    expect(resolved.status).toBe('ready');
    expect(resolved.context?.scoring.settings.pass_td).toBe(6);
    expect(resolved.scoring?.status).toBe('certified');
    expect(resolved.readiness.lineup?.ready).toBe(true);
    expect(resolved.readiness.waiver?.ready).toBe(true);
    expect(resolved.readiness.trade?.ready).toBe(true);
    expect(resolved.health?.contractWorkbook).toBe('not_applicable');
  });

  test('synthetic contract league trade stays blocked until a fresh workbook snapshot exists', async () => {
    registerSyntheticContractLeague();
    const resolved = await resolveCommandCenterLeagueContext(
      {
        id: 'internal-contract',
        leagueName: 'Synthetic Contract League',
        platform: 'sleeper',
        season: 2026,
        leagueIdExternal: 'league-123',
      },
      {
        getSleeperLeague: async () => sleeperLeague({ name: 'Synthetic Contract League' }),
        now: () => NOW,
      },
    );

    expect(resolved.context?.contractProfile?.id).toBe('synthetic-contract-league');
    expect(resolved.health?.contractWorkbook).toBe('unavailable');
    expect(resolved.readiness.trade?.ready).toBe(false);
    expect(resolved.readiness.trade?.blockers.join(' ')).toMatch(/contract workbook snapshot/i);
    expect(resolved.readiness.lineup?.ready).toBe(true);
  });

  test('platform scoring failure is represented as unavailable and never defaulted', async () => {
    const resolved = await resolveCommandCenterLeagueContext(
      {
        id: 'internal-1',
        leagueName: 'Ordinary Dynasty',
        platform: 'sleeper',
        season: 2026,
        leagueIdExternal: 'league-123',
      },
      {
        getSleeperLeague: async () => { throw new Error('Sleeper unavailable'); },
        now: () => NOW,
      },
    );

    expect(resolved.status).toBe('source_unavailable');
    expect(resolved.scoring?.status).toBe('unavailable');
    expect(resolved.context?.scoring.settings).toEqual({});
    expect(resolved.readiness.lineup?.ready).toBe(false);
    expect(resolved.readiness.trade?.ready).toBe(false);
    expect(resolved.sourceError).toMatch(/Sleeper unavailable/);
  });

  test('no active league returns an explicit not-connected state', async () => {
    const resolved = await resolveCommandCenterLeagueContext(null, {
      getSleeperLeague: async () => sleeperLeague(),
      now: () => NOW,
    });
    expect(resolved.status).toBe('not_connected');
    expect(resolved.context).toBeNull();
    expect(resolved.readiness).toEqual({});
  });
});
