import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * Bounded migration lane for operator-private contract-league application state.
 *
 * The legacy repository migration journal predates several hand-authored
 * migrations and is not a safe baseline for generating this new table. Keep the
 * contract-league schema and its migration history isolated so Drizzle can
 * deterministically prove schema/migration parity without rewriting legacy
 * history.
 */
export default defineConfig({
  out: "./migrations/contract-leagues",
  schema: "./shared/contractLeagueSchema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
