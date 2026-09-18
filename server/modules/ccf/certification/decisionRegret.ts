export interface CCFDecisionRegretObservation {
  decisionId: string;
  chosenRealizedUtility: number | null | undefined;
  bestFeasibleRealizedUtility: number | null | undefined;
  feasibleAlternativeCount: number;
  abstained: boolean;
}

export interface CCFDecisionRegretMetrics {
  totalDecisionCount: number;
  evaluatedDecisionCount: number;
  abstentionCount: number;
  abstentionRate: number | null;
  meanRegret: number | null;
  medianRegret: number | null;
  p90Regret: number | null;
  maxRegret: number | null;
  zeroRegretRate: number | null;
  catastrophicRegretThreshold: number;
  catastrophicRegretRate: number | null;
}

function quantile(sorted: readonly number[], probability: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * probability)));
  return sorted[index];
}

export function evaluateCCFDecisionRegret(
  rows: readonly CCFDecisionRegretObservation[],
  catastrophicRegretThreshold = 10,
): CCFDecisionRegretMetrics {
  if (!Number.isFinite(catastrophicRegretThreshold) || catastrophicRegretThreshold < 0) {
    throw new Error("catastrophicRegretThreshold must be a finite non-negative number");
  }

  const seenDecisionIds = new Set<string>();
  let abstentionCount = 0;
  const regrets: number[] = [];

  for (const row of rows) {
    if (!row.decisionId.trim()) throw new Error("decisionId is required");
    if (seenDecisionIds.has(row.decisionId)) {
      throw new Error(`duplicate decisionId ${row.decisionId}`);
    }
    seenDecisionIds.add(row.decisionId);

    if (!Number.isInteger(row.feasibleAlternativeCount) || row.feasibleAlternativeCount < 0) {
      throw new Error(`${row.decisionId} feasibleAlternativeCount must be a non-negative integer`);
    }

    if (row.abstained) {
      abstentionCount += 1;
      continue;
    }

    if (
      row.chosenRealizedUtility == null ||
      !Number.isFinite(row.chosenRealizedUtility) ||
      row.bestFeasibleRealizedUtility == null ||
      !Number.isFinite(row.bestFeasibleRealizedUtility)
    ) {
      continue;
    }

    if (row.feasibleAlternativeCount < 1) {
      throw new Error(`${row.decisionId} requires at least one feasible alternative when evaluated`);
    }

    const regret = row.bestFeasibleRealizedUtility - row.chosenRealizedUtility;
    if (regret < -1e-9) {
      throw new Error(
        `${row.decisionId} bestFeasibleRealizedUtility cannot be below chosenRealizedUtility`,
      );
    }
    regrets.push(Math.max(0, regret));
  }

  const totalDecisionCount = rows.length;
  const evaluatedDecisionCount = regrets.length;
  const sorted = [...regrets].sort((left, right) => left - right);

  return {
    totalDecisionCount,
    evaluatedDecisionCount,
    abstentionCount,
    abstentionRate: totalDecisionCount ? abstentionCount / totalDecisionCount : null,
    meanRegret: evaluatedDecisionCount
      ? regrets.reduce((sum, value) => sum + value, 0) / evaluatedDecisionCount
      : null,
    medianRegret: evaluatedDecisionCount ? quantile(sorted, 0.5) : null,
    p90Regret: evaluatedDecisionCount ? quantile(sorted, 0.9) : null,
    maxRegret: evaluatedDecisionCount ? sorted[sorted.length - 1] : null,
    zeroRegretRate: evaluatedDecisionCount
      ? regrets.filter((value) => value <= 1e-9).length / evaluatedDecisionCount
      : null,
    catastrophicRegretThreshold,
    catastrophicRegretRate: evaluatedDecisionCount
      ? regrets.filter((value) => value >= catastrophicRegretThreshold).length /
        evaluatedDecisionCount
      : null,
  };
}
