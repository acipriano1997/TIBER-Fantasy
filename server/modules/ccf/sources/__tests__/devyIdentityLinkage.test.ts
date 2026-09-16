import {
  evaluateCCFDevyIdentityLinkage,
  fingerprintCCFDevyIdentityLinkageReceipt,
  type CCFDevyIdentityLinkageReceipt,
} from "../devyIdentityLinkage";

function receipt(): CCFDevyIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-devy-identity-linkage-v1",
    receiptId: "synthetic-devy-linkage-v1",
    sourceArtifactFingerprint: "sha256:synthetic-sheet",
    sourceSchemaVersion: "synthetic-sheet-v1",
    sourceImportedAt: "2026-09-15T12:00:00Z",
    sleeperLeagueId: "synthetic-league",
    sleeperSnapshotFingerprint: "sha256:synthetic-sleeper-snapshot",
    sleeperSnapshotKnownAt: "2026-09-15T12:05:00Z",
    frozenAt: "2026-09-15T12:10:00Z",
    rosterBindings: [
      {
        sourceRosterKey: "team-a",
        sleeperRosterId: 1,
        bindingMethod: "explicit_mapping",
        evidenceRefs: ["synthetic://roster/team-a"],
      },
      {
        sourceRosterKey: "team-b",
        sleeperRosterId: 2,
        bindingMethod: "explicit_mapping",
        evidenceRefs: ["synthetic://roster/team-b"],
      },
    ],
    rows: [
      {
        sourceRowKey: "row-1",
        sourceRosterKey: "team-a",
        status: "resolved_exact",
        canonicalPlayerId: "canonical-player-1",
        sleeperPlayerId: "sleeper-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-15T12:06:00Z",
        evidenceRefs: ["synthetic://player/1"],
      },
      {
        sourceRowKey: "row-2",
        sourceRosterKey: "team-b",
        status: "resolved_exact",
        canonicalPlayerId: "canonical-player-2",
        sleeperPlayerId: "sleeper-player-2",
        bindingMethod: "explicit_mapping",
        knownAt: "2026-09-15T12:07:00Z",
        evidenceRefs: ["synthetic://player/2"],
      },
      {
        sourceRowKey: "header-or-note",
        sourceRosterKey: "team-a",
        status: "not_applicable",
        canonicalPlayerId: null,
        sleeperPlayerId: null,
        bindingMethod: null,
        knownAt: "2026-09-15T12:00:00Z",
        evidenceRefs: ["synthetic://row/header"],
      },
    ],
    notes: [],
  };
}

const asOf = "2026-09-15T13:00:00Z";

describe("CCF Devy spreadsheet to Sleeper identity linkage", () => {
  it("passes only when every applicable row has an exact governed player binding", () => {
    const audit = evaluateCCFDevyIdentityLinkage(receipt(), asOf);
    expect(audit.ready).toBe(true);
    expect(audit.applicableRows).toBe(2);
    expect(audit.resolvedRows).toBe(2);
    expect(audit.unresolvedRows).toBe(0);
    expect(audit.ambiguousRows).toBe(0);
    expect(audit.rosterBindingCount).toBe(2);
    expect(audit.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["unresolved", "ambiguous"] as const)(
    "fails closed when an applicable row is %s",
    (status) => {
      const candidate = receipt();
      candidate.rows[0] = {
        ...candidate.rows[0],
        status,
        canonicalPlayerId: null,
        sleeperPlayerId: null,
        bindingMethod: null,
      };
      const audit = evaluateCCFDevyIdentityLinkage(candidate, asOf);
      expect(audit.ready).toBe(false);
      expect(audit.blockers).toContain(`${status}_rows:1`);
      expect(audit.blockers).toContain("applicable_rows_not_fully_resolved");
    },
  );

  it("rejects unresolved rows that pretend to carry a player binding", () => {
    const candidate = receipt();
    candidate.rows[0] = { ...candidate.rows[0], status: "unresolved" };
    const audit = evaluateCCFDevyIdentityLinkage(candidate, asOf);
    expect(audit.ready).toBe(false);
    expect(audit.blockers.some((blocker) => blocker.includes("non-resolved status must not claim"))).toBe(true);
  });

  it("rejects duplicate canonical or Sleeper player identities", () => {
    const duplicateCanonical = receipt();
    duplicateCanonical.rows[1] = {
      ...duplicateCanonical.rows[1],
      canonicalPlayerId: duplicateCanonical.rows[0].canonicalPlayerId,
    };
    expect(
      evaluateCCFDevyIdentityLinkage(duplicateCanonical, asOf).blockers.some((blocker) =>
        blocker.includes("duplicate resolved canonicalPlayerId"),
      ),
    ).toBe(true);

    const duplicateSleeper = receipt();
    duplicateSleeper.rows[1] = {
      ...duplicateSleeper.rows[1],
      sleeperPlayerId: duplicateSleeper.rows[0].sleeperPlayerId,
    };
    expect(
      evaluateCCFDevyIdentityLinkage(duplicateSleeper, asOf).blockers.some((blocker) =>
        blocker.includes("duplicate resolved sleeperPlayerId"),
      ),
    ).toBe(true);
  });

  it("rejects rows assigned to an unbound spreadsheet roster", () => {
    const candidate = receipt();
    candidate.rows[0] = { ...candidate.rows[0], sourceRosterKey: "unmapped-team" };
    const audit = evaluateCCFDevyIdentityLinkage(candidate, asOf);
    expect(audit.ready).toBe(false);
    expect(audit.blockers.some((blocker) => blocker.includes("unbound sourceRosterKey"))).toBe(true);
  });

  it("rejects ambiguous roster mappings", () => {
    const duplicateSourceRoster = receipt();
    duplicateSourceRoster.rosterBindings[1] = {
      ...duplicateSourceRoster.rosterBindings[1],
      sourceRosterKey: "team-a",
    };
    expect(
      evaluateCCFDevyIdentityLinkage(duplicateSourceRoster, asOf).blockers.some((blocker) =>
        blocker.includes("duplicate sourceRosterKey"),
      ),
    ).toBe(true);

    const duplicateSleeperRoster = receipt();
    duplicateSleeperRoster.rosterBindings[1] = {
      ...duplicateSleeperRoster.rosterBindings[1],
      sleeperRosterId: 1,
    };
    expect(
      evaluateCCFDevyIdentityLinkage(duplicateSleeperRoster, asOf).blockers.some((blocker) =>
        blocker.includes("duplicate sleeperRosterId"),
      ),
    ).toBe(true);
  });

  it("enforces point-in-time eligibility for the sheet, Sleeper snapshot, freeze, and rows", () => {
    const futureSheet = { ...receipt(), sourceImportedAt: "2026-09-15T13:01:00Z" };
    expect(evaluateCCFDevyIdentityLinkage(futureSheet, asOf).blockers).toContain(
      "source_imported_after_as_of",
    );

    const futureSleeper = { ...receipt(), sleeperSnapshotKnownAt: "2026-09-15T13:01:00Z" };
    expect(evaluateCCFDevyIdentityLinkage(futureSleeper, asOf).blockers).toContain(
      "sleeper_snapshot_known_after_as_of",
    );

    const futureFreeze = { ...receipt(), frozenAt: "2026-09-15T13:01:00Z" };
    expect(evaluateCCFDevyIdentityLinkage(futureFreeze, asOf).blockers).toContain(
      "receipt_frozen_after_as_of",
    );

    const futureRow = receipt();
    futureRow.rows[0] = { ...futureRow.rows[0], knownAt: "2026-09-15T12:11:00Z" };
    expect(evaluateCCFDevyIdentityLinkage(futureRow, asOf).blockers).toContain(
      "row-1:known_after_freeze",
    );
  });

  it("fingerprints row, roster, evidence-ref, and note ordering deterministically", () => {
    const first = receipt();
    const reordered: CCFDevyIdentityLinkageReceipt = {
      ...first,
      rosterBindings: [...first.rosterBindings].reverse(),
      rows: [...first.rows].reverse(),
      notes: ["b", "a"],
    };
    const comparison = { ...first, notes: ["a", "b"] };
    expect(fingerprintCCFDevyIdentityLinkageReceipt(reordered)).toBe(
      fingerprintCCFDevyIdentityLinkageReceipt(comparison),
    );
  });
});
