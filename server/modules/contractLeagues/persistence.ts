import { and, desc, eq } from 'drizzle-orm';
import {
  contractLeagueSnapshots,
  type ContractLeagueSnapshotRow,
} from '@shared/contractLeagueSchema';
import { db } from '../../infra/db';
import {
  prepareContractLeagueSnapshotRecord,
  type PrepareContractLeagueSnapshotOptions,
} from './persistenceContract';

export type PersistContractLeagueSnapshotResult = {
  row: ContractLeagueSnapshotRow;
  created: boolean;
};

/**
 * Append-only persistence for validated/partial contract-league snapshots.
 *
 * There is deliberately no update path. Identical normalized state resolves to
 * the existing row; materially changed state inserts a new row and links to the
 * previous row through supersedesSnapshotId.
 */
export async function persistContractLeagueSnapshot(
  input: unknown,
  options: PrepareContractLeagueSnapshotOptions,
): Promise<PersistContractLeagueSnapshotResult> {
  const prepared = prepareContractLeagueSnapshotRecord(input, options);

  const existing = await db
    .select()
    .from(contractLeagueSnapshots)
    .where(and(
      eq(contractLeagueSnapshots.leagueKey, prepared.leagueKey),
      eq(contractLeagueSnapshots.fingerprint, prepared.fingerprint),
    ))
    .limit(1);

  if (existing[0]) {
    return { row: existing[0], created: false };
  }

  const latest = await db
    .select({ id: contractLeagueSnapshots.id })
    .from(contractLeagueSnapshots)
    .where(eq(contractLeagueSnapshots.leagueKey, prepared.leagueKey))
    .orderBy(desc(contractLeagueSnapshots.persistedAt))
    .limit(1);

  const inserted = await db
    .insert(contractLeagueSnapshots)
    .values({
      ...prepared,
      supersedesSnapshotId: latest[0]?.id ?? null,
    })
    .onConflictDoNothing({
      target: [contractLeagueSnapshots.leagueKey, contractLeagueSnapshots.fingerprint],
    })
    .returning();

  if (inserted[0]) {
    return { row: inserted[0], created: true };
  }

  // Concurrent identical import: the unique constraint wins and we resolve the
  // already-created immutable row rather than manufacturing a second version.
  const raced = await db
    .select()
    .from(contractLeagueSnapshots)
    .where(and(
      eq(contractLeagueSnapshots.leagueKey, prepared.leagueKey),
      eq(contractLeagueSnapshots.fingerprint, prepared.fingerprint),
    ))
    .limit(1);

  if (!raced[0]) {
    throw new Error('Contract snapshot insert lost a conflict race without a persisted row.');
  }

  return { row: raced[0], created: false };
}

export async function getContractLeagueSnapshotById(
  id: string,
): Promise<ContractLeagueSnapshotRow | null> {
  const rows = await db
    .select()
    .from(contractLeagueSnapshots)
    .where(eq(contractLeagueSnapshots.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestContractLeagueSnapshot(
  leagueKey: string,
): Promise<ContractLeagueSnapshotRow | null> {
  const rows = await db
    .select()
    .from(contractLeagueSnapshots)
    .where(eq(contractLeagueSnapshots.leagueKey, leagueKey))
    .orderBy(desc(contractLeagueSnapshots.persistedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Decision paths should default to VALID snapshots. PARTIAL snapshots remain
 * replayable/auditable but cannot silently become recommendation authority.
 */
export async function getLatestDecisionEligibleContractLeagueSnapshot(
  leagueKey: string,
): Promise<ContractLeagueSnapshotRow | null> {
  const rows = await db
    .select()
    .from(contractLeagueSnapshots)
    .where(and(
      eq(contractLeagueSnapshots.leagueKey, leagueKey),
      eq(contractLeagueSnapshots.validationStatus, 'VALID'),
    ))
    .orderBy(desc(contractLeagueSnapshots.persistedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContractLeagueSnapshots(
  leagueKey: string,
  limit = 50,
): Promise<ContractLeagueSnapshotRow[]> {
  const boundedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  return db
    .select()
    .from(contractLeagueSnapshots)
    .where(eq(contractLeagueSnapshots.leagueKey, leagueKey))
    .orderBy(desc(contractLeagueSnapshots.persistedAt))
    .limit(boundedLimit);
}
