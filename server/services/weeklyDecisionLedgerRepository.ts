import { eq } from 'drizzle-orm';
import { db } from '../infra/db';
import {
  replayWeeklyDecisionLedgerEntry,
  type WeeklyDecisionLedgerEntryV1,
} from './weeklyDecisionLedger';
import {
  weeklyDecisionLedgerEntries,
  type WeeklyDecisionLedgerRow,
} from './weeklyDecisionLedgerTable';

export type AppendWeeklyDecisionLedgerResult = {
  status: 'inserted' | 'existing';
  id: number;
  entrySha256: string;
};

function requireDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`Cannot persist weekly decision ledger entry: ${field} is not a canonical UTC timestamp.`);
  }
  return date;
}

function requirePersistableEntry(rawEntry: unknown): WeeklyDecisionLedgerEntryV1 {
  const replay = replayWeeklyDecisionLedgerEntry(rawEntry);
  if (replay.integrity !== 'verified' || replay.determinism !== 'matched') {
    throw new Error(
      `Cannot persist weekly decision ledger entry: replay verification failed (${replay.integrity}/${replay.determinism}).`,
    );
  }
  return rawEntry as WeeklyDecisionLedgerEntryV1;
}

function assertPersistedRowIntegrity(row: WeeklyDecisionLedgerRow): WeeklyDecisionLedgerEntryV1 {
  const entry = requirePersistableEntry(row.payload);
  const mismatches: string[] = [];

  if (row.ledgerVersion !== entry.ledgerVersion) mismatches.push('ledger_version');
  if (row.evaluatorSchemaVersion !== entry.evaluatorSchemaVersion) mismatches.push('evaluator_schema_version');
  if (row.decisionId !== entry.resultSnapshot.receipt.decisionId) mismatches.push('decision_id');
  if (row.leagueRef !== entry.resultSnapshot.receipt.leagueRef) mismatches.push('league_ref');
  if (row.teamRef !== entry.resultSnapshot.receipt.teamRef) mismatches.push('team_ref');
  if (row.season !== entry.resultSnapshot.receipt.season) mismatches.push('season');
  if (row.week !== entry.resultSnapshot.receipt.week) mismatches.push('week');
  if (row.recordedAt.toISOString() !== entry.recordedAt) mismatches.push('recorded_at');
  if (row.evidenceCutoffAt.toISOString() !== entry.asOf.evidenceCutoffAt) mismatches.push('evidence_cutoff_at');
  if ((row.validUntil?.toISOString() ?? null) !== entry.asOf.validUntil) mismatches.push('valid_until');
  if (row.entrySha256 !== entry.hashes.entrySha256) mismatches.push('entry_sha256');
  if (row.contextSha256 !== entry.hashes.contextSha256) mismatches.push('context_sha256');
  if (row.resultSha256 !== entry.hashes.resultSha256) mismatches.push('result_sha256');
  if (row.lineageSha256 !== entry.hashes.lineageSha256) mismatches.push('lineage_sha256');

  if (mismatches.length > 0) {
    throw new Error(`Persisted weekly decision ledger row failed integrity checks: ${mismatches.join(',')}`);
  }

  return entry;
}

/**
 * Append a verified weekly decision receipt. The repository intentionally has
 * no update or delete API. Duplicate content hashes are idempotent retries,
 * never replacement writes.
 */
export async function appendWeeklyDecisionLedgerEntry(
  rawEntry: unknown,
): Promise<AppendWeeklyDecisionLedgerResult> {
  const entry = requirePersistableEntry(rawEntry);
  const recordedAt = requireDate(entry.recordedAt, 'recordedAt');
  const evidenceCutoffAt = requireDate(entry.asOf.evidenceCutoffAt, 'evidenceCutoffAt');
  const validUntil = entry.asOf.validUntil === null
    ? null
    : requireDate(entry.asOf.validUntil, 'validUntil');

  const inserted = await db
    .insert(weeklyDecisionLedgerEntries)
    .values({
      ledgerVersion: entry.ledgerVersion,
      evaluatorSchemaVersion: entry.evaluatorSchemaVersion,
      decisionId: entry.resultSnapshot.receipt.decisionId,
      leagueRef: entry.resultSnapshot.receipt.leagueRef,
      teamRef: entry.resultSnapshot.receipt.teamRef,
      season: entry.resultSnapshot.receipt.season,
      week: entry.resultSnapshot.receipt.week,
      recordedAt,
      evidenceCutoffAt,
      validUntil,
      entrySha256: entry.hashes.entrySha256,
      contextSha256: entry.hashes.contextSha256,
      resultSha256: entry.hashes.resultSha256,
      lineageSha256: entry.hashes.lineageSha256,
      payload: entry,
    })
    .onConflictDoNothing({ target: weeklyDecisionLedgerEntries.entrySha256 })
    .returning({
      id: weeklyDecisionLedgerEntries.id,
      entrySha256: weeklyDecisionLedgerEntries.entrySha256,
    });

  if (inserted[0]) {
    return {
      status: 'inserted',
      id: inserted[0].id,
      entrySha256: inserted[0].entrySha256,
    };
  }

  const existing = await db
    .select()
    .from(weeklyDecisionLedgerEntries)
    .where(eq(weeklyDecisionLedgerEntries.entrySha256, entry.hashes.entrySha256))
    .limit(1);

  if (!existing[0]) {
    throw new Error('Weekly decision ledger insert conflicted but no existing receipt could be verified.');
  }
  assertPersistedRowIntegrity(existing[0]);

  return {
    status: 'existing',
    id: existing[0].id,
    entrySha256: existing[0].entrySha256,
  };
}

/** Read a receipt only after its duplicated DB columns and frozen payload agree. */
export async function getWeeklyDecisionLedgerEntryByHash(
  entrySha256: string,
): Promise<WeeklyDecisionLedgerEntryV1 | null> {
  const rows = await db
    .select()
    .from(weeklyDecisionLedgerEntries)
    .where(eq(weeklyDecisionLedgerEntries.entrySha256, entrySha256))
    .limit(1);

  return rows[0] ? assertPersistedRowIntegrity(rows[0]) : null;
}
