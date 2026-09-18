import type { CCFPosition } from "../outcomes/contract";
import type {
  CCFGameOpportunityLedger,
  CCFPlayerGameOpportunity,
  CCFTeamGameOpportunity,
} from "./playByPlayOpportunity";
import {
  validateCCFWeeklyNativeFeatureSet,
  type CCFWeeklyFeatureEvidence,
  type CCFWeeklyNativeFeatureSet,
} from "./weeklyFeatureEvidence";

export type CCFPriorGameApplicability =
  | {
      status: "observed_opportunity";
      team: string;
    }
  | {
      status: "observed_participation_zero_opportunity";
      team: string;
      knownAt: string;
      sourceRefs: string[];
    }
  | {
      status: "not_applicable";
      team: string;
      knownAt: string;
      sourceRefs: string[];
    };

export interface CCFPriorGameOpportunityEvidence {
  ledger: CCFGameOpportunityLedger;
  applicability: CCFPriorGameApplicability;
}

export interface BuildCCFRollingOpportunityFeaturesInput {
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  asOf: string;
  historyCompleteEvidence: true;
  historyCompleteEvidenceRef: string;
  historyCompleteEvidenceKnownAt: string;
  history: CCFPriorGameOpportunityEvidence[];
  windows?: number[];
}

export class CCFRollingOpportunityFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingOpportunityFeatureError";
  }
}

interface CCFRollingPlayerGameObservation {
  gameId: string;
  season: number;
  week: number;
  team: string;
  knownAt: string;
  sourceRefs: string[];
  carries: number;
  targets: number;
  touches: number;
  airYards: number;
  designedQbRushes: number;
  scrambles: number;
  redZoneOpportunities: number;
  goalLineOpportunities: number;
  twoMinuteOpportunities: number;
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
}

const DEFAULT_WINDOWS = [1, 3, 5] as const;

const SCALAR_METRICS = [
  ["carries", "carries_mean", "opportunities"],
  ["targets", "targets_mean", "opportunities"],
  ["touches", "touches_mean", "touches"],
  ["airYards", "air_yards_mean", "yards"],
  ["designedQbRushes", "designed_qb_rushes_mean", "opportunities"],
  ["scrambles", "scrambles_mean", "opportunities"],
  ["redZoneOpportunities", "red_zone_opportunities_mean", "opportunities"],
  ["goalLineOpportunities", "goal_line_opportunities_mean", "opportunities"],
  ["twoMinuteOpportunities", "two_minute_opportunities_mean", "opportunities"],
  ["firstDownOpportunities", "first_down_opportunities_mean", "opportunities"],
  ["opportunitiesWhileLeading", "opportunities_while_leading_mean", "opportunities"],
  ["opportunitiesWhileTied", "opportunities_while_tied_mean", "opportunities"],
  ["opportunitiesWhileTrailing", "opportunities_while_trailing_mean", "opportunities"],
] as const satisfies ReadonlyArray<
  readonly [
    keyof CCFRollingPlayerGameObservation,
    string,
    string
  ]
>;

const SHARE_METRICS = [
  ["carryShare", "carry_share_mean"],
  ["targetShare", "target_share_mean"],
  ["carryTargetOpportunityShare", "carry_target_opportunity_share_mean"],
  ["airYardsShare", "air_yards_share_mean"],
  ["redZoneOpportunityShare", "red_zone_opportunity_share_mean"],
  ["goalLineOpportunityShare", "goal_line_opportunity_share_mean"],
  ["twoMinuteOpportunityShare", "two_minute_opportunity_share_mean"],
] as const satisfies ReadonlyArray<
  readonly [keyof CCFRollingPlayerGameObservation, string]
>;

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFRollingOpportunityFeatureError(`${label} is required`);
  }
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRollingOpportunityFeatureError(
      `${label} must be a valid timestamp`,
    );
  }
  return parsed;
}

function assertKnownAtEligible(
  label: string,
  value: string,
  asOfMs: number,
): number {
  const parsed = timestamp(label, value);
  if (parsed > asOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      `${label} violates temporal eligibility: knownAt > asOf`,
    );
  }
  return parsed;
}

function ratioForZero(denominator: number): number | null {
  return denominator === 0 ? null : 0;
}

function uniqueRefs(refs: readonly string[]): string[] {
  const normalized = refs.map((ref) => requireText("sourceRef", ref));
  return Array.from(new Set(normalized)).sort();
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function latestKnownAt(values: readonly string[]): string {
  let latest = values[0];
  let latestMs = timestamp("knownAt", latest);
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    const parsed = timestamp("knownAt", value);
    if (parsed > latestMs) {
      latest = value;
      latestMs = parsed;
    }
  }
  return latest;
}

function priorToTarget(
  ledger: CCFGameOpportunityLedger,
  season: number,
  week: number,
): boolean {
  return ledger.season < season || (ledger.season === season && ledger.week < week);
}

function findTeam(
  ledger: CCFGameOpportunityLedger,
  team: string,
): CCFTeamGameOpportunity {
  const rows = ledger.teams.filter((row) => row.team === team);
  if (rows.length !== 1) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} must contain exactly one team row for ${team}`,
    );
  }
  return rows[0];
}

function findPlayer(
  ledger: CCFGameOpportunityLedger,
  playerId: string,
): CCFPlayerGameOpportunity | null {
  const rows = ledger.players.filter((row) => row.playerId === playerId);
  if (rows.length > 1) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} contains duplicate player rows for ${playerId}`,
    );
  }
  return rows[0] ?? null;
}

function validateLedgerIdentity(
  ledger: CCFGameOpportunityLedger,
  input: BuildCCFRollingOpportunityFeaturesInput,
  asOfMs: number,
): void {
  if (ledger.contractVersion !== "ccf-game-opportunity-ledger-v1") {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} has unsupported contract version`,
    );
  }
  requireText("ledger.gameId", ledger.gameId);
  requireText("ledger.sourceId", ledger.sourceId);
  if (!Number.isInteger(ledger.season) || !Number.isInteger(ledger.week)) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} season/week must be integers`,
    );
  }
  if (!priorToTarget(ledger, input.season, input.week)) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} is not strictly prior to target season/week`,
    );
  }
  assertKnownAtEligible(`ledger ${ledger.gameId}.knownAt`, ledger.knownAt, asOfMs);
  const ledgerAsOfMs = timestamp(`ledger ${ledger.gameId}.asOf`, ledger.asOf);
  if (ledgerAsOfMs > asOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId}.asOf is later than target asOf`,
    );
  }
}

function zeroObservation(
  evidence: CCFPriorGameOpportunityEvidence,
  input: BuildCCFRollingOpportunityFeaturesInput,
  team: CCFTeamGameOpportunity,
  applicabilityKnownAt: string,
  applicabilityRefs: readonly string[],
): CCFRollingPlayerGameObservation {
  const knownAt = latestKnownAt([evidence.ledger.knownAt, applicabilityKnownAt]);
  return {
    gameId: evidence.ledger.gameId,
    season: evidence.ledger.season,
    week: evidence.ledger.week,
    team: team.team,
    knownAt,
    sourceRefs: uniqueRefs([
      ...team.sourceRefs,
      ...applicabilityRefs,
      input.historyCompleteEvidenceRef,
    ]),
    carries: 0,
    targets: 0,
    touches: 0,
    airYards: 0,
    designedQbRushes: 0,
    scrambles: 0,
    redZoneOpportunities: 0,
    goalLineOpportunities: 0,
    twoMinuteOpportunities: 0,
    firstDownOpportunities: 0,
    opportunitiesWhileLeading: 0,
    opportunitiesWhileTied: 0,
    opportunitiesWhileTrailing: 0,
    carryShare: ratioForZero(team.rushAttempts),
    targetShare: ratioForZero(team.targets),
    carryTargetOpportunityShare: ratioForZero(team.rushAttempts + team.targets),
    airYardsShare: ratioForZero(team.airYards),
    redZoneOpportunityShare: ratioForZero(team.redZoneOpportunities),
    goalLineOpportunityShare: ratioForZero(team.goalLineOpportunities),
    twoMinuteOpportunityShare: ratioForZero(team.twoMinuteOpportunities),
  };
}

function observedOpportunity(
  evidence: CCFPriorGameOpportunityEvidence,
  input: BuildCCFRollingOpportunityFeaturesInput,
  player: CCFPlayerGameOpportunity,
  team: CCFTeamGameOpportunity,
): CCFRollingPlayerGameObservation {
  if (player.team !== team.team) {
    throw new CCFRollingOpportunityFeatureError(
      `player ${input.playerId} team does not match applicability team in ${evidence.ledger.gameId}`,
    );
  }
  return {
    gameId: evidence.ledger.gameId,
    season: evidence.ledger.season,
    week: evidence.ledger.week,
    team: player.team,
    knownAt: evidence.ledger.knownAt,
    sourceRefs: uniqueRefs([
      ...player.sourceRefs,
      ...team.sourceRefs,
      input.historyCompleteEvidenceRef,
    ]),
    carries: player.carries,
    targets: player.targets,
    touches: player.touches,
    airYards: player.airYards,
    designedQbRushes: player.designedQbRushes,
    scrambles: player.scrambles,
    redZoneOpportunities: player.redZoneOpportunities,
    goalLineOpportunities: player.goalLineOpportunities,
    twoMinuteOpportunities: player.twoMinuteOpportunities,
    firstDownOpportunities: player.firstDownOpportunities,
    opportunitiesWhileLeading: player.opportunitiesWhileLeading,
    opportunitiesWhileTied: player.opportunitiesWhileTied,
    opportunitiesWhileTrailing: player.opportunitiesWhileTrailing,
    carryShare: player.carryShare,
    targetShare: player.targetShare,
    carryTargetOpportunityShare: player.carryTargetOpportunityShare,
    airYardsShare: player.airYardsShare,
    redZoneOpportunityShare: player.redZoneOpportunityShare,
    goalLineOpportunityShare: player.goalLineOpportunityShare,
    twoMinuteOpportunityShare: player.twoMinuteOpportunityShare,
  };
}

function normalizeWindows(windows: readonly number[] | undefined): number[] {
  const values = windows ?? DEFAULT_WINDOWS;
  if (values.length === 0) {
    throw new CCFRollingOpportunityFeatureError("at least one rolling window is required");
  }
  const normalized = Array.from(new Set(values)).sort((left, right) => left - right);
  for (const value of normalized) {
    if (!Number.isInteger(value) || value < 1 || value > 16) {
      throw new CCFRollingOpportunityFeatureError(
        "rolling windows must be unique integers within [1, 16]",
      );
    }
  }
  return normalized;
}

function availableFeature(
  key: string,
  value: number,
  knownAt: string,
  sourceRefs: readonly string[],
  unit?: string,
): CCFWeeklyFeatureEvidence {
  return {
    key,
    status: "available",
    value,
    unit,
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    knownAt,
    sourceRefs: uniqueRefs(sourceRefs),
  };
}

function missingFeature(
  key: string,
  reason: string,
  knownAt: string,
  sourceRefs: readonly string[],
): CCFWeeklyFeatureEvidence {
  return {
    key,
    status: "missing",
    reason,
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    knownAt,
    sourceRefs: uniqueRefs(sourceRefs),
  };
}

export function buildCCFRollingOpportunityFeatures(
  input: BuildCCFRollingOpportunityFeaturesInput,
): CCFWeeklyNativeFeatureSet {
  requireText("playerId", input.playerId);
  if (!["QB", "RB", "WR", "TE"].includes(input.position)) {
    throw new CCFRollingOpportunityFeatureError("position must be QB, RB, WR, or TE");
  }
  if (!Number.isInteger(input.season) || input.season < 2000) {
    throw new CCFRollingOpportunityFeatureError("season must be a valid integer season");
  }
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 25) {
    throw new CCFRollingOpportunityFeatureError("week must be an integer within [1, 25]");
  }
  const asOfMs = timestamp("asOf", input.asOf);
  if (input.historyCompleteEvidence !== true) {
    throw new CCFRollingOpportunityFeatureError(
      "rolling features require explicit complete-history evidence",
    );
  }
  requireText("historyCompleteEvidenceRef", input.historyCompleteEvidenceRef);
  assertKnownAtEligible(
    "historyCompleteEvidenceKnownAt",
    input.historyCompleteEvidenceKnownAt,
    asOfMs,
  );
  const windows = normalizeWindows(input.windows);

  const seenGames = new Set<string>();
  const seenSeasonWeeks = new Set<string>();
  const observations: CCFRollingPlayerGameObservation[] = [];

  for (const evidence of input.history) {
    const { ledger, applicability } = evidence;
    validateLedgerIdentity(ledger, input, asOfMs);
    if (seenGames.has(ledger.gameId)) {
      throw new CCFRollingOpportunityFeatureError(
        `duplicate historical game ${ledger.gameId}`,
      );
    }
    seenGames.add(ledger.gameId);

    const seasonWeek = `${ledger.season}|${ledger.week}`;
    if (seenSeasonWeeks.has(seasonWeek)) {
      throw new CCFRollingOpportunityFeatureError(
        `multiple historical games supplied for player in ${seasonWeek}`,
      );
    }
    seenSeasonWeeks.add(seasonWeek);

    requireText("applicability.team", applicability.team);
    const team = findTeam(ledger, applicability.team);
    const player = findPlayer(ledger, input.playerId);

    if (applicability.status === "observed_opportunity") {
      if (!player) {
        throw new CCFRollingOpportunityFeatureError(
          `player ${input.playerId} is absent from ${ledger.gameId}; zero role requires explicit participation evidence`,
        );
      }
      observations.push(observedOpportunity(evidence, input, player, team));
      continue;
    }

    const applicabilityKnownAtMs = assertKnownAtEligible(
      `applicability ${ledger.gameId}.knownAt`,
      applicability.knownAt,
      asOfMs,
    );
    if (applicability.sourceRefs.length === 0) {
      throw new CCFRollingOpportunityFeatureError(
        `applicability ${ledger.gameId} requires sourceRefs`,
      );
    }
    uniqueRefs(applicability.sourceRefs);
    const ledgerKnownAtMs = timestamp(`ledger ${ledger.gameId}.knownAt`, ledger.knownAt);
    if (applicabilityKnownAtMs < ledgerKnownAtMs && applicability.status === "observed_participation_zero_opportunity") {
      throw new CCFRollingOpportunityFeatureError(
        `zero-opportunity participation evidence for ${ledger.gameId} cannot predate the game ledger`,
      );
    }

    if (applicability.status === "not_applicable") {
      if (player) {
        throw new CCFRollingOpportunityFeatureError(
          `player ${input.playerId} has opportunity evidence in ${ledger.gameId} but is marked not_applicable`,
        );
      }
      continue;
    }

    if (player) {
      throw new CCFRollingOpportunityFeatureError(
        `player ${input.playerId} has opportunity evidence in ${ledger.gameId}; zero-opportunity status is contradictory`,
      );
    }
    observations.push(
      zeroObservation(
        evidence,
        input,
        team,
        applicability.knownAt,
        applicability.sourceRefs,
      ),
    );
  }

  observations.sort((left, right) => {
    if (left.season !== right.season) return right.season - left.season;
    if (left.week !== right.week) return right.week - left.week;
    return left.gameId.localeCompare(right.gameId);
  });

  const features: Record<string, CCFWeeklyFeatureEvidence> = {};
  const completenessRefs = [input.historyCompleteEvidenceRef];
  const completenessKnownAt = input.historyCompleteEvidenceKnownAt;

  for (const window of windows) {
    const selected = observations.slice(0, window);
    const prefix = `opportunity.prior_up_to_${window}`;
    const selectedRefs = uniqueRefs([
      ...completenessRefs,
      ...selected.flatMap((row) => row.sourceRefs),
    ]);
    const knownAt =
      selected.length > 0
        ? latestKnownAt([completenessKnownAt, ...selected.map((row) => row.knownAt)])
        : completenessKnownAt;

    features[`${prefix}.sample_games`] = availableFeature(
      `${prefix}.sample_games`,
      selected.length,
      knownAt,
      selectedRefs,
      "games",
    );

    if (selected.length === 0) {
      for (const [, suffix] of SCALAR_METRICS) {
        const key = `${prefix}.${suffix}`;
        features[key] = missingFeature(
          key,
          "no_applicable_prior_games",
          knownAt,
          selectedRefs,
        );
      }
      for (const [, suffix] of SHARE_METRICS) {
        const key = `${prefix}.${suffix}`;
        features[key] = missingFeature(
          key,
          "no_applicable_prior_games",
          knownAt,
          selectedRefs,
        );
      }
      continue;
    }

    for (const [property, suffix, unit] of SCALAR_METRICS) {
      const values = selected.map((row) => row[property]);
      const numericValues = values.filter((value): value is number => typeof value === "number");
      const key = `${prefix}.${suffix}`;
      features[key] = availableFeature(
        key,
        mean(numericValues),
        knownAt,
        selectedRefs,
        unit,
      );
    }

    for (const [property, suffix] of SHARE_METRICS) {
      const values = selected
        .map((row) => row[property])
        .filter((value): value is number => typeof value === "number");
      const key = `${prefix}.${suffix}`;
      features[key] =
        values.length === 0
          ? missingFeature(
              key,
              "no_nonzero_team_denominator_in_window",
              knownAt,
              selectedRefs,
            )
          : availableFeature(key, mean(values), knownAt, selectedRefs, "share");
    }
  }

  return validateCCFWeeklyNativeFeatureSet({
    playerId: input.playerId,
    position: input.position,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    features,
  });
}
