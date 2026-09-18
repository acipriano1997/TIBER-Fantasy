export interface CCFQuantileForecastObservation {
  actual: number;
  predicted: number;
  quantile: number;
}

export interface CCFQuantileLossRow {
  quantile: number;
  sampleSize: number;
  meanPinballLoss: number;
}

export interface CCFQuantileScoringMetrics {
  sampleSize: number;
  meanPinballLoss: number | null;
  byQuantile: CCFQuantileLossRow[];
}

function pinballLoss(actual: number, predicted: number, quantile: number): number {
  const error = actual - predicted;
  return error >= 0 ? quantile * error : (1 - quantile) * -error;
}

export function evaluateCCFQuantileScoring(
  rows: readonly CCFQuantileForecastObservation[],
): CCFQuantileScoringMetrics {
  const usable = rows.filter((row) => Number.isFinite(row.actual) && Number.isFinite(row.predicted));
  for (const row of usable) {
    if (!Number.isFinite(row.quantile) || row.quantile <= 0 || row.quantile >= 1) {
      throw new Error("quantile must be greater than 0 and less than 1");
    }
  }

  if (usable.length === 0) {
    return { sampleSize: 0, meanPinballLoss: null, byQuantile: [] };
  }

  const grouped = new Map<number, number[]>();
  const allLosses: number[] = [];
  for (const row of usable) {
    const loss = pinballLoss(row.actual, row.predicted, row.quantile);
    allLosses.push(loss);
    const losses = grouped.get(row.quantile) ?? [];
    losses.push(loss);
    grouped.set(row.quantile, losses);
  }

  const byQuantile = Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([quantile, losses]) => ({
      quantile,
      sampleSize: losses.length,
      meanPinballLoss: losses.reduce((sum, value) => sum + value, 0) / losses.length,
    }));

  return {
    sampleSize: usable.length,
    meanPinballLoss: allLosses.reduce((sum, value) => sum + value, 0) / allLosses.length,
    byQuantile,
  };
}
