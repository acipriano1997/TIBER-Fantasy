import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseInjuries } from "../archivedNflverseInjuries";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_INJURY_CHECKPOINTS_2026_V1,
  CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2,
  CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2,
  buildCCFNflverseInjuryReliabilityPolicy,
  fingerprintCCFNflverseInjuryReliabilityPolicy,
} from "../nflverseInjuryCertificationPolicy";
import { buildCCFNflverseInjuryReliabilityObservation } from "../nflverseInjuryReliability";

const HEADER =
  "season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified";
const WEEK2_CSV = [
  HEADER,
  "2026,REG,DAL,2,00-0000001,WR,Receiver One,Receiver,One,Hamstring,,Questionable,Hamstring,,Limited Participation,2026-09-16 12:00:00",
].join("\n");
const WEEK3_CSV = WEEK2_CSV.replace(",2,00-", ",3,00-");

function identityReceipt(
  frozenAt = "2026-09-16T14:30:00Z",
  registryKnownAt = "2026-09-16T14:00:00Z",
): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "injury-hardening-test-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-injury-hardening-registry",
    identityRegistryKnownAt: registryKnownAt,
    frozenAt,
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: registryKnownAt,
        evidenceRefs: ["ccf://registry/00-0000001"],
      },
    ],
    notes: ["synthetic injury hardening receipt"],
  };
}

const COMMON = {
  capability: "injury_designation" as const,
  sourceId: "nflverse-injuries-designation-v2",
  criticalFieldPolicyRef: "ccf://policy/injury-designation-fields-v1",
  correctionPolicyRef: "ccf://policy/nflverse-injury-corrections-v1",
  checkpointPolicyRef: "ccf://policy/nflverse-injury-checkpoints-v1",
};

describe("nflverse injury reliability provenance hardening", () => {
  let archiveRootDir: string;

  beforeEach(async () => {
    archiveRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ccf-injury-hardening-"));
  });

  afterEach(async () => {
    await fs.rm(archiveRootDir, { recursive: true, force: true });
  });

  async function archived(csv: string, week: number, capturedAt: string) {
    const fetchImpl = jest.fn(async () => new Response(csv, { status: 200 })) as unknown as typeof fetch;
    return fetchAndArchiveNflverseInjuries({
      season: 2026,
      week,
      archiveRootDir,
      fetchImpl,
      now: () => new Date(capturedAt),
    });
  }

  it("pins reliability observations to the injuries v2 parser", async () => {
    const snapshot = await archived(WEEK2_CSV, 2, "2026-09-17T16:01:00Z");
    snapshot.archive.manifest.parserVersion = "ccf-nflverse-injuries-candidate-v1";

    expect(() =>
      buildCCFNflverseInjuryReliabilityObservation({
        ...COMMON,
        snapshot,
        checkpointId: "week-2-thu",
        scheduledFor: "2026-09-17T16:00:00Z",
        identityReceipt: identityReceipt(),
      }),
    ).toThrow(/requires parser ccf-nflverse-injuries-candidate-v2/);
  });

  it("rejects week-3 archive evidence for a week-2 checkpoint", async () => {
    const snapshot = await archived(WEEK3_CSV, 3, "2026-09-24T16:01:00Z");

    expect(() =>
      buildCCFNflverseInjuryReliabilityObservation({
        ...COMMON,
        snapshot,
        checkpointId: "week-2-thu",
        scheduledFor: "2026-09-24T16:00:00Z",
        identityReceipt: identityReceipt(),
      }),
    ).toThrow(/requires week 2 evidence/);
  });

  it("rejects a correction witness captured after the current snapshot", async () => {
    const current = await archived(WEEK2_CSV, 2, "2026-09-17T16:01:00Z");
    const later = await archived(
      WEEK2_CSV.replace("Questionable", "Doubtful"),
      2,
      "2026-09-18T16:01:00Z",
    );

    expect(() =>
      buildCCFNflverseInjuryReliabilityObservation({
        ...COMMON,
        snapshot: current,
        previousSnapshot: later,
        checkpointId: "week-2-thu",
        scheduledFor: "2026-09-17T16:00:00Z",
        identityReceipt: identityReceipt(),
      }),
    ).toThrow(/previous injury snapshot cannot be captured after the current snapshot/);
  });
});

describe("nflverse injury/practice prospective reliability policies", () => {
  it("builds separate designation and practice policies over the same prospective window", () => {
    const receipt = identityReceipt("2026-09-17T14:00:00Z", "2026-09-17T13:30:00Z");
    const designation = buildCCFNflverseInjuryReliabilityPolicy({
      capability: "injury_designation",
      identityReceipt: receipt,
      frozenAt: "2026-09-17T14:30:00Z",
    });
    const practice = buildCCFNflverseInjuryReliabilityPolicy({
      capability: "practice_participation",
      identityReceipt: receipt,
      frozenAt: "2026-09-17T14:30:00Z",
    });

    expect(designation).toMatchObject({
      sourceId: CCF_NFLVERSE_INJURY_DESIGNATION_SOURCE_ID_V2,
      producer: "nflverse",
      intendedUse: "ffcc_native_weekly_recommendation",
      parserVersion: "ccf-nflverse-injuries-candidate-v2",
      criticalFieldPolicyRef: "ccf://policy/injury-designation-fields-v1",
      minimumSuccessfulCaptures: 5,
      minimumCaptureSuccessRate: 1,
      minimumSchemaValidRate: 1,
      minimumIdentityResolutionRate: 1,
      maximumCriticalMissingRate: 0,
      maximumDuplicateKeyRate: 0,
      minimumOnTimeCaptureRate: 0.8,
      maximumUnreconciledCorrections: 0,
    });
    expect(practice).toMatchObject({
      sourceId: CCF_NFLVERSE_PRACTICE_PARTICIPATION_SOURCE_ID_V2,
      criticalFieldPolicyRef: "ccf://policy/practice-participation-fields-v1",
    });
    expect(designation.checkpoints).toEqual(CCF_NFLVERSE_INJURY_CHECKPOINTS_2026_V1);
    expect(practice.checkpoints).toEqual(CCF_NFLVERSE_INJURY_CHECKPOINTS_2026_V1);
    expect(designation.checkpoints[0]).toEqual({
      checkpointId: "w2-thu-1600-et",
      scheduledFor: "2026-09-17T20:00:00Z",
    });
    expect(designation.identityBindingRef).toMatch(
      /^ccf:\/\/nfl-player-identity\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("requires the real identity receipt to predate the frozen policy", () => {
    expect(() =>
      buildCCFNflverseInjuryReliabilityPolicy({
        capability: "injury_designation",
        identityReceipt: identityReceipt("2026-09-17T15:00:00Z", "2026-09-17T14:45:00Z"),
        frozenAt: "2026-09-17T14:30:00Z",
      }),
    ).toThrow(/identity receipt must be frozen no later/);
  });

  it("rejects a policy frozen after the first prospective checkpoint", () => {
    expect(() =>
      buildCCFNflverseInjuryReliabilityPolicy({
        capability: "practice_participation",
        identityReceipt: identityReceipt("2026-09-17T14:00:00Z", "2026-09-17T13:30:00Z"),
        frozenAt: "2026-09-17T20:00:01Z",
      }),
    ).toThrow(/must be frozen before the first observation checkpoint/);
  });

  it("fingerprints identical frozen capability inputs deterministically", () => {
    const input = {
      capability: "injury_designation" as const,
      identityReceipt: identityReceipt("2026-09-17T14:00:00Z", "2026-09-17T13:30:00Z"),
      frozenAt: "2026-09-17T14:30:00Z",
    };
    expect(fingerprintCCFNflverseInjuryReliabilityPolicy(input)).toBe(
      fingerprintCCFNflverseInjuryReliabilityPolicy(input),
    );
  });
});
