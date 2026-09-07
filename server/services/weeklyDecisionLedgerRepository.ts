import type { Pool } from 'pg';
import {
  replayWeeklyDecisionLedgerEntry,
  type WeeklyDecisionLedgerEntryV1,
} from './weeklyDecisionLedger';

export type AppendWeeklyDecisionLedgerResult = {
  status: 'inserted' | 'existing';
  id: string;
  entrySha256: string;
};

type LedgerSqlClient = Pick<Pool, 'query'>;

type PersistedLedgerRow = {
  id: string;
  ledger_version: string;
  evaluator_schema_version: string;
  decision_id: string;
  league_ref: string;
  team_ref: string;
  season: number;
  week: number;
  recorded_at: Date | string;
  evidence_cutoff_at: Date | string;
  valid_until: Date | string | null;
  entry_sha256: string;
  context_sha256: string;
  result_sha256: string;
  lineage_sha256: string;
  payload: unknown;
};

function requireCanonicalTimestamp(value: string, field: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`Cannot persist weekly decision ledger entry: ${field} is not a canonical UTC timestamp.`);
  }
  return value;
}

function persistedTimestampIso(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
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

function assertPersistedRowIntegrity(row: PersistedLedgerRow): WeeklyDecisionLedgerEntryV1 {
  const entry = requirePersistableEntry(row.payload);
  const mismatches: string[] = [];

  if (row.ledger_version !== entry.ledgerVersion) mismatches.push('ledger_version');
  if (row.evaluator_schema_version !== entry.evaluatorSchemaVersion) mismatches.push('evaluator_schema_version');
  if (row.decision_id !== entry.resultSnapshot.receipt.decisionId) mismatches.push('decision_id');
  if (row.league_ref !== entry.resultSnapshot.receipt.leagueRef) mismatches.push('league_ref');
  if (row.team_ref !== entry.resultSnapshot.receipt.teamRef) mismatches.push('team_ref');
  if (row.season !== entry.resultSnapshot.receipt.season) mismatches.push('season');
  if (row.week !== entry.resultSnapshot.receipt.week) mismatches.push('week');
  if (persistedTimestampIso(row.recorded_at) !== entry.recordedAt) mismatches.push('recorded_at');
  if (persistedTimestampIso(row.evidence_cutoff_at) !== entry.asOf.evidenceCutoffAt) mismatches.push('evidence_cutoff_at');
  if (persistedTimestampIso(row.valid_until) !== entry.asOf.validUntil) mismatches.push('valid_until');
  if (row.entry_sha256 !== entry.hashes.entrySha256) mismatches.push('entry_sha256');
  if (row.context_sha256 !== entry.hashes.contextSha256) mismatches.push('context_sha256');
  if (row.result_sha256 !== entry.hashes.resultSha256) mismatches.push('result_sha256');
  if (row.lineage_sha256 !== entry.hashes.lineageSha256) mismatches.push('lineage_sha256');

  if (mismatches.length > 0) {
    throw new Error(`Persisted weekly decision ledger row failed integrity checks: ${mismatches.join(',')}`);
  }

  return entry;
}

const SELECT_BY_HASH_SQL = `
  SELECT
    id::text AS id,
    ledger_version,
    evaluator_schema_version,
    decision_id,
    league_ref,
    team_ref,
    season,
    week,
    recorded_at,
    evidence_cutoff_at,
    valid_until,
    entry_sha256,
    context_sha256,
    result_sha256,
    lineage_sha256,
    payload
  FROM weekly_decision_ledger_entries
  WHERE entry_sha256 = $1
  LIMIT 1
`;

/**
 * Build an insert/read-only repository over the application's existing
 * PostgreSQL pool. No UPDATE, DELETE, or TRUNCATE operation is exposed here;
 * migration 0016 independently rejects those operations at the database layer.
 */
export function createWeeklyDecisionLedgerRepository(client: LedgerSqlClient) {
  async function getRowByHash(entrySha256: string): Promise<PersistedLedgerRow | null> {
    const result = await client.query<PersistedLedgerRow>(SELECT_BY_HASH_SQL, [entrySha256]);
    return result.rows[0] ?? null;
  }

  return {
    async append(rawEntry: unknown): Promise<AppendWeeklyDecisionLedgerResult> {
      const entry = requirePersistableEntry(rawEntry);
      requireCanonicalTimestamp(entry.recordedAt, 'recordedAt');
      requireCanonicalTimestamp(entry.asOf.evidenceCutoffAt, 'evidenceCutoffAt');
      if (entry.asOf.validUntil !== null) requireCanonicalTimestamp(entry.asOf.validUntil, 'validUntil');

      const inserted = await client.query<{ id: string; entry_sha256: string }>(
        `
          INSERT INTO weekly_decision_ledger_entries (
            ledger_version,
            evaluator_schema_version,
            decision_id,
            league_ref,
            team_ref,
            season,
            week,
            recorded_at,
            evidence_cutoff_at,
            valid_until,
            entry_sha256,
            context_sha256,
            result_sha256,
            lineage_sha256,
            payload
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8::timestamptz, $9::timestamptz, $10::timestamptz,
            $11, $12, $13, $14, $15::jsonb
          )
          ON CONFLICT (entry_sha256) DO NOTHING
          RETURNING id::text AS id, entry_sha256
        `,
        [
          entry.ledgerVersion,
          entry.evaluatorSchemaVersion,
          entry.resultSnapshot.receipt.decisionId,
          entry.resultSnapshot.receipt.leagueRef,
          entry.resultSnapshot.receipt.teamRef,
          entry.resultSnapshot.receipt.season,
          entry.resultSnapshot.receipt.week,
          entry.recordedAt,
          entry.asOf.evidenceCutoffAt,
          entry.asOf.validUntil,
          entry.hashes.entrySha256,
          entry.hashes.contextSha256,
          entry.hashes.resultSha256,
          entry.hashes.lineageSha256,
          JSON.stringify(entry),
        ],
      );

      if (inserted.rows[0]) {
        return {
          status: 'inserted',
          id: inserted.rows[0].id,
          entrySha256: inserted.rows[0].entry_sha256,
        };
      }

      const existing = await getRowByHash(entry.hashes.entrySha256);
      if (!existing) {
        throw new Error('Weekly decision ledger insert conflicted but no existing receipt could be verified.');
      }
      assertPersistedRowIntegrity(existing);

      return {
        status: 'existing',
        id: existing.id,
        entrySha256: existing.entry_sha256,
      };
    },

    async getByHash(entrySha256: string): Promise<WeeklyDecisionLedgerEntryV1 | null> {
      const row = await getRowByHash(entrySha256);
      return row ? assertPersistedRowIntegrity(row) : null;
    },
  } as const;
}

export type WeeklyDecisionLedgerRepository = ReturnType<typeof createWeeklyDecisionLedgerRepository>;
