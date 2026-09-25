import {
  NflverseTeamTrendClient,
  buildNflverseTeamTrendCheck,
  defenseMetricsFromOpponentRow,
  offenseMetricsFromTeamRow,
} from '../nflverseTeamTrendClient';
import { shouldTriggerCcfReevaluation } from '../newsIntelligence';

const rows = [
  {
    season: '2026',
    week: '1',
    team: 'AAA',
    season_type: 'REG',
    game_id: '2026_01_BBB_AAA',
    opponent_team: 'BBB',
    attempts: '20',
    sacks_suffered: '2',
    carries: '30',
    passing_epa: '0',
    rushing_epa: '3',
    passing_20: '2',
    rushing_12: '3',
  },
  {
    season: '2026',
    week: '1',
    team: 'BBB',
    season_type: 'REG',
    game_id: '2026_01_BBB_AAA',
    opponent_team: 'AAA',
    attempts: '30',
    sacks_suffered: '1',
    carries: '20',
    passing_epa: '-3',
    rushing_epa: '-2',
    passing_20: '2',
    rushing_12: '1',
  },
  {
    season: '2026',
    week: '2',
    team: 'AAA',
    season_type: 'REG',
    game_id: '2026_02_AAA_CCC',
    opponent_team: 'CCC',
    attempts: '22',
    sacks_suffered: '2',
    carries: '28',
    passing_epa: '2',
    rushing_epa: '2',
    passing_20: '2',
    rushing_12: '3',
  },
  {
    season: '2026',
    week: '2',
    team: 'CCC',
    season_type: 'REG',
    game_id: '2026_02_AAA_CCC',
    opponent_team: 'AAA',
    attempts: '28',
    sacks_suffered: '2',
    carries: '24',
    passing_epa: '-2',
    rushing_epa: '-1',
    passing_20: '2',
    rushing_12: '1',
  },
  {
    season: '2026',
    week: '2',
    team: 'BBB',
    season_type: 'REG',
    game_id: '2026_02_DDD_BBB',
    opponent_team: 'DDD',
    attempts: '27',
    sacks_suffered: '2',
    carries: '22',
    passing_epa: '-2',
    rushing_epa: '-1',
    passing_20: '2',
    rushing_12: '1',
  },
  {
    season: '2026',
    week: '2',
    team: 'DDD',
    season_type: 'REG',
    game_id: '2026_02_DDD_BBB',
    opponent_team: 'BBB',
    attempts: '24',
    sacks_suffered: '2',
    carries: '25',
    passing_epa: '1',
    rushing_epa: '1',
    passing_20: '2',
    rushing_12: '2',
  },
  {
    season: '2026',
    week: '3',
    team: 'AAA',
    season_type: 'REG',
    game_id: '2026_03_AAA_BBB',
    opponent_team: 'BBB',
    attempts: '35',
    sacks_suffered: '1',
    carries: '20',
    passing_epa: '14',
    rushing_epa: '-2',
    passing_20: '6',
    rushing_12: '1',
  },
  {
    season: '2026',
    week: '3',
    team: 'BBB',
    season_type: 'REG',
    game_id: '2026_03_AAA_BBB',
    opponent_team: 'AAA',
    attempts: '36',
    sacks_suffered: '1',
    carries: '19',
    passing_epa: '12',
    rushing_epa: '0',
    passing_20: '7',
    rushing_12: '1',
  },
];

test('weekly team row produces bounded offense metrics rather than scheme claims', () => {
  const metrics = offenseMetricsFromTeamRow(rows[6]);

  expect(metrics.playsProxy).toBe(56);
  expect(metrics.dropbackRateProxy).toBeCloseTo(36 / 56, 6);
  expect(metrics.passingEpaPerDropback).toBeCloseTo(14 / 36, 6);
  expect(metrics.explosivePassRate20).toBeCloseTo(6 / 35, 6);
  expect(metrics.sackRateAllowed).toBeCloseTo(1 / 36, 6);
});

test('defensive metrics are explicitly opponent-offense outcomes', () => {
  const metrics = defenseMetricsFromOpponentRow(rows[7]);

  expect(metrics.playsFacedProxy).toBe(56);
  expect(metrics.passingEpaAllowedPerDropback).toBeCloseTo(12 / 37, 6);
  expect(metrics.sackRateGenerated).toBeCloseTo(1 / 37, 6);
});

test('team trend check emits measured offense and defense observations with sample/regime metadata', () => {
  const check = buildNflverseTeamTrendCheck(
    {
      state: 'CURRENT',
      retrievedAt: '2026-09-25T16:00:00.000Z',
      rows,
    },
    2026,
    {
      targetWeek: 3,
      baselineGames: 2,
    },
  );

  const aaaOffense = check.events.find(
    event => event.family === 'OFF_TREND' && event.teamIds?.[0] === 'AAA',
  );
  const aaaDefense = check.events.find(
    event => event.family === 'DEF_TREND' && event.teamIds?.[0] === 'AAA',
  );

  expect(aaaOffense).toBeDefined();
  expect(aaaOffense?.recordQuality).toBe('NORMALIZED');
  expect(aaaOffense?.materiality).toBe('M1');
  expect(aaaOffense?.sampleGames).toBe(3);
  expect(aaaOffense?.trendRegime).toBe('ESTABLISHED');
  expect(shouldTriggerCcfReevaluation(aaaOffense!)).toBe(false);

  expect(aaaDefense).toBeDefined();
  expect(aaaDefense?.recordQuality).toBe('NORMALIZED');
  expect(check.lanes.OFF_TREND.status).toBe('PARTIAL');
  expect(check.lanes.DEF_TREND.status).toBe('PARTIAL');
  expect(check.lanes.INJURY.status).toBe('MISSING');
});

test('team trend source failure remains explicit for both measured trend lanes', () => {
  const check = buildNflverseTeamTrendCheck(
    {
      state: 'ERROR',
      retrievedAt: '2026-09-25T16:00:00.000Z',
      rows: [],
      error: 'network failure',
    },
    2026,
  );

  expect(check.sources[0].state).toBe('ERROR');
  expect(check.lanes.OFF_TREND.status).toBe('ERROR');
  expect(check.lanes.DEF_TREND.status).toBe('ERROR');
  expect(check.lanes.INJURY.status).toBe('MISSING');
});

test('team trend client fetches the documented weekly team-stats CSV', async () => {
  const csv = [
    'season,week,team,season_type,game_id,opponent_team,attempts,sacks_suffered,carries,passing_epa,rushing_epa,passing_20,rushing_12',
    '2026,3,AAA,REG,2026_03_AAA_BBB,BBB,35,1,20,14,-2,6,1',
  ].join('\n');

  const fetchImpl = jest.fn(async () =>
    new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'last-modified': 'Fri, 25 Sep 2026 14:37:55 GMT',
      },
    }),
  ) as unknown as typeof fetch;

  const client = new NflverseTeamTrendClient({
    fetchImpl,
    baseUrl: 'https://example.test/stats_team',
  });

  const result = await client.fetchSeason(
    2026,
    '2026-09-25T16:00:00.000Z',
  );

  expect(fetchImpl).toHaveBeenCalledWith(
    'https://example.test/stats_team/stats_team_week_2026.csv',
    expect.any(Object),
  );
  expect(result.state).toBe('CURRENT');
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0].passing_epa).toBe('14');
});
