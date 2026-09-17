import {
  buildWrRouteValueProfile,
  normalizeRouteFamily,
  routeArchetype,
  type WrRouteObservation,
} from "../wrRouteValue";

function route(
  overrides: Partial<WrRouteObservation> = {},
): WrRouteObservation {
  return {
    playerId: "player-a",
    season: 2026,
    week: 1,
    routeFamily: "slant",
    targeted: false,
    caught: false,
    receivingYards: 0,
    yac: 0,
    touchdown: false,
    firstDown: false,
    redZone: false,
    endZoneTarget: false,
    airYards: null,
    ...overrides,
  };
}

function repeat(count: number, factory: (index: number) => WrRouteObservation): WrRouteObservation[] {
  return Array.from({ length: count }, (_, index) => factory(index));
}

describe("WR Route Value v2", () => {
  it("normalizes provider route names into stable route families", () => {
    expect(normalizeRouteFamily("POST")).toBe("post");
    expect(normalizeRouteFamily("shallow cross")).toBe("crosser");
    expect(normalizeRouteFamily("9")).toBe("go_fade");
    expect(normalizeRouteFamily("bubble-screen")).toBe("screen");
    expect(normalizeRouteFamily("square in")).toBe("dig");
    expect(normalizeRouteFamily("provider-specific mystery route")).toBe("other");

    expect(routeArchetype("post")).toBe("leverage");
    expect(routeArchetype("slant")).toBe("all_around");
    expect(routeArchetype("go")).toBe("volatile_ceiling");
  });

  it("strictly excludes the target week and future weeks from pregame features", () => {
    const player = [
      route({ week: 1, targeted: true, caught: true, receivingYards: 10 }),
      route({ week: 2, targeted: true, caught: true, receivingYards: 80, touchdown: true }),
      route({ week: 3, targeted: true, caught: true, receivingYards: 80, touchdown: true }),
    ];
    const league = repeat(20, (index) =>
      route({
        playerId: `league-${index}`,
        week: 1,
        targeted: index % 4 === 0,
        caught: index % 4 === 0,
        receivingYards: index % 4 === 0 ? 8 : 0,
      }),
    );

    const profile = buildWrRouteValueProfile(
      "player-a",
      player,
      league,
      { season: 2026, week: 2, timeframe: "pregame" },
      { priorRoutes: 4, priorTargets: 2 },
    );

    expect(profile.available).toBe(true);
    expect(profile.eligibleRoutes).toBe(1);
    expect(profile.excludedSameOrFutureRoutes).toBe(2);
    expect(profile.families[0]?.routes).toBe(1);
    expect(profile.doctrine.sameWeekPregameLeakageAllowed).toBe(false);
  });

  it("returns an explicit unavailable state instead of turning missing history into zeros", () => {
    const profile = buildWrRouteValueProfile(
      "player-a",
      [route({ week: 5 })],
      [route({ playerId: "league-a", week: 1 })],
      { season: 2026, week: 5, timeframe: "pregame" },
    );

    expect(profile.available).toBe(false);
    expect(profile.reason).toBe("no_eligible_player_route_history");
    expect(profile.overall.expectedPprPerRoute).toBeNull();
    expect(profile.overall.redZonePprPerRoute).toBeNull();
  });

  it("learns numeric route value from outcomes rather than hard-coding the route label", () => {
    const player = [
      ...repeat(20, (index) =>
        route({
          week: 1 + (index % 3),
          routeFamily: "post",
          targeted: index % 4 === 0,
          caught: index % 4 === 0,
          receivingYards: index % 4 === 0 ? 12 : 0,
        }),
      ),
      ...repeat(20, (index) =>
        route({
          week: 1 + (index % 3),
          routeFamily: "screen",
          targeted: index % 4 === 0,
          caught: index % 4 === 0,
          receivingYards: index % 4 === 0 ? 12 : 0,
        }),
      ),
    ];
    const league = [
      ...repeat(80, (index) =>
        route({
          playerId: `post-${index}`,
          week: 1 + (index % 3),
          routeFamily: "post",
          targeted: index % 4 === 0,
          caught: index % 4 === 0,
          receivingYards: index % 4 === 0 ? 12 : 0,
        }),
      ),
      ...repeat(80, (index) =>
        route({
          playerId: `screen-${index}`,
          week: 1 + (index % 3),
          routeFamily: "screen",
          targeted: index % 4 === 0,
          caught: index % 4 === 0,
          receivingYards: index % 4 === 0 ? 12 : 0,
        }),
      ),
    ];

    const profile = buildWrRouteValueProfile(
      "player-a",
      player,
      league,
      { season: 2026, week: 4, timeframe: "pregame" },
      { priorRoutes: 12 },
    );

    const post = profile.families.find((family) => family.family === "post");
    const screen = profile.families.find((family) => family.family === "screen");
    expect(post).toBeDefined();
    expect(screen).toBeDefined();
    expect(post?.expectedPprPerRoute).toBeCloseTo(screen?.expectedPprPerRoute ?? -1, 10);
    expect(post?.archetype).toBe("leverage");
    expect(screen?.archetype).toBe("floor_manufactured");
  });

  it("produces player-vs-league advantage and shrinks sparse samples toward the family baseline", () => {
    const league = repeat(100, (index) =>
      route({
        playerId: `league-${index}`,
        week: 1 + (index % 4),
        routeFamily: "crosser",
        targeted: index % 5 === 0,
        caught: index % 5 === 0,
        receivingYards: index % 5 === 0 ? 10 : 0,
      }),
    );

    const strongPlayer = repeat(24, (index) =>
      route({
        week: 1 + (index % 4),
        routeFamily: "crosser",
        targeted: index % 3 === 0,
        caught: index % 3 === 0,
        receivingYards: index % 3 === 0 ? 18 : 0,
        firstDown: index % 3 === 0,
      }),
    );

    const profile = buildWrRouteValueProfile(
      "player-a",
      strongPlayer,
      league,
      { season: 2026, week: 5, timeframe: "pregame" },
      { priorRoutes: 24, priorTargets: 12 },
    );
    const crosser = profile.families[0];

    expect(crosser?.family).toBe("crosser");
    expect(crosser?.advantageVsLeague).toBeGreaterThan(0);
    expect(crosser?.expectedPprPerRoute).toBeGreaterThan(crosser?.leagueExpectedPprPerRoute ?? Infinity);
    expect(crosser?.confidence).toBeCloseTo(0.5, 10);
  });

  it("keeps red-zone absence distinct from a zero-value red-zone role", () => {
    const player = repeat(12, (index) =>
      route({
        week: 1 + (index % 3),
        routeFamily: "corner",
        targeted: index % 4 === 0,
        caught: index % 4 === 0,
        receivingYards: index % 4 === 0 ? 15 : 0,
        redZone: false,
      }),
    );
    const league = repeat(40, (index) =>
      route({
        playerId: `league-${index}`,
        week: 1 + (index % 3),
        routeFamily: "corner",
        targeted: index % 4 === 0,
        caught: index % 4 === 0,
        receivingYards: index % 4 === 0 ? 10 : 0,
        redZone: index % 10 === 0,
      }),
    );

    const profile = buildWrRouteValueProfile(
      "player-a",
      player,
      league,
      { season: 2026, week: 4, timeframe: "pregame" },
    );

    expect(profile.families[0]?.redZonePprPerRoute).toBeNull();
    expect(profile.overall.redZonePprPerRoute).toBeNull();
  });

  it("uses route-run denominators so target earning is measurable independently of target efficiency", () => {
    const player = repeat(30, (index) =>
      route({
        week: 1 + (index % 3),
        routeFamily: "slant",
        targeted: index < 12,
        caught: index < 9,
        receivingYards: index < 9 ? 8 : 0,
      }),
    );
    const league = repeat(120, (index) =>
      route({
        playerId: `league-${index}`,
        week: 1 + (index % 3),
        routeFamily: "slant",
        targeted: index % 4 === 0,
        caught: index % 5 === 0,
        receivingYards: index % 5 === 0 ? 7 : 0,
      }),
    );

    const profile = buildWrRouteValueProfile(
      "player-a",
      player,
      league,
      { season: 2026, week: 4, timeframe: "pregame" },
      { priorRoutes: 1, priorTargets: 1 },
    );
    const slant = profile.families[0];

    expect(slant?.routes).toBe(30);
    expect(slant?.targets).toBe(12);
    expect(slant?.targetRate).toBeGreaterThan(0.38);
    expect(slant?.targetRate).toBeLessThan(0.41);
    expect(slant?.catchRateOnTargets).toBeGreaterThan(0.7);
  });
});
