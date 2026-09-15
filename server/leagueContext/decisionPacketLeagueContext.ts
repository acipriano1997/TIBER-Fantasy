import { createHash } from 'node:crypto';
import {
  assessLeagueDecisionReadiness,
  type LeagueDecisionType,
  type UnifiedLeagueContextV1,
} from './leagueContextV1';

export type DecisionPacketLeagueContextV1 = {
  schemaVersion: 'decision-packet-league-context.v1';
  league: {
    platform: string;
    leagueId: string;
    leagueName: string;
    season: number;
  };
  scoring: {
    certificationStatus: UnifiedLeagueContextV1['scoring']['status'];
    fingerprint: string | null;
    settings: Record<string, number>;
    asOf: string | null;
    noSilentDefaults: true;
  };
  rosterPositions: string[];
  capabilities: UnifiedLeagueContextV1['capabilities'];
  contract: null | {
    profileId: NonNullable<UnifiedLeagueContextV1['contractProfile']>['id'];
    workbookId: string;
    workbookAsOf: string;
    salaryCap: number;
    rookieDraftRounds: number;
  };
  devyRights: null | {
    spreadsheetId: string;
    sheetName: string;
    ownerHandle: string;
    asOf: string;
    rightCount: number;
    unresolvedIdentityCount: number;
  };
  supplementalSources: Array<{
    sourceId: string;
    role: UnifiedLeagueContextV1['sources'][number]['role'];
    status: UnifiedLeagueContextV1['sources'][number]['health']['status'];
    asOf: string | null;
  }>;
  readiness: {
    decisionType: LeagueDecisionType;
    ready: boolean;
    blockers: string[];
    warnings: string[];
  };
  contextBuiltAt: string;
  fingerprint: string;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * Creates the immutable league/rules portion of Canonical Decision Packet v1.
 * The caller freezes the overall packet; this projection ensures every model
 * receives identical league-scoring/contract/Devy/source-readiness evidence.
 */
export function toDecisionPacketLeagueContext(
  context: UnifiedLeagueContextV1,
  input: { decisionType: LeagueDecisionType; contractRule?: string },
): DecisionPacketLeagueContextV1 {
  const readiness = assessLeagueDecisionReadiness(context, input);
  const contractSnapshot = context.contractWorkbookSnapshot;
  const contract = context.contractProfile && contractSnapshot
    ? {
        profileId: context.contractProfile.id,
        workbookId: contractSnapshot.workbookId,
        workbookAsOf: contractSnapshot.asOf,
        salaryCap: contractSnapshot.salaryCap,
        rookieDraftRounds: context.contractProfile.verifiedCore.rookieDraftRounds,
      }
    : null;
  const devySnapshot = context.devyRightsSnapshot;
  const devyRights = devySnapshot
    ? {
        spreadsheetId: devySnapshot.spreadsheetId,
        sheetName: devySnapshot.sheetName,
        ownerHandle: devySnapshot.ownerHandle,
        asOf: devySnapshot.asOf,
        rightCount: devySnapshot.rights.length,
        unresolvedIdentityCount: devySnapshot.rights.filter((right) => right.identityStatus !== 'resolved').length,
      }
    : null;

  const payload = {
    schemaVersion: 'decision-packet-league-context.v1' as const,
    league: {
      platform: context.identity.platform,
      leagueId: context.identity.leagueId,
      leagueName: context.identity.leagueName,
      season: context.identity.season,
    },
    scoring: {
      certificationStatus: context.scoring.status,
      fingerprint: context.scoring.fingerprint,
      settings: { ...context.scoring.settings },
      asOf: context.scoring.asOf,
      noSilentDefaults: true as const,
    },
    rosterPositions: [...context.rosterPositions],
    capabilities: [...context.capabilities],
    contract,
    devyRights,
    supplementalSources: context.sources.map((source) => ({
      sourceId: source.sourceId,
      role: source.role,
      status: source.health.status,
      asOf: source.health.asOf,
    })),
    readiness: {
      decisionType: input.decisionType,
      ready: readiness.ready,
      blockers: [...readiness.blockers],
      warnings: [...readiness.warnings],
    },
    contextBuiltAt: context.builtAt,
  };

  return {
    ...payload,
    fingerprint: fingerprint(payload),
  };
}

export function assertDecisionPacketLeagueContextReady(
  packetContext: DecisionPacketLeagueContextV1,
): void {
  if (!packetContext.readiness.ready) {
    throw new Error(
      `League context is not decision-ready; abstain. ${packetContext.readiness.blockers.join(' ')}`,
    );
  }
}
