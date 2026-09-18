import crypto from "crypto";
import type { CCFPosition } from "../outcomes/contract";
import type {
  CCFGameOpportunityLedger,
  CCFPlayerGameOpportunity,
} from "./playByPlayOpportunity";
import { fingerprintCCFGameOpportunityLedger } from "./playByPlayOpportunity";
import {
  validateCCFWeeklyNativeFeatureSet,
  type CCFWeeklyFeatureEvidence,
  type CCFWeeklyNativeFeatureSet,
} from "./weeklyFeatureEvidence";

export const CCF_ROLLING_OPPORTUNITY_FEATURE_KEYS_V1 = {
  candidatePriorGames: "opportunity.candidate_prior_games",
  recordedOpportunityGames: "opportunity.recorded_opportunity_games",
  selectedGames: "opportunity.selected_games",
  weeksSinceLatestRecordedGame: "opportunity.weeks_since_latest_recorded_game",
  carriesPerRecordedGame: "opportunity.carries_per_recorded_game",
  targetsPerRecordedGame: "opportunity.targets_per_recorded_game",
  receptionsPerRecordedGame: "opportunity.receptions_per_recorded_game",
  touchesPerRecordedGame: "opportunity.touches_per_recorded_game",
  airYardsPerRecordedGame: "opportunity.air_yards_per_recorded_game",
  designedQbRushesPerRecordedGame: "opportunity.designed_qb_rushes_per_recorded_game",
  scramblesPerRecordedGame: "opportunity.scrambles_per_recorded_game",
  meanCarryShare: "opportunity.mean_carry_share",
  meanTargetShare: "opportunity.mean_target_share",
  meanCarryTargetOpportunityShare: "opportunity.mean_carry_target_opportunity_share",
  meanAirYardsShare: "opportunity.mean_air_yards_share",
  redZoneOpportunitiesPerRecordedGame: "opportunity.red_zone_opportunities_per_recorded_game",
  meanRedZoneOpportunityShare: "opportunity.mean_red_zone_opportunity_share",
  goalLineOpportunitiesPerRecordedGame: "opportunity.goal_line_opportunities_per_recorded_game",
  meanGoalLineOpportunityShare: "opportunity.mean_goal_line_opportunity_share",
  twoMinuteOpportunitiesPerRecordedGame: "opportunity.two_minute_opportunities_per_recorded_game",
  meanTwoMinuteOpportunityShare: "opportunity.mean_two_minute_opportunity_share",
  firstDownOpportunitiesPerRecordedGame: "opportunity.first_down_opportunities_per_recorded_game",
} as const;

export interface BuildCCFRollingOpportunityFeatureSetInput {
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  asOf: string;
  /**
   * Caller-versioned number of prior recorded-opportunity games to use.
   * V1 intentionally does not invent a default smoothing horizon.
   */
  windowGames: number;
  /**
   * Must contain only same-season games strictly before the target week.
   * A missing player row is never interpreted as a zero-opportunity active game.
   */
  ledgers: CCFGameOpportunityLedger[];
}

export interface CCFRollingOpportunityFeatureReceipt {
  contractVersion: "ccf-rolling-opportunity-feature-receipt-v1";
  receiptId: string;
  playerId: string;
  position: CCFPosition;
  season: number;
  week: number;
  asOf: string;
  windowGames: number;
  candidatePriorGameCount: number;
  recordedOpportunityGameCount: number;
  selectedGameCount: number;
  candidateGameIds: string[];
  recordedOpportunityGameIds: string[];
  selectedGameIds: string[];
  selectedWeeks: number[];
  latestEvidenceKnownAt: string | null;
  sourceRefs: string[];
  absenceSemantics: "not_imputed";
}

export interface CCFRollingOpportunityFeatureResult {
  receipt: CCFRollingOpportunityFeatureReceipt;
  featureSet: CCFWeeklyNativeFeatureSet;
}

export class CCFRollingOpportunityFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CCFRollingOpportunityFeatureError";
  }
}

function requireText(label: string, value: string): string {
  if (!value.trim()) {
    throw new CCFRollingOpportunityFeatureError(`${label} is required`);
  }
  return value;
}

function timestamp(label: string, value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new CCFRollingOpportunityFeatureError(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function ledgerRef(ledger: CCFGameOpportunityLedger): string {
  return `ccf://game-opportunity-ledger/sha256/${fingerprintCCFGameOpportunityLedger(ledger)}`;
}

function assertCount(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new CCFRollingOpportunityFeatureError(
      `${label} must be a non-negative integer`,
    );
  }
}

function assertBoundedShare(label: string, value: number | null): void {
  if (value == null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new CCFRollingOpportunityFeatureError(
      `${label} must be null or within [0, 1]`,
    );
  }
}

function validatePlayerRow(row: CCFPlayerGameOpportunity): void {
  requireText("player.playerId", row.playerId);
  requireText("player.team", row.team);
  for (const [label, value] of [
    ["carries", row.carries],
    ["targets", row.targets],
    ["receptions", row.receptions],
    ["touches", row.touches],
    ["designedQbRushes", row.designedQbRushes],
    ["scrambles", row.scrambles],
    ["redZoneOpportunities", row.redZoneOpportunities],
    ["goalLineOpportunities", row.goalLineOpportunities],
    ["twoMinuteOpportunities", row.twoMinuteOpportunities],
    ["firstDownOpportunities", row.firstDownOpportunities],
  ] as const) {
    assertCount(`player.${label}`, value);
  }
  if (!Number.isFinite(row.airYards)) {
    throw new CCFRollingOpportunityFeatureError("player.airYards must be finite");
  }
  if (row.touches !== row.carries + row.receptions) {
    throw new CCFRollingOpportunityFeatureError(
      "player.touches must equal carries + receptions",
    );
  }
  for (const [label, value] of [
    ["carryShare", row.carryShare],
    ["targetShare", row.targetShare],
    ["carryTargetOpportunityShare", row.carryTargetOpportunityShare],
    ["redZoneOpportunityShare", row.redZoneOpportunityShare],
    ["goalLineOpportunityShare", row.goalLineOpportunityShare],
    ["twoMinuteOpportunityShare", row.twoMinuteOpportunityShare],
  ] as const) {
    assertBoundedShare(`player.${label}`, value);
  }
  if (row.airYardsShare != null && !Number.isFinite(row.airYardsShare)) {
    throw new CCFRollingOpportunityFeatureError(
      "player.airYardsShare must be null or finite",
    );
  }
  if (row.sourceRefs.length === 0 || row.sourceRefs.some((ref) => !ref.trim())) {
    throw new CCFRollingOpportunityFeatureError(
      "player.sourceRefs must contain non-empty evidence references",
    );
  }
}

function validateLedger(
  ledger: CCFGameOpportunityLedger,
  input: BuildCCFRollingOpportunityFeatureSetInput,
  seenGameIds: Set<string>,
): void {
  if (ledger.contractVersion !== "ccf-game-opportunity-ledger-v1") {
    throw new CCFRollingOpportunityFeatureError(
      "rolling opportunity features require ccf-game-opportunity-ledger-v1",
    );
  }
  requireText("ledger.gameId", ledger.gameId);
  requireText("ledger.sourceId", ledger.sourceId);
  if (seenGameIds.has(ledger.gameId)) {
    throw new CCFRollingOpportunityFeatureError(
      `duplicate prior game ledger ${ledger.gameId}`,
    );
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
  if (
    ledger.producerFamily !== "ccf_native_derived" ||
    ledger.evidenceKind !== "derived"
  ) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} must be CCF-native derived evidence`,
    );
  }

  const inputAsOfMs = timestamp("asOf", input.asOf);
  const ledgerAsOfMs = timestamp(`ledger ${ledger.gameId}.asOf`, ledger.asOf);
  const knownAtMs = timestamp(`ledger ${ledger.gameId}.knownAt`, ledger.knownAt);
  if (knownAtMs > ledgerAsOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} has knownAt later than its own asOf`,
    );
  }
  if (ledgerAsOfMs > inputAsOfMs || knownAtMs > inputAsOfMs) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} violates target temporal eligibility`,
    );
  }

  const playerMatches = ledger.players.filter((row) => row.playerId === input.playerId);
  if (playerMatches.length > 1) {
    throw new CCFRollingOpportunityFeatureError(
      `ledger ${ledger.gameId} contains duplicate rows for player ${input.playerId}`,
    );
  }
  if (playerMatches[0]) validatePlayerRow(playerMatches[0]);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function strictNullableMean(
  rows: readonly CCFPlayerGameOpportunity[],
  getter: (row: CCFPlayerGameOpportunity) => number | null,
): number | null {
  const values = rows.map(getter);
  if (values.some((value) => value == null)) return null;
  return mean(values as number[]);
}

function maxKnownAt(ledgers: readonly CCFGameOpportunityLedger[]): string | null {
  if (ledgers.length === 0) return null;
  return ledgers.reduce((latest, ledger) =>
    Date.parse(ledger.knownAt) > Date.parse(latest) ? ledger.knownAt : latest,
  ledgers[0].knownAt);
}

function available(
  key: string,
  value: number,
  unit: string,
  knownAt: string,
  sourceRefs: string[],
): CCFWeeklyFeatureEvidence {
  return {
    key,
    status: "available",
    value,
    unit,
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    knownAt,
    sourceRefs: [...sourceRefs].sort(),
  };
}

function missing(
  key: string,
  reason: string,
  sourceRefs: string[],
  knownAt?: string,
): CCFWeeklyFeatureEvidence {
  return {
    key,
    status: "missing",
    reason,
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    knownAt,
    sourceRefs: [...sourceRefs].sort(),
  };
}

function canonicalReceiptPayload(
  receipt: Omit<CCFRollingOpportunityFeatureReceipt, "receiptId">,
): string {
  return JSON.stringify({
    ...receipt,
    candidateGameIds: [...receipt.candidateGameIds].sort(),
    recordedOpportunityGameIds: [...receipt.recordedOpportunityGameIds].sort(),
    selectedGameIds: [...receipt.selectedGameIds].sort(),
    selectedWeeks: [...receipt.selectedWeeks].sort((a, b) => a - b),
    sourceRefs: [...receipt.sourceRefs].sort(),
  });
}

export function buildCCFRollingOpportunityFeatureSet(
  input: BuildCCFRollingOpportunityFeatureSetInput,
): CCFRollingOpportunityFeatureResult {
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
  timestamp("asOf", input.asOf);
  if (!Number.isInteger(input.windowGames) || input.windowGames < 1 || input.windowGames > 8) {
    throw new CCFRollingOpportunityFeatureError(
      "windowGames must be an integer within [1, 8]",
    );
  }

  const seenGameIds = new Set<string>();
  for (const ledger of input.ledgers) validateLedger(ledger, input, seenGameIds);

  const chronological = [...input.ledgers].sort((left, right) => {
    if (left.week !== right.week) return left.week - right.week;
    return left.gameId.localeCompare(right.gameId);
  });
  const recorded = chronological
    .map((ledger) => ({
      ledger,
      player: ledger.players.find((row) => row.playerId === input.playerId) ?? null,
    }))
    .filter(
      (entry): entry is { ledger: CCFGameOpportunityLedger; player: CCFPlayerGameOpportunity } =>
        entry.player != null,
    );

  const selected = [...recorded]
    .sort((left, right) => {
      if (left.ledger.week !== right.ledger.week) return right.ledger.week - left.ledger.week;
      return right.ledger.gameId.localeCompare(left.ledger.gameId);
    })
    .slice(0, input.windowGames)
    .sort((left, right) => {
      if (left.ledger.week !== right.ledger.week) return left.ledger.week - right.ledger.week;
      return left.ledger.gameId.localeCompare(right.ledger.gameId);
    });

  const candidateRefs = chronological.map(ledgerRef);
  const selectedLedgers = selected.map((entry) => entry.ledger);
  const selectedRows = selected.map((entry) => entry.player);
  const selectedRefs = selectedLedgers.map(ledgerRef);
  const candidateKnownAt = maxKnownAt(chronological) ?? input.asOf;
  const selectedKnownAt = maxKnownAt(selectedLedgers);
  const latestRecorded = recorded[recorded.length - 1] ?? null;

  const keys = CCF_ROLLING_OPPORTUNITY_FEATURE_KEYS_V1;
  const features: Record<string, CCFWeeklyFeatureEvidence> = {
    [keys.candidatePriorGames]: available(
      keys.candidatePriorGames,
      chronological.length,
      "games",
      candidateKnownAt,
      candidateRefs,
    ),
    [keys.recordedOpportunityGames]: available(
      keys.recordedOpportunityGames,
      recorded.length,
      "games_with_recorded_opportunity",
      candidateKnownAt,
      candidateRefs,
    ),
    [keys.selectedGames]: available(
      keys.selectedGames,
      selected.length,
      "games",
      candidateKnownAt,
      selectedRefs,
    ),
  };

  if (latestRecorded) {
    features[keys.weeksSinceLatestRecordedGame] = available(
      keys.weeksSinceLatestRecordedGame,
      input.week - latestRecorded.ledger.week,
      "weeks",
      candidateKnownAt,
      [ledgerRef(latestRecorded.ledger)],
    );
  } else {
    features[keys.weeksSinceLatestRecordedGame] = missing(
      keys.weeksSinceLatestRecordedGame,
      "no_prior_recorded_opportunity_game",
      candidateRefs,
      candidateKnownAt,
    );
  }

  const metricKeys = [
    keys.carriesPerRecordedGame,
    keys.targetsPerRecordedGame,
    keys.receptionsPerRecordedGame,
    keys.touchesPerRecordedGame,
    keys.airYardsPerRecordedGame,
    keys.designedQbRushesPerRecordedGame,
    keys.scramblesPerRecordedGame,
    keys.meanCarryShare,
    keys.meanTargetShare,
    keys.meanCarryTargetOpportunityShare,
    keys.meanAirYardsShare,
    keys.redZoneOpportunitiesPerRecordedGame,
    keys.meanRedZoneOpportunityShare,
    keys.goalLineOpportunitiesPerRecordedGame,
    keys.meanGoalLineOpportunityShare,
    keys.twoMinuteOpportunitiesPerRecordedGame,
    keys.meanTwoMinuteOpportunityShare,
    keys.firstDownOpportunitiesPerRecordedGame,
  ];

  if (selected.length === 0 || !selectedKnownAt) {
    for (const key of metricKeys) {
      features[key] = missing(
        key,
        "no_prior_recorded_opportunity_games_in_window",
        candidateRefs,
        candidateKnownAt,
      );
    }
  } else {
    const perGame = (
      key: string,
      getter: (row: CCFPlayerGameOpportunity) => number,
      unit: string,
    ) => {
      features[key] = available(
        key,
        mean(selectedRows.map(getter)),
        unit,
        selectedKnownAt,
        selectedRefs,
      );
    };
    const share = (
      key: string,
      getter: (row: CCFPlayerGameOpportunity) => number | null,
    ) => {
      const value = strictNullableMean(selectedRows, getter);
      features[key] = value == null
        ? missing(
            key,
            "share_denominator_unavailable_in_one_or_more_selected_games",
            selectedRefs,
            selectedKnownAt,
          )
        : available(key, value, "share", selectedKnownAt, selectedRefs);
    };

    perGame(keys.carriesPerRecordedGame, (row) => row.carries, "per_recorded_game");
    perGame(keys.targetsPerRecordedGame, (row) => row.targets, "per_recorded_game");
    perGame(keys.receptionsPerRecordedGame, (row) => row.receptions, "per_recorded_game");
    perGame(keys.touchesPerRecordedGame, (row) => row.touches, "per_recorded_game");
    perGame(keys.airYardsPerRecordedGame, (row) => row.airYards, "yards_per_recorded_game");
    perGame(
      keys.designedQbRushesPerRecordedGame,
      (row) => row.designedQbRushes,
      "per_recorded_game",
    );
    perGame(keys.scramblesPerRecordedGame, (row) => row.scrambles, "per_recorded_game");
    share(keys.meanCarryShare, (row) => row.carryShare);
    share(keys.meanTargetShare, (row) => row.targetShare);
    share(keys.meanCarryTargetOpportunityShare, (row) => row.carryTargetOpportunityShare);
    share(keys.meanAirYardsShare, (row) => row.airYardsShare);
    perGame(
      keys.redZoneOpportunitiesPerRecordedGame,
      (row) => row.redZoneOpportunities,
      "per_recorded_game",
    );
    share(keys.meanRedZoneOpportunityShare, (row) => row.redZoneOpportunityShare);
    perGame(
      keys.goalLineOpportunitiesPerRecordedGame,
      (row) => row.goalLineOpportunities,
      "per_recorded_game",
    );
    share(keys.meanGoalLineOpportunityShare, (row) => row.goalLineOpportunityShare);
    perGame(
      keys.twoMinuteOpportunitiesPerRecordedGame,
      (row) => row.twoMinuteOpportunities,
      "per_recorded_game",
    );
    share(keys.meanTwoMinuteOpportunityShare, (row) => row.twoMinuteOpportunityShare);
    perGame(
      keys.firstDownOpportunitiesPerRecordedGame,
      (row) => row.firstDownOpportunities,
      "per_recorded_game",
    );
  }

  const featureSet = validateCCFWeeklyNativeFeatureSet({
    playerId: input.playerId,
    position: input.position,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    features,
  });

  const receiptPayload: Omit<CCFRollingOpportunityFeatureReceipt, "receiptId"> = {
    contractVersion: "ccf-rolling-opportunity-feature-receipt-v1",
    playerId: input.playerId,
    position: input.position,
    season: input.season,
    week: input.week,
    asOf: input.asOf,
    windowGames: input.windowGames,
    candidatePriorGameCount: chronological.length,
    recordedOpportunityGameCount: recorded.length,
    selectedGameCount: selected.length,
    candidateGameIds: chronological.map((ledger) => ledger.gameId),
    recordedOpportunityGameIds: recorded.map((entry) => entry.ledger.gameId),
    selectedGameIds: selected.map((entry) => entry.ledger.gameId),
    selectedWeeks: selected.map((entry) => entry.ledger.week),
    latestEvidenceKnownAt: maxKnownAt(chronological),
    sourceRefs: candidateRefs,
    absenceSemantics: "not_imputed",
  };
  const receiptHash = crypto
    .createHash("sha256")
    .update(canonicalReceiptPayload(receiptPayload))
    .digest("hex");

  return {
    receipt: {
      ...receiptPayload,
      receiptId: `ccf://rolling-opportunity-features/sha256/${receiptHash}`,
    },
    featureSet,
  };
}
