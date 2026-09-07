CREATE TABLE IF NOT EXISTS "weekly_decision_ledger_entries" (
  "id" bigserial PRIMARY KEY,
  "ledger_version" text NOT NULL,
  "evaluator_schema_version" text NOT NULL,
  "decision_id" text NOT NULL,
  "league_ref" text NOT NULL,
  "team_ref" text NOT NULL,
  "season" integer NOT NULL,
  "week" integer NOT NULL,
  "recorded_at" timestamptz NOT NULL,
  "evidence_cutoff_at" timestamptz NOT NULL,
  "valid_until" timestamptz,
  "entry_sha256" varchar(64) NOT NULL,
  "context_sha256" varchar(64) NOT NULL,
  "result_sha256" varchar(64) NOT NULL,
  "lineage_sha256" varchar(64) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "weekly_decision_ledger_entry_hash_unique" UNIQUE ("entry_sha256"),
  CONSTRAINT "weekly_decision_ledger_entry_hash_format" CHECK ("entry_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "weekly_decision_ledger_context_hash_format" CHECK ("context_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "weekly_decision_ledger_result_hash_format" CHECK ("result_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "weekly_decision_ledger_lineage_hash_format" CHECK ("lineage_sha256" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS "weekly_decision_ledger_decision_idx"
  ON "weekly_decision_ledger_entries" ("decision_id");

CREATE INDEX IF NOT EXISTS "weekly_decision_ledger_context_idx"
  ON "weekly_decision_ledger_entries" ("league_ref", "team_ref", "season", "week");

CREATE INDEX IF NOT EXISTS "weekly_decision_ledger_created_at_idx"
  ON "weekly_decision_ledger_entries" ("created_at");

CREATE OR REPLACE FUNCTION reject_weekly_decision_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'weekly_decision_ledger_entries is append-only: % is prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS weekly_decision_ledger_reject_row_mutation
  ON "weekly_decision_ledger_entries";
CREATE TRIGGER weekly_decision_ledger_reject_row_mutation
  BEFORE UPDATE OR DELETE ON "weekly_decision_ledger_entries"
  FOR EACH ROW
  EXECUTE FUNCTION reject_weekly_decision_ledger_mutation();
ALTER TABLE "weekly_decision_ledger_entries"
  ENABLE ALWAYS TRIGGER weekly_decision_ledger_reject_row_mutation;

DROP TRIGGER IF EXISTS weekly_decision_ledger_reject_truncate
  ON "weekly_decision_ledger_entries";
CREATE TRIGGER weekly_decision_ledger_reject_truncate
  BEFORE TRUNCATE ON "weekly_decision_ledger_entries"
  FOR EACH STATEMENT
  EXECUTE FUNCTION reject_weekly_decision_ledger_mutation();
ALTER TABLE "weekly_decision_ledger_entries"
  ENABLE ALWAYS TRIGGER weekly_decision_ledger_reject_truncate;

REVOKE UPDATE, DELETE, TRUNCATE ON "weekly_decision_ledger_entries" FROM PUBLIC;
