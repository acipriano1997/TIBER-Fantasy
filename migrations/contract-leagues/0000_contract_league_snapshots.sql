CREATE TABLE "contract_league_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_key" text NOT NULL,
	"schema_version" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_display_name" text NOT NULL,
	"source_ref" text,
	"source_modified_at" timestamp with time zone,
	"importer_version" text NOT NULL,
	"fingerprint" varchar(71) NOT NULL,
	"validation_status" text NOT NULL,
	"validation_warnings" jsonb NOT NULL,
	"unresolved" jsonb NOT NULL,
	"snapshot_payload" jsonb NOT NULL,
	"supersedes_snapshot_id" uuid,
	"imported_at" timestamp with time zone NOT NULL,
	"persisted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_league_snapshots_league_fingerprint_uq" ON "contract_league_snapshots" USING btree ("league_key","fingerprint");--> statement-breakpoint
CREATE INDEX "contract_league_snapshots_league_persisted_idx" ON "contract_league_snapshots" USING btree ("league_key","persisted_at");--> statement-breakpoint
CREATE INDEX "contract_league_snapshots_supersedes_idx" ON "contract_league_snapshots" USING btree ("supersedes_snapshot_id");