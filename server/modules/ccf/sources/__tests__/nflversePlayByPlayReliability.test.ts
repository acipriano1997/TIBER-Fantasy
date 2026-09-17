import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflversePlayByPlay } from "../archivedNflversePlayByPlay";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_PBP_CHECKPOINT_POLICY_REF_V1,
  CCF_NFLVERSE_PBP_CORRECTION_POLICY_REF_V1,
  CCF_NFLVERSE_PBP_CRITICAL_FIELD_POLICY_REF_V2,
  CCF_NFLVERSE_PBP_SOURCE_ID_V2,
} from "../nflversePlayByPlayCertificationPolicy";
import { buildCCFNflversePlayByPlayReliabilityObservation } from "../nflversePlayByPlayReliability";

const HEADER = [
  "play_id", "game_id", "season", "season_type", "week", "play_type", "posteam",
  "passer_player_id", "rusher_player_id", "receiver_player_id", "pass_attempt",
  "rush_attempt", "qb_dropback", "qb_scramble", "qb_kneel", "sack", "complete_pass",
  "two_point_attempt", "touchdown", "air_yards", "yards_after_catch", "yards_gained",
  "down", "goal_to_go", "yardline_100",
].join(",");

function csvRow(values: Record<string, string | number | null>): string {
  return HEADER.split(",").map((column) => {
    const value = values[column];
    return value == null ? "" : String(value);
  }).join(",");
}

function passRow(overrides: Record<string, string | number | null> = {}): string {
  return csvRow({
    play_id: 10, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG", week: 2,
    play_type: "pass", posteam: "DAL", passer_player_id: "00-0000001",
    receiver_player_id: "00-0000002", pass_attempt: 1, rush_attempt: 0,
    qb_dropback: 1, qb_scramble: 0, qb_kneel: 0, sack: 0, complete_pass: 1,
    two_point_attempt: 0, touchdown: 0, air_yards: 10, yards_after_catch: 5,
    yards_gained: 15, down: 1, goal_to_go: 0, yardline_100: 25,
    ...overrides,
  });
}

function runRow(overrides: Record<string, string | number | null> = {}): string {
  return csvRow({
    play_id: 20, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG", week: 2,
    play_type: "run", posteam: "DAL", rusher_player_id: "00-0000003",
    pass_attempt: 0, rush_attempt: 1, qb_dropback: 0, qb_scramble: 0, qb_kneel: 0,
    sack: 0, complete_pass: 0, two_point_attempt: 0, touchdown: 0,
    yards_gained: 6, down: 1, goal_to_go: 0, yardline_100: 8,
    ...overrides,
  });
}

function cleanCsv(): string {
  return [HEADER, passRow(), runRow()].join("\n");
}

function identityReceipt(
  frozenAt = "2026-09-16T18:00:00Z",
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "pbp-reliability-test-identity-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-pbp-canonical-registry",
    identityRegistryKnownAt: "2026-09-16T17:45:00Z",
    frozenAt,
    rows: ["00-0000001", "00-0000002", "00-0000003"].map((sourcePlayerId, index) => ({
      sourcePlayerId,
      status: "resolved_exact" as const,
      canonicalPlayerId: `ccf-player-${index + 1}`,
      bindingMethod: "exact_external_id" as const,
      knownAt: "2026-09-16T17:45:00Z",
      evidenceRefs: [`ccf://registry/${sourcePlayerId}`],
    })),
    notes: ["synthetic PBP reliability test receipt"],
  };
}

describe("nflverse play-by-play opportunity reliability", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-pbp-reliability-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function snapshot(
    csv: string,
    capturedAt = "2026-09-22T14:05:00Z",
  ) {
    const fetchImpl = jest.fn(async () => new Response(csv, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflversePlayByPlay({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  function observationInput(
    pbpSnapshot: Awaited<ReturnType<typeof snapshot>>,
    overrides: Partial<Parameters<typeof buildCCFNflversePlayByPlayReliabilityObservation>[0]> = {},
  ) {
    return {
      snapshot: pbpSnapshot,
      sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V2,
      checkpointId: "w2-tue-1000-et",
      scheduledFor: "2026-09-22T14:00:00Z",
      identityReceipt: identityReceipt(),
      criticalFieldPolicyRef: CCF_NFLVERSE_PBP_CRITICAL_FIELD_POLICY_REF_V2,
      correctionPolicyRef: CCF_NFLVERSE_PBP_CORRECTION_POLICY_REF_V1,
      checkpointPolicyRef: CCF_NFLVERSE_PBP_CHECKPOINT_POLICY_REF_V1,
      ...overrides,
    };
  }

  it("builds a clean play-type-aware observation from immutable PBP evidence", async () => {
    const pbpSnapshot = await snapshot(cleanCsv());
    const observation = buildCCFNflversePlayByPlayReliabilityObservation(
      observationInput(pbpSnapshot),
    );

    expect(observation).toMatchObject({
      sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V2,
      parserVersion: "ccf-nflverse-play-by-play-candidate-v2",
      rowCount: 2,
      identityEligibleCount: 3,
      identityResolvedCount: 3,
      criticalFieldMissingCount: 0,
      duplicateKeyCount: 0,
      correctionStatus: "none",
    });
    expect(observation.criticalFieldEligibleCount).toBeGreaterThan(0);
    expect(observation.evidenceRefs).toContain(pbpSnapshot.archive.manifest.archiveRef);
  });

  it("measures a missing pass binary value instead of silently accepting false", async () => {
    const csv = [HEADER, passRow({ pass_attempt: "" }), runRow()].join("\n");
    const pbpSnapshot = await snapshot(csv);
    const observation = buildCCFNflversePlayByPlayReliabilityObservation(
      observationInput(pbpSnapshot),
    );

    expect(pbpSnapshot.rows[0].missingBinaryFields).toContain("pass_attempt");
    expect(observation.criticalFieldMissingCount).toBeGreaterThan(0);
  });

  it("does not classify a throwaway as missing receiver attribution", async () => {
    const throwaway = passRow({
      receiver_player_id: "",
      complete_pass: 0,
      air_yards: "",
      yards_after_catch: "",
      yards_gained: 0,
    });
    const pbpSnapshot = await snapshot([HEADER, throwaway, runRow()].join("\n"));
    const observation = buildCCFNflversePlayByPlayReliabilityObservation(
      observationInput(pbpSnapshot),
    );

    expect(observation.criticalFieldMissingCount).toBe(0);
  });

  it("counts duplicate game/play keys", async () => {
    const csv = [HEADER, passRow(), passRow(), runRow()].join("\n");
    const pbpSnapshot = await snapshot(csv);
    const observation = buildCCFNflversePlayByPlayReliabilityObservation(
      observationInput(pbpSnapshot),
    );

    expect(observation.duplicateKeyCount).toBe(1);
  });

  it("rejects future canonical identity evidence", async () => {
    const pbpSnapshot = await snapshot(cleanCsv());
    const future = identityReceipt("2026-09-23T18:00:00Z");
    future.identityRegistryKnownAt = "2026-09-23T17:45:00Z";
    future.rows = future.rows.map((row) => ({ ...row, knownAt: "2026-09-23T17:45:00Z" }));

    expect(() =>
      buildCCFNflversePlayByPlayReliabilityObservation(
        observationInput(pbpSnapshot, { identityReceipt: future }),
      ),
    ).toThrow(/identity evidence is ineligible/);
  });

  it("requires the checkpoint week to match the archived week", async () => {
    const pbpSnapshot = await snapshot(cleanCsv());
    expect(() =>
      buildCCFNflversePlayByPlayReliabilityObservation(
        observationInput(pbpSnapshot, {
          checkpointId: "w3-tue-1000-et",
          scheduledFor: "2026-09-29T14:00:00Z",
        }),
      ),
    ).toThrow(/requires week 3 evidence/);
  });

  it("marks provider revisions reconciled only with archived before/after witnesses", async () => {
    const previous = await snapshot(cleanCsv(), "2026-09-22T14:05:00Z");
    const currentCsv = [HEADER, passRow({ touchdown: 1 }), runRow()].join("\n");
    const current = await snapshot(currentCsv, "2026-09-23T14:05:00Z");
    const observation = buildCCFNflversePlayByPlayReliabilityObservation(
      observationInput(current, {
        checkpointId: "w2-wed-1000-et",
        scheduledFor: "2026-09-23T14:00:00Z",
        previousSnapshot: previous,
      }),
    );

    expect(observation.correctionStatus).toBe("reconciled");
    expect(observation.evidenceRefs).toContain(previous.archive.manifest.archiveRef);
    expect(observation.notes).toContain(
      "provider_snapshot_changed_with_archived_before_after_witnesses",
    );
  });
});
