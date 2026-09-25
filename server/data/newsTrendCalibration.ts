// server/data/newsTrendCalibration.ts
//
// NEWS-001 historical persistence calibration.
//
// This module deliberately evaluates whether a measured team tendency persists
// into the team's next game. It does not certify fantasy-point lift, lineup EV,
// or CCF authority. A positive persistence result is therefore only evidence
// that a signal deserves continued shadow evaluation.

export type TrendCalibrationDisposition =
  | 'PERSISTENCE_SUPPORTED'
  | 'INCONCLUSIVE'
  | 'NEGATIVE';

export interface TrendCalibrationObservation {
  source: 'TEAM_STATS' | 'FTN_CHARTING';
  family: 'OFF_TREND' | 'DEF_TREND';
  metric: string;
  season: number;
  team: string;
  week: number;
  value: number;
}

export interface TrendCalibrationCase {
  source: TrendCalibrationObservation['source'];
  family: TrendCalibrationObservation['family'];
  metric: string;
  season: number;
  team: string;
  week: number;
  baseline: number;
  current: number;
  next: number;
  baselinePrediction: number;
  recencyShrinkPrediction: number;
  currentDelta: number;
  nextDelta: number;
}

export interface TrendCalibrationFold {
  season: number;
  n: number;
  baselineMae: number;
  recencyShrinkMae: number;
  maeGainPct: number;
  deltaCorrelation: number | null;
}

export interface TrendMetricCalibration {
  source: TrendCalibrationObservation['source'];
  family: TrendCalibrationObservation['family'];
  metric: string;
  n: number;
  seasons: number[];
  baselineMae: number;
  recencyShrinkMae: number;
  maeGainPct: number;
  deltaCorrelation: number | null;
  positiveFolds: number;
  materiallyNegativeFolds: number;
  folds: TrendCalibrationFold[];
  disposition: TrendCalibrationDisposition;
  runtimePromotionAllowed: false;
  reason: string;
}

export interface TrendCalibrationReport {
  schemaVersion: 'news-trend-calibration-v1';
  generatedAt: string;
  protocol: {
    baselineGames: 2;
    recencyWeight: 0.5;
    minimumAggregateCases: 300;
    minimumFoldCases: 50;
    minimumPositiveFolds: 2;
    minimumMaeGainPct: 1.5;
    maximumFoldDegradationPct: -2;
    target: 'next-game same-metric persistence';
    authorityBoundary: string;
  };
  metrics: TrendMetricCalibration[];
  summary: {
    supported: number;
    inconclusive: number;
    negative: number;
  };
}

function round(value: number, digits: number = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mae(pairs: Array<{ prediction: number; actual: number }>): number {
  return mean(pairs.map(pair => Math.abs(pair.prediction - pair.actual)));
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3 || xs.length !== ys.length) return null;
  const xMean = mean(xs);
  const yMean = mean(ys);
  let numerator = 0;
  let xSq = 0;
  let ySq = 0;

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] - xMean;
    const y = ys[i] - yMean;
    numerator += x * y;
    xSq += x * x;
    ySq += y * y;
  }

  const denominator = Math.sqrt(xSq * ySq);
  return denominator > 0 ? round(numerator / denominator) : null;
}

function groupKey(
  observation: Pick<TrendCalibrationObservation, 'source' | 'family' | 'metric'>,
): string {
  return [observation.source, observation.family, observation.metric].join('|');
}

function teamSeasonKey(
  observation: Pick<TrendCalibrationObservation, 'season' | 'team'>,
): string {
  return `${observation.season}|${observation.team}`;
}

export function buildTrendCalibrationCases(
  observations: TrendCalibrationObservation[],
): TrendCalibrationCase[] {
  const byMetric = new Map<string, TrendCalibrationObservation[]>();

  for (const observation of observations) {
    if (!Number.isFinite(observation.value)) continue;
    const key = groupKey(observation);
    const list = byMetric.get(key) ?? [];
    list.push(observation);
    byMetric.set(key, list);
  }

  const cases: TrendCalibrationCase[] = [];

  for (const metricRows of byMetric.values()) {
    const byTeamSeason = new Map<string, TrendCalibrationObservation[]>();

    for (const observation of metricRows) {
      const key = teamSeasonKey(observation);
      const list = byTeamSeason.get(key) ?? [];
      list.push(observation);
      byTeamSeason.set(key, list);
    }

    for (const teamRows of byTeamSeason.values()) {
      const ordered = [...teamRows].sort((a, b) => a.week - b.week);

      // A case uses only the two games before t plus game t to predict the
      // team's next game. The next row is outcome-only and never enters a
      // feature or threshold calculation.
      for (let index = 2; index < ordered.length - 1; index++) {
        const prior = ordered.slice(index - 2, index);
        const current = ordered[index];
        const next = ordered[index + 1];
        const baseline = mean(prior.map(row => row.value));

        cases.push({
          source: current.source,
          family: current.family,
          metric: current.metric,
          season: current.season,
          team: current.team,
          week: current.week,
          baseline,
          current: current.value,
          next: next.value,
          baselinePrediction: baseline,
          recencyShrinkPrediction: 0.5 * current.value + 0.5 * baseline,
          currentDelta: current.value - baseline,
          nextDelta: next.value - baseline,
        });
      }
    }
  }

  return cases;
}

function evaluateCases(cases: TrendCalibrationCase[]): {
  baselineMae: number;
  recencyShrinkMae: number;
  maeGainPct: number;
  deltaCorrelation: number | null;
} {
  const baselineMae = mae(
    cases.map(row => ({ prediction: row.baselinePrediction, actual: row.next })),
  );
  const recencyShrinkMae = mae(
    cases.map(row => ({
      prediction: row.recencyShrinkPrediction,
      actual: row.next,
    })),
  );
  const maeGainPct =
    baselineMae > 0
      ? ((baselineMae - recencyShrinkMae) / baselineMae) * 100
      : 0;

  return {
    baselineMae: round(baselineMae),
    recencyShrinkMae: round(recencyShrinkMae),
    maeGainPct: round(maeGainPct, 3),
    deltaCorrelation: pearson(
      cases.map(row => row.currentDelta),
      cases.map(row => row.nextDelta),
    ),
  };
}

export function calibrateTrendObservations(
  observations: TrendCalibrationObservation[],
  generatedAt: string = new Date().toISOString(),
): TrendCalibrationReport {
  const cases = buildTrendCalibrationCases(observations);
  const byMetric = new Map<string, TrendCalibrationCase[]>();

  for (const row of cases) {
    const key = [row.source, row.family, row.metric].join('|');
    const list = byMetric.get(key) ?? [];
    list.push(row);
    byMetric.set(key, list);
  }

  const metrics: TrendMetricCalibration[] = [];

  for (const metricCases of byMetric.values()) {
    const first = metricCases[0];
    const aggregate = evaluateCases(metricCases);
    const seasons = [...new Set(metricCases.map(row => row.season))].sort();
    const folds: TrendCalibrationFold[] = seasons.map(season => {
      const foldCases = metricCases.filter(row => row.season === season);
      const result = evaluateCases(foldCases);
      return {
        season,
        n: foldCases.length,
        ...result,
      };
    });

    const eligibleFolds = folds.filter(fold => fold.n >= 50);
    const positiveFolds = eligibleFolds.filter(fold => fold.maeGainPct > 0).length;
    const materiallyNegativeFolds = eligibleFolds.filter(
      fold => fold.maeGainPct <= -2,
    ).length;

    let disposition: TrendCalibrationDisposition = 'INCONCLUSIVE';
    let reason =
      'Persistence evidence does not clear the preregistered shadow threshold.';

    if (
      metricCases.length >= 300 &&
      eligibleFolds.length >= 3 &&
      aggregate.maeGainPct >= 1.5 &&
      positiveFolds >= 2 &&
      materiallyNegativeFolds === 0
    ) {
      disposition = 'PERSISTENCE_SUPPORTED';
      reason =
        'Recency-shrunk signal improves next-game same-metric MAE across the preregistered temporal-fold gate.';
    } else if (
      aggregate.maeGainPct <= -1.5 ||
      materiallyNegativeFolds >= 2
    ) {
      disposition = 'NEGATIVE';
      reason =
        'Recency-shrunk signal materially underperforms the two-game baseline or degrades repeatedly across temporal folds.';
    }

    metrics.push({
      source: first.source,
      family: first.family,
      metric: first.metric,
      n: metricCases.length,
      seasons,
      ...aggregate,
      positiveFolds,
      materiallyNegativeFolds,
      folds,
      disposition,
      // Persistence is not fantasy/decision calibration. Runtime authority
      // remains bounded regardless of this result.
      runtimePromotionAllowed: false,
      reason,
    });
  }

  metrics.sort((a, b) =>
    [a.source, a.family, a.metric]
      .join('|')
      .localeCompare([b.source, b.family, b.metric].join('|')),
  );

  return {
    schemaVersion: 'news-trend-calibration-v1',
    generatedAt,
    protocol: {
      baselineGames: 2,
      recencyWeight: 0.5,
      minimumAggregateCases: 300,
      minimumFoldCases: 50,
      minimumPositiveFolds: 2,
      minimumMaeGainPct: 1.5,
      maximumFoldDegradationPct: -2,
      target: 'next-game same-metric persistence',
      authorityBoundary:
        'Persistence support is shadow evidence only. It cannot promote a NEWS-001 trend to DECISION_GRADE or mutate CCF without separate frozen player/fantasy/decision-outcome validation.',
    },
    metrics,
    summary: {
      supported: metrics.filter(row => row.disposition === 'PERSISTENCE_SUPPORTED').length,
      inconclusive: metrics.filter(row => row.disposition === 'INCONCLUSIVE').length,
      negative: metrics.filter(row => row.disposition === 'NEGATIVE').length,
    },
  };
}

export function trendCalibrationMarkdown(report: TrendCalibrationReport): string {
  const lines = [
    '# NEWS-001 Trend Persistence Calibration',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Protocol',
    '',
    '- Frozen historical observations only; each case uses two prior team games plus the current game to predict the next team game.',
    '- Baseline: mean of the two games preceding the current game.',
    '- Challenger: 50% current game + 50% two-game baseline.',
    '- Primary metric: next-game same-metric MAE improvement versus baseline.',
    '- Temporal folds are evaluated by NFL season.',
    '- This is a persistence test, not fantasy-point or decision-EV certification.',
    '- Runtime promotion is prohibited by this artifact even when persistence is supported.',
    '',
    '## Results',
    '',
    '| Source | Lane | Metric | N | MAE gain | Delta corr | Positive folds | Negative folds | Finding |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const metric of report.metrics) {
    lines.push(
      `| ${metric.source} | ${metric.family} | ${metric.metric} | ${metric.n} | ${metric.maeGainPct.toFixed(2)}% | ${metric.deltaCorrelation === null ? 'n/a' : metric.deltaCorrelation.toFixed(3)} | ${metric.positiveFolds} | ${metric.materiallyNegativeFolds} | ${metric.disposition} |`,
    );
  }

  lines.push(
    '',
    '## Authority conclusion',
    '',
    `Supported: ${report.summary.supported}; inconclusive: ${report.summary.inconclusive}; negative: ${report.summary.negative}.`,
    '',
    '**No metric is promoted to DECISION_GRADE by this calibration.** Any future promotion requires frozen player/fantasy/decision-outcome validation and the normal CCF promotion gates.',
    '',
  );

  return lines.join('\n');
}
