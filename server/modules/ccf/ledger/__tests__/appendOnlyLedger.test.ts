import {
  createCCFLedgerRecord,
  validateCCFAppendOnlyLedgerHistory,
} from "../appendOnlyLedger";

describe("CCF append-only ledger", () => {
  it("creates immutable revisions with exact supersession lineage", () => {
    const first = createCCFLedgerRecord({
      recordId: "r1",
      ledgerEntryId: "entry-1",
      recordedAt: "2026-09-11T12:00:00Z",
      payload: { signal: "injury", status: "questionable" },
    });
    const second = createCCFLedgerRecord({
      recordId: "r2",
      ledgerEntryId: "entry-1",
      recordedAt: "2026-09-11T13:00:00Z",
      payload: { signal: "injury", status: "out" },
      previous: first,
      changeNote: "official downgrade",
    });

    expect(second).toMatchObject({
      revision: 2,
      supersedesRecordId: "r1",
      changeNote: "official downgrade",
    });
    expect(validateCCFAppendOnlyLedgerHistory([second, first]).map((row) => row.recordId)).toEqual([
      "r1",
      "r2",
    ]);
  });

  it("detects payload mutation instead of silently accepting rewritten history", () => {
    const first = createCCFLedgerRecord({
      recordId: "r1",
      ledgerEntryId: "entry-1",
      recordedAt: "2026-09-11T12:00:00Z",
      payload: { value: 1 },
    });
    const mutated = { ...first, payload: { value: 2 } };
    expect(() => validateCCFAppendOnlyLedgerHistory([mutated])).toThrow(/digest mismatch/);
  });

  it("rejects broken revision or supersession chains", () => {
    const first = createCCFLedgerRecord({
      recordId: "r1",
      ledgerEntryId: "entry-1",
      recordedAt: "2026-09-11T12:00:00Z",
      payload: { value: 1 },
    });
    const second = createCCFLedgerRecord({
      recordId: "r2",
      ledgerEntryId: "entry-1",
      recordedAt: "2026-09-11T13:00:00Z",
      payload: { value: 2 },
      previous: first,
    });

    expect(() =>
      validateCCFAppendOnlyLedgerHistory([{ ...second, supersedesRecordId: "wrong" }, first]),
    ).toThrow(/must supersede/);
  });
});
