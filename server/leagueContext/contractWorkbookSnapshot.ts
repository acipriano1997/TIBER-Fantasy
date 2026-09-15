import {
  resolveContractLeagueRuleProfile,
  type ContractLeagueRuleProfile,
} from '../leagueRules/contractLeagueRegistry';
import { evaluateSourceHealth, type LeagueSourceHealth } from './sourceHealth';

export type ContractMoney = number | null;

export type ContractPlayerRowV1 = {
  playerId?: string | null;
  playerName: string;
  position?: string | null;
  teamId?: string | null;
  contractStartSeason?: number | null;
  contractEndSeason?: number | null;
  annualSalary?: ContractMoney;
  aav?: ContractMoney;
  guaranteedMoney?: ContractMoney;
  optionalMoney?: ContractMoney;
  deadCap?: ContractMoney;
  notes?: string[];
};

export type ContractTeamLedgerV1 = {
  teamId?: string | null;
  teamName: string;
  capCommitted?: ContractMoney;
  capSpace?: ContractMoney;
  deadCap?: ContractMoney;
  players: ContractPlayerRowV1[];
};

export type ContractWorkbookSnapshotV1 = {
  schemaVersion: 'contract-workbook-snapshot.v1';
  profileId: ContractLeagueRuleProfile['id'];
  leagueName: string;
  workbookId: string;
  season: number;
  salaryCap: number;
  asOf: string;
  sourceHealth: LeagueSourceHealth;
  teams: ContractTeamLedgerV1[];
  reSignAavByPositionAndFinishBucket?: Record<string, Record<string, number>>;
  franchiseTagAav?: Record<string, number>;
  validationIssues: string[];
  completeForDecisionUse: boolean;
};

export type CreateContractWorkbookSnapshotInput = {
  leagueName: string;
  workbookId: string;
  season: number;
  salaryCap: number;
  asOf: string | Date;
  checkedAt?: string | Date;
  maxAgeMs?: number | null;
  teams?: ContractTeamLedgerV1[];
  reSignAavByPositionAndFinishBucket?: Record<string, Record<string, number>>;
  franchiseTagAav?: Record<string, number>;
  validationIssues?: string[];
};

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

export function createContractWorkbookSnapshot(
  input: CreateContractWorkbookSnapshotInput,
): ContractWorkbookSnapshotV1 {
  const profile = resolveContractLeagueRuleProfile({
    leagueName: input.leagueName,
    workbookId: input.workbookId,
  });

  if (!profile) {
    throw new Error(
      `No contract league profile resolves league=${input.leagueName} workbook=${input.workbookId}.`,
    );
  }

  assertNonNegativeFinite(input.salaryCap, 'salaryCap');
  if (!Number.isInteger(input.season) || input.season < 2000) {
    throw new Error('season must be a valid four-digit season.');
  }

  const expectedWorkbookId = profile.sourceFiles.operationalWorkbook.driveFileId;
  if (input.workbookId !== expectedWorkbookId) {
    throw new Error(
      `${profile.leagueName} must use workbook ${expectedWorkbookId}; received ${input.workbookId}.`,
    );
  }

  const validationIssues = [...(input.validationIssues ?? [])];
  if (input.salaryCap !== profile.verifiedCore.salaryCap) {
    validationIssues.push(
      `Workbook salary cap ${input.salaryCap} differs from verified profile cap ${profile.verifiedCore.salaryCap}.`,
    );
  }

  const sourceHealth = evaluateSourceHealth({
    asOf: input.asOf,
    checkedAt: input.checkedAt,
    maxAgeMs: input.maxAgeMs ?? null,
    available: true,
  });

  const completeForDecisionUse = sourceHealth.status === 'healthy' && validationIssues.length === 0;

  return {
    schemaVersion: 'contract-workbook-snapshot.v1',
    profileId: profile.id,
    leagueName: profile.leagueName,
    workbookId: input.workbookId,
    season: input.season,
    salaryCap: input.salaryCap,
    asOf: sourceHealth.asOf!,
    sourceHealth,
    teams: [...(input.teams ?? [])],
    reSignAavByPositionAndFinishBucket: input.reSignAavByPositionAndFinishBucket,
    franchiseTagAav: input.franchiseTagAav,
    validationIssues,
    completeForDecisionUse,
  };
}

export function assertContractSnapshotUsable(
  snapshot: ContractWorkbookSnapshotV1 | null | undefined,
): asserts snapshot is ContractWorkbookSnapshotV1 {
  if (!snapshot) {
    throw new Error('Fresh contract workbook snapshot is required; static registry values are not live decision data.');
  }
  if (!snapshot.completeForDecisionUse || snapshot.sourceHealth.status !== 'healthy') {
    const detail = snapshot.validationIssues.length
      ? snapshot.validationIssues.join(' ')
      : snapshot.sourceHealth.reason ?? snapshot.sourceHealth.status;
    throw new Error(`Contract workbook snapshot is not decision-ready; abstain. ${detail}`);
  }
}
