import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflversePlayerIdCrosswalk } from "../archivedNflversePlayerIdCrosswalk";
import { fetchAndArchiveNflverseSnapCounts } from "../archivedNflverseSnapCounts";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import { buildCCFNflverseSnapCountsReliabilityObservation } from "../nflverseSnapCountsReliability";

const CROSSWALK_CSV = [
  "gsis_id,pfr_id,display_name,position",
  "00-0000001,SmitJo00,John Smith,QB",
  "00-0000002,JoneJa00,James Jones,WR",
].join("\n");

const SNAP_HEADER = "game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct";

function snapCsv(options: { missingPosition?: boolean; secondPlayer?: boolean; offenseSnaps?: number } = {}): string {
  const rows = [
    [
      "2026_02_BBB_AAA",
      "202609200aaa",
      "2026",
      "REG",
      "2",
      "John Smith",
      "SmitJo00",
      options.missingPosition ? "" : "QB",
      "AAA",
      "BBB",
      String(options.offenseSnaps ?? 55),
      "85%",
      "0",
      "0%",
      "0",
      "0%",
    ].join(","),
  ];
  if (options.secondPlayer) {
    rows.push([
      "2026_02_BBB_AAA",
      "202609200aaa",
      "2026",
      "REG",
      "2",
      "James Jones",
      "JoneJa00",
      "WR",
      "AAA",
      "BBB",
      "48",
      "74%",
      "0",
      "0%",
      "3",
      "25%",
    ].join(","));
  }
  return [SNAP_HEADER, ...rows].join("\n");
}

function canonicalReceipt(secondStatus: "resolved_exact" | "unresolved" = "resolved_exact"): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "snap-reliability-gsis-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-canonical-registry",
    identityRegistryKnownAt: "2026-09-16T17:00:00Z",
    frozenAt: "2026-09-16T17:15:00Z",
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T17:00:00Z",
        evidenceRefs: ["ccf://registry/00-0000001"],
      },
      {
        sourcePlayerId: "00-0000002",
        status: secondStatus,
        canonicalPlayerId: secondStatus === "resolved_exact" ? "ccf-player-2" : null,
        bindingMethod: secondStatus === "resolved_exact" ? "exact_external_id" : null,
        knownAt: "2026-09-16T17:00:00Z",
        evidenceRefs: ["ccf://registry/00-0000002"],
      },
    ],
    notes: ["synthetic snap reliability receipt"],
  };
}

describe("nflverse/PFR snap-count reliability observation", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-snap-reliability-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function crosswalk(capturedAt = "2026-09-16T17:30:00Z") {
    const fetchImpl = jest.fn(async () => new Response(CROSSWALK_CSV, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflversePlayerIdCrosswalk({
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  async function snapshot(csv: string, capturedAt = "2026-09-22T14:10:00Z", positions?: ("QB" | "RB" | "WR" | "TE")[]) {
    const fetchImpl = jest.fn(async () => new Response(csv, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflverseSnapCounts({
      season: 2026,
      week: 2,
      positions,
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  function buildInput(snap: Awaited<ReturnType<typeof snapshot>>, xwalk: Awaited<ReturnType<typeof crosswalk>>, receipt = canonicalReceipt()) {
    return {
      snapshot: snap,
      sourceId: "nflverse-pfr-snap-counts-v2",
      checkpointId: "w2-tue-1000-et",
      scheduledFor: "2026-09-22T14:00:00Z",
      crosswalk: xwalk,
      identityReceipt: receipt,
      criticalFieldPolicyRef: "ccf://policy/snap-critical-v2",
      correctionPolicyRef: "ccf://policy/snap-corrections-v1",
      checkpointPolicyRef: "ccf://policy/snap-checkpoints-v1",
    };
  }

  it("builds a full-scope prospective observation with exact PFR identity coverage", async () => {
    const xwalk = await crosswalk();
    const snap = await snapshot(snapCsv({ secondPlayer: true }));
    const observation = buildCCFNflverseSnapCountsReliabilityObservation(
      buildInput(snap, xwalk),
    );

    expect(observation).toMatchObject({
      captureStatus: "success",
      parserVersion: "ccf-nflverse-snap-counts-candidate-v2",
      rowCount: 2,
      identityEligibleCount: 2,
      identityResolvedCount: 2,
      criticalFieldEligibleCount: 2,
      criticalFieldMissingCount: 0,
      duplicateKeyCount: 0,
      correctionStatus: "none",
    });
    expect(observation.evidenceRefs).toContain(snap.archive.manifest.archiveRef);
    expect(observation.evidenceRefs).toContain(xwalk.archive.manifest.archiveRef);
  });

  it("measures missing position context instead of silently dropping the row", async () => {
    const xwalk = await crosswalk();
    const snap = await snapshot(snapCsv({ missingPosition: true }));
    const observation = buildCCFNflverseSnapCountsReliabilityObservation(
      buildInput(snap, xwalk),
    );

    expect(observation.rowCount).toBe(1);
    expect(observation.criticalFieldMissingCount).toBe(1);
  });

  it("measures unresolved canonical identity without guessing through names", async () => {
    const xwalk = await crosswalk();
    const snap = await snapshot(snapCsv({ secondPlayer: true }));
    const observation = buildCCFNflverseSnapCountsReliabilityObservation(
      buildInput(snap, xwalk, canonicalReceipt("unresolved")),
    );

    expect(observation.identityEligibleCount).toBe(2);
    expect(observation.identityResolvedCount).toBe(1);
    expect(observation.notes).toContain("canonical_identity_unresolved:1");
  });

  it("rejects filtered captures as incomplete qualification scope", async () => {
    const xwalk = await crosswalk();
    const snap = await snapshot(snapCsv(), "2026-09-22T14:10:00Z", ["QB"]);

    expect(() =>
      buildCCFNflverseSnapCountsReliabilityObservation(buildInput(snap, xwalk)),
    ).toThrow(/complete QB\/RB\/WR\/TE position scope/);
  });

  it("requires archived before/after witnesses when the provider snapshot changes", async () => {
    const xwalk = await crosswalk();
    const previous = await snapshot(snapCsv({ offenseSnaps: 54 }), "2026-09-22T14:05:00Z");
    const current = await snapshot(snapCsv({ offenseSnaps: 55 }), "2026-09-23T14:05:00Z");
    const observation = buildCCFNflverseSnapCountsReliabilityObservation({
      ...buildInput(current, xwalk),
      checkpointId: "w2-wed-1000-et",
      scheduledFor: "2026-09-23T14:00:00Z",
      previousSnapshot: previous,
    });

    expect(observation.correctionStatus).toBe("reconciled");
    expect(observation.evidenceRefs).toContain(previous.archive.manifest.archiveRef);
    expect(observation.notes).toContain(
      "provider_snapshot_changed_with_archived_before_after_witnesses",
    );
  });

  it("rejects a crosswalk learned after the snap-count capture", async () => {
    const xwalk = await crosswalk("2026-09-23T17:30:00Z");
    const snap = await snapshot(snapCsv());

    expect(() =>
      buildCCFNflverseSnapCountsReliabilityObservation(buildInput(snap, xwalk)),
    ).toThrow(/crosswalk_known_after_as_of/);
  });
});
