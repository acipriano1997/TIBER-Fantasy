import { getDevyRightsSource, type SupplementalLeagueSource } from '../devy/leagueSourceRegistry';
import {
  assertContractRuleUsable,
  resolveContractLeagueRuleProfile,
  type ContractLeagueRuleProfile,
} from '../leagueRules/contractLeagueRegistry';
import {
  assertContractSnapshotUsable,
  type ContractWorkbookSnapshotV1,
} from './contractWorkbookSnapshot';
import {
  assertDevyRightsSnapshotUsable,
  type DevyRightsSnapshotV1,
} from './devyRightsSnapshot';
import {
  assertScoringCertified,
  certifyScoringSettings,
  type ScoringCertification,
} from './scoringCertification';
import { evaluateSourceHealth, type LeagueSourceHealth } from './sourceHealth';

export type SupportedLeaguePlatform = 'espn' | 'yahoo' | 'nfl' | 'sleeper' | 'mysportsfeeds' | string;
export type LeagueCapability = 'platform_roster' | 'platform_scoring' | 'devy_rights' | 'contracts';
export type LeagueDecisionType = 'lineup' | 'waiver' | 'trade' | 'contract' | 'devy_rights';

export type LeagueContextIssue = {
  code: string;
  severity: 'warning' | 'blocking';
  message: string;
  source?: string;
};

export type LeagueContextSource = {
  sourceId: string;
  role: 'platform' | 'scoring' | 'devy_rights' | 'contract_workbook';
  authority: string;
  health: LeagueSourceHealth;
};

export type UnifiedLeagueContextV1 = {
  schemaVersion: 'unified-league-context.v1';
  identity: {
    platform: SupportedLeaguePlatform;
    leagueId: string;
    leagueName: string;
    season: number;
  };
  builtAt: string;
  capabilities: LeagueCapability[];
  scoring: ScoringCertification;
  rosterPositions: string[];
  contractProfile: ContractLeagueRuleProfile | null;
  contractWorkbookSnapshot: ContractWorkbookSnapshotV1 | null;
  devyRightsSource: SupplementalLeagueSource | null;
  devyRightsSnapshot: DevyRightsSnapshotV1 | null;
  sources: LeagueContextSource[];
  issues: LeagueContextIssue[];
  invariants: {
    noSilentScoringDefaults: true;
    noCrossLeagueContractRuleInheritance: true;
    collegeProspectsNeverBecomePlatformNflRosterPlayers: true;
    liveContractDecisionsRequireFreshWorkbookSnapshot: true;
    devyOwnershipDecisionsRequireFreshRightsSnapshot: true;
  };
};

export type BuildUnifiedLeagueContextInput = {
  platform: SupportedLeaguePlatform;
  leagueId: string;
  leagueName: string;
  season: number;
  rawScoringSettings?: Record<string, number> | null;
  scoringAsOf?: string | Date | null;
  scoringMaxAgeMs?: number | null;
  requiredScoringKeys?: readonly string[];
  rosterPositions?: string[];
  contractWorkbookSnapshot?: ContractWorkbookSnapshotV1 | null;
  devyRightsSnapshot?: DevyRightsSnapshotV1 | null;
  builtAt?: string | Date;
};

const DEFAULT_SCORING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function toIso(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid league context timestamp: ${String(value)}`);
  return parsed.toISOString();
}

export async function buildUnifiedLeagueContextV1(
  input: BuildUnifiedLeagueContextInput,
): Promise<UnifiedLeagueContextV1> {
  const builtAt = toIso(input.builtAt ?? new Date());
  const scoring = certifyScoringSettings({
    platform: input.platform,
    leagueId: input.leagueId,
    rawSettings: input.rawScoringSettings,
    asOf: input.scoringAsOf,
    checkedAt: builtAt,
    maxAgeMs: input.scoringMaxAgeMs === undefined ? DEFAULT_SCORING_MAX_AGE_MS : input.scoringMaxAgeMs,
    requiredKeys: input.requiredScoringKeys,
  });

  const devyRightsSource = input.platform === 'sleeper'
    ? await getDevyRightsSource(input.leagueId)
    : null;

  if (input.devyRightsSnapshot) {
    if (!devyRightsSource) {
      throw new Error(
        `Devy rights snapshot supplied for league ${input.leagueId}, but no Devy source is linked.`,
      );
    }
    if (
      input.devyRightsSnapshot.leagueId !== input.leagueId ||
      input.devyRightsSnapshot.sourceId !== devyRightsSource.sourceId ||
      input.devyRightsSnapshot.spreadsheetId !== devyRightsSource.spreadsheetId ||
      input.devyRightsSnapshot.sheetName !== devyRightsSource.sheetName
    ) {
      throw new Error(`Devy rights snapshot does not match the linked source for league ${input.leagueId}.`);
    }
  }

  const contractProfile = resolveContractLeagueRuleProfile({
    leagueName: input.leagueName,
    workbookId: input.contractWorkbookSnapshot?.workbookId ?? null,
  });

  if (
    contractProfile &&
    input.contractWorkbookSnapshot &&
    input.contractWorkbookSnapshot.profileId !== contractProfile.id
  ) {
    throw new Error(
      `Contract snapshot profile ${input.contractWorkbookSnapshot.profileId} does not match resolved profile ${contractProfile.id}.`,
    );
  }

  const capabilities: LeagueCapability[] = ['platform_roster', 'platform_scoring'];
  if (devyRightsSource) capabilities.push('devy_rights');
  if (contractProfile) capabilities.push('contracts');

  const sources: LeagueContextSource[] = [
    {
      sourceId: `${input.platform}:${input.leagueId}`,
      role: 'platform',
      authority: 'authoritative_for_platform_league_identity_roster_and_settings',
      health: evaluateSourceHealth({
        asOf: input.scoringAsOf,
        checkedAt: builtAt,
        maxAgeMs: input.scoringMaxAgeMs === undefined ? DEFAULT_SCORING_MAX_AGE_MS : input.scoringMaxAgeMs,
        available: Boolean(input.scoringAsOf),
        unavailableReason: 'Platform sync has no current as-of timestamp.',
      }),
    },
    {
      sourceId: `${input.platform}:${input.leagueId}:scoring`,
      role: 'scoring',
      authority: 'authoritative_for_scoring_settings',
      health: scoring.sourceHealth,
    },
  ];

  if (devyRightsSource) {
    sources.push({
      sourceId: devyRightsSource.sourceId,
      role: 'devy_rights',
      authority: devyRightsSource.authority,
      health: input.devyRightsSnapshot?.sourceHealth ?? evaluateSourceHealth({
        available: false,
        checkedAt: builtAt,
        unavailableReason:
          'Devy rights source is linked but no normalized live rights snapshot was supplied.',
      }),
    });
  }

  if (contractProfile) {
    sources.push({
      sourceId: `google-drive:${contractProfile.sourceFiles.operationalWorkbook.driveFileId}`,
      role: 'contract_workbook',
      authority: 'authoritative_for_live_contract_roster_and_rate_tables',
      health: input.contractWorkbookSnapshot?.sourceHealth ?? evaluateSourceHealth({
        available: false,
        checkedAt: builtAt,
        unavailableReason:
          'Contract workbook profile is linked, but no freshly ingested workbook snapshot was supplied.',
      }),
    });
  }

  const issues: LeagueContextIssue[] = [];
  for (const issue of scoring.issues) {
    issues.push({
      code: 'SCORING_NOT_CERTIFIED',
      severity: 'blocking',
      message: issue,
      source: `${input.platform}:${input.leagueId}:scoring`,
    });
  }

  if (contractProfile && !input.contractWorkbookSnapshot) {
    issues.push({
      code: 'CONTRACT_WORKBOOK_NOT_REFRESHED',
      severity: 'blocking',
      message:
        'Contract rules are resolved, but live cap/contract decisions require a fresh normalized workbook snapshot.',
      source: contractProfile.sourceFiles.operationalWorkbook.driveFileId,
    });
  }

  if (contractProfile) {
    for (const conflict of contractProfile.knownConflicts) {
      issues.push({
        code: 'CONTRACT_RULE_CONFLICT',
        severity: 'warning',
        message: `${conflict.rule}: ${conflict.sources.join(' | ')}`,
        source: contractProfile.id,
      });
    }
    for (const unknown of contractProfile.unknownOrUnverified) {
      issues.push({
        code: 'CONTRACT_RULE_UNKNOWN',
        severity: 'warning',
        message: unknown,
        source: contractProfile.id,
      });
    }
  }

  if (devyRightsSource && !input.devyRightsSnapshot) {
    issues.push({
      code: 'DEVY_RIGHTS_NOT_REFRESHED',
      severity: 'warning',
      message:
        'Devy ownership is linked to Google Drive, but this context does not contain a normalized live rights snapshot.',
      source: devyRightsSource.sourceId,
    });
  }

  return {
    schemaVersion: 'unified-league-context.v1',
    identity: {
      platform: input.platform,
      leagueId: input.leagueId,
      leagueName: input.leagueName,
      season: input.season,
    },
    builtAt,
    capabilities,
    scoring,
    rosterPositions: [...(input.rosterPositions ?? [])],
    contractProfile,
    contractWorkbookSnapshot: input.contractWorkbookSnapshot ?? null,
    devyRightsSource,
    devyRightsSnapshot: input.devyRightsSnapshot ?? null,
    sources,
    issues,
    invariants: {
      noSilentScoringDefaults: true,
      noCrossLeagueContractRuleInheritance: true,
      collegeProspectsNeverBecomePlatformNflRosterPlayers: true,
      liveContractDecisionsRequireFreshWorkbookSnapshot: true,
      devyOwnershipDecisionsRequireFreshRightsSnapshot: true,
    },
  };
}

export type LeagueDecisionReadiness = {
  ready: boolean;
  decisionType: LeagueDecisionType;
  blockers: string[];
  warnings: string[];
};

export function assessLeagueDecisionReadiness(
  context: UnifiedLeagueContextV1,
  input: { decisionType: LeagueDecisionType; contractRule?: string },
): LeagueDecisionReadiness {
  const blockers: string[] = [];
  const warnings = context.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.message);

  if (['lineup', 'waiver', 'trade'].includes(input.decisionType)) {
    try {
      assertScoringCertified(context.scoring);
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
  }

  if ((input.decisionType === 'trade' && context.capabilities.includes('contracts')) || input.decisionType === 'contract') {
    if (!context.contractProfile) {
      blockers.push('Contract decision requested for a league without a resolved contract rule profile.');
    } else {
      try {
        assertContractSnapshotUsable(context.contractWorkbookSnapshot);
      } catch (error) {
        blockers.push(error instanceof Error ? error.message : String(error));
      }
      if (input.contractRule) {
        try {
          assertContractRuleUsable(context.contractProfile, input.contractRule);
        } catch (error) {
          blockers.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  if (input.decisionType === 'devy_rights') {
    if (!context.devyRightsSource) {
      blockers.push('No Devy rights source is linked to this league.');
    } else {
      try {
        assertDevyRightsSnapshotUsable(context.devyRightsSnapshot);
      } catch (error) {
        blockers.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return {
    ready: blockers.length === 0,
    decisionType: input.decisionType,
    blockers,
    warnings,
  };
}

export function summarizeLeagueContextHealth(context: UnifiedLeagueContextV1): {
  league: string;
  scoring: ScoringCertification['status'];
  contractWorkbook: LeagueSourceHealth['status'] | 'not_applicable';
  devyRights: LeagueSourceHealth['status'] | 'not_applicable';
  blockingIssueCount: number;
  warningCount: number;
} {
  const contractSource = context.sources.find((source) => source.role === 'contract_workbook');
  const devySource = context.sources.find((source) => source.role === 'devy_rights');
  return {
    league: context.identity.leagueName,
    scoring: context.scoring.status,
    contractWorkbook: contractSource?.health.status ?? 'not_applicable',
    devyRights: devySource?.health.status ?? 'not_applicable',
    blockingIssueCount: context.issues.filter((issue) => issue.severity === 'blocking').length,
    warningCount: context.issues.filter((issue) => issue.severity === 'warning').length,
  };
}
