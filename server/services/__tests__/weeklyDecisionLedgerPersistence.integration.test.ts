import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createWeeklyDecisionLedgerEntry } from '../weeklyDecisionLedger';
import { createWeeklyDecisionLedgerRepository } from '../weeklyDecisionLedgerRepository';
import type { WeeklyDecisionContext } from '../../../shared/weeklyDecisionContract';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integrationTest = TEST_DATABASE_URL ? test : test.skip;

function context(): WeeklyDecisionContext {
  return {
    decisionId: 'gate2-persistence-decision-1',
    season: 2026,
    week: 1,
    evidenceCutoffAt: '2026-09-07T16:00:00.000Z',
    validUntil: '2026-09-07T23:00:00.000Z',
    leagueRef: 'league-gate2',
    teamRef: 'team-gate2',
    scoringProfileRef: 'league:ppr:hash-gate2',
    scoringProfileHash: 'hash-gate2',
    rosterSnapshotRef: 'roster-gate2',
    rosterSnapshotHash: 'roster-hash-gate2',
    lineupAHash: 'lineup-a-gate2',
    lineupBHash: 'lineup-b-gate2',
    samePositionLegalSwap: true,
    locked: false,
    operatorPosture: 'unset',
    candidateA: {
      playerId: 'player-a',
      playerName: 'Player A',
      position: 'WR',
      identityStatus: 'canonical',
      observedStarter: true,
      tailOutlook: null,
    },
    candidateB: {
      playerId: 'player-b',
      playerName: 'Player B',
      position: 'WR',
      identityStatus: 'canonical',
      observedStarter: false,
      tailOutlook: null,
    },
  };
}

async function expectAppendOnlyRejection(pool: Pool, sql: string): Promise<void> {
  try {
    await pool.query(sql);
    throw new Error(`Expected append-only database rejection for SQL: ${sql}`);
  } catch (error) {
    const databaseError = error as { code?: string; message?: string };
    expect(databaseError.code).toBe('55000');
    expect(databaseError.message).toContain('weekly_decision_ledger_entries is append-only');
  }
}

describe('Weekly Decision Gate 2 append-only Postgres persistence', () => {
  let pool: Pool | null = null;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query('DROP TABLE IF EXISTS weekly_decision_ledger_entries CASCADE');
    await pool.query('DROP FUNCTION IF EXISTS reject_weekly_decision_ledger_mutation() CASCADE');
    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'migrations/0016_weekly_decision_ledger_append_only.sql'),
      'utf8',
    );
    await pool.query(migration);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DROP TABLE IF EXISTS weekly_decision_ledger_entries CASCADE');
    await pool.query('DROP FUNCTION IF EXISTS reject_weekly_decision_ledger_mutation() CASCADE');
    await pool.end();
  });

  integrationTest('appends a verified frozen receipt and treats the same content hash as an idempotent retry', async () => {
    const repository = createWeeklyDecisionLedgerRepository(pool!);
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:10:00.000Z');

    const first = await repository.append(entry);
    const second = await repository.append(entry);

    expect(first.status).toBe('inserted');
    expect(second.status).toBe('existing');
    expect(second.id).toBe(first.id);
    expect(second.entrySha256).toBe(first.entrySha256);

    const count = await pool!.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM weekly_decision_ledger_entries',
    );
    expect(count.rows[0]?.count).toBe('1');

    const restored = await repository.getByHash(entry.hashes.entrySha256);
    expect(restored).toEqual(entry);
  });

  integrationTest('rejects tampered content before it reaches durable storage', async () => {
    const repository = createWeeklyDecisionLedgerRepository(pool!);
    const entry = createWeeklyDecisionLedgerEntry(context(), '2026-09-07T16:11:00.000Z');
    const tampered = JSON.parse(JSON.stringify(entry));
    tampered.contextSnapshot.teamRef = 'wrong-team';

    await expect(repository.append(tampered)).rejects.toThrow('replay verification failed');

    const stored = await repository.getByHash(entry.hashes.entrySha256);
    expect(stored).toBeNull();
  });

  integrationTest('database triggers reject UPDATE, DELETE, and TRUNCATE even for the table owner', async () => {
    const repository = createWeeklyDecisionLedgerRepository(pool!);
    const entry = createWeeklyDecisionLedgerEntry(
      { ...context(), decisionId: 'gate2-persistence-decision-mutation' },
      '2026-09-07T16:12:00.000Z',
    );
    await repository.append(entry);

    await expectAppendOnlyRejection(
      pool!,
      `UPDATE weekly_decision_ledger_entries SET team_ref = 'mutated' WHERE entry_sha256 = '${entry.hashes.entrySha256}'`,
    );
    await expectAppendOnlyRejection(
      pool!,
      `DELETE FROM weekly_decision_ledger_entries WHERE entry_sha256 = '${entry.hashes.entrySha256}'`,
    );
    await expectAppendOnlyRejection(pool!, 'TRUNCATE TABLE weekly_decision_ledger_entries');

    const restored = await repository.getByHash(entry.hashes.entrySha256);
    expect(restored).toEqual(entry);
  });

  integrationTest('database hash constraints reject malformed content identities', async () => {
    await expect(
      pool!.query(
        `
          INSERT INTO weekly_decision_ledger_entries (
            ledger_version, evaluator_schema_version, decision_id, league_ref, team_ref,
            season, week, recorded_at, evidence_cutoff_at, entry_sha256,
            context_sha256, result_sha256, lineage_sha256, payload
          ) VALUES (
            'weekly_decision_ledger_entry_v1', 'weekly_lineup_decision_packet_v1',
            'bad-hash', 'league', 'team', 2026, 1, now(), now(),
            'NOT_A_SHA', repeat('a', 64), repeat('b', 64), repeat('c', 64), '{}'::jsonb
          )
        `,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
