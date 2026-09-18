import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseSchedule } from "../archivedNflverseSchedule";
import {
  refCCFNflverseScheduleIdentityPolicyReceipt,
  type CCFNflverseScheduleIdentityPolicyReceipt,
} from "../nflverseScheduleIdentity";
import { buildCCFNflverseScheduleReliabilityObservation } from "../nflverseScheduleReliability";

const HEADER = "game_id,season,game_type,week,gameday,gametime,away_team,home_team";
const WEEK2_ROWS = [
  "2026_02_TB_CIN,2026,REG,2,2026-09-20,13:00,TB,CIN",
  "2026_02_SF_LA,2026,REG,2,2026-09-20,16:25,SF,LA",
];

const IDENTITY_POLICY: CCFNflverseScheduleIdentityPolicyReceipt = {
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
  notes: ["synthetic test policy; no cross-provider canonical game identity claim"],
};
const IDENTITY_REF = refCCFNflverseScheduleIdentityPolicyReceipt(IDENTITY_POLICY);
const CRITICAL_FIELD_REF = "ccf://policy/nflverse-schedule-critical-fields-v1";
const CORRECTION_REF = "ccf://policy/nflverse-schedule-corrections-v1";
const CHECKPOINT_REF = "ccf://policy/nflverse-schedule-checkpoints-v1";

function csv(rows: string[] = WEEK2_ROWS): string {
  return [HEADER, ...rows].join("\n");
}

describe("nflverse archived schedule reliability observations", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-schedule-reliability-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function archived(content: string, capturedAt: string, week = 2) {
    const fetchImpl = jest.fn(async () => new Response(content, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflverseSchedule({
      season: 2026,
      week,
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  function observe(
    snapshot: Awaited<ReturnType<typeof archived>>,
    checkpointId: string,
    scheduledFor: string,
    previousSnapshot?: Awaited<ReturnType<typeof archived>>,
  ) {
    return buildCCFNflverseScheduleReliabilityObservation({
      snapshot,
      previousSnapshot,
      sourceId: "nflverse-schedules-v1",
      checkpointId,
      scheduledFor,
      identityPolicyReceipt: IDENTITY_POLICY,
      criticalFieldPolicyRef: CRITICAL_FIELD_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    });
  }

  it("derives valid kickoff and provider-native identity quality from the archived capture", async () => {
    const snapshot = await archived(csv(), "2026-09-16T16:01:00Z");
    const observation = observe(
      snapshot,
      "week-2-wed",
      "2026-09-16T16:00:00Z",
    );

    expect(observation).toMatchObject({
      sourceId: "nflverse-schedules-v1",
      producer: "nflverse",
      captureStatus: "success",
      schemaStatus: "valid",
      rowCount: 2,
      identityEligibleCount: 2,
      identityResolvedCount: 2,
      criticalFieldEligibleCount: 2,
      criticalFieldMissingCount: 0,
      duplicateKeyCount: 0,
      correctionStatus: "none",
      parserVersion: "ccf-nflverse-schedule-candidate-v1",
      archiveRef: snapshot.archive.manifest.archiveRef,
      contentSha256: snapshot.archive.manifest.contentSha256,
    });
    expect(observation.evidenceRefs).toEqual(expect.arrayContaining([
      snapshot.archive.manifest.archiveRef,
      IDENTITY_REF,
      CRITICAL_FIELD_REF,
      CORRECTION_REF,
      CHECKPOINT_REF,
    ]));
  });

  it("rejects a schedule identity policy frozen after the archived capture", async () => {
    const snapshot = await archived(csv(), "2026-09-16T16:01:00Z");
    const futurePolicy: CCFNflverseScheduleIdentityPolicyReceipt = {
      ...IDENTITY_POLICY,
      knownAt: "2026-09-17T15:00:00Z",
      frozenAt: "2026-09-17T15:30:00Z",
    };

    expect(() =>
      buildCCFNflverseScheduleReliabilityObservation({
        snapshot,
        sourceId: "nflverse-schedules-v1",
        checkpointId: "week-2-wed",
        scheduledFor: "2026-09-16T16:00:00Z",
        identityPolicyReceipt: futurePolicy,
        criticalFieldPolicyRef: CRITICAL_FIELD_REF,
        correctionPolicyRef: CORRECTION_REF,
        checkpointPolicyRef: CHECKPOINT_REF,
      }),
    ).toThrow(/identity_policy_(known|frozen)_after_as_of/);
  });

  it("marks changed provider bytes reconciled only with archived before/after witnesses", async () => {
    const before = await archived(csv(), "2026-09-16T16:01:00Z");
    const correctedRows = [...WEEK2_ROWS];
    correctedRows[0] = correctedRows[0].replace(",13:00,", ",16:25,");
    const after = await archived(csv(correctedRows), "2026-09-17T16:01:00Z");

    const observation = observe(
      after,
      "week-2-thu",
      "2026-09-17T16:00:00Z",
      before,
    );

    expect(before.archive.manifest.contentSha256).not.toBe(after.archive.manifest.contentSha256);
    expect(observation.correctionStatus).toBe("reconciled");
    expect(observation.evidenceRefs).toEqual(expect.arrayContaining([
      before.archive.manifest.archiveRef,
      after.archive.manifest.archiveRef,
    ]));
    expect(observation.notes).toContain(
      "provider_snapshot_changed_with_archived_before_after_witnesses",
    );
  });

  it("does not invent a correction when successive archived bytes are unchanged", async () => {
    const before = await archived(csv(), "2026-09-16T16:01:00Z");
    const after = await archived(csv(), "2026-09-17T16:01:00Z");
    const observation = observe(
      after,
      "week-2-thu",
      "2026-09-17T16:00:00Z",
      before,
    );

    expect(observation.correctionStatus).toBe("none");
    expect(observation.evidenceRefs).not.toContain(before.archive.manifest.archiveRef);
  });

  it("rejects previous snapshots from a different season/week", async () => {
    const current = await archived(csv(), "2026-09-16T16:01:00Z");
    const weekOneRows = WEEK2_ROWS.map((row) => row.replace("_02_", "_01_").replace(",2,", ",1,"));
    const previous = await archived(csv(weekOneRows), "2026-09-09T16:01:00Z", 1);

    expect(() =>
      observe(current, "week-2-wed", "2026-09-16T16:00:00Z", previous),
    ).toThrow(/must match the current season\/week/);
  });

  it("fails closed if an archived row is later mutated to lose critical kickoff identity", async () => {
    const snapshot = await archived(csv(), "2026-09-16T16:01:00Z");
    snapshot.rows[0] = { ...snapshot.rows[0], kickoffAt: "" };

    expect(() =>
      observe(snapshot, "week-2-wed", "2026-09-16T16:00:00Z"),
    ).toThrow(/missing critical identity or kickoff fields/);
  });
});
