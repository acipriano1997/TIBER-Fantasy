import { createHash } from 'node:crypto';
import stableStringify from 'json-stable-stringify';
import {
  contractLeagueSnapshotSchema,
  type ContractLeagueSnapshot,
} from './contracts';

export const CONTRACT_LEAGUE_PERSISTENCE_VERSION = 'contract-league-persistence.v1';

export class ContractLeaguePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractLeaguePersistenceError';
  }
}

export type PreparedContractLeagueSnapshotRecord = {
  leagueKey: string;
  schemaVersion: ContractLeagueSnapshot['schemaVersion'];
  sourceKind: ContractLeagueSnapshot['provenance']['sourceKind'];
  sourceDisplayName: string;
  sourceRef: string | null;
  sourceModifiedAt: Date | null;
  importerVersion: string;
  fingerprint: string;
  validationStatus: ContractLeagueSnapshot['validation']['status'];
  validationWarnings: string[];
  unresolved: ContractLeagueSnapshot['validation']['unresolved'];
  snapshotPayload: ContractLeagueSnapshot;
  importedAt: Date;
};

export type PrepareContractLeagueSnapshotOptions = {
  /** Internal FFCC league key; never guessed from a workbook label. */
  leagueKey: string;
  /** Optional opaque private source reference. Do not use a public/raw Drive URL. */
  sourceRef?: string | null;
};

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? '').localeCompare(b ?? '');
}

/**
 * Produces a deterministic logical-state representation for hashing.
 *
 * Volatile provenance timestamps/locators are intentionally excluded so an
 * unchanged workbook/API state does not mint a new snapshot merely because it
 * was imported again. Team/contract/cap arrays are sorted because source row or
 * sheet ordering is not decision-relevant state.
 */
export function canonicalizeContractLeagueSnapshot(
  snapshot: ContractLeagueSnapshot,
) {
  const teams = snapshot.teams
    .map((team) => ({
      ...team,
      contracts: [...team.contracts]
        .map((contract) => ({
          ...contract,
          years: [...contract.years].sort((a, b) => a.season - b.season),
        }))
        .sort((a, b) =>
          compareText(a.canonicalPlayerId ?? a.sourcePlayerName, b.canonicalPlayerId ?? b.sourcePlayerName),
        ),
      deadCap: [...team.deadCap]
        .map((entry) => ({
          ...entry,
          years: [...entry.years].sort((a, b) => a.season - b.season),
        }))
        .sort((a, b) =>
          compareText(a.canonicalPlayerId ?? a.sourcePlayerName, b.canonicalPlayerId ?? b.sourcePlayerName),
        ),
      cap: [...team.cap].sort((a, b) => a.season - b.season),
    }))
    .sort((a, b) => compareText(a.sourceTeamName, b.sourceTeamName));

  return {
    schemaVersion: snapshot.schemaVersion,
    league: snapshot.league,
    teams,
    validation: snapshot.validation,
  };
}

export function fingerprintContractLeagueSnapshot(
  snapshot: ContractLeagueSnapshot,
): string {
  const canonical = stableStringify(canonicalizeContractLeagueSnapshot(snapshot));
  if (!canonical) {
    throw new ContractLeaguePersistenceError('Unable to canonicalize contract league snapshot.');
  }
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function prepareContractLeagueSnapshotRecord(
  input: unknown,
  options: PrepareContractLeagueSnapshotOptions,
): PreparedContractLeagueSnapshotRecord {
  const leagueKey = options.leagueKey.trim();
  if (!leagueKey) {
    throw new ContractLeaguePersistenceError('leagueKey is required for contract snapshot persistence.');
  }

  const snapshot = contractLeagueSnapshotSchema.parse(input);
  if (snapshot.validation.status === 'REJECTED') {
    throw new ContractLeaguePersistenceError(
      'Rejected contract league snapshots cannot become persisted decision state.',
    );
  }

  return {
    leagueKey,
    schemaVersion: snapshot.schemaVersion,
    sourceKind: snapshot.provenance.sourceKind,
    sourceDisplayName: snapshot.provenance.sourceDisplayName,
    sourceRef: options.sourceRef?.trim() || null,
    sourceModifiedAt: snapshot.provenance.sourceModifiedAt
      ? new Date(snapshot.provenance.sourceModifiedAt)
      : null,
    importerVersion: snapshot.provenance.importerVersion,
    fingerprint: fingerprintContractLeagueSnapshot(snapshot),
    validationStatus: snapshot.validation.status,
    validationWarnings: [...snapshot.validation.warnings],
    unresolved: snapshot.validation.unresolved.map((item) => ({ ...item })),
    snapshotPayload: snapshot,
    importedAt: new Date(snapshot.provenance.importedAt),
  };
}
