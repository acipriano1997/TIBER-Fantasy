import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import type { WeeklyDecisionLedgerEntryV1 } from './weeklyDecisionLedger';

/**
 * Server-local schema for the append-only decision ledger.
 *
 * The canonical DDL lives in migration 0016. Keeping this small table module
 * local avoids widening the already-large shared schema for a server-only
 * verification primitive while still giving the repository typed Drizzle IO.
 */
export const weeklyDecisionLedgerEntries = pgTable(
  'weekly_decision_ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ledgerVersion: text('ledger_version').notNull(),
    evaluatorSchemaVersion: text('evaluator_schema_version').notNull(),
    decisionId: text('decision_id').notNull(),
    leagueRef: text('league_ref').notNull(),
    teamRef: text('team_ref').notNull(),
    season: integer('season').notNull(),
    week: integer('week').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    evidenceCutoffAt: timestamp('evidence_cutoff_at', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    entrySha256: varchar('entry_sha256', { length: 64 }).notNull(),
    contextSha256: varchar('context_sha256', { length: 64 }).notNull(),
    resultSha256: varchar('result_sha256', { length: 64 }).notNull(),
    lineageSha256: varchar('lineage_sha256', { length: 64 }).notNull(),
    payload: jsonb('payload').$type<WeeklyDecisionLedgerEntryV1>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('weekly_decision_ledger_entry_hash_unique').on(table.entrySha256),
    index('weekly_decision_ledger_decision_idx').on(table.decisionId),
    index('weekly_decision_ledger_context_idx').on(
      table.leagueRef,
      table.teamRef,
      table.season,
      table.week,
    ),
    index('weekly_decision_ledger_created_at_idx').on(table.createdAt),
  ],
);

export type WeeklyDecisionLedgerRow = typeof weeklyDecisionLedgerEntries.$inferSelect;
