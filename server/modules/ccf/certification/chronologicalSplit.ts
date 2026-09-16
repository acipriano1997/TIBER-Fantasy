export interface CCFSeasonWeek {
  season: number;
  week: number;
}

export interface CCFTemporalWindow {
  start: CCFSeasonWeek;
  end: CCFSeasonWeek;
}

export interface CCFChronologicalSplitConfig {
  train: CCFTemporalWindow;
  validation?: CCFTemporalWindow;
  test?: CCFTemporalWindow;
}

export interface CCFChronologicalRow {
  season: number;
  week: number;
}

export interface CCFChronologicalSplit<T> {
  train: T[];
  validation: T[];
  test: T[];
  unassigned: T[];
}

export class CCFChronologicalSplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFChronologicalSplitError";
  }
}

export function compareCCFSeasonWeek(left: CCFSeasonWeek, right: CCFSeasonWeek): number {
  if (left.season !== right.season) return left.season - right.season;
  return left.week - right.week;
}

function validateMarker(label: string, marker: CCFSeasonWeek): void {
  if (!Number.isInteger(marker.season) || marker.season < 1900) {
    throw new CCFChronologicalSplitError(`${label}.season must be a plausible integer season`);
  }
  if (!Number.isInteger(marker.week) || marker.week < 1 || marker.week > 25) {
    throw new CCFChronologicalSplitError(`${label}.week must be an integer from 1 through 25`);
  }
}

function validateWindow(label: string, window: CCFTemporalWindow): void {
  validateMarker(`${label}.start`, window.start);
  validateMarker(`${label}.end`, window.end);
  if (compareCCFSeasonWeek(window.start, window.end) > 0) {
    throw new CCFChronologicalSplitError(`${label} start must not be after end`);
  }
}

function assertStrictlyBefore(
  leftLabel: string,
  left: CCFTemporalWindow,
  rightLabel: string,
  right: CCFTemporalWindow,
): void {
  if (compareCCFSeasonWeek(left.end, right.start) >= 0) {
    throw new CCFChronologicalSplitError(
      `${leftLabel} must end before ${rightLabel} begins; overlapping or same-week boundaries are forbidden`,
    );
  }
}

export function validateCCFChronologicalSplitConfig(
  config: CCFChronologicalSplitConfig,
): CCFChronologicalSplitConfig {
  validateWindow("train", config.train);
  if (config.validation) validateWindow("validation", config.validation);
  if (config.test) validateWindow("test", config.test);

  if (config.validation) {
    assertStrictlyBefore("train", config.train, "validation", config.validation);
  }
  if (config.test) {
    if (config.validation) {
      assertStrictlyBefore("validation", config.validation, "test", config.test);
    } else {
      assertStrictlyBefore("train", config.train, "test", config.test);
    }
  }

  return config;
}

function inWindow(row: CCFChronologicalRow, window: CCFTemporalWindow): boolean {
  const key = { season: row.season, week: row.week };
  return compareCCFSeasonWeek(key, window.start) >= 0 && compareCCFSeasonWeek(key, window.end) <= 0;
}

export function splitCCFRowsChronologically<T extends CCFChronologicalRow>(
  rows: readonly T[],
  config: CCFChronologicalSplitConfig,
): CCFChronologicalSplit<T> {
  validateCCFChronologicalSplitConfig(config);

  const sorted = [...rows].sort((left, right) =>
    compareCCFSeasonWeek(
      { season: left.season, week: left.week },
      { season: right.season, week: right.week },
    ),
  );

  const train: T[] = [];
  const validation: T[] = [];
  const test: T[] = [];
  const unassigned: T[] = [];

  for (const row of sorted) {
    if (inWindow(row, config.train)) {
      train.push(row);
    } else if (config.validation && inWindow(row, config.validation)) {
      validation.push(row);
    } else if (config.test && inWindow(row, config.test)) {
      test.push(row);
    } else {
      unassigned.push(row);
    }
  }

  return { train, validation, test, unassigned };
}

export function assertCCFNoFutureLeakage<T extends CCFChronologicalRow>(
  trainRows: readonly T[],
  evaluationRows: readonly T[],
): void {
  if (trainRows.length === 0 || evaluationRows.length === 0) return;

  const latestTrain = trainRows.reduce((latest, row) =>
    compareCCFSeasonWeek(row, latest) > 0 ? row : latest,
  );
  const earliestEvaluation = evaluationRows.reduce((earliest, row) =>
    compareCCFSeasonWeek(row, earliest) < 0 ? row : earliest,
  );

  if (compareCCFSeasonWeek(latestTrain, earliestEvaluation) >= 0) {
    throw new CCFChronologicalSplitError(
      "training data must be strictly earlier than every evaluation row",
    );
  }
}
