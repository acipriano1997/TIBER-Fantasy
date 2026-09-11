import {
  assertCCFNoFutureLeakage,
  splitCCFRowsChronologically,
  validateCCFChronologicalSplitConfig,
} from "../chronologicalSplit";

describe("CCF chronological split", () => {
  const rows = [
    { id: "a", season: 2024, week: 1 },
    { id: "b", season: 2024, week: 8 },
    { id: "c", season: 2024, week: 18 },
    { id: "d", season: 2025, week: 1 },
    { id: "e", season: 2025, week: 8 },
    { id: "f", season: 2025, week: 18 },
  ];

  it("builds strictly chronological train/validation/test partitions", () => {
    const split = splitCCFRowsChronologically(rows, {
      train: { start: { season: 2024, week: 1 }, end: { season: 2024, week: 18 } },
      validation: { start: { season: 2025, week: 1 }, end: { season: 2025, week: 8 } },
      test: { start: { season: 2025, week: 9 }, end: { season: 2025, week: 18 } },
    });

    expect(split.train.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(split.validation.map((row) => row.id)).toEqual(["d", "e"]);
    expect(split.test.map((row) => row.id)).toEqual(["f"]);
    expect(split.unassigned).toEqual([]);
    expect(() => assertCCFNoFutureLeakage(split.train, [...split.validation, ...split.test])).not.toThrow();
  });

  it("rejects overlapping split windows", () => {
    expect(() =>
      validateCCFChronologicalSplitConfig({
        train: { start: { season: 2024, week: 1 }, end: { season: 2025, week: 1 } },
        validation: { start: { season: 2025, week: 1 }, end: { season: 2025, week: 8 } },
      }),
    ).toThrow(/overlapping|same-week/);
  });

  it("rejects training rows that reach into evaluation time", () => {
    expect(() =>
      assertCCFNoFutureLeakage(
        [{ season: 2025, week: 4 }],
        [{ season: 2025, week: 3 }],
      ),
    ).toThrow(/strictly earlier/);
  });
});
