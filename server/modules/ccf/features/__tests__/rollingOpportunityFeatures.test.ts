import type {
  CCFGameOpportunityLedger,
  CCFPlayerGameOpportunity,
  CCFTeamGameOpportunity,
} from "../playByPlayOpportunity";
import {
  buildCCFRollingOpportunityFeatures,
  type CCFPriorGameOpportunityEvidence,
} from "../rollingOpportunityFeatures";

function team(overrides: Partial<CCFTeamGameOpportunity> = {}): CCFTeamGameOpportunity {
  return {
    team: "AAA",
    offensivePlays: 60,
    dropbacks: 35,
    rushAttempts: 25,
    targets: 30,
    receptions: 20,
    airYards: 250,
    redZoneOpportunities: 10,
    goalLineOpportunities: 4,
    twoMinuteOpportunities: 8,
    firstDownOpportunities: 15,
    opportunitiesWhileLeading: 10,
    opportunitiesWhileTied: 8,
    opportunitiesWhileTrailing: 12,
    sourceRefs: ["ccf://game/team"],
    ...overrides,
  };
}

function player(
  overrides: Partial<CCFPlayerGameOpportunity> = {},
): CCFPlayerGameOpportunity {
  return {
    playerId: "ccf-player-1",
    team: "AAA",
    carries: 2,
    targets: 6,
    receptions: 4,
    touches: 6,
    airYards: 60,
    designedQbRushes: 0,
    scrambles: 0,
    redZoneCarries: 1,
    redZoneTargets: 2,
    redZoneOpportunities: 3,
    goalLineCarries: 0,
    goalLineTargets: 1,
    goalLineOpportunities: 1,
    twoMinuteCarries: 0,
    twoMinuteTargets: 2,
    twoMinuteOpportunities: 2,
    firstDownCarries: 1,
    firstDownTargets: 2,
    firstDownOpportunities: 3,
    opportunitiesWhileLeading: 1,
    opportunitiesWhileTied: 2,
    opportunitiesWhileTrailing: 5,
    carryShare: 0.08,
    targetShare: 0.2,
    carryTargetOpportunityShare: 8 / 55,
    airYardsShare: 0.24,
    redZoneOpportunityShare: 0.3,
    goalLineOpportunityShare: 0.25,
    twoMinuteOpportunityShare: 0.25,
    sourceRefs: ["ccf://game/player"],
    ...overrides,
  };
}

function ledger(options: {
  gameId: string;
  week: number;
  knownAt: string;
  playerRow?: CCFPlayerGameOpportunity | null;
  teamRow?: CCFTeamGameOpportunity;
}): CCFGameOpportunityLedger {
  return {
    contractVersion: "ccf-game-opportunity-ledger-v1",
    gameId: options.gameId,
    season: 2026,
    week: options.week,
    asOf: options.knownAt,
    knownAt: options.knownAt,
    sourceId: "qualified-pbp-v3",
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    teams: [options.teamRow ?? team()],
    players: options.playerRow === null ? [] : [options.playerRow ?? player()],
  };
}

function observed(
  game: CCFGameOpportunityLedger,
): CCFPriorGameOpportunityEvidence {
  return {
    ledger: game,
    applicability: {
      status: "observed_opportunity",
      team: "AAA",
    },
  };
}

function baseInput(history: CCFPriorGameOpportunityEvidence[]) {
  return {
    playerId: "ccf-player-1",
    position: "WR" as const,
    season: 2026,
    week: 3,
    asOf: "2026-09-20T12:00:00Z",
    historyCompleteEvidence: true as const,
    historyCompleteEvidenceRef: "ccf://history-complete/player-1/week-3",
    historyCompleteEvidenceKnownAt: "2026-09-20T11:00:00Z",
    history,
  };
}

describe("rolling prior-game opportunity features", () => {
  it("builds recency-ordered up-to-N means from prior canonical ledgers", () => {
    const week1 = ledger({
      gameId: "2026_01_AAA_BBB",
      week: 1,
      knownAt: "2026-09-08T04:00:00Z",
      playerRow: player({
        targets: 6,
        carries: 2,
        touches: 6,
        targetShare: 0.2,
        sourceRefs: ["ccf://game/week1/player"],
      }),
    });
    const week2 = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-15T04:00:00Z",
      playerRow: player({
        targets: 9,
        carries: 1,
        touches: 7,
        targetShare: 0.3,
        sourceRefs: ["ccf://game/week2/player"],
      }),
    });

    const featureSet = buildCCFRollingOpportunityFeatures({
      ...baseInput([observed(week1), observed(week2)]),
      windows: [1, 3],
    });

    expect(featureSet.features["opportunity.prior_up_to_1.sample_games"]).toMatchObject({
      status: "available",
      value: 1,
    });
    expect(featureSet.features["opportunity.prior_up_to_1.targets_mean"]).toMatchObject({
      status: "available",
      value: 9,
    });
    expect(featureSet.features["opportunity.prior_up_to_3.sample_games"]).toMatchObject({
      status: "available",
      value: 2,
    });
    expect(featureSet.features["opportunity.prior_up_to_3.targets_mean"]).toMatchObject({
      status: "available",
      value: 7.5,
    });
    expect(featureSet.features["opportunity.prior_up_to_3.target_share_mean"]).toMatchObject({
      status: "available",
      value: 0.25,
      producerFamily: "ccf_native_derived",
      evidenceKind: "derived",
    });
    expect(
      featureSet.features["opportunity.prior_up_to_3.targets_mean"].sourceRefs,
    ).toEqual(expect.arrayContaining([
      "ccf://history-complete/player-1/week-3",
      "ccf://game/week1/player",
      "ccf://game/week2/player",
    ]));
  });

  it("treats an absent player as zero only with explicit participation evidence", () => {
    const week1 = ledger({
      gameId: "2026_01_AAA_BBB",
      week: 1,
      knownAt: "2026-09-08T04:00:00Z",
    });
    const week2 = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-15T04:00:00Z",
      playerRow: null,
    });

    const featureSet = buildCCFRollingOpportunityFeatures({
      ...baseInput([
        observed(week1),
        {
          ledger: week2,
          applicability: {
            status: "observed_participation_zero_opportunity",
            team: "AAA",
            knownAt: "2026-09-15T05:00:00Z",
            sourceRefs: ["ccf://workload/week2/player-1"],
          },
        },
      ]),
      windows: [1],
    });

    expect(featureSet.features["opportunity.prior_up_to_1.targets_mean"]).toMatchObject({
      status: "available",
      value: 0,
    });
    expect(featureSet.features["opportunity.prior_up_to_1.carries_mean"]).toMatchObject({
      status: "available",
      value: 0,
    });
    expect(featureSet.features["opportunity.prior_up_to_1.target_share_mean"]).toMatchObject({
      status: "available",
      value: 0,
    });
    expect(
      featureSet.features["opportunity.prior_up_to_1.targets_mean"].sourceRefs,
    ).toContain("ccf://workload/week2/player-1");
  });

  it("fails closed instead of silently coercing an absent player to zero", () => {
    const missing = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-15T04:00:00Z",
      playerRow: null,
    });

    expect(() =>
      buildCCFRollingOpportunityFeatures({
        ...baseInput([observed(missing)]),
        windows: [1],
      }),
    ).toThrow(/zero role requires explicit participation evidence/);
  });

  it("excludes explicitly not-applicable games rather than diluting role", () => {
    const week1 = ledger({
      gameId: "2026_01_AAA_BBB",
      week: 1,
      knownAt: "2026-09-08T04:00:00Z",
      playerRow: player({ targets: 8, targetShare: 0.25 }),
    });
    const inactiveWeek2 = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-15T04:00:00Z",
      playerRow: null,
    });

    const featureSet = buildCCFRollingOpportunityFeatures({
      ...baseInput([
        observed(week1),
        {
          ledger: inactiveWeek2,
          applicability: {
            status: "not_applicable",
            team: "AAA",
            knownAt: "2026-09-15T03:00:00Z",
            sourceRefs: ["ccf://inactive/week2/player-1"],
          },
        },
      ]),
      windows: [1, 3],
    });

    expect(featureSet.features["opportunity.prior_up_to_1.sample_games"]).toMatchObject({
      status: "available",
      value: 1,
    });
    expect(featureSet.features["opportunity.prior_up_to_1.targets_mean"]).toMatchObject({
      status: "available",
      value: 8,
    });
    expect(featureSet.features["opportunity.prior_up_to_3.sample_games"]).toMatchObject({
      status: "available",
      value: 1,
    });
  });

  it("returns explicit missing metrics when no applicable prior games exist", () => {
    const inactive = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-15T04:00:00Z",
      playerRow: null,
    });

    const featureSet = buildCCFRollingOpportunityFeatures({
      ...baseInput([
        {
          ledger: inactive,
          applicability: {
            status: "not_applicable",
            team: "AAA",
            knownAt: "2026-09-15T03:00:00Z",
            sourceRefs: ["ccf://inactive/week2/player-1"],
          },
        },
      ]),
      windows: [3],
    });

    expect(featureSet.features["opportunity.prior_up_to_3.sample_games"]).toMatchObject({
      status: "available",
      value: 0,
    });
    expect(featureSet.features["opportunity.prior_up_to_3.targets_mean"]).toMatchObject({
      status: "missing",
      reason: "no_applicable_prior_games",
    });
  });

  it("rejects current/future ledgers and temporally ineligible evidence", () => {
    const currentWeek = ledger({
      gameId: "2026_03_AAA_DDD",
      week: 3,
      knownAt: "2026-09-20T04:00:00Z",
    });

    expect(() =>
      buildCCFRollingOpportunityFeatures({
        ...baseInput([observed(currentWeek)]),
        windows: [1],
      }),
    ).toThrow(/not strictly prior/);

    const futureKnownAt = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-21T04:00:00Z",
    });
    expect(() =>
      buildCCFRollingOpportunityFeatures({
        ...baseInput([observed(futureKnownAt)]),
        windows: [1],
      }),
    ).toThrow(/knownAt > asOf/);
  });

  it("requires zero-opportunity participation evidence to be learned after the game ledger", () => {
    const week2 = ledger({
      gameId: "2026_02_AAA_CCC",
      week: 2,
      knownAt: "2026-09-15T04:00:00Z",
      playerRow: null,
    });

    expect(() =>
      buildCCFRollingOpportunityFeatures({
        ...baseInput([
          {
            ledger: week2,
            applicability: {
              status: "observed_participation_zero_opportunity",
              team: "AAA",
              knownAt: "2026-09-15T03:00:00Z",
              sourceRefs: ["ccf://workload/week2/player-1"],
            },
          },
        ]),
        windows: [1],
      }),
    ).toThrow(/cannot predate the game ledger/);
  });
});
