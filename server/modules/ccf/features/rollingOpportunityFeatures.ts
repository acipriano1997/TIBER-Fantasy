import crypto from "crypto";
import type { CCFPosition } from "../outcomes/contract";
import type {
  CCFGameOpportunityLedger,
  CCFPlayerGameOpportunity,
  CCFTeamGameOpportunity,
} from "./playByPlayOpportunity";
import { fingerprintCCFGameOpportunityLedger } from "./playByPlayOpportunity";
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
  /**
   * Explicit caller-versioned rolling windows. V2 has no default smoothing
   * horizon and rejects duplicates rather than silently normalizing them.
   */
  windows: number[];
  /**
   * Same-season prior-game history. Every supplied game requires an explicit
   * applicability classification; missing player rows never imply zero role.
   */
  history: CCFPriorGameOpportunityEvidence[];
}

export interface CCFRollingOpportunityFeatureReceiptV2 {
  contractVersion: "ccf-rolling-opportunity-feature-receipt-v2";
  receiptId: string;
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  asOf: string;
  windows: number[];
  historyCompleteEvidenceRef: string;
  historyCompleteEvidenceKnownAt: string;
  candidatePriorGameCount: number;
  applicableGameCount: number;
  observedOpportunityGameCount: number;
  observedZeroOpportunityGameCount: number;
  notApplicableGameCount: number;
  candidateGameIds: string[];
  applicableGameIds: string[];
  observedOpportunityGameIds: string[];
  observedZeroOpportunityGameIds: string[];
  notApplicableGameIds: string[];
  latestEvidenceKnownAt: string;
  sourceRefs: string[];
  absenceSemantics: "explicit_applicability_only";
  seasonBoundary: "same_season_only";
}

export interface CCFRollingOpportunityFeatureResultV2 {
  receipt: CCFRollingOpportunityFeatureReceiptV2;
  featureSet: CCFWeeklyNativeFeatureSet;
}

export const CCF_ROLLING_OPPORTUNITY_HISTORY_KEYS_V2 = {
  candidatePriorGames: "opportunity.history.candidate_prior_games",
  applicableGames: "opportunity.history.applicable_games",
  observedOpportunityGames: "opportunity.history.observed_opportunity_games",
  observedZeroOpportunityGames: "opportunity.history.observed_zero_opportunity_games",
  notApplicableGames: "opportunity.history.not_applicable_games",
  weeksSinceLatestApplicableGame: "opportunity.history.weeks_since_latest_applicable_game",
} as const;

export function ccfRollingOpportunityWindowKeysV2(window: number) {
  const prefix = `opportunity.prior_up_to_${window}`;
  return {
    sampleGames: `${prefix}.sample_games`,
    observedOpportunityGames: `${prefix}.observed_opportunity_games`,
    observedZeroOpportunityGames: `${prefix}.observed_zero_opportunity_games`,
    carriesMean: `${prefix}.carries_mean`,
    targetsMean: `${prefix}.targets_mean`,
    receptionsMean: `${prefix}.receptions_mean`,
    touchesMean: `${prefix}.touches_mean`,
    airYardsMean: `${prefix}.air_yards_mean`,
    designedQbRushesMean: `${prefix}.designed_qb_rushes_mean`,
    scramblesMean: `${prefix}.scrambles_mean`,
    redZoneOpportunitiesMean: `${prefix}.red_zone_opportunities_mean`,
    goalLineOpportunitiesMean: `${prefix}.goal_line_opportunities_mean`,
    twoMinuteOpportunitiesMean: `${prefix}.two_minute_opportunities_mean`,
    firstDownOpportunitiesMean: `${prefix}.first_down_opportunities_mean`,
    opportunitiesWhileLeadingMean: `${prefix}.opportunities_while_leading_mean`,
    opportunitiesWhileTiedMean: `${prefix}.opportunities_while_tied_mean`,
    opportunitiesWhileTrailingMean: `${prefix}.opportunities_while_trailing_mean`,
    carryShareMean: `${prefix}.carry_share_mean`,
    targetShareMean: `${prefix}.target_share_mean`,
    carryTargetOpportunityShareMean: `${prefix}.carry_target_opportunity_share_mean`,
    airYardsShareMean: `${prefix}.air_yards_share_mean`,
    redZoneOpportunityShareMean: `${prefix}.red_zone_opportunity_share_mean`,
    goalLineOpportunityShareMean: `${prefix}.goal_line_opportunity_share_mean`,
    twoMinuteOpportunityShareMean: `${prefix}.two_minute_opportunity_share_mean`,
  } as const;
}

export class CCFRollingOpportunityFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingOpportunityFeatureError";
  }
}

interface RollingObservation {
  gameId: string;
  week: number;
  team: string;
  kind: "observed_opportunity" | "observed_participation_zero_opportunity";
  knownAt: string;
  sourceRefs: string[];
  carries: number;
  targets: number;
  receptions: number;
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

function requireText(label: string, value: string): string {
  if (!value.trim()) throw new CCFRollingOpportunityFeatureError(`${label} is required`);
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRollingOpportunityFeatureError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function uniqueRefs(refs: readonly string[]): string[] {
  const normalized = refs.map((ref) => requireText("sourceRef", ref));
  return Array.from(new Set(normalized)).sort();
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxTimestamp(values: readonly string[]): string {
  if (values.length === 0) {
    throw new CCFRollingOpportunityFeatureError("cannot select latest timestamp from empty evidence");
  }
  let latest = values[0];
  let latestMs = timestamp("knownAt", latest);
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index];
    const currentMs = timestamp("knownAt", current);
    if (currentMs > latestMs) {
      latest = current;
      latestMs = currentMs;
    }
  }
  return latest;
}

function ledgerRef(ledger: CCFGameOpportunityLedger): string {
  return `ccf://game-opportunity-ledger/sha256/${fingerprintCCFGameOpportunityLedger(ledger)}`;
}

function assertNonNegativeInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CCFRollingOpportunityFeatureError(`${label} must be a non-negative integer`);
  }
}

function assertBoundedShare(label: string, value: number | null): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new CCFRollingOpportunityFeatureError(`${label} must be null or within [0, 1]`);
  }
}

function validateTeamRow(team: CCFTeamGameOpportunity): void {
  requireText("team.team", team.team);
  for (const [label, value] of [
    ["rushAttempts", team.rushAttempts],
    ["targets", team.targets],
    ["redZoneOpportunities", team.redZoneOpportunities],
    ["goalLineOpportunities", team.goalLineOpportunities],
    ["twoMinuteOpportunities", team.twoMinuteOpportunities],
  ] as const) {
    assertNonNegativeInteger(`team.${label}`, value);
  }
  if (!Number.isFinite(team.airYards)) {
    throw new CCFRollingOpportunityFeatureError("team.airYards must be finite");
  }
  if (team.sourceRefs.length === 0) {
    throw new CCFRollingOpportunityFeatureError("team.sourceRefs must not be empty");
  }
  uniqueRefs(team.sourceRefs);
}

function validatePlayerRow(player: CCFPlayerGameOpportunity): void {
  requireText("player.playerId", player.playerId);
  requireText("player.team", player.team);
  for (const [label, value] of [
    ["carries", player.carries],
    ["targets", player.targets],
    ["receptions", player.receptions],
    ["touches", player.touches],
    ["designedQbRushes", player.designedQbRushes],
    ["scrambles", player.scrambles],
    ["redZoneOpportunities", player.redZoneOpportunities],
    ["goalLineOpportunities", player.goalLineOpportunities],
    ["twoMinuteOpportunities", player.twoMinuteOpportunities],
    ["firstDownOpportunities", player.firstDownOpportunities],
    ["opportunitiesWhileLeading", player.opportunitiesWhileLeading],
    ["opportunitiesWhileTied", player.opportunitiesWhileTied],
    ["opportunitiesWhileTrailing", player.opportunitiesWhileTrailing],
  ] as const) {
    assertNonNegativeInteger(`player.${label}`, value);
  }
  if (player.touches !== player.carries + player.receptions) {
    throw new CCFRollingOpportunityFeatureError("player.touches must equal carries + receptions");
  }
  if (!Number.isFinite(player.airYards)) {
    throw new CCFRollingOpportunityFeatureError("player.airYards must be finite");
  }
  for (const [label, value] of [
    ["carryShare", player.carryShare],
    ["targetShare", player.targetShare],
    ["carryTargetOpportunityShare", player.carryTargetOpportunityShare],
    ["redZoneOpportunityShare", player.redZoneOpportunityShare],
    ["goalLineOpportunityShare", player.goalLineOpportunityShare],
    ["twoMinuteOpportunityShare", player.twoMinuteOpportunityShare],
  ] as const) {
    assertBoundedShare(`player.${label}`, value);
  }
  if (player.airYardsShare != null && !Number.isFinite(player.airYardsShare)) {
    throw new CCFRollingOpportunityFeatureError("player.airYardsShare must be null or finite");
  }
  if (player.sourceRefs.length === 0) {
    throw new CCFRollingOpportunityFeatureError("player.sourceRefs must not be empty");
  }
  uniqueRefs(player.sourceRefs);
}

function validateLedger(
  ledger: CCFGameOpportunityLedger,
  input: BuildCCFRollingOpportunityFeaturesInput,
  seenGameIds: Set<string>,
  seenWeeks: Set<number>,
  targetAsOfMs: number,
): void {
  if (ledger.contractVersion !== "ccf-game-opportunity-ledger-v1") {
    throw new CCFRollingOpportunityFeatureError("rolling features require ccf-game-opportunity-ledger-v1");
  }
  requireText("ledger.gameId", ledger.gameId);
  requireText("ledger.sourceId", ledger.sourceId);
  if (seenGameIds.has(ledger.gameId)) {
    throw new CCFRollingOpportunityFeatureError(`duplicate prior game ledger ${ledger.gameId}`);
  }
  seenGameIds.add(ledger.gameId);
  if (ledger.season !== input.season) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} is outside target season ${input.season}`,
    );
  }
  if (!Number.isInteger(ledger.week) || ledger.week < 1 || ledger.week >= input.week) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} must be strictly before target week ${input.week}`,
    );
  }
  if (seenWeeks.has(ledger.week)) {
    throw new CCFRollingOpportunityFeatureError(
      `multiple historical games supplied for player in week ${ledger.week}`,
    );
  }
  seenWeeks.add(ledger.week);
  if (ledger.producerFamily !== "ccf_native_derived" || ledger.evidenceKind !== "derived") {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} must be CCF-native derived evidence`,
    );
  }
  const ledgerAsOfMs = timestamp(`ledger ${ledger.gameId}.asOf`, ledger.asOf);
  const knownAtMs = timestamp(`ledger ${ledger.gameId}.knownAt`, ledger.knownAt);
  if (knownAtMs > ledgerAsOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} has knownAt later than its own asOf`,
    );
  }
  if (ledgerAsOfMs > targetAsOfMs || knownAtMs > targetAsOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} violates target temporal eligibility`,
    );
  }
}

function findTeam(ledger: CCFGameOpportunityLedger, teamId: string): CCFTeamGameOpportunity {
  const rows = ledger.teams.filter((team) => team.team === teamId);
  if (rows.length !== 1) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} must contain exactly one team row for ${teamId}`,
    );
  }
  validateTeamRow(rows[0]);
  return rows[0];
}

function findPlayer(
  ledger: CCFGameOpportunityLedger,
  playerId: string,
): CCFPlayerGameOpportunity | null {
  const rows = ledger.players.filter((player) => player.playerId === playerId);
  if (rows.length > 1) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} contains duplicate player rows for ${playerId}`,
    );
  }
  if (rows[0]) validatePlayerRow(rows[0]);
  return rows[0] ?? null;
}

function zeroShare(denominator: number): number | null {
  return denominator === 0 ? null : 0;
}

function observedOpportunity(
  evidence: CCFPriorGameOpportunityEvidence,
  player: CCFPlayerGameOpportunity,
  team: CCFTeamGameOpportunity,
  historyCompleteEvidenceRef: string,
): RollingObservation {
  if (player.team !== team.team) {
    throw new CCFRollingOpportunityFeatureError(
      `player ${player.playerId} team does not match applicability team in ${evidence.ledger.gameId}`,
    );
  }
  return {
    gameId: evidence.ledger.gameId,
    week: evidence.ledger.week,
    team: player.team,
    kind: "observed_opportunity",
    knownAt: evidence.ledger.knownAt,
    sourceRefs: uniqueRefs([
      ledgerRef(evidence.ledger),
      ...player.sourceRefs,
      ...team.sourceRefs,
      historyCompleteEvidenceRef,
    ]),
    carries: player.carries,
    targets: player.targets,
    receptions: player.receptions,
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

function zeroOpportunity(
  evidence: CCFPriorGameOpportunityEvidence,
  team: CCFTeamGameOpportunity,
  applicability: Extract<CCFPriorGameApplicability, { status: "observed_participation_zero_opportunity" }>,
  historyCompleteEvidenceRef: string,
): RollingObservation {
  return {
    gameId: evidence.ledger.gameId,
    week: evidence.ledger.week,
    team: team.team,
    kind: "observed_participation_zero_opportunity",
    knownAt: maxTimestamp([evidence.ledger.knownAt, applicability.knownAt]),
    sourceRefs: uniqueRefs([
      ledgerRef(evidence.ledger),
      ...team.sourceRefs,
      ...applicability.sourceRefs,
      historyCompleteEvidenceRef,
    ]),
    carries: 0,
    targets: 0,
    receptions: 0,
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
    carryShare: zeroShare(team.rushAttempts),
    targetShare: zeroShare(team.targets),
    carryTargetOpportunityShare: zeroShare(team.rushAttempts + team.targets),
    airYardsShare: zeroShare(team.airYards),
    redZoneOpportunityShare: zeroShare(team.redZoneOpportunities),
    goalLineOpportunityShare: zeroShare(team.goalLineOpportunities),
    twoMinuteOpportunityShare: zeroShare(team.twoMinuteOpportunities),
  };
}

function normalizeWindows(windows: readonly number[]): number[] {
  if (windows.length === 0) {
    throw new CCFRollingOpportunityFeatureError("at least one explicit rolling window is required");
  }
  if (new Set(windows).size !== windows.length) {
    throw new CCFRollingOpportunityFeatureError("rolling windows must not contain duplicates");
  }
  for (const window of windows) {
    if (!Number.isInteger(window) || window < 1 || window > 8) {
      throw new CCFRollingOpportunityFeatureError(
        "rolling windows must be integers within [1, 8]",
      );
    }
  }
  return [...windows].sort((left, right) => left - right);
}

function available(
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

function missing(
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

function canonicalReceiptPayload(
  receipt: Omit<CCFRollingOpportunityFeatureReceiptV2, "receiptId">,
): string {
  return JSON.stringify({
    ...receipt,
    windows: [...receipt.windows].sort((a, b) => a - b),
    candidateGameIds: [...receipt.candidateGameIds].sort(),
    applicableGameIds: [...receipt.applicableGameIds].sort(),
    observedOpportunityGameIds: [...receipt.observedOpportunityGameIds].sort(),
    observedZeroOpportunityGameIds: [...receipt.observedZeroOpportunityGameIds].sort(),
    notApplicableGameIds: [...receipt.notApplicableGameIds].sort(),
    sourceRefs: [...receipt.sourceRefs].sort(),
  });
}

export function buildCCFRollingOpportunityFeaturesV2(
  input: BuildCCFRollingOpportunityFeaturesInput,
): CCFRollingOpportunityFeatureResultV2 {
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
  const historyCompleteMs = timestamp(
    "historyCompleteEvidenceKnownAt",
    input.historyCompleteEvidenceKnownAt,
  );
  if (historyCompleteMs > asOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      "historyCompleteEvidenceKnownAt cannot be later than asOf",
    );
  }
  const windows = normalizeWindows(input.windows);

  const seenGameIds = new Set<string>();
  const seenWeeks = new Set<number>();
  const observations: RollingObservation[] = [];
  const candidateGameIds: string[] = [];
  const observedOpportunityGameIds: string[] = [];
  const observedZeroOpportunityGameIds: string[] = [];
  const notApplicableGameIds: string[] = [];
  const allEvidenceKnownAt: string[] = [input.historyCompleteEvidenceKnownAt];
  const receiptRefs = new Set<string>([input.historyCompleteEvidenceRef]);

  for (const evidence of input.history) {
    validateLedger(evidence.ledger, input, seenGameIds, seenWeeks, asOfMs);
    candidateGameIds.push(evidence.ledger.gameId);
    allEvidenceKnownAt.push(evidence.ledger.knownAt);
    receiptRefs.add(ledgerRef(evidence.ledger));

    const applicability = evidence.applicability;
    requireText("applicability.team", applicability.team);
    const team = findTeam(evidence.ledger, applicability.team);
    const player = findPlayer(evidence.ledger, input.playerId);

    if (applicability.status === "observed_opportunity") {
      if (!player) {
        throw new CCFRollingOpportunityFeatureError(
          `player ${input.playerId} is absent from ${evidence.ledger.gameId}; zero role requires explicit participation evidence`,
        );
      }
      observedOpportunityGameIds.push(evidence.ledger.gameId);
      observations.push(
        observedOpportunity(evidence, player, team, input.historyCompleteEvidenceRef),
      );
      continue;
    }

    const applicabilityKnownAtMs = timestamp(
      `applicability ${evidence.ledger.gameId}.knownAt`,
      applicability.knownAt,
    );
    if (applicabilityKnownAtMs > asOfMs) {
      throw new CCFRollingOpportunityFeatureError(
        `applicability ${evidence.ledger.gameId} is known after target asOf`,
      );
    }
    if (applicability.sourceRefs.length === 0) {
      throw new CCFRollingOpportunityFeatureError(
        `applicability ${evidence.ledger.gameId} requires sourceRefs`,
      );
    }
    for (const ref of uniqueRefs(applicability.sourceRefs)) receiptRefs.add(ref);
    allEvidenceKnownAt.push(applicability.knownAt);

    if (applicability.status === "not_applicable") {
      if (player) {
        throw new CCFRollingOpportunityFeatureError(
          `player ${input.playerId} has opportunity evidence in ${evidence.ledger.gameId} but is marked not_applicable`,
        );
      }
      notApplicableGameIds.push(evidence.ledger.gameId);
      continue;
    }

    if (player) {
      throw new CCFRollingOpportunityFeatureError(
        `player ${input.playerId} has opportunity evidence in ${evidence.ledger.gameId}; zero-opportunity status is contradictory`,
      );
    }
    observedZeroOpportunityGameIds.push(evidence.ledger.gameId);
    observations.push(
      zeroOpportunity(evidence, team, applicability, input.historyCompleteEvidenceRef),
    );
  }

  const underlyingKnownAt = allEvidenceKnownAt.filter(
    (value) => value !== input.historyCompleteEvidenceKnownAt,
  );
  if (underlyingKnownAt.length > 0) {
    const latestUnderlyingKnownAt = maxTimestamp(underlyingKnownAt);
    if (historyCompleteMs < timestamp("latestUnderlyingKnownAt", latestUnderlyingKnownAt)) {
      throw new CCFRollingOpportunityFeatureError(
        "history-completeness evidence cannot predate the latest ledger/applicability evidence it certifies",
      );
    }
  }

  observations.sort((left, right) => {
    if (left.week !== right.week) return right.week - left.week;
    return left.gameId.localeCompare(right.gameId);
  });

  const latestEvidenceKnownAt = maxTimestamp(allEvidenceKnownAt);
  const applicableGameIds = observations.map((row) => row.gameId);
  const allReceiptRefs = uniqueRefs(Array.from(receiptRefs));
  const features: Record<string, CCFWeeklyFeatureEvidence> = {};
  const historyKeys = CCF_ROLLING_OPPORTUNITY_HISTORY_KEYS_V2;

  features[historyKeys.candidatePriorGames] = available(
    historyKeys.candidatePriorGames,
    candidateGameIds.length,
    latestEvidenceKnownAt,
    allReceiptRefs,
    "games",
  );
  features[historyKeys.applicableGames] = available(
    historyKeys.applicableGames,
    applicableGameIds.length,
    latestEvidenceKnownAt,
    allReceiptRefs,
    "games",
  );
  features[historyKeys.observedOpportunityGames] = available(
    historyKeys.observedOpportunityGames,
    observedOpportunityGameIds.length,
    latestEvidenceKnownAt,
    allReceiptRefs,
    "games",
  );
  features[historyKeys.observedZeroOpportunityGames] = available(
    historyKeys.observedZeroOpportunityGames,
    observedZeroOpportunityGameIds.length,
    latestEvidenceKnownAt,
    allReceiptRefs,
    "games",
  );
  features[historyKeys.notApplicableGames] = available(
    historyKeys.notApplicableGames,
    notApplicableGameIds.length,
    latestEvidenceKnownAt,
    allReceiptRefs,
    "games",
  );
  if (observations.length > 0) {
    features[historyKeys.weeksSinceLatestApplicableGame] = available(
      historyKeys.weeksSinceLatestApplicableGame,
      input.week - observations[0].week,
      latestEvidenceKnownAt,
      observations[0].sourceRefs,
      "weeks",
    );
  } else {
    features[historyKeys.weeksSinceLatestApplicableGame] = missing(
      historyKeys.weeksSinceLatestApplicableGame,
      "no_applicable_prior_games",
      latestEvidenceKnownAt,
      allReceiptRefs,
    );
  }

  for (const window of windows) {
    const keys = ccfRollingOpportunityWindowKeysV2(window);
    const selected = observations.slice(0, window);
    const selectedRefs = uniqueRefs([
      input.historyCompleteEvidenceRef,
      ...selected.flatMap((row) => row.sourceRefs),
    ]);
    const knownAt = maxTimestamp([
      input.historyCompleteEvidenceKnownAt,
      ...selected.map((row) => row.knownAt),
    ]);

    features[keys.sampleGames] = available(
      keys.sampleGames,
      selected.length,
      knownAt,
      selectedRefs,
      "games",
    );
    features[keys.observedOpportunityGames] = available(
      keys.observedOpportunityGames,
      selected.filter((row) => row.kind === "observed_opportunity").length,
      knownAt,
      selectedRefs,
      "games",
    );
    features[keys.observedZeroOpportunityGames] = available(
      keys.observedZeroOpportunityGames,
      selected.filter((row) => row.kind === "observed_participation_zero_opportunity").length,
      knownAt,
      selectedRefs,
      "games",
    );

    const scalarMetrics: Array<
      readonly [string, (row: RollingObservation) => number, string]
    > = [
      [keys.carriesMean, (row) => row.carries, "opportunities"],
      [keys.targetsMean, (row) => row.targets, "opportunities"],
      [keys.receptionsMean, (row) => row.receptions, "receptions"],
      [keys.touchesMean, (row) => row.touches, "touches"],
      [keys.airYardsMean, (row) => row.airYards, "yards"],
      [keys.designedQbRushesMean, (row) => row.designedQbRushes, "opportunities"],
      [keys.scramblesMean, (row) => row.scrambles, "opportunities"],
      [keys.redZoneOpportunitiesMean, (row) => row.redZoneOpportunities, "opportunities"],
      [keys.goalLineOpportunitiesMean, (row) => row.goalLineOpportunities, "opportunities"],
      [keys.twoMinuteOpportunitiesMean, (row) => row.twoMinuteOpportunities, "opportunities"],
      [keys.firstDownOpportunitiesMean, (row) => row.firstDownOpportunities, "opportunities"],
      [keys.opportunitiesWhileLeadingMean, (row) => row.opportunitiesWhileLeading, "opportunities"],
      [keys.opportunitiesWhileTiedMean, (row) => row.opportunitiesWhileTied, "opportunities"],
      [keys.opportunitiesWhileTrailingMean, (row) => row.opportunitiesWhileTrailing, "opportunities"],
    ];

    const shareMetrics: Array<
      readonly [string, (row: RollingObservation) => number | null]
    > = [
      [keys.carryShareMean, (row) => row.carryShare],
      [keys.targetShareMean, (row) => row.targetShare],
      [keys.carryTargetOpportunityShareMean, (row) => row.carryTargetOpportunityShare],
      [keys.airYardsShareMean, (row) => row.airYardsShare],
      [keys.redZoneOpportunityShareMean, (row) => row.redZoneOpportunityShare],
      [keys.goalLineOpportunityShareMean, (row) => row.goalLineOpportunityShare],
      [keys.twoMinuteOpportunityShareMean, (row) => row.twoMinuteOpportunityShare],
    ];

    if (selected.length === 0) {
      for (const [key] of scalarMetrics) {
        features[key] = missing(key, "no_applicable_prior_games", knownAt, selectedRefs);
      }
      for (const [key] of shareMetrics) {
        features[key] = missing(key, "no_applicable_prior_games", knownAt, selectedRefs);
      }
      continue;
    }

    for (const [key, getter, unit] of scalarMetrics) {
      features[key] = available(
        key,
        mean(selected.map(getter)),
        knownAt,
        selectedRefs,
        unit,
      );
    }
    for (const [key, getter] of shareMetrics) {
      const values = selected.map(getter);
      features[key] = values.some((value) => value == null)
        ? missing(
            key,
            "share_denominator_unavailable_in_one_or_more_selected_games",
            knownAt,
            selectedRefs,
          )
        : available(key, mean(values as number[]), knownAt, selectedRefs, "share");
    }
  }

  const featureSet = validateCCFWeeklyNativeFeatureSet({
    playerId: input.playerId,
    position: input.position,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    features,
  });

  const receiptPayload: Omit<CCFRollingOpportunityFeatureReceiptV2, "receiptId"> = {
    contractVersion: "ccf-rolling-opportunity-feature-receipt-v2",
    playerId: input.playerId,
    position: input.position,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    windows,
    historyCompleteEvidenceRef: input.historyCompleteEvidenceRef,
    historyCompleteEvidenceKnownAt: input.historyCompleteEvidenceKnownAt,
    candidatePriorGameCount: candidateGameIds.length,
    applicableGameCount: applicableGameIds.length,
    observedOpportunityGameCount: observedOpportunityGameIds.length,
    observedZeroOpportunityGameCount: observedZeroOpportunityGameIds.length,
    notApplicableGameCount: notApplicableGameIds.length,
    candidateGameIds: [...candidateGameIds].sort(),
    applicableGameIds: [...applicableGameIds].sort(),
    observedOpportunityGameIds: [...observedOpportunityGameIds].sort(),
    observedZeroOpportunityGameIds: [...observedZeroOpportunityGameIds].sort(),
    notApplicableGameIds: [...notApplicableGameIds].sort(),
    latestEvidenceKnownAt,
    sourceRefs: allReceiptRefs,
    absenceSemantics: "explicit_applicability_only",
    seasonBoundary: "same_season_only",
  };

  const receiptHash = crypto
    .createHash("sha256")
    .update(canonicalReceiptPayload(receiptPayload))
    .digest("hex");

  return {
    receipt: {
      ...receiptPayload,
      receiptId: `ccf://rolling-opportunity-features-v2/sha256/${receiptHash}`,
    },
    featureSet,
  };
}
