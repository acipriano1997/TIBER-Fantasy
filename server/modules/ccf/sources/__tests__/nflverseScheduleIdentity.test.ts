import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseSchedule } from "../archivedNflverseSchedule";
import {
  auditCCFNflverseScheduleIdentity,
  fingerprintCCFNflverseScheduleIdentityPolicyReceipt,
  refCCFNflverseScheduleIdentityPolicyReceipt,
  type CCFNflverseScheduleIdentityPolicyReceipt,
} from "../nflverseScheduleIdentity";

const CSV = [
  "game_id,season,game_type,week,gameday,gametime,away_team,home_team",
  "2026_02_TB_CIN,2026,REG,2,2026-09-20,13:00,TB,CIN",
  "2026_02_SF_LA,2026,REG,2,2026-09-20,16:25,SF,LA",
].join("\n");

const RECEIPT: CCFNflverseScheduleIdentityPolicyReceipt = {
  contractVersion: "ccf-nflverse-schedule-identity-policy-v1",
  receiptId: "nflverse-schedule-provider-native-identity-v1",
  sourceSystem: "nflverse",
  gameIdNamespace: "nflverse_game_id",
  teamIdNamespace: "nflverse_team_abbreviation",
  identityScope: "provider_native_schedule",
  crossProviderCanonicalClaim: false,
  knownAt: "2026-09-16T15:00:00Z",
  frozenAt: "2026-09-16T15:30:00Z",
  evidenceRefs: [
    "fixture://nflverse/schedule-game-id-contract",
    "fixture://nflverse/schedule-team-abbreviation-contract",
  ],
  notes: ["synthetic policy receipt"],
};

describe("nflverse schedule provider-native identity policy", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-schedule-identity-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function snapshot() {
    const fetchImpl = jest.fn(async () => new Response(CSV, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflverseSchedule({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-16T16:01:00Z"),
    });
  }

  it("fingerprints a frozen provider-native identity contract without claiming canonical cross-provider identity", () => {
    expect(fingerprintCCFNflverseScheduleIdentityPolicyReceipt(RECEIPT)).toMatch(/^[a-f0-9]{64}$/);
    expect(refCCFNflverseScheduleIdentityPolicyReceipt(RECEIPT)).toMatch(
      /^ccf:\/\/nflverse-schedule-identity\/sha256\/[a-f0-9]{64}$/,
    );
    expect(RECEIPT.crossProviderCanonicalClaim).toBe(false);
  });

  it("resolves only provider-native schedule keys when the policy existed by asOf", async () => {
    const value = await snapshot();
    const audit = auditCCFNflverseScheduleIdentity(value, RECEIPT, value.knownAt);
    expect(audit.blockers).toEqual([]);
    expect(audit.eligibleCount).toBe(2);
    expect(audit.resolvedCount).toBe(2);
    expect(audit.identityBindingRef).toBe(refCCFNflverseScheduleIdentityPolicyReceipt(RECEIPT));
  });

  it("does not let a later identity policy retroactively resolve an earlier schedule capture", async () => {
    const value = await snapshot();
    const future: CCFNflverseScheduleIdentityPolicyReceipt = {
      ...RECEIPT,
      knownAt: "2026-09-17T15:00:00Z",
      frozenAt: "2026-09-17T15:30:00Z",
    };
    const audit = auditCCFNflverseScheduleIdentity(value, future, value.knownAt);
    expect(audit.resolvedCount).toBe(0);
    expect(audit.blockers).toEqual(expect.arrayContaining([
      "identity_policy_known_after_as_of",
      "identity_policy_frozen_after_as_of",
    ]));
  });

  it("rejects any receipt that attempts to claim cross-provider canonical identity", async () => {
    const value = await snapshot();
    const invalid = {
      ...RECEIPT,
      crossProviderCanonicalClaim: true,
    } as unknown as CCFNflverseScheduleIdentityPolicyReceipt;
    const audit = auditCCFNflverseScheduleIdentity(value, invalid, value.knownAt);
    expect(audit.resolvedCount).toBe(0);
    expect(audit.blockers.some((blocker) => blocker.startsWith("invalid_receipt:"))).toBe(true);
  });

  it("fails identity resolution when the archived schedule key is duplicated or malformed", async () => {
    const value = await snapshot();
    value.rows[1] = { ...value.rows[1], gameId: value.rows[0].gameId };
    const audit = auditCCFNflverseScheduleIdentity(value, RECEIPT, value.knownAt);
    expect(audit.resolvedCount).toBe(1);
    expect(audit.blockers).toContain(`duplicate_schedule_game_id:${value.rows[0].gameId}`);
  });
});
