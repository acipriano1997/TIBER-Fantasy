import {
  evaluateWeeklyDecisionRuntime,
  type WeeklyDecisionRuntimeDeps,
} from '../weeklyDecisionRuntimeService';
import type { WeeklyTailOutlook } from '../../../shared/weeklyDecisionContract';

const NOW = new Date('2026-09-15T20:00:00.000Z');
const SCORING = {
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

const activeLeague = {
  id: 'internal-league',
  leagueName: 'Runtime League',
  platform: 'sleeper',
  season: 2026,
  leagueIdExternal: 'league-1',
};
const activeTeam = {
  id: 'team-1',
  externalRosterId: '7',
};

function tail(
  playerId: string,
  scoringProfileRef: string,
  evidenceCutoffAt: string,
  quantiles: WeeklyTailOutlook['quantiles'],
): WeeklyTailOutlook {
  return {
    status: 'ready',
    scoringProfileRef,
    evidenceCutoffAt,
    generatedAt: '2026-09-15T20:00:05.000Z',
    modelVersion: 'ccf-weekly-tail-v1',
    calibrationVersion: 'ccf-calibration-2026-w2',
    supportedPopulation: 'NFL WR PPR weekly',
    quantiles,
    sourceReceipts: [{
      owner: 'CCF-Forecast',
      artifactOrEndpoint: `ccf-weekly-tail/${playerId}`,
      schemaOrModelVersion: 'ccf-weekly-tail-v1',
      runOrContentHash: `run-${playerId}`,
      evidenceWindow: '2026 week 2',
      observedAt: '2026-09-15T19:59:00.000Z',
      inputCutoffAt: evidenceCutoffAt,
      generatedAt: '2026-09-15T20:00:05.000Z',
      retrievedAt: '2026-09-15T20:00:06.000Z',
      validUntil: '2026-09-18T23:00:00.000Z',
      publicationState: 'promoted',
      freshness: 'fresh',
      coverage: 'supported',
    }],
  };
}

function deps(overrides: Partial<WeeklyDecisionRuntimeDeps> = {}): WeeklyDecisionRuntimeDeps {
  return {
    getSleeperLeague: jest.fn().mockResolvedValue({
      league_id: 'league-1',
      name: 'Runtime League',
      season: '2026',
      scoring_settings: SCORING,
      roster_positions: ['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN'],
    }),
    getLeagueRosters: jest.fn().mockResolvedValue([{
      roster_id: 7,
      owner_id: 'owner-1',
      players: ['qb', 'rb', 'starter-wr', 'wr2', 'te', 'flex-wr', 'bench-wr'],
      starters: ['qb', 'rb', 'starter-wr', 'wr2', 'te', 'flex-wr'],
      reserve: [],
      taxi: [],
    }]),
    getNflPlayers: jest.fn().mockResolvedValue({
      'starter-wr': { player_id: 'starter-wr', full_name: 'Starter WR', position: 'WR', team: 'NYG' },
      'bench-wr': { player_id: 'bench-wr', full_name: 'Bench WR', position: 'WR', team: 'DAL' },
      'flex-wr': { player_id: 'flex-wr', full_name: 'Flex WR', position: 'WR', team: 'BUF' },
    }),
    resolveLockState: jest.fn().mockResolvedValue(null),
    getTailOutlook: jest.fn().mockResolvedValue(null),
    now: () => NOW,
    ...overrides,
  };
}

const request = {
  activeLeague,
  activeTeam,
  week: 2,
  starterPlayerId: 'starter-wr',
  benchPlayerId: 'bench-wr',
  operatorPosture: 'balanced' as const,
};

describe('Weekly Decision runtime v1', () => {
  test('assembles live roster geometry but fails closed on missing lock and calibrated CCF evidence', async () => {
    const result = await evaluateWeeklyDecisionRuntime(request, deps());

    expect(result.state).toBe('blocked');
    expect(result.roster?.controlledSlot).toBe('WR');
    expect(result.roster?.rosterSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.candidateSnapshot?.starter).toMatchObject({ name: 'Starter WR', position: 'WR' });
    expect(result.missingInputs).toEqual(expect.arrayContaining([
      'starter-wr:lock_state',
      'bench-wr:lock_state',
      'starter-wr:ccf_calibrated_tail',
      'bench-wr:ccf_calibrated_tail',
    ]));
    expect(result.blockers.join(' ')).toContain('legacy Compass intervals');
    expect(result.decision).toBeNull();
  });

  test('rejects a same-position player in FLEX because v1 does not infer flex geometry', async () => {
    const result = await evaluateWeeklyDecisionRuntime({
      ...request,
      starterPlayerId: 'flex-wr',
    }, deps());

    expect(result.state).toBe('blocked');
    expect(result.roster?.controlledSlot).toBe('FLEX');
    expect(result.missingInputs).toContain('exact_position_legal_swap');
    expect(result.blockers.join(' ')).toContain('exact-position slot swap');
  });

  test('evaluates an exact-position swap once governed lock and CCF tail evidence are available', async () => {
    const runtimeDeps = deps({
      resolveLockState: jest.fn().mockResolvedValue({
        locked: false,
        observedAt: NOW.toISOString(),
        source: 'governed-nfl-schedule',
      }),
      getTailOutlook: jest.fn().mockImplementation(async (input) => tail(
        input.playerId,
        input.scoringProfileRef,
        input.evidenceCutoffAt,
        input.playerId === 'starter-wr'
          ? { p10: 8, p25: 11, p50: 16, p75: 22, p90: 29, p95: 34 }
          : { p10: 7, p25: 10, p50: 14, p75: 20, p90: 27, p95: 31 },
      )),
    });

    const result = await evaluateWeeklyDecisionRuntime(request, runtimeDeps);

    expect(result.state).toBe('evaluated');
    expect(result.decisionContext?.scoringProfileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.decisionContext?.candidateA.position).toBe('WR');
    expect(result.decision?.decisionState).toBe('comparison_available');
    expect(result.decision?.preferredPlayerId).toBe('starter-wr');
    expect(result.decision?.tailEvidenceUsed).toBe(true);
    expect((await runtimeDeps.getSleeperLeague('league-1')).scoring_settings.pass_td).toBe(6);
  });

  test('passes a governed locked state into the weekly contract instead of allowing a lineup action', async () => {
    const runtimeDeps = deps({
      resolveLockState: jest.fn().mockResolvedValue({
        locked: true,
        observedAt: NOW.toISOString(),
        source: 'governed-nfl-schedule',
      }),
      getTailOutlook: jest.fn().mockImplementation(async (input) => tail(
        input.playerId,
        input.scoringProfileRef,
        input.evidenceCutoffAt,
        { p10: 8, p25: 11, p50: 16, p75: 22, p90: 29, p95: 34 },
      )),
    });

    const result = await evaluateWeeklyDecisionRuntime(request, runtimeDeps);

    expect(result.state).toBe('evaluated');
    expect(result.decisionContext?.locked).toBe(true);
    expect(result.decision?.decisionState).toBe('unsupported_domain');
    expect(result.decision?.blockers).toContain('The controlled lineup slot is locked.');
  });

  test('rejects reserve/taxi players as active bench options', async () => {
    const runtimeDeps = deps({
      getLeagueRosters: jest.fn().mockResolvedValue([{
        roster_id: 7,
        owner_id: 'owner-1',
        players: ['qb', 'rb', 'starter-wr', 'wr2', 'te', 'flex-wr', 'bench-wr'],
        starters: ['qb', 'rb', 'starter-wr', 'wr2', 'te', 'flex-wr'],
        reserve: ['bench-wr'],
        taxi: [],
      }]),
    });

    const result = await evaluateWeeklyDecisionRuntime(request, runtimeDeps);

    expect(result.state).toBe('blocked');
    expect(result.missingInputs).toContain('bench-wr:active_bench_status');
  });
});
