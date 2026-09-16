import crypto from "crypto";
import type { CCFArchivedNflverseScheduleSnapshot } from "./archivedNflverseSchedule";

export interface CCFNflverseScheduleIdentityPolicyReceipt {
  contractVersion: "ccf-nflverse-schedule-identity-policy-v1";
  receiptId: string;
  sourceSystem: "nflverse";
  gameIdNamespace: "nflverse_game_id";
  teamIdNamespace: "nflverse_team_abbreviation";
  identityScope: "provider_native_schedule";
  crossProviderCanonicalClaim: false;
  knownAt: string;
  frozenAt: string;
  evidenceRefs: string[];
  notes: string[];
}

export interface CCFNflverseScheduleIdentityAudit {
  contractVersion: "ccf-nflverse-schedule-identity-audit-v1";
  receiptId: string | null;
  receiptFingerprint: string | null;
  identityBindingRef: string | null;
  asOf: string;
  eligibleCount: number;
  resolvedCount: number;
  blockers: string[];
}

export class CCFNflverseScheduleIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNflverseScheduleIdentityError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function uniqueNonEmptyRefs(label: string, refs: readonly string[]): void {
  if (refs.length === 0) {
    throw new CCFNflverseScheduleIdentityError(`${label} requires evidenceRefs`);
  }
  if (refs.some((ref) => !hasText(ref))) {
    throw new CCFNflverseScheduleIdentityError(`${label} contains an empty evidenceRef`);
  }
  if (new Set(refs).size !== refs.length) {
    throw new CCFNflverseScheduleIdentityError(`${label} contains duplicate evidenceRefs`);
  }
}

export function validateCCFNflverseScheduleIdentityPolicyReceipt(
  receipt: CCFNflverseScheduleIdentityPolicyReceipt,
): CCFNflverseScheduleIdentityPolicyReceipt {
  if (receipt.contractVersion !== "ccf-nflverse-schedule-identity-policy-v1") {
    throw new CCFNflverseScheduleIdentityError("unsupported nflverse schedule identity policy version");
  }
  if (!hasText(receipt.receiptId)) {
    throw new CCFNflverseScheduleIdentityError("receiptId is required");
  }
  if (
    receipt.sourceSystem !== "nflverse" ||
    receipt.gameIdNamespace !== "nflverse_game_id" ||
    receipt.teamIdNamespace !== "nflverse_team_abbreviation" ||
    receipt.identityScope !== "provider_native_schedule" ||
    receipt.crossProviderCanonicalClaim !== false
  ) {
    throw new CCFNflverseScheduleIdentityError(
      "schedule identity receipt must remain provider-native and must not claim cross-provider canonical identity",
    );
  }
  if (!validTimestamp(receipt.knownAt) || !validTimestamp(receipt.frozenAt)) {
    throw new CCFNflverseScheduleIdentityError("knownAt and frozenAt must be valid timestamps");
  }
  if (Date.parse(receipt.knownAt) > Date.parse(receipt.frozenAt)) {
    throw new CCFNflverseScheduleIdentityError("knownAt cannot occur after frozenAt");
  }
  uniqueNonEmptyRefs("schedule identity policy", receipt.evidenceRefs);
  if (new Set(receipt.notes).size !== receipt.notes.length) {
    throw new CCFNflverseScheduleIdentityError("notes must not contain duplicates");
  }
  return receipt;
}

function canonicalReceipt(receipt: CCFNflverseScheduleIdentityPolicyReceipt) {
  return {
    ...receipt,
    evidenceRefs: [...receipt.evidenceRefs].sort(),
    notes: [...receipt.notes].sort(),
  };
}

export function fingerprintCCFNflverseScheduleIdentityPolicyReceipt(
  receipt: CCFNflverseScheduleIdentityPolicyReceipt,
): string {
  validateCCFNflverseScheduleIdentityPolicyReceipt(receipt);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalReceipt(receipt)))
    .digest("hex");
}

export function refCCFNflverseScheduleIdentityPolicyReceipt(
  receipt: CCFNflverseScheduleIdentityPolicyReceipt,
): string {
  return `ccf://nflverse-schedule-identity/sha256/${fingerprintCCFNflverseScheduleIdentityPolicyReceipt(receipt)}`;
}

export function auditCCFNflverseScheduleIdentity(
  snapshot: CCFArchivedNflverseScheduleSnapshot,
  receipt: CCFNflverseScheduleIdentityPolicyReceipt,
  asOf: string,
): CCFNflverseScheduleIdentityAudit {
  const blockers = new Set<string>();
  let receiptFingerprint: string | null = null;
  let identityBindingRef: string | null = null;
  let receiptValid = true;

  if (!validTimestamp(asOf)) blockers.add("invalid_as_of");
  try {
    validateCCFNflverseScheduleIdentityPolicyReceipt(receipt);
    receiptFingerprint = fingerprintCCFNflverseScheduleIdentityPolicyReceipt(receipt);
    identityBindingRef = refCCFNflverseScheduleIdentityPolicyReceipt(receipt);
  } catch (error) {
    receiptValid = false;
    blockers.add(`invalid_receipt:${error instanceof Error ? error.message : "unknown"}`);
  }

  if (receiptValid && validTimestamp(asOf)) {
    const asOfMs = Date.parse(asOf);
    if (Date.parse(receipt.knownAt) > asOfMs) blockers.add("identity_policy_known_after_as_of");
    if (Date.parse(receipt.frozenAt) > asOfMs) blockers.add("identity_policy_frozen_after_as_of");
  }

  const seenGameIds = new Set<string>();
  let structurallyResolved = 0;
  for (const row of snapshot.rows) {
    if (!hasText(row.gameId)) {
      blockers.add("schedule_game_id_missing");
      continue;
    }
    if (seenGameIds.has(row.gameId)) {
      blockers.add(`duplicate_schedule_game_id:${row.gameId}`);
      continue;
    }
    seenGameIds.add(row.gameId);
    if (!hasText(row.awayTeam) || !hasText(row.homeTeam) || row.awayTeam === row.homeTeam) {
      blockers.add(`schedule_team_identity_invalid:${row.gameId}`);
      continue;
    }
    structurallyResolved += 1;
  }

  const eligibleCount = snapshot.rows.length;
  const policyEligible = receiptValid
    && validTimestamp(asOf)
    && !blockers.has("identity_policy_known_after_as_of")
    && !blockers.has("identity_policy_frozen_after_as_of");
  const resolvedCount = policyEligible ? structurallyResolved : 0;

  return {
    contractVersion: "ccf-nflverse-schedule-identity-audit-v1",
    receiptId: hasText(receipt.receiptId) ? receipt.receiptId : null,
    receiptFingerprint,
    identityBindingRef,
    asOf,
    eligibleCount,
    resolvedCount,
    blockers: Array.from(blockers).sort(),
  };
}

export function assertCCFNflverseScheduleIdentityResolved(
  snapshot: CCFArchivedNflverseScheduleSnapshot,
  receipt: CCFNflverseScheduleIdentityPolicyReceipt,
  asOf: string,
): CCFNflverseScheduleIdentityAudit {
  const audit = auditCCFNflverseScheduleIdentity(snapshot, receipt, asOf);
  if (audit.blockers.length > 0 || audit.resolvedCount !== audit.eligibleCount) {
    throw new CCFNflverseScheduleIdentityError(
      `nflverse schedule identity is not resolved: ${audit.blockers.join(", ")}`,
    );
  }
  return audit;
}
