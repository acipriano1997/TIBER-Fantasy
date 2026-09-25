import {
  NflverseFtnTrendClient,
  buildFtnTrendCheck,
  joinFtnChartingToPbp,
} from '../nflverseFtnTrendClient';
import { shouldTriggerCcfReevaluation } from '../newsIntelligence';

const chartingRows = [
  {
    nflverse_game_id: '2026_01_BBB_AAA',
    season: '2026',
    week: '1',
    nflverse_play_id: '1',
    qb_location: 'U',
    n_offense_backfield: '2',
    n_defense_box: '7',
    is_no_huddle: 'FALSE',
    is_motion: 'FALSE',
    is_play_action: 'TRUE',
    is_screen_pass: 'FALSE',
    is_rpo: 'FALSE',
    n_blitzers: '0',
    n_pass_rushers: '4',
    date_pulled: '2026-09-20T12:00:00Z',
  },
  {
    nflverse_game_id: '2026_01_BBB_AAA',
    season: '2026',
    week: '1',
    nflverse_play_id: '2',
    qb_location: 'S',
    n_offense_backfield: '1',
    n_defense_box: '6',
    is_no_huddle: 'FALSE',
    is_motion: 'FALSE',
    is_play_action: 'FALSE',
    is_screen_pass: 'FALSE',
    is_rpo: 'FALSE',
    n_blitzers: '0',
    n_pass_rushers: '4',
    date_pulled: '2026-09-20T12:00:00Z',
  },
  {
    nflverse_game_id: '2026_02_AAA_BBB',
    season: '2026',
    week: '2',
    nflverse_play_id: '10',
    qb_location: 'U',
    n_offense_backfield: '2',
    n_defense_box: '7',
    is_no_huddle: 'FALSE',
    is_motion: 'TRUE',
    is_play_action: 'TRUE',
    is_screen_pass: 'FALSE',
    is_rpo: 'FALSE',
    n_blitzers: '1',
    n_pass_rushers: '5',
    date_pulled: '2026-09-25T12:00:00Z',
  },
  {
    nflverse_game_id: '2026_02_AAA_BBB',
    season: '2026',
    week: '2',
    nflverse_play_id: '11',
    qb_location: 'S',
    n_offense_backfield: '1',
    n_defense_box: '6',
    is_no_huddle: 'TRUE',
    is_motion: 'TRUE',
    is_play_action: 'FALSE',
    is_screen_pass: 'FALSE',
    is_rpo: 'FALSE',
    n_blitzers: '0',
    n_pass_rushers: '4',
    date_pulled: '2026-09-25T12:00:00Z',
  },
  {
    nflverse_game_id: '2026_02_AAA_BBB',
    season: '2026',
    week: '2',
    nflverse_play_id: '12',
    qb_location: 'U',
    n_offense_backfield: '2',
    n_defense_box: '8',
    is_no_huddle: 'FALSE',
    is_motion: 'FALSE',
    is_play_action: 'FALSE',
    is_screen_pass: 'FALSE',
    is_rpo: 'TRUE',
    n_blitzers: '',
    n_pass_rushers: '',
    date_pulled: '2026-09-25T12:00:00Z',
  },
  {
    nflverse_game_id: '2026_02_AAA_BBB',
    season: '2026',
    week: '2',
    nflverse_play_id: '13',
    qb_location: 'P',
    n_offense_backfield: '1',
    n_defense_box: '7',
    is_no_huddle: 'FALSE',
    is_motion: 'FALSE',
    is_play_action: 'FALSE',
    is_screen_pass: 'TRUE',
    is_rpo: 'FALSE',
    n_blitzers: '0',
    n_pass_rushers: '4',
    date_pulled: '2026-09-25T12:00:00Z',
  },
];

const pbpRows = [
  {
    game_id: '2026_01_BBB_AAA',
    play_id: '1',
    posteam: 'AAA',
    defteam: 'BBB',
    qb_dropback: '1',
  },
  {
    game_id: '2026_01_BBB_AAA',
    play_id: '2',
    posteam: 'AAA',
    defteam: 'BBB',
    qb_dropback: '1',
  },
  {
    game_id: '2026_02_AAA_BBB',
    play_id: '10',
    posteam: 'AAA',
    defteam: 'BBB',
    qb_dropback: '1',
  },
  {
    game_id: '2026_02_AAA_BBB',
    play_id: '11',
    posteam: 'AAA',
    defteam: 'BBB',
    qb_dropback: '1',
  },
  {
    game_id: '2026_02_AAA_BBB',
    play_id: '12',
    posteam: 'AAA',
    defteam: 'BBB',
    qb_dropback: '0',
  },
  {
    game_id: '2026_02_AAA_BBB',
    play_id: '13',
    posteam: 'AAA',
    defteam: 'BBB',
    qb_dropback: '1',
  },
];

test('FTN charting joins to nflverse PBP before assigning team-level scheme evidence', () => {
  const joined = joinFtnChartingToPbp(chartingRows, pbpRows);

  expect(joined.unmatched).toBe(0);
  expect(joined.joined).toHaveLength(6);
  expect(joined.joined[0].posteam).toBe('AAA');
  expect(joined.joined[0].defteam).toBe('BBB');
});

test('FTN scheme check captures offense motion/location/play-action and defense rush structure without promoting CCF authority', () => {
  const check = buildFtnTrendCheck(
    {
      state: 'CURRENT',
      retrievedAt: '2026-09-25T16:00:00.000Z',
      sourceUpdatedAt: '2026-09-25T12:00:00.000Z',
      chartingRows,
      pbpRows,
    },
    2026,
    { targetWeek: 2, baselineWeeks: 1 },
  );

  const offense = check.events.find(
    event => event.family === 'OFF_TREND' && event.teamIds?.[0] === 'AAA',
  );
  const defense = check.events.find(
    event => event.family === 'DEF_TREND' && event.teamIds?.[0] === 'BBB',
  );

  expect(offense).toBeDefined();
  expect(offense?.recordQuality).toBe('NORMALIZED');
  expect(offense?.materiality).toBe('M0');
  expect(offense?.sampleGames).toBe(2);
  expect(offense?.trendRegime).toBe('DEVELOPING');
  expect(shouldTriggerCcfReevaluation(offense!)).toBe(false);

  const offenseState = offense?.currentState as any;
  expect(offenseState.metrics.underCenterRate).toBe(0.5);
  expect(offenseState.metrics.shotgunRate).toBe(0.25);
  expect(offenseState.metrics.pistolRate).toBe(0.25);
  expect(offenseState.metrics.motionRate).toBe(0.5);
  expect(offenseState.metrics.playActionRate).toBeCloseTo(1 / 3, 4);
  expect(offenseState.metrics.noHuddleRate).toBe(0.25);
  expect(offenseState.metrics.rpoRate).toBe(0.25);
  expect(offenseState.metrics.screenRate).toBeCloseTo(1 / 3, 4);
  expect(offenseState.coverage.chartedPlays).toBe(4);
  expect(offenseState.coverage.chartedDropbacks).toBe(3);

  expect(defense).toBeDefined();
  expect(defense?.recordQuality).toBe('NORMALIZED');
  const defenseState = defense?.currentState as any;
  expect(defenseState.metrics.avgBoxCount).toBe(7);
  expect(defenseState.metrics.fivePlusPassRusherRate).toBeCloseTo(1 / 3, 4);
  expect(defenseState.metrics.blitzerPresentRate).toBeCloseTo(1 / 3, 4);
  expect(defenseState.metrics.fourOrFewerRushRate).toBeCloseTo(2 / 3, 4);
  expect(defenseState.metrics.avgPassRushers).toBeCloseTo(13 / 3, 4);
  expect(defenseState.coverage.passRusherDropbacks).toBe(3);

  expect(check.lanes.OFF_TREND.status).toBe('PARTIAL');
  expect(check.lanes.DEF_TREND.status).toBe('PARTIAL');
  expect(check.lanes.INJURY.status).toBe('MISSING');
});

test('FTN target week missing stays MISSING instead of implying no motion or blitzing', () => {
  const check = buildFtnTrendCheck(
    {
      state: 'CURRENT',
      retrievedAt: '2026-09-25T16:00:00.000Z',
      chartingRows,
      pbpRows,
    },
    2026,
    { targetWeek: 3 },
  );

  expect(check.events).toHaveLength(0);
  expect(check.lanes.OFF_TREND.status).toBe('MISSING');
  expect(check.lanes.DEF_TREND.status).toBe('MISSING');
});

test('unmatched FTN charting rows degrade source health rather than inventing team ownership', () => {
  const check = buildFtnTrendCheck(
    {
      state: 'CURRENT',
      retrievedAt: '2026-09-25T16:00:00.000Z',
      chartingRows: [
        ...chartingRows,
        {
          nflverse_game_id: '2026_02_AAA_BBB',
          season: '2026',
          week: '2',
          nflverse_play_id: '999',
          is_motion: 'TRUE',
        },
      ],
      pbpRows,
    },
    2026,
    { targetWeek: 2 },
  );

  expect(check.sources[0].state).toBe('PARTIAL');
  expect(check.sources[1].state).toBe('PARTIAL');
});

test('FTN client uses documented release URLs and caches the heavy season join inputs', async () => {
  const ftnCsv = [
    'nflverse_game_id,season,week,nflverse_play_id,qb_location,n_offense_backfield,n_defense_box,is_no_huddle,is_motion,is_play_action,is_screen_pass,is_rpo,n_blitzers,n_pass_rushers,date_pulled',
    '2026_02_AAA_BBB,2026,2,10,U,2,7,FALSE,TRUE,TRUE,FALSE,FALSE,1,5,2026-09-25T12:00:00Z',
  ].join('\n');
  const pbpCsv = [
    'game_id,play_id,posteam,defteam,qb_dropback',
    '2026_02_AAA_BBB,10,AAA,BBB,1',
  ].join('\n');

  const fetchImpl = jest.fn(async (url: string | URL | Request) => {
    const value = String(url);
    return new Response(value.includes('ftn_charting') ? ftnCsv : pbpCsv, {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'last-modified': 'Fri, 25 Sep 2026 12:00:00 GMT',
      },
    });
  }) as unknown as typeof fetch;

  const client = new NflverseFtnTrendClient({
    fetchImpl,
    ftnBaseUrl: 'https://example.test/ftn',
    pbpBaseUrl: 'https://example.test/pbp',
    cacheTtlMs: 6 * 60 * 60 * 1000,
  });

  const first = await client.fetchSeason(2026, '2026-09-25T16:00:00.000Z');
  const second = await client.fetchSeason(2026, '2026-09-25T17:00:00.000Z');

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://example.test/ftn/ftn_charting_2026.csv',
    expect.any(Object),
  );
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://example.test/pbp/play_by_play_2026.csv',
    expect.any(Object),
  );
  expect(first.state).toBe('CURRENT');
  expect(first.chartingRows).toHaveLength(1);
  expect(first.pbpRows).toHaveLength(1);
  expect(second).toBe(first);
});
