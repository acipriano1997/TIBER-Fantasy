import crypto from "crypto";
import type {
  CCFCanonicalOpportunityPlay,
  CCFDown,
  CCFGameOpportunityInput,
} from "../features/playByPlayOpportunity";
import type { CCFArchivedNflversePlayByPlaySnapshot } from "./archivedNflversePlayByPlay";
import {
  assertCCFNFLPlayerIdentitySubsetResolved,
  refCCFNFLPlayerIdentityLinkageReceipt,
  type CCFNFLPlayerIdentityLinkageReceipt,
} from "./nflPlayerIdentityLinkage";
import {
  CCF_NFLVERSE_PBP_SOURCE_ID_V3,
} from "./nflversePlayByPlayCertificationPolicy";
import type {
  CCFNflversePlayByPlayRow,
  CCFNflversePbpBinaryField,
} from "./nflversePlayByPlay";
import {
  assertCCFSourceStateEligible,
  fingerprintCCFSourceQualification,
  type CCFSourceState,
} from "./sourceState";

const REQUIRED_PARSER_VERSION = "ccf-nflverse-play-by-play-candidate-v3";

export interface BuildCCFNflverseCanonicalOpportunityInput {
  snapshot: CCFArchivedNflversePlayByPlaySnapshot;
  gameId: string;
  asOf: string;
  sourceState: CCFSourceState;
  identityReceipt: CCFNFLPlayerIdentityLinkageReceipt;
  quarterbackSourcePlayerIds: string[];
  quarterbackEvidenceRef: string;
  quarterbackEvidenceKnownAt: string;
  completeGameEvidence: true;
  completeGameEvidenceRef: string;
  completeGameEvidenceKnownAt: string;
}

export interface CCFNflverseCanonicalOpportunityAdapterReceipt {
  contractVersion: "ccf-nflverse-canonical-opportunity-adapter-receipt-v1";
  receiptId: string;
  sourceId: typeof CCF_NFLVERSE_PBP_SOURCE_ID_V3;
  gameId: string;
  season: number;
  week: number;
  asOf: string;
  knownAt: string;
  parserVersion: typeof REQUIRED_PARSER_VERSION;
  archiveRef: string;
  identityBindingRef: string;
  sourceQualificationRef: string;
  quarterbackEvidenceRef: string;
  completeGameEvidenceRef: string;
  quarterbackSourcePlayerIds: string[];
  rawRowCount: number;
  mappedPlayCount: number;
  evidenceRefs: string[];
}

export interface CCFNflverseCanonicalOpportunityAdapterResult {
  receipt: CCFNflverseCanonicalOpportunityAdapterReceipt;
  input: CCFGameOpportunityInput;
}

export class CCFNflverseCanonicalOpportunityAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseCanonicalOpportunityAdapterError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `${label} must be a valid timestamp`,
    );
  }
  return parsed;
}

function requireText(label: string, value: string): string {
  if (!hasText(value)) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(`${label} is required`);
  }
  return value;
}

function canonicalDown(value: number | null): CCFDown | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `down must be an integer within [1, 4] when present: ${value}`,
    );
  }
  return value as CCFDown;
}

function canonicalYardline(value: number | null): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `yardline100 must be within [0, 100] when present: ${value}`,
    );
  }
  return value;
}

function relevantBinaryFields(row: CCFNflversePlayByPlayRow): CCFNflversePbpBinaryField[] {
  const common: CCFNflversePbpBinaryField[] = [
    "play",
    "two_point_attempt",
    "qb_kneel",
    "qb_spike",
  ];
  if (row.playType === "pass") {
    return common.concat([
      "pass_attempt",
      "qb_dropback",
      "qb_scramble",
      "sack",
      "complete_pass",
    ]);
  }
  if (row.playType === "run") {
    return common.concat(["rush_attempt", "qb_scramble"]);
  }
  if (row.playType === "qb_kneel") return common.concat(["rush_attempt"]);
  if (row.playType === "qb_spike") return common.concat(["pass_attempt", "qb_dropback"]);
  return ["play"];
}

function assertRowSemantics(row: CCFNflversePlayByPlayRow): void {
  const missing = new Set(row.missingBinaryFields);
  const required = relevantBinaryFields(row);
  const missingRequired = required.filter((field) => missing.has(field));
  if (missingRequired.length > 0) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `play ${row.gameId}/${row.playId} is missing required binary evidence: ${missingRequired.join(", ")}`,
    );
  }

  const opportunityType =
    row.playType === "pass" ||
    row.playType === "run" ||
    row.playType === "qb_kneel" ||
    row.playType === "qb_spike";
  if (opportunityType && !row.normalPlay && !row.twoPointAttempt) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `play ${row.gameId}/${row.playId} has opportunity play_type without normal-play evidence`,
    );
  }
}

function canonicalReceiptPayload(
  receipt: Omit<CCFNflverseCanonicalOpportunityAdapterReceipt, "receiptId">,
): string {
  return JSON.stringify({
    ...receipt,
    quarterbackSourcePlayerIds: [...receipt.quarterbackSourcePlayerIds].sort(),
    evidenceRefs: [...receipt.evidenceRefs].sort(),
  });
}

function resolvedIdentityMap(
  receipt: CCFNFLPlayerIdentityLinkageReceipt,
  sourceIds: readonly string[],
): Map<string, string> {
  const sourceSet = new Set(sourceIds);
  const result = new Map<string, string>();
  for (const row of receipt.rows) {
    if (
      sourceSet.has(row.sourcePlayerId) &&
      row.status === "resolved_exact" &&
      hasText(row.canonicalPlayerId)
    ) {
      result.set(row.sourcePlayerId, row.canonicalPlayerId);
    }
  }
  for (const sourceId of sourceIds) {
    if (!result.has(sourceId)) {
      throw new CCFNflverseCanonicalOpportunityAdapterError(
        `resolved canonical identity missing for source player ${sourceId}`,
      );
    }
  }
  return result;
}

function includedSourcePlayerIds(
  rows: readonly CCFNflversePlayByPlayRow[],
  quarterbackSourcePlayerIds: readonly string[],
): string[] {
  const ids = new Set(quarterbackSourcePlayerIds);
  for (const row of rows) {
    const ordinaryOpportunity =
      row.normalPlay &&
      !row.twoPointAttempt &&
      !row.qbKneel &&
      !row.qbSpike &&
      (row.playType === "pass" || row.playType === "run");
    if (!ordinaryOpportunity) continue;
    if (hasText(row.rusherPlayerId)) ids.add(row.rusherPlayerId);
    if (hasText(row.receiverPlayerId)) ids.add(row.receiverPlayerId);
  }
  return Array.from(ids).sort();
}

function maxKnownAt(
  asOf: string,
  evidence: readonly [label: string, value: string][],
): string {
  const asOfMs = timestamp("asOf", asOf);
  let latestMs = Number.NEGATIVE_INFINITY;
  let latest = "";
  for (const [label, value] of evidence) {
    const parsed = timestamp(label, value);
    if (parsed > asOfMs) {
      throw new CCFNflverseCanonicalOpportunityAdapterError(
        `${label} cannot be later than asOf`,
      );
    }
    if (parsed > latestMs) {
      latestMs = parsed;
      latest = value;
    }
  }
  return latest;
}

export function buildCCFNflverseCanonicalOpportunityInput(
  options: BuildCCFNflverseCanonicalOpportunityInput,
): CCFNflverseCanonicalOpportunityAdapterResult {
  const manifest = options.snapshot.archive.manifest;
  if (
    manifest.provider !== "nflverse" ||
    manifest.dataset !== "play_by_play" ||
    manifest.parserVersion !== REQUIRED_PARSER_VERSION
  ) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `canonical opportunity adapter requires archived nflverse PBP parser ${REQUIRED_PARSER_VERSION}`,
    );
  }
  if (
    manifest.temporalMode !== "archived_point_in_time" ||
    manifest.knownAtBasis !== "ccf_capture" ||
    options.snapshot.knownAt !== manifest.knownAt ||
    options.snapshot.retrievedAt !== manifest.retrievedAt
  ) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "canonical opportunity adapter requires immutable CCF point-in-time PBP evidence",
    );
  }
  const archiveRef = requireText("archiveRef", manifest.archiveRef ?? "");

  assertCCFSourceStateEligible(options.sourceState, options.asOf);
  if (options.sourceState.sourceId !== CCF_NFLVERSE_PBP_SOURCE_ID_V3) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `sourceState.sourceId must be ${CCF_NFLVERSE_PBP_SOURCE_ID_V3}`,
    );
  }
  const qualification = options.sourceState.qualification;
  if (!qualification || qualification.parserVersion !== manifest.parserVersion) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "source qualification parser must match the archived PBP parser",
    );
  }

  requireText("gameId", options.gameId);
  requireText("quarterbackEvidenceRef", options.quarterbackEvidenceRef);
  requireText("completeGameEvidenceRef", options.completeGameEvidenceRef);
  if (options.completeGameEvidence !== true) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "canonical opportunity adapter requires explicit complete-game evidence",
    );
  }
  if (
    !Number.isInteger(options.snapshot.requestedWeek) ||
    (options.snapshot.requestedWeek ?? 0) <= 0
  ) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "canonical opportunity adapter requires a week-scoped PBP archive",
    );
  }

  const quarterbackIds = [...options.quarterbackSourcePlayerIds].sort();
  if (quarterbackIds.length === 0 || new Set(quarterbackIds).size !== quarterbackIds.length) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "quarterbackSourcePlayerIds must contain unique explicit source IDs",
    );
  }
  if (quarterbackIds.some((id) => !hasText(id))) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "quarterbackSourcePlayerIds must not contain blank IDs",
    );
  }

  const gameRows = options.snapshot.rows.filter((row) => row.gameId === options.gameId);
  if (gameRows.length === 0) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      `PBP archive contains no rows for game ${options.gameId}`,
    );
  }
  for (const row of gameRows) {
    if (
      row.season !== options.snapshot.season ||
      row.week !== options.snapshot.requestedWeek
    ) {
      throw new CCFNflverseCanonicalOpportunityAdapterError(
        "PBP game rows do not match the archived season/week",
      );
    }
    assertRowSemantics(row);
  }

  const sourcePlayerIds = includedSourcePlayerIds(gameRows, quarterbackIds);
  const identityAudit = assertCCFNFLPlayerIdentitySubsetResolved(
    options.identityReceipt,
    sourcePlayerIds,
    options.asOf,
  );
  if (!identityAudit.identityBindingRef) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "identity audit did not produce a governed binding reference",
    );
  }
  const identityMap = resolvedIdentityMap(options.identityReceipt, sourcePlayerIds);

  const qualificationFingerprint = fingerprintCCFSourceQualification(qualification);
  const qualificationRef =
    `ccf://source-qualification/sha256/${qualificationFingerprint}`;
  const knownAt = maxKnownAt(options.asOf, [
    ["snapshot.knownAt", options.snapshot.knownAt],
    ["sourceState.knownAt", options.sourceState.knownAt],
    ["identityReceipt.frozenAt", options.identityReceipt.frozenAt],
    ["quarterbackEvidenceKnownAt", options.quarterbackEvidenceKnownAt],
    ["completeGameEvidenceKnownAt", options.completeGameEvidenceKnownAt],
  ]);

  const evidenceRefs = Array.from(new Set([
    archiveRef,
    refCCFNFLPlayerIdentityLinkageReceipt(options.identityReceipt),
    qualificationRef,
    options.quarterbackEvidenceRef,
    options.completeGameEvidenceRef,
  ])).sort();

  const mappedRows = gameRows.filter((row) => hasText(row.offenseTeam));
  if (mappedRows.length === 0) {
    throw new CCFNflverseCanonicalOpportunityAdapterError(
      "PBP game contains no possession-team rows eligible for canonical mapping",
    );
  }

  const receiptPayload: Omit<CCFNflverseCanonicalOpportunityAdapterReceipt, "receiptId"> = {
    contractVersion: "ccf-nflverse-canonical-opportunity-adapter-receipt-v1",
    sourceId: CCF_NFLVERSE_PBP_SOURCE_ID_V3,
    gameId: options.gameId,
    season: options.snapshot.season,
    week: options.snapshot.requestedWeek!,
    asOf: options.asOf,
    knownAt,
    parserVersion: REQUIRED_PARSER_VERSION,
    archiveRef,
    identityBindingRef: identityAudit.identityBindingRef,
    sourceQualificationRef: qualificationRef,
    quarterbackEvidenceRef: options.quarterbackEvidenceRef,
    completeGameEvidenceRef: options.completeGameEvidenceRef,
    quarterbackSourcePlayerIds: quarterbackIds,
    rawRowCount: gameRows.length,
    mappedPlayCount: mappedRows.length,
    evidenceRefs,
  };
  const receiptHash = crypto
    .createHash("sha256")
    .update(canonicalReceiptPayload(receiptPayload))
    .digest("hex");
  const receipt: CCFNflverseCanonicalOpportunityAdapterReceipt = {
    ...receiptPayload,
    receiptId: `ccf://nflverse-pbp-canonical/sha256/${receiptHash}`,
  };

  const qbSet = new Set(quarterbackIds);
  const plays: CCFCanonicalOpportunityPlay[] = mappedRows.map((row) => {
    const ordinaryOpportunity =
      row.normalPlay &&
      !row.twoPointAttempt &&
      !row.qbKneel &&
      !row.qbSpike &&
      (row.playType === "pass" || row.playType === "run");

    if (ordinaryOpportunity) {
      if (row.halfSecondsRemaining == null || row.scoreDifferential == null) {
        throw new CCFNflverseCanonicalOpportunityAdapterError(
          `play ${row.gameId}/${row.playId} is missing canonical game context`,
        );
      }
    }

    const sourceRusherId =
      ordinaryOpportunity && row.rushAttempt && hasText(row.rusherPlayerId)
        ? row.rusherPlayerId
        : null;
    const sourceTargetId =
      ordinaryOpportunity && hasText(row.receiverPlayerId)
        ? row.receiverPlayerId
        : null;
    const rusherId = sourceRusherId ? identityMap.get(sourceRusherId) ?? null : null;
    const targetId = sourceTargetId ? identityMap.get(sourceTargetId) ?? null : null;
    if (sourceRusherId && !rusherId) {
      throw new CCFNflverseCanonicalOpportunityAdapterError(
        `canonical rusher identity missing for ${sourceRusherId}`,
      );
    }
    if (sourceTargetId && !targetId) {
      throw new CCFNflverseCanonicalOpportunityAdapterError(
        `canonical target identity missing for ${sourceTargetId}`,
      );
    }

    const rushAttempt = Boolean(ordinaryOpportunity && row.rushAttempt && rusherId);
    const scramble = Boolean(rushAttempt && row.qbScramble);
    const designedQbRush = Boolean(
      rushAttempt &&
      sourceRusherId &&
      qbSet.has(sourceRusherId) &&
      !row.qbScramble,
    );

    return {
      eventId: `${row.gameId}:${row.playId}`,
      gameId: row.gameId,
      season: row.season,
      week: row.week,
      offenseTeam: row.offenseTeam!,
      countsAsOffensivePlay: ordinaryOpportunity,
      dropback: Boolean(ordinaryOpportunity && row.qbDropback),
      rushAttempt,
      designedQbRush,
      scramble,
      rusherId,
      targetId,
      completedPass: Boolean(ordinaryOpportunity && row.completePass && targetId),
      airYards: ordinaryOpportunity && targetId ? row.airYards : null,
      down: ordinaryOpportunity ? canonicalDown(row.down) : null,
      yardline100: ordinaryOpportunity ? canonicalYardline(row.yardline100) : null,
      twoMinute: Boolean(
        ordinaryOpportunity &&
        row.halfSecondsRemaining != null &&
        row.halfSecondsRemaining <= 120,
      ),
      offenseScoreDifferential: ordinaryOpportunity ? row.scoreDifferential : null,
      knownAt,
      sourceRef: `${receipt.receiptId}#play=${row.playId}`,
    };
  });

  return {
    receipt,
    input: {
      contractVersion: "ccf-game-opportunity-input-v1",
      gameId: options.gameId,
      season: options.snapshot.season,
      week: options.snapshot.requestedWeek!,
      asOf: options.asOf,
      sourceState: options.sourceState,
      completeGameEvidence: true,
      plays,
    },
  };
}
