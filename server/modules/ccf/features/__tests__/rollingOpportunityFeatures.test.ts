import type {
  CCFGameOpportunityLedger,
  CCFPlayerGameOpportunity,
  CCFTeamGameOpportunity,
} from "../playByPlayOpportunity";
import {
  CCF_ROLLING_OPPORTUNITY_HISTORY_KEYS_V2,
  CCFRollingOpportunityFeatureError,
  buildCCFRollingOpportunityFeaturesV2,
  ccfRollingOpportunityWindowKeysV2,
  type BuildCCFRollingOpportunityFeaturesInput,
  type CCFPriorGameOpportunityEvidence,
} from "../rollingOpportunityFeatures";

function knownAtForWeek(week: number): string {
  const day = 1 + week * 7;
  return `2026-09-${String(day).padStart(2, "0")}T12:00:00Z`;
}

function team(
  week: number,
  overrides: Partial<CCFTeamGameOpportunity> = {},
): CCFTeamGameOpportunity {
  return {
    team: "AAA",
    offensivePlays: 60,
    dropbacks: 40,
    rushAttempts: 20,
    targets: 10,
    receptions: 7,
    airYards: 100,
    redZoneOpportunities: 4,
    goalLineOpportunities: 2,
    twoMinuteOpportunities: 2,
    firstDownOpportunities: 15,
    opportunitiesWhileLeading: 12,
    opportunitiesWhileTied: 8,
    opportunitiesWhileTrailing: 10,
    sourceRefs: [`fixture://team/week-${week}`],
    ...overrides,
  };
}

function player(
  week: number,
  overrides: Partial<CCFPlayerGameOpportunity> = {},
): CCFPlayerGameOpportunity {
  return {
    playerId: "P1",
    team: "AAA",
    carries: 8,
    targets: 2,
    receptions: 2,
    touches: 10,
    airYards: 20,
    designedQbRushes: 0,
    scrambles: 0,
    redZoneCarries: 1,
    redZoneTargets: 1,
    redZoneOpportunities: 2,
    goalLineCarries: 1,
    goalLineTargets: 0,
    goalLineOpportunities: 1,
    twoMinuteCarries: 0,
    twoMinuteTargets: 1,
    twoMinuteOpportunities: 1,
    firstDownCarries: 3,
    firstDownTargets: 1,
    firstDownOpportunities: 4,
    opportunitiesWhileLeading: 1,
    opportunitiesWhileTied: 1,
    opportunitiesWhileTrailing: 0,
    carryShare: 0.4,
    targetShare: 0.2,
    carryTargetOpportunityShare: 1 / 3,
    airYardsShare: 0.2,
    redZoneOpportunityShare: 0.5,
    goalLineOpportunityShare: 0.5,
    twoMinuteOpportunityShare: 0.5,
    sourceRefs: [`fixture://player/P1/week-${week}`],
    ...overrides,
  };
}

function ledger(
  week: number,
  playerRow: CCFPlayerGameOpportunity | null,
  options: {
    season?: number;
    knownAt?: string;
    asOf?: string;
    teamOverrides?: Partial<CCFTeamGameOpportunity>;
  } = {},
): CCFGameOpportunityLedger {
  const season = options.season ?? 2026;
  const knownAt = options.knownAt ?? knownAtForWeek(week);
  return {
    contractVersion: "ccf-game-opportunity-ledger-v1",
    gameId: `${season}_${String(week).padStart(2, "0")}_BBB_AAA`,
    season,
    week,
    asOf: options.asOf ?? knownAt.replace("12:00:00Z", "13:00:00Z"),
    knownAt,
    sourceId: "fixture://qualified-pbp",
    producerFamily: "ccf_native_derived",
    evidenceKind: "derived",
    teams: [team(week, options.teamOverrides)],
    players: playerRow ? [playerRow] : [],
  };
}

function observed(
  week: number,
  playerOverrides: Partial<CCFPlayerGameOpportunity> = {},
): CCFPriorGameOpportunityEvidence {
  return {
    ledger: ledger(week, player(week, playerOverrides)),
    applicability: { status: "observed_opportunity", team: "AAA" },
  };
}

function zero(
  week: number,
  teamOverrides: Partial<CCFTeamGameOpportunity> = {},
  knownAt = knownAtForWeek(week).replace("12:00:00Z", "14:00:00Z"),
): CCFPriorGameOpportunityEvidence {
  return {
    ledger: ledger(week, null, { teamOverrides }),
    applicability: {
      status: "observed_participation_zero_opportunity",
      team: "AAA",
      knownAt,
      sourceRefs: [`fixture://participation/P1/week-${week}`],
    },
  };
}

function inactive(week: number): CCFPriorGameOpportunityEvidence {
  return {
    ledger: ledger(week, null),
    applicability: {
      status: "not_applicable",
      team: "AAA",
      knownAt: knownAtForWeek(week).replace("12:00:00Z", "14:00:00Z"),
      sourceRefs: [`fixture://inactive/P1/week-${week}`],
    },
  };
}

function input(
  overrides: Partial<BuildCCFRollingOpportunityFeaturesInput> = {},
): BuildCCFRollingOpportunityFeaturesInput {
  return {
    playerId: "P1",
    position: "RB",
    season: 2026,
    week: 4,
    asOf: "2026-09-24T12:00:00Z",
    historyCompleteEvidence: true,
    historyCompleteEvidenceRef: "fixture://history-complete/P1/week-4",
    historyCompleteEvidenceKnownAt: "2026-09-23T12:00:00Z",
    windows: [1, 3],
    history: [observed(1), zero(2), inactive(3)],
    ...overrides,
  };
}

describe("CCF rolling opportunity features v2", () => {
  it("includes observed zero-opportunity participation and excludes confirmed non-applicable games", () => {
    const result = buildCCFRollingOpportunityFeaturesV2(input());
    const history = CCF_ROLLING_OPPORTUNITY_HISTORY_KEYS_V2;
    const one = ccfRollingOpportunityWindowKeysV2(1);
    const three = ccfRollingOpportunityWindowKeysV2(3);

    expect(result.receipt).toMatchObject({
      contractVersion: "ccf-rolling-opportunity-feature-receipt-v2",
      candidatePriorGameCount: 3,
      applicableGameCount: 2,
      observedOpportunityGameCount: 1,
      observedZeroOpportunityGameCount: 1,
      notApplicableGameCount: 1,
      absenceSemantics: "explicit_applicability_only",
      seasonBoundary: "same_season_only",
    });
    expect(result.receipt.receiptId).toMatch(
      /^ccf:\/\/rolling-opportunity-features-v2\/sha256\/[a-f0-9]{64}$/,
    );

    expect(result.featureSet.features[history.candidatePriorGames]).toMatchObject({
      status: "available",
      value: 3,
    });
    expect(result.featureSet.features[history.applicableGames]).toMatchObject({
      status: "available",
      value: 2,
    });
    expect(result.featureSet.features[history.weeksSinceLatestApplicableGame]).toMatchObject({
      status: "available",
      value: 2,
    });

    expect(result.featureSet.features[one.sampleGames]).toMatchObject({
      status: "available",
      value: 1,
    });
    expect(result.featureSet.features[one.observedZeroOpportunityGames]).toMatchObject({
      status: "available",
      value: 1,
    });
    expect(result.featureSet.features[one.carriesMean]).toMatchObject({
      status: "available",
      value: 0,
    });

    expect(result.featureSet.features[three.sampleGames]).toMatchObject({
      status: "available",
      value: 2,
    });
    expect(result.featureSet.features[three.carriesMean]).toMatchObject({
      status: "available",
      value: 4,
    });
    expect(result.featureSet.features[three.targetsMean]).toMatchObject({
      status: "available",
      value: 1,
    });
    expect(result.featureSet.features[three.receptionsMean]).toMatchObject({
      status: "available",
      value: 1,
    });
    expect(result.featureSet.features[three.carryShareMean]).toMatchObject({
      status: "available",
      value: 0.2,
    });
  });

  it("is deterministic when candidate history arrives in a different order", () => {
    const original = buildCCFRollingOpportunityFeaturesV2(input());
    const reversed = buildCCFRollingOpportunityFeaturesV2(
      input({ history: [...input().history].reverse() }),
    );

    expect(reversed.receipt.receiptId).toBe(original.receipt.receiptId);
    expect(reversed.receipt).toEqual(original.receipt);
    expect(reversed.featureSet).toEqual(original.featureSet);
  });

  it("does not turn an absent player row into a zero without participation evidence", () => {
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [
            {
              ledger: ledger(1, null),
              applicability: { status: "observed_opportunity", team: "AAA" },
            },
          ],
          historyCompleteEvidenceKnownAt: "2026-09-09T12:00:00Z",
        }),
      ),
    ).toThrow(/zero role requires explicit participation evidence/);
  });

  it("rejects contradictory zero or inactive classifications when opportunity evidence exists", () => {
    const baseLedger = ledger(1, player(1));
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [
            {
              ledger: baseLedger,
              applicability: {
                status: "observed_participation_zero_opportunity",
                team: "AAA",
                knownAt: "2026-09-08T14:00:00Z",
                sourceRefs: ["fixture://participation"],
              },
            },
          ],
          historyCompleteEvidenceKnownAt: "2026-09-09T12:00:00Z",
        }),
      ),
    ).toThrow(/zero-opportunity status is contradictory/);

    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [
            {
              ledger: baseLedger,
              applicability: {
                status: "not_applicable",
                team: "AAA",
                knownAt: "2026-09-08T14:00:00Z",
                sourceRefs: ["fixture://inactive"],
              },
            },
          ],
          historyCompleteEvidenceKnownAt: "2026-09-09T12:00:00Z",
        }),
      ),
    ).toThrow(/marked not_applicable/);
  });

  it("fails closed across season boundaries and on same/future target-week evidence", () => {
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [
            {
              ledger: ledger(1, player(1), { season: 2025 }),
              applicability: { status: "observed_opportunity", team: "AAA" },
            },
          ],
        }),
      ),
    ).toThrow(/outside target season/);

    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [
            {
              ledger: ledger(4, player(4)),
              applicability: { status: "observed_opportunity", team: "AAA" },
            },
          ],
        }),
      ),
    ).toThrow(/strictly before target week/);
  });

  it("rejects future applicability evidence and stale completeness claims", () => {
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [zero(1, {}, "2026-09-25T00:00:00Z")],
          historyCompleteEvidenceKnownAt: "2026-09-23T12:00:00Z",
        }),
      ),
    ).toThrow(/known after target asOf/);

    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(
        input({
          history: [observed(1), zero(2)],
          historyCompleteEvidenceKnownAt: "2026-09-10T00:00:00Z",
        }),
      ),
    ).toThrow(/completeness evidence cannot predate/);
  });

  it("keeps a rolling share missing if any selected game lacks its denominator", () => {
    const result = buildCCFRollingOpportunityFeaturesV2(
      input({
        windows: [2],
        history: [observed(1), zero(2, { targets: 0 })],
      }),
    );
    const keys = ccfRollingOpportunityWindowKeysV2(2);

    expect(result.featureSet.features[keys.targetShareMean]).toMatchObject({
      status: "missing",
      reason: "share_denominator_unavailable_in_one_or_more_selected_games",
    });
    expect(result.featureSet.features[keys.carryShareMean]).toMatchObject({
      status: "available",
      value: 0.2,
    });
  });

  it("handles an explicitly complete empty history without inventing opportunity", () => {
    const result = buildCCFRollingOpportunityFeaturesV2(
      input({
        history: [],
        windows: [1],
        historyCompleteEvidenceKnownAt: "2026-09-01T12:00:00Z",
      }),
    );
    const keys = ccfRollingOpportunityWindowKeysV2(1);

    expect(result.receipt.candidatePriorGameCount).toBe(0);
    expect(result.receipt.applicableGameCount).toBe(0);
    expect(result.featureSet.features[keys.sampleGames]).toMatchObject({
      status: "available",
      value: 0,
    });
    expect(result.featureSet.features[keys.carriesMean]).toMatchObject({
      status: "missing",
      reason: "no_applicable_prior_games",
    });
  });

  it("requires explicit unique windows rather than silently choosing or deduplicating them", () => {
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(input({ windows: [] })),
    ).toThrow(/explicit rolling window/);
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(input({ windows: [1, 1] })),
    ).toThrow(/must not contain duplicates/);
    expect(() =>
      buildCCFRollingOpportunityFeaturesV2(input({ windows: [9] })),
    ).toThrow(/within \[1, 8\]/);
  });
});
