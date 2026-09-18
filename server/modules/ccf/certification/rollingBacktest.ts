import {
  compareCCFSeasonWeek,
  type CCFChronologicalSplitConfig,
  type CCFSeasonWeek,
} from "./chronologicalSplit";

export interface CCFRollingBacktestConfig {
  minimumTrainObservations: number;
  validationObservations: number;
  testObservations: number;
  stepObservations: number;
}

export interface CCFRollingBacktestWindow {
  index: number;
  split: CCFChronologicalSplitConfig;
  trainObservationCount: number;
  validationObservationCount: number;
  testObservationCount: number;
}

function uniqueSortedKeys(keys: readonly CCFSeasonWeek[]): CCFSeasonWeek[] {
  const sorted = [...keys].sort(compareCCFSeasonWeek);
  const result: CCFSeasonWeek[] = [];
  for (const key of sorted) {
    const previous = result[result.length - 1];
    if (!previous || compareCCFSeasonWeek(previous, key) !== 0) result.push(key);
  }
  return result;
}

function assertPositiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

export function buildCCFRollingBacktestWindows(
  availableKeys: readonly CCFSeasonWeek[],
  config: CCFRollingBacktestConfig,
): CCFRollingBacktestWindow[] {
  assertPositiveInteger("minimumTrainObservations", config.minimumTrainObservations);
  assertPositiveInteger("validationObservations", config.validationObservations);
  assertPositiveInteger("testObservations", config.testObservations);
  assertPositiveInteger("stepObservations", config.stepObservations);

  const keys = uniqueSortedKeys(availableKeys);
  const windows: CCFRollingBacktestWindow[] = [];
  let trainEndIndex = config.minimumTrainObservations - 1;
  let index = 0;

  while (true) {
    const validationStartIndex = trainEndIndex + 1;
    const validationEndIndex = validationStartIndex + config.validationObservations - 1;
    const testStartIndex = validationEndIndex + 1;
    const testEndIndex = testStartIndex + config.testObservations - 1;
    if (testEndIndex >= keys.length) break;

    windows.push({
      index,
      split: {
        train: { start: keys[0], end: keys[trainEndIndex] },
        validation: {
          start: keys[validationStartIndex],
          end: keys[validationEndIndex],
        },
        test: { start: keys[testStartIndex], end: keys[testEndIndex] },
      },
      trainObservationCount: trainEndIndex + 1,
      validationObservationCount: config.validationObservations,
      testObservationCount: config.testObservations,
    });

    index += 1;
    trainEndIndex += config.stepObservations;
  }

  return windows;
}
