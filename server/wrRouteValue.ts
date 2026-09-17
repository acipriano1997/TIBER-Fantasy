export const WR_ROUTE_VALUE_VERSION = "2.0.0" as const;

export type RouteFamily =
  | "post"
  | "corner"
  | "crosser"
  | "slant"
  | "dig"
  | "out"
  | "go_fade"
  | "hitch_curl"
  | "screen"
  | "flat"
  | "other";

export type RouteArchetype =
  | "leverage"
  | "all_around"
  | "intermediate"
  | "volatile_ceiling"
  | "floor_manufactured"
  | "unknown";

export interface RouteScoringSettings {
  reception: number;
  receivingYard: number;
  receivingTouchdown: number;
}

export const PPR_ROUTE_SCORING: RouteScoringSettings = {
  reception: 1,
  receivingYard: 0.1,
  receivingTouchdown: 6,
};

/**
 * One record represents one receiver route run, not one target.
 * This is deliberate: target-only feeds cannot estimate target probability per route.
 */
export interface WrRouteObservation {
  playerId: string;
  season: number;
  week: number;
  routeFamily: RouteFamily | string;
  targeted: boolean;
  caught?: boolean | null;
  receivingYards?: number | null;
  yac?: number | null;
  touchdown?: boolean | null;
  firstDown?: boolean | null;
  redZone?: boolean | null;
  endZoneTarget?: boolean | null;
  airYards?: number | null;
}

export interface WrRouteValueAsOf {
  season: number;
  week: number;
  /** v2 is intentionally pregame-only. Same-week postgame observations are never eligible. */
  timeframe: "pregame";
}

export interface WrRouteValueOptions {
  scoring?: RouteScoringSettings;
  /** Prior route count used for empirical-Bayes shrinkage toward the league route-family mean. */
  priorRoutes?: number;
  /** Prior target count used for target-conditional rate shrinkage. */
  priorTargets?: number;
}

export interface WrRouteFamilyValue {
  family: RouteFamily;
  archetype: RouteArchetype;
  routes: number;
  routeShare: number;
  targets: number;
  targetRate: number;
  catchRateOnTargets: number | null;
  receivingYardsPerRoute: number;
  yacPerReception: number | null;
  airYardsPerTarget: number | null;
  touchdownRatePerRoute: number;
  firstDownRatePerRoute: number;
  explosiveRatePerRoute: number;
  endZoneTargetRatePerRoute: number;
  expectedPprPerRoute: number;
  /** 25th percentile of weekly family PPR/route, shrunk toward the league family distribution. */
  floorPprPerRoute: number;
  /** 90th percentile of weekly family PPR/route, shrunk toward the league family distribution. */
  ceilingPprPerRoute: number;
  /** Null means the player has no eligible historical red-zone routes; absence is not treated as zero. */
  redZonePprPerRoute: number | null;
  leagueExpectedPprPerRoute: number;
  advantageVsLeague: number;
  /** Data weight after shrinkage, 0-1. This is sample confidence, not forecast certainty. */
  confidence: number;
}

export interface WrRouteValueProfile {
  version: typeof WR_ROUTE_VALUE_VERSION;
  playerId: string;
  asOf: WrRouteValueAsOf;
  available: boolean;
  reason: string | null;
  eligibleRoutes: number;
  excludedSameOrFutureRoutes: number;
  families: WrRouteFamilyValue[];
  overall: {
    expectedPprPerRoute: number | null;
    floorPprPerRoute: number | null;
    ceilingPprPerRoute: number | null;
    redZonePprPerRoute: number | null;
    advantageVsLeague: number | null;
    confidence: number;
  };
  doctrine: {
    unit: "per_route_run";
    targetOnlyFeedAllowed: false;
    sameWeekPregameLeakageAllowed: false;
    sparseSamplesShrinkToLeagueFamilyMean: true;
    routeFamilyValueIsPlayerSpecific: true;
  };
}

const ROUTE_ARCHETYPES: Record<RouteFamily, RouteArchetype> = {
  post: "leverage",
  corner: "leverage",
  crosser: "all_around",
  slant: "all_around",
  dig: "intermediate",
  out: "intermediate",
  go_fade: "volatile_ceiling",
  hitch_curl: "floor_manufactured",
  screen: "floor_manufactured",
  flat: "floor_manufactured",
  other: "unknown",
};

const ROUTE_ALIASES: Record<string, RouteFamily> = {
  post: "post",
  corner: "corner",
  cross: "crosser",
  crosser: "crosser",
  crossing: "crosser",
  over: "crosser",
  over_route: "crosser",
  drag: "crosser",
  shallow_cross: "crosser",
  slant: "slant",
  dig: "dig",
  in: "dig",
  in_route: "dig",
  square_in: "dig",
  out: "out",
  out_route: "out",
  square_out: "out",
  go: "go_fade",
  fade: "go_fade",
  go_fade: "go_fade",
  nine: "go_fade",
  streak: "go_fade",
  vertical: "go_fade",
  hitch: "hitch_curl",
  curl: "hitch_curl",
  comeback: "hitch_curl",
  hitch_curl: "hitch_curl",
  screen: "screen",
  bubble: "screen",
  bubble_screen: "screen",
  tunnel_screen: "screen",
  flat: "flat",
  swing: "flat",
  other: "other",
  unknown: "other",
};

interface Aggregate {
  routes: number;
  targets: number;
  catches: number;
  receivingYards: number;
  yac: number;
  yacReceptions: number;
  airYards: number;
  airYardTargets: number;
  touchdowns: number;
  firstDowns: number;
  explosives: number;
  endZoneTargets: number;
  pprPoints: number;
  redZoneRoutes: number;
  redZonePprPoints: number;
  weeklyPprPerRoute: number[];
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function normalizeRouteFamily(value: RouteFamily | string): RouteFamily {
  return ROUTE_ALIASES[normalizeKey(value)] ?? "other";
}

export function routeArchetype(family: RouteFamily | string): RouteArchetype {
  return ROUTE_ARCHETYPES[normalizeRouteFamily(family)];
}

export function isRouteObservationEligible(
  observation: Pick<WrRouteObservation, "season" | "week">,
  asOf: WrRouteValueAsOf,
): boolean {
  return (
    observation.season < asOf.season ||
    (observation.season === asOf.season && observation.week < asOf.week)
  );
}

function scoreObservation(
  row: WrRouteObservation,
  scoring: RouteScoringSettings,
): number {
  const caught = row.targeted && row.caught === true;
  const yards = caught ? finiteOrZero(row.receivingYards) : 0;
  const touchdown = caught && row.touchdown === true;
  return (
    (caught ? scoring.reception : 0) +
    yards * scoring.receivingYard +
    (touchdown ? scoring.receivingTouchdown : 0)
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const fraction = index - lower;
  return (sorted[lower] ?? 0) * (1 - fraction) + (sorted[upper] ?? 0) * fraction;
}

function blend(playerValue: number, leagueValue: number, weight: number): number {
  return playerValue * weight + leagueValue * (1 - weight);
}

function shrinkMean(
  numerator: number,
  denominator: number,
  leagueRate: number,
  priorDenominator: number,
): number {
  if (denominator <= 0) return leagueRate;
  return (
    numerator + leagueRate * priorDenominator
  ) / (denominator + priorDenominator);
}

function aggregate(rows: WrRouteObservation[], scoring: RouteScoringSettings): Aggregate {
  const weekly = new Map<string, { routes: number; points: number }>();
  const out: Aggregate = {
    routes: 0,
    targets: 0,
    catches: 0,
    receivingYards: 0,
    yac: 0,
    yacReceptions: 0,
    airYards: 0,
    airYardTargets: 0,
    touchdowns: 0,
    firstDowns: 0,
    explosives: 0,
    endZoneTargets: 0,
    pprPoints: 0,
    redZoneRoutes: 0,
    redZonePprPoints: 0,
    weeklyPprPerRoute: [],
  };

  for (const row of rows) {
    const points = scoreObservation(row, scoring);
    const caught = row.targeted && row.caught === true;
    const yards = caught ? finiteOrZero(row.receivingYards) : 0;

    out.routes += 1;
    out.pprPoints += points;
    if (row.targeted) out.targets += 1;
    if (caught) out.catches += 1;
    out.receivingYards += yards;
    if (caught && typeof row.yac === "number" && Number.isFinite(row.yac)) {
      out.yac += row.yac;
      out.yacReceptions += 1;
    }
    if (row.targeted && typeof row.airYards === "number" && Number.isFinite(row.airYards)) {
      out.airYards += row.airYards;
      out.airYardTargets += 1;
    }
    if (caught && row.touchdown === true) out.touchdowns += 1;
    if (caught && row.firstDown === true) out.firstDowns += 1;
    if (caught && yards >= 20) out.explosives += 1;
    if (row.targeted && row.endZoneTarget === true) out.endZoneTargets += 1;
    if (row.redZone === true) {
      out.redZoneRoutes += 1;
      out.redZonePprPoints += points;
    }

    const weekKey = `${row.season}:${row.week}`;
    const week = weekly.get(weekKey) ?? { routes: 0, points: 0 };
    week.routes += 1;
    week.points += points;
    weekly.set(weekKey, week);
  }

  out.weeklyPprPerRoute = [...weekly.values()]
    .filter((week) => week.routes > 0)
    .map((week) => week.points / week.routes);
  return out;
}

function rowsForFamily(rows: WrRouteObservation[], family: RouteFamily): WrRouteObservation[] {
  return rows.filter((row) => normalizeRouteFamily(row.routeFamily) === family);
}

function weightedAverage(
  values: Array<{ value: number | null; weight: number }>,
): number | null {
  const eligible = values.filter(
    (entry): entry is { value: number; weight: number } =>
      entry.value !== null && Number.isFinite(entry.value) && entry.weight > 0,
  );
  const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  return eligible.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

/**
 * Builds player-specific route-family value using only observations available before
 * the requested pregame week. Route families are descriptors, not hard-coded fantasy
 * multipliers: the numeric hierarchy is learned from the supplied historical sample.
 */
export function buildWrRouteValueProfile(
  playerId: string,
  playerObservations: WrRouteObservation[],
  leagueObservations: WrRouteObservation[],
  asOf: WrRouteValueAsOf,
  options: WrRouteValueOptions = {},
): WrRouteValueProfile {
  const scoring = options.scoring ?? PPR_ROUTE_SCORING;
  const priorRoutes = Math.max(1, options.priorRoutes ?? 48);
  const priorTargets = Math.max(1, options.priorTargets ?? 24);

  const playerRows = playerObservations.filter(
    (row) => row.playerId === playerId && isRouteObservationEligible(row, asOf),
  );
  const excludedSameOrFutureRoutes = playerObservations.filter(
    (row) => row.playerId === playerId && !isRouteObservationEligible(row, asOf),
  ).length;
  const leagueRows = leagueObservations.filter((row) => isRouteObservationEligible(row, asOf));

  const base: Omit<WrRouteValueProfile, "available" | "reason" | "families" | "overall"> = {
    version: WR_ROUTE_VALUE_VERSION,
    playerId,
    asOf,
    eligibleRoutes: playerRows.length,
    excludedSameOrFutureRoutes,
    doctrine: {
      unit: "per_route_run",
      targetOnlyFeedAllowed: false,
      sameWeekPregameLeakageAllowed: false,
      sparseSamplesShrinkToLeagueFamilyMean: true,
      routeFamilyValueIsPlayerSpecific: true,
    },
  };

  if (playerRows.length === 0) {
    return {
      ...base,
      available: false,
      reason: "no_eligible_player_route_history",
      families: [],
      overall: {
        expectedPprPerRoute: null,
        floorPprPerRoute: null,
        ceilingPprPerRoute: null,
        redZonePprPerRoute: null,
        advantageVsLeague: null,
        confidence: 0,
      },
    };
  }

  if (leagueRows.length === 0) {
    return {
      ...base,
      available: false,
      reason: "no_eligible_league_route_baseline",
      families: [],
      overall: {
        expectedPprPerRoute: null,
        floorPprPerRoute: null,
        ceilingPprPerRoute: null,
        redZonePprPerRoute: null,
        advantageVsLeague: null,
        confidence: 0,
      },
    };
  }

  const globalLeague = aggregate(leagueRows, scoring);
  const globalLeaguePpr = globalLeague.routes > 0 ? globalLeague.pprPoints / globalLeague.routes : 0;
  const globalLeagueFloor = percentile(globalLeague.weeklyPprPerRoute, 0.25);
  const globalLeagueCeiling = percentile(globalLeague.weeklyPprPerRoute, 0.9);
  const globalLeagueRz =
    globalLeague.redZoneRoutes > 0
      ? globalLeague.redZonePprPoints / globalLeague.redZoneRoutes
      : globalLeaguePpr;

  const playerFamilies = [...new Set(playerRows.map((row) => normalizeRouteFamily(row.routeFamily)))];
  const families: WrRouteFamilyValue[] = playerFamilies.map((family) => {
    const player = aggregate(rowsForFamily(playerRows, family), scoring);
    const leagueFamilyRows = rowsForFamily(leagueRows, family);
    const league = aggregate(leagueFamilyRows, scoring);

    const leaguePpr = league.routes > 0 ? league.pprPoints / league.routes : globalLeaguePpr;
    const leagueTargetRate = league.routes > 0 ? league.targets / league.routes : globalLeague.targets / globalLeague.routes;
    const leagueCatchRate = league.targets > 0 ? league.catches / league.targets : 0;
    const leagueYardsPerRoute = league.routes > 0 ? league.receivingYards / league.routes : globalLeague.receivingYards / globalLeague.routes;
    const leagueTdRate = league.routes > 0 ? league.touchdowns / league.routes : globalLeague.touchdowns / globalLeague.routes;
    const leagueFirstDownRate = league.routes > 0 ? league.firstDowns / league.routes : globalLeague.firstDowns / globalLeague.routes;
    const leagueExplosiveRate = league.routes > 0 ? league.explosives / league.routes : globalLeague.explosives / globalLeague.routes;
    const leagueEndZoneRate = league.routes > 0 ? league.endZoneTargets / league.routes : globalLeague.endZoneTargets / globalLeague.routes;

    const familyWeight = player.routes / (player.routes + priorRoutes);
    const leagueFloor = league.weeklyPprPerRoute.length > 0
      ? percentile(league.weeklyPprPerRoute, 0.25)
      : globalLeagueFloor;
    const leagueCeiling = league.weeklyPprPerRoute.length > 0
      ? percentile(league.weeklyPprPerRoute, 0.9)
      : globalLeagueCeiling;
    const playerFloor = percentile(player.weeklyPprPerRoute, 0.25);
    const playerCeiling = percentile(player.weeklyPprPerRoute, 0.9);

    const expectedPprPerRoute = shrinkMean(player.pprPoints, player.routes, leaguePpr, priorRoutes);
    const targetRate = clamp01(shrinkMean(player.targets, player.routes, leagueTargetRate, priorRoutes));
    const catchRateOnTargets = player.targets > 0
      ? clamp01(shrinkMean(player.catches, player.targets, leagueCatchRate, priorTargets))
      : null;
    const receivingYardsPerRoute = Math.max(
      0,
      shrinkMean(player.receivingYards, player.routes, leagueYardsPerRoute, priorRoutes),
    );
    const touchdownRatePerRoute = clamp01(
      shrinkMean(player.touchdowns, player.routes, leagueTdRate, priorRoutes),
    );
    const firstDownRatePerRoute = clamp01(
      shrinkMean(player.firstDowns, player.routes, leagueFirstDownRate, priorRoutes),
    );
    const explosiveRatePerRoute = clamp01(
      shrinkMean(player.explosives, player.routes, leagueExplosiveRate, priorRoutes),
    );
    const endZoneTargetRatePerRoute = clamp01(
      shrinkMean(player.endZoneTargets, player.routes, leagueEndZoneRate, priorRoutes),
    );

    const leagueRz = league.redZoneRoutes > 0
      ? league.redZonePprPoints / league.redZoneRoutes
      : globalLeagueRz;
    const redZonePprPerRoute = player.redZoneRoutes > 0
      ? shrinkMean(player.redZonePprPoints, player.redZoneRoutes, leagueRz, Math.max(1, priorRoutes / 4))
      : null;

    return {
      family,
      archetype: ROUTE_ARCHETYPES[family],
      routes: player.routes,
      routeShare: player.routes / playerRows.length,
      targets: player.targets,
      targetRate,
      catchRateOnTargets,
      receivingYardsPerRoute,
      yacPerReception: player.yacReceptions > 0 ? player.yac / player.yacReceptions : null,
      airYardsPerTarget: player.airYardTargets > 0 ? player.airYards / player.airYardTargets : null,
      touchdownRatePerRoute,
      firstDownRatePerRoute,
      explosiveRatePerRoute,
      endZoneTargetRatePerRoute,
      expectedPprPerRoute,
      floorPprPerRoute: blend(playerFloor, leagueFloor, familyWeight),
      ceilingPprPerRoute: blend(playerCeiling, leagueCeiling, familyWeight),
      redZonePprPerRoute,
      leagueExpectedPprPerRoute: leaguePpr,
      advantageVsLeague: expectedPprPerRoute - leaguePpr,
      confidence: clamp01(familyWeight),
    };
  });

  families.sort((a, b) => b.routeShare - a.routeShare || b.expectedPprPerRoute - a.expectedPprPerRoute);

  return {
    ...base,
    available: true,
    reason: null,
    families,
    overall: {
      expectedPprPerRoute: weightedAverage(families.map((f) => ({ value: f.expectedPprPerRoute, weight: f.routes }))),
      floorPprPerRoute: weightedAverage(families.map((f) => ({ value: f.floorPprPerRoute, weight: f.routes }))),
      ceilingPprPerRoute: weightedAverage(families.map((f) => ({ value: f.ceilingPprPerRoute, weight: f.routes }))),
      redZonePprPerRoute: weightedAverage(families.map((f) => ({ value: f.redZonePprPerRoute, weight: f.routes }))),
      advantageVsLeague: weightedAverage(families.map((f) => ({ value: f.advantageVsLeague, weight: f.routes }))),
      confidence: weightedAverage(families.map((f) => ({ value: f.confidence, weight: f.routes }))) ?? 0,
    },
  };
}
