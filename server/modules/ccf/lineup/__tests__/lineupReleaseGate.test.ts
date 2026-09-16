import {
  CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE,
  auditCCFLineupReleaseGate,
  assertCCFLineupReleaseReady,
  type CCFLineupReleaseEvidenceRecord,
} from "../lineupReleaseGate";

const AS_OF = "2026-09-15T22:00:00.000Z";

function certifiedRecords(): CCFLineupReleaseEvidenceRecord[] {
  return CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE.map((evidenceKind) => ({
    schemaVersion: "ccf-lineup-release-evidence-v0",
    evidenceKind,
    evidenceId: `${evidenceKind}:cert-1`,
    fingerprint: `${evidenceKind}:fingerprint`,
    attestedAt: "2026-09-15T21:00:00.000Z",
    status: "certified",
    note: `Synthetic certification witness for ${evidenceKind}.`,
  }));
}

describe("CCF lineup release gate", () => {
  it("keeps the canonical production gate closed while no real certification witnesses exist", () => {
    const audit = auditCCFLineupReleaseGate(AS_OF);
    expect(audit.ready).toBe(false);
    expect(audit.certifiedEvidenceKinds).toEqual([]);
    expect(audit.blockers).toHaveLength(CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE.length);
    expect(() => assertCCFLineupReleaseReady(AS_OF)).toThrow(/lineup release blocked/);
  });

  it("requires every release witness before becoming ready", () => {
    const records = certifiedRecords();
    const missing = records.filter((record) => record.evidenceKind !== "predictive_validation");
    const audit = auditCCFLineupReleaseGate(AS_OF, missing);
    expect(audit.ready).toBe(false);
    expect(audit.blockers).toContain("predictive_validation:missing");
  });

  it("rejects duplicate, revoked, future-known and malformed witnesses", () => {
    const duplicate = certifiedRecords();
    duplicate.push({ ...duplicate[0], evidenceId: "duplicate" });
    expect(auditCCFLineupReleaseGate(AS_OF, duplicate).blockers).toContain(
      "unified_league_context_adapter:duplicate",
    );

    const revoked = certifiedRecords();
    revoked[1] = { ...revoked[1], status: "revoked" };
    expect(auditCCFLineupReleaseGate(AS_OF, revoked).blockers).toContain(
      `${revoked[1].evidenceKind}:not_certified`,
    );

    const future = certifiedRecords();
    future[2] = { ...future[2], attestedAt: "2026-09-15T22:00:01.000Z" };
    expect(auditCCFLineupReleaseGate(AS_OF, future).blockers).toContain(
      `${future[2].evidenceKind}:future_known`,
    );

    const malformed = certifiedRecords();
    malformed[3] = { ...malformed[3], fingerprint: "" };
    expect(auditCCFLineupReleaseGate(AS_OF, malformed).blockers).toContain(
      `${malformed[3].evidenceKind}:fingerprint_missing`,
    );
  });

  it("can prove readiness only with one valid certified witness for every required evidence kind", () => {
    const audit = auditCCFLineupReleaseGate(AS_OF, certifiedRecords());
    expect(audit.ready).toBe(true);
    expect(audit.blockers).toEqual([]);
    expect(audit.certifiedEvidenceKinds).toHaveLength(CCF_LINEUP_REQUIRED_RELEASE_EVIDENCE.length);
    expect(audit.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic regardless of release-witness input ordering", () => {
    const records = certifiedRecords();
    const forward = auditCCFLineupReleaseGate(AS_OF, records);
    const reversed = auditCCFLineupReleaseGate(AS_OF, [...records].reverse());
    expect(reversed).toEqual(forward);
  });
});
