import {
  CCFMarketPerceptionContractError,
  buildCCFMarketNeighborhood,
  buildCCFMarketPerceptionSnapshot,
  type CCFMarketPerceptionPolicy,
  type CCFMarketSignalEvidence,
} from "../marketPerception";

const AS_OF = "2026-09-15T12:00:00Z";
const MARKET_POOL = "dynasty-sf-ppr-player-market-v1";

function policy(): CCFMarketPerceptionPolicy {
  return {
    contractVersion: "ccf-market-perception-policy-v1",
    policyId: "market-policy-test-v1",
    fastWindowHours: 48,
    mediumWindowHours: 168,
    minimumIndependentSources: 2,
    sourceFamilyWeights: {
      crowd_market_value: 1,
      startup_adp: 1,
      trade_activity: 1,
      expert_ranking: 1,
      news: 1,
      social: 1,
      video_audio: 1,
      league_local: 1,
    },
    collapsePolicy: "latest_per_kind_then_source_average",
  };
}

function signal(
  overrides: Partial<CCFMarketSignalEvidence> = {},
): CCFMarketSignalEvidence {
  return {
    contractVersion: "ccf-market-signal-evidence-v1",
    signalId: "signal-1",
    playerId: "player-1",
    formatId: "dynasty-sf-ppr",
    sourceId: "source-1",
    sourceFamily: "social",
    signalKind: "sentiment",
    observedAt: "2026-09-15T08:00:00Z",
    knownAt: "2026-09-15T08:05:00Z",
    sourceRef: "source://signal-1",
    direction: 1,
    magnitude: 0.8,
    marketLevelPercentile: 0.6,
    marketLevelComparisonPoolId: MARKET_POOL,
    ...overrides,
  };
}

function twoSourceLevelSignals(
  playerId: string,
  level: number,
  comparisonPoolId = MARKET_POOL,
): CCFMarketSignalEvidence[] {
  return [
    signal({
      signalId: `${playerId}-crowd`,
      playerId,
      sourceId: `${playerId}-crowd-source`,
      sourceFamily: "crowd_market_value",
      signalKind: "market_level",
      sourceRef: `source://${playerId}/crowd`,
      direction: 0,
      magnitude: 0,
      marketLevelPercentile: level,
      marketLevelComparisonPoolId: comparisonPoolId,
    }),
    signal({
      signalId: `${playerId}-adp`,
      playerId,
      sourceId: `${playerId}-adp-source`,
      sourceFamily: "startup_adp",
      signalKind: "market_level",
      sourceRef: `source://${playerId}/adp`,
      direction: 0,
      magnitude: 0,
      marketLevelPercentile: level,
      marketLevelComparisonPoolId: comparisonPoolId,
    }),
  ];
}

describe("CCF market perception intelligence", () => {
  it("rejects market evidence that was not knowable by the decision as-of", () => {
    expect(() =>
      buildCCFMarketPerceptionSnapshot(
        [
          signal({
            knownAt: "2026-09-15T12:01:00Z",
            observedAt: "2026-09-15T12:00:30Z",
          }),
        ],
        AS_OF,
        policy(),
      ),
    ).toThrow(CCFMarketPerceptionContractError);
  });

  it("requires an explicit comparison pool for normalized market levels", () => {
    expect(() =>
      buildCCFMarketPerceptionSnapshot(
        [signal({ marketLevelComparisonPoolId: undefined })],
        AS_OF,
        policy(),
      ),
    ).toThrow(CCFMarketPerceptionContractError);
  });

  it("collapses repeated same-source signals before weighting market pressure", () => {
    const snapshot = buildCCFMarketPerceptionSnapshot(
      [
        signal({
          signalId: "social-old",
          sourceId: "social-origin",
          knownAt: "2026-09-15T02:00:00Z",
          observedAt: "2026-09-15T01:55:00Z",
          sourceRef: "source://social/old",
          direction: -1,
          magnitude: 1,
          marketLevelPercentile: 0.4,
        }),
        signal({
          signalId: "social-new",
          sourceId: "social-origin",
          knownAt: "2026-09-15T10:00:00Z",
          observedAt: "2026-09-15T09:55:00Z",
          sourceRef: "source://social/new",
          direction: 1,
          magnitude: 0.9,
          marketLevelPercentile: 0.7,
        }),
        signal({
          signalId: "adp",
          sourceId: "startup-adp-origin",
          sourceFamily: "startup_adp",
          signalKind: "adp_movement",
          knownAt: "2026-09-15T09:00:00Z",
          observedAt: "2026-09-15T08:55:00Z",
          sourceRef: "source://adp/current",
          direction: 1,
          magnitude: 0.5,
          marketLevelPercentile: 0.65,
        }),
      ],
      AS_OF,
      policy(),
    );

    expect(snapshot.fast.status).toBe("available");
    expect(snapshot.fast.rawSignalCount).toBe(3);
    expect(snapshot.fast.independentSourceCount).toBe(2);
    expect(snapshot.fast.independenceRatio).toBeCloseTo(2 / 3);
    expect(snapshot.fast.directionalPressure).toBeCloseTo(0.7);
    expect(snapshot.marketLevelPercentile).toBeCloseTo(0.675);
    expect(snapshot.marketLevelComparisonPoolId).toBe(MARKET_POOL);
  });

  it("rejects market-level aggregation across incompatible comparison pools", () => {
    expect(() =>
      buildCCFMarketPerceptionSnapshot(
        [
          signal({
            signalId: "crowd-level",
            sourceId: "crowd-origin",
            sourceFamily: "crowd_market_value",
            signalKind: "market_level",
            marketLevelComparisonPoolId: "pool-a",
          }),
          signal({
            signalId: "adp-level",
            sourceId: "adp-origin",
            sourceFamily: "startup_adp",
            signalKind: "market_level",
            marketLevelComparisonPoolId: "pool-b",
          }),
        ],
        AS_OF,
        policy(),
      ),
    ).toThrow(CCFMarketPerceptionContractError);
  });

  it("measures recent perception acceleration without turning it into recommendation authority", () => {
    const snapshot = buildCCFMarketPerceptionSnapshot(
      [
        signal({
          signalId: "older-negative",
          sourceId: "older-news-origin",
          sourceFamily: "news",
          signalKind: "role_catalyst",
          knownAt: "2026-09-10T12:00:00Z",
          observedAt: "2026-09-10T11:55:00Z",
          sourceRef: "source://news/older",
          direction: -1,
          magnitude: 1,
          marketLevelPercentile: 0.4,
        }),
        signal({
          signalId: "current-crowd",
          sourceId: "current-crowd-origin",
          sourceFamily: "crowd_market_value",
          signalKind: "rank_movement",
          knownAt: "2026-09-15T08:00:00Z",
          observedAt: "2026-09-15T07:55:00Z",
          sourceRef: "source://crowd/current",
          direction: 1,
          magnitude: 1,
          marketLevelPercentile: 0.68,
        }),
        signal({
          signalId: "current-adp",
          sourceId: "current-adp-origin",
          sourceFamily: "startup_adp",
          signalKind: "adp_movement",
          knownAt: "2026-09-15T09:00:00Z",
          observedAt: "2026-09-15T08:55:00Z",
          sourceRef: "source://adp/current",
          direction: 1,
          magnitude: 0.8,
          marketLevelPercentile: 0.7,
        }),
      ],
      AS_OF,
      policy(),
    );

    expect(snapshot.fast.directionalPressure).toBeCloseTo(0.9);
    expect(snapshot.medium.directionalPressure).toBeCloseTo(0.8 / 3);
    expect(snapshot.momentumDelta).toBeGreaterThan(0);
    expect(snapshot.diagnosticOnly).toBe(true);
    expect(snapshot.recommendationAuthority).toBe("none");
  });

  it("requires genuinely independent source coverage before declaring a window available", () => {
    const snapshot = buildCCFMarketPerceptionSnapshot(
      [
        signal({ signalId: "echo-1", sourceId: "same-origin" }),
        signal({
          signalId: "echo-2",
          sourceId: "same-origin",
          signalKind: "rank_movement",
          sourceRef: "source://echo-2",
        }),
      ],
      AS_OF,
      policy(),
    );

    expect(snapshot.fast.rawSignalCount).toBe(2);
    expect(snapshot.fast.independentSourceCount).toBe(1);
    expect(snapshot.fast.status).toBe("insufficient");
    expect(snapshot.status).toBe("insufficient");
    expect(snapshot.marketLevelPercentile).toBeNull();
    expect(snapshot.marketLevelComparisonPoolId).toBeNull();
    expect(snapshot.momentumDelta).toBeNull();
  });

  it("does not let a zero-weight source family satisfy corroboration coverage", () => {
    const zeroSocialPolicy = policy();
    zeroSocialPolicy.sourceFamilyWeights.social = 0;

    const snapshot = buildCCFMarketPerceptionSnapshot(
      [
        signal({ signalId: "ignored-social", sourceId: "social-origin" }),
        signal({
          signalId: "admitted-adp",
          sourceId: "adp-origin",
          sourceFamily: "startup_adp",
          signalKind: "adp_movement",
          sourceRef: "source://adp",
        }),
      ],
      AS_OF,
      zeroSocialPolicy,
    );

    expect(snapshot.fast.rawSignalCount).toBe(2);
    expect(snapshot.fast.independentSourceCount).toBe(1);
    expect(snapshot.fast.status).toBe("insufficient");
    expect(snapshot.fast.sourceFamilies).toEqual(["startup_adp"]);
    expect(snapshot.fast.sourceRefs).toEqual(["source://adp"]);
  });

  it("rejects a source identity that changes source families inside one snapshot", () => {
    expect(() =>
      buildCCFMarketPerceptionSnapshot(
        [
          signal({ signalId: "one", sourceId: "origin" }),
          signal({
            signalId: "two",
            sourceId: "origin",
            sourceFamily: "video_audio",
            signalKind: "rank_movement",
            sourceRef: "source://two",
          }),
        ],
        AS_OF,
        policy(),
      ),
    ).toThrow(CCFMarketPerceptionContractError);
  });

  it("builds a same-format, same-as-of, same-pool market neighborhood without emitting a buy or sell call", () => {
    const snapshots = [
      buildCCFMarketPerceptionSnapshot(
        twoSourceLevelSignals("player-a", 0.8),
        AS_OF,
        policy(),
      ),
      buildCCFMarketPerceptionSnapshot(
        twoSourceLevelSignals("player-b", 0.6),
        AS_OF,
        policy(),
      ),
      buildCCFMarketPerceptionSnapshot(
        twoSourceLevelSignals("player-c", 0.4),
        AS_OF,
        policy(),
      ),
    ];

    const neighborhood = buildCCFMarketNeighborhood("player-b", snapshots, 1);

    expect(neighborhood.marketLevelComparisonPoolId).toBe(MARKET_POOL);
    expect(neighborhood.above.map((entry) => entry.playerId)).toEqual(["player-a"]);
    expect(neighborhood.target.playerId).toBe("player-b");
    expect(neighborhood.below.map((entry) => entry.playerId)).toEqual(["player-c"]);
    expect(neighborhood.diagnosticOnly).toBe(true);
    expect(neighborhood.recommendationAuthority).toBe("none");
  });

  it("rejects mixed comparison pools in a market neighborhood", () => {
    const first = buildCCFMarketPerceptionSnapshot(
      twoSourceLevelSignals("player-a", 0.8, "pool-a"),
      AS_OF,
      policy(),
    );
    const second = buildCCFMarketPerceptionSnapshot(
      twoSourceLevelSignals("player-b", 0.6, "pool-b"),
      AS_OF,
      policy(),
    );

    expect(() => buildCCFMarketNeighborhood("player-a", [first, second], 1)).toThrow(
      CCFMarketPerceptionContractError,
    );
  });

  it("rejects mixed decision timestamps in a market neighborhood", () => {
    const first = buildCCFMarketPerceptionSnapshot(
      twoSourceLevelSignals("player-a", 0.8),
      AS_OF,
      policy(),
    );
    const second = {
      ...buildCCFMarketPerceptionSnapshot(
        twoSourceLevelSignals("player-b", 0.6),
        AS_OF,
        policy(),
      ),
      asOf: "2026-09-15T13:00:00Z",
    };

    expect(() => buildCCFMarketNeighborhood("player-a", [first, second], 1)).toThrow(
      CCFMarketPerceptionContractError,
    );
  });
});
