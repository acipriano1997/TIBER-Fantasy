import crypto from "crypto";

export type CCFDevyIdentityResolutionStatus =
  | "resolved_exact"
  | "unresolved"
  | "ambiguous"
  | "not_applicable";

export type CCFDevyPlayerBindingMethod =
  | "explicit_mapping"
  | "exact_external_id"
  | "governed_alias_map";

export type CCFDevyRosterBindingMethod =
  | "explicit_mapping"
  | "exact_roster_key";

export interface CCFDevyRosterBinding {
  sourceRosterKey: string;
  sleeperRosterId: number;
  bindingMethod: CCFDevyRosterBindingMethod;
  evidenceRefs: string[];
}

export interface CCFDevyIdentityLinkageRow {
  sourceRowKey: string;
  sourceRosterKey: string;
  status: CCFDevyIdentityResolutionStatus;
  canonicalPlayerId: string | null;
  sleeperPlayerId: string | null;
  bindingMethod: CCFDevyPlayerBindingMethod | null;
  knownAt: string;
  evidenceRefs: string[];
}

export interface CCFDevyIdentityLinkageReceipt {
  contractVersion: "ccf-devy-identity-linkage-v1";
  receiptId: string;
  sourceArtifactFingerprint: string;
  sourceSchemaVersion: string;
  sourceImportedAt: string;
  sleeperLeagueId: string;
  sleeperSnapshotFingerprint: string;
  sleeperSnapshotKnownAt: string;
  frozenAt: string;
  rosterBindings: CCFDevyRosterBinding[];
  rows: CCFDevyIdentityLinkageRow[];
  notes: string[];
}

export interface CCFDevyIdentityLinkageAudit {
  contractVersion: "ccf-devy-identity-linkage-audit-v1";
  receiptId: string | null;
  ready: boolean;
  applicableRows: number;
  resolvedRows: number;
  unresolvedRows: number;
  ambiguousRows: number;
  rosterBindingCount: number;
  fingerprint: string | null;
  blockers: string[];
}

export class CCFDevyIdentityLinkageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFDevyIdentityLinkageError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function requireUniqueTextRefs(label: string, refs: readonly string[]): void {
  if (refs.length === 0) throw new CCFDevyIdentityLinkageError(`${label} requires evidenceRefs`);
  if (refs.some((ref) => !hasText(ref))) {
    throw new CCFDevyIdentityLinkageError(`${label} contains an empty evidenceRef`);
  }
  if (new Set(refs).size !== refs.length) {
    throw new CCFDevyIdentityLinkageError(`${label} contains duplicate evidenceRefs`);
  }
}

export function validateCCFDevyIdentityLinkageReceipt(
  receipt: CCFDevyIdentityLinkageReceipt,
): CCFDevyIdentityLinkageReceipt {
  if (receipt.contractVersion !== "ccf-devy-identity-linkage-v1") {
    throw new CCFDevyIdentityLinkageError("unsupported Devy identity linkage version");
  }
  for (const [label, value] of [
    ["receiptId", receipt.receiptId],
    ["sourceArtifactFingerprint", receipt.sourceArtifactFingerprint],
    ["sourceSchemaVersion", receipt.sourceSchemaVersion],
    ["sleeperLeagueId", receipt.sleeperLeagueId],
    ["sleeperSnapshotFingerprint", receipt.sleeperSnapshotFingerprint],
  ] as const) {
    if (!hasText(value)) throw new CCFDevyIdentityLinkageError(`${label} is required`);
  }
  for (const [label, value] of [
    ["sourceImportedAt", receipt.sourceImportedAt],
    ["sleeperSnapshotKnownAt", receipt.sleeperSnapshotKnownAt],
    ["frozenAt", receipt.frozenAt],
  ] as const) {
    if (!validTimestamp(value)) throw new CCFDevyIdentityLinkageError(`${label} must be a valid timestamp`);
  }
  if (receipt.rows.length === 0) throw new CCFDevyIdentityLinkageError("rows must not be empty");
  if (receipt.rosterBindings.length === 0) {
    throw new CCFDevyIdentityLinkageError("rosterBindings must not be empty");
  }
  if (new Set(receipt.notes).size !== receipt.notes.length) {
    throw new CCFDevyIdentityLinkageError("notes must not contain duplicates");
  }

  const rosterKeys = new Set<string>();
  const rosterIds = new Set<number>();
  for (const binding of receipt.rosterBindings) {
    if (!hasText(binding.sourceRosterKey)) {
      throw new CCFDevyIdentityLinkageError("roster binding sourceRosterKey is required");
    }
    if (!Number.isInteger(binding.sleeperRosterId) || binding.sleeperRosterId <= 0) {
      throw new CCFDevyIdentityLinkageError("sleeperRosterId must be a positive integer");
    }
    if (rosterKeys.has(binding.sourceRosterKey)) {
      throw new CCFDevyIdentityLinkageError(`duplicate sourceRosterKey ${binding.sourceRosterKey}`);
    }
    if (rosterIds.has(binding.sleeperRosterId)) {
      throw new CCFDevyIdentityLinkageError(`duplicate sleeperRosterId ${binding.sleeperRosterId}`);
    }
    rosterKeys.add(binding.sourceRosterKey);
    rosterIds.add(binding.sleeperRosterId);
    requireUniqueTextRefs(`roster ${binding.sourceRosterKey}`, binding.evidenceRefs);
  }

  const rowKeys = new Set<string>();
  const canonicalIds = new Set<string>();
  const sleeperIds = new Set<string>();
  for (const row of receipt.rows) {
    if (!hasText(row.sourceRowKey)) {
      throw new CCFDevyIdentityLinkageError("sourceRowKey is required");
    }
    if (rowKeys.has(row.sourceRowKey)) {
      throw new CCFDevyIdentityLinkageError(`duplicate sourceRowKey ${row.sourceRowKey}`);
    }
    rowKeys.add(row.sourceRowKey);
    if (!hasText(row.sourceRosterKey) || !rosterKeys.has(row.sourceRosterKey)) {
      throw new CCFDevyIdentityLinkageError(
        `${row.sourceRowKey} references an unbound sourceRosterKey`,
      );
    }
    if (!validTimestamp(row.knownAt)) {
      throw new CCFDevyIdentityLinkageError(`${row.sourceRowKey} knownAt must be a valid timestamp`);
    }
    requireUniqueTextRefs(`row ${row.sourceRowKey}`, row.evidenceRefs);

    if (row.status === "resolved_exact") {
      if (!hasText(row.canonicalPlayerId) || !hasText(row.sleeperPlayerId) || row.bindingMethod == null) {
        throw new CCFDevyIdentityLinkageError(
          `${row.sourceRowKey} resolved_exact requires canonicalPlayerId, sleeperPlayerId, and bindingMethod`,
        );
      }
      if (canonicalIds.has(row.canonicalPlayerId)) {
        throw new CCFDevyIdentityLinkageError(
          `duplicate resolved canonicalPlayerId ${row.canonicalPlayerId}`,
        );
      }
      if (sleeperIds.has(row.sleeperPlayerId)) {
        throw new CCFDevyIdentityLinkageError(
          `duplicate resolved sleeperPlayerId ${row.sleeperPlayerId}`,
        );
      }
      canonicalIds.add(row.canonicalPlayerId);
      sleeperIds.add(row.sleeperPlayerId);
    } else if (
      row.canonicalPlayerId !== null ||
      row.sleeperPlayerId !== null ||
      row.bindingMethod !== null
    ) {
      throw new CCFDevyIdentityLinkageError(
        `${row.sourceRowKey} non-resolved status must not claim a player binding`,
      );
    }
  }

  return receipt;
}

function canonicalReceipt(receipt: CCFDevyIdentityLinkageReceipt) {
  return {
    ...receipt,
    rosterBindings: [...receipt.rosterBindings]
      .sort((left, right) => left.sourceRosterKey.localeCompare(right.sourceRosterKey))
      .map((binding) => ({ ...binding, evidenceRefs: [...binding.evidenceRefs].sort() })),
    rows: [...receipt.rows]
      .sort((left, right) => left.sourceRowKey.localeCompare(right.sourceRowKey))
      .map((row) => ({ ...row, evidenceRefs: [...row.evidenceRefs].sort() })),
    notes: [...receipt.notes].sort(),
  };
}

export function fingerprintCCFDevyIdentityLinkageReceipt(
  receipt: CCFDevyIdentityLinkageReceipt,
): string {
  validateCCFDevyIdentityLinkageReceipt(receipt);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalReceipt(receipt)))
    .digest("hex");
}

export function evaluateCCFDevyIdentityLinkage(
  receipt: CCFDevyIdentityLinkageReceipt,
  asOf: string,
): CCFDevyIdentityLinkageAudit {
  const blockers = new Set<string>();
  let fingerprint: string | null = null;
  if (!validTimestamp(asOf)) blockers.add("invalid_as_of");

  try {
    validateCCFDevyIdentityLinkageReceipt(receipt);
    fingerprint = fingerprintCCFDevyIdentityLinkageReceipt(receipt);
  } catch (error) {
    blockers.add(`invalid_receipt:${error instanceof Error ? error.message : "unknown"}`);
  }

  if (validTimestamp(asOf)) {
    const asOfMs = Date.parse(asOf);
    if (validTimestamp(receipt.sourceImportedAt) && Date.parse(receipt.sourceImportedAt) > asOfMs) {
      blockers.add("source_imported_after_as_of");
    }
    if (
      validTimestamp(receipt.sleeperSnapshotKnownAt) &&
      Date.parse(receipt.sleeperSnapshotKnownAt) > asOfMs
    ) {
      blockers.add("sleeper_snapshot_known_after_as_of");
    }
    if (validTimestamp(receipt.frozenAt) && Date.parse(receipt.frozenAt) > asOfMs) {
      blockers.add("receipt_frozen_after_as_of");
    }
    for (const row of receipt.rows) {
      if (validTimestamp(row.knownAt) && Date.parse(row.knownAt) > asOfMs) {
        blockers.add(`${row.sourceRowKey}:known_after_as_of`);
      }
      if (validTimestamp(row.knownAt) && Date.parse(row.knownAt) > Date.parse(receipt.frozenAt)) {
        blockers.add(`${row.sourceRowKey}:known_after_freeze`);
      }
    }
  }

  const applicable = receipt.rows.filter((row) => row.status !== "not_applicable");
  const resolvedRows = applicable.filter((row) => row.status === "resolved_exact").length;
  const unresolvedRows = applicable.filter((row) => row.status === "unresolved").length;
  const ambiguousRows = applicable.filter((row) => row.status === "ambiguous").length;
  if (unresolvedRows > 0) blockers.add(`unresolved_rows:${unresolvedRows}`);
  if (ambiguousRows > 0) blockers.add(`ambiguous_rows:${ambiguousRows}`);
  if (resolvedRows !== applicable.length) blockers.add("applicable_rows_not_fully_resolved");

  return {
    contractVersion: "ccf-devy-identity-linkage-audit-v1",
    receiptId: hasText(receipt.receiptId) ? receipt.receiptId : null,
    ready: blockers.size === 0,
    applicableRows: applicable.length,
    resolvedRows,
    unresolvedRows,
    ambiguousRows,
    rosterBindingCount: receipt.rosterBindings.length,
    fingerprint,
    blockers: Array.from(blockers).sort(),
  };
}

export function assertCCFDevyIdentityLinkageReady(
  receipt: CCFDevyIdentityLinkageReceipt,
  asOf: string,
): void {
  const audit = evaluateCCFDevyIdentityLinkage(receipt, asOf);
  if (!audit.ready) {
    throw new CCFDevyIdentityLinkageError(
      `Devy identity linkage is not ready: ${audit.blockers.join(", ")}`,
    );
  }
}