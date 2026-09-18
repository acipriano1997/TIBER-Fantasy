import { evaluateCCFBenchmarkErrors } from "./simpleBenchmarks";

export interface CCFPairedPredictionRow {
  actual: number;
  candidate: number | null | undefined;
  benchmark: number | null | undefined;
}

export interface CCFModelBenchmarkComparison {
  pairedSampleSize: number;
  candidateMae: number | null;
  benchmarkMae: number | null;
  maeImprovement: number | null;
  candidateRmse: number | null;
  benchmarkRmse: number | null;
  rmseImprovement: number | null;
  candidateWins: number;
  benchmarkWins: number;
  ties: number;
}

export function compareCCFModelToBenchmark(
  rows: readonly CCFPairedPredictionRow[],
): CCFModelBenchmarkComparison {
  const paired = rows.filter(
    (row): row is { actual: number; candidate: number; benchmark: number } =>
      Number.isFinite(row.actual) &&
      row.candidate != null &&
      Number.isFinite(row.candidate) &&
      row.benchmark != null &&
      Number.isFinite(row.benchmark),
  );

  const candidateMetrics = evaluateCCFBenchmarkErrors(
    paired.map((row) => ({ actual: row.actual, predicted: row.candidate })),
  );
  const benchmarkMetrics = evaluateCCFBenchmarkErrors(
    paired.map((row) => ({ actual: row.actual, predicted: row.benchmark })),
  );

  let candidateWins = 0;
  let benchmarkWins = 0;
  let ties = 0;
  for (const row of paired) {
    const candidateError = Math.abs(row.candidate - row.actual);
    const benchmarkError = Math.abs(row.benchmark - row.actual);
    if (candidateError < benchmarkError) candidateWins += 1;
    else if (benchmarkError < candidateError) benchmarkWins += 1;
    else ties += 1;
  }

  return {
    pairedSampleSize: paired.length,
    candidateMae: candidateMetrics.mae,
    benchmarkMae: benchmarkMetrics.mae,
    maeImprovement:
      candidateMetrics.mae == null || benchmarkMetrics.mae == null
        ? null
        : benchmarkMetrics.mae - candidateMetrics.mae,
    candidateRmse: candidateMetrics.rmse,
    benchmarkRmse: benchmarkMetrics.rmse,
    rmseImprovement:
      candidateMetrics.rmse == null || benchmarkMetrics.rmse == null
        ? null
        : benchmarkMetrics.rmse - candidateMetrics.rmse,
    candidateWins,
    benchmarkWins,
    ties,
  };
}
