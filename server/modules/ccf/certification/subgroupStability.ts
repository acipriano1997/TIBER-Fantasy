export interface CCFSubgroupPredictionObservation {
  subgroup: string;
  actual: number;
  predicted: number;
  p10?: number;
  p90?: number;
}

export interface CCFSubgroupMetrics {
  subgroup: string;
  sampleSize: number;
  mae: number;
  meanError: number;
  central80Coverage: number | null;
}

export interface CCFSubgroupStabilityReport {
  overall: CCFSubgroupMetrics | null;
  groups: CCFSubgroupMetrics[];
  worstMaeGapVsOverall: number | null;
  worstCoverageGapVsOverall: number | null;
}

function summarize(subgroup: string, rows: readonly CCFSubgroupPredictionObservation[]): CCFSubgroupMetrics {
  const absoluteErrors = rows.map((row) => Math.abs(row.predicted - row.actual));
  const signedErrors = rows.map((row) => row.predicted - row.actual);
  const intervalRows = rows.filter(
    (row) =>
      row.p10 != null &&
      row.p90 != null &&
      Number.isFinite(row.p10) &&
      Number.isFinite(row.p90) &&
      row.p10 <= row.p90,
  );
  const covered = intervalRows.filter(
    (row) => row.actual >= (row.p10 as number) && row.actual <= (row.p90 as number),
  ).length;

  return {
    subgroup,
    sampleSize: rows.length,
    mae: absoluteErrors.reduce((sum, value) => sum + value, 0) / rows.length,
    meanError: signedErrors.reduce((sum, value) => sum + value, 0) / rows.length,
    central80Coverage: intervalRows.length ? covered / intervalRows.length : null,
  };
}

export function evaluateCCFSubgroupStability(
  rows: readonly CCFSubgroupPredictionObservation[],
  minimumGroupSize = 1,
): CCFSubgroupStabilityReport {
  if (!Number.isInteger(minimumGroupSize) || minimumGroupSize < 1) {
    throw new Error("minimumGroupSize must be a positive integer");
  }

  const usable = rows.filter(
    (row) =>
      row.subgroup.trim().length > 0 &&
      Number.isFinite(row.actual) &&
      Number.isFinite(row.predicted),
  );
  if (usable.length === 0) {
    return { overall: null, groups: [], worstMaeGapVsOverall: null, worstCoverageGapVsOverall: null };
  }

  const overall = summarize("ALL", usable);
  const byGroup = new Map<string, CCFSubgroupPredictionObservation[]>();
  for (const row of usable) {
    const group = byGroup.get(row.subgroup) ?? [];
    group.push(row);
    byGroup.set(row.subgroup, group);
  }

  const groups = [...byGroup.entries()]
    .filter(([, groupRows]) => groupRows.length >= minimumGroupSize)
    .map(([subgroup, groupRows]) => summarize(subgroup, groupRows))
    .sort((a, b) => a.subgroup.localeCompare(b.subgroup));

  const worstMaeGapVsOverall = groups.length
    ? Math.max(...groups.map((group) => group.mae - overall.mae))
    : null;

  const coverageGaps = groups
    .filter(
      (group): group is CCFSubgroupMetrics & { central80Coverage: number } =>
        group.central80Coverage != null && overall.central80Coverage != null,
    )
    .map((group) => Math.abs(group.central80Coverage - (overall.central80Coverage as number)));

  return {
    overall,
    groups,
    worstMaeGapVsOverall,
    worstCoverageGapVsOverall: coverageGaps.length ? Math.max(...coverageGaps) : null,
  };
}
