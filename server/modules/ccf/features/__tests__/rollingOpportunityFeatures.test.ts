import type {
  CCFGameOpportunityLedger,
  CCFPlayerGameOpportunity,
  CCFTeamGameOpportunity,
} from "../playByPlayOpportunity";
import {
  CCF_ROLLING_OPPORTUNITY_FEATURE_KEYS_V1,
  buildCCFRollingOpportunityFeatureSet,
} from "../rollingOpportunityFeatures";

function team(teamId = "AAA"): CCFTeamGameOpportunity {
  return {
    team: teamId,
    offensivePlays: 60,
    dropbacks: 35,
    rushAttempts: 25,
    targets: 30,
    receptions: 20,
    airYards: 240,
    redZoneOpportunities: 10,
    goalLineOpportunities: 4,
    twoMinuteOpportunities: 8,
    firstDownOpportunities: 20,
    opportunitiesWhileLeading: 15,
    opportunitiesWhileTied: 5,
    opportunitiesWhileTrailing: 15,
    sourceRefs: ["ccf://fixture/team"],
  };
}

function player(
  week: number,
  overrides: Partial<CCFPlayerGameOpportunity> = {},
): CCFPlayerGameOpportunity {
  const carries = overrides.carries ?? week * 2;
  const targets = overrides.targets ?? week * 2 + 2;
  const receptions = overrides.receptions ?? week + 1;
  return {
    playerId: "ccf-player-1",
    team: "AAA",
    carries,
    targets,
    receptions,
    touches: carries + receptions,
    airYards: overrides.airYards ?? week * 20,
    designedQbRushes: overrides.designedQbRushes ?? 0,
    scrambles: overrides.scrambles ?? 0,
    redZoneCarries: overrides.redZoneCarries ?? week,
    redZoneTargets: overrides.redZoneTargets ?? 1,
    redZoneOpportunities: overrides.redZoneOpportunities ?? week + 1,
    goalLineCarries: overrides.goalLineCarries ?? 1,
    goalLineTargets: overrides.goalLineTargets ?? 0,
    goalLineOpportunities: overrides.goalLineOpportunities ?? 1,
    twoMinuteCarries: overrides.twoMinuteCarries ?? 0,
    twoMinuteTargets: overrides.twoMinuteTargets ?? 1,
    twoMinuteOpportunities: overrides.twoMinuteOpportunities ?? 1,
    firstDownCarries: overrides.firstDownCarries ?? 1,
    firstDownTargets: overrides.firstDownTargets ?? 1,
    firstDownOpportunities: overrides.firstDownOpportunities ?? 2,
    opportunitiesWhileLeading: overrides.opportunitiesWhileLeading ?? 2,
    opportunitiesWhileTied: overrides.opportunitiesWhileTied ?? 1,
    opportunitiesWhileTrailing: overrides.opportunitiesWhileTrailing ?? 3,
    carryShare: overrides.carryShare ?? week / 10,
    targetShare: overrides.targetShare ?? week / 10 + 0.1,
    carryTargetOpportunityShare:
      overrides.carryTargetOpportunityShare ?? week / 10 + 0.05,
    airYardsShare: overrides.airYardsShare ?? week / 10 + 0.02,
    redZoneOpportunityShare: overrides.redZoneOpportunityShare ?? week / 10,
    goalLineOpportunityShare: overrides.goalLineOpportunityShare ?? week / 10,
    twoMinuteOpportunityShare: overrides.twoMinuteOpportunityShare ?? week / 10,
    sourceRefs: overrides.sourceRefs ?? [`ccf://fixture/player/week-${week}`],
  };
}

function ledger(
  week: number,
  options: {
    withPlayer?: boolean;
    playerOverrides?: Partial<CCFPlayerGameOpportunity>;
    season?: number;
    knownAt?: string;
    asOf?: string;
    gameId?: string;
  } = {},
): CCFGameOpportunityLedger {
  const knownAt = options.knownAt ?? `2026-09-${String(week + 1).padStart(2, "0")}T12:00:00Z`;
  return {
    contractVersion: "ccf-game-opportunity-ledger-v1",
    gameId: options.gameId ?? `2026_0${week}_AAA_BBB`,
    season: options.season ?? 2026,
    week,
    asOf: options.asOf ?? knownAt,
    knownAt,
    sourceId: "nflverse-pbp-opportunity-v3",
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    teams: [team()],
    players:
      options.withPlayer === false
        ? []
        : [player(week, options.playerOverrides)],
  };
}

function availableValue(
  result: ReturnType<typeof buildCCFRollingOpportunityFeatureSet>,
  key: string,
): number {
  const feature = result.featureSet.features[key];
  expect(feature?.status).toBe("available");
  if (!feature || feature.status !== "available") {
    throw new Error(`${key} was not available`);
  }
  return feature.value;
}

describe("rolling prior-game opportunity features", () => {
  const keys = CCF_ROLLING_OPPORTUNITY_FEATURE_KEYS_V1;

  it("uses only the most recent recorded-opportunity games and never imputes absent ledgers as zero", () => {
    const result = buildCCFRollingOpportunityFeatureSet({
      playerId: "ccf-player-1",
      position: "RB",
      season: 2026,
      week: 5,
      asOf: "2026-10-01T12:00:00Z",
      windowGames: 2,
      ledgers: [
        ledger(1),
        ledger(2),
        ledger(3, { withPlayer: false }),
        ledger(4),
      ],
    });

    expect(availableValue(result, keys.candidatePriorGames)).toBe(4);
    expect(availableValue(result, keys.recordedOpportunityGames)).toBe(3);
    expect(availableValue(result, keys.selectedGames)).toBe(2);
    expect(availableValue(result, keys.weeksSinceLatestRecordedGame)).toBe(1);

    // Window is weeks 2 and 4. The absent week-3 ledger is not a fake zero.
    expect(availableValue(result, keys.carriesPerRecordedGame)).toBe(6);
    expect(availableValue(result, keys.targetsPerRecordedGame)).toBe(8);
    expect(availableValue(result, keys.meanCarryShare)).toBeCloseTo(0.3);
    expect(availableValue(result, keys.meanTargetShare)).toBeCloseTo(0.4);
    expect(availableValue(result, keys.redZoneOpportunitiesPerRecordedGame)).toBe(4);

    expect(result.receipt).toMatchObject({
      candidatePriorGameCount: 4,
      recordedOpportunityGameCount: 3,
      selectedGameCount: 2,
      selectedWeeks: [2, 4],
      absenceSemantics: "not_imputed",
    });
    expect(result.receipt.recordedOpportunityGameIds).not.toContain("2026_03_AAA_BBB");
    expect(result.receipt.receiptId).toMatch(
      /^ccf:\/\/rolling-opportunity-features\/sha256\/[a-f0-9]{64}$/,
    );
  });

  it("keeps performance metrics missing when prior ledgers exist but the player has no recorded opportunity row", () => {
    const result = buildCCFRollingOpportunityFeatureSet({
      playerId: "ccf-player-1",
      position: "WR",
      season: 2026,
      week: 4,
      asOf: "2026-10-01T12:00:00Z",
      windowGames: 3,
      ledgers: [
        ledger(1, { withPlayer: false }),
        ledger(2, { withPlayer: false }),
      ],
    });

    expect(availableValue(result, keys.candidatePriorGames)).toBe(2);
    expect(availableValue(result, keys.recordedOpportunityGames)).toBe(0);
    expect(availableValue(result, keys.selectedGames)).toBe(0);
    expect(result.featureSet.features[keys.carriesPerRecordedGame]).toMatchObject({
      status: "missing",
      reason: "no_prior_recorded_opportunity_games_in_window",
    });
    expect(result.featureSet.features[keys.weeksSinceLatestRecordedGame]).toMatchObject({
      status: "missing",
      reason: "no_prior_recorded_opportunity_game",
    });
  });

  it("fails closed on same-week, future-known, and cross-season ledgers", () => {
    const base = {
      playerId: "ccf-player-1",
      position: "RB" as const,
      season: 2026,
      week: 5,
      asOf: "2026-10-01T12:00:00Z",
      windowGames: 2,
    };

    expect(() =>
      buildCCFRollingOpportunityFeatureSet({
        ...base,
        ledgers: [ledger(5)],
      }),
    ).toThrow(/strictly before target week/);

    expect(() =>
      buildCCFRollingOpportunityFeatureSet({
        ...base,
        ledgers: [
          ledger(4, {
            knownAt: "2026-10-02T12:00:00Z",
            asOf: "2026-10-02T12:00:00Z",
          }),
        ],
      }),
    ).toThrow(/target temporal eligibility/);

    expect(() =>
      buildCCFRollingOpportunityFeatureSet({
        ...base,
        ledgers: [ledger(4, { season: 2025 })],
      }),
    ).toThrow(/outside target season/);
  });

  it("does not turn a missing share denominator into a neutral zero", () => {
    const result = buildCCFRollingOpportunityFeatureSet({
      playerId: "ccf-player-1",
      position: "WR",
      season: 2026,
      week: 5,
      asOf: "2026-10-01T12:00:00Z",
      windowGames: 2,
      ledgers: [
        ledger(2, { playerOverrides: { targetShare: null } }),
        ledger(4, { playerOverrides: { targetShare: 0.5 } }),
      ],
    });

    expect(result.featureSet.features[keys.meanTargetShare]).toMatchObject({
      status: "missing",
      reason: "share_denominator_unavailable_in_one_or_more_selected_games",
    });
    expect(availableValue(result, keys.targetsPerRecordedGame)).toBe(8);
  });

  it("fingerprints the same evidence deterministically regardless of caller ledger ordering", () => {
    const input = {
      playerId: "ccf-player-1",
      position: "TE" as const,
      season: 2026,
      week: 5,
      asOf: "2026-10-01T12:00:00Z",
      windowGames: 3,
    };
    const ordered = [ledger(1), ledger(2), ledger(4)];
    const reversed = [...ordered].reverse();

    const left = buildCCFRollingOpportunityFeatureSet({
      ...input,
      ledgers: ordered,
    });
    const right = buildCCFRollingOpportunityFeatureSet({
      ...input,
      ledgers: reversed,
    });

    expect(left.receipt.receiptId).toBe(right.receipt.receiptId);
    expect(left.featureSet.features).toEqual(right.featureSet.features);
  });
});
