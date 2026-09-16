import crypto from "crypto";

export interface CCFAppendOnlyLedgerRecord<T> {
  recordId: string;
  ledgerEntryId: string;
  revision: number;
  supersedesRecordId: string | null;
  recordedAt: string;
  changeNote: string | null;
  payload: T;
  payloadSha256: string;
}

export class CCFAppendOnlyLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFAppendOnlyLedgerError";
  }
}

function parseTimestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new CCFAppendOnlyLedgerError(`${label} must be a valid timestamp`);
  return parsed;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

export function fingerprintCCFLedgerPayload(payload: unknown): string {
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function createCCFLedgerRecord<T>(input: {
  recordId: string;
  ledgerEntryId: string;
  recordedAt: string;
  payload: T;
  previous?: CCFAppendOnlyLedgerRecord<T>;
  changeNote?: string | null;
}): CCFAppendOnlyLedgerRecord<T> {
  if (!input.recordId.trim()) throw new CCFAppendOnlyLedgerError("recordId is required");
  if (!input.ledgerEntryId.trim()) throw new CCFAppendOnlyLedgerError("ledgerEntryId is required");
  const recordedAt = parseTimestamp("recordedAt", input.recordedAt);

  if (input.previous) {
    if (input.previous.ledgerEntryId !== input.ledgerEntryId) {
      throw new CCFAppendOnlyLedgerError("revision ledgerEntryId must match previous record");
    }
    if (input.previous.recordId === input.recordId) {
      throw new CCFAppendOnlyLedgerError("a revision must use a new immutable recordId");
    }
    const previousAt = parseTimestamp("previous.recordedAt", input.previous.recordedAt);
    if (recordedAt < previousAt) {
      throw new CCFAppendOnlyLedgerError("revision recordedAt cannot precede the previous record");
    }
  }

  return {
    recordId: input.recordId,
    ledgerEntryId: input.ledgerEntryId,
    revision: input.previous ? input.previous.revision + 1 : 1,
    supersedesRecordId: input.previous?.recordId ?? null,
    recordedAt: input.recordedAt,
    changeNote: input.changeNote ?? null,
    payload: input.payload,
    payloadSha256: fingerprintCCFLedgerPayload(input.payload),
  };
}

export function validateCCFAppendOnlyLedgerHistory<T>(
  records: readonly CCFAppendOnlyLedgerRecord<T>[],
): CCFAppendOnlyLedgerRecord<T>[] {
  if (records.length === 0) return [];
  const sorted = [...records].sort((a, b) => a.revision - b.revision);
  const entryId = sorted[0].ledgerEntryId;
  const recordIds = new Set<string>();

  for (let index = 0; index < sorted.length; index += 1) {
    const record = sorted[index];
    if (record.ledgerEntryId !== entryId) {
      throw new CCFAppendOnlyLedgerError("ledger history contains more than one ledgerEntryId");
    }
    if (recordIds.has(record.recordId)) {
      throw new CCFAppendOnlyLedgerError(`duplicate immutable recordId ${record.recordId}`);
    }
    recordIds.add(record.recordId);
    parseTimestamp(`${record.recordId}.recordedAt`, record.recordedAt);
    if (record.payloadSha256 !== fingerprintCCFLedgerPayload(record.payload)) {
      throw new CCFAppendOnlyLedgerError(`payload digest mismatch for ${record.recordId}`);
    }

    const expectedRevision = index + 1;
    if (record.revision !== expectedRevision) {
      throw new CCFAppendOnlyLedgerError(`expected revision ${expectedRevision}, got ${record.revision}`);
    }
    if (index === 0) {
      if (record.supersedesRecordId !== null) {
        throw new CCFAppendOnlyLedgerError("revision 1 must not supersede another record");
      }
    } else {
      const prior = sorted[index - 1];
      if (record.supersedesRecordId !== prior.recordId) {
        throw new CCFAppendOnlyLedgerError(
          `revision ${record.revision} must supersede ${prior.recordId}`,
        );
      }
      if (Date.parse(record.recordedAt) < Date.parse(prior.recordedAt)) {
        throw new CCFAppendOnlyLedgerError("ledger timestamps must be non-decreasing");
      }
    }
  }

  return sorted;
}
