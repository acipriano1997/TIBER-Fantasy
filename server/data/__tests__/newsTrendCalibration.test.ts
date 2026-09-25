import {
  buildTrendCalibrationCases,
  calibrateTrendObservations,
} from '../newsTrendCalibration';

function makeSeries(
  valuesBySeason: Record<number, number[]>,
  metric: string = 'motionRate',
) {
  return Object.entries(valuesBySeason).flatMap(([season, values]) =>
    values.map((value, index) => ({
      source: 'FTN_CHARTING' as const,
      family: 'OFF_TREND' as const,
      metric,
      season: Number(season),
      team: 'AAA',
      week: index + 1,
      value,
    })),
  );
}

test('calibration cases use only two prior games plus current to predict the next game', () => {
  const rows = makeSeries({ 2023: [1, 2, 3, 4, 5] });
  const cases = buildTrendCalibrationCases(rows);

  expect(cases).toHaveLength(2);
  expect(cases[0]).toMatchObject({
    season: 2023,
    week: 3,
    baseline: 1.5,
    current: 3,
    next: 4,
    baselinePrediction: 1.5,
    recencyShrinkPrediction: 2.25,
  });
  expect(cases[1].week).toBe(4);
  expect(cases[1].next).toBe(5);
});

test('bye-week gaps are treated as next team game rather than requiring week plus one', () => {
  const rows = [
    { source: 'TEAM_STATS' as const, family: 'OFF_TREND' as const, metric: 'playsProxy', season: 2024, team: 'AAA', week: 1, value: 60 },
    { source: 'TEAM_STATS' as const, family: 'OFF_TREND' as const, metric: 'playsProxy', season: 2024, team: 'AAA', week: 2, value: 62 },
    { source: 'TEAM_STATS' as const, family: 'OFF_TREND' as const, metric: 'playsProxy', season: 2024, team: 'AAA', week: 3, value: 64 },
    { source: 'TEAM_STATS' as const, family: 'OFF_TREND' as const, metric: 'playsProxy', season: 2024, team: 'AAA', week: 5, value: 66 },
  ];

  const cases = buildTrendCalibrationCases(rows);
  expect(cases).toHaveLength(1);
  expect(cases[0].week).toBe(3);
  expect(cases[0].next).toBe(66);
});

test('persistence result can never authorize runtime promotion', () => {
  const observations = [];
  for (const season of [2023, 2024, 2025]) {
    for (let teamIndex = 0; teamIndex < 32; teamIndex++) {
      let value = teamIndex / 100;
      for (let week = 1; week <= 14; week++) {
        value += 0.01;
        observations.push({
          source: 'FTN_CHARTING' as const,
          family: 'OFF_TREND' as const,
          metric: 'motionRate',
          season,
          team: `T${teamIndex}`,
          week,
          value,
        });
      }
    }
  }

  const report = calibrateTrendObservations(
    observations,
    '2026-09-25T21:00:00.000Z',
  );

  expect(report.metrics).toHaveLength(1);
  expect(report.metrics[0].disposition).toBe('PERSISTENCE_SUPPORTED');
  expect(report.metrics[0].runtimePromotionAllowed).toBe(false);
  expect(report.protocol.authorityBoundary).toContain('cannot promote');
});

test('repeated temporal degradation is classified negative', () => {
  const observations = [];
  for (const season of [2023, 2024, 2025]) {
    for (let teamIndex = 0; teamIndex < 32; teamIndex++) {
      for (let week = 1; week <= 14; week++) {
        observations.push({
          source: 'TEAM_STATS' as const,
          family: 'DEF_TREND' as const,
          metric: 'sackRateGenerated',
          season,
          team: `T${teamIndex}`,
          week,
          value: week % 2 === 0 ? 1 : 0,
        });
      }
    }
  }

  const report = calibrateTrendObservations(observations);
  expect(report.metrics[0].disposition).toBe('NEGATIVE');
  expect(report.metrics[0].runtimePromotionAllowed).toBe(false);
});
