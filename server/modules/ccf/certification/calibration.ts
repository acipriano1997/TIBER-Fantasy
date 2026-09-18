export interface CCFIntervalCalibrationObservation {
  actual: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface CCFIntervalCalibrationMetrics {
  sampleSize: number;
  central80Coverage: number | null;
  belowP10Rate: number | null;
  aboveP90Rate: number | null;
  medianMeanError: number | null;
  medianMae: number | null;
}

export interface CCFProbabilityCalibrationObservation {
  probability: number;
  occurred: boolean;
}

export interface CCFProbabilityCalibrationBin {
  lowerInclusive: number;
  upperInclusive: number;
  sampleSize: number;
  meanForecast: number | null;
  observedRate: number | null;
  calibrationGap: number | null;
}

export interface CCFProbabilityCalibrationMetrics {
  sampleSize: number;
  brierScore: number | null;
  bins: CCFProbabilityCalibrationBin[];
}

function isFiniteInterval(row: CCFIntervalCalibrationObservation): boolean {
  return [row.actual, row.p10, row.p50, row.p90].every(Number.isFinite) && row.p10 <= row.p50 && row.p50 <= row.p90;
}

export function evaluateCCFIntervalCalibration(
  rows: readonly CCFIntervalCalibrationObservation[],
): CCFIntervalCalibrationMetrics {
  const usable = rows.filter(isFiniteInterval);
  if (usable.length === 0) {
    return {
      sampleSize: 0,
      central80Coverage: null,
      belowP10Rate: null,
      aboveP90Rate: null,
      medianMeanError: null,
      medianMae: null,
    };
  }

  let covered = 0;
  let below = 0;
  let above = 0;
  let signedError = 0;
  let absoluteError = 0;

  for (const row of usable) {
    if (row.actual >= row.p10 && row.actual <= row.p90) covered += 1;
    if (row.actual < row.p10) below += 1;
    if (row.actual > row.p90) above += 1;
    const error = row.p50 - row.actual;
    signedError += error;
    absoluteError += Math.abs(error);
  }

  return {
    sampleSize: usable.length,
    central80Coverage: covered / usable.length,
    belowP10Rate: below / usable.length,
    aboveP90Rate: above / usable.length,
    medianMeanError: signedError / usable.length,
    medianMae: absoluteError / usable.length,
  };
}

export function evaluateCCFProbabilityCalibration(
  rows: readonly CCFProbabilityCalibrationObservation[],
  binCount = 10,
): CCFProbabilityCalibrationMetrics {
  if (!Number.isInteger(binCount) || binCount < 2 || binCount > 100) {
    throw new Error("binCount must be an integer from 2 through 100");
  }

  const usable = rows.filter(
    (row) => Number.isFinite(row.probability) && row.probability >= 0 && row.probability <= 1,
  );
  const bins: CCFProbabilityCalibrationBin[] = [];

  for (let index = 0; index < binCount; index += 1) {
    const lowerInclusive = index / binCount;
    const upperInclusive = (index + 1) / binCount;
    const members = usable.filter((row) => {
      if (index === binCount - 1) {
        return row.probability >= lowerInclusive && row.probability <= upperInclusive;
      }
      return row.probability >= lowerInclusive && row.probability < upperInclusive;
    });

    const meanForecast = members.length
      ? members.reduce((sum, row) => sum + row.probability, 0) / members.length
      : null;
    const observedRate = members.length
      ? members.reduce((sum, row) => sum + (row.occurred ? 1 : 0), 0) / members.length
      : null;

    bins.push({
      lowerInclusive,
      upperInclusive,
      sampleSize: members.length,
      meanForecast,
      observedRate,
      calibrationGap:
        meanForecast == null || observedRate == null ? null : observedRate - meanForecast,
    });
  }

  const brierScore = usable.length
    ? usable.reduce(
        (sum, row) => sum + (row.probability - (row.occurred ? 1 : 0)) ** 2,
        0,
      ) / usable.length
    : null;

  return { sampleSize: usable.length, brierScore, bins };
}
