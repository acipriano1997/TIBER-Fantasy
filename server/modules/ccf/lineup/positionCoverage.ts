import crypto from "crypto";
import type { CCFPosition } from "../outcomes/contract";

export const CCF_LINEUP_POSITION_COVERAGE_VERSION = "ccf-lineup-position-coverage-v0" as const;
export const CCF_NATIVE_LINEUP_POSITIONS: readonly CCFPosition[] = ["QB", "RB", "WR", "TE"];

export interface CCFLineupPositionCoverageInput {
  contractVersion: typeof CCF_LINEUP_POSITION_COVERAGE_VERSION;
  leagueRef: string;
  rosterSlotsFingerprint: string;
  /**
   * Canonical player-position families that can legally occupy at least one
   * active starter slot after the league-context adapter resolves FLEX/SF/IDP
   * slot semantics. Bench/IR/taxi tokens do not belong here.
   */
  starterEligiblePositions: readonly string[];
}

export interface CCFLineupPositionCoverageAudit {
  contractVersion: typeof CCF_LINEUP_POSITION_COVERAGE_VERSION;
  leagueRef: string;
  rosterSlotsFingerprint: string;
  supportedPositions: readonly CCFPosition[];
  requiredPositions: string[];
  unsupportedPositions: string[];
  ready: boolean;
  coverageFingerprint: string | null;
  blockers: string[];
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function canonicalPosition(value: string): string {
  return value.trim().toUpperCase();
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Prove that the active league's starter-position universe is fully supported by
 * the native CCF weekly outcome contract.
 *
 * The league-context adapter owns platform slot interpretation. This audit owns
 * only the final coverage question: after FLEX/Superflex/etc. are resolved into
 * canonical player-position families, can CCF produce native weekly outcomes
 * for every position that may legally start? Unknown/unsupported families fail
 * closed; they are never silently dropped from optimization.
 */
export function auditCCFLineupPositionCoverage(
  input: CCFLineupPositionCoverageInput,
): CCFLineupPositionCoverageAudit {
  const blockers = new Set<string>();

  if (input.contractVersion !== CCF_LINEUP_POSITION_COVERAGE_VERSION) {
    blockers.add("unsupported_contract_version");
  }
  if (!hasText(input.leagueRef)) blockers.add("league_ref_missing");
  if (!hasText(input.rosterSlotsFingerprint)) blockers.add("roster_slots_fingerprint_missing");
  if (!input.starterEligiblePositions.length) blockers.add("starter_position_coverage_missing");

  const canonicalPositions = input.starterEligiblePositions.map(canonicalPosition);
  if (canonicalPositions.some((position) => !hasText(position))) {
    blockers.add("starter_position_blank");
  }

  const requiredPositions = Array.from(new Set(canonicalPositions.filter(hasText))).sort();
  const nativePositions = new Set<string>(CCF_NATIVE_LINEUP_POSITIONS);
  const unsupportedPositions = requiredPositions.filter((position) => !nativePositions.has(position));
  for (const position of unsupportedPositions) blockers.add(`unsupported_position:${position}`);

  const sortedBlockers = Array.from(blockers).sort();
  const canonical = {
    contractVersion: CCF_LINEUP_POSITION_COVERAGE_VERSION,
    leagueRef: input.leagueRef,
    rosterSlotsFingerprint: input.rosterSlotsFingerprint,
    requiredPositions,
    supportedPositions: [...CCF_NATIVE_LINEUP_POSITIONS].sort(),
  };

  return {
    contractVersion: CCF_LINEUP_POSITION_COVERAGE_VERSION,
    leagueRef: input.leagueRef,
    rosterSlotsFingerprint: input.rosterSlotsFingerprint,
    supportedPositions: CCF_NATIVE_LINEUP_POSITIONS,
    requiredPositions,
    unsupportedPositions,
    ready: sortedBlockers.length === 0,
    coverageFingerprint: hasText(input.leagueRef) && hasText(input.rosterSlotsFingerprint)
      ? fingerprint(canonical)
      : null,
    blockers: sortedBlockers,
  };
}

export function assertCCFLineupPositionCoverage(
  input: CCFLineupPositionCoverageInput,
): CCFLineupPositionCoverageAudit {
  const audit = auditCCFLineupPositionCoverage(input);
  if (!audit.ready) {
    throw new Error(`CCF lineup position coverage blocked: ${audit.blockers.join(", ")}`);
  }
  return audit;
}
