import fs from "fs/promises";
import os from "os";
import path from "path";
import { fetchAndArchiveNflverseInjuries } from "../archivedNflverseInjuries";
import type { CCFNFLPlayerIdentityLinkageReceipt } from "../nflPlayerIdentityLinkage";
import { buildCCFNflverseInjuryReliabilityObservation } from "../nflverseInjuryReliability";

const HEADER =
  "season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified";
const WEEK2_CSV = [
  HEADER,
  "2026,REG,DAL,2,00-0000001,WR,Receiver One,Receiver,One,Hamstring,,Questionable,Hamstring,,Limited Participation,2026-09-16 12:00:00",
].join("\n");
const WEEK3_CSV = WEEK2_CSV.replace(",2,00-", ",3,00-");

function identityReceipt(): CCFNFLPlayerIdentityLinkageReceipt {
  return {
    contractVersion: "ccf-nfl-player-identity-linkage-v1",
    receiptId: "injury-hardening-test-v1",
    sourceSystem: "nflverse",
    sourceNamespace: "gsis_id",
    identityRegistryFingerprint: "fixture-injury-hardening-registry",
    identityRegistryKnownAt: "2026-09-16T14:00:00Z",
    frozenAt: "2026-09-16T14:30:00Z",
    rows: [
      {
        sourcePlayerId: "00-0000001",
        status: "resolved_exact",
        canonicalPlayerId: "ccf-player-1",
        bindingMethod: "exact_external_id",
        knownAt: "2026-09-16T14:00:00Z",
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
