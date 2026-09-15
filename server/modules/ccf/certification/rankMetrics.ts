export interface CCFRankObservation {
  actual: number;
  predicted: number;
}

export interface CCFRankMetrics {
  sampleSize: number;
  spearman: number | null;
  kendallTauB: number | null;
  concordantPairs: number;
  discordantPairs: number;
}

function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = new Array<number>(values.length);
  let cursor = 0;
  while (cursor < indexed.length) {
    let end = cursor + 1;
    while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
    const averageRank = (cursor + 1 + end) / 2;
    for (let i = cursor; i < end; i += 1) ranks[indexed[i].index] = averageRank;
    cursor = end;
  }
  return ranks;
}

function pearson(left: readonly number[], right: readonly number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  for (let i = 0; i < left.length; i += 1) {
    const l = left[i] - leftMean;
    const r = right[i] - rightMean;
    numerator += l * r;
    leftSquares += l * l;
    rightSquares += r * r;
  }
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator > 0 ? numerator / denominator : null;
}

export function evaluateCCFRankMetrics(rows: readonly CCFRankObservation[]): CCFRankMetrics {
  const usable = rows.filter((row) => Number.isFinite(row.actual) && Number.isFinite(row.predicted));
  if (usable.length < 2) {
    return {
      sampleSize: usable.length,
      spearman: null,
      kendallTauB: null,
      concordantPairs: 0,
      discordantPairs: 0,
    };
  }

  const actualRanks = averageRanks(usable.map((row) => row.actual));
  const predictedRanks = averageRanks(usable.map((row) => row.predicted));
  const spearman = pearson(actualRanks, predictedRanks);

  let concordantPairs = 0;
  let discordantPairs = 0;
  let actualTieOnlyPairs = 0;
  let predictedTieOnlyPairs = 0;

  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const actualDirection = Math.sign(usable[i].actual - usable[j].actual);
      const predictedDirection = Math.sign(usable[i].predicted - usable[j].predicted);
      if (actualDirection === 0 && predictedDirection === 0) continue;
      if (actualDirection === 0) {
        actualTieOnlyPairs += 1;
      } else if (predictedDirection === 0) {
        predictedTieOnlyPairs += 1;
      } else if (actualDirection === predictedDirection) {
        concordantPairs += 1;
      } else {
        discordantPairs += 1;
      }
    }
  }

  const denominator = Math.sqrt(
    (concordantPairs + discordantPairs + predictedTieOnlyPairs) *
      (concordantPairs + discordantPairs + actualTieOnlyPairs),
  );
  const kendallTauB = denominator > 0
    ? (concordantPairs - discordantPairs) / denominator
    : null;

  return {
    sampleSize: usable.length,
    spearman,
    kendallTauB,
    concordantPairs,
    discordantPairs,
  };
}
