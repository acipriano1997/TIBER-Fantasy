import { createHash } from 'node:crypto';
import {
  sleeperClient,
  type SleeperPlayer,
  type SleeperRoster,
} from '../integrations/sleeperClient';
import {
  evaluateWeeklyDecisionWithLeagueContext,
  leagueScoringProfileRef,
} from '../leagueContext/weeklyDecisionBinding';
import {
  resolveCommandCenterLeagueContext,
  type ActiveLeagueContextLike,
} from './commandCenterLeagueContextService';
import type {
  WeeklyDecisionContext,
  WeeklyDecisionPosture,
  WeeklyDecisionResult,
  WeeklyTailOutlook,
} from '../../shared/weeklyDecisionContract';

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const NON_STARTING_SLOTS = new Set(['BN', 'IR', 'TAXI']);

export type ActiveTeamContextLike = {
  id?: string | null;
  externalRosterId?: string | number | null;
  external_roster_id?: string | number | null;
};

export type WeeklyLockEvidence = {
  locked: boolean;
  observedAt: string;
  source: string;
};

export type WeeklyTailRequest = {
  leagueId: string;
  season: number;
  week: number;
  playerId: string;
  scoringProfileRef: string;
  scoringProfileHash: string;
  evidenceCutoffAt: string;
};

export type WeeklyDecisionRuntimeInput = {
  activeLeague: ActiveLeagueContextLike | null | undefined;
  activeTeam: ActiveTeamContextLike | null | undefined;
  week: number;
  starterPlayerId: string;
  benchPlayerId: string;
  operatorPosture?: WeeklyDecisionPosture;
};

export type WeeklyDecisionRuntimeResult = {
  schemaVersion: 'command-center-weekly-runtime.v1';
  state: 'evaluated' | 'blocked';
  blockers: string[];
  missingInputs: string[];
  roster: null | {
    leagueId: string;
    rosterId: string;
    rosterSnapshotRef: string;
    rosterSnapshotHash: string;
    controlledSlot: string | null;
    starterPlayerId: string;
    benchPlayerId: string;
  };
  candidateSnapshot: null | {
    starter: { playerId: string; name: string; position: string | null };
    bench: { playerId: string; name: string; position: string | null };
  };
  decisionContext: WeeklyDecisionContext | null;
  decision: WeeklyDecisionResult | null;
};

export type WeeklyDecisionRuntimeDeps = {
  getSleeperLeague: typeof sleeperClient.getLeague;
  getLeagueRosters: typeof sleeperClient.getLeagueRosters;
  getNflPlayers: typeof sleeperClient.getNflPlayers;
  resolveLockState: (input: {
    season: number;
    week: number;
    playerId: string;
    player: SleeperPlayer;
    evidenceCutoffAt: string;
  }) => Promise<WeeklyLockEvidence | null>;
  getTailOutlook: (input: WeeklyTailRequest) => Promise<WeeklyTailOutlook | null>;
  now: () => Date;
};

const defaultDeps: WeeklyDecisionRuntimeDeps = {
  getSleeperLeague: sleeperClient.getLeague.bind(sleeperClient),
  getLeagueRosters: sleeperClient.getLeagueRosters.bind(sleeperClient),
  getNflPlayers: sleeperClient.getNflPlayers.bind(sleeperClient),
  // A live roster payload does not prove NFL game-lock state. Until a governed
  // schedule/lock witness is connected, fail closed rather than assume unlocked.
  resolveLockState: async () => null,
  // The old Compass/prediction intervals are not calibrated CCF distributions.
  // This seam intentionally remains empty until a promoted CCF forecast packet exists.
  getTailOutlook: async () => null,
  now: () => new Date(),
};

function externalLeagueId(league: ActiveLeagueContextLike | null | undefined): string | null {
  if (!league) return null;
  const value = league.leagueIdExternal ?? league.league_id_external ?? null;
  return value == null ? null : String(value);
}

function externalRosterId(team: ActiveTeamContextLike | null | undefined): string | null {
  if (!team) return null;
  const value = team.externalRosterId ?? team.external_roster_id ?? null;
  return value == null ? null : String(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

function playerName(playerId: string, player: SleeperPlayer | undefined): string {
  return player?.full_name
    ?? [player?.first_name, player?.last_name].filter(Boolean).join(' ')
    || playerId;
}

function normalizedPosition(player: SleeperPlayer | undefined): 'QB' | 'RB' | 'WR' | 'TE' | null {
  const value = player?.position?.toUpperCase() ?? null;
  return value && SUPPORTED_POSITIONS.has(value)
    ? value as 'QB' | 'RB' | 'WR' | 'TE'
    : null;
}

function rosterPlayerSet(roster: SleeperRoster): Set<string> {
  return new Set((roster.players ?? []).map(String));
}

function excludedBenchSet(roster: SleeperRoster): Set<string> {
  return new Set([
    ...(roster.starters ?? []),
    ...(roster.reserve ?? []),
    ...(roster.taxi ?? []),
  ].map(String));
}

function blocked(
  blockers: string[],
  missingInputs: string[],
  partial: Pick<WeeklyDecisionRuntimeResult, 'roster' | 'candidateSnapshot'> = {
    roster: null,
    candidateSnapshot: null,
  },
): WeeklyDecisionRuntimeResult {
  return {
    schemaVersion: 'command-center-weekly-runtime.v1',
    state: 'blocked',
    blockers,
    missingInputs,
    roster: partial.roster,
    candidateSnapshot: partial.candidateSnapshot,
    decisionContext: null,
    decision: null,
  };
}

/**
 * Assemble one governed Weekly Decision v1 comparison from current Sleeper
 * roster truth plus certified league scoring. The runtime deliberately admits
 * only direct exact-position starter/bench swaps. FLEX/SUPER_FLEX cascades,
 * unknown lock state, unresolved identity, and missing calibrated CCF tails
 * fail closed instead of falling back to legacy start/sit heuristics.
 */
export async function evaluateWeeklyDecisionRuntime(
  input: WeeklyDecisionRuntimeInput,
  deps: WeeklyDecisionRuntimeDeps = defaultDeps,
): Promise<WeeklyDecisionRuntimeResult> {
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) {
    return blocked(['Week must be an integer from 1 through 25.'], ['week']);
  }
  if (!input.starterPlayerId || !input.benchPlayerId || input.starterPlayerId === input.benchPlayerId) {
    return blocked(['Two distinct Sleeper player IDs are required.'], ['candidate_player_ids']);
  }

  const leagueId = externalLeagueId(input.activeLeague);
  const rosterId = externalRosterId(input.activeTeam);
  if (!input.activeLeague || !leagueId) {
    return blocked(['No active Sleeper league with an external league ID is selected.'], ['active_league']);
  }
  if (!input.activeTeam || !rosterId) {
    return blocked(['No active team with a Sleeper roster ID is selected.'], ['active_team']);
  }

  const evidenceCutoffAt = deps.now().toISOString();
  const resolvedLeague = await resolveCommandCenterLeagueContext(input.activeLeague, {
    getSleeperLeague: deps.getSleeperLeague,
    now: () => new Date(evidenceCutoffAt),
  });
  const leagueContext = resolvedLeague.context;
  if (!leagueContext || resolvedLeague.readiness.lineup?.ready !== true) {
    return blocked(
      [
        'Active league/scoring context is not certified for lineup decisions.',
        ...(resolvedLeague.readiness.lineup?.blockers ?? []),
      ],
      ['certified_active_league_context'],
    );
  }

  const scoringProfileRef = leagueScoringProfileRef(leagueContext);
  const scoringProfileHash = leagueContext.scoring.fingerprint;
  if (!scoringProfileRef || !scoringProfileHash) {
    return blocked(['Certified scoring identity is unavailable.'], ['certified_scoring_identity']);
  }

  const rosters = await deps.getLeagueRosters(leagueId);
  const roster = rosters.find((row) => String(row.roster_id) === rosterId);
  if (!roster) {
    return blocked([`Sleeper roster ${rosterId} was not found in active league ${leagueId}.`], ['live_roster']);
  }

  const starters = (roster.starters ?? []).map(String);
  const playerIds = rosterPlayerSet(roster);
  const benchExclusions = excludedBenchSet(roster);
  const starterSlots = leagueContext.rosterPositions.filter((slot) => !NON_STARTING_SLOTS.has(slot));
  const rosterSnapshotHash = sha256({
    leagueId,
    rosterId,
    rosterPositions: leagueContext.rosterPositions,
    players: [...playerIds].sort(),
    starters,
    reserve: (roster.reserve ?? []).map(String).sort(),
    taxi: (roster.taxi ?? []).map(String).sort(),
  });
  const rosterSnapshotRef = `sleeper:${leagueId}:roster:${rosterId}:${rosterSnapshotHash.slice(0, 16)}`;
  const rosterView = {
    leagueId,
    rosterId,
    rosterSnapshotRef,
    rosterSnapshotHash,
    controlledSlot: null as string | null,
    starterPlayerId: input.starterPlayerId,
    benchPlayerId: input.benchPlayerId,
  };

  const geometryBlockers: string[] = [];
  const geometryMissing: string[] = [];
  if (starterSlots.length !== starters.length) {
    geometryBlockers.push(
      `Sleeper starter count (${starters.length}) does not match certified starting-slot count (${starterSlots.length}).`,
    );
    geometryMissing.push('exact_starter_slot_alignment');
  }
  const starterIndex = starters.indexOf(input.starterPlayerId);
  if (starterIndex < 0) {
    geometryBlockers.push(`${input.starterPlayerId} is not an observed current starter.`);
    geometryMissing.push(`${input.starterPlayerId}:observed_starter`);
  }
  if (!playerIds.has(input.benchPlayerId)) {
    geometryBlockers.push(`${input.benchPlayerId} is not on the current Sleeper roster.`);
    geometryMissing.push(`${input.benchPlayerId}:roster_membership`);
  } else if (benchExclusions.has(input.benchPlayerId)) {
    geometryBlockers.push(`${input.benchPlayerId} is not an eligible active bench player (starter, reserve, or taxi).`);
    geometryMissing.push(`${input.benchPlayerId}:active_bench_status`);
  }

  const players = await deps.getNflPlayers();
  const starterPlayer = players[input.starterPlayerId];
  const benchPlayer = players[input.benchPlayerId];
  const starterPosition = normalizedPosition(starterPlayer);
  const benchPosition = normalizedPosition(benchPlayer);
  const candidateSnapshot = {
    starter: {
      playerId: input.starterPlayerId,
      name: playerName(input.starterPlayerId, starterPlayer),
      position: starterPosition,
    },
    bench: {
      playerId: input.benchPlayerId,
      name: playerName(input.benchPlayerId, benchPlayer),
      position: benchPosition,
    },
  };

  if (!starterPlayer || !starterPosition) {
    geometryBlockers.push(`Sleeper canonical NFL identity/position is unavailable for ${input.starterPlayerId}.`);
    geometryMissing.push(`${input.starterPlayerId}:canonical_identity`);
  }
  if (!benchPlayer || !benchPosition) {
    geometryBlockers.push(`Sleeper canonical NFL identity/position is unavailable for ${input.benchPlayerId}.`);
    geometryMissing.push(`${input.benchPlayerId}:canonical_identity`);
  }

  const controlledSlot = starterIndex >= 0 && starterIndex < starterSlots.length
    ? starterSlots[starterIndex]
    : null;
  rosterView.controlledSlot = controlledSlot;
  if (
    controlledSlot
    && starterPosition
    && benchPosition
    && (starterPosition !== benchPosition || controlledSlot !== starterPosition)
  ) {
    geometryBlockers.push(
      `Weekly Decision v1 only admits an exact-position slot swap; observed slot ${controlledSlot} cannot certify this ${starterPosition ?? 'unknown'} / ${benchPosition ?? 'unknown'} comparison.`,
    );
    geometryMissing.push('exact_position_legal_swap');
  }

  if (geometryBlockers.length) {
    return blocked(geometryBlockers, geometryMissing, { roster: rosterView, candidateSnapshot });
  }

  const [starterLock, benchLock, starterTail, benchTail] = await Promise.all([
    deps.resolveLockState({
      season: leagueContext.identity.season,
      week: input.week,
      playerId: input.starterPlayerId,
      player: starterPlayer!,
      evidenceCutoffAt,
    }),
    deps.resolveLockState({
      season: leagueContext.identity.season,
      week: input.week,
      playerId: input.benchPlayerId,
      player: benchPlayer!,
      evidenceCutoffAt,
    }),
    deps.getTailOutlook({
      leagueId,
      season: leagueContext.identity.season,
      week: input.week,
      playerId: input.starterPlayerId,
      scoringProfileRef,
      scoringProfileHash,
      evidenceCutoffAt,
    }),
    deps.getTailOutlook({
      leagueId,
      season: leagueContext.identity.season,
      week: input.week,
      playerId: input.benchPlayerId,
      scoringProfileRef,
      scoringProfileHash,
      evidenceCutoffAt,
    }),
  ]);

  const evidenceBlockers: string[] = [];
  const evidenceMissing: string[] = [];
  if (!starterLock || !benchLock) {
    evidenceBlockers.push(
      'NFL game-lock state is not governed for both candidates; Sleeper roster truth alone is not sufficient to assume an unlocked slot.',
    );
    if (!starterLock) evidenceMissing.push(`${input.starterPlayerId}:lock_state`);
    if (!benchLock) evidenceMissing.push(`${input.benchPlayerId}:lock_state`);
  }
  if (!starterTail || !benchTail) {
    evidenceBlockers.push(
      'Promoted calibrated CCF weekly distributions are not available for both candidates; legacy Compass intervals and point projections are not valid substitutes.',
    );
    if (!starterTail) evidenceMissing.push(`${input.starterPlayerId}:ccf_calibrated_tail`);
    if (!benchTail) evidenceMissing.push(`${input.benchPlayerId}:ccf_calibrated_tail`);
  }
  if (evidenceBlockers.length) {
    return blocked(evidenceBlockers, evidenceMissing, { roster: rosterView, candidateSnapshot });
  }

  const lineupA = { slots: starterSlots, starters };
  const lineupBStarters = [...starters];
  lineupBStarters[starterIndex] = input.benchPlayerId;
  const lineupB = { slots: starterSlots, starters: lineupBStarters };
  const locked = Boolean(starterLock!.locked || benchLock!.locked);
  const teamRef = String(input.activeTeam.id ?? rosterId);
  const decisionContext: WeeklyDecisionContext = {
    decisionId: `weekly:${leagueId}:${rosterId}:${leagueContext.identity.season}:${input.week}:${input.starterPlayerId}:${input.benchPlayerId}:${sha256({ evidenceCutoffAt }).slice(0, 12)}`,
    season: leagueContext.identity.season,
    week: input.week,
    evidenceCutoffAt,
    validUntil: null,
    leagueRef: leagueId,
    teamRef,
    scoringProfileRef,
    scoringProfileHash,
    rosterSnapshotRef,
    rosterSnapshotHash,
    lineupAHash: sha256(lineupA),
    lineupBHash: sha256(lineupB),
    samePositionLegalSwap: true,
    locked,
    operatorPosture: input.operatorPosture ?? 'unset',
    candidateA: {
      playerId: input.starterPlayerId,
      playerName: candidateSnapshot.starter.name,
      position: starterPosition!,
      identityStatus: 'resolved',
      observedStarter: true,
      tailOutlook: starterTail,
    },
    candidateB: {
      playerId: input.benchPlayerId,
      playerName: candidateSnapshot.bench.name,
      position: benchPosition!,
      identityStatus: 'resolved',
      observedStarter: false,
      tailOutlook: benchTail,
    },
  };

  return {
    schemaVersion: 'command-center-weekly-runtime.v1',
    state: 'evaluated',
    blockers: [],
    missingInputs: [],
    roster: rosterView,
    candidateSnapshot,
    decisionContext,
    decision: evaluateWeeklyDecisionWithLeagueContext(leagueContext, decisionContext),
  };
}
