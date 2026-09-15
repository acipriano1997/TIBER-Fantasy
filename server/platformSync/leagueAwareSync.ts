import {
  platformSyncManager,
  type PlatformCredentials,
  type SyncData,
} from './index';
import {
  buildUnifiedLeagueContextV1,
  type UnifiedLeagueContextV1,
} from '../leagueContext/leagueContextV1';
import type { ContractWorkbookSnapshotV1 } from '../leagueContext/contractWorkbookSnapshot';

export type LeagueSupplementRefresh = {
  contractWorkbookSnapshot?: ContractWorkbookSnapshotV1 | null;
  devyRightsAsOf?: string | Date | null;
  devyRightsAvailable?: boolean;
};

export type LeagueAwareSyncOptions = {
  supplementsByLeagueId?: Record<string, LeagueSupplementRefresh | undefined>;
};

export type LeagueAwareSyncData = SyncData & {
  leagueContexts: UnifiedLeagueContextV1[];
};

/**
 * Preferred FFCC sync entrypoint for decision-producing code.
 *
 * PlatformSyncManager remains responsible for platform retrieval. This wrapper
 * immediately converts every normalized league into Unified League Context v1,
 * preserving exact platform scoring and attaching only explicitly refreshed
 * supplemental sources. Contract/Devy supplements are never inferred from
 * another league or treated as live merely because a registry link exists.
 */
export async function syncUserDataWithLeagueContext(
  userId: string,
  credentials: PlatformCredentials,
  options: LeagueAwareSyncOptions = {},
): Promise<LeagueAwareSyncData> {
  const syncData = await platformSyncManager.syncUserData(userId, credentials);
  const asOf = syncData.lastSyncTimestamp;

  const leagueContexts = await Promise.all(
    syncData.leagues.map(async (league) => {
      const supplement = options.supplementsByLeagueId?.[league.leagueId];
      return buildUnifiedLeagueContextV1({
        platform: credentials.platform,
        leagueId: league.leagueId,
        leagueName: league.name,
        season: league.season,
        rawScoringSettings: league.settings.scoringSettings,
        scoringAsOf: asOf,
        rosterPositions: league.rosterPositions,
        contractWorkbookSnapshot: supplement?.contractWorkbookSnapshot ?? null,
        devyRightsAsOf: supplement?.devyRightsAsOf ?? null,
        devyRightsAvailable: supplement?.devyRightsAvailable ?? false,
        builtAt: asOf,
      });
    }),
  );

  return {
    ...syncData,
    leagueContexts,
  };
}

export function getSyncedLeagueContext(
  syncData: LeagueAwareSyncData,
  leagueId: string,
): UnifiedLeagueContextV1 {
  const context = syncData.leagueContexts.find((item) => item.identity.leagueId === leagueId);
  if (!context) {
    throw new Error(`No Unified League Context found for league ${leagueId}.`);
  }
  return context;
}
