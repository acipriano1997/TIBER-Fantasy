import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseInjuries } from "../archivedNflverseInjuries";
import { buildCCFNflverseInjuryReliabilityObservation } from "../nflverseInjuryReliability";

const HEADER =
  "season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified";

const BASE_ROWS = [
  "2026,REG,AAA,2,00-0000001,WR,Receiver One,Receiver,One,Hamstring,,Questionable,Hamstring,,Limited Participation,2026-09-16 12:00:00",
  "2026,REG,AAA,2,00-0000002,RB,Runner Two,Runner,Two,Knee,,,Knee,,Full Participation,2026-09-16 12:01:00",
  "2026,REG,AAA,2,00-0000003,TE,Tight End Three,Tight End,Three,,,,Ankle,,,2026-09-16 12:02:00",
];

const IDENTITY_REF = "ccf://identity/gsis-player-v1";
const DESIGNATION_POLICY_REF = "ccf://policy/injury-designation-fields-v1";
const PRACTICE_POLICY_REF = "ccf://policy/practice-participation-fields-v1";
const CORRECTION_REF = "ccf://policy/nflverse-injury-corrections-v1";
const CHECKPOINT_REF = "ccf://policy/nflverse-injury-checkpoints-v1";

function csv(rows: string[] = BASE_ROWS): string {
  return [HEADER, ...rows].join("\n");
}

describe("nflverse archived injury reliability observations", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-injury-reliability-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function archived(
    content: string,
    capturedAt: string,
    week = 2,
  ) {
    const fetchImpl = jest.fn(async () => new Response(content, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflverseInjuries({
      season: 2026,
      week,
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  it("derives designation quality, identity resolution, parser identity and archive evidence", async () => {
    const snapshot = await archived(csv(), "2026-09-16T16:01:00Z");
    const observation = buildCCFNflverseInjuryReliabilityObservation({
      snapshot,
      capability: "injury_designation",
      sourceId: "nflverse-injuries-designation-v2",
      checkpointId: "week-2-wed",
      scheduledFor: "2026-09-16T16:00:00Z",
      resolvedSourcePlayerIds: ["00-0000001", "00-0000002"],
      identityBindingRef: IDENTITY_REF,
      criticalFieldPolicyRef: DESIGNATION_POLICY_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    });

    expect(observation).toMatchObject({
      sourceId: "nflverse-injuries-designation-v2",
      producer: "nflverse",
      captureStatus: "success",
      schemaStatus: "valid",
      rowCount: 3,
      identityEligibleCount: 3,
      identityResolvedCount: 2,
      criticalFieldEligibleCount: 2,
      criticalFieldMissingCount: 1,
      duplicateKeyCount: 0,
      correctionStatus: "none",
      parserVersion: "ccf-nflverse-injuries-candidate-v2",
      archiveRef: snapshot.archive.manifest.archiveRef,
      contentSha256: snapshot.archive.manifest.contentSha256,
    });
    expect(observation.evidenceRefs).toEqual(expect.arrayContaining([
      snapshot.archive.manifest.archiveRef,
      IDENTITY_REF,
      DESIGNATION_POLICY_REF,
      CORRECTION_REF,
      CHECKPOINT_REF,
    ]));
  });

  it("derives practice-participation missingness independently from designation", async () => {
    const snapshot = await archived(csv(), "2026-09-16T16:01:00Z");
    const observation = buildCCFNflverseInjuryReliabilityObservation({
      snapshot,
      capability: "practice_participation",
      sourceId: "nflverse-injuries-practice-v2",
      checkpointId: "week-2-wed",
      scheduledFor: "2026-09-16T16:00:00Z",
      resolvedSourcePlayerIds: snapshot.rows.map((row) => row.playerId),
      identityBindingRef: IDENTITY_REF,
      criticalFieldPolicyRef: PRACTICE_POLICY_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    });

    expect(observation.identityResolvedCount).toBe(3);
    expect(observation.criticalFieldEligibleCount).toBe(3);
    expect(observation.criticalFieldMissingCount).toBe(1);
  });

  it("counts duplicate player/week/team keys instead of silently de-duplicating them", async () => {
    const duplicate = csv([...BASE_ROWS, BASE_ROWS[0]]);
    const snapshot = await archived(duplicate, "2026-09-16T16:01:00Z");
    const observation = buildCCFNflverseInjuryReliabilityObservation({
      snapshot,
      capability: "injury_designation",
      sourceId: "nflverse-injuries-designation-v2",
      checkpointId: "week-2-wed",
      scheduledFor: "2026-09-16T16:00:00Z",
      resolvedSourcePlayerIds: snapshot.rows.map((row) => row.playerId),
      identityBindingRef: IDENTITY_REF,
      criticalFieldPolicyRef: DESIGNATION_POLICY_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    });

    expect(observation.rowCount).toBe(4);
    expect(observation.duplicateKeyCount).toBe(1);
  });

  it("marks a changed provider snapshot reconciled only when exact before/after archives are supplied", async () => {
    const before = await archived(csv(), "2026-09-16T16:01:00Z");
    const changedRows = [...BASE_ROWS];
    changedRows[0] = changedRows[0].replace("Limited Participation", "Full Participation");
    const after = await archived(csv(changedRows), "2026-09-17T16:01:00Z");

    const observation = buildCCFNflverseInjuryReliabilityObservation({
      snapshot: after,
      previousSnapshot: before,
      capability: "practice_participation",
      sourceId: "nflverse-injuries-practice-v2",
      checkpointId: "week-2-thu",
      scheduledFor: "2026-09-17T16:00:00Z",
      resolvedSourcePlayerIds: after.rows.map((row) => row.playerId),
      identityBindingRef: IDENTITY_REF,
      criticalFieldPolicyRef: PRACTICE_POLICY_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    });

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
    const observation = buildCCFNflverseInjuryReliabilityObservation({
      snapshot: after,
      previousSnapshot: before,
      capability: "practice_participation",
      sourceId: "nflverse-injuries-practice-v2",
      checkpointId: "week-2-thu",
      scheduledFor: "2026-09-17T16:00:00Z",
      resolvedSourcePlayerIds: after.rows.map((row) => row.playerId),
      identityBindingRef: IDENTITY_REF,
      criticalFieldPolicyRef: PRACTICE_POLICY_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    });

    expect(observation.correctionStatus).toBe("none");
    expect(observation.evidenceRefs).not.toContain(before.archive.manifest.archiveRef);
  });

  it("rejects previous snapshots from a different season/week", async () => {
    const current = await archived(csv(), "2026-09-16T16:01:00Z");
    const weekOneRows = BASE_ROWS.map((row) => row.replace(",2,00-", ",1,00-"));
    const previous = await archived(csv(weekOneRows), "2026-09-09T16:01:00Z", 1);

    expect(() =>
      buildCCFNflverseInjuryReliabilityObservation({
        snapshot: current,
        previousSnapshot: previous,
        capability: "injury_designation",
        sourceId: "nflverse-injuries-designation-v2",
        checkpointId: "week-2-wed",
        scheduledFor: "2026-09-16T16:00:00Z",
        resolvedSourcePlayerIds: current.rows.map((row) => row.playerId),
        identityBindingRef: IDENTITY_REF,
        criticalFieldPolicyRef: DESIGNATION_POLICY_REF,
        correctionPolicyRef: CORRECTION_REF,
        checkpointPolicyRef: CHECKPOINT_REF,
      }),
    ).toThrow(/must match the current season\/week/);
  });

  it("rejects duplicate or empty identity-resolution inputs", async () => {
    const snapshot = await archived(csv(), "2026-09-16T16:01:00Z");
    const base = {
      snapshot,
      capability: "injury_designation" as const,
      sourceId: "nflverse-injuries-designation-v2",
      checkpointId: "week-2-wed",
      scheduledFor: "2026-09-16T16:00:00Z",
      identityBindingRef: IDENTITY_REF,
      criticalFieldPolicyRef: DESIGNATION_POLICY_REF,
      correctionPolicyRef: CORRECTION_REF,
      checkpointPolicyRef: CHECKPOINT_REF,
    };

    expect(() =>
      buildCCFNflverseInjuryReliabilityObservation({
        ...base,
        resolvedSourcePlayerIds: ["00-0000001", "00-0000001"],
      }),
    ).toThrow(/must not contain duplicates/);

    expect(() =>
      buildCCFNflverseInjuryReliabilityObservation({
        ...base,
        resolvedSourcePlayerIds: [""],
      }),
    ).toThrow(/non-empty source player IDs/);
  });
});
