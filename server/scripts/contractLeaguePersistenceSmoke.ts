import assert from 'node:assert/strict';
import { dbPool } from '../infra/db';
import {
  getLatestContractLeagueSnapshot,
  getLatestDecisionEligibleContractLeagueSnapshot,
  listContractLeagueSnapshots,
  persistContractLeagueSnapshot,
} from '../modules/contractLeagues/persistence';

const leagueKey = `ci-contract-${Date.now()}`;

function snapshot(capRemaining: number) {
  return {
    schemaVersion: 'contract-league-snapshot.v1' as const,
    league: {
      sourceLeagueName: 'Synthetic Contract League',
      platform: 'manual' as const,
      platformLeagueId: null,
      season: 2026,
      salaryCap: 250,
      scoring: null,
      lineup: [],
    },
    teams: [{
      sourceTeamName: 'Synthetic Team',
      contracts: [],
      deadCap: [],
      cap: [{
        season: 2026,
        totalGuaranteed: 100,
        totalCapHit: 125,
        capAfterGuarantees: 150,
        capRemaining,
      }],
    }],
    provenance: {
      sourceKind: 'manual' as const,
      sourceDisplayName: 'Synthetic CI source',
      sourceLocator: null,
      sourceModifiedAt: '2026-09-16T10:00:00.000Z',
      importedAt: '2026-09-16T10:05:00.000Z',
      importerVersion: 'ci-contract-smoke.v1',
    },
    validation: {
      status: 'VALID' as const,
      warnings: [],
      unresolved: [],
    },
  };
}

async function main() {
  try {
    const first = await persistContractLeagueSnapshot(snapshot(125), {
      leagueKey,
      sourceRef: 'opaque:ci-source',
    });
    assert.equal(first.created, true);

    const duplicate = await persistContractLeagueSnapshot(snapshot(125), {
      leagueKey,
      sourceRef: 'opaque:ci-source',
    });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.row.id, first.row.id);

    const second = await persistContractLeagueSnapshot(snapshot(120), {
      leagueKey,
      sourceRef: 'opaque:ci-source',
    });
    assert.equal(second.created, true);
    assert.equal(second.row.supersedesSnapshotId, first.row.id);

    const latest = await getLatestContractLeagueSnapshot(leagueKey);
    assert.equal(latest?.id, second.row.id);

    const eligible = await getLatestDecisionEligibleContractLeagueSnapshot(leagueKey);
    assert.equal(eligible?.id, second.row.id);

    const history = await listContractLeagueSnapshots(leagueKey);
    assert.equal(history.length, 2);
    assert.equal(history[0].id, second.row.id);
    assert.equal(history[1].id, first.row.id);

    console.log('Contract-league PostgreSQL persistence smoke passed.', {
      leagueKey,
      firstSnapshotId: first.row.id,
      secondSnapshotId: second.row.id,
    });
  } finally {
    await dbPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
