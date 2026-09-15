import crypto from "crypto";
import {
  assertCCFSourceStateEligible,
  type CCFSourceState,
} from "../sources/sourceState";

export type CCFDown = 1 | 2 | 3 | 4;

/**
 * Source-agnostic canonical play evidence for deterministic opportunity
 * derivation. A future source adapter owns the mapping from provider fields into
 * this contract; this module deliberately does not bless any PBP provider.
 */
export interface CCFCanonicalOpportunityPlay {
  eventId: string;
  gameId: string;
  season: number;
  week: number;
  offenseTeam: string;
  countsAsOffensivePlay: boolean;
  dropback: boolean;
  rushAttempt: boolean;
  designedRush: boolean;
  scramble: boolean;
  rusherId: string | null;
  targetId: string | null;
  completedPass: boolean;
  airYards: number | null;
  down: CCFDown | null;
  /** Distance in yards from the offense to the opponent goal line. */
  yardline100: number | null;
  twoMinute: boolean;
  /** Score differential from the offense's perspective before the play. */
  offenseScoreDifferential: number | null;
  knownAt: string;
  sourceRef: string;
}

export interface CCFGameOpportunityInput {
  contractVersion: "ccf-game-opportunity-input-v1";
  gameId: string;
  season: number;
  week: number;
  asOf: string;
  sourceState: CCFSourceState;
  /** Must be true only when the supplied play set is known to cover the game. */
  completeGameEvidence: boolean;
  plays: CCFCanonicalOpportunityPlay[];
}

export interface CCFTeamGameOpportunity {
  team: string;
  offensivePlays: number;
  dropbacks: number;
  rushAttempts: number;
  targets: number;
  receptions: number;
  airYards: number;
  redZoneOpportunities: number;
  goalLineOpportunities: number;
  twoMinuteOpportunities: number;
  firstDownOpportunities: number;
  opportunitiesWhileLeading: number;
  opportunitiesWhileTied: number;
  opportunitiesWhileTrailing: number;
  sourceRefs: string[];
}

export interface CCFPlayerGameOpportunity {
  playerId: string;
  team: string;
  carries: number;
  targets: number;
  receptions: number;
  touches: number;
  airYards: number;
  designedRushes: number;
  scrambles: number;
  redZoneCarries: number;
  redZoneTargets: number;
  redZoneOpportunities: number;
  goalLineCarries: number;
  goalLineTargets: number;
  goalLineOpportunities: number;
  twoMinuteCarries: number;
  twoMinuteTargets: number;
  twoMinuteOpportunities: number;
  firstDownCarries: number;
  firstDownTargets: number;
  firstDownOpportunities: number;
  opportunitiesWhileLeading: number;
  opportunitiesWhileTied: number;
  opportunitiesWhileTrailing: number;
  carryShare: number | null;
  targetShare: number | null;
  carryTargetOpportunityShare: number | null;
  airYardsShare: number | null;
  redZoneOpportunityShare: number | null;
  goalLineOpportunityShare: number | null;
  twoMinuteOpportunityShare: number | null;
  sourceRefs: string[];
}

export interface CCFGameOpportunityLedger {
  contractVersion: "ccf-game-opportunity-ledger-v1";
  gameId: string;
  season: number;
  week: number;
  asOf: string;
  knownAt: string;
  sourceId: string;
  producerFamily: "ccf_native_derived";
  evidenceKind: "derived";
  teams: CCFTeamGameOpportunity[];
  players: CCFPlayerGameOpportunity[];
}

export class CCFGameOpportunityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFGameOpportunityError";
  }
}

interface MutableTeamOpportunity extends Omit<CCFTeamGameOpportunity, "sourceRefs"> {
  sourceRefs: Set<string>;
}

interface MutablePlayerOpportunity
  extends Omit<
    CCFPlayerGameOpportunity,
    | "touches"
    | "redZoneOpportunities"
    | "goalLineOpportunities"
    | "twoMinuteOpportunities"
    | "firstDownOpportunities"
    | "carryShare"
    | "targetShare"
    | "carryTargetOpportunityShare"
    | "airYardsShare"
    | "redZoneOpportunityShare"
    | "goalLineOpportunityShare"
    | "twoMinuteOpportunityShare"
    | "sourceRefs"
  > {
  sourceRefs: Set<string>;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFGameOpportunityError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function requireText(label: string, value: string): string {
  if (!value.trim()) throw new CCFGameOpportunityError(`${label} is required`);
  return value;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function createTeam(team: string): MutableTeamOpportunity {
  return {
    team,
    offensivePlays: 0,
    dropbacks: 0,
    rushAttempts: 0,
    targets: 0,
    receptions: 0,
    airYards: 0,
    redZoneOpportunities: 0,
    goalLineOpportunities: 0,
    twoMinuteOpportunities: 0,
    firstDownOpportunities: 0,
    opportunitiesWhileLeading: 0,
    opportunitiesWhileTied: 0,
    opportunitiesWhileTrailing: 0,
    sourceRefs: new Set<string>(),
  };
}

function createPlayer(playerId: string, team: string): MutablePlayerOpportunity {
  return {
    playerId,
    team,
    carries: 0,
    targets: 0,
    receptions: 0,
    airYards: 0,
    designedRushes: 0,
    scrambles: 0,
    redZoneCarries: 0,
    redZoneTargets: 0,
    goalLineCarries: 0,
    goalLineTargets: 0,
    twoMinuteCarries: 0,
    twoMinuteTargets: 0,
    firstDownCarries: 0,
    firstDownTargets: 0,
    opportunitiesWhileLeading: 0,
    opportunitiesWhileTied: 0,
    opportunitiesWhileTrailing: 0,
    sourceRefs: new Set<string>(),
  };
}

function gameScriptBucket(
  scoreDifferential: number | null,
): "leading" | "tied" | "trailing" | null {
  if (scoreDifferential == null) return null;
  if (scoreDifferential > 0) return "leading";
  if (scoreDifferential < 0) return "trailing";
  return "tied";
}

function validatePlay(
  play: CCFCanonicalOpportunityPlay,
  input: CCFGameOpportunityInput,
  eventIds: Set<string>,
): number {
  requireText("play.eventId", play.eventId);
  requireText("play.gameId", play.gameId);
  requireText("play.offenseTeam", play.offenseTeam);
  requireText("play.sourceRef", play.sourceRef);

  if (eventIds.has(play.eventId)) {
    throw new CCFGameOpportunityError(`duplicate eventId ${play.eventId}`);
  }
  eventIds.add(play.eventId);

  if (play.gameId !== input.gameId || play.season !== input.season || play.week !== input.week) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} does not match input game/season/week identity`,
    );
  }

  const knownAtMs = timestamp(`play ${play.eventId}.knownAt`, play.knownAt);
  const asOfMs = timestamp("asOf", input.asOf);
  if (knownAtMs > asOfMs) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} violates temporal eligibility: knownAt > asOf`,
    );
  }

  if (!play.countsAsOffensivePlay) {
    if (
      play.dropback ||
      play.rushAttempt ||
      play.designedRush ||
      play.scramble ||
      play.rusherId != null ||
      play.targetId != null ||
      play.completedPass ||
      play.airYards != null
    ) {
      throw new CCFGameOpportunityError(
        `play ${play.eventId} excluded from offensive-play counts cannot carry opportunity events`,
      );
    }
    return knownAtMs;
  }

  if (play.rushAttempt && play.rusherId == null) {
    throw new CCFGameOpportunityError(`play ${play.eventId} rushAttempt requires rusherId`);
  }
  if (!play.rushAttempt && play.rusherId != null) {
    throw new CCFGameOpportunityError(`play ${play.eventId} rusherId requires rushAttempt`);
  }
  if (play.targetId != null && !play.dropback) {
    throw new CCFGameOpportunityError(`play ${play.eventId} targetId requires dropback`);
  }
  if (play.rushAttempt && play.targetId != null) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} cannot be both a rush opportunity and a target opportunity`,
    );
  }
  if (play.completedPass && play.targetId == null) {
    throw new CCFGameOpportunityError(`play ${play.eventId} completedPass requires targetId`);
  }
  if (play.airYards != null && play.targetId == null) {
    throw new CCFGameOpportunityError(`play ${play.eventId} airYards requires targetId`);
  }
  if (play.airYards != null && !Number.isFinite(play.airYards)) {
    throw new CCFGameOpportunityError(`play ${play.eventId} airYards must be finite`);
  }
  if (play.scramble && (!play.dropback || !play.rushAttempt || play.rusherId == null)) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} scramble requires dropback, rushAttempt, and rusherId`,
    );
  }
  if (play.designedRush && (!play.rushAttempt || play.rusherId == null)) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} designedRush requires rushAttempt and rusherId`,
    );
  }
  if (play.scramble && play.designedRush) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} cannot be both scramble and designedRush`,
    );
  }
  if (play.yardline100 != null) {
    if (!Number.isFinite(play.yardline100) || play.yardline100 < 0 || play.yardline100 > 100) {
      throw new CCFGameOpportunityError(
        `play ${play.eventId} yardline100 must be within [0, 100]`,
      );
    }
  }
  if (play.offenseScoreDifferential != null && !Number.isFinite(play.offenseScoreDifferential)) {
    throw new CCFGameOpportunityError(
      `play ${play.eventId} offenseScoreDifferential must be finite`,
    );
  }

  return knownAtMs;
}

export function validateCCFGameOpportunityInput(
  input: CCFGameOpportunityInput,
): CCFGameOpportunityInput {
  if (input.contractVersion !== "ccf-game-opportunity-input-v1") {
    throw new CCFGameOpportunityError("unsupported game opportunity input version");
  }
  requireText("gameId", input.gameId);
  if (!Number.isInteger(input.season) || input.season < 2000) {
    throw new CCFGameOpportunityError("season must be a valid integer season");
  }
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) {
    throw new CCFGameOpportunityError("week must be an integer within [1, 25]");
  }
  timestamp("asOf", input.asOf);
  assertCCFSourceStateEligible(input.sourceState, input.asOf);

  if (!input.completeGameEvidence) {
    throw new CCFGameOpportunityError(
      "game opportunity derivation requires explicitly complete game evidence",
    );
  }
  if (input.plays.length === 0) {
    throw new CCFGameOpportunityError("complete game evidence must contain at least one play");
  }

  const eventIds = new Set<string>();
  for (const play of input.plays) validatePlay(play, input, eventIds);
  return input;
}

function incrementScript(
  ledger: {
    opportunitiesWhileLeading: number;
    opportunitiesWhileTied: number;
    opportunitiesWhileTrailing: number;
  },
  bucket: ReturnType<typeof gameScriptBucket>,
): void {
  if (bucket === "leading") ledger.opportunitiesWhileLeading += 1;
  if (bucket === "tied") ledger.opportunitiesWhileTied += 1;
  if (bucket === "trailing") ledger.opportunitiesWhileTrailing += 1;
}

export function deriveCCFGameOpportunityLedger(
  input: CCFGameOpportunityInput,
): CCFGameOpportunityLedger {
  validateCCFGameOpportunityInput(input);

  const teams = new Map<string, MutableTeamOpportunity>();
  const players = new Map<string, MutablePlayerOpportunity>();
  let latestKnownAtMs = Number.NEGATIVE_INFINITY;
  let latestKnownAt = input.asOf;

  const teamFor = (team: string): MutableTeamOpportunity => {
    const existing = teams.get(team);
    if (existing) return existing;
    const created = createTeam(team);
    teams.set(team, created);
    return created;
  };

  const playerFor = (playerId: string, team: string): MutablePlayerOpportunity => {
    const existing = players.get(playerId);
    if (existing) {
      if (existing.team !== team) {
        throw new CCFGameOpportunityError(
          `player ${playerId} appears for multiple offenses in the same game`,
        );
      }
      return existing;
    }
    const created = createPlayer(playerId, team);
    players.set(playerId, created);
    return created;
  };

  for (const play of input.plays) {
    const knownAtMs = Date.parse(play.knownAt);
    if (knownAtMs > latestKnownAtMs) {
      latestKnownAtMs = knownAtMs;
      latestKnownAt = play.knownAt;
    }

    if (!play.countsAsOffensivePlay) continue;

    const team = teamFor(play.offenseTeam);
    team.offensivePlays += 1;
    team.sourceRefs.add(play.sourceRef);
    if (play.dropback) team.dropbacks += 1;

    const isRedZone = play.yardline100 != null && play.yardline100 <= 20;
    const isGoalLine = play.yardline100 != null && play.yardline100 <= 5;
    const isFirstDown = play.down === 1;
    const script = gameScriptBucket(play.offenseScoreDifferential);

    if (play.rushAttempt && play.rusherId != null) {
      const player = playerFor(play.rusherId, play.offenseTeam);
      team.rushAttempts += 1;
      player.carries += 1;
      player.sourceRefs.add(play.sourceRef);
      if (play.designedRush) player.designedRushes += 1;
      if (play.scramble) player.scrambles += 1;
      if (isRedZone) {
        team.redZoneOpportunities += 1;
        player.redZoneCarries += 1;
      }
      if (isGoalLine) {
        team.goalLineOpportunities += 1;
        player.goalLineCarries += 1;
      }
      if (play.twoMinute) {
        team.twoMinuteOpportunities += 1;
        player.twoMinuteCarries += 1;
      }
      if (isFirstDown) {
        team.firstDownOpportunities += 1;
        player.firstDownCarries += 1;
      }
      incrementScript(team, script);
      incrementScript(player, script);
    }

    if (play.targetId != null) {
      const player = playerFor(play.targetId, play.offenseTeam);
      team.targets += 1;
      player.targets += 1;
      player.sourceRefs.add(play.sourceRef);
      if (play.completedPass) {
        team.receptions += 1;
        player.receptions += 1;
      }
      if (play.airYards != null) {
        team.airYards += play.airYards;
        player.airYards += play.airYards;
      }
      if (isRedZone) {
        team.redZoneOpportunities += 1;
        player.redZoneTargets += 1;
      }
      if (isGoalLine) {
        team.goalLineOpportunities += 1;
        player.goalLineTargets += 1;
      }
      if (play.twoMinute) {
        team.twoMinuteOpportunities += 1;
        player.twoMinuteTargets += 1;
      }
      if (isFirstDown) {
        team.firstDownOpportunities += 1;
        player.firstDownTargets += 1;
      }
      incrementScript(team, script);
      incrementScript(player, script);
    }
  }

  const frozenTeams = Array.from(teams.values())
    .sort((left, right) => left.team.localeCompare(right.team))
    .map((team): CCFTeamGameOpportunity => ({
      ...team,
      sourceRefs: Array.from(team.sourceRefs).sort(),
    }));
  const teamById = new Map(frozenTeams.map((team) => [team.team, team]));

  const frozenPlayers = Array.from(players.values())
    .sort((left, right) => left.playerId.localeCompare(right.playerId))
    .map((player): CCFPlayerGameOpportunity => {
      const team = teamById.get(player.team);
      if (!team) {
        throw new CCFGameOpportunityError(`missing team ledger for player ${player.playerId}`);
      }
      const redZoneOpportunities = player.redZoneCarries + player.redZoneTargets;
      const goalLineOpportunities = player.goalLineCarries + player.goalLineTargets;
      const twoMinuteOpportunities = player.twoMinuteCarries + player.twoMinuteTargets;
      const firstDownOpportunities = player.firstDownCarries + player.firstDownTargets;
      return {
        playerId: player.playerId,
        team: player.team,
        carries: player.carries,
        targets: player.targets,
        receptions: player.receptions,
        touches: player.carries + player.receptions,
        airYards: player.airYards,
        designedRushes: player.designedRushes,
        scrambles: player.scrambles,
        redZoneCarries: player.redZoneCarries,
        redZoneTargets: player.redZoneTargets,
        redZoneOpportunities,
        goalLineCarries: player.goalLineCarries,
        goalLineTargets: player.goalLineTargets,
        goalLineOpportunities,
        twoMinuteCarries: player.twoMinuteCarries,
        twoMinuteTargets: player.twoMinuteTargets,
        twoMinuteOpportunities,
        firstDownCarries: player.firstDownCarries,
        firstDownTargets: player.firstDownTargets,
        firstDownOpportunities,
        opportunitiesWhileLeading: player.opportunitiesWhileLeading,
        opportunitiesWhileTied: player.opportunitiesWhileTied,
        opportunitiesWhileTrailing: player.opportunitiesWhileTrailing,
        carryShare: ratio(player.carries, team.rushAttempts),
        targetShare: ratio(player.targets, team.targets),
        carryTargetOpportunityShare: ratio(
          player.carries + player.targets,
          team.rushAttempts + team.targets,
        ),
        airYardsShare: ratio(player.airYards, team.airYards),
        redZoneOpportunityShare: ratio(redZoneOpportunities, team.redZoneOpportunities),
        goalLineOpportunityShare: ratio(goalLineOpportunities, team.goalLineOpportunities),
        twoMinuteOpportunityShare: ratio(twoMinuteOpportunities, team.twoMinuteOpportunities),
        sourceRefs: Array.from(player.sourceRefs).sort(),
      };
    });

  return {
    contractVersion: "ccf-game-opportunity-ledger-v1",
    gameId: input.gameId,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    knownAt: latestKnownAt,
    sourceId: input.sourceState.sourceId,
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    teams: frozenTeams,
    players: frozenPlayers,
  };
}

export function fingerprintCCFGameOpportunityLedger(
  ledger: CCFGameOpportunityLedger,
): string {
  const canonical = JSON.stringify({
    ...ledger,
    teams: [...ledger.teams]
      .map((team) => ({ ...team, sourceRefs: [...team.sourceRefs].sort() }))
      .sort((left, right) => left.team.localeCompare(right.team)),
    players: [...ledger.players]
      .map((player) => ({ ...player, sourceRefs: [...player.sourceRefs].sort() }))
      .sort((left, right) => left.playerId.localeCompare(right.playerId)),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}
