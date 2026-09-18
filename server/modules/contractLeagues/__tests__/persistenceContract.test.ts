import {
  ContractLeaguePersistenceError,
  fingerprintContractLeagueSnapshot,
  prepareContractLeagueSnapshotRecord,
} from '../persistenceContract';
import { contractLeagueSnapshotSchema } from '../contracts';

function makeSnapshot() {
  return contractLeagueSnapshotSchema.parse({
    schemaVersion: 'contract-league-snapshot.v1',
    league: {
      sourceLeagueName: 'Synthetic Contract League',
      platform: 'manual',
      platformLeagueId: null,
      season: 2026,
      salaryCap: 250_000_000,
      scoring: null,
      lineup: [],
    },
    teams: [
      {
        sourceTeamName: 'Team B',
        contracts: [
          {
            sourcePlayerName: 'Player Two',
            canonicalPlayerId: null,
            position: 'RB',
            status: 'ACTIVE',
            totalValue: 20_000_000,
            aav: 10_000_000,
            years: [
              { season: 2027, guaranteed: 3_000_000, optional: 7_000_000, capHit: 10_000_000 },
              { season: 2026, guaranteed: 5_000_000, optional: 5_000_000, capHit: 10_000_000 },
            ],
            metadata: { notes: [] },
          },
        ],
        deadCap: [],
        cap: [
          {
            season: 2027,
            totalGuaranteed: 200_000_000,
            totalCapHit: 270_000_000,
            capAfterGuarantees: 50_000_000,
            capRemaining: -20_000_000,
          },
          {
            season: 2026,
            totalGuaranteed: 220_000_000,
            totalCapHit: 245_000_000,
            capAfterGuarantees: 30_000_000,
            capRemaining: 5_000_000,
          },
        ],
      },
      {
        sourceTeamName: 'Team A',
        contracts: [
          {
            sourcePlayerName: 'Player One',
            canonicalPlayerId: 'tbr_p_synthetic',
            position: 'WR',
            status: 'ACTIVE',
            totalValue: 12_000_000,
            aav: 6_000_000,
            years: [
              { season: 2026, guaranteed: 6_000_000, optional: 0, capHit: 6_000_000 },
            ],
            metadata: { notes: [] },
          },
        ],
        deadCap: [],
        cap: [
          {
            season: 2026,
            totalGuaranteed: 230_000_000,
            totalCapHit: 240_000_000,
            capAfterGuarantees: 20_000_000,
            capRemaining: 10_000_000,
          },
        ],
      },
    ],
    provenance: {
      sourceKind: 'manual',
      sourceDisplayName: 'Private Workbook',
      sourceLocator: null,
      sourceModifiedAt: '2026-09-15T12:00:00.000Z',
      importedAt: '2026-09-15T15:00:00.000Z',
      importerVersion: 'contract-league-importer.v1',
    },
    validation: {
      status: 'VALID',
      warnings: [],
      unresolved: [],
    },
  });
}

describe('contract league persistence contract', () => {
  it('ignores volatile provenance timestamps and source labels in the state fingerprint', () => {
    const first = makeSnapshot();
    const second = structuredClone(first);
    second.provenance.importedAt = '2026-09-15T16:00:00.000Z';
    second.provenance.sourceModifiedAt = '2026-09-15T15:59:00.000Z';
    second.provenance.sourceDisplayName = 'Renamed Private Workbook';
    second.provenance.sourceLocator = 'opaque-different-location';

    expect(fingerprintContractLeagueSnapshot(second)).toBe(
      fingerprintContractLeagueSnapshot(first),
    );
  });

  it('normalizes source ordering before fingerprinting', () => {
    const first = makeSnapshot();
    const reordered = structuredClone(first);
    reordered.teams.reverse();
    reordered.teams[0].cap.reverse();
    reordered.teams[1].contracts[0].years.reverse();

    expect(fingerprintContractLeagueSnapshot(reordered)).toBe(
      fingerprintContractLeagueSnapshot(first),
    );
  });

  it('changes the fingerprint when decision-relevant contract state changes', () => {
    const first = makeSnapshot();
    const changed = structuredClone(first);
    changed.teams[0].cap[0].capRemaining -= 1;

    expect(fingerprintContractLeagueSnapshot(changed)).not.toBe(
      fingerprintContractLeagueSnapshot(first),
    );
  });

  it('prepares explicit persistence provenance without guessing league identity', () => {
    const prepared = prepareContractLeagueSnapshotRecord(makeSnapshot(), {
      leagueKey: ' contract-league-alpha ',
      sourceRef: ' private-source-token ',
    });

    expect(prepared.leagueKey).toBe('contract-league-alpha');
    expect(prepared.sourceRef).toBe('private-source-token');
    expect(prepared.validationStatus).toBe('VALID');
    expect(prepared.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(prepared.importedAt.toISOString()).toBe('2026-09-15T15:00:00.000Z');
  });

  it('refuses to persist rejected snapshots as decision state', () => {
    const rejected = makeSnapshot();
    rejected.validation.status = 'REJECTED';

    expect(() => prepareContractLeagueSnapshotRecord(rejected, {
      leagueKey: 'contract-league-alpha',
    })).toThrow(ContractLeaguePersistenceError);
  });
});
