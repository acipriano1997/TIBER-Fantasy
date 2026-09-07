import crypto from 'node:crypto';
import { storage, type IStorage } from '../storage';
import { sleeperClient, type SleeperRoster } from '../integrations/sleeperClient';
import { computeLeagueDashboard, type LeagueDashboardPayload } from './leagueDashboardService';
import {
  buildTeamDirectionForgeFreshnessReceipt,
  isAcceptedTeamDirectionForgeFreshnessReceipt,
} from '../modules/management/forgeTeamDirectionFreshnessPolicy';

const BENCH_WEIGHT = 0.15;
const MIN_OVERALL_EVIDENCE_RATE = 0.9;
export const LEAGUE_DASHBOARD_TRUTH_BOUNDARY_VERSION = 'league_dashboard_truth_boundary_v1';

type TruthBoundaryDeps = {
  storage: Pick<IStorage, 'getLeagueWithTeams'>;
  sleeperClient: Pick<typeof sleeperClient, 'getLeagueRosters'>;
  computeLeagueDashboard: typeof computeLeagueDashboard;
  now?: () => Date;
};

const defaultDeps: TruthBoundaryDeps = {
  storage,
  sleeperClient,
  computeLeagueDashboard,
  now: () => new Date(),
};

type TruthBoundaryParams = {
  userId: string;
  leagueId: string;
  week?: number | null;
  season?: number | null;
  refresh?: boolean;
};

export class LeagueDashboardTruthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LeagueDashboardTruthError';
  }
}

function normalizeExternalId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function playerSpecificAlpha(player: any): number {
  if (player?.forgeScoreSource !== 'player_specific') return 0;
  const alpha = Number(player?.alpha);
  return Number.isFinite(alpha) ? alpha : 0;
}

function stableFingerprint(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function normalizedSettings(league: any) {
  let settings = league?.settings ?? null;
  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = { raw: settings };
    }
  }
  return {
    settings,
    scoring_format: league?.scoringFormat ?? league?.scoring_format ?? null,
    season: league?.season ?? null,
  };
}

function observedRosterMap(rosters: SleeperRoster[]) {
  const map = new Map<string, SleeperRoster>();
  for (const roster of rosters) {
    const rosterId = normalizeExternalId(roster.roster_id);
    if (!rosterId) continue;
    if (map.has(rosterId)) {
      throw new LeagueDashboardTruthError(
        'duplicate_external_roster_id',
        `Sleeper returned duplicate roster_id ${rosterId}`,
        409,
        { external_roster_id: rosterId },
      );
    }
    map.set(rosterId, roster);
  }
  return map;
}

function playerIndex(payload: LeagueDashboardPayload) {
  const bySleeperId = new Map<string, any>();
  for (const team of payload.teams ?? []) {
    for (const player of team.roster ?? []) {
      const sleeperId = normalizeExternalId((player as any).sleeperId);
      if (!sleeperId) continue;
      const existing = bySleeperId.get(sleeperId);
      if (existing && existing.rosterKey !== (player as any).rosterKey) {
        throw new LeagueDashboardTruthError(
          'duplicate_player_roster_membership',
          `Player ${sleeperId} appeared with conflicting roster identity`,
          409,
          { sleeper_id: sleeperId },
        );
      }
      bySleeperId.set(sleeperId, player);
    }
  }
  return bySleeperId;
}

function recomputeObservedTeam(
  baseTeam: any,
  observedRoster: SleeperRoster,
  playersBySleeperId: Map<string, any>,
  forgeArtifact: any,
  now: Date,
) {
  const observedPlayerIds = (observedRoster.players ?? []).map(String);
  const observedStarterIds = new Set((observedRoster.starters ?? []).map(String));
  const missingPlayerIds: string[] = [];

  const roster = observedPlayerIds.map((sleeperId) => {
    const player = playersBySleeperId.get(sleeperId);
    if (!player) {
      missingPlayerIds.push(sleeperId);
      return null;
    }
    return {
      ...player,
      usedAsStarter: observedStarterIds.has(sleeperId),
    };
  }).filter(Boolean) as any[];

  if (missingPlayerIds.length > 0) {
    throw new LeagueDashboardTruthError(
      'observed_roster_player_unavailable',
      'Observed Sleeper roster could not be reconstructed from the dashboard evidence set',
      409,
      { missing_sleeper_ids: missingPlayerIds },
    );
  }

  const startersUsed = roster.filter((player) => player.usedAsStarter);
  const totals = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const player of startersUsed) {
    const pos = String(player.pos ?? '').toUpperCase();
    if (pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE') {
      totals[pos] += playerSpecificAlpha(player);
    }
  }

  const benchSum = roster
    .filter((player) => !player.usedAsStarter)
    .reduce((sum, player) => sum + playerSpecificAlpha(player), 0);
  const benchContribution = BENCH_WEIGHT * benchSum;
  const evidenceCount = roster.filter((player) => player?.forgeScoreSource === 'player_specific' && Number.isFinite(Number(player?.alpha))).length;
  const evidenceRate = roster.length === 0 ? 0 : evidenceCount / roster.length;
  const freshnessReceipt = buildTeamDirectionForgeFreshnessReceipt({
    artifact: forgeArtifact ?? null,
    rosterPlayers: roster,
    now,
  });
  const freshnessAccepted = isAcceptedTeamDirectionForgeFreshnessReceipt(freshnessReceipt);
  const overallAvailable = roster.length > 0
    && evidenceRate >= MIN_OVERALL_EVIDENCE_RATE
    && freshnessAccepted;
  const observedStarterTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const overallUnavailableReason = overallAvailable
    ? null
    : evidenceRate < MIN_OVERALL_EVIDENCE_RATE
      ? 'insufficient_player_specific_forge_coverage'
      : `forge_freshness_${freshnessReceipt.reasonCode}`;

  return {
    ...baseTeam,
    totals,
    starters_used: startersUsed,
    roster,
    bench_contribution: overallAvailable ? benchContribution : null,
    overall_total: overallAvailable ? observedStarterTotal + benchContribution : null,
    overall_available: overallAvailable,
    overall_evidence_rate: evidenceRate,
    overall_unavailable_reason: overallUnavailableReason,
    starter_source: 'sleeper_observed',
    forge_freshness_receipt: freshnessReceipt,
  };
}

/**
 * Enforces the Management truth boundary without reinterpreting FORGE evidence.
 *
 * The legacy dashboard service may synthesize a lineup for roster-strength
 * scoring. This wrapper makes the user-facing Management response authoritative
 * for roster membership and starter state by rebinding every team through the
 * persisted externalRosterId -> Sleeper roster_id contract.
 */
export async function computeTruthBoundLeagueDashboard(
  params: TruthBoundaryParams,
  deps: TruthBoundaryDeps = defaultDeps,
): Promise<LeagueDashboardPayload & Record<string, unknown>> {
  if (!params.userId || params.userId === 'default_user') {
    throw new LeagueDashboardTruthError('unscoped_user_id', 'A scoped user id is required', 400);
  }

  const league = await deps.storage.getLeagueWithTeams(params.leagueId);
  if (!league || ((league as any).userId !== params.userId && (league as any).user_id !== params.userId)) {
    throw new LeagueDashboardTruthError('league_context_not_found', 'League not found for scoped user', 404);
  }

  const externalLeagueId = normalizeExternalId((league as any).leagueIdExternal ?? (league as any).league_id_external);
  if (!externalLeagueId) {
    throw new LeagueDashboardTruthError('external_league_id_missing', 'League is missing its external Sleeper id', 409);
  }

  const [basePayload, rosters] = await Promise.all([
    deps.computeLeagueDashboard(params as any),
    deps.sleeperClient.getLeagueRosters(externalLeagueId),
  ]);

  const now = deps.now?.() ?? new Date();
  const rostersById = observedRosterMap(rosters);
  const playersBySleeperId = playerIndex(basePayload);
  const baseTeamsById = new Map((basePayload.teams ?? []).map((team: any) => [String(team.team_id), team]));

  const teamReceipts: Array<Record<string, unknown>> = [];
  const teams = (league.teams ?? []).map((leagueTeam: any) => {
    const teamId = String(leagueTeam.id);
    const externalRosterId = normalizeExternalId(leagueTeam.externalRosterId ?? leagueTeam.external_roster_id);
    if (!externalRosterId) {
      throw new LeagueDashboardTruthError(
        'external_roster_id_missing',
        `Team ${teamId} is missing externalRosterId`,
        409,
        { team_id: teamId },
      );
    }

    const observedRoster = rostersById.get(externalRosterId);
    if (!observedRoster) {
      throw new LeagueDashboardTruthError(
        'external_roster_binding_mismatch',
        `No Sleeper roster matched externalRosterId ${externalRosterId}`,
        409,
        { team_id: teamId, external_roster_id: externalRosterId },
      );
    }

    const baseTeam = baseTeamsById.get(teamId) ?? {
      team_id: teamId,
      display_name: leagueTeam.displayName ?? leagueTeam.display_name ?? 'Team',
      roster: [],
    };
    const verifiedTeam = recomputeObservedTeam(
      baseTeam,
      observedRoster,
      playersBySleeperId,
      basePayload.diagnostics?.forgeArtifact ?? null,
      now,
    );

    teamReceipts.push({
      team_id: teamId,
      external_roster_id: externalRosterId,
      sleeper_owner_id: normalizeExternalId(observedRoster.owner_id),
      observed_player_count: (observedRoster.players ?? []).length,
      observed_starter_count: (observedRoster.starters ?? []).length,
      overall_available: verifiedTeam.overall_available,
      overall_evidence_rate: verifiedTeam.overall_evidence_rate,
      forge_freshness_decision: verifiedTeam.forge_freshness_receipt.decision,
      forge_freshness_reason: verifiedTeam.forge_freshness_receipt.reasonCode,
    });

    return verifiedTeam;
  });

  const settingsSnapshot = normalizedSettings(league);
  const receiptCore = {
    version: LEAGUE_DASHBOARD_TRUTH_BOUNDARY_VERSION,
    user_id: params.userId,
    league_id: params.leagueId,
    external_league_id: externalLeagueId,
    season: basePayload.meta?.season ?? params.season ?? null,
    week: basePayload.meta?.week ?? params.week ?? null,
    settings_fingerprint: stableFingerprint(settingsSnapshot),
    roster_binding: 'external_roster_id_to_sleeper_roster_id',
    starter_source: 'sleeper_observed',
    team_receipts: teamReceipts,
  };

  return {
    ...basePayload,
    teams,
    context_receipt: {
      ...receiptCore,
      fingerprint: stableFingerprint(receiptCore),
      observed_at: now.toISOString(),
    },
  } as LeagueDashboardPayload & Record<string, unknown>;
}
