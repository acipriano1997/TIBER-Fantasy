import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Immutable contract-league snapshots.
 *
 * This table intentionally lives outside the legacy monolithic shared/schema.ts
 * so contract-league persistence can remain a bounded module. Drizzle Kit is
 * configured to include both schema files.
 *
 * A row is never updated. A materially new normalized state inserts a new row
 * and points to the previously persisted row through supersedesSnapshotId.
 * Re-importing the same normalized state is idempotent via (leagueKey,
 * fingerprint).
 */
export const contractLeagueSnapshots = pgTable("contract_league_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Internal FFCC league key. Platform/workbook identity binding is a separate
  // concern and must not be guessed here.
  leagueKey: text("league_key").notNull(),
  schemaVersion: text("schema_version").notNull(),

  // Source/import provenance. sourceRef is an opaque private reference token,
  // never a public fixture URL or committed workbook identifier.
  sourceKind: text("source_kind").notNull(),
  sourceDisplayName: text("source_display_name").notNull(),
  sourceRef: text("source_ref"),
  sourceModifiedAt: timestamp("source_modified_at", { withTimezone: true }),
  importerVersion: text("importer_version").notNull(),

  // sha256:<64 lowercase hex>. The digest is over normalized decision-relevant
  // snapshot state, excluding volatile import/provenance timestamps.
  fingerprint: varchar("fingerprint", { length: 71 }).notNull(),

  validationStatus: text("validation_status").notNull(),
  validationWarnings: jsonb("validation_warnings").$type<string[]>().notNull(),
  unresolved: jsonb("unresolved").$type<Array<{
    code: string;
    path: string;
    detail: string;
  }>>().notNull(),

  // Full validated contract-league-snapshot.v1 payload. The application-layer
  // Zod contract remains authoritative for the JSON shape.
  snapshotPayload: jsonb("snapshot_payload").notNull(),

  // Explicit append-only lineage. Kept as an opaque UUID rather than a DB FK so
  // an old snapshot can remain replayable even if archival/storage policy later
  // moves earlier rows between stores.
  supersedesSnapshotId: uuid("supersedes_snapshot_id"),

  importedAt: timestamp("imported_at", { withTimezone: true }).notNull(),
  persistedAt: timestamp("persisted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contract_league_snapshots_league_fingerprint_uq").on(
    table.leagueKey,
    table.fingerprint,
  ),
  index("contract_league_snapshots_league_persisted_idx").on(
    table.leagueKey,
    table.persistedAt,
  ),
  index("contract_league_snapshots_supersedes_idx").on(table.supersedesSnapshotId),
]);

export type ContractLeagueSnapshotRow = typeof contractLeagueSnapshots.$inferSelect;
export type InsertContractLeagueSnapshotRow = typeof contractLeagueSnapshots.$inferInsert;
