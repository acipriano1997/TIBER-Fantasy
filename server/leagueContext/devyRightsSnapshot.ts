import {
  getDevyRightsSource,
  normalizeManagerHandle,
} from '../devy/leagueSourceRegistry';
import { evaluateSourceHealth, type LeagueSourceHealth } from './sourceHealth';

export type DevyProspectRightV1 = {
  playerName: string;
  school: string | null;
  classYear?: number | null;
  position?: string | null;
  externalPlayerId?: string | null;
  identityStatus?: 'resolved' | 'unresolved';
};

export type DevyRightsSnapshotV1 = {
  schemaVersion: 'devy-rights-snapshot.v1';
  leagueId: string;
  sourceId: string;
  spreadsheetId: string;
  sheetName: string;
  ownerHandle: string;
  asOf: string;
  sourceHealth: LeagueSourceHealth;
  extractionComplete: boolean;
  rights: DevyProspectRightV1[];
  validationIssues: string[];
  completeForDecisionUse: boolean;
  invariants: {
    ownershipOnly: true;
    neverPromoteToPlatformNflRoster: true;
    preserveUnresolvedIdentities: true;
  };
};

export type CreateDevyRightsSnapshotInput = {
  leagueId: string;
  spreadsheetId: string;
  sheetName: string;
  ownerHandle: string;
  asOf: string | Date;
  checkedAt?: string | Date;
  maxAgeMs?: number | null;
  extractionComplete: boolean;
  rights: DevyProspectRightV1[];
  validationIssues?: string[];
};

export async function createDevyRightsSnapshot(
  input: CreateDevyRightsSnapshotInput,
): Promise<DevyRightsSnapshotV1> {
  const source = await getDevyRightsSource(input.leagueId);
  if (!source) {
    throw new Error(`No Devy rights source is linked to Sleeper league ${input.leagueId}.`);
  }
  if (source.spreadsheetId !== input.spreadsheetId || source.sheetName !== input.sheetName) {
    throw new Error(
      `Devy source identity mismatch for league ${input.leagueId}; expected ${source.spreadsheetId}:${source.sheetName}.`,
    );
  }
  if (normalizeManagerHandle(source.ownerSelector.value) !== normalizeManagerHandle(input.ownerHandle)) {
    throw new Error(
      `Devy owner mismatch; expected ${source.ownerSelector.value}, received ${input.ownerHandle}.`,
    );
  }

  const validationIssues = [...(input.validationIssues ?? [])];
  if (!input.extractionComplete) {
    validationIssues.push('Devy rights extraction is not complete for the linked owner column.');
  }
  input.rights.forEach((right, index) => {
    if (!right.playerName.trim()) {
      validationIssues.push(`Devy right row ${index + 1} has no player name.`);
    }
  });

  const sourceHealth = evaluateSourceHealth({
    asOf: input.asOf,
    checkedAt: input.checkedAt,
    maxAgeMs: input.maxAgeMs ?? null,
    available: true,
  });

  return {
    schemaVersion: 'devy-rights-snapshot.v1',
    leagueId: input.leagueId,
    sourceId: source.sourceId,
    spreadsheetId: source.spreadsheetId,
    sheetName: source.sheetName,
    ownerHandle: normalizeManagerHandle(input.ownerHandle),
    asOf: sourceHealth.asOf!,
    sourceHealth,
    extractionComplete: input.extractionComplete,
    rights: input.rights.map((right) => ({
      ...right,
      playerName: right.playerName.trim(),
      school: right.school?.trim() || null,
      identityStatus: right.identityStatus ?? (right.externalPlayerId ? 'resolved' : 'unresolved'),
    })),
    validationIssues,
    completeForDecisionUse:
      sourceHealth.status === 'healthy' && input.extractionComplete && validationIssues.length === 0,
    invariants: {
      ownershipOnly: true,
      neverPromoteToPlatformNflRoster: true,
      preserveUnresolvedIdentities: true,
    },
  };
}

export function assertDevyRightsSnapshotUsable(
  snapshot: DevyRightsSnapshotV1 | null | undefined,
): asserts snapshot is DevyRightsSnapshotV1 {
  if (!snapshot) {
    throw new Error('Fresh Devy rights snapshot is required; the registry link alone is not ownership data.');
  }
  if (!snapshot.completeForDecisionUse || snapshot.sourceHealth.status !== 'healthy') {
    const detail = snapshot.validationIssues.length
      ? snapshot.validationIssues.join(' ')
      : snapshot.sourceHealth.reason ?? snapshot.sourceHealth.status;
    throw new Error(`Devy rights snapshot is not decision-ready; abstain. ${detail}`);
  }
}
