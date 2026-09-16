import crypto from "crypto";

export type CCFNFLPlayerIdentityStatus =
  | "resolved_exact"
  | "unresolved"
  | "ambiguous"
  | "not_applicable";

export type CCFNFLPlayerIdentityBindingMethod =
  | "exact_external_id"
  | "explicit_mapping";

export interface CCFNFLPlayerIdentityLinkageRow {
  sourcePlayerId: string;
  status: CCFNFLPlayerIdentityStatus;
  canonicalPlayerId: string | null;
  bindingMethod: CCFNFLPlayerIdentityBindingMethod | null;
  knownAt: string;
  evidenceRefs: string[];
}

export interface CCFNFLPlayerIdentityLinkageReceipt {
  contractVersion: "ccf-nfl-player-identity-linkage-v1";
  receiptId: string;
  sourceSystem: "nflverse";
  sourceNamespace: "gsis_id";
  identityRegistryFingerprint: string;
  identityRegistryKnownAt: string;
  frozenAt: string;
  rows: CCFNFLPlayerIdentityLinkageRow[];
  notes: string[];
}

export interface CCFNFLPlayerIdentitySubsetAudit {
  contractVersion: "ccf-nfl-player-identity-subset-audit-v1";
  receiptId: string | null;
  receiptFingerprint: string | null;
  asOf: string;
  requestedCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  ambiguousCount: number;
  notApplicableCount: number;
  resolvedSourcePlayerIds: string[];
  blockers: string[];
}

export class CCFNFLPlayerIdentityLinkageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFNFLPlayerIdentityLinkageError";
  }
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function requireUniqueRefs(label: string, refs: readonly string[]): void {
  if (refs.length === 0) {
    throw new CCFNFLPlayerIdentityLinkageError(`${label} requires evidenceRefs`);
  }
  if (refs.some((ref) => !hasText(ref))) {
    throw new CCFNFLPlayerIdentityLinkageError(`${label} contains an empty evidenceRef`);
  }
  if (new Set(refs).size !== refs.length) {
    throw new CCFNFLPlayerIdentityLinkageError(`${label} contains duplicate evidenceRefs`);
  }
}

export function validateCCFNFLPlayerIdentityLinkageReceipt(
  receipt: CCFNFLPlayerIdentityLinkageReceipt,
): CCFNFLPlayerIdentityLinkageReceipt {
  if (receipt.contractVersion !== "ccf-nfl-player-identity-linkage-v1") {
    throw new CCFNFLPlayerIdentityLinkageError("unsupported NFL player identity linkage version");
  }
  for (const [label, value] of [
    ["receiptId", receipt.receiptId],
    ["identityRegistryFingerprint", receipt.identityRegistryFingerprint],
  ] as const) {
    if (!hasText(value)) throw new CCFNFLPlayerIdentityLinkageError(`${label} is required`);
  }
  if (receipt.sourceSystem !== "nflverse" || receipt.sourceNamespace !== "gsis_id") {
    throw new CCFNFLPlayerIdentityLinkageError(
      "NFL player identity linkage must bind nflverse gsis_id",
    );
  }
  for (const [label, value] of [
    ["identityRegistryKnownAt", receipt.identityRegistryKnownAt],
    ["frozenAt", receipt.frozenAt],
  ] as const) {
    if (!validTimestamp(value)) {
      throw new CCFNFLPlayerIdentityLinkageError(`${label} must be a valid timestamp`);
    }
  }
  if (Date.parse(receipt.identityRegistryKnownAt) > Date.parse(receipt.frozenAt)) {
    throw new CCFNFLPlayerIdentityLinkageError(
      "identityRegistryKnownAt cannot occur after receipt frozenAt",
    );
  }
  if (receipt.rows.length === 0) {
    throw new CCFNFLPlayerIdentityLinkageError("rows must not be empty");
  }
  if (new Set(receipt.notes).size !== receipt.notes.length) {
    throw new CCFNFLPlayerIdentityLinkageError("notes must not contain duplicates");
  }

  const sourceIds = new Set<string>();
  const canonicalIds = new Set<string>();
  for (const row of receipt.rows) {
    if (!hasText(row.sourcePlayerId)) {
      throw new CCFNFLPlayerIdentityLinkageError("sourcePlayerId is required");
    }
    if (sourceIds.has(row.sourcePlayerId)) {
      throw new CCFNFLPlayerIdentityLinkageError(
        `duplicate sourcePlayerId ${row.sourcePlayerId}`,
      );
    }
    sourceIds.add(row.sourcePlayerId);
    if (!validTimestamp(row.knownAt)) {
      throw new CCFNFLPlayerIdentityLinkageError(
        `${row.sourcePlayerId} knownAt must be a valid timestamp`,
      );
    }
    if (Date.parse(row.knownAt) > Date.parse(receipt.frozenAt)) {
      throw new CCFNFLPlayerIdentityLinkageError(
        `${row.sourcePlayerId} knownAt cannot occur after receipt frozenAt`,
      );
    }
    requireUniqueRefs(`row ${row.sourcePlayerId}`, row.evidenceRefs);

    if (row.status === "resolved_exact") {
      if (!hasText(row.canonicalPlayerId) || row.bindingMethod == null) {
        throw new CCFNFLPlayerIdentityLinkageError(
          `${row.sourcePlayerId} resolved_exact requires canonicalPlayerId and bindingMethod`,
        );
      }
      if (canonicalIds.has(row.canonicalPlayerId)) {
        throw new CCFNFLPlayerIdentityLinkageError(
          `duplicate resolved canonicalPlayerId ${row.canonicalPlayerId}`,
        );
      }
      canonicalIds.add(row.canonicalPlayerId);
    } else if (row.canonicalPlayerId !== null || row.bindingMethod !== null) {
      throw new CCFNFLPlayerIdentityLinkageError(
        `${row.sourcePlayerId} non-resolved status must not claim a player binding`,
      );
    }
  }

  return receipt;
}

function canonicalReceipt(receipt: CCFNFLPlayerIdentityLinkageReceipt) {
  return {
    ...receipt,
    rows: [...receipt.rows]
      .sort((left, right) => left.sourcePlayerId.localeCompare(right.sourcePlayerId))
      .map((row) => ({ ...row, evidenceRefs: [...row.evidenceRefs].sort() })),
    notes: [...receipt.notes].sort(),
  };
}

export function fingerprintCCFNFLPlayerIdentityLinkageReceipt(
  receipt: CCFNFLPlayerIdentityLinkageReceipt,
): string {
  validateCCFNFLPlayerIdentityLinkageReceipt(receipt);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalReceipt(receipt)))
    .digest("hex");
}

export function auditCCFNFLPlayerIdentitySubset(
  receipt: CCFNFLPlayerIdentityLinkageReceipt,
  requestedSourcePlayerIds: readonly string[],
  asOf: string,
): CCFNFLPlayerIdentitySubsetAudit {
  const blockers = new Set<string>();
  let receiptFingerprint: string | null = null;
  let structurallyValid = true;
  if (!validTimestamp(asOf)) blockers.add("invalid_as_of");

  try {
    validateCCFNFLPlayerIdentityLinkageReceipt(receipt);
    receiptFingerprint = fingerprintCCFNFLPlayerIdentityLinkageReceipt(receipt);
  } catch (error) {
    structurallyValid = false;
    blockers.add(`invalid_receipt:${error instanceof Error ? error.message : "unknown"}`);
  }

  if (requestedSourcePlayerIds.some((playerId) => !hasText(playerId))) {
    blockers.add("requested_source_player_id_empty");
  }
  if (new Set(requestedSourcePlayerIds).size !== requestedSourcePlayerIds.length) {
    blockers.add("requested_source_player_ids_duplicate");
  }

  if (validTimestamp(asOf) && structurallyValid) {
    const asOfMs = Date.parse(asOf);
    if (Date.parse(receipt.identityRegistryKnownAt) > asOfMs) {
      blockers.add("identity_registry_known_after_as_of");
    }
    if (Date.parse(receipt.frozenAt) > asOfMs) {
      blockers.add("receipt_frozen_after_as_of");
    }
  }

  const rowBySourceId = new Map(receipt.rows.map((row) => [row.sourcePlayerId, row]));
  const resolvedSourcePlayerIds: string[] = [];
  let unresolvedCount = 0;
  let ambiguousCount = 0;
  let notApplicableCount = 0;

  for (const sourcePlayerId of requestedSourcePlayerIds) {
    if (!hasText(sourcePlayerId)) continue;
    const row = rowBySourceId.get(sourcePlayerId);
    if (!row) {
      unresolvedCount += 1;
      continue;
    }
    if (validTimestamp(asOf) && validTimestamp(row.knownAt) && Date.parse(row.knownAt) > Date.parse(asOf)) {
      unresolvedCount += 1;
      blockers.add(`${sourcePlayerId}:known_after_as_of`);
      continue;
    }
    if (row.status === "resolved_exact") {
      resolvedSourcePlayerIds.push(sourcePlayerId);
    } else if (row.status === "ambiguous") {
      ambiguousCount += 1;
    } else if (row.status === "not_applicable") {
      notApplicableCount += 1;
    } else {
      unresolvedCount += 1;
    }
  }

  if (unresolvedCount > 0) blockers.add(`unresolved_requested_ids:${unresolvedCount}`);
  if (ambiguousCount > 0) blockers.add(`ambiguous_requested_ids:${ambiguousCount}`);

  return {
    contractVersion: "ccf-nfl-player-identity-subset-audit-v1",
    receiptId: hasText(receipt.receiptId) ? receipt.receiptId : null,
    receiptFingerprint,
    asOf,
    requestedCount: requestedSourcePlayerIds.length,
    resolvedCount: resolvedSourcePlayerIds.length,
    unresolvedCount,
    ambiguousCount,
    notApplicableCount,
    resolvedSourcePlayerIds: resolvedSourcePlayerIds.sort(),
    blockers: Array.from(blockers).sort(),
  };
}

export function assertCCFNFLPlayerIdentitySubsetResolved(
  receipt: CCFNFLPlayerIdentityLinkageReceipt,
  requestedSourcePlayerIds: readonly string[],
  asOf: string,
): CCFNFLPlayerIdentitySubsetAudit {
  const audit = auditCCFNFLPlayerIdentitySubset(receipt, requestedSourcePlayerIds, asOf);
  if (
    audit.blockers.length > 0 ||
    audit.resolvedCount + audit.notApplicableCount !== audit.requestedCount
  ) {
    throw new CCFNFLPlayerIdentityLinkageError(
      `NFL player identity subset is not resolved: ${audit.blockers.join(", ")}`,
    );
  }
  return audit;
}
