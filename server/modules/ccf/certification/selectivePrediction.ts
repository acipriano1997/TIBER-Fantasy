export interface CCFSelectivePredictionObservation {
  observationId: string;
  loss: number;
  selectionScore: number;
}

export interface CCFRiskCoveragePoint {
  requestedCoverage: number;
  realizedCoverage: number;
  acceptedCount: number;
  risk: number;
}

export interface CCFSelectivePredictionMetrics {
  sampleSize: number;
  fullCoverageRisk: number | null;
  areaUnderRiskCoverageCurve: number | null;
  oracleAreaUnderRiskCoverageCurve: number | null;
  excessAreaUnderRiskCoverageCurve: number | null;
  points: CCFRiskCoveragePoint[];
}

function validateCoverageLevels(levels: readonly number[]): number[] {
  if (levels.length === 0) throw new Error("coverageLevels must not be empty");
  const sorted = [...levels].sort((left, right) => left - right);
  if (new Set(sorted).size !== sorted.length) throw new Error("coverageLevels must be unique");
  for (const level of sorted) {
    if (!Number.isFinite(level) || level <= 0 || level > 1) {
      throw new Error("coverage levels must be greater than 0 and at most 1");
    }
  }
  return sorted;
}

function validateRows(rows: readonly CCFSelectivePredictionObservation[]): CCFSelectivePredictionObservation[] {
  const ids = new Set<string>();
  return rows.map((row) => {
    if (!row.observationId.trim()) throw new Error("observationId is required");
    if (ids.has(row.observationId)) throw new Error(`duplicate observationId ${row.observationId}`);
    ids.add(row.observationId);
    if (!Number.isFinite(row.loss) || row.loss < 0) {
      throw new Error(`${row.observationId} loss must be finite and non-negative`);
    }
    if (!Number.isFinite(row.selectionScore)) {
      throw new Error(`${row.observationId} selectionScore must be finite`);
    }
    return row;
  });
}

function riskCurveArea(sorted: readonly CCFSelectivePredictionObservation[]): number | null {
  if (sorted.length === 0) return null;
  let cumulativeLoss = 0;
  let riskSum = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    cumulativeLoss += sorted[index].loss;
    riskSum += cumulativeLoss / (index + 1);
  }
  return riskSum / sorted.length;
}

export function evaluateCCFSelectivePrediction(
  rows: readonly CCFSelectivePredictionObservation[],
  coverageLevels: readonly number[] = [0.25, 0.5, 0.75, 1],
): CCFSelectivePredictionMetrics {
  const usable = validateRows(rows);
  const levels = validateCoverageLevels(coverageLevels);
  if (usable.length === 0) {
    return {
      sampleSize: 0,
      fullCoverageRisk: null,
      areaUnderRiskCoverageCurve: null,
      oracleAreaUnderRiskCoverageCurve: null,
      excessAreaUnderRiskCoverageCurve: null,
      points: [],
    };
  }

  const selected = [...usable].sort(
    (left, right) =>
      right.selectionScore - left.selectionScore ||
      left.observationId.localeCompare(right.observationId),
  );
  const oracle = [...usable].sort(
    (left, right) => left.loss - right.loss || left.observationId.localeCompare(right.observationId),
  );

  const prefixLoss: number[] = [];
  let cumulative = 0;
  for (const row of selected) {
    cumulative += row.loss;
    prefixLoss.push(cumulative);
  }

  const points = levels.map((requestedCoverage) => {
    const acceptedCount = Math.max(1, Math.ceil(requestedCoverage * selected.length));
    return {
      requestedCoverage,
      realizedCoverage: acceptedCount / selected.length,
      acceptedCount,
      risk: prefixLoss[acceptedCount - 1] / acceptedCount,
    };
  });

  const areaUnderRiskCoverageCurve = riskCurveArea(selected);
  const oracleAreaUnderRiskCoverageCurve = riskCurveArea(oracle);

  return {
    sampleSize: usable.length,
    fullCoverageRisk: prefixLoss[prefixLoss.length - 1] / usable.length,
    areaUnderRiskCoverageCurve,
    oracleAreaUnderRiskCoverageCurve,
    excessAreaUnderRiskCoverageCurve:
      areaUnderRiskCoverageCurve == null || oracleAreaUnderRiskCoverageCurve == null
        ? null
        : areaUnderRiskCoverageCurve - oracleAreaUnderRiskCoverageCurve,
    points,
  };
}
