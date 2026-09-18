import fs from "fs/promises";
import os from "os";
import path from "path";
import { deriveCCFGameOpportunityLedger } from "../../features/playByPlayOpportunity";
import { fetchAndArchiveNflversePlayByPlay } from "../archivedNflversePlayByPlay";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_PBP_SOURCE_ID_V3,
} from "../nflversePlayByPlayCertificationPolicy";
import {
  buildCCFNflverseCanonicalOpportunityInput,
} from "../nflverseCanonicalOpportunityAdapter";
import type { CCFSourceState } from "../sourceState";

const HEADER = [
  "play_id","game_id","season","season_type","week","play_type","posteam","play",
  "passer_player_id","rusher_player_id","receiver_player_id","pass_attempt","rush_attempt",
  "qb_dropback","qb_scramble","qb_kneel","qb_spike","sack","complete_pass",
  "two_point_attempt","touchdown","air_yards","yards_after_catch","yards_gained",
  "down","goal_to_go","yardline_100","half_seconds_remaining","game_seconds_remaining",
  "score_differential",
].join(",");

function row(values: Record<string, string | number | null>): string {
  const defaults: Record<string, string | number> = {
    play: 1, pass_attempt: 0, rush_attempt: 0, qb_dropback: 0, qb_scramble: 0,
    qb_kneel: 0, qb_spike: 0, sack: 0, complete_pass: 0, two_point_attempt: 0,
    touchdown: 0, goal_to_go: 0, half_seconds_remaining: 600,
    game_seconds_remaining: 2400, score_differential: 0,
  };
  return HEADER.split(",").map((column) => {
    const value = Object.prototype.hasOwnProperty.call(values, column)
      ? values[column]
      : defaults[column];
    return value == null ? "" : String(value);
  }).join(",");
}

function csv(): string {
  return [
    HEADER,
    row({
      play_id: 10, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG",
      week: 2, play_type: "pass", posteam: "DAL", passer_player_id: "00-0000001",
      receiver_player_id: "00-0000002", pass_attempt: 1, qb_dropback: 1,
      complete_pass: 1, air_yards: 12, yards_after_catch: 4, yards_gained: 16,
      down: 1, yardline_100: 18, half_seconds_remaining: 90, score_differential: -3,
    }),
    row({
      play_id: 20, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG",
      week: 2, play_type: "run", posteam: "DAL", rusher_player_id: "00-0000003",
      rush_attempt: 1, yards_gained: 5, down: 1, yardline_100: 40,
      half_seconds_remaining: 500, score_differential: 7,
    }),
    row({
      play_id: 30, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG",
      week: 2, play_type: "run", posteam: "DAL", rusher_player_id: "00-0000001",
      rush_attempt: 1, qb_dropback: 1, qb_scramble: 1, yards_gained: 8,
      down: 2, yardline_100: 25, half_seconds_remaining: 100, score_differential: 0,
    }),
    row({
      play_id: 40, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG",
      week: 2, play_type: "run", posteam: "DAL", rusher_player_id: "00-0000001",
      rush_attempt: 1, yards_gained: 3, down: 3, yardline_100: 4,
      half_seconds_remaining: 300, score_differential: 0,
    }),
    row({
      play_id: 50, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG",
      week: 2, play_type: "qb_kneel", posteam: "DAL", rusher_player_id: "00-0000001",
      rush_attempt: 1, qb_kneel: 1, yards_gained: -1, down: 1, yardline_100: 70,
      half_seconds_remaining: 20, score_differential: 7,
    }),
    row({
      play_id: 60, game_id: "2026_02_DAL_NYG", season: 2026, season_type: "REG",
      week: 2, play_type: "pass", posteam: "DAL", passer_player_id: "00-0000001",
      receiver_player_id: "00-0000002", pass_attempt: 1, qb_dropback: 1,
      complete_pass: 1, two_point_attempt: 1, yards_gained: 2,
      yardline_100: 2, half_seconds_remaining: 200, score_differential: 6,
    }),
  ].join("\n");
}

function identityReceipt(): CCFNFLPlayerIdentityLinkageReceipt {
  const ids = [
    ["00-0000001", "ccf-qb-1"],
    ["00-0000002", "ccf-wr-1"],
    ["00-0000003", "ccf-rb-1"],
  ] as const;
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "canonical-opportunity-test-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-canonical-opportunity-registry",
    identityRegistryKnownAt: "2026-09-22T13:50:00Z",
    frozenAt: "2026-09-22T14:00:00Z",
    rows: ids.map(([sourcePlayerId, canonicalPlayerId]) => ({
      sourcePlayerId,
      status: "resolved_exact" as const,
      canonicalPlayerId,
      bindingMethod: "exact_external_id" as const,
      knownAt: "2026-09-22T13:50:00Z",
      evidenceRefs: [`ccf://registry/${sourcePlayerId}`],
    })),
    notes: ["synthetic canonical opportunity identity receipt"],
  };
}

function sourceState(): CCFSourceState {
  return {
    sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V3,
    evidenceClass: "source_backed",
    governanceState: "promoted",
    knownAt: "2026-09-22T14:20:00Z",
    supportWindow: { validFrom: "2026-09-22T14:20:00Z", validThrough: null },
    producer: "nflverse",
    qualification: {
      qualificationVersion: "ccf-source-qualification-v1",
      qualificationId: "fixture-pbp-v3-promoted",
      reviewedAt: "2026-09-22T14:15:00Z",
      termsOrLicenseRef: "fixture://terms/pbp-v3",
      permissionStatus: "permitted_for_intended_use",
      parserVersion: "ccf-nflverse-play-by-play-candidate-v3",
      rawTraceSupported: true,
      pointInTimeSemanticsDocumented: true,
      reliabilityReviewRef: "fixture://reliability/pbp-v3",
      reliabilityStatus: "passed",
      notes: ["fixture-only promoted source for adapter behavior"],
    },
  };
}

describe("nflverse PBP v3 canonical opportunity adapter", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-pbp-canonical-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function snapshot(raw = csv()) {
    const fetchImpl = jest.fn(async () => new Response(raw, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflversePlayByPlay({
      season: 2026,
      week: 2,
      archiveRootDir,
      fetchImpl,
      now: () => new Date("2026-09-22T14:05:00Z"),
    });
  }

  function base(snapshotValue: Awaited<ReturnType<typeof snapshot>>) {
    return {
      snapshot: snapshotValue,
      gameId: "2026_02_DAL_NYG",
      asOf: "2026-09-22T15:00:00Z",
      sourceState: sourceState(),
      identityReceipt: identityReceipt(),
      quarterbackSourcePlayerIds: ["00-0000001"],
      quarterbackEvidenceRef: "ccf://position-evidence/2026-week-2/qb",
      quarterbackEvidenceKnownAt: "2026-09-22T14:08:00Z",
      completeGameEvidence: true as const,
      completeGameEvidenceRef: "ccf://game-completion/2026_02_DAL_NYG",
      completeGameEvidenceKnownAt: "2026-09-22T14:10:00Z",
    };
  }

  it("maps exact canonical identities and derives role/situational opportunity without kneel or 2PC volume", async () => {
    const pbp = await snapshot();
    const result = buildCCFNflverseCanonicalOpportunityInput(base(pbp));

    expect(result.receipt).toMatchObject({
      sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V3,
      gameId: "2026_02_DAL_NYG",
      rawRowCount: 6,
      mappedPlayCount: 6,
      parserVersion: "ccf-nflverse-play-by-play-candidate-v3",
    });
    expect(result.receipt.receiptId).toMatch(
      /^ccf:\/\/nflverse-pbp-canonical\/sha256\/[a-f0-9]{64}$/,
    );

    const designed = result.input.plays.find((play) => play.eventId.endsWith(":40"))!;
    const scramble = result.input.plays.find((play) => play.eventId.endsWith(":30"))!;
    const kneel = result.input.plays.find((play) => play.eventId.endsWith(":50"))!;
    const twoPoint = result.input.plays.find((play) => play.eventId.endsWith(":60"))!;
    expect(designed).toMatchObject({
      rusherId: "ccf-qb-1",
      rushAttempt: true,
      designedQbRush: true,
      scramble: false,
      twoMinute: false,
      offenseScoreDifferential: 0,
    });
    expect(scramble).toMatchObject({
      rusherId: "ccf-qb-1",
      designedQbRush: false,
      scramble: true,
      twoMinute: true,
    });
    expect(kneel.countsAsOffensivePlay).toBe(false);
    expect(twoPoint.countsAsOffensivePlay).toBe(false);

    const ledger = deriveCCFGameOpportunityLedger(result.input);
    expect(ledger.teams[0]).toMatchObject({
      team: "DAL",
      offensivePlays: 4,
      dropbacks: 2,
      rushAttempts: 3,
      targets: 1,
    });
    expect(ledger.players.find((player) => player.playerId === "ccf-qb-1")).toMatchObject({
      carries: 2,
      designedQbRushes: 1,
      scrambles: 1,
      twoMinuteCarries: 1,
    });
    expect(ledger.players.find((player) => player.playerId === "ccf-wr-1")).toMatchObject({
      targets: 1,
      receptions: 1,
      twoMinuteTargets: 1,
      opportunitiesWhileTrailing: 1,
    });
    expect(ledger.players.find((player) => player.playerId === "ccf-rb-1")).toMatchObject({
      carries: 1,
      opportunitiesWhileLeading: 1,
    });
  });

  it("fails closed when canonical game context is absent", async () => {
    const broken = csv().replace(",90,2400,-3", ",,2400,");
    const pbp = await snapshot(broken);

    expect(() =>
      buildCCFNflverseCanonicalOpportunityInput(base(pbp)),
    ).toThrow(/missing canonical game context/);
  });

  it("fails closed when a referenced player is not canonically resolved", async () => {
    const pbp = await snapshot();
    const input = base(pbp);
    input.identityReceipt.rows = input.identityReceipt.rows.map((row) =>
      row.sourcePlayerId === "00-0000002"
        ? { ...row, status: "unresolved" as const, canonicalPlayerId: null, bindingMethod: null }
        : row,
    );

    expect(() =>
      buildCCFNflverseCanonicalOpportunityInput(input),
    ).toThrow(/identity subset is not resolved/);
  });

  it("rejects future QB classification evidence instead of backdating designed-rush knowledge", async () => {
    const pbp = await snapshot();
    const input = {
      ...base(pbp),
      quarterbackEvidenceKnownAt: "2026-09-22T15:00:01Z",
    };

    expect(() =>
      buildCCFNflverseCanonicalOpportunityInput(input),
    ).toThrow(/quarterbackEvidenceKnownAt cannot be later than asOf/);
  });

  it("rejects a source qualification bound to a different parser", async () => {
    const pbp = await snapshot();
    const state = sourceState();
    state.qualification = {
      ...state.qualification!,
      parserVersion: "ccf-nflverse-play-by-play-candidate-v2",
    };

    expect(() =>
      buildCCFNflverseCanonicalOpportunityInput({
        ...base(pbp),
        sourceState: state,
      }),
    ).toThrow(/source qualification parser must match/);
  });
});
