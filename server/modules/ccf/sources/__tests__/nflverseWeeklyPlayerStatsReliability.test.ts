import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseWeeklyPlayerStats } from "../archivedNflverseWeeklyPlayerStats";
import {
  refCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "../nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINT_POLICY_REF_V1,
  CCF_NFLVERSE_WEEKLY_STATS_CORRECTION_POLICY_REF_V1,
  CCF_NFLVERSE_WEEKLY_STATS_CRITICAL_FIELD_POLICY_REF_V2,
  CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
} from "../nflverseWeeklyPlayerStatsCertificationPolicy";
import { buildCCFNflverseWeeklyPlayerStatsReliabilityObservation } from "../nflverseWeeklyPlayerStatsReliability";

const HEADER = [
  "player_id",
  "player_display_name",
  "position",
  "season",
  "week",
  "season_type",
  "team",
  "opponent_team",
  "completions",
  "attempts",
  "passing_yards",
  "passing_tds",
  "passing_interceptions",
  "sacks_suffered",
  "passing_2pt_conversions",
  "carries",
  "rushing_yards",
  "rushing_tds",
  "rushing_2pt_conversions",
  "receptions",
  "targets",
  "receiving_yards",
  "receiving_tds",
  "receiving_2pt_conversions",
  "fumbles_lost_total",
  "special_teams_tds",
].join(",");

const BASE_ROWS = [
  "00-0000001,Receiver One,WR,2026,2,REG,DAL,NYG,0,0,0,0,0,0,0,1,4,0,0,7,10,91,1,0,0,0",
  "00-0000002,Runner Two,RB,2026,2,REG,NYG,DAL,0,0,0,0,0,0,0,18,84,1,0,2,3,16,0,0,1,0",
];

function csv(rows: string[] = BASE_ROWS): string {
  return [HEADER, ...rows].join("\n");
}

function identityReceipt(
  allResolved = false,
  overrides: Partial<CCFNFLPlayerIdentityLinkageReceipt> = {},
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "weekly-stats-gsis-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-registry-sha256",
    identityRegistryKnownAt: "2026-09-16T15:30:00Z",
    frozenAt: "2026-09-16T16:00:00Z",
    rows: ["00-0000001", "00-0000002"].map((sourcePlayerId, index) => {
      const resolved = allResolved || index === 0;
      return {
        sourcePlayerId,
        status: resolved ? ("resolved_exact" as const) : ("unresolved" as const),
        canonicalPlayerId: resolved ? `ccf-player-${index + 1}` : null,
        bindingMethod: resolved ? ("exact_external_id" as const) : null,
        knownAt: "2026-09-16T15:30:00Z",
        evidenceRefs: [`ccf://registry/${sourcePlayerId}`],
      };
    }),
    notes: ["synthetic test receipt"],
    ...overrides,
  };
}

describe("nflverse archived weekly player-stats reliability observations", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-weekly-stats-reliability-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function archived(
    content: string,
    capturedAt: string,
    positions?: Array<"QB" | "RB" | "WR" | "TE">,
  ) {
    const fetchImpl = jest.fn(async () => new Response(content, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflverseWeeklyPlayerStats({
      season: 2026,
      week: 2,
      positions,
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  function observe(
    snapshot: Awaited<ReturnType<typeof archived>>,
    receipt: CCFNFLPlayerIdentityLinkageReceipt,
    previousSnapshot?: Awaited<ReturnType<typeof archived>>,
  ) {
    return buildCCFNflverseWeeklyPlayerStatsReliabilityObservation({
      snapshot,
      previousSnapshot,
      sourceId: CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
      checkpointId: "fixture-checkpoint",
      scheduledFor: "2026-09-16T17:00:00Z",
      identityReceipt: receipt,
      criticalFieldPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CRITICAL_FIELD_POLICY_REF_V2,
      correctionPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CORRECTION_POLICY_REF_V1,
      checkpointPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINT_POLICY_REF_V1,
    });
  }

  it("derives scoring quality and governed identity coverage from the archived capture", async () => {
    const snapshot = await archived(csv(), "2026-09-16T17:01:00Z");
    const receipt = identityReceipt(false);
    const observation = observe(snapshot, receipt);

    expect(observation).toMatchObject({
      sourceId: CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
      producer: "nflverse",
      captureStatus: "success",
      schemaStatus: "valid",
      rowCount: 2,
      identityEligibleCount: 2,
      identityResolvedCount: 1,
      criticalFieldEligibleCount: 2,
      criticalFieldMissingCount: 0,
      duplicateKeyCount: 0,
      correctionStatus: "none",
      parserVersion: "ccf-nflverse-player-stats-v2",
      archiveRef: snapshot.archive.manifest.archiveRef,
      contentSha256: snapshot.archive.manifest.contentSha256,
    });
    expect(observation.notes).toContain("identity_unresolved:1");
    expect(observation.evidenceRefs).toEqual(expect.arrayContaining([
      snapshot.archive.manifest.archiveRef,
      refCCFNFLPlayerIdentityLinkageReceipt(receipt),
      CCF_NFLVERSE_WEEKLY_STATS_CRITICAL_FIELD_POLICY_REF_V2,
      CCF_NFLVERSE_WEEKLY_STATS_CORRECTION_POLICY_REF_V1,
      CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINT_POLICY_REF_V1,
    ]));
  });

  it("measures critical context corruption instead of silently accepting it", async () => {
    const snapshot = await archived(csv(), "2026-09-16T17:01:00Z");
    snapshot.rows[0] = { ...snapshot.rows[0], opponentTeam: null };

    const observation = observe(snapshot, identityReceipt(true));
    expect(observation.criticalFieldEligibleCount).toBe(2);
    expect(observation.criticalFieldMissingCount).toBe(1);
  });

  it("counts duplicate provider player-week keys without double-counting identity eligibility", async () => {
    const snapshot = await archived(
      csv([...BASE_ROWS, BASE_ROWS[0]]),
      "2026-09-16T17:01:00Z",
    );
    const observation = observe(snapshot, identityReceipt(true));

    expect(observation.rowCount).toBe(3);
    expect(observation.duplicateKeyCount).toBe(1);
    expect(observation.identityEligibleCount).toBe(2);
    expect(observation.identityResolvedCount).toBe(2);
  });

  it("marks changed provider bytes reconciled only with archived before/after witnesses", async () => {
    const before = await archived(csv(), "2026-09-16T17:01:00Z");
    const changed = [...BASE_ROWS];
    changed[0] = changed[0].replace(",91,1,", ",97,1,");
    const after = await archived(csv(changed), "2026-09-16T18:01:00Z");
    const observation = buildCCFNflverseWeeklyPlayerStatsReliabilityObservation({
      snapshot: after,
      previousSnapshot: before,
      sourceId: CCF_NFLVERSE_WEEKLY_STATS_SOURCE_ID_V2,
      checkpointId: "fixture-checkpoint-later",
      scheduledFor: "2026-09-16T18:00:00Z",
      identityReceipt: identityReceipt(true),
      criticalFieldPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CRITICAL_FIELD_POLICY_REF_V2,
      correctionPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CORRECTION_POLICY_REF_V1,
      checkpointPolicyRef: CCF_NFLVERSE_WEEKLY_STATS_CHECKPOINT_POLICY_REF_V1,
    });

    expect(observation.correctionStatus).toBe("reconciled");
    expect(observation.evidenceRefs).toEqual(expect.arrayContaining([
      before.archive.manifest.archiveRef,
      after.archive.manifest.archiveRef,
    ]));
  });

  it("rejects future identity evidence instead of backdating resolution", async () => {
    const snapshot = await archived(csv(), "2026-09-16T17:01:00Z");
    const futureReceipt = identityReceipt(true, {
      identityRegistryKnownAt: "2026-09-17T15:30:00Z",
      frozenAt: "2026-09-17T16:00:00Z",
      rows: identityReceipt(true).rows.map((row) => ({
        ...row,
        knownAt: "2026-09-17T15:30:00Z",
      })),
    });

    expect(() => observe(snapshot, futureReceipt)).toThrow(
      /identity evidence is ineligible/,
    );
  });

  it("rejects cherry-picked position scopes for source qualification", async () => {
    const snapshot = await archived(csv(), "2026-09-16T17:01:00Z", ["WR"]);

    expect(() => observe(snapshot, identityReceipt(true))).toThrow(
      /complete QB\/RB\/WR\/TE position scope/,
    );
  });
});
