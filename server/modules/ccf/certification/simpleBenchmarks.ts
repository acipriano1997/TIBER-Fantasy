export interface CCFBenchmarkObservation {
  playerId: string;
  actualFantasyPoints: number;
  opportunity?: number;
  season?: number;
  week?: number;
}

export interface CCFBenchmarkPrediction {
  model: "historical_mean" | "recent_mean" | "usage_rate";
  predictedFantasyPoints: number | null;
  sampleSize: number;
  note?: string;
}

function finite(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function mean(values: readonly number[]): number | null {
  const usable = finite(values);
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export function predictCCFHistoricalMean(
  history: readonly CCFBenchmarkObservation[],
): CCFBenchmarkPrediction {
  const values = history.map((row) => row.actualFantasyPoints);
  return {
    model: "historical_mean",
    predictedFantasyPoints: mean(values),
    sampleSize: finite(values).length,
  };
}

export function predictCCFRecentMean(
  history: readonly CCFBenchmarkObservation[],
  recentGames = 4,
): CCFBenchmarkPrediction {
  if (!Number.isInteger(recentGames) || recentGames < 1) {
    throw new Error("recentGames must be a positive integer");
  }

  const recent = history.slice(-recentGames);
  const values = recent.map((row) => row.actualFantasyPoints);
  return {
    model: "recent_mean",
    predictedFantasyPoints: mean(values),
    sampleSize: finite(values).length,
    note: `last ${recentGames} available observations`,
  };
}

export function predictCCFUsageRateBaseline(
  history: readonly CCFBenchmarkObservation[],
  expectedOpportunity: number | null | undefined,
): CCFBenchmarkPrediction {
  if (expectedOpportunity == null || !Number.isFinite(expectedOpportunity) || expectedOpportunity < 0) {
    return {
      model: "usage_rate",
      predictedFantasyPoints: null,
      sampleSize: 0,
      note: "expected opportunity unavailable",
    };
  }

  const eligible = history.filter(
    (row) =>
      Number.isFinite(row.actualFantasyPoints) &&
      row.opportunity != null &&
      Number.isFinite(row.opportunity) &&
      row.opportunity > 0,
  );

  if (eligible.length === 0) {
    return {
      model: "usage_rate",
      predictedFantasyPoints: null,
      sampleSize: 0,
      note: "no historical points-per-opportunity observations",
    };
  }

  const totalPoints = eligible.reduce((sum, row) => sum + row.actualFantasyPoints, 0);
  const totalOpportunity = eligible.reduce((sum, row) => sum + (row.opportunity ?? 0), 0);
  const rate = totalOpportunity > 0 ? totalPoints / totalOpportunity : null;

  return {
    model: "usage_rate",
    predictedFantasyPoints: rate == null ? null : rate * expectedOpportunity,
    sampleSize: eligible.length,
    note: "pooled historical fantasy points per opportunity",
  };
}

export interface CCFBenchmarkErrorMetrics {
  mae: number | null;
  rmse: number | null;
  sampleSize: number;
}

export function evaluateCCFBenchmarkErrors(
  rows: readonly { actual: number; predicted: number | null | undefined }[],
): CCFBenchmarkErrorMetrics {
  const usable = rows.filter(
    (row): row is { actual: number; predicted: number } =>
      Number.isFinite(row.actual) && row.predicted != null && Number.isFinite(row.predicted),
  );

  if (usable.length === 0) {
    return { mae: null, rmse: null, sampleSize: 0 };
  }

  const absoluteErrors = usable.map((row) => Math.abs(row.predicted - row.actual));
  const squaredErrors = usable.map((row) => (row.predicted - row.actual) ** 2);

  return {
    mae: absoluteErrors.reduce((sum, value) => sum + value, 0) / usable.length,
    rmse: Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / usable.length),
    sampleSize: usable.length,
  };
}
